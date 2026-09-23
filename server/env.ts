import * as fs from 'node:fs'
import * as path from 'node:path'

/** 应用配置（唯一读取 process.env 的地方；测试可直接构造）。 */
export interface AppConfig {
  port: number
  dbFile: string
  frontendOrigin: string
  /** 三项微信凭据齐备才启用微信登录；否则为 null（登录页隐藏入口）。 */
  wechat: { appid: string; secret: string; redirectUri: string } | null
  /** 可注入的 fetch 实现（测试微信回调用；生产走全局 fetch）。 */
  wechatFetch?: (url: string) => Promise<Response>
  isProd: boolean
  /** 词书种子目录（测试可指向 fixtures）。 */
  wordbookDir?: string
}

export const DEFAULT_CONFIG: AppConfig = {
  port: 8787,
  dbFile: './data/wordpath.db',
  frontendOrigin: 'http://localhost:5173',
  wechat: null,
  isProd: false,
}

/** 极简 .env 读取（不覆盖已存在的环境变量），避免引入 dotenv 依赖。 */
export function loadDotEnv(file = path.resolve(process.cwd(), '.env')): void {
  if (!fs.existsSync(file)) return
  const text = fs.readFileSync(file, 'utf8')
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq <= 0) continue
    const key = line.slice(0, eq).trim()
    let val = line.slice(eq + 1).trim()
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1)
    }
    if (process.env[key] === undefined) process.env[key] = val
  }
}

export function configFromEnv(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const appid = env.WECHAT_APPID?.trim() || ''
  const secret = env.WECHAT_SECRET?.trim() || ''
  const redirectUri = env.WECHAT_REDIRECT_URI?.trim() || ''
  return {
    port: Number(env.PORT || 8787),
    dbFile: env.WORDPATH_DB?.trim() || './data/wordpath.db',
    frontendOrigin: env.FRONTEND_ORIGIN?.trim() || 'http://localhost:5173',
    wechat: appid && secret && redirectUri ? { appid, secret, redirectUri } : null,
    isProd: env.NODE_ENV === 'production',
  }
}
