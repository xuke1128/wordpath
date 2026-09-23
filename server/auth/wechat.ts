/** 微信网页授权（开放平台「网站应用」扫码授权，PRD §9-2）。 */
import { randomUUID } from 'node:crypto'

export interface WechatCreds {
  appid: string
  secret: string
  redirectUri: string
}

type FetchLike = (url: string, init?: { timeoutMs?: number }) => Promise<Response>

/** 授权页地址（PC 扫码：open.weixin.qq.com/connect/qrconnect）。 */
export function buildAuthorizeUrl(creds: WechatCreds, state: string): string {
  const redirect = encodeURIComponent(creds.redirectUri)
  return (
    'https://open.weixin.qq.com/connect/qrconnect' +
    `?appid=${encodeURIComponent(creds.appid)}&redirect_uri=${redirect}` +
    `&response_type=code&scope=snsapi_login&state=${encodeURIComponent(state)}#wechat_redirect`
  )
}

export interface WechatTokenResult {
  ok: boolean
  openid?: string
  nickname?: string
  errcode?: number
  errmsg?: string
}

/**
 * 用 code 换 openid（真实实现请求 api.weixin.qq.com；
 * fetchImpl 可注入以便测试——真实公网联调不在本期范围，PRD §8）。
 */
export async function exchangeCode(
  creds: WechatCreds,
  code: string,
  fetchImpl: FetchLike = defaultFetch,
): Promise<WechatTokenResult> {
  const url =
    'https://api.weixin.qq.com/sns/oauth2/access_token' +
    `?appid=${encodeURIComponent(creds.appid)}&secret=${encodeURIComponent(creds.secret)}` +
    `&code=${encodeURIComponent(code)}&grant_type=authorization_code`
  try {
    const res = await fetchImpl(url)
    const data = (await res.json()) as {
      openid?: string
      nickname?: string
      errcode?: number
      errmsg?: string
    }
    if (data.openid) {
      return { ok: true, openid: data.openid, nickname: data.nickname }
    }
    return { ok: false, errcode: data.errcode, errmsg: data.errmsg ?? 'no openid in response' }
  } catch (err) {
    return { ok: false, errmsg: err instanceof Error ? err.message : 'network error' }
  }
}

async function defaultFetch(url: string): Promise<Response> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 8000)
  try {
    return await fetch(url, { signal: ctrl.signal })
  } finally {
    clearTimeout(timer)
  }
}

export function newState(): string {
  return randomUUID().replace(/-/g, '')
}
