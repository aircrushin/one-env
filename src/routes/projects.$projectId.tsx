import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { ApiError, apiRequest } from '#/lib/shared/api-client'
import type {
  Environment,
  Project,
  SearchResult,
  Variable,
  VariableScope,
  VersionEvent,
} from '#/lib/shared/types'

type ListResponse<T> = { items: T[] }
type ExportResponse = { content: string; items: Variable[] }

type VariableDraft = {
  key: string
  value: string
  description: string
}

export const Route = createFileRoute('/projects/$projectId')({
  component: ProjectDetailPage,
})

function ProjectDetailPage() {
  const { projectId } = Route.useParams()
  const navigate = useNavigate()

  const [project, setProject] = useState<Project | null>(null)
  const [environments, setEnvironments] = useState<Environment[]>([])
  const [selectedEnvironmentId, setSelectedEnvironmentId] = useState('')
  const [variables, setVariables] = useState<Variable[]>([])
  const [versions, setVersions] = useState<VersionEvent[]>([])

  const [envName, setEnvName] = useState('')
  const [envDescription, setEnvDescription] = useState('')
  const [variableScope, setVariableScope] = useState<VariableScope>('env')
  const [variableDraft, setVariableDraft] = useState<VariableDraft>({
    key: '',
    value: '',
    description: '',
  })

  const [editingVariableId, setEditingVariableId] = useState('')
  const [editingDraft, setEditingDraft] = useState<VariableDraft>({
    key: '',
    value: '',
    description: '',
  })

  const [importScope, setImportScope] = useState<VariableScope>('env')
  const [importText, setImportText] = useState('')
  const [exportText, setExportText] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])

  const [loading, setLoading] = useState(true)
  const [busyMessage, setBusyMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const selectedEnvironment = useMemo(
    () => environments.find((item) => item.id === selectedEnvironmentId) ?? null,
    [environments, selectedEnvironmentId],
  )

  const globalVariables = useMemo(
    () => variables.filter((item) => item.scope === 'global'),
    [variables],
  )

  const envVariables = useMemo(
    () =>
      variables.filter(
        (item) => item.scope === 'env' && item.environmentId === selectedEnvironmentId,
      ),
    [variables, selectedEnvironmentId],
  )

  useEffect(() => {
    let active = true

    async function loadBase(): Promise<void> {
      setLoading(true)
      setError(null)

      try {
        const [projectsData, envData] = await Promise.all([
          apiRequest<ListResponse<Project>>('/api/v1/projects'),
          apiRequest<ListResponse<Environment>>(
            `/api/v1/projects/${projectId}/environments`,
          ),
        ])

        if (!active) {
          return
        }

        const foundProject = projectsData.items.find((item) => item.id === projectId) ?? null
        setProject(foundProject)
        setEnvironments(envData.items)

        setSelectedEnvironmentId((current) => {
          if (envData.items.some((item) => item.id === current)) {
            return current
          }
          return envData.items[0]?.id ?? ''
        })
      } catch (loadError) {
        if (!active) {
          return
        }

        if (loadError instanceof ApiError && loadError.status === 401) {
          navigate({ to: '/login' })
          return
        }

        setError(loadError instanceof Error ? loadError.message : 'Failed to load project')
      } finally {
        if (active) {
          setLoading(false)
        }
      }
    }

    void loadBase()

    return () => {
      active = false
    }
  }, [navigate, projectId])

  useEffect(() => {
    if (!selectedEnvironmentId) {
      setVariables([])
      setVersions([])
      setExportText('')
      return
    }

    let active = true

    async function loadDetails(): Promise<void> {
      try {
        const [variablesData, versionsData] = await Promise.all([
          apiRequest<ListResponse<Variable>>(
            `/api/v1/variables?projectId=${projectId}&environmentId=${selectedEnvironmentId}&includeGlobal=true`,
          ),
          apiRequest<ListResponse<VersionEvent>>(
            `/api/v1/versions?projectId=${projectId}&environmentId=${selectedEnvironmentId}`,
          ),
        ])

        if (!active) {
          return
        }

        setVariables(variablesData.items)
        setVersions(versionsData.items)
      } catch (loadError) {
        if (!active) {
          return
        }

        if (loadError instanceof ApiError && loadError.status === 401) {
          navigate({ to: '/login' })
          return
        }

        setError(loadError instanceof Error ? loadError.message : 'Failed to load variables')
      }
    }

    void loadDetails()

    return () => {
      active = false
    }
  }, [navigate, projectId, selectedEnvironmentId])

  async function withBusy(message: string, action: () => Promise<void>): Promise<void> {
    setBusyMessage(message)
    setError(null)
    try {
      await action()
    } catch (actionError) {
      if (actionError instanceof ApiError && actionError.status === 401) {
        navigate({ to: '/login' })
        return
      }
      setError(actionError instanceof Error ? actionError.message : 'Operation failed')
    } finally {
      setBusyMessage(null)
    }
  }

  async function refreshSelectedEnvironmentData(): Promise<void> {
    if (!selectedEnvironmentId) {
      setVariables([])
      setVersions([])
      return
    }

    const [variablesData, versionsData] = await Promise.all([
      apiRequest<ListResponse<Variable>>(
        `/api/v1/variables?projectId=${projectId}&environmentId=${selectedEnvironmentId}&includeGlobal=true`,
      ),
      apiRequest<ListResponse<VersionEvent>>(
        `/api/v1/versions?projectId=${projectId}&environmentId=${selectedEnvironmentId}`,
      ),
    ])

    setVariables(variablesData.items)
    setVersions(versionsData.items)
  }

  async function handleCreateEnvironment(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    await withBusy('Creating environment...', async () => {
      const created = await apiRequest<Environment>(
        `/api/v1/projects/${projectId}/environments`,
        {
          method: 'POST',
          body: JSON.stringify({ name: envName, description: envDescription }),
        },
      )

      setEnvironments((current) =>
        [...current, created].sort((a, b) => a.name.localeCompare(b.name)),
      )
      setSelectedEnvironmentId(created.id)
      setEnvName('')
      setEnvDescription('')
    })
  }

  async function handleCreateVariable(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()

    await withBusy('Creating variable...', async () => {
      if (variableScope === 'env' && !selectedEnvironmentId) {
        throw new Error('Select an environment before creating env-scoped variables')
      }

      await apiRequest<Variable>('/api/v1/variables', {
        method: 'POST',
        body: JSON.stringify({
          scope: variableScope,
          key: variableDraft.key,
          value: variableDraft.value,
          description: variableDraft.description,
          projectId: variableScope === 'env' ? projectId : undefined,
          environmentId:
            variableScope === 'env' ? selectedEnvironmentId : undefined,
        }),
      })

      setVariableDraft({ key: '', value: '', description: '' })
      await refreshSelectedEnvironmentData()
    })
  }

  async function handleDeleteVariable(variableId: string): Promise<void> {
    await withBusy('Deleting variable...', async () => {
      await apiRequest<{ success: boolean }>(`/api/v1/variables/${variableId}`, {
        method: 'DELETE',
      })
      await refreshSelectedEnvironmentData()
    })
  }

  async function handleSaveEdit(variableId: string): Promise<void> {
    await withBusy('Updating variable...', async () => {
      await apiRequest<Variable>(`/api/v1/variables/${variableId}`, {
        method: 'PATCH',
        body: JSON.stringify(editingDraft),
      })
      setEditingVariableId('')
      await refreshSelectedEnvironmentData()
    })
  }

  function startEdit(variable: Variable): void {
    setEditingVariableId(variable.id)
    setEditingDraft({
      key: variable.key,
      value: variable.value,
      description: variable.description,
    })
  }

  async function handleImport(): Promise<void> {
    await withBusy('Importing .env...', async () => {
      if (importScope === 'env' && !selectedEnvironmentId) {
        throw new Error('Select an environment before importing env-scoped variables')
      }

      await apiRequest<{ created: number; updated: number; skipped: number; total: number }>(
        '/api/v1/env/import',
        {
          method: 'POST',
          body: JSON.stringify({
            scope: importScope,
            content: importText,
            projectId: importScope === 'env' ? projectId : undefined,
            environmentId: importScope === 'env' ? selectedEnvironmentId : undefined,
          }),
        },
      )

      await refreshSelectedEnvironmentData()
    })
  }

  async function handleExport(): Promise<void> {
    await withBusy('Exporting .env...', async () => {
      if (!selectedEnvironmentId) {
        throw new Error('Select an environment before export')
      }

      const exported = await apiRequest<ExportResponse>(
        `/api/v1/env/export?projectId=${projectId}&environmentId=${selectedEnvironmentId}`,
      )

      setExportText(exported.content)
    })
  }

  async function handleSearch(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()

    await withBusy('Searching...', async () => {
      const query = encodeURIComponent(searchQuery)
      const project = encodeURIComponent(projectId)
      const env = encodeURIComponent(selectedEnvironmentId)

      const results = await apiRequest<ListResponse<SearchResult>>(
        `/api/v1/search?q=${query}&projectId=${project}&environmentId=${env}`,
      )

      setSearchResults(results.items)
    })
  }

  async function handleRollback(versionEventId: string): Promise<void> {
    await withBusy('Rolling back version...', async () => {
      await apiRequest<{ variable: Variable | null }>(
        `/api/v1/versions/${versionEventId}/rollback`,
        {
          method: 'POST',
        },
      )

      await refreshSelectedEnvironmentData()
    })
  }

  return (
    <main className="page-wrap space-y-6 px-4 py-8">
      <section className="island-shell rounded-3xl px-6 py-6 sm:px-8">
        <p className="island-kicker mb-2">oneenv</p>
        <h1 className="display-title m-0 text-4xl text-[var(--sea-ink)] sm:text-5xl">
          {project?.name ?? 'Project'}
        </h1>
        <p className="mt-3 text-[var(--sea-ink-soft)]">
          {project?.description || 'Manage environments, shared variables, imports, and version history.'}
        </p>
      </section>

      {loading ? <p className="text-[var(--sea-ink-soft)]">Loading project details...</p> : null}

      {error ? (
        <p className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      {busyMessage ? (
        <p className="rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--sea-ink-soft)]">
          {busyMessage}
        </p>
      ) : null}

      <section className="grid gap-6 lg:grid-cols-[280px_1fr]">
        <aside className="island-shell rounded-2xl p-5">
          <h2 className="m-0 text-lg font-semibold text-[var(--sea-ink)]">Environments</h2>
          <ul className="mt-4 space-y-2 p-0">
            {environments.map((environment) => (
              <li key={environment.id} className="list-none">
                <button
                  type="button"
                  onClick={() => setSelectedEnvironmentId(environment.id)}
                  className={`w-full rounded-lg border px-3 py-2 text-left text-sm transition ${
                    selectedEnvironmentId === environment.id
                      ? 'border-[rgba(50,143,151,0.4)] bg-[rgba(79,184,178,0.2)] text-[var(--sea-ink)]'
                      : 'border-[var(--line)] bg-white/70 text-[var(--sea-ink-soft)] hover:border-[rgba(50,143,151,0.3)]'
                  }`}
                >
                  {environment.name}
                </button>
              </li>
            ))}
          </ul>

          <form className="mt-5 space-y-2" onSubmit={handleCreateEnvironment}>
            <input
              placeholder="Environment name"
              value={envName}
              onChange={(event) => setEnvName(event.target.value)}
              className="w-full rounded-lg border border-[var(--line)] bg-white/80 px-3 py-2 text-sm text-[var(--sea-ink)] outline-none ring-[var(--lagoon)] focus:ring-2"
              required
            />
            <textarea
              placeholder="Description"
              value={envDescription}
              onChange={(event) => setEnvDescription(event.target.value)}
              className="min-h-20 w-full rounded-lg border border-[var(--line)] bg-white/80 px-3 py-2 text-sm text-[var(--sea-ink)] outline-none ring-[var(--lagoon)] focus:ring-2"
            />
            <button
              type="submit"
              className="w-full rounded-lg border border-[rgba(50,143,151,0.35)] bg-[rgba(79,184,178,0.2)] px-3 py-2 text-sm font-semibold text-[var(--lagoon-deep)] transition hover:bg-[rgba(79,184,178,0.3)]"
            >
              Add Environment
            </button>
          </form>
        </aside>

        <div className="space-y-6">
          <section className="island-shell rounded-2xl p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="m-0 text-lg font-semibold text-[var(--sea-ink)]">
                Variables ({selectedEnvironment?.name ?? 'No environment selected'})
              </h2>
              <select
                value={variableScope}
                onChange={(event) => setVariableScope(event.target.value as VariableScope)}
                className="rounded-lg border border-[var(--line)] bg-white/80 px-3 py-2 text-sm text-[var(--sea-ink)]"
              >
                <option value="env">Environment scope</option>
                <option value="global">Global scope</option>
              </select>
            </div>

            <form className="mt-4 grid gap-3 md:grid-cols-3" onSubmit={handleCreateVariable}>
              <input
                placeholder="KEY"
                value={variableDraft.key}
                onChange={(event) =>
                  setVariableDraft((current) => ({ ...current, key: event.target.value }))
                }
                className="rounded-lg border border-[var(--line)] bg-white/80 px-3 py-2 text-sm text-[var(--sea-ink)] outline-none ring-[var(--lagoon)] focus:ring-2"
                required
              />
              <input
                placeholder="value"
                value={variableDraft.value}
                onChange={(event) =>
                  setVariableDraft((current) => ({ ...current, value: event.target.value }))
                }
                className="rounded-lg border border-[var(--line)] bg-white/80 px-3 py-2 text-sm text-[var(--sea-ink)] outline-none ring-[var(--lagoon)] focus:ring-2"
                required
              />
              <input
                placeholder="description"
                value={variableDraft.description}
                onChange={(event) =>
                  setVariableDraft((current) => ({
                    ...current,
                    description: event.target.value,
                  }))
                }
                className="rounded-lg border border-[var(--line)] bg-white/80 px-3 py-2 text-sm text-[var(--sea-ink)] outline-none ring-[var(--lagoon)] focus:ring-2"
              />
              <button
                type="submit"
                className="md:col-span-3 rounded-lg border border-[rgba(50,143,151,0.35)] bg-[rgba(79,184,178,0.2)] px-3 py-2 text-sm font-semibold text-[var(--lagoon-deep)] transition hover:bg-[rgba(79,184,178,0.3)]"
              >
                Add Variable
              </button>
            </form>

            <div className="mt-5 grid gap-4 xl:grid-cols-2">
              <VariableList
                title="Global Variables"
                variables={globalVariables}
                editingVariableId={editingVariableId}
                editingDraft={editingDraft}
                onStartEdit={startEdit}
                onEditingDraftChange={setEditingDraft}
                onSaveEdit={handleSaveEdit}
                onDelete={handleDeleteVariable}
                onCancelEdit={() => setEditingVariableId('')}
              />
              <VariableList
                title="Environment Variables"
                variables={envVariables}
                editingVariableId={editingVariableId}
                editingDraft={editingDraft}
                onStartEdit={startEdit}
                onEditingDraftChange={setEditingDraft}
                onSaveEdit={handleSaveEdit}
                onDelete={handleDeleteVariable}
                onCancelEdit={() => setEditingVariableId('')}
              />
            </div>
          </section>

          <section className="island-shell rounded-2xl p-5">
            <h2 className="m-0 text-lg font-semibold text-[var(--sea-ink)]">Import / Export</h2>
            <div className="mt-3 flex flex-wrap gap-2">
              <select
                value={importScope}
                onChange={(event) => setImportScope(event.target.value as VariableScope)}
                className="rounded-lg border border-[var(--line)] bg-white/80 px-3 py-2 text-sm text-[var(--sea-ink)]"
              >
                <option value="env">Import to selected environment</option>
                <option value="global">Import to global scope</option>
              </select>
              <button
                type="button"
                onClick={() => void handleImport()}
                className="rounded-lg border border-[rgba(50,143,151,0.35)] bg-[rgba(79,184,178,0.2)] px-3 py-2 text-sm font-semibold text-[var(--lagoon-deep)] transition hover:bg-[rgba(79,184,178,0.3)]"
              >
                Import .env
              </button>
              <button
                type="button"
                onClick={() => void handleExport()}
                className="rounded-lg border border-[var(--line)] bg-white/80 px-3 py-2 text-sm font-semibold text-[var(--sea-ink-soft)] transition hover:bg-white"
              >
                Export merged .env
              </button>
            </div>

            <textarea
              value={importText}
              onChange={(event) => setImportText(event.target.value)}
              placeholder="Paste .env content here"
              className="mt-3 min-h-32 w-full rounded-lg border border-[var(--line)] bg-white/80 px-3 py-2 text-sm text-[var(--sea-ink)] outline-none ring-[var(--lagoon)] focus:ring-2"
            />

            <textarea
              value={exportText}
              onChange={(event) => setExportText(event.target.value)}
              placeholder="Export result"
              className="mt-3 min-h-32 w-full rounded-lg border border-[var(--line)] bg-white/80 px-3 py-2 font-mono text-xs text-[var(--sea-ink)] outline-none ring-[var(--lagoon)] focus:ring-2"
            />
          </section>

          <section className="island-shell rounded-2xl p-5">
            <h2 className="m-0 text-lg font-semibold text-[var(--sea-ink)]">Search</h2>
            <form className="mt-3 flex flex-wrap gap-2" onSubmit={handleSearch}>
              <input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search key / value / description"
                className="min-w-64 flex-1 rounded-lg border border-[var(--line)] bg-white/80 px-3 py-2 text-sm text-[var(--sea-ink)] outline-none ring-[var(--lagoon)] focus:ring-2"
              />
              <button
                type="submit"
                className="rounded-lg border border-[rgba(50,143,151,0.35)] bg-[rgba(79,184,178,0.2)] px-3 py-2 text-sm font-semibold text-[var(--lagoon-deep)] transition hover:bg-[rgba(79,184,178,0.3)]"
              >
                Search
              </button>
            </form>

            <ul className="mt-3 space-y-2 p-0">
              {searchResults.map((result) => (
                <li
                  key={result.id}
                  className="list-none rounded-lg border border-[var(--line)] bg-white/70 px-3 py-2 text-sm"
                >
                  <p className="m-0 font-semibold text-[var(--sea-ink)]">
                    {result.key}{' '}
                    <span className="rounded bg-[rgba(79,184,178,0.22)] px-1.5 py-0.5 text-xs text-[var(--lagoon-deep)]">
                      {result.scope}
                    </span>
                  </p>
                  <p className="m-0 mt-1 text-[var(--sea-ink-soft)]">{result.value}</p>
                </li>
              ))}
            </ul>
          </section>

          <section className="island-shell rounded-2xl p-5">
            <h2 className="m-0 text-lg font-semibold text-[var(--sea-ink)]">Version History</h2>
            <ul className="mt-3 space-y-3 p-0">
              {versions.slice(0, 30).map((version) => (
                <li
                  key={version.id}
                  className="list-none rounded-lg border border-[var(--line)] bg-white/75 px-3 py-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="m-0 text-sm font-semibold text-[var(--sea-ink)]">
                      {version.eventType} - {version.key}
                    </p>
                    <button
                      type="button"
                      onClick={() => void handleRollback(version.id)}
                      className="rounded-lg border border-[var(--line)] bg-white px-2.5 py-1 text-xs font-semibold text-[var(--sea-ink-soft)] transition hover:bg-[rgba(79,184,178,0.18)]"
                    >
                      Rollback
                    </button>
                  </div>
                  <p className="m-0 mt-1 text-xs text-[var(--sea-ink-soft)]">
                    {new Date(version.createdAtIso).toLocaleString()}
                  </p>
                  <details className="mt-2 text-xs text-[var(--sea-ink-soft)]">
                    <summary>Snapshot JSON</summary>
                    <pre className="mt-2 overflow-auto rounded-md border border-[var(--line)] bg-[var(--surface)] p-2">
                      <code>{version.snapshotJson}</code>
                    </pre>
                  </details>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </section>
    </main>
  )
}

type VariableListProps = {
  title: string
  variables: Variable[]
  editingVariableId: string
  editingDraft: VariableDraft
  onStartEdit: (variable: Variable) => void
  onEditingDraftChange: (value: VariableDraft) => void
  onSaveEdit: (id: string) => Promise<void>
  onDelete: (id: string) => Promise<void>
  onCancelEdit: () => void
}

function VariableList(props: VariableListProps) {
  return (
    <article className="rounded-xl border border-[var(--line)] bg-white/65 p-3">
      <h3 className="m-0 text-sm font-semibold text-[var(--sea-ink)]">{props.title}</h3>
      <ul className="mt-3 space-y-2 p-0">
        {props.variables.map((variable) => {
          const isEditing = props.editingVariableId === variable.id

          if (isEditing) {
            return (
              <li
                key={variable.id}
                className="list-none rounded-lg border border-[var(--line)] bg-white p-2"
              >
                <input
                  value={props.editingDraft.key}
                  onChange={(event) =>
                    props.onEditingDraftChange({
                      ...props.editingDraft,
                      key: event.target.value,
                    })
                  }
                  className="mb-1 w-full rounded border border-[var(--line)] px-2 py-1 text-xs"
                />
                <input
                  value={props.editingDraft.value}
                  onChange={(event) =>
                    props.onEditingDraftChange({
                      ...props.editingDraft,
                      value: event.target.value,
                    })
                  }
                  className="mb-1 w-full rounded border border-[var(--line)] px-2 py-1 text-xs"
                />
                <input
                  value={props.editingDraft.description}
                  onChange={(event) =>
                    props.onEditingDraftChange({
                      ...props.editingDraft,
                      description: event.target.value,
                    })
                  }
                  className="w-full rounded border border-[var(--line)] px-2 py-1 text-xs"
                />
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={() => void props.onSaveEdit(variable.id)}
                    className="rounded border border-[rgba(50,143,151,0.35)] bg-[rgba(79,184,178,0.2)] px-2 py-1 text-xs"
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={props.onCancelEdit}
                    className="rounded border border-[var(--line)] bg-white px-2 py-1 text-xs"
                  >
                    Cancel
                  </button>
                </div>
              </li>
            )
          }

          return (
            <li
              key={variable.id}
              className="list-none rounded-lg border border-[var(--line)] bg-white/90 p-2"
            >
              <p className="m-0 text-sm font-semibold text-[var(--sea-ink)]">{variable.key}</p>
              <p className="m-0 mt-1 text-sm text-[var(--sea-ink-soft)]">{variable.value}</p>
              {variable.description ? (
                <p className="m-0 mt-1 text-xs text-[var(--sea-ink-soft)]">{variable.description}</p>
              ) : null}
              <p className="m-0 mt-1 text-xs text-[var(--sea-ink-soft)]">v{variable.versionNo}</p>
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => props.onStartEdit(variable)}
                  className="rounded border border-[var(--line)] bg-white px-2 py-1 text-xs"
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => void props.onDelete(variable.id)}
                  className="rounded border border-red-300 bg-red-50 px-2 py-1 text-xs text-red-700"
                >
                  Delete
                </button>
              </div>
            </li>
          )
        })}
      </ul>
    </article>
  )
}
