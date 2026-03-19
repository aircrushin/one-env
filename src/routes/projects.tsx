import {
  Link,
  Outlet,
  createFileRoute,
  useNavigate,
  useRouterState,
} from '@tanstack/react-router'
import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { ApiError, apiRequest } from '#/lib/shared/api-client'
import type { Project } from '#/lib/shared/types'
import { useI18n } from '#/lib/i18n'

type ProjectsResponse = { items: Project[] }
type StatusResponse = { storage: 'notion' | 'memory' }

export const Route = createFileRoute('/projects')({
  component: ProjectsPage,
})

function ProjectsPage() {
  const pathname = useRouterState({ select: (state) => state.location.pathname })

  if (pathname.startsWith('/projects/')) {
    return <Outlet />
  }

  return <ProjectsOverviewPage />
}

function ProjectsOverviewPage() {
  const navigate = useNavigate()
  const { messages } = useI18n()
  const [projects, setProjects] = useState<Project[]>([])
  const [status, setStatus] = useState<StatusResponse | null>(null)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true

    async function load(): Promise<void> {
      setLoading(true)
      setError(null)
      try {
        const [projectsData, statusData] = await Promise.all([
          apiRequest<ProjectsResponse>('/api/v1/projects'),
          apiRequest<StatusResponse>('/api/v1/status'),
        ])

        if (!active) {
          return
        }

        setProjects(projectsData.items)
        setStatus(statusData)
      } catch (loadError) {
        if (!active) {
          return
        }

        if (loadError instanceof ApiError && loadError.status === 401) {
          navigate({ to: '/login' })
          return
        }

        setError(
          loadError instanceof Error ? loadError.message : messages.projects.failedToLoadProjects,
        )
      } finally {
        if (active) {
          setLoading(false)
        }
      }
    }

    void load()

    return () => {
      active = false
    }
  }, [navigate])

  const storageLabel = useMemo(() => {
    if (!status) {
      return messages.projects.unknown
    }
    return status.storage === 'notion'
      ? messages.projects.notion
      : messages.projects.memoryFallback
  }, [messages.projects.memoryFallback, messages.projects.notion, messages.projects.unknown, status])

  async function handleCreateProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setCreating(true)
    setError(null)

    try {
      const created = await apiRequest<Project>('/api/v1/projects', {
        method: 'POST',
        body: JSON.stringify({
          name,
          description,
        }),
      })

      setProjects((current) => [...current, created].sort((a, b) => a.name.localeCompare(b.name)))
      setName('')
      setDescription('')
    } catch (createError) {
      if (createError instanceof ApiError && createError.status === 401) {
        navigate({ to: '/login' })
        return
      }

      setError(
        createError instanceof Error
          ? createError.message
          : messages.projects.failedToCreateProject,
      )
    } finally {
      setCreating(false)
    }
  }

  return (
    <main className="page-wrap space-y-6 px-4 py-10">
      <section className="island-shell rounded-3xl px-6 py-6 sm:px-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="island-kicker mb-1">oneenv</p>
            <h1 className="display-title m-0 text-4xl text-[var(--sea-ink)] sm:text-5xl">
              {messages.projects.title}
            </h1>
          </div>
          <p className="rounded-full border border-[var(--line)] bg-[var(--surface)] px-3 py-1 text-sm text-[var(--sea-ink-soft)]">
            {messages.projects.storage}: {storageLabel}
          </p>
        </div>
        <p className="mt-3 max-w-3xl text-[var(--sea-ink-soft)]">
          {messages.projects.intro}
        </p>
      </section>

      <section className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <article className="island-shell rounded-2xl p-5 sm:p-6">
          <h2 className="mb-4 text-lg font-semibold text-[var(--sea-ink)]">{messages.projects.projectList}</h2>
          {loading ? <p className="text-[var(--sea-ink-soft)]">{messages.projects.loadingProjects}</p> : null}
          {!loading && projects.length === 0 ? (
            <p className="text-[var(--sea-ink-soft)]">{messages.projects.noProjects}</p>
          ) : null}

          <ul className="m-0 space-y-3 p-0">
            {projects.map((project) => (
              <li key={project.id} className="list-none">
                <Link
                  to="/projects/$projectId"
                  params={{ projectId: project.id }}
                  className="block rounded-xl border border-[var(--line)] bg-[var(--surface)] px-4 py-3 no-underline transition hover:border-[rgba(50,143,151,0.35)] hover:bg-[var(--surface-strong)]"
                >
                  <p className="m-0 font-semibold text-[var(--sea-ink)]">{project.name}</p>
                  <p className="mt-1 text-sm text-[var(--sea-ink-soft)]">
                    {project.description || messages.projects.noDescription}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        </article>

        <article className="island-shell rounded-2xl p-5 sm:p-6">
          <h2 className="mb-4 text-lg font-semibold text-[var(--sea-ink)]">{messages.projects.createProject}</h2>
          <form className="space-y-3" onSubmit={handleCreateProject}>
            <label className="block text-sm font-semibold text-[var(--sea-ink)]" htmlFor="project-name">
              {messages.projects.name}
            </label>
            <input
              id="project-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="w-full rounded-xl border border-[var(--line)] bg-[var(--surface-strong)] px-3 py-2.5 text-[var(--sea-ink)] outline-none ring-[var(--lagoon)] focus:ring-2"
              required
            />

            <label className="block text-sm font-semibold text-[var(--sea-ink)]" htmlFor="project-description">
              {messages.projects.description}
            </label>
            <textarea
              id="project-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              className="min-h-24 w-full rounded-xl border border-[var(--line)] bg-[var(--surface-strong)] px-3 py-2.5 text-[var(--sea-ink)] outline-none ring-[var(--lagoon)] focus:ring-2"
            />

            <button
              type="submit"
              disabled={creating}
              className="w-full rounded-xl border border-[rgba(50,143,151,0.35)] bg-[rgba(79,184,178,0.2)] px-4 py-2.5 font-semibold text-[var(--lagoon-deep)] transition hover:bg-[rgba(79,184,178,0.3)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {creating ? messages.projects.creating : messages.projects.createProjectButton}
            </button>
          </form>

          {error ? (
            <p className="mt-4 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          ) : null}
        </article>
      </section>
    </main>
  )
}
