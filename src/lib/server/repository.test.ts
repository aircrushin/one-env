import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { OneEnvRecord } from '../shared/types'

const originalEnv = {
  notionToken: process.env.NOTION_API_TOKEN,
  notionDatabaseId: process.env.NOTION_DATABASE_ID,
  notionCacheTtl: process.env.NOTION_LIST_CACHE_TTL_MS,
}

function setupNotionEnv(): void {
  process.env.NOTION_API_TOKEN = 'test-token'
  process.env.NOTION_DATABASE_ID = 'test-db'
  process.env.NOTION_LIST_CACHE_TTL_MS = '60000'
}

function response(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

function makeNotionPage(input: {
  pageId: string
  entityId: string
  key?: string
  value?: string
  versionNo?: number
}): { id: string; properties: Record<string, unknown> } {
  return {
    id: input.pageId,
    properties: {
      title: { title: [{ plain_text: `var:${input.key ?? 'API_URL'}:env` }] },
      kind: { select: { name: 'variable' } },
      entity_id: { rich_text: [{ plain_text: input.entityId }] },
      project_id: { rich_text: [{ plain_text: 'project-1' }] },
      project_name: { rich_text: [{ plain_text: 'Project 1' }] },
      environment_id: { rich_text: [{ plain_text: 'env-1' }] },
      environment_name: { rich_text: [{ plain_text: 'Env 1' }] },
      scope: { select: { name: 'env' } },
      key: { rich_text: [{ plain_text: input.key ?? 'API_URL' }] },
      value: { rich_text: [{ plain_text: input.value ?? 'https://old.example.com' }] },
      description: { rich_text: [] },
      is_active: { checkbox: true },
      version_no: { number: input.versionNo ?? 1 },
      event_type: { select: null },
      snapshot_json: { rich_text: [] },
      created_by: { rich_text: [{ plain_text: 'admin' }] },
      created_at_iso: { rich_text: [{ plain_text: '2024-01-01T00:00:00.000Z' }] },
      updated_at_iso: { rich_text: [{ plain_text: '2024-01-01T00:00:00.000Z' }] },
    },
  }
}

function makeRecord(entityId: string): Omit<OneEnvRecord, 'pageId'> {
  return {
    entityId,
    title: `var:API_URL:env`,
    kind: 'variable',
    projectId: 'project-1',
    projectName: 'Project 1',
    environmentId: 'env-1',
    environmentName: 'Env 1',
    scope: 'env',
    key: 'API_URL',
    value: 'https://new.example.com',
    description: '',
    isActive: true,
    versionNo: 1,
    eventType: '',
    snapshotJson: '',
    createdBy: 'admin',
    createdAtIso: '2024-01-01T00:00:00.000Z',
    updatedAtIso: '2024-01-01T00:00:00.000Z',
  }
}

beforeEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.resetModules()
  delete process.env.NOTION_API_TOKEN
  delete process.env.NOTION_DATABASE_ID
  delete process.env.NOTION_LIST_CACHE_TTL_MS
})

afterAll(() => {
  process.env.NOTION_API_TOKEN = originalEnv.notionToken
  process.env.NOTION_DATABASE_ID = originalEnv.notionDatabaseId
  process.env.NOTION_LIST_CACHE_TTL_MS = originalEnv.notionCacheTtl
})

describe('NotionRepository caching and update path', () => {
  it('reuses list cache for repeated reads', async () => {
    setupNotionEnv()
    const fetchMock = vi.fn(async () =>
      response({
        results: [makeNotionPage({ pageId: 'page-1', entityId: 'var-1' })],
        has_more: false,
        next_cursor: null,
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const { getRepository } = await import('./repository')
    const repository = getRepository()

    const first = await repository.list()
    const second = await repository.list()

    expect(first).toHaveLength(1)
    expect(second).toHaveLength(1)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('invalidates list cache after create', async () => {
    setupNotionEnv()
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        response({
          results: [makeNotionPage({ pageId: 'page-1', entityId: 'var-1' })],
          has_more: false,
          next_cursor: null,
        }),
      )
      .mockResolvedValueOnce(
        response(makeNotionPage({ pageId: 'page-2', entityId: 'var-2' })),
      )
      .mockResolvedValueOnce(
        response({
          results: [
            makeNotionPage({ pageId: 'page-1', entityId: 'var-1' }),
            makeNotionPage({ pageId: 'page-2', entityId: 'var-2' }),
          ],
          has_more: false,
          next_cursor: null,
        }),
      )

    vi.stubGlobal('fetch', fetchMock)

    const { getRepository } = await import('./repository')
    const repository = getRepository()

    await repository.list()
    await repository.create(makeRecord('var-2'))
    const refreshed = await repository.list()

    expect(refreshed.map((record) => record.entityId)).toEqual(['var-1', 'var-2'])
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('updates by entity id with filtered query and single patch', async () => {
    setupNotionEnv()
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        response({
          results: [makeNotionPage({ pageId: 'page-1', entityId: 'var-1' })],
          has_more: false,
          next_cursor: null,
        }),
      )
      .mockResolvedValueOnce(
        response(
          makeNotionPage({
            pageId: 'page-1',
            entityId: 'var-1',
            value: 'https://updated.example.com',
            versionNo: 2,
          }),
        ),
      )

    vi.stubGlobal('fetch', fetchMock)

    const { getRepository } = await import('./repository')
    const repository = getRepository()
    const updated = await repository.updateByEntityId('var-1', {
      value: 'https://updated.example.com',
      versionNo: 2,
    })

    expect(updated?.value).toBe('https://updated.example.com')
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/databases/test-db/query')
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain('/pages/page-1')

    const queryPayload = JSON.parse(
      String((fetchMock.mock.calls[0]?.[1] as RequestInit).body),
    ) as {
      filter?: { property?: string; rich_text?: { equals?: string } }
    }
    expect(queryPayload.filter?.property).toBe('entity_id')
    expect(queryPayload.filter?.rich_text?.equals).toBe('var-1')
  })

  it('uses cached page id when available for updateByEntityId', async () => {
    setupNotionEnv()
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        response({
          results: [makeNotionPage({ pageId: 'page-1', entityId: 'var-1' })],
          has_more: false,
          next_cursor: null,
        }),
      )
      .mockResolvedValueOnce(
        response(
          makeNotionPage({
            pageId: 'page-1',
            entityId: 'var-1',
            value: 'https://cached-update.example.com',
            versionNo: 2,
          }),
        ),
      )

    vi.stubGlobal('fetch', fetchMock)

    const { getRepository } = await import('./repository')
    const repository = getRepository()

    await repository.list()
    const updated = await repository.updateByEntityId('var-1', {
      value: 'https://cached-update.example.com',
    })

    expect(updated?.value).toBe('https://cached-update.example.com')
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain('/pages/page-1')
  })
})
