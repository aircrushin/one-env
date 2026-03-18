import { createHash, createHmac, timingSafeEqual } from 'node:crypto'
import type { SessionUser } from '../shared/types'

const SESSION_COOKIE_NAME = 'oneenv_session'
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7

type SessionPayload = {
  sub: 'admin'
  exp: number
}

function getSessionSecret(): string {
  return process.env.ONEENV_SESSION_SECRET ?? 'oneenv-dev-secret-change-me'
}

function base64UrlEncode(input: string): string {
  return Buffer.from(input, 'utf8').toString('base64url')
}

function base64UrlDecode(input: string): string {
  return Buffer.from(input, 'base64url').toString('utf8')
}

function sign(payloadB64: string): string {
  return createHmac('sha256', getSessionSecret())
    .update(payloadB64)
    .digest('base64url')
}

function safeEqual(a: string, b: string): boolean {
  const first = Buffer.from(a)
  const second = Buffer.from(b)
  if (first.length !== second.length) {
    return false
  }
  return timingSafeEqual(first, second)
}

export function hashPassword(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

export function verifyAdminPassword(password: string): boolean {
  const expectedHash = process.env.ONEENV_ADMIN_PASSWORD_HASH
  const expectedPlain = process.env.ONEENV_ADMIN_PASSWORD

  if (expectedHash) {
    return safeEqual(hashPassword(password), expectedHash)
  }

  if (expectedPlain) {
    return safeEqual(password, expectedPlain)
  }

  return false
}

export function createSessionToken(): string {
  const payload: SessionPayload = {
    sub: 'admin',
    exp: Date.now() + SESSION_TTL_MS,
  }
  const payloadB64 = base64UrlEncode(JSON.stringify(payload))
  const signature = sign(payloadB64)
  return `${payloadB64}.${signature}`
}

export function verifySessionToken(token: string): SessionUser | null {
  const [payloadB64, signature] = token.split('.')
  if (!payloadB64 || !signature) {
    return null
  }

  const expectedSignature = sign(payloadB64)
  if (!safeEqual(signature, expectedSignature)) {
    return null
  }

  try {
    const payload = JSON.parse(base64UrlDecode(payloadB64)) as SessionPayload
    if (payload.sub !== 'admin' || payload.exp < Date.now()) {
      return null
    }
    return { username: 'admin' }
  } catch {
    return null
  }
}

function parseCookieHeader(cookieHeader: string | null): Record<string, string> {
  if (!cookieHeader) {
    return {}
  }

  const cookies: Record<string, string> = {}
  for (const segment of cookieHeader.split(';')) {
    const [name, ...rest] = segment.trim().split('=')
    if (!name || rest.length === 0) {
      continue
    }
    cookies[name] = rest.join('=')
  }
  return cookies
}

export function getSessionFromRequest(request: Request): SessionUser | null {
  const cookieHeader = request.headers.get('cookie')
  const cookies = parseCookieHeader(cookieHeader)
  const token = cookies[SESSION_COOKIE_NAME]
  if (!token) {
    return null
  }
  return verifySessionToken(token)
}

export function createSessionCookieValue(): string {
  const token = createSessionToken()
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : ''
  return `${SESSION_COOKIE_NAME}=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=604800${secure}`
}

export function clearSessionCookieValue(): string {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : ''
  return `${SESSION_COOKIE_NAME}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0${secure}`
}
