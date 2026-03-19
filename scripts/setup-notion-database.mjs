#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'

const NOTION_VERSION = '2022-06-28'

const REQUIRED_SCHEMA = [
  { name: 'title', type: 'title', definition: { title: {} } },
  {
    name: 'kind',
    type: 'select',
    definition: {
      select: {
        options: [
          { name: 'project' },
          { name: 'environment' },
          { name: 'variable' },
          { name: 'version_event' },
        ],
      },
    },
  },
  { name: 'entity_id', type: 'rich_text', definition: { rich_text: {} } },
  { name: 'project_id', type: 'rich_text', definition: { rich_text: {} } },
  { name: 'project_name', type: 'rich_text', definition: { rich_text: {} } },
  { name: 'environment_id', type: 'rich_text', definition: { rich_text: {} } },
  { name: 'environment_name', type: 'rich_text', definition: { rich_text: {} } },
  {
    name: 'scope',
    type: 'select',
    definition: {
      select: {
        options: [{ name: 'global' }, { name: 'env' }],
      },
    },
  },
  { name: 'key', type: 'rich_text', definition: { rich_text: {} } },
  { name: 'value', type: 'rich_text', definition: { rich_text: {} } },
  { name: 'description', type: 'rich_text', definition: { rich_text: {} } },
  { name: 'is_active', type: 'checkbox', definition: { checkbox: {} } },
  { name: 'version_no', type: 'number', definition: { number: { format: 'number' } } },
  {
    name: 'event_type',
    type: 'select',
    definition: {
      select: {
        options: [
          { name: 'create' },
          { name: 'update' },
          { name: 'delete' },
          { name: 'rollback' },
          { name: 'import' },
        ],
      },
    },
  },
  { name: 'snapshot_json', type: 'rich_text', definition: { rich_text: {} } },
  { name: 'created_by', type: 'rich_text', definition: { rich_text: {} } },
  { name: 'created_at_iso', type: 'rich_text', definition: { rich_text: {} } },
  { name: 'updated_at_iso', type: 'rich_text', definition: { rich_text: {} } },
]

function parseArgs(argv) {
  const args = {
    databaseId: undefined,
    parentPageId: undefined,
    title: 'oneenv',
    checkOnly: false,
    help: false,
  }

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i]
    if (token === '--database-id') {
      args.databaseId = argv[i + 1]
      i += 1
    } else if (token === '--parent-page-id') {
      args.parentPageId = argv[i + 1]
      i += 1
    } else if (token === '--title') {
      args.title = argv[i + 1] ?? 'oneenv'
      i += 1
    } else if (token === '--check-only') {
      args.checkOnly = true
    } else if (token === '--help' || token === '-h') {
      args.help = true
    } else {
      throw new Error(`Unknown argument: ${token}`)
    }
  }

  return args
}

function stripWrappingQuotes(value) {
  const trimmed = value.trim()
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1)
  }
  return trimmed
}

function loadDotEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return
  }

  const content = fs.readFileSync(filePath, 'utf8')
  const lines = content.split(/\r?\n/)

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) {
      continue
    }

    const exportPrefix = trimmed.startsWith('export ')
    const assignment = exportPrefix ? trimmed.slice(7).trim() : trimmed
    const separatorIndex = assignment.indexOf('=')
    if (separatorIndex <= 0) {
      continue
    }

    const key = assignment.slice(0, separatorIndex).trim()
    if (!key || key in process.env) {
      continue
    }

    const rawValue = assignment.slice(separatorIndex + 1)
    process.env[key] = stripWrappingQuotes(rawValue)
  }
}

function printHelp() {
  const text = [
    'oneenv Notion schema bootstrapper',
    '',
    'Usage:',
    '  npm run notion:setup -- --parent-page-id <PAGE_ID>',
    '  npm run notion:setup -- --database-id <DATABASE_ID>',
    '  npm run notion:setup -- --database-id <DATABASE_ID> --check-only',
    '',
    'Env:',
    '  NOTION_API_TOKEN        required',
    '  NOTION_DATABASE_ID      optional (used when --database-id not passed)',
    '  NOTION_PARENT_PAGE_ID   optional (used when --parent-page-id not passed)',
    '',
    'Behavior:',
    '  - If database ID is provided, validate schema and add missing properties.',
    '  - If database ID is not provided, create a new database under parent page.',
  ].join('\n')

  console.log(text)
}

function normalizeNotionId(value) {
  if (!value) return ''
  const raw = value.trim()
  if (!raw) return ''

  const hyphenated = raw.match(
    /[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/,
  )
  if (hyphenated) {
    return hyphenated[0].toLowerCase()
  }

  const compactSource = raw.replace(/[^0-9a-fA-F]/g, '')
  const compact = compactSource.match(/[0-9a-fA-F]{32}/)
  if (!compact) {
    return raw
  }

  const hex = compact[0].toLowerCase()
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

async function notionRequest(token, method, path, body) {
  const response = await fetch(`https://api.notion.com/v1${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Notion-Version': NOTION_VERSION,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  })

  const text = await response.text()
  const payload = text ? JSON.parse(text) : null

  if (!response.ok) {
    throw new Error(
      `Notion API error (${response.status}): ${text || response.statusText}`,
    )
  }

  return payload
}

function getSchemaDefinition(name) {
  const found = REQUIRED_SCHEMA.find((item) => item.name === name)
  if (!found) {
    throw new Error(`Unknown schema key: ${name}`)
  }
  return found
}

function buildPropertiesObject(names) {
  const properties = {}
  for (const name of names) {
    properties[name] = getSchemaDefinition(name).definition
  }
  return properties
}

function analyzeTitleProperty(existingProperties) {
  const namedTitle = existingProperties.title
  if (namedTitle) {
    if (namedTitle.type === 'title') {
      return { status: 'ok', sourceKey: 'title' }
    }
    return { status: 'wrong_type', sourceKey: 'title' }
  }

  for (const [key, value] of Object.entries(existingProperties)) {
    if (value?.type === 'title') {
      return { status: 'rename_needed', sourceKey: key }
    }
  }

  return { status: 'missing', sourceKey: '' }
}

function validateSchema(existingProperties) {
  const missing = []
  const wrongType = []
  const selectOptionGaps = []
  let titleRenameFrom = ''

  for (const required of REQUIRED_SCHEMA) {
    if (required.name === 'title') {
      const titleAnalysis = analyzeTitleProperty(existingProperties)
      if (titleAnalysis.status === 'wrong_type') {
        wrongType.push({
          name: 'title',
          expected: 'title',
          actual: existingProperties.title?.type ?? 'unknown',
        })
      } else if (titleAnalysis.status === 'rename_needed') {
        missing.push('title')
        titleRenameFrom = titleAnalysis.sourceKey
      } else if (titleAnalysis.status === 'missing') {
        missing.push('title')
      }
      continue
    }

    const property = existingProperties[required.name]
    if (!property) {
      missing.push(required.name)
      continue
    }

    if (property.type !== required.type) {
      wrongType.push({
        name: required.name,
        expected: required.type,
        actual: property.type,
      })
      continue
    }

    if (required.type === 'select') {
      const current = new Set(
        (property.select?.options ?? []).map((option) => option.name),
      )
      const needed = (required.definition.select?.options ?? []).map(
        (option) => option.name,
      )
      const missingOptions = needed.filter((name) => !current.has(name))
      if (missingOptions.length > 0) {
        selectOptionGaps.push({
          name: required.name,
          existing: Array.from(current),
          missingOptions,
        })
      }
    }
  }

  return { missing, wrongType, selectOptionGaps, titleRenameFrom }
}

function printValidation(result) {
  if (result.missing.length === 0 && result.wrongType.length === 0 && result.selectOptionGaps.length === 0) {
    console.log('Schema check: OK')
    return
  }

  console.log('Schema check found issues:')
  if (result.missing.length > 0) {
    console.log(`- Missing properties: ${result.missing.join(', ')}`)
    if (result.titleRenameFrom) {
      console.log(
        `- Title property rename needed: "${result.titleRenameFrom}" -> "title"`,
      )
    }
  }
  if (result.wrongType.length > 0) {
    const message = result.wrongType
      .map((entry) => `${entry.name} (expected ${entry.expected}, got ${entry.actual})`)
      .join('; ')
    console.log(`- Type mismatches: ${message}`)
  }
  if (result.selectOptionGaps.length > 0) {
    const message = result.selectOptionGaps
      .map((entry) => `${entry.name} missing [${entry.missingOptions.join(', ')}]`)
      .join('; ')
    console.log(`- Select option gaps: ${message}`)
  }
}

async function createDatabase({ token, parentPageId, title }) {
  const properties = buildPropertiesObject(REQUIRED_SCHEMA.map((item) => item.name))

  const created = await notionRequest(token, 'POST', '/databases', {
    parent: { type: 'page_id', page_id: parentPageId },
    title: [
      {
        type: 'text',
        text: { content: title },
      },
    ],
    properties,
  })

  return created.id
}

function buildPatchFromValidation(validation, existingProperties) {
  const patch = {}
  const titleAnalysis = analyzeTitleProperty(existingProperties)

  for (const missingName of validation.missing) {
    if (missingName === 'title') {
      if (
        titleAnalysis.status === 'rename_needed' &&
        titleAnalysis.sourceKey
      ) {
        patch[titleAnalysis.sourceKey] = {
          name: 'title',
          title: {},
        }
      }
      continue
    }
    patch[missingName] = getSchemaDefinition(missingName).definition
  }

  for (const selectGap of validation.selectOptionGaps) {
    const existingNames = selectGap.existing
    const finalNames = [...new Set([...existingNames, ...selectGap.missingOptions])]
    patch[selectGap.name] = {
      select: {
        options: finalNames.map((name) => ({ name })),
      },
    }
  }

  return {
    patch,
    titleMissing: titleAnalysis.status === 'missing',
    titleWrongType: titleAnalysis.status === 'wrong_type',
    titleRenameFrom:
      titleAnalysis.status === 'rename_needed'
        ? titleAnalysis.sourceKey
        : '',
  }
}

async function syncExistingDatabase({ token, databaseId, checkOnly }) {
  const db = await notionRequest(token, 'GET', `/databases/${databaseId}`)
  const existingProperties = db.properties ?? {}

  const validation = validateSchema(existingProperties)
  printValidation(validation)

  const { patch, titleMissing, titleWrongType, titleRenameFrom } = buildPatchFromValidation(
    validation,
    existingProperties,
  )

  if (titleMissing || titleWrongType) {
    const actualType = titlePropertyType(existingProperties)
    throw new Error(
      actualType
        ? `Property "title" must be type "title", but got "${actualType}". Please fix this in Notion manually first.`
        : 'Missing required title property named "title". Rename your database title column to "title" in Notion.',
    )
  }

  if (validation.wrongType.length > 0) {
    const mismatches = validation.wrongType
      .map((entry) => `${entry.name}:${entry.actual}->${entry.expected}`)
      .join(', ')
    throw new Error(
      `Type mismatches must be fixed manually in Notion: ${mismatches}`,
    )
  }

  const patchKeys = Object.keys(patch)
  if (patchKeys.length === 0 || checkOnly) {
    return
  }

  if (titleRenameFrom) {
    console.log(`Renaming title property "${titleRenameFrom}" -> "title"...`)
  }

  await notionRequest(token, 'PATCH', `/databases/${databaseId}`, {
    properties: patch,
  })

  console.log(`Patched properties: ${patchKeys.join(', ')}`)

  const refreshed = await notionRequest(token, 'GET', `/databases/${databaseId}`)
  const recheck = validateSchema(refreshed.properties ?? {})
  if (recheck.missing.length > 0 || recheck.wrongType.length > 0 || recheck.selectOptionGaps.length > 0) {
    printValidation(recheck)
    throw new Error('Schema sync incomplete. Please review issues above.')
  }

  console.log('Schema sync complete.')
}

function titlePropertyType(properties) {
  if (!properties.title) return ''
  return properties.title.type || ''
}

async function main() {
  loadDotEnvFile(path.resolve(process.cwd(), '.env'))

  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    printHelp()
    return
  }

  const token = process.env.NOTION_API_TOKEN?.trim()
  if (!token) {
    throw new Error('NOTION_API_TOKEN is required.')
  }

  const databaseId = normalizeNotionId(
    args.databaseId || process.env.NOTION_DATABASE_ID || '',
  )
  const parentPageId = normalizeNotionId(
    args.parentPageId || process.env.NOTION_PARENT_PAGE_ID || '',
  )

  if (databaseId) {
    await syncExistingDatabase({
      token,
      databaseId,
      checkOnly: args.checkOnly,
    })
    console.log(`Use this in .env: NOTION_DATABASE_ID=${databaseId}`)
    return
  }

  if (!parentPageId) {
    throw new Error(
      'Provide --database-id (or NOTION_DATABASE_ID) to sync an existing DB, or --parent-page-id (or NOTION_PARENT_PAGE_ID) to create a new DB.',
    )
  }

  const createdId = await createDatabase({
    token,
    parentPageId,
    title: args.title,
  })

  console.log(`Created Notion database: ${createdId}`)
  console.log(`Use this in .env: NOTION_DATABASE_ID=${createdId}`)
}

main().catch((error) => {
  console.error(error.message)
  process.exitCode = 1
})
