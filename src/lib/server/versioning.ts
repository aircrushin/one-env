import type { Variable, VariableSnapshot, VersionSnapshot } from '../shared/types'

export function toVariableSnapshot(variable: Variable): VariableSnapshot {
  return {
    id: variable.id,
    scope: variable.scope,
    projectId: variable.projectId,
    environmentId: variable.environmentId,
    key: variable.key,
    value: variable.value,
    description: variable.description,
    versionNo: variable.versionNo,
    isActive: variable.isActive,
  }
}

export function createVersionSnapshot(input: {
  targetVariableId: string
  scope: Variable['scope']
  projectId: string
  environmentId: string
  key: string
  before: Variable | null
  after: Variable | null
}): VersionSnapshot {
  return {
    targetVariableId: input.targetVariableId,
    scope: input.scope,
    projectId: input.projectId,
    environmentId: input.environmentId,
    key: input.key,
    before: input.before ? toVariableSnapshot(input.before) : null,
    after: input.after ? toVariableSnapshot(input.after) : null,
  }
}

export function parseVersionSnapshot(snapshotJson: string): VersionSnapshot | null {
  try {
    const parsed = JSON.parse(snapshotJson) as VersionSnapshot
    if (!parsed || !parsed.targetVariableId || !parsed.scope || !parsed.key) {
      return null
    }
    return parsed
  } catch {
    return null
  }
}
