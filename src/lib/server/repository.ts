import { randomUUID } from 'node:crypto'
import type {
  OneEnvRecord,
  RecordKind,
  VariableScope,
  VersionEventType,
} from '../shared/types'

type RecordPatch = Partial<Omit<OneEnvRecord, 'pageId' | 'entityId'>>

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

class NotionRepository implements OneEnvRepository {
  constructor(
    private readonly token: string,
    private readonly databaseId: string,
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

  async list(): Promise<OneEnvRecord[]> {
    const pages: Array<{ id: string; properties?: Record<string, unknown> }> = []
    let hasMore = true
    let startCursor: string | undefined

    while (hasMore) {
      const body: Record<string, unknown> = { page_size: 100 }
      if (startCursor) {
        body.start_cursor = startCursor
      }

      const response = await this.notionFetch(
        `/databases/${this.databaseId}/query`,
        {
          method: 'POST',
          body: JSON.stringify(body),
        },
      )

      const json = (await response.json()) as {
        results: Array<{ id: string; properties?: Record<string, unknown> }>
        has_more: boolean
        next_cursor: string | null
      }

      pages.push(...json.results)
      hasMore = json.has_more
      startCursor = json.next_cursor ?? undefined
    }

    return pages
      .map((page) => mapPageToRecord(page))
      .filter((record) => Boolean(record.entityId))
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

    return mapPageToRecord(json)
  }

  async updateByEntityId(
    entityId: string,
    patch: RecordPatch,
  ): Promise<OneEnvRecord | null> {
    const all = await this.list()
    const target = all.find((record) => record.entityId === entityId)
    if (!target) {
      return null
    }

    await this.notionFetch(`/pages/${target.pageId}`, {
      method: 'PATCH',
      body: JSON.stringify({ properties: buildPatchProperties(patch) }),
    })

    const refreshed = await this.list()
    return refreshed.find((record) => record.entityId === entityId) ?? null
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
    sharedRepository = new NotionRepository(token, databaseId)
    return sharedRepository
  }

  sharedRepository = new InMemoryRepository()
  return sharedRepository
}

export function isNotionConfigured(): boolean {
  return Boolean(process.env.NOTION_API_TOKEN && process.env.NOTION_DATABASE_ID)
}
