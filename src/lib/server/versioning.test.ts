import { describe, expect, it } from 'vitest'
import type { Variable } from '../shared/types'
import { createVersionSnapshot, parseVersionSnapshot, toVariableSnapshot } from './versioning'

function makeVariable(overrides: Partial<Variable> = {}): Variable {
  return {
    id: overrides.id ?? 'var-1',
    scope: overrides.scope ?? 'env',
    projectId: overrides.projectId ?? 'project-1',
    environmentId: overrides.environmentId ?? 'env-1',
    key: overrides.key ?? 'API_URL',
    value: overrides.value ?? 'https://example.com',
    description: overrides.description ?? 'desc',
    versionNo: overrides.versionNo ?? 1,
    isActive: overrides.isActive ?? true,
    createdAtIso: overrides.createdAtIso ?? new Date().toISOString(),
    updatedAtIso: overrides.updatedAtIso ?? new Date().toISOString(),
  }
}

describe('versioning helpers', () => {
  it('converts a variable into a serializable snapshot', () => {
    const variable = makeVariable({ key: 'TOKEN', value: 'abc' })
    expect(toVariableSnapshot(variable)).toEqual({
      id: 'var-1',
      scope: 'env',
      projectId: 'project-1',
      environmentId: 'env-1',
      key: 'TOKEN',
      value: 'abc',
      description: 'desc',
      versionNo: 1,
      isActive: true,
    })
  })

  it('creates and parses rollback snapshots', () => {
    const before = makeVariable({ value: 'old-value', versionNo: 2 })
    const after = makeVariable({ value: 'new-value', versionNo: 3 })

    const snapshot = createVersionSnapshot({
      targetVariableId: 'var-1',
      scope: 'env',
      projectId: 'project-1',
      environmentId: 'env-1',
      key: 'API_URL',
      before,
      after,
    })

    const parsed = parseVersionSnapshot(JSON.stringify(snapshot))
    expect(parsed).not.toBeNull()
    expect(parsed?.before?.value).toBe('old-value')
    expect(parsed?.after?.value).toBe('new-value')
  })

  it('returns null for invalid snapshot json', () => {
    expect(parseVersionSnapshot('not-json')).toBeNull()
    expect(parseVersionSnapshot('{"foo":1}')).toBeNull()
  })
})
