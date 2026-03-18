import { createFileRoute } from '@tanstack/react-router'
import {
  clearSessionCookieValue,
  createSessionCookieValue,
  getSessionFromRequest,
  verifyAdminPassword,
} from '#/lib/server/auth'
import {
  AppError,
  createEnvironment,
  createProject,
  createVariable,
  deleteVariable,
  exportEnvContent,
  getSystemStatus,
  importEnvContent,
  listEnvironments,
  listProjects,
  listVariables,
  listVersionEvents,
  parseIncludeGlobalParam,
  rollbackVersion,
  searchVariables,
  updateProject,
  updateVariable,
} from '#/lib/server/oneenv-service'
import type { VariableScope } from '#/lib/shared/types'

function jsonResponse(payload: unknown, status = 200, headers?: HeadersInit): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...(headers ?? {}),
    },
  })
}

function errorResponse(error: unknown): Response {
  if (error instanceof AppError) {
    return jsonResponse({ error: error.message }, error.status)
  }

  const message = error instanceof Error ? error.message : 'Unexpected server error'
  return jsonResponse({ error: message }, 500)
}

async function readJsonBody(request: Request): Promise<Record<string, unknown>> {
  try {
    const parsed = (await request.json()) as Record<string, unknown>
    return parsed
  } catch {
    throw new AppError(400, 'Invalid JSON request body')
  }
}

function getPathSegments(request: Request): string[] {
  const url = new URL(request.url)
  const segments = url.pathname
    .replace(/^\/api\/v1\/?/, '')
    .split('/')
    .filter(Boolean)
  return segments
}

function requireAuth(request: Request): void {
  if (!getSessionFromRequest(request)) {
    throw new AppError(401, 'Unauthorized')
  }
}

async function handleGet(request: Request): Promise<Response> {
  const url = new URL(request.url)
  const segments = getPathSegments(request)

  if (segments.length === 2 && segments[0] === 'auth' && segments[1] === 'session') {
    const session = getSessionFromRequest(request)
    return jsonResponse({ authenticated: Boolean(session), user: session })
  }

  if (segments.length === 1 && segments[0] === 'status') {
    const status = await getSystemStatus()
    return jsonResponse(status)
  }

  requireAuth(request)

  if (segments.length === 1 && segments[0] === 'projects') {
    const projects = await listProjects()
    return jsonResponse({ items: projects })
  }

  if (
    segments.length === 3 &&
    segments[0] === 'projects' &&
    segments[2] === 'environments'
  ) {
    const environments = await listEnvironments(segments[1])
    return jsonResponse({ items: environments })
  }

  if (segments.length === 1 && segments[0] === 'variables') {
    const projectId = url.searchParams.get('projectId') ?? undefined
    const environmentId = url.searchParams.get('environmentId') ?? undefined
    const includeGlobal = parseIncludeGlobalParam(
      url.searchParams.get('includeGlobal'),
    )

    const variables = await listVariables({
      projectId,
      environmentId,
      includeGlobal,
    })
    return jsonResponse({ items: variables })
  }

  if (segments.length === 1 && segments[0] === 'env') {
    return jsonResponse({ error: 'Not found' }, 404)
  }

  if (segments.length === 2 && segments[0] === 'env' && segments[1] === 'export') {
    const projectId = url.searchParams.get('projectId')
    const environmentId = url.searchParams.get('environmentId')

    if (!projectId || !environmentId) {
      throw new AppError(400, 'projectId and environmentId are required')
    }

    const result = await exportEnvContent({ projectId, environmentId })
    return jsonResponse(result)
  }

  if (segments.length === 1 && segments[0] === 'search') {
    const query = url.searchParams.get('q') ?? ''
    const projectId = url.searchParams.get('projectId') ?? undefined
    const environmentId = url.searchParams.get('environmentId') ?? undefined

    const results = await searchVariables({
      query,
      projectId,
      environmentId,
    })

    return jsonResponse({ items: results })
  }

  if (segments.length === 1 && segments[0] === 'versions') {
    const projectId = url.searchParams.get('projectId') ?? undefined
    const environmentId = url.searchParams.get('environmentId') ?? undefined
    const key = url.searchParams.get('key') ?? undefined

    const versions = await listVersionEvents({ projectId, environmentId, key })
    return jsonResponse({ items: versions })
  }

  return jsonResponse({ error: 'Not found' }, 404)
}

async function handlePost(request: Request): Promise<Response> {
  const segments = getPathSegments(request)

  if (segments.length === 2 && segments[0] === 'auth' && segments[1] === 'login') {
    const body = await readJsonBody(request)
    const password = String(body.password ?? '')

    if (!password) {
      throw new AppError(400, 'Password is required')
    }

    if (!verifyAdminPassword(password)) {
      throw new AppError(401, 'Invalid password')
    }

    return jsonResponse(
      { authenticated: true },
      200,
      {
        'Set-Cookie': createSessionCookieValue(),
      },
    )
  }

  if (segments.length === 2 && segments[0] === 'auth' && segments[1] === 'logout') {
    return jsonResponse(
      { success: true },
      200,
      {
        'Set-Cookie': clearSessionCookieValue(),
      },
    )
  }

  requireAuth(request)

  if (segments.length === 1 && segments[0] === 'projects') {
    const body = await readJsonBody(request)
    const project = await createProject({
      name: String(body.name ?? ''),
      description: String(body.description ?? ''),
    })
    return jsonResponse(project, 201)
  }

  if (
    segments.length === 3 &&
    segments[0] === 'projects' &&
    segments[2] === 'environments'
  ) {
    const body = await readJsonBody(request)
    const environment = await createEnvironment({
      projectId: segments[1],
      name: String(body.name ?? ''),
      description: String(body.description ?? ''),
    })
    return jsonResponse(environment, 201)
  }

  if (segments.length === 1 && segments[0] === 'variables') {
    const body = await readJsonBody(request)
    const scopeRaw = String(body.scope ?? '')
    if (scopeRaw !== 'global' && scopeRaw !== 'env') {
      throw new AppError(400, 'Invalid scope')
    }
    const scope = scopeRaw as VariableScope

    const variable = await createVariable({
      scope,
      key: String(body.key ?? ''),
      value: String(body.value ?? ''),
      description: String(body.description ?? ''),
      projectId: body.projectId ? String(body.projectId) : undefined,
      environmentId: body.environmentId ? String(body.environmentId) : undefined,
    })
    return jsonResponse(variable, 201)
  }

  if (segments.length === 2 && segments[0] === 'env' && segments[1] === 'import') {
    const body = await readJsonBody(request)
    const scopeRaw = String(body.scope ?? '')
    if (scopeRaw !== 'global' && scopeRaw !== 'env') {
      throw new AppError(400, 'Invalid scope')
    }

    const result = await importEnvContent({
      scope: scopeRaw,
      content: String(body.content ?? ''),
      projectId: body.projectId ? String(body.projectId) : undefined,
      environmentId: body.environmentId ? String(body.environmentId) : undefined,
    })

    return jsonResponse(result)
  }

  if (
    segments.length === 3 &&
    segments[0] === 'versions' &&
    segments[2] === 'rollback'
  ) {
    const variable = await rollbackVersion(segments[1])
    return jsonResponse({ variable })
  }

  return jsonResponse({ error: 'Not found' }, 404)
}

async function handlePatch(request: Request): Promise<Response> {
  requireAuth(request)
  const segments = getPathSegments(request)

  if (segments.length === 2 && segments[0] === 'projects') {
    const body = await readJsonBody(request)
    const project = await updateProject(segments[1], {
      name: body.name !== undefined ? String(body.name) : undefined,
      description:
        body.description !== undefined ? String(body.description) : undefined,
    })

    return jsonResponse(project)
  }

  if (segments.length === 2 && segments[0] === 'variables') {
    const body = await readJsonBody(request)
    const variable = await updateVariable(segments[1], {
      key: body.key !== undefined ? String(body.key) : undefined,
      value: body.value !== undefined ? String(body.value) : undefined,
      description:
        body.description !== undefined ? String(body.description) : undefined,
    })

    return jsonResponse(variable)
  }

  return jsonResponse({ error: 'Not found' }, 404)
}

async function handleDelete(request: Request): Promise<Response> {
  requireAuth(request)
  const segments = getPathSegments(request)

  if (segments.length === 2 && segments[0] === 'variables') {
    await deleteVariable(segments[1])
    return jsonResponse({ success: true })
  }

  return jsonResponse({ error: 'Not found' }, 404)
}

export const Route = createFileRoute('/api/v1/$')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          return await handleGet(request)
        } catch (error) {
          return errorResponse(error)
        }
      },
      POST: async ({ request }) => {
        try {
          return await handlePost(request)
        } catch (error) {
          return errorResponse(error)
        }
      },
      PATCH: async ({ request }) => {
        try {
          return await handlePatch(request)
        } catch (error) {
          return errorResponse(error)
        }
      },
      DELETE: async ({ request }) => {
        try {
          return await handleDelete(request)
        } catch (error) {
          return errorResponse(error)
        }
      },
    },
  },
})
