import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { ApiError, apiRequest } from '#/lib/shared/api-client'

export const Route = createFileRoute('/login')({
  component: LoginPage,
})

function LoginPage() {
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    apiRequest<{ authenticated: boolean }>('/api/v1/auth/session')
      .then((result) => {
        if (!active) {
          return
        }
        if (result.authenticated) {
          navigate({ to: '/projects' })
        }
      })
      .catch(() => {
        // keep login view for unauthenticated users
      })

    return () => {
      active = false
    }
  }, [navigate])

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLoading(true)
    setError(null)

    try {
      await apiRequest<{ authenticated: boolean }>('/api/v1/auth/login', {
        method: 'POST',
        body: JSON.stringify({ password }),
      })
      navigate({ to: '/projects' })
    } catch (submitError) {
      if (submitError instanceof ApiError) {
        setError(submitError.message)
      } else {
        setError('Login failed')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="page-wrap px-4 py-14">
      <section className="island-shell mx-auto w-full max-w-md rounded-3xl p-7 sm:p-9">
        <p className="island-kicker mb-2">oneenv</p>
        <h1 className="display-title mb-3 text-4xl text-[var(--sea-ink)]">Admin Login</h1>
        <p className="mb-6 text-[var(--sea-ink-soft)]">
          Use your admin password to access project and environment variables.
        </p>

        <form className="space-y-4" onSubmit={onSubmit}>
          <label className="block text-sm font-semibold text-[var(--sea-ink)]" htmlFor="password">
            Password
          </label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="w-full rounded-xl border border-[var(--line)] bg-white/80 px-4 py-2.5 text-base text-[var(--sea-ink)] outline-none ring-[var(--lagoon)] focus:ring-2"
            autoComplete="current-password"
            required
          />

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl border border-[rgba(50,143,151,0.35)] bg-[rgba(79,184,178,0.2)] px-4 py-2.5 font-semibold text-[var(--lagoon-deep)] transition hover:bg-[rgba(79,184,178,0.3)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? 'Signing in...' : 'Sign in'}
          </button>
        </form>

        {error ? (
          <p className="mt-4 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        ) : null}
      </section>
    </main>
  )
}
