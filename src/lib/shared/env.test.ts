import { describe, expect, it } from 'vitest'
import { mergeVariablesForExport, parseEnvContent, serializeEnvEntries } from './env'
import type { Variable } from './types'

describe('parseEnvContent', () => {
  it('parses export prefix, comments, and quoted values', () => {
    const parsed = parseEnvContent(`
# comment
export API_URL=https://api.example.com
TOKEN="hello world"
SINGLE='quoted value'
PLAIN=abc # trailing comment
`)

    expect(parsed).toEqual([
      { key: 'API_URL', value: 'https://api.example.com' },
      { key: 'TOKEN', value: 'hello world' },
      { key: 'SINGLE', value: 'quoted value' },
      { key: 'PLAIN', value: 'abc' },
    ])
  })

  it('supports multiline quoted values', () => {
    const parsed = parseEnvContent('MULTI="line1\nline2"\nCERT="-----BEGIN\nABC\n-----END"\n')

    expect(parsed).toEqual([
      { key: 'MULTI', value: 'line1\nline2' },
      { key: 'CERT', value: '-----BEGIN\nABC\n-----END' },
    ])
  })
})

describe('serializeEnvEntries', () => {
  it('quotes values when needed', () => {
    const output = serializeEnvEntries([
      { key: 'A', value: '1' },
      { key: 'B', value: 'hello world' },
      { key: 'C', value: 'line1\nline2' },
    ])

    expect(output).toContain('A=1')
    expect(output).toContain('B=hello world')
    expect(output).toContain('C="line1\\nline2"')
  })
})

function makeVariable(input: Partial<Variable> & Pick<Variable, 'id' | 'key' | 'value'>): Variable {
  return {
    id: input.id,
    scope: input.scope ?? 'env',
    projectId: input.projectId ?? 'p1',
    environmentId: input.environmentId ?? 'e1',
    key: input.key,
    value: input.value,
    description: input.description ?? '',
    versionNo: input.versionNo ?? 1,
    isActive: input.isActive ?? true,
    createdAtIso: input.createdAtIso ?? new Date().toISOString(),
    updatedAtIso: input.updatedAtIso ?? new Date().toISOString(),
  }
}

describe('mergeVariablesForExport', () => {
  it('gives environment variables higher precedence than global', () => {
    const globals = [
      makeVariable({ id: 'g1', key: 'API_URL', value: 'https://global.example.com', scope: 'global' }),
      makeVariable({ id: 'g2', key: 'LOG_LEVEL', value: 'info', scope: 'global' }),
    ]

    const envs = [
      makeVariable({ id: 'e1', key: 'API_URL', value: 'https://prod.example.com', scope: 'env' }),
    ]

    const merged = mergeVariablesForExport(globals, envs)

    expect(merged).toHaveLength(2)
    expect(merged.find((item) => item.key === 'API_URL')?.value).toBe('https://prod.example.com')
    expect(merged.find((item) => item.key === 'LOG_LEVEL')?.value).toBe('info')
  })
})
