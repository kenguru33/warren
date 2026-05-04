import { test, expect, loginViaApi, pairFakeBridge, unpairBridge } from './fixtures'
import type { APIRequestContext } from '@playwright/test'
import { Buffer } from 'node:buffer'
import type { SnapshotFile } from '@/lib/shared/backup'

async function fetchSnapshot(request: APIRequestContext): Promise<{ text: string; json: SnapshotFile }> {
  const res = await request.get('/api/admin/backup/export')
  expect(res.ok()).toBeTruthy()
  const text = await res.text()
  return { text, json: JSON.parse(text) as SnapshotFile }
}

async function postSnapshot(
  request: APIRequestContext,
  url: string,
  text: string,
) {
  return request.post(url, {
    multipart: {
      file: {
        name: 'snapshot.json',
        mimeType: 'application/json',
        buffer: Buffer.from(text, 'utf-8'),
      },
    },
  })
}

test.describe('backup & restore (API)', () => {
  test('all three endpoints return 401 without a session', async ({ request }) => {
    const exportRes = await request.get('/api/admin/backup/export')
    expect(exportRes.status()).toBe(401)

    const previewRes = await postSnapshot(request, '/api/admin/backup/preview', '{}')
    expect(previewRes.status()).toBe(401)

    const restoreRes = await postSnapshot(request, '/api/admin/backup/restore', '{}')
    expect(restoreRes.status()).toBe(401)
  })

  test('GET /export returns a JSON download with the expected header', async ({ request }) => {
    await loginViaApi(request)
    const res = await request.get('/api/admin/backup/export')
    expect(res.ok()).toBeTruthy()
    expect(res.headers()['content-disposition']).toMatch(/attachment;\s*filename="warren-snapshot-/)
    expect(res.headers()['content-type']).toMatch(/application\/json/)

    const snapshot = JSON.parse(await res.text()) as SnapshotFile
    expect(snapshot.header.schema_version).toBe(1)
    expect(typeof snapshot.header.app_version).toBe('string')
    expect(typeof snapshot.header.exported_at).toBe('number')
    expect(snapshot.tables).toHaveProperty('rooms')
    expect(snapshot.tables).toHaveProperty('users')
    expect(snapshot.tables).toHaveProperty('meta')
  })

  test('POST /preview rejects a snapshot with a mismatched schema_version', async ({ request }) => {
    await loginViaApi(request)
    const { json } = await fetchSnapshot(request)
    json.header.schema_version = 999
    const res = await postSnapshot(request, '/api/admin/backup/preview', JSON.stringify(json))
    expect(res.ok()).toBeTruthy()
    const body = await res.json() as { compatible: boolean; errors: string[] }
    expect(body.compatible).toBe(false)
    expect(body.errors.join(' ')).toMatch(/v999/)
  })

  test('POST /restore refuses a mismatched schema_version with 422 and leaves DB intact', async ({ request }) => {
    await loginViaApi(request)

    // Probe DB shape before
    const roomsBefore = await (await request.get('/api/rooms')).json() as { id: number }[]

    const { json } = await fetchSnapshot(request)
    json.header.schema_version = 999

    const res = await postSnapshot(request, '/api/admin/backup/restore', JSON.stringify(json))
    expect(res.status()).toBe(422)

    const roomsAfter = await (await request.get('/api/rooms')).json() as { id: number }[]
    expect(roomsAfter.map(r => r.id).sort()).toEqual(roomsBefore.map(r => r.id).sort())
  })

  test('round-trip: delete a room then restore brings it back', async ({ request }) => {
    await loginViaApi(request)

    const create = await request.post('/api/rooms', { data: { name: 'Backup E2E Round-trip' } })
    expect(create.ok()).toBeTruthy()
    const { id: roomId } = await create.json() as { id: number }

    const { text: snapshotText } = await fetchSnapshot(request)

    // Mutate: delete the room.
    const del = await request.delete(`/api/rooms/${roomId}`)
    expect(del.ok()).toBeTruthy()
    const after = await (await request.get('/api/rooms')).json() as { id: number }[]
    expect(after.find(r => r.id === roomId)).toBeUndefined()

    // Restore the snapshot taken just before the delete.
    const restoreRes = await postSnapshot(request, '/api/admin/backup/restore', snapshotText)
    expect(restoreRes.ok()).toBeTruthy()
    const restoreBody = await restoreRes.json() as { ok: true; rowCounts: Record<string, number> }
    expect(restoreBody.ok).toBe(true)
    expect(restoreBody.rowCounts.rooms).toBeGreaterThan(0)

    const recovered = await (await request.get('/api/rooms')).json() as { id: number; name: string }[]
    const room = recovered.find(r => r.id === roomId)
    expect(room).toBeDefined()
    expect(room?.name).toBe('Backup E2E Round-trip')

    // Cleanup
    await request.delete(`/api/rooms/${roomId}`)
  })

  test('preserves the active user when the snapshot would override the password', async ({ request }) => {
    await loginViaApi(request)

    // Build a snapshot but inject a bogus users row for the active e2e user.
    // In the e2e env there is no real users row (env-var fallback), so
    // restoreSnapshot's preservedHash is null and the snapshot's e2e row is
    // skipped entirely. The env-var fallback continues to work post-restore.
    const { json } = await fetchSnapshot(request)
    json.tables.users = [
      {
        id: 1,
        username: 'e2e',
        password_hash: 'deadbeef:deadbeef',
        updated_at: new Date().toISOString(),
      },
    ]

    const restoreRes = await postSnapshot(
      request,
      '/api/admin/backup/restore',
      JSON.stringify(json),
    )
    expect(restoreRes.ok()).toBeTruthy()

    // The active session cookie still holds {name: 'e2e'}; calling /session
    // reflects that without re-logging in.
    const sessionRes = await request.get('/api/auth/session')
    const session = await sessionRes.json() as { user: { name: string } | null }
    expect(session.user?.name).toBe('e2e')

    // Re-login from scratch via env-var fallback should also still work.
    const loginRes = await request.post('/api/auth/login', {
      data: { username: 'e2e', password: 'e2e-test-password' },
    })
    expect(loginRes.ok()).toBeTruthy()
  })

  test('hue: pair, export, unpair, restore — bridge comes back connected', async ({ request }) => {
    await loginViaApi(request)
    await unpairBridge(request)

    expect(await pairFakeBridge(request)).toBe(true)

    const { text: snapshotText } = await fetchSnapshot(request)

    await unpairBridge(request)
    const disconnected = await (await request.get('/api/integrations/hue/status')).json() as { connected: boolean; bridge: unknown }
    expect(disconnected.bridge).toBeNull()

    const restoreRes = await postSnapshot(request, '/api/admin/backup/restore', snapshotText)
    expect(restoreRes.ok()).toBeTruthy()

    // hueRuntime.restart() runs the first sync cycle async. Poll status until
    // last_status flips to "connected" (or time out).
    const deadline = Date.now() + 15_000
    let lastStatus: string | null = null
    while (Date.now() < deadline) {
      const s = await (await request.get('/api/integrations/hue/status')).json() as
        { bridge: unknown; lastStatus: string | null }
      if (s.bridge && s.lastStatus === 'connected') {
        lastStatus = s.lastStatus
        break
      }
      await new Promise(r => setTimeout(r, 250))
    }
    expect(lastStatus).toBe('connected')

    // Cleanup
    await unpairBridge(request)
  })
})
