'use client'

import { FormEvent, useState } from 'react'

export default function LoginPage() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ username, password }),
      })
      if (!res.ok) {
        setError(res.status === 401 ? 'Invalid credentials' : 'Login failed')
        setBusy(false)
        return
      }
      // Hard reload so the new session cookie is picked up by both the proxy
      // and every SWR cache on the destination page. router.push() does a soft
      // navigation that can race with the cookie being committed by the
      // browser, leaving the user staring at a "logged in" form that the proxy
      // immediately bounces back to /login.
      window.location.assign('/')
    } catch {
      setError('Login failed')
      setBusy(false)
    }
  }

  return (
    <div className="grid min-h-svh place-items-center px-4 py-12 sm:px-6 lg:px-8">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center gap-3">
          <svg className="size-12 text-text" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
            <ellipse cx="8.5" cy="6" rx="2.5" ry="5" fill="currentColor" />
            <ellipse cx="15.5" cy="6" rx="2.5" ry="5" fill="currentColor" />
            <circle cx="12" cy="17" r="6" fill="currentColor" />
            <circle cx="10" cy="16" r="0.9" className="fill-surface-2" />
            <circle cx="14" cy="16" r="0.9" className="fill-surface-2" />
          </svg>
          <h1 className="text-xl/7 font-semibold tracking-tight text-text">Sign in to Warren</h1>
          <p className="text-sm/6 text-subtle">Your home, at a glance.</p>
        </div>

        <form
          className="mt-8 space-y-6 rounded-xl bg-surface p-6 shadow-sm ring-1 ring-default sm:p-8 dark:ring-white/10 dark:shadow-none"
          onSubmit={submit}
        >
          <div className="space-y-1.5">
            <label htmlFor="username" className="label">Username</label>
            <input
              id="username"
              value={username}
              onChange={e => setUsername(e.target.value)}
              type="text"
              autoComplete="username"
              autoFocus
              required
              className="input"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="password" className="label">Password</label>
            <input
              id="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              type="password"
              autoComplete="current-password"
              required
              className="input"
            />
          </div>

          {error && (
            <div className="rounded-md bg-red-50 px-3 py-2 text-sm/6 text-red-700 ring-1 ring-inset ring-red-600/10 dark:bg-red-500/10 dark:text-red-400 dark:ring-red-500/20">
              {error}
            </div>
          )}

          <button type="submit" disabled={busy} className="btn-primary w-full">
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  )
}
