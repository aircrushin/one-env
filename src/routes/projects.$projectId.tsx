import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useEffect, useMemo, useState } from 'react'
import type { ChangeEvent, DragEvent, FormEvent } from 'react'
import { ApiError, apiRequest } from '#/lib/shared/api-client'
import { parseEnvContent, serializeEnvEntries } from '#/lib/shared/env'
import { useI18n } from '#/lib/i18n'
import type { Messages } from '#/lib/i18n'
import type {
  Environment,
  ParsedEnvEntry,
  Project,
  SearchResult,
  Variable,
  VariableScope,
  VersionEvent,
} from '#/lib/shared/types'

type ListResponse<T> = { items: T[] }
type ExportResponse = { content: string; items: Variable[] }
type ImportResponse = { created: number; updated: number; skipped: number; total: number }

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
  const { language, messages } = useI18n()

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
  const [importFileName, setImportFileName] = useState('')
  const [isImportDragOver, setIsImportDragOver] = useState(false)
  const [exportText, setExportText] = useState('')
  const [exportProgress, setExportProgress] = useState<number | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])

  const [loading, setLoading] = useState(true)
  const [busyMessage, setBusyMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [toastMessage, setToastMessage] = useState<string | null>(null)

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

  const parsedImportEntries = useMemo(
    () => parseEnvContent(importText),
    [importText],
  )

  const mergedImportEntries = useMemo(() => {
    const byKey = new Map<string, ParsedEnvEntry>()
    for (const entry of parsedImportEntries) {
      byKey.set(entry.key, entry)
    }
    return Array.from(byKey.values())
  }, [parsedImportEntries])

  const duplicateImportCount = parsedImportEntries.length - mergedImportEntries.length

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

        setError(
          loadError instanceof Error ? loadError.message : messages.projectDetail.failedToLoadProject,
        )
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

        setError(
          loadError instanceof Error ? loadError.message : messages.projectDetail.failedToLoadVariables,
        )
      }
    }

    void loadDetails()

    return () => {
      active = false
    }
  }, [navigate, projectId, selectedEnvironmentId])

  useEffect(() => {
    if (!toastMessage) {
      return
    }

    const timeoutId = setTimeout(() => {
      setToastMessage(null)
    }, 3000)

    return () => {
      clearTimeout(timeoutId)
    }
  }, [toastMessage])

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
      setError(actionError instanceof Error ? actionError.message : messages.projectDetail.operationFailed)
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
    await withBusy(messages.projectDetail.creatingEnvironment, async () => {
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

    await withBusy(messages.projectDetail.creatingVariable, async () => {
      if (variableScope === 'env' && !selectedEnvironmentId) {
        throw new Error(messages.projectDetail.selectEnvBeforeCreateScopedVariable)
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
    await withBusy(messages.projectDetail.deletingVariable, async () => {
      await apiRequest<{ success: boolean }>(`/api/v1/variables/${variableId}`, {
        method: 'DELETE',
      })
      await refreshSelectedEnvironmentData()
    })
  }

  async function handleSaveEdit(variableId: string): Promise<void> {
    await withBusy(messages.projectDetail.updatingVariable, async () => {
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

  async function loadImportFile(file: File): Promise<void> {
    try {
      const content = await file.text()
      setImportText(content)
      setImportFileName(file.name)
      setError(null)
    } catch {
      setError(messages.projectDetail.failedToReadEnvFile)
    }
  }

  function handleImportFileSelect(event: ChangeEvent<HTMLInputElement>): void {
    const selected = event.target.files?.[0]
    if (!selected) {
      return
    }

    void loadImportFile(selected)
    event.target.value = ''
  }

  function handleImportDragOver(event: DragEvent<HTMLDivElement>): void {
    event.preventDefault()
    setIsImportDragOver(true)
  }

  function handleImportDragLeave(event: DragEvent<HTMLDivElement>): void {
    event.preventDefault()
    setIsImportDragOver(false)
  }

  function handleImportDrop(event: DragEvent<HTMLDivElement>): void {
    event.preventDefault()
    setIsImportDragOver(false)

    const dropped = event.dataTransfer.files?.[0]
    if (!dropped) {
      return
    }

    void loadImportFile(dropped)
  }

  async function handleImport(): Promise<void> {
    await withBusy(messages.projectDetail.importingEnv, async () => {
      if (importScope === 'env' && !selectedEnvironmentId) {
        throw new Error(messages.projectDetail.selectEnvBeforeImportScopedVariables)
      }
      if (mergedImportEntries.length === 0) {
        throw new Error(messages.projectDetail.pasteOrDropEnvFile)
      }

      const result = await apiRequest<ImportResponse>(
        '/api/v1/env/import',
        {
          method: 'POST',
          body: JSON.stringify({
            scope: importScope,
            content: serializeEnvEntries(mergedImportEntries),
            projectId: importScope === 'env' ? projectId : undefined,
            environmentId: importScope === 'env' ? selectedEnvironmentId : undefined,
          }),
        },
      )

      setImportText('')
      setImportFileName('')
      setToastMessage(
        messages.projectDetail.importCompleted(
          result.created,
          result.updated,
          result.skipped,
          result.total,
        ),
      )
      await refreshSelectedEnvironmentData()
    })
  }

  async function handleExport(): Promise<void> {
    setExportProgress(12)
    const intervalId = window.setInterval(() => {
      setExportProgress((current) => {
        if (current === null) {
          return 12
        }
        if (current >= 92) {
          return current
        }
        return Math.min(92, current + Math.max(1, Math.round((92 - current) / 4)))
      })
    }, 180)

    let succeeded = false
    await withBusy(messages.projectDetail.exportingEnv, async () => {
      if (!selectedEnvironmentId) {
        throw new Error(messages.projectDetail.selectEnvBeforeExport)
      }

      const exported = await apiRequest<ExportResponse>(
        `/api/v1/env/export?projectId=${projectId}&environmentId=${selectedEnvironmentId}`,
      )

      setExportText(exported.content)
      succeeded = true
    })

    window.clearInterval(intervalId)

    if (!succeeded) {
      setExportProgress(null)
      return
    }

    setExportProgress(100)
    window.setTimeout(() => {
      setExportProgress(null)
    }, 500)
  }

  async function handleSearch(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()

    await withBusy(messages.projectDetail.searching, async () => {
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
    await withBusy(messages.projectDetail.rollbackVersion, async () => {
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
          {project?.name ?? messages.projectDetail.fallbackProjectName}
        </h1>
        <p className="mt-3 text-[var(--sea-ink-soft)]">
          {project?.description || messages.projectDetail.fallbackProjectDescription}
        </p>
      </section>

      {loading ? <p className="text-[var(--sea-ink-soft)]">{messages.projectDetail.loadingProjectDetails}</p> : null}

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
          <h2 className="m-0 text-lg font-semibold text-[var(--sea-ink)]">{messages.projectDetail.environments}</h2>
          <ul className="mt-4 space-y-2 p-0">
            {environments.map((environment) => (
              <li key={environment.id} className="list-none">
                <button
                  type="button"
                  onClick={() => setSelectedEnvironmentId(environment.id)}
                  className={`w-full rounded-lg border px-3 py-2 text-left text-sm transition ${
                    selectedEnvironmentId === environment.id
                      ? 'border-[rgba(50,143,151,0.4)] bg-[rgba(79,184,178,0.2)] text-[var(--sea-ink)]'
                      : 'border-[var(--line)] bg-[var(--surface)] text-[var(--sea-ink-soft)] hover:border-[rgba(50,143,151,0.3)]'
                  }`}
                >
                  {environment.name}
                </button>
              </li>
            ))}
          </ul>

          <form className="mt-5 space-y-2" onSubmit={handleCreateEnvironment}>
            <input
              placeholder={messages.projectDetail.environmentNamePlaceholder}
              value={envName}
              onChange={(event) => setEnvName(event.target.value)}
              className="w-full rounded-lg border border-[var(--line)] bg-[var(--surface-strong)] px-3 py-2 text-sm text-[var(--sea-ink)] outline-none ring-[var(--lagoon)] focus:ring-2"
              required
            />
            <textarea
              placeholder={messages.projectDetail.environmentDescriptionPlaceholder}
              value={envDescription}
              onChange={(event) => setEnvDescription(event.target.value)}
              className="min-h-20 w-full rounded-lg border border-[var(--line)] bg-[var(--surface-strong)] px-3 py-2 text-sm text-[var(--sea-ink)] outline-none ring-[var(--lagoon)] focus:ring-2"
            />
            <button
              type="submit"
              className="w-full rounded-lg border border-[rgba(50,143,151,0.35)] bg-[rgba(79,184,178,0.2)] px-3 py-2 text-sm font-semibold text-[var(--lagoon-deep)] transition hover:bg-[rgba(79,184,178,0.3)]"
            >
              {messages.projectDetail.addEnvironment}
            </button>
          </form>
        </aside>

        <div className="space-y-6">
          <section className="island-shell rounded-2xl p-5">
            <h2 className="m-0 text-lg font-semibold text-[var(--sea-ink)]">{messages.projectDetail.importExport}</h2>
            <div className="mt-3 flex flex-wrap gap-2">
              <select
                value={importScope}
                onChange={(event) => setImportScope(event.target.value as VariableScope)}
                className="rounded-lg border border-[var(--line)] bg-[var(--surface-strong)] px-3 py-2 text-sm text-[var(--sea-ink)]"
              >
                <option value="env">{messages.projectDetail.importToSelectedEnvironment}</option>
                <option value="global">{messages.projectDetail.importToGlobalScope}</option>
              </select>
              <button
                type="button"
                onClick={() => void handleImport()}
                disabled={mergedImportEntries.length === 0}
                className="rounded-lg border border-[rgba(50,143,151,0.35)] bg-[rgba(79,184,178,0.2)] px-3 py-2 text-sm font-semibold text-[var(--lagoon-deep)] transition hover:bg-[rgba(79,184,178,0.3)]"
              >
                {messages.projectDetail.confirmImport}
              </button>
              <button
                type="button"
                onClick={() => void handleExport()}
                disabled={exportProgress !== null}
                className="rounded-lg border border-[var(--line)] bg-[var(--surface-strong)] px-3 py-2 text-sm font-semibold text-[var(--sea-ink)] transition hover:bg-[var(--surface)] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {messages.projectDetail.exportMergedEnv}
              </button>
            </div>

            {exportProgress !== null ? (
              <div className="mt-3 rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 py-2">
                <div className="flex items-center justify-between text-xs text-[var(--sea-ink-soft)]">
                  <span>{messages.projectDetail.exportingEnv}</span>
                  <span>{exportProgress}%</span>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-[var(--surface-strong)]">
                  <div
                    className="h-full rounded-full bg-[var(--lagoon)] transition-all duration-200"
                    role="progressbar"
                    aria-label={messages.projectDetail.exportingEnv}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={exportProgress}
                    style={{ width: `${exportProgress}%` }}
                  />
                </div>
              </div>
            ) : null}

            <div
              onDragOver={handleImportDragOver}
              onDragLeave={handleImportDragLeave}
              onDrop={handleImportDrop}
              className={`mt-3 rounded-lg border-2 border-dashed px-3 py-3 text-sm ${
                isImportDragOver
                  ? 'border-[rgba(50,143,151,0.5)] bg-[rgba(79,184,178,0.14)]'
                  : 'border-[var(--line)] bg-[var(--surface)]'
              }`}
            >
              <p className="m-0 text-[var(--sea-ink)]">
                {messages.projectDetail.pasteOrDropHint}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <label className="inline-flex cursor-pointer rounded-lg border border-[var(--line)] bg-[var(--surface-strong)] px-3 py-1.5 text-xs font-semibold text-[var(--sea-ink)] transition hover:bg-[var(--surface)]">
                  {messages.projectDetail.chooseEnvFile}
                  <input
                    type="file"
                    accept=".env,.txt,text/plain"
                    onChange={handleImportFileSelect}
                    className="hidden"
                  />
                </label>
                <p className="m-0 text-xs text-[var(--sea-ink-soft)]">
                  {importFileName
                    ? messages.projectDetail.loadedFile(importFileName)
                    : messages.projectDetail.noFileSelected}
                </p>
              </div>
            </div>

            <textarea
              value={importText}
              onChange={(event) => {
                setImportText(event.target.value)
                setImportFileName('')
              }}
              placeholder={messages.projectDetail.importContentPlaceholder}
              className="mt-3 min-h-32 w-full rounded-lg border border-[var(--line)] bg-[var(--surface-strong)] px-3 py-2 text-sm text-[var(--sea-ink)] outline-none ring-[var(--lagoon)] focus:ring-2"
            />

            <div className="mt-3 rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-xs text-[var(--sea-ink-soft)]">
              <p className="m-0">
                {messages.projectDetail.parsedVariablesSummary(
                  mergedImportEntries.length,
                  duplicateImportCount,
                )}
              </p>
              {importText.trim() && mergedImportEntries.length === 0 ? (
                <p className="m-0 mt-1 text-red-700">
                  {messages.projectDetail.noValidEntries}
                </p>
              ) : null}
              {mergedImportEntries.length > 0 ? (
                <ul className="mt-2 space-y-1 p-0">
                  {mergedImportEntries.slice(0, 8).map((entry) => (
                    <li key={entry.key} className="list-none font-mono text-[11px] text-[var(--sea-ink)]">
                      {entry.key}={entry.value}
                    </li>
                  ))}
                </ul>
              ) : null}
              {mergedImportEntries.length > 8 ? (
                <p className="m-0 mt-1">
                  {messages.projectDetail.andMore(mergedImportEntries.length - 8)}
                </p>
              ) : null}
            </div>

            {exportText ? (
              <textarea
                value={exportText}
                onChange={(event) => setExportText(event.target.value)}
                placeholder={messages.projectDetail.exportResultPlaceholder}
                className="mt-3 min-h-32 w-full rounded-lg border border-[var(--line)] bg-[var(--surface-strong)] px-3 py-2 font-mono text-xs text-[var(--sea-ink)] outline-none ring-[var(--lagoon)] focus:ring-2"
              />
            ) : null}
          </section>

          <section className="island-shell rounded-2xl p-5">
            <details>
              <summary className="cursor-pointer text-lg font-semibold text-[var(--sea-ink)]">
                {messages.projectDetail.variablesTitle(
                  selectedEnvironment?.name ?? messages.projectDetail.noEnvironmentSelected,
                )}
              </summary>

              <div className="mt-4">
                <div className="flex flex-wrap items-center justify-end gap-3">
                  <select
                    value={variableScope}
                    onChange={(event) => setVariableScope(event.target.value as VariableScope)}
                    className="rounded-lg border border-[var(--line)] bg-[var(--surface-strong)] px-3 py-2 text-sm text-[var(--sea-ink)]"
                  >
                    <option value="env">{messages.projectDetail.environmentScope}</option>
                    <option value="global">{messages.projectDetail.globalScope}</option>
                  </select>
                </div>

                <form className="mt-4 grid gap-3 md:grid-cols-3" onSubmit={handleCreateVariable}>
                  <input
                    placeholder={messages.projectDetail.keyPlaceholder}
                    value={variableDraft.key}
                    onChange={(event) =>
                      setVariableDraft((current) => ({ ...current, key: event.target.value }))
                    }
                    className="rounded-lg border border-[var(--line)] bg-[var(--surface-strong)] px-3 py-2 text-sm text-[var(--sea-ink)] outline-none ring-[var(--lagoon)] focus:ring-2"
                    required
                  />
                  <input
                    placeholder={messages.projectDetail.valuePlaceholder}
                    value={variableDraft.value}
                    onChange={(event) =>
                      setVariableDraft((current) => ({ ...current, value: event.target.value }))
                    }
                    className="rounded-lg border border-[var(--line)] bg-[var(--surface-strong)] px-3 py-2 text-sm text-[var(--sea-ink)] outline-none ring-[var(--lagoon)] focus:ring-2"
                    required
                  />
                  <input
                    placeholder={messages.projectDetail.variableDescriptionPlaceholder}
                    value={variableDraft.description}
                    onChange={(event) =>
                      setVariableDraft((current) => ({
                        ...current,
                        description: event.target.value,
                      }))
                    }
                    className="rounded-lg border border-[var(--line)] bg-[var(--surface-strong)] px-3 py-2 text-sm text-[var(--sea-ink)] outline-none ring-[var(--lagoon)] focus:ring-2"
                  />
                  <button
                    type="submit"
                    className="md:col-span-3 rounded-lg border border-[rgba(50,143,151,0.35)] bg-[rgba(79,184,178,0.2)] px-3 py-2 text-sm font-semibold text-[var(--lagoon-deep)] transition hover:bg-[rgba(79,184,178,0.3)]"
                  >
                    {messages.projectDetail.addVariable}
                  </button>
                </form>

                <div className="mt-5 grid gap-4 xl:grid-cols-2">
                  <VariableList
                    title={messages.projectDetail.globalVariables}
                    variables={globalVariables}
                    editingVariableId={editingVariableId}
                    editingDraft={editingDraft}
                    onStartEdit={startEdit}
                    onEditingDraftChange={setEditingDraft}
                    onSaveEdit={handleSaveEdit}
                    onDelete={handleDeleteVariable}
                    onCancelEdit={() => setEditingVariableId('')}
                    messages={messages.variableList}
                  />
                  <VariableList
                    title={messages.projectDetail.environmentVariables}
                    variables={envVariables}
                    editingVariableId={editingVariableId}
                    editingDraft={editingDraft}
                    onStartEdit={startEdit}
                    onEditingDraftChange={setEditingDraft}
                    onSaveEdit={handleSaveEdit}
                    onDelete={handleDeleteVariable}
                    onCancelEdit={() => setEditingVariableId('')}
                    messages={messages.variableList}
                  />
                </div>
              </div>
            </details>
          </section>

          <section className="island-shell rounded-2xl p-5">
            <h2 className="m-0 text-lg font-semibold text-[var(--sea-ink)]">{messages.projectDetail.search}</h2>
            <form className="mt-3 flex flex-wrap gap-2" onSubmit={handleSearch}>
              <input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder={messages.projectDetail.searchPlaceholder}
                className="min-w-64 flex-1 rounded-lg border border-[var(--line)] bg-[var(--surface-strong)] px-3 py-2 text-sm text-[var(--sea-ink)] outline-none ring-[var(--lagoon)] focus:ring-2"
              />
              <button
                type="submit"
                className="rounded-lg border border-[rgba(50,143,151,0.35)] bg-[rgba(79,184,178,0.2)] px-3 py-2 text-sm font-semibold text-[var(--lagoon-deep)] transition hover:bg-[rgba(79,184,178,0.3)]"
              >
                {messages.projectDetail.searchButton}
              </button>
            </form>

            <ul className="mt-3 space-y-2 p-0">
              {searchResults.map((result) => (
                <li
                  key={result.id}
                  className="list-none rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm"
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
            <details>
              <summary className="cursor-pointer text-lg font-semibold text-[var(--sea-ink)]">
                {messages.projectDetail.versionHistory}
              </summary>

              <ul className="mt-3 space-y-3 p-0">
                {versions.slice(0, 30).map((version) => (
                  <li
                    key={version.id}
                    className="list-none rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 py-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="m-0 text-sm font-semibold text-[var(--sea-ink)]">
                        {version.eventType} - {version.key}
                      </p>
                      <button
                        type="button"
                        onClick={() => void handleRollback(version.id)}
                        className="rounded-lg border border-[var(--line)] bg-[var(--surface-strong)] px-2.5 py-1 text-xs font-semibold text-[var(--sea-ink)] transition hover:bg-[rgba(79,184,178,0.18)]"
                      >
                        {messages.projectDetail.rollback}
                      </button>
                    </div>
                    <p className="m-0 mt-1 text-xs text-[var(--sea-ink-soft)]">
                      {new Date(version.createdAtIso).toLocaleString(language === 'zh' ? 'zh-CN' : 'en-US')}
                    </p>
                    <details className="mt-2 text-xs text-[var(--sea-ink-soft)]">
                      <summary>{messages.projectDetail.snapshotJson}</summary>
                      <pre className="mt-2 overflow-auto rounded-md border border-[var(--line)] bg-[var(--surface)] p-2">
                        <code>{version.snapshotJson}</code>
                      </pre>
                    </details>
                  </li>
                ))}
              </ul>
            </details>
          </section>
        </div>
      </section>

      {toastMessage ? (
        <div
          role="status"
          aria-live="polite"
          className="fixed right-4 bottom-4 z-50 max-w-md rounded-lg border border-[rgba(50,143,151,0.35)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--sea-ink)] shadow-lg"
        >
          {toastMessage}
        </div>
      ) : null}
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
  messages: Messages['variableList']
}

function VariableList(props: VariableListProps) {
  return (
    <article className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-3">
      <h3 className="m-0 text-sm font-semibold text-[var(--sea-ink)]">{props.title}</h3>
      <ul className="mt-3 space-y-2 p-0">
        {props.variables.map((variable) => {
          const isEditing = props.editingVariableId === variable.id

          if (isEditing) {
            return (
              <li
                key={variable.id}
                className="list-none rounded-lg border border-[var(--line)] bg-[var(--surface-strong)] p-2"
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
                    {props.messages.save}
                  </button>
                  <button
                    type="button"
                    onClick={props.onCancelEdit}
                    className="rounded border border-[var(--line)] bg-[var(--surface)] px-2 py-1 text-xs"
                  >
                    {props.messages.cancel}
                  </button>
                </div>
              </li>
            )
          }

          return (
            <li
              key={variable.id}
              className="list-none rounded-lg border border-[var(--line)] bg-[var(--surface-strong)] p-2"
            >
              <p className="m-0 text-sm font-semibold text-[var(--sea-ink)]">{variable.key}</p>
              <p className="m-0 mt-1 text-sm text-[var(--sea-ink-soft)]">{variable.value}</p>
              {variable.description ? (
                <p className="m-0 mt-1 text-xs text-[var(--sea-ink-soft)]">{variable.description}</p>
              ) : null}
              <p className="m-0 mt-1 text-xs text-[var(--sea-ink-soft)]">
                {props.messages.versionPrefix}
                {variable.versionNo}
              </p>
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => props.onStartEdit(variable)}
                  className="rounded border border-[var(--line)] bg-[var(--surface)] px-2 py-1 text-xs"
                >
                  {props.messages.edit}
                </button>
                <button
                  type="button"
                  onClick={() => void props.onDelete(variable.id)}
                  className="rounded border border-red-300 bg-red-50 px-2 py-1 text-xs text-red-700"
                >
                  {props.messages.delete}
                </button>
              </div>
            </li>
          )
        })}
      </ul>
    </article>
  )
}
