/** fetch 封装：JSON、错误规整、401 统一事件（触发「登录已过期」）。 */
import type { MeDTO } from '../../shared/types'

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message?: string,
  ) {
    super(message ?? code)
  }
}

export const UNAUTHORIZED_EVENT = 'wp:unauthorized'

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  let res: Response
  try {
    res = await fetch(url, {
      method,
      headers: body !== undefined ? { 'content-type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      credentials: 'same-origin',
    })
  } catch {
    throw new ApiError(0, 'NETWORK_ERROR', '网络开小差了')
  }
  if (res.status === 401) {
    window.dispatchEvent(new CustomEvent(UNAUTHORIZED_EVENT))
    throw new ApiError(401, 'UNAUTHORIZED', '登录已过期')
  }
  const data = res.headers.get('content-type')?.includes('application/json')
    ? ((await res.json()) as unknown)
    : null
  if (!res.ok) {
    const err = data as { error?: string; message?: string } | null
    throw new ApiError(res.status, err?.error ?? 'UNKNOWN', err?.message)
  }
  return data as T
}

export const api = {
  get: <T>(url: string) => request<T>('GET', url),
  post: <T>(url: string, body?: unknown) => request<T>('POST', url, body),
  patch: <T>(url: string, body: unknown) => request<T>('PATCH', url, body),
}

export interface AuthConfigResponse {
  mock: boolean
  wechat: boolean
}

export const fetchAuthConfig = () => api.get<AuthConfigResponse>('/api/auth/config')
export const fetchMe = () => api.get<MeDTO>('/api/me')
