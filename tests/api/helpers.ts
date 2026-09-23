import type { FastifyInstance } from 'fastify'
import { openDatabase, type DB } from '../../server/db/connection'
import { seedIfEmpty } from '../../server/db/seed'
import { buildApp } from '../../server/app'
import { DEFAULT_CONFIG, type AppConfig } from '../../server/env'

export interface TestApp {
  app: FastifyInstance
  db: DB
  config: AppConfig
}

export async function makeApp(overrides: Partial<AppConfig> = {}): Promise<TestApp> {
  const db = openDatabase(':memory:')
  seedIfEmpty(db)
  const config: AppConfig = { ...DEFAULT_CONFIG, ...overrides }
  const app = await buildApp(db, config)
  return { app, db, config }
}

/** 从 inject 响应提取 set-cookie。 */
export function responseCookies(res: { cookies: Array<{ name: string; value: string }> }): Record<string, string> {
  const out: Record<string, string> = {}
  for (const c of res.cookies) out[c.name] = c.value
  return out
}

export function cookieHeader(jar: Record<string, string>): string {
  return Object.entries(jar)
    .map(([k, v]) => `${k}=${v}`)
    .join('; ')
}

/** mock 登录并返回会话 cookie jar。 */
export async function mockLogin(app: FastifyInstance, deviceId?: string): Promise<Record<string, string>> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/mock',
    ...(deviceId ? { headers: { cookie: `wp_device=${deviceId}` } } : {}),
  })
  if (res.statusCode !== 200) throw new Error(`mock login failed: ${res.statusCode} ${res.body}`)
  const jar = responseCookies(res)
  if (deviceId) jar.wp_device = deviceId
  return jar
}

export async function getJSON<T = unknown>(app: FastifyInstance, jar: Record<string, string>, url: string): Promise<{ status: number; body: T }> {
  const res = await app.inject({ method: 'GET', url, headers: { cookie: cookieHeader(jar) } })
  return { status: res.statusCode, body: res.statusCode < 500 && res.body ? (JSON.parse(res.body) as T) : (null as T) }
}

export async function postJSON<T = unknown>(
  app: FastifyInstance,
  jar: Record<string, string>,
  url: string,
  payload?: unknown,
): Promise<{ status: number; body: T }> {
  const res = await app.inject({
    method: 'POST',
    url,
    headers: { cookie: cookieHeader(jar), 'content-type': 'application/json' },
    payload: payload ?? {},
  })
  return { status: res.statusCode, body: res.statusCode < 500 && res.body ? (JSON.parse(res.body) as T) : (null as T) }
}

export async function patchJSON<T = unknown>(
  app: FastifyInstance,
  jar: Record<string, string>,
  url: string,
  payload: unknown,
): Promise<{ status: number; body: T }> {
  const res = await app.inject({
    method: 'PATCH',
    url,
    headers: { cookie: cookieHeader(jar), 'content-type': 'application/json' },
    payload,
  })
  return { status: res.statusCode, body: res.statusCode < 500 && res.body ? (JSON.parse(res.body) as T) : (null as T) }
}
