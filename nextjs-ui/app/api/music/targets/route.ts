import type { NextRequest } from 'next/server'
import { getDb } from '@/lib/server/db'
import { httpErrorResponse, HttpError } from '@/lib/server/errors'
import { listTargetViews, toTargetView } from '@/lib/server/music'
import { getTarget } from '@/lib/server/targets'
import { probe } from '@/lib/server/sonos/control'
import { SONOS_PORT, sonosTargetId } from '@/lib/server/sonos/discovery'

export async function GET() {
  try {
    return Response.json(listTargetViews())
  } catch (err) {
    return httpErrorResponse(err)
  }
}

const IPV4 = /^(\d{1,3}\.){3}\d{1,3}$/

/**
 * Manually add a target by IP.
 *
 * Not a nicety: mDNS needs link-local access, so any deployment where the
 * server cannot see multicast traffic (a bridged Docker network, a routed VLAN)
 * has no other way to reach its speakers. Manual rows are never pruned by a
 * discovery sweep.
 */
export async function POST(req: NextRequest) {
  try {
    let body: { address?: string; friendlyName?: string; port?: number; protocol?: string } = {}
    try { body = (await req.json()) ?? {} } catch { /* validated below */ }

    const address = typeof body.address === 'string' ? body.address.trim() : ''
    if (!IPV4.test(address) || address.split('.').some(o => Number(o) > 255)) {
      throw new HttpError(400, 'enter a valid IPv4 address, e.g. 192.168.1.42')
    }

    // Sonos is probed rather than trusted: storing a target that no speaker
    // answers would leave the user with an output that silently never works.
    const wantsSonos = body.protocol === 'sonos'
    let sonosName: string | null = null
    if (wantsSonos) {
      const found = await probe(address)
      if (!found.ok) throw new HttpError(400, found.error)
      sonosName = found.value.name
    }

    const friendlyName = typeof body.friendlyName === 'string' && body.friendlyName.trim()
      ? body.friendlyName.trim().slice(0, 60)
      : sonosName ?? address
    const port = typeof body.port === 'number' && Number.isFinite(body.port)
      ? body.port
      : wantsSonos ? SONOS_PORT : 8009
    const protocol = wantsSonos ? 'sonos' : 'cast'
    // Namespaced so a manual Sonos and a manual Cast at the same address, and a
    // manual entry and a later discovered one, cannot collide.
    const targetId = wantsSonos ? sonosTargetId(`manual-${address}`) : `manual-${address}`

    if (getTarget(targetId)) throw new HttpError(409, 'that address is already added')

    getDb().prepare(`
      INSERT INTO music_targets
        (target_id, friendly_name, address, port, model, origin, protocol, last_seen)
      VALUES (?, ?, ?, ?, NULL, 'manual', ?, ?)
    `).run(targetId, friendlyName, address, port, protocol, Date.now())

    const created = getTarget(targetId)
    if (!created) throw new HttpError(500, 'target was not created')
    return Response.json(toTargetView(created), { status: 201 })
  } catch (err) {
    return httpErrorResponse(err)
  }
}
