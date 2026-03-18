import { Link, useNavigate } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { ApiError, apiRequest } from '#/lib/shared/api-client'
import ThemeToggle from './ThemeToggle'

export default function Header() {
  const navigate = useNavigate()
  const [authenticated, setAuthenticated] = useState(false)

  useEffect(() => {
    let active = true
    apiRequest<{ authenticated: boolean }>('/api/v1/auth/session')
      .then((result) => {
        if (active) {
          setAuthenticated(result.authenticated)
        }
      })
      .catch(() => {
        if (active) {
          setAuthenticated(false)
        }
      })

    return () => {
      active = false
    }
  }, [])

  async function handleLogout(): Promise<void> {
    try {
      await apiRequest<{ success: boolean }>('/api/v1/auth/logout', {
        method: 'POST',
      })
    } catch (logoutError) {
      if (logoutError instanceof ApiError && logoutError.status !== 401) {
        return
      }
    }

    setAuthenticated(false)
    navigate({ to: '/login' })
  }

  return (
    <header className="sticky top-0 z-50 border-b border-[var(--line)] bg-[var(--header-bg)] px-4 backdrop-blur-lg">
      <nav className="page-wrap flex flex-wrap items-center gap-2 py-3 sm:py-4">
        <h2 className="m-0 flex-shrink-0 text-base font-semibold tracking-tight">
          <Link
            to="/"
            className="inline-flex items-center gap-2 rounded-full border border-[var(--chip-line)] bg-[var(--chip-bg)] px-3 py-1.5 text-sm text-[var(--sea-ink)] no-underline shadow-[0_8px_24px_rgba(30,90,72,0.08)] sm:px-4 sm:py-2"
          >
            <span className="h-2 w-2 rounded-full bg-[linear-gradient(90deg,#56c6be,#7ed3bf)]" />
            oneenv
          </Link>
        </h2>

        <div className="order-3 flex w-full flex-wrap items-center gap-x-4 gap-y-1 pb-1 text-sm font-semibold sm:order-2 sm:w-auto sm:flex-nowrap sm:pb-0">
          <Link
            to="/"
            className="nav-link"
            activeProps={{ className: 'nav-link is-active' }}
          >
            Home
          </Link>
          <Link
            to="/projects"
            className="nav-link"
            activeProps={{ className: 'nav-link is-active' }}
          >
            Projects
          </Link>
          {!authenticated ? (
            <Link
              to="/login"
              className="nav-link"
              activeProps={{ className: 'nav-link is-active' }}
            >
              Login
            </Link>
          ) : null}
        </div>

        <div className="ml-auto flex items-center gap-2">
          {authenticated ? (
            <button
              type="button"
              onClick={() => void handleLogout()}
              className="rounded-full border border-[var(--line)] bg-white/70 px-3 py-1.5 text-sm font-semibold text-[var(--sea-ink-soft)] transition hover:bg-white"
            >
              Logout
            </button>
          ) : null}
          <ThemeToggle />
        </div>
      </nav>
    </header>
  )
}
