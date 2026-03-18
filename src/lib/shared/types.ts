export type RecordKind = 'project' | 'environment' | 'variable' | 'version_event'
export type VariableScope = 'global' | 'env'
export type VersionEventType =
  | 'create'
  | 'update'
  | 'delete'
  | 'rollback'
  | 'import'

export interface Project {
  id: string
  name: string
  description: string
  isActive: boolean
  createdAtIso: string
  updatedAtIso: string
}

export interface Environment {
  id: string
  projectId: string
  name: string
  description: string
  isActive: boolean
  createdAtIso: string
  updatedAtIso: string
}

export interface Variable {
  id: string
  scope: VariableScope
  projectId: string
  environmentId: string
  key: string
  value: string
  description: string
  versionNo: number
  isActive: boolean
  createdAtIso: string
  updatedAtIso: string
}

export interface VersionEvent {
  id: string
  eventType: VersionEventType
  scope: VariableScope
  projectId: string
  environmentId: string
  key: string
  snapshotJson: string
  createdAtIso: string
}

export interface ParsedEnvEntry {
  key: string
  value: string
}

export interface ExportResult {
  content: string
  items: Variable[]
}

export interface SearchResult {
  id: string
  key: string
  value: string
  description: string
  scope: VariableScope
  projectId: string
  environmentId: string
}

export interface SessionUser {
  username: 'admin'
}

export interface OneEnvRecord {
  pageId: string
  entityId: string
  title: string
  kind: RecordKind
  projectId: string
  projectName: string
  environmentId: string
  environmentName: string
  scope: '' | VariableScope
  key: string
  value: string
  description: string
  isActive: boolean
  versionNo: number
  eventType: '' | VersionEventType
  snapshotJson: string
  createdBy: string
  createdAtIso: string
  updatedAtIso: string
}

export interface VariableSnapshot {
  id: string
  scope: VariableScope
  projectId: string
  environmentId: string
  key: string
  value: string
  description: string
  versionNo: number
  isActive: boolean
}

export interface VersionSnapshot {
  targetVariableId: string
  scope: VariableScope
  projectId: string
  environmentId: string
  key: string
  before: VariableSnapshot | null
  after: VariableSnapshot | null
}
