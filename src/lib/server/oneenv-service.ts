import { randomUUID } from 'node:crypto'
import { parseEnvContent, serializeEnvEntries, mergeVariablesForExport } from '../shared/env'
import type {
  Environment,
  ExportResult,
  OneEnvRecord,
  Project,
  SearchResult,
  Variable,
  VariableScope,
  VersionEvent,
  VersionEventType,
} from '../shared/types'
import { getRepository, isNotionConfigured } from './repository'
import { createVersionSnapshot, parseVersionSnapshot } from './versioning'

const ADMIN_NAME = 'admin'
const KEY_PATTERN = /^[A-Za-z_][A-Za-z0-9_.-]*$/

export class AppError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message)
  }
}

function nowIso(): string {
  return new Date().toISOString()
}

function toProject(record: OneEnvRecord): Project {
  return {
    id: record.entityId,
    name: record.projectName,
    description: record.description,
    isActive: record.isActive,
    createdAtIso: record.createdAtIso,
    updatedAtIso: record.updatedAtIso,
  }
}

function toEnvironment(record: OneEnvRecord): Environment {
  return {
    id: record.entityId,
    projectId: record.projectId,
    name: record.environmentName,
    description: record.description,
    isActive: record.isActive,
    createdAtIso: record.createdAtIso,
    updatedAtIso: record.updatedAtIso,
  }
}

function toVariable(record: OneEnvRecord): Variable {
  return {
    id: record.entityId,
    scope: record.scope === 'global' ? 'global' : 'env',
    projectId: record.projectId,
    environmentId: record.environmentId,
    key: record.key,
    value: record.value,
    description: record.description,
    versionNo: record.versionNo,
    isActive: record.isActive,
    createdAtIso: record.createdAtIso,
    updatedAtIso: record.updatedAtIso,
  }
}

function toVersionEvent(record: OneEnvRecord): VersionEvent {
  return {
    id: record.entityId,
    eventType: record.eventType || 'update',
    scope: record.scope === 'global' ? 'global' : 'env',
    projectId: record.projectId,
    environmentId: record.environmentId,
    key: record.key,
    snapshotJson: record.snapshotJson,
    createdAtIso: record.createdAtIso,
  }
}

function createBaseRecord(input: {
  entityId?: string
  title: string
  kind: OneEnvRecord['kind']
  projectId?: string
  projectName?: string
  environmentId?: string
  environmentName?: string
  scope?: '' | VariableScope
  key?: string
  value?: string
  description?: string
  versionNo?: number
  eventType?: '' | VersionEventType
  snapshotJson?: string
}): Omit<OneEnvRecord, 'pageId'> {
  const timestamp = nowIso()
  return {
    entityId: input.entityId ?? randomUUID(),
    title: input.title,
    kind: input.kind,
    projectId: input.projectId ?? '',
    projectName: input.projectName ?? '',
    environmentId: input.environmentId ?? '',
    environmentName: input.environmentName ?? '',
    scope: input.scope ?? '',
    key: input.key ?? '',
    value: input.value ?? '',
    description: input.description ?? '',
    isActive: true,
    versionNo: input.versionNo ?? 0,
    eventType: input.eventType ?? '',
    snapshotJson: input.snapshotJson ?? '',
    createdBy: ADMIN_NAME,
    createdAtIso: timestamp,
    updatedAtIso: timestamp,
  }
}

async function getAllRecords(): Promise<OneEnvRecord[]> {
  const repository = getRepository()
  return repository.list()
}

function ensureKeyValid(key: string): void {
  if (!KEY_PATTERN.test(key)) {
    throw new AppError(400, 'Invalid key format')
  }
}

async function writeVersionEvent(input: {
  eventType: VersionEventType
  scope: VariableScope
  projectId: string
  projectName: string
  environmentId: string
  environmentName: string
  key: string
  targetVariableId: string
  before: Variable | null
  after: Variable | null
}): Promise<void> {
  const repository = getRepository()
  const snapshot = createVersionSnapshot({
    targetVariableId: input.targetVariableId,
    scope: input.scope,
    projectId: input.projectId,
    environmentId: input.environmentId,
    key: input.key,
    before: input.before,
    after: input.after,
  })

  await repository.create(
    createBaseRecord({
      title: `version:${input.key}:${input.eventType}`,
      kind: 'version_event',
      projectId: input.projectId,
      projectName: input.projectName,
      environmentId: input.environmentId,
      environmentName: input.environmentName,
      scope: input.scope,
      key: input.key,
      eventType: input.eventType,
      snapshotJson: JSON.stringify(snapshot),
    }),
  )
}

async function ensureProject(projectId: string): Promise<Project> {
  const records = await getAllRecords()
  const projectRecord = records.find(
    (record) =>
      record.kind === 'project' &&
      record.entityId === projectId &&
      record.isActive,
  )

  if (!projectRecord) {
    throw new AppError(404, 'Project not found')
  }

  return toProject(projectRecord)
}

async function ensureEnvironment(
  projectId: string,
  environmentId: string,
): Promise<Environment> {
  const records = await getAllRecords()
  const envRecord = records.find(
    (record) =>
      record.kind === 'environment' &&
      record.entityId === environmentId &&
      record.projectId === projectId &&
      record.isActive,
  )

  if (!envRecord) {
    throw new AppError(404, 'Environment not found')
  }

  return toEnvironment(envRecord)
}

async function findVariableForScope(input: {
  scope: VariableScope
  key: string
  projectId: string
  environmentId: string
}): Promise<OneEnvRecord | undefined> {
  const records = await getAllRecords()

  return records.find((record) => {
    if (record.kind !== 'variable' || !record.isActive || record.key !== input.key) {
      return false
    }

    if (input.scope === 'global') {
      return record.scope === 'global'
    }

    return (
      record.scope === 'env' &&
      record.projectId === input.projectId &&
      record.environmentId === input.environmentId
    )
  })
}

function normalizeQueryBoolean(value: string | null, fallback: boolean): boolean {
  if (value == null) {
    return fallback
  }
  return value === 'true'
}

export function parseIncludeGlobalParam(value: string | null): boolean {
  return normalizeQueryBoolean(value, true)
}

export async function getSystemStatus(): Promise<{
  storage: 'notion' | 'memory'
}> {
  return {
    storage: isNotionConfigured() ? 'notion' : 'memory',
  }
}

export async function listProjects(): Promise<Project[]> {
  const records = await getAllRecords()
  return records
    .filter((record) => record.kind === 'project' && record.isActive)
    .map((record) => toProject(record))
    .sort((a, b) => a.name.localeCompare(b.name))
}

export async function createProject(input: {
  name: string
  description?: string
}): Promise<Project> {
  const name = input.name.trim()
  if (!name) {
    throw new AppError(400, 'Project name is required')
  }

  const records = await getAllRecords()
  const exists = records.some(
    (record) =>
      record.kind === 'project' &&
      record.isActive &&
      record.projectName.toLowerCase() === name.toLowerCase(),
  )

  if (exists) {
    throw new AppError(409, 'Project name already exists')
  }

  const repository = getRepository()
  const projectId = randomUUID()
  const created = await repository.create(
    createBaseRecord({
      entityId: projectId,
      title: `project:${name}`,
      kind: 'project',
      projectId,
      projectName: name,
      description: input.description?.trim() ?? '',
    }),
  )

  return toProject(created)
}

export async function updateProject(
  projectId: string,
  input: { name?: string; description?: string },
): Promise<Project> {
  const records = await getAllRecords()
  const existing = records.find(
    (record) =>
      record.kind === 'project' &&
      record.entityId === projectId &&
      record.isActive,
  )

  if (!existing) {
    throw new AppError(404, 'Project not found')
  }

  const nextName = input.name?.trim() || existing.projectName
  const nextDescription =
    input.description !== undefined ? input.description.trim() : existing.description

  const duplicate = records.some(
    (record) =>
      record.kind === 'project' &&
      record.entityId !== projectId &&
      record.isActive &&
      record.projectName.toLowerCase() === nextName.toLowerCase(),
  )

  if (duplicate) {
    throw new AppError(409, 'Project name already exists')
  }

  const repository = getRepository()
  const updated = await repository.updateByEntityId(projectId, {
    title: `project:${nextName}`,
    projectName: nextName,
    description: nextDescription,
    updatedAtIso: nowIso(),
  })

  if (!updated) {
    throw new AppError(404, 'Project not found')
  }

  return toProject(updated)
}

export async function listEnvironments(projectId: string): Promise<Environment[]> {
  await ensureProject(projectId)
  const records = await getAllRecords()

  return records
    .filter(
      (record) =>
        record.kind === 'environment' &&
        record.projectId === projectId &&
        record.isActive,
    )
    .map((record) => toEnvironment(record))
    .sort((a, b) => a.name.localeCompare(b.name))
}

export async function createEnvironment(input: {
  projectId: string
  name: string
  description?: string
}): Promise<Environment> {
  const project = await ensureProject(input.projectId)
  const name = input.name.trim()

  if (!name) {
    throw new AppError(400, 'Environment name is required')
  }

  const records = await getAllRecords()
  const duplicate = records.some(
    (record) =>
      record.kind === 'environment' &&
      record.isActive &&
      record.projectId === input.projectId &&
      record.environmentName.toLowerCase() === name.toLowerCase(),
  )

  if (duplicate) {
    throw new AppError(409, 'Environment name already exists')
  }

  const repository = getRepository()
  const environmentId = randomUUID()
  const created = await repository.create(
    createBaseRecord({
      entityId: environmentId,
      title: `env:${project.name}:${name}`,
      kind: 'environment',
      projectId: input.projectId,
      projectName: project.name,
      environmentId,
      environmentName: name,
      description: input.description?.trim() ?? '',
    }),
  )

  return toEnvironment(created)
}

export async function listVariables(input: {
  projectId?: string
  environmentId?: string
  includeGlobal?: boolean
}): Promise<Variable[]> {
  const includeGlobal = input.includeGlobal ?? true
  const records = await getAllRecords()

  const output = records.filter((record) => {
    if (record.kind !== 'variable' || !record.isActive) {
      return false
    }

    if (record.scope === 'global') {
      return includeGlobal
    }

    if (!input.projectId || !input.environmentId) {
      return false
    }

    return (
      record.projectId === input.projectId &&
      record.environmentId === input.environmentId
    )
  })

  return output.map((record) => toVariable(record)).sort((a, b) => a.key.localeCompare(b.key))
}

export async function createVariable(input: {
  scope: VariableScope
  key: string
  value: string
  description?: string
  projectId?: string
  environmentId?: string
}): Promise<Variable> {
  const key = input.key.trim()
  ensureKeyValid(key)

  let projectId = ''
  let projectName = ''
  let environmentId = ''
  let environmentName = ''

  if (input.scope === 'env') {
    if (!input.projectId || !input.environmentId) {
      throw new AppError(400, 'projectId and environmentId are required for env scope')
    }
    const project = await ensureProject(input.projectId)
    const environment = await ensureEnvironment(input.projectId, input.environmentId)
    projectId = project.id
    projectName = project.name
    environmentId = environment.id
    environmentName = environment.name
  }

  const existing = await findVariableForScope({
    scope: input.scope,
    key,
    projectId,
    environmentId,
  })

  if (existing) {
    throw new AppError(409, 'Variable key already exists')
  }

  const entityId = randomUUID()
  const repository = getRepository()
  const created = await repository.create(
    createBaseRecord({
      entityId,
      title: `var:${key}:${input.scope}`,
      kind: 'variable',
      projectId,
      projectName,
      environmentId,
      environmentName,
      scope: input.scope,
      key,
      value: input.value,
      description: input.description?.trim() ?? '',
      versionNo: 1,
    }),
  )

  const createdVariable = toVariable(created)

  await writeVersionEvent({
    eventType: 'create',
    scope: input.scope,
    projectId,
    projectName,
    environmentId,
    environmentName,
    key,
    targetVariableId: entityId,
    before: null,
    after: createdVariable,
  })

  return createdVariable
}

export async function updateVariable(
  variableId: string,
  input: {
    key?: string
    value?: string
    description?: string
  },
): Promise<Variable> {
  const records = await getAllRecords()
  const existingRecord = records.find(
    (record) =>
      record.kind === 'variable' &&
      record.entityId === variableId &&
      record.isActive,
  )

  if (!existingRecord) {
    throw new AppError(404, 'Variable not found')
  }

  const before = toVariable(existingRecord)
  const key = input.key?.trim() ?? existingRecord.key
  ensureKeyValid(key)

  if (key !== existingRecord.key) {
    const duplicate = records.some((record) => {
      if (record.kind !== 'variable' || !record.isActive || record.entityId === variableId) {
        return false
      }
      if (record.key !== key || record.scope !== existingRecord.scope) {
        return false
      }
      if (record.scope === 'global') {
        return true
      }
      return (
        record.projectId === existingRecord.projectId &&
        record.environmentId === existingRecord.environmentId
      )
    })

    if (duplicate) {
      throw new AppError(409, 'Variable key already exists')
    }
  }

  const repository = getRepository()
  const updated = await repository.updateByEntityId(variableId, {
    key,
    title: `var:${key}:${existingRecord.scope}`,
    value: input.value ?? existingRecord.value,
    description:
      input.description !== undefined
        ? input.description.trim()
        : existingRecord.description,
    versionNo: existingRecord.versionNo + 1,
    updatedAtIso: nowIso(),
  })

  if (!updated) {
    throw new AppError(404, 'Variable not found')
  }

  const after = toVariable(updated)

  await writeVersionEvent({
    eventType: 'update',
    scope: after.scope,
    projectId: after.projectId,
    projectName: existingRecord.projectName,
    environmentId: after.environmentId,
    environmentName: existingRecord.environmentName,
    key: after.key,
    targetVariableId: after.id,
    before,
    after,
  })

  return after
}

export async function deleteVariable(variableId: string): Promise<void> {
  const records = await getAllRecords()
  const existingRecord = records.find(
    (record) =>
      record.kind === 'variable' &&
      record.entityId === variableId &&
      record.isActive,
  )

  if (!existingRecord) {
    throw new AppError(404, 'Variable not found')
  }

  const before = toVariable(existingRecord)
  const repository = getRepository()
  const updated = await repository.updateByEntityId(variableId, {
    isActive: false,
    versionNo: existingRecord.versionNo + 1,
    updatedAtIso: nowIso(),
  })

  if (!updated) {
    throw new AppError(404, 'Variable not found')
  }

  await writeVersionEvent({
    eventType: 'delete',
    scope: before.scope,
    projectId: before.projectId,
    projectName: existingRecord.projectName,
    environmentId: before.environmentId,
    environmentName: existingRecord.environmentName,
    key: before.key,
    targetVariableId: before.id,
    before,
    after: null,
  })
}

export async function importEnvContent(input: {
  scope: VariableScope
  content: string
  projectId?: string
  environmentId?: string
}): Promise<{ created: number; updated: number; skipped: number; total: number }> {
  const entries = parseEnvContent(input.content)

  if (entries.length === 0) {
    throw new AppError(400, 'No valid env entries found')
  }

  let project: Project | null = null
  let environment: Environment | null = null

  if (input.scope === 'env') {
    if (!input.projectId || !input.environmentId) {
      throw new AppError(400, 'projectId and environmentId are required for env scope')
    }
    project = await ensureProject(input.projectId)
    environment = await ensureEnvironment(input.projectId, input.environmentId)
  }

  const records = await getAllRecords()
  const activeVariables = records.filter(
    (record) => record.kind === 'variable' && record.isActive,
  )

  const repository = getRepository()

  let created = 0
  let updated = 0
  let skipped = 0

  for (const entry of entries) {
    ensureKeyValid(entry.key)

    const existing = activeVariables.find((record) => {
      if (record.key !== entry.key || record.scope !== input.scope) {
        return false
      }
      if (input.scope === 'global') {
        return true
      }
      return (
        record.projectId === input.projectId &&
        record.environmentId === input.environmentId
      )
    })

    if (!existing) {
      const createdRecord = await repository.create(
        createBaseRecord({
          title: `var:${entry.key}:${input.scope}`,
          kind: 'variable',
          projectId: input.scope === 'env' ? project?.id ?? '' : '',
          projectName: input.scope === 'env' ? project?.name ?? '' : '',
          environmentId: input.scope === 'env' ? environment?.id ?? '' : '',
          environmentName: input.scope === 'env' ? environment?.name ?? '' : '',
          scope: input.scope,
          key: entry.key,
          value: entry.value,
          description: '',
          versionNo: 1,
        }),
      )

      const after = toVariable(createdRecord)

      await writeVersionEvent({
        eventType: 'import',
        scope: after.scope,
        projectId: after.projectId,
        projectName: createdRecord.projectName,
        environmentId: after.environmentId,
        environmentName: createdRecord.environmentName,
        key: after.key,
        targetVariableId: after.id,
        before: null,
        after,
      })

      created += 1
      activeVariables.push(createdRecord)
      continue
    }

    if (existing.value === entry.value) {
      skipped += 1
      continue
    }

    const before = toVariable(existing)
    const changed = await repository.updateByEntityId(existing.entityId, {
      value: entry.value,
      versionNo: existing.versionNo + 1,
      updatedAtIso: nowIso(),
    })

    if (!changed) {
      skipped += 1
      continue
    }

    const after = toVariable(changed)
    await writeVersionEvent({
      eventType: 'import',
      scope: after.scope,
      projectId: after.projectId,
      projectName: changed.projectName,
      environmentId: after.environmentId,
      environmentName: changed.environmentName,
      key: after.key,
      targetVariableId: after.id,
      before,
      after,
    })

    updated += 1

    const index = activeVariables.findIndex(
      (record) => record.entityId === changed.entityId,
    )
    if (index >= 0) {
      activeVariables[index] = changed
    }
  }

  return {
    created,
    updated,
    skipped,
    total: entries.length,
  }
}

export async function exportEnvContent(input: {
  projectId: string
  environmentId: string
}): Promise<ExportResult> {
  await ensureProject(input.projectId)
  await ensureEnvironment(input.projectId, input.environmentId)

  const records = await getAllRecords()
  const globalVariables = records
    .filter(
      (record) =>
        record.kind === 'variable' &&
        record.isActive &&
        record.scope === 'global',
    )
    .map((record) => toVariable(record))

  const envVariables = records
    .filter(
      (record) =>
        record.kind === 'variable' &&
        record.isActive &&
        record.scope === 'env' &&
        record.projectId === input.projectId &&
        record.environmentId === input.environmentId,
    )
    .map((record) => toVariable(record))

  const merged = mergeVariablesForExport(globalVariables, envVariables)
  const content =
    `# Generated by oneenv at ${nowIso()}\n` +
    serializeEnvEntries(merged.map((item) => ({ key: item.key, value: item.value })))

  return {
    content,
    items: merged,
  }
}

export async function searchVariables(input: {
  query: string
  projectId?: string
  environmentId?: string
}): Promise<SearchResult[]> {
  const query = input.query.trim().toLowerCase()
  if (!query) {
    return []
  }

  const records = await getAllRecords()
  const variables = records.filter(
    (record) => record.kind === 'variable' && record.isActive,
  )

  const filteredByScope = variables.filter((record) => {
    if (!input.projectId && !input.environmentId) {
      return true
    }

    if (record.scope === 'global') {
      return true
    }

    if (!input.projectId || !input.environmentId) {
      return false
    }

    return (
      record.projectId === input.projectId &&
      record.environmentId === input.environmentId
    )
  })

  return filteredByScope
    .filter((record) => {
      const haystack = `${record.key} ${record.value} ${record.description}`.toLowerCase()
      return haystack.includes(query)
    })
    .map((record) => ({
      id: record.entityId,
      key: record.key,
      value: record.value,
      description: record.description,
      scope: record.scope === 'global' ? 'global' : 'env',
      projectId: record.projectId,
      environmentId: record.environmentId,
    }))
    .sort((a, b) => a.key.localeCompare(b.key))
}

export async function listVersionEvents(input: {
  projectId?: string
  environmentId?: string
  key?: string
}): Promise<VersionEvent[]> {
  const records = await getAllRecords()
  const filtered = records.filter((record) => {
    if (record.kind !== 'version_event' || !record.isActive) {
      return false
    }

    if (input.projectId && record.projectId !== input.projectId) {
      return false
    }

    if (input.environmentId && record.environmentId !== input.environmentId) {
      return false
    }

    if (input.key && record.key !== input.key) {
      return false
    }

    return true
  })

  return filtered
    .map((record) => toVersionEvent(record))
    .sort((a, b) => b.createdAtIso.localeCompare(a.createdAtIso))
}

export async function rollbackVersion(versionEventId: string): Promise<Variable | null> {
  const records = await getAllRecords()
  const eventRecord = records.find(
    (record) =>
      record.kind === 'version_event' &&
      record.entityId === versionEventId &&
      record.isActive,
  )

  if (!eventRecord) {
    throw new AppError(404, 'Version event not found')
  }

  const snapshot = parseVersionSnapshot(eventRecord.snapshotJson)
  if (!snapshot) {
    throw new AppError(400, 'Version snapshot is invalid')
  }

  const repository = getRepository()
  const variableRecord = records.find(
    (record) =>
      record.kind === 'variable' &&
      record.entityId === snapshot.targetVariableId,
  )

  const beforeRollback = variableRecord ? toVariable(variableRecord) : null
  let afterRollback: Variable | null = null

  if (snapshot.before === null && snapshot.after !== null) {
    if (!variableRecord) {
      throw new AppError(404, 'Target variable not found')
    }

    const updated = await repository.updateByEntityId(variableRecord.entityId, {
      isActive: false,
      versionNo: variableRecord.versionNo + 1,
      updatedAtIso: nowIso(),
    })

    if (!updated) {
      throw new AppError(404, 'Target variable not found')
    }
    afterRollback = toVariable(updated)
  } else if (snapshot.before !== null && snapshot.after === null) {
    if (!variableRecord) {
      const restored = await repository.create(
        createBaseRecord({
          entityId: snapshot.targetVariableId,
          title: `var:${snapshot.before.key}:${snapshot.before.scope}`,
          kind: 'variable',
          projectId: snapshot.before.projectId,
          environmentId: snapshot.before.environmentId,
          scope: snapshot.before.scope,
          key: snapshot.before.key,
          value: snapshot.before.value,
          description: snapshot.before.description,
          versionNo: snapshot.before.versionNo + 1,
        }),
      )
      afterRollback = toVariable(restored)
    } else {
      const updated = await repository.updateByEntityId(variableRecord.entityId, {
        title: `var:${snapshot.before.key}:${snapshot.before.scope}`,
        projectId: snapshot.before.projectId,
        environmentId: snapshot.before.environmentId,
        scope: snapshot.before.scope,
        key: snapshot.before.key,
        value: snapshot.before.value,
        description: snapshot.before.description,
        isActive: true,
        versionNo: variableRecord.versionNo + 1,
        updatedAtIso: nowIso(),
      })
      if (!updated) {
        throw new AppError(404, 'Target variable not found')
      }
      afterRollback = toVariable(updated)
    }
  } else if (snapshot.before !== null && snapshot.after !== null) {
    if (!variableRecord) {
      throw new AppError(404, 'Target variable not found')
    }

    const updated = await repository.updateByEntityId(variableRecord.entityId, {
      title: `var:${snapshot.before.key}:${snapshot.before.scope}`,
      projectId: snapshot.before.projectId,
      environmentId: snapshot.before.environmentId,
      scope: snapshot.before.scope,
      key: snapshot.before.key,
      value: snapshot.before.value,
      description: snapshot.before.description,
      isActive: snapshot.before.isActive,
      versionNo: variableRecord.versionNo + 1,
      updatedAtIso: nowIso(),
    })

    if (!updated) {
      throw new AppError(404, 'Target variable not found')
    }

    afterRollback = toVariable(updated)
  } else {
    throw new AppError(400, 'Unsupported snapshot state')
  }

  await writeVersionEvent({
    eventType: 'rollback',
    scope: snapshot.scope,
    projectId: snapshot.projectId,
    projectName: eventRecord.projectName,
    environmentId: snapshot.environmentId,
    environmentName: eventRecord.environmentName,
    key: snapshot.key,
    targetVariableId: snapshot.targetVariableId,
    before: beforeRollback,
    after: afterRollback,
  })

  return afterRollback
}
