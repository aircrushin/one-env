import { randomUUID } from 'node:crypto'
import type {
  OneEnvRecord,
  RecordKind,
  VariableScope,
  VersionEventType,
} from '../shared/types'

type RecordPatch = Partial<Omit<OneEnvRecord, 'pageId' | 'entityId'>>

const DEFAULT_NOTION_LIST_CACHE_TTL_MS = 5_000
const DEFAULT_REDIS_KEY_PREFIX = 'oneenv'

type NotionPage = {
  id: string
  properties?: Record<string, unknown>
}

type NotionListCacheStore = {
  getList(databaseId: string): Promise<OneEnvRecord[] | null>
  setList(databaseId: string, records: OneEnvRecord[], ttlMs: number): Promise<void>
  invalidateList(databaseId: string): Promise<void>
}

type RedisClient = {
  connect: () => Promise<void>
  get: (key: string) => Promise<string | null>
  set: (key: string, value: string, options?: { EX?: number }): Promise<unknown>
  del: (key: string) => Promise<number>
  on?: (event: string, listener: (...args: unknown[]) => void) => unknown
}

type RedisModule = {
  createClient?: (options: { url: string }) => RedisClient
}

export interface OneEnvRepository {
  list(): Promise<OneEnvRecord[]>
  create(record: Omit<OneEnvRecord, 'pageId'>): Promise<OneEnvRecord>
  updateByEntityId(
    entityId: string,
    patch: RecordPatch,
  ): Promise<OneEnvRecord | null>
}

let memoryRecords: OneEnvRecord[] = []

class InMemoryRepository implements OneEnvRepository {
  async list(): Promise<OneEnvRecord[]> {
    return memoryRecords.map((record) => ({ ...record }))
  }

  async create(record: Omit<OneEnvRecord, 'pageId'>): Promise<OneEnvRecord> {
    const created: OneEnvRecord = {
      ...record,
      pageId: randomUUID(),
    }
    memoryRecords.push(created)
    return { ...created }
  }

  async updateByEntityId(
    entityId: string,
    patch: RecordPatch,
  ): Promise<OneEnvRecord | null> {
    const index = memoryRecords.findIndex((item) => item.entityId === entityId)
    if (index < 0) {
      return null
    }

    const next: OneEnvRecord = {
      ...memoryRecords[index],
      ...patch,
    }

    memoryRecords[index] = next
    return { ...next }
  }
}

function getTitle(property: unknown): string {
  const value = property as { title?: Array<{ plain_text?: string }> }
  return value.title?.map((item) => item.plain_text ?? '').join('') ?? ''
}

function getRichText(property: unknown): string {
  const value = property as { rich_text?: Array<{ plain_text?: string }> }
  return value.rich_text?.map((item) => item.plain_text ?? '').join('') ?? ''
}

function getSelect(property: unknown): string {
  const value = property as { select?: { name?: string } | null }
  return value.select?.name ?? ''
}

function getCheckbox(property: unknown): boolean {
  const value = property as { checkbox?: boolean }
  return Boolean(value.checkbox)
}

function getNumber(property: unknown): number {
  const value = property as { number?: number | null }
  return typeof value.number === 'number' ? value.number : 0
}

function richText(content: string): { rich_text: Array<{ type: 'text'; text: { content: string } }> } {
  return {
    rich_text: [{ type: 'text', text: { content } }],
  }
}

function title(content: string): { title: Array<{ type: 'text'; text: { content: string } }> } {
  return {
    title: [{ type: 'text', text: { content } }],
  }
}

function buildCreateProperties(
  record: Omit<OneEnvRecord, 'pageId'>,
): Record<string, unknown> {
  return {
    title: title(record.title),
    kind: { select: { name: record.kind } },
    entity_id: richText(record.entityId),
    project_id: richText(record.projectId),
    project_name: richText(record.projectName),
    environment_id: richText(record.environmentId),
    environment_name: richText(record.environmentName),
    scope: record.scope ? { select: { name: record.scope } } : { select: null },
    key: richText(record.key),
    value: richText(record.value),
    description: richText(record.description),
    is_active: { checkbox: record.isActive },
    version_no: { number: record.versionNo },
    event_type: record.eventType
      ? { select: { name: record.eventType } }
      : { select: null },
    snapshot_json: richText(record.snapshotJson),
    created_by: richText(record.createdBy),
    created_at_iso: richText(record.createdAtIso),
    updated_at_iso: richText(record.updatedAtIso),
  }
}

function buildPatchProperties(patch: RecordPatch): Record<string, unknown> {
  const properties: Record<string, unknown> = {}

  if (patch.title !== undefined) {
    properties.title = title(patch.title)
  }
  if (patch.kind !== undefined) {
    properties.kind = { select: { name: patch.kind } }
  }
  if (patch.projectId !== undefined) {
    properties.project_id = richText(patch.projectId)
  }
  if (patch.projectName !== undefined) {
    properties.project_name = richText(patch.projectName)
  }
  if (patch.environmentId !== undefined) {
    properties.environment_id = richText(patch.environmentId)
  }
  if (patch.environmentName !== undefined) {
    properties.environment_name = richText(patch.environmentName)
  }
  if (patch.scope !== undefined) {
    properties.scope = patch.scope ? { select: { name: patch.scope } } : { select: null }
  }
  if (patch.key !== undefined) {
    properties.key = richText(patch.key)
  }
  if (patch.value !== undefined) {
    properties.value = richText(patch.value)
  }
  if (patch.description !== undefined) {
    properties.description = richText(patch.description)
  }
  if (patch.isActive !== undefined) {
    properties.is_active = { checkbox: patch.isActive }
  }
  if (patch.versionNo !== undefined) {
    properties.version_no = { number: patch.versionNo }
  }
  if (patch.eventType !== undefined) {
    properties.event_type = patch.eventType
      ? { select: { name: patch.eventType } }
      : { select: null }
  }
  if (patch.snapshotJson !== undefined) {
    properties.snapshot_json = richText(patch.snapshotJson)
  }
  if (patch.createdBy !== undefined) {
    properties.created_by = richText(patch.createdBy)
  }
  if (patch.createdAtIso !== undefined) {
    properties.created_at_iso = richText(patch.createdAtIso)
  }
  if (patch.updatedAtIso !== undefined) {
    properties.updated_at_iso = richText(patch.updatedAtIso)
  }

  return properties
}

function mapPageToRecord(page: {
  id: string
  properties?: Record<string, unknown>
}): OneEnvRecord {
  const props = page.properties ?? {}

  const kind = (getSelect(props.kind) || 'project') as RecordKind
  const scope = getSelect(props.scope)
  const eventType = getSelect(props.event_type)

  return {
    pageId: page.id,
    entityId: getRichText(props.entity_id),
    title: getTitle(props.title),
    kind,
    projectId: getRichText(props.project_id),
    projectName: getRichText(props.project_name),
    environmentId: getRichText(props.environment_id),
    environmentName: getRichText(props.environment_name),
    scope: (scope || '') as '' | VariableScope,
    key: getRichText(props.key),
    value: getRichText(props.value),
    description: getRichText(props.description),
    isActive: getCheckbox(props.is_active),
    versionNo: getNumber(props.version_no),
    eventType: (eventType || '') as '' | VersionEventType,
    snapshotJson: getRichText(props.snapshot_json),
    createdBy: getRichText(props.created_by),
    createdAtIso: getRichText(props.created_at_iso),
    updatedAtIso: getRichText(props.updated_at_iso),
  }
}

function parseNotionListCacheTtlMs(rawValue: string | undefined): number {
  if (!rawValue) {
    return DEFAULT_NOTION_LIST_CACHE_TTL_MS
  }

  const parsed = Number.parseInt(rawValue, 10)
  if (!Number.isFinite(parsed) || parsed < 0) {
    return DEFAULT_NOTION_LIST_CACHE_TTL_MS
  }

  return parsed
}

function getRedisUrlFromEnv(): string | null {
  const value = process.env.ONEENV_REDIS_URL ?? process.env.REDIS_URL
  if (!value) {
    return null
  }

  const normalized = value.trim()
  return normalized ? normalized : null
}

function getRedisKeyPrefixFromEnv(): string {
  const value = process.env.ONEENV_REDIS_KEY_PREFIX
  if (!value) {
    return DEFAULT_REDIS_KEY_PREFIX
  }

  const normalized = value.trim()
  return normalized || DEFAULT_REDIS_KEY_PREFIX
}

function isOneEnvRecord(value: unknown): value is OneEnvRecord {
  if (!value || typeof value !== 'object') {
    return false
  }

  const candidate = value as Partial<OneEnvRecord>
  return typeof candidate.pageId === 'string' && typeof candidate.entityId === 'string'
}

class RedisNotionListCacheStore implements NotionListCacheStore {
  private readonly clientPromise: Promise<RedisClient | null>

  constructor(
    private readonly redisUrl: string,
    private readonly keyPrefix: string,
  ) {
    this.clientPromise = this.connectClient()
  }

  private listCacheKey(databaseId: string): string {
    return `${this.keyPrefix}:notion:list:${databaseId}`
  }

  private async connectClient(): Promise<RedisClient | null> {
    try {
      const moduleName = 'redis'
      const redisModule = (await import(moduleName)) as RedisModule
      if (!redisModule.createClient) {
        console.warn('[oneenv] redis package is missing createClient export, skip redis cache')
        return null
      }

      const client = redisModule.createClient({ url: this.redisUrl })
      client.on?.('error', (error: unknown) => {
        const message = error instanceof Error ? error.message : String(error)
        console.error(`[oneenv] redis cache runtime error: ${message}`)
      })
      await client.connect()
      return client
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.warn(`[oneenv] redis cache disabled, fallback to memory cache: ${message}`)
      return null
    }
  }

  async getList(databaseId: string): Promise<OneEnvRecord[] | null> {
    const client = await this.clientPromise
    if (!client) {
      return null
    }

    try {
      const cacheKey = this.listCacheKey(databaseId)
      const raw = await client.get(cacheKey)
      if (!raw) {
        return null
      }

      const parsed = JSON.parse(raw) as unknown
      if (!Array.isArray(parsed)) {
        return null
      }

      const records = parsed.filter(isOneEnvRecord)
      return records.length === parsed.length ? records : null
    } catch {
      return null
    }
  }

  async setList(
    databaseId: string,
    records: OneEnvRecord[],
    ttlMs: number,
  ): Promise<void> {
    const client = await this.clientPromise
    if (!client || ttlMs <= 0) {
      return
    }

    const ttlSeconds = Math.max(1, Math.ceil(ttlMs / 1_000))
    try {
      const cacheKey = this.listCacheKey(databaseId)
      await client.set(cacheKey, JSON.stringify(records), { EX: ttlSeconds })
    } catch {
      // Keep request path resilient even when cache writes fail.
    }
  }

  async invalidateList(databaseId: string): Promise<void> {
    const client = await this.clientPromise
    if (!client) {
      return
    }

    try {
      const cacheKey = this.listCacheKey(databaseId)
      await client.del(cacheKey)
    } catch {
      // Best-effort invalidation to avoid breaking writes.
    }
  }
}

let sharedNotionListCacheStore: NotionListCacheStore | null | undefined

function getNotionListCacheStore(): NotionListCacheStore | null {
  if (sharedNotionListCacheStore !== undefined) {
    return sharedNotionListCacheStore
  }

  const redisUrl = getRedisUrlFromEnv()
  if (!redisUrl) {
    sharedNotionListCacheStore = null
    return sharedNotionListCacheStore
  }

  sharedNotionListCacheStore = new RedisNotionListCacheStore(
    redisUrl,
    getRedisKeyPrefixFromEnv(),
  )

  return sharedNotionListCacheStore
}

class NotionRepository implements OneEnvRepository {
  private listCache: {
    records: OneEnvRecord[]
    expiresAt: number
  } | null = null
  private listInFlight: {
    revision: number
    promise: Promise<OneEnvRecord[]>
  } | null = null
  private cacheRevision = 0

  constructor(
    private readonly token: string,
    private readonly databaseId: string,
    private readonly listCacheTtlMs = parseNotionListCacheTtlMs(
      process.env.NOTION_LIST_CACHE_TTL_MS,
    ),
    private readonly listCacheStore: NotionListCacheStore | null = null,
  ) {}

  private async notionFetch(path: string, init?: RequestInit): Promise<Response> {
    const response = await fetch(`https://api.notion.com/v1${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json',
        ...(init?.headers ?? {}),
      },
    })

    if (!response.ok) {
      const text = await response.text()
      throw new Error(`Notion API error (${response.status}): ${text}`)
    }

    return response
  }

  private cloneRecords(records: OneEnvRecord[]): OneEnvRecord[] {
    return records.map((record) => ({ ...record }))
  }

  private setLocalListCache(records: OneEnvRecord[]): void {
    if (this.listCacheTtlMs <= 0) {
      this.listCache = null
      return
    }

    this.listCache = {
      records,
      expiresAt: Date.now() + this.listCacheTtlMs,
    }
  }

  private async invalidateListCache(): Promise<void> {
    this.cacheRevision += 1
    this.listCache = null
    if (!this.listCacheStore) {
      return
    }

    await this.listCacheStore.invalidateList(this.databaseId)
  }

  private async getCachedListFromStore(): Promise<OneEnvRecord[] | null> {
    if (!this.listCacheStore || this.listCacheTtlMs <= 0) {
      return null
    }

    return this.listCacheStore.getList(this.databaseId)
  }

  private async getCachedRecordByEntityId(
    entityId: string,
  ): Promise<OneEnvRecord | null> {
    const cache = this.listCache
    if (cache && cache.expiresAt > Date.now()) {
      return cache.records.find((record) => record.entityId === entityId) ?? null
    }

    const sharedCachedList = await this.getCachedListFromStore()
    if (!sharedCachedList) {
      return null
    }

    this.setLocalListCache(sharedCachedList)
    return sharedCachedList.find((record) => record.entityId === entityId) ?? null
  }

  private async queryPages(body: Record<string, unknown>): Promise<{
    results: NotionPage[]
    hasMore: boolean
    nextCursor?: string
  }> {
    const response = await this.notionFetch(
      `/databases/${this.databaseId}/query`,
      {
        method: 'POST',
        body: JSON.stringify(body),
      },
    )

    const json = (await response.json()) as {
      results: NotionPage[]
      has_more: boolean
      next_cursor: string | null
    }

    return {
      results: json.results,
      hasMore: json.has_more,
      nextCursor: json.next_cursor ?? undefined,
    }
  }

  private async fetchAllPages(): Promise<NotionPage[]> {
    const pages: NotionPage[] = []
    let hasMore = true
    let startCursor: string | undefined

    while (hasMore) {
      const body: Record<string, unknown> = { page_size: 100 }
      if (startCursor) {
        body.start_cursor = startCursor
      }

      const chunk = await this.queryPages(body)
      pages.push(...chunk.results)
      hasMore = chunk.hasMore
      startCursor = chunk.nextCursor
    }

    return pages
  }

  private async findPageByEntityId(entityId: string): Promise<NotionPage | null> {
    const chunk = await this.queryPages({
      page_size: 1,
      filter: {
        property: 'entity_id',
        rich_text: { equals: entityId },
      },
    })

    return chunk.results[0] ?? null
  }

  async list(): Promise<OneEnvRecord[]> {
    const cache = this.listCache
    if (cache && cache.expiresAt > Date.now()) {
      return this.cloneRecords(cache.records)
    }

    const currentInFlight = this.listInFlight
    if (currentInFlight && currentInFlight.revision === this.cacheRevision) {
      const records = await currentInFlight.promise
      return this.cloneRecords(records)
    }

    const revision = this.cacheRevision
    const promise = (async () => {
      const sharedCachedList = await this.getCachedListFromStore()
      if (sharedCachedList && revision === this.cacheRevision) {
        this.setLocalListCache(sharedCachedList)
        return sharedCachedList
      }

      const pages = await this.fetchAllPages()
      const records = pages
        .map((page) => mapPageToRecord(page))
        .filter((record) => Boolean(record.entityId))

      if (revision === this.cacheRevision) {
        this.setLocalListCache(records)
        if (this.listCacheStore && this.listCacheTtlMs > 0) {
          await this.listCacheStore.setList(
            this.databaseId,
            records,
            this.listCacheTtlMs,
          )
        }
      }

      return records
    })()

    const inFlight = { revision, promise }
    this.listInFlight = inFlight

    try {
      const records = await promise
      return this.cloneRecords(records)
    } finally {
      if (this.listInFlight === inFlight) {
        this.listInFlight = null
      }
    }
  }

  async create(record: Omit<OneEnvRecord, 'pageId'>): Promise<OneEnvRecord> {
    const response = await this.notionFetch('/pages', {
      method: 'POST',
      body: JSON.stringify({
        parent: { database_id: this.databaseId },
        properties: buildCreateProperties(record),
      }),
    })

    const json = (await response.json()) as {
      id: string
      properties?: Record<string, unknown>
    }

    await this.invalidateListCache()
    return mapPageToRecord(json)
  }

  async updateByEntityId(
    entityId: string,
    patch: RecordPatch,
  ): Promise<OneEnvRecord | null> {
    const cached = await this.getCachedRecordByEntityId(entityId)
    const targetPage = cached
      ? { id: cached.pageId }
      : await this.findPageByEntityId(entityId)

    if (!targetPage) {
      return null
    }

    const response = await this.notionFetch(`/pages/${targetPage.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ properties: buildPatchProperties(patch) }),
    })

    const json = (await response.json()) as NotionPage
    await this.invalidateListCache()
    return mapPageToRecord(json)
  }
}

let sharedRepository: OneEnvRepository | null = null

export function getRepository(): OneEnvRepository {
  if (sharedRepository) {
    return sharedRepository
  }

  const token = process.env.NOTION_API_TOKEN
  const databaseId = process.env.NOTION_DATABASE_ID

  if (token && databaseId) {
    sharedRepository = new NotionRepository(
      token,
      databaseId,
      parseNotionListCacheTtlMs(process.env.NOTION_LIST_CACHE_TTL_MS),
      getNotionListCacheStore(),
    )
    return sharedRepository
  }

  sharedRepository = new InMemoryRepository()
  return sharedRepository
}

export function isNotionConfigured(): boolean {
  return Boolean(process.env.NOTION_API_TOKEN && process.env.NOTION_DATABASE_ID)
}
