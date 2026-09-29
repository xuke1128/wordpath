/**
 * 分享卡片（v1.3.2）：前端 canvas 生成「今日成果 / 学习排行榜」分享图。
 * 个人开发者无法使用微信 JS-SDK（需认证公众号），采用 H5 标准替代：
 * 生成图片 → 微信内长按保存转发。卡片全部用形状+文字绘制，不用 emoji
 * （安卓 WebView 的 canvas 对彩色 emoji 渲染不一致，曾出现徽章花屏）。
 */
import { useEffect, useState } from 'react'
import { Sheet, Skeleton } from './ui'
import type { LeaderboardEntryDTO } from '../../shared/types'

export type ShareCard =
  | {
      kind: 'today'
      date: string
      nickname: string
      userId: string
      hasAvatar: boolean
      newCount: number
      reviewCount: number
      streak: number
      totalWords: number
    }
  | {
      kind: 'board'
      date: string
      nickname: string
      /** Top 5 + 我（榜外含我的真实名次行）。 */
      entries: LeaderboardEntryDTO[]
    }

const W = 720
const H = 960
const PRIMARY = '#16a34a'
const PRIMARY_DARK = '#15803d'
const SOFT = '#dcfce7'
const TEXT = '#1f2937'
const SUB = '#6b7280'
const LINE = '#e5e7eb'
const PANEL = '#f8fafc'
const AVATAR_PALETTE = ['#16a34a', '#0ea5e9', '#f59e0b', '#8b5cf6', '#f97316', '#06b6d4']
const SANS = 'system-ui, -apple-system, "PingFang SC", "HarmonyOS Sans SC", "MiSans", sans-serif'
const font = (weight: number | string, size: number) => `${weight} ${size}px ${SANS}`

const fmtDate = (iso: string) => {
  const [, m, d] = iso.split('-').map(Number)
  return `${m}月${d}日`
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

function clipCircle(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.clip()
}

/** 品牌小径图案：一串沿弧线上升的圆点（呼应 logo）。 */
function drawPathMotif(ctx: CanvasRenderingContext2D, x: number, y: number, scale = 1) {
  const dots: Array<[number, number, number]> = [
    [0, 14, 2.6],
    [11, 9, 3],
    [22, 5.5, 3.4],
    [33, 1, 3.8],
    [44, -5, 4.6],
  ]
  ctx.fillStyle = PRIMARY
  for (const [dx, dy, r] of dots) {
    ctx.beginPath()
    ctx.arc(x + dx * scale, y + dy * scale, r * scale, 0, Math.PI * 2)
    ctx.fill()
  }
}

function drawAvatar(ctx: CanvasRenderingContext2D, url: string, cx: number, cy: number, r: number): Promise<void> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      ctx.save()
      clipCircle(ctx, cx, cy, r)
      ctx.drawImage(img, cx - r, cy - r, r * 2, r * 2)
      ctx.restore()
      ctx.strokeStyle = LINE
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.arc(cx, cy, r, 0, Math.PI * 2)
      ctx.stroke()
      resolve()
    }
    img.onerror = () => resolve()
    img.src = url
  })
}

function drawFallbackAvatar(ctx: CanvasRenderingContext2D, name: string, cx: number, cy: number, r: number) {
  const color = AVATAR_PALETTE[(name.codePointAt(0) ?? 0) % AVATAR_PALETTE.length]
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#ffffff'
  ctx.font = font(700, r)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(name.slice(0, 1).toUpperCase(), cx, cy + 1)
  ctx.textAlign = 'left'
}

/** 名次徽章：前三名金银铜圆形，其余灰色。 */
function drawRankBadge(ctx: CanvasRenderingContext2D, rank: number, cx: number, cy: number, r: number) {
  const colors: Record<number, [string, string]> = {
    1: ['#f5b301', '#ffd968'],
    2: ['#9aa7b4', '#cfd8e0'],
    3: ['#c77b46', '#e8a76f'],
  }
  const [base, highlight] = colors[rank] ?? ['#cbd5e1', '#e2e8f0']
  ctx.fillStyle = base
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = highlight
  ctx.beginPath()
  ctx.arc(cx - r * 0.25, cy - r * 0.3, r * 0.45, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = rank <= 3 ? '#ffffff' : '#475569'
  ctx.font = font(800, r * 1.05)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(`${rank}`, cx, cy + 1)
  ctx.textAlign = 'left'
}

async function loadQrDataUrl(url: string): Promise<string | null> {
  try {
    const QRCode = (await import('qrcode')).default
    return await QRCode.toDataURL(url, { margin: 0, width: 200, color: { dark: PRIMARY_DARK, light: '#ffffff' } })
  } catch {
    return null
  }
}

function drawImage(ctx: CanvasRenderingContext2D, src: string, x: number, y: number, w: number, h: number): Promise<void> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      ctx.drawImage(img, x, y, w, h)
      resolve()
    }
    img.onerror = () => resolve()
    img.src = src
  })
}

/** 页眉：品牌 + 标语 + 日期胶囊。返回分隔线 y。 */
async function drawHeader(ctx: CanvasRenderingContext2D, date: string): Promise<number> {
  ctx.fillStyle = '#ffffff'
  ctx.shadowColor = 'rgba(15, 23, 42, 0.10)'
  ctx.shadowBlur = 24
  ctx.shadowOffsetY = 8
  roundRect(ctx, 28, 28, W - 56, H - 56, 28)
  ctx.fill()
  ctx.shadowColor = 'transparent'
  ctx.shadowBlur = 0
  ctx.shadowOffsetY = 0

  drawPathMotif(ctx, 58, 84, 1.1)
  ctx.fillStyle = PRIMARY
  ctx.font = font(800, 42)
  ctx.textBaseline = 'middle'
  ctx.fillText('WordPath', 118, 82)
  ctx.fillStyle = SUB
  ctx.font = font(400, 22)
  ctx.fillText('从小学到考研，一条词径走到底', 58, 126)

  const dateText = fmtDate(date)
  ctx.font = font(600, 22)
  const dw = ctx.measureText(dateText).width + 36
  ctx.fillStyle = SOFT
  roundRect(ctx, W - 56 - dw, 58, dw, 44, 22)
  ctx.fill()
  ctx.fillStyle = PRIMARY_DARK
  ctx.textAlign = 'center'
  ctx.fillText(dateText, W - 56 - dw / 2, 81)
  ctx.textAlign = 'left'

  ctx.strokeStyle = LINE
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(56, 158)
  ctx.lineTo(W - 56, 158)
  ctx.stroke()
  return 158
}

/** 页脚：细分隔线 + 小二维码 + 弱化说明。 */
async function drawFooter(ctx: CanvasRenderingContext2D, dividerY: number) {
  ctx.strokeStyle = LINE
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(56, dividerY)
  ctx.lineTo(W - 56, dividerY)
  ctx.stroke()

  const origin = window.location.origin
  const qr = await loadQrDataUrl(origin)
  ctx.textBaseline = 'middle'
  if (qr) {
    await drawImage(ctx, qr, 88, dividerY + 22, 92, 92)
    ctx.fillStyle = TEXT
    ctx.font = font(600, 26)
    ctx.fillText('扫码和我一起背单词', 204, dividerY + 56)
    ctx.fillStyle = SUB
    ctx.font = font(400, 20)
    ctx.fillText(origin.replace(/^https?:\/\//, ''), 204, dividerY + 90)
  } else {
    ctx.fillStyle = SUB
    ctx.font = font(400, 24)
    ctx.fillText(origin, 56, dividerY + 50)
  }
  ctx.textBaseline = 'alphabetic'
}

/** 排行榜行：行底板 + 名次徽章 + 头像 + 昵称(我) + 词数。 */
async function drawBoardRow(
  ctx: CanvasRenderingContext2D,
  e: LeaderboardEntryDTO,
  centerY: number,
  isExtraMe: boolean,
) {
  ctx.fillStyle = e.isMe ? SOFT : PANEL
  roundRect(ctx, 48, centerY - 38, W - 96, 76, 18)
  ctx.fill()
  if (e.isMe) {
    ctx.strokeStyle = PRIMARY
    ctx.lineWidth = 2
    roundRect(ctx, 48, centerY - 38, W - 96, 76, 18)
    ctx.stroke()
  }

  drawRankBadge(ctx, e.rank, 96, centerY, 19)
  if (e.hasAvatar) {
    await drawAvatar(ctx, `/api/avatar/${e.userId}`, 158, centerY, 23)
  } else {
    drawFallbackAvatar(ctx, e.nickname, 158, centerY, 23)
  }

  ctx.fillStyle = TEXT
  ctx.font = font(600, 28)
  ctx.textBaseline = 'middle'
  const name = e.nickname.length > 8 ? `${e.nickname.slice(0, 8)}…` : e.nickname
  ctx.fillText(name, 196, centerY)
  if (e.isMe) {
    const nameW = ctx.measureText(name).width
    ctx.fillStyle = PRIMARY
    roundRect(ctx, 196 + nameW + 12, centerY - 14, 38, 28, 14)
    ctx.fill()
    ctx.fillStyle = '#ffffff'
    ctx.font = font(700, 18)
    ctx.textAlign = 'center'
    ctx.fillText('我', 196 + nameW + 31, centerY + 1)
    ctx.textAlign = 'left'
  }

  ctx.fillStyle = PRIMARY_DARK
  ctx.font = font(800, 34)
  ctx.textAlign = 'right'
  ctx.fillText(`${e.totalWords}`, W - 112, centerY)
  ctx.fillStyle = SUB
  ctx.font = font(400, 20)
  ctx.textAlign = 'left'
  ctx.fillText('词', W - 104, centerY)
  ctx.textAlign = 'right'
  ctx.fillText('', 0, 0)
  ctx.textAlign = 'left'
  void isExtraMe
}

async function renderCard(card: ShareCard): Promise<string> {
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')!

  // 背景：浅绿底 + 两枚装饰大圆
  ctx.fillStyle = '#eaf4ec'
  ctx.fillRect(0, 0, W, H)
  ctx.fillStyle = 'rgba(22, 163, 74, 0.07)'
  ctx.beginPath()
  ctx.arc(W - 40, 60, 150, 0, Math.PI * 2)
  ctx.fill()
  ctx.beginPath()
  ctx.arc(50, H - 40, 130, 0, Math.PI * 2)
  ctx.fill()

  await drawHeader(ctx, card.date)
  await drawFooter(ctx, 824)
  ctx.textBaseline = 'middle'

  if (card.kind === 'board') {
    ctx.fillStyle = PRIMARY
    roundRect(ctx, 56, 190, 8, 34, 4)
    ctx.fill()
    ctx.fillStyle = TEXT
    ctx.font = font(800, 36)
    ctx.fillText('学习排行榜', 78, 208)
    ctx.fillStyle = SUB
    ctx.font = font(400, 22)
    ctx.fillText('按累计学习词汇量排名', 56, 252)

    let centerY = 330
    for (const e of card.entries.slice(0, 5)) {
      await drawBoardRow(ctx, e, centerY, false)
      centerY += 90
    }
    const me = card.entries.find((e) => e.isMe)
    if (me && !card.entries.slice(0, 5).includes(me)) {
      await drawBoardRow(ctx, me, centerY + 4, true)
    }
  } else {
    const name = card.nickname.length > 10 ? `${card.nickname.slice(0, 10)}…` : card.nickname
    ctx.fillStyle = PRIMARY
    roundRect(ctx, 56, 190, 8, 34, 4)
    ctx.fill()
    ctx.fillStyle = TEXT
    ctx.font = font(800, 36)
    ctx.fillText('今日成果', 78, 208)
    ctx.fillStyle = SUB
    ctx.font = font(400, 22)
    ctx.fillText(`${name} · 坚持就是词径`, 56, 252)
    if (card.hasAvatar) {
      await drawAvatar(ctx, `/api/avatar/${card.userId}`, W - 116, 212, 42)
    } else {
      drawFallbackAvatar(ctx, card.nickname, W - 116, 212, 42)
    }

    const metrics: Array<[string, string]> = [
      ['今日新词', `${card.newCount}`],
      ['今日复习', `${card.reviewCount}`],
      ['连续打卡', `${card.streak}`],
      ['累计词汇', `${card.totalWords}`],
    ]
    metrics.forEach(([label, value], i) => {
      const x = 56 + (i % 2) * 284
      const y = 292 + Math.floor(i / 2) * 168
      ctx.fillStyle = PANEL
      roundRect(ctx, x, y, 268, 148, 18)
      ctx.fill()
      ctx.fillStyle = PRIMARY_DARK
      ctx.font = font(800, 60)
      ctx.textAlign = 'center'
      ctx.fillText(value, x + 134, y + 62)
      ctx.fillStyle = SUB
      ctx.font = font(400, 22)
      ctx.fillText(label, x + 134, y + 116)
    })
    ctx.textAlign = 'left'

    ctx.fillStyle = SOFT
    roundRect(ctx, 56, 656, W - 112, 110, 18)
    ctx.fill()
    ctx.fillStyle = PRIMARY_DARK
    ctx.font = font(600, 28)
    ctx.textAlign = 'center'
    ctx.fillText('单词多背一个，词径就长一寸', W / 2, 711)
    ctx.textAlign = 'left'
  }

  return canvas.toDataURL('image/png')
}

/** 分享弹层：提示语 + 卡片预览（微信内长按图片保存转发）。 */
export function ShareSheet({
  open,
  card,
  onClose,
}: {
  open: boolean
  card: ShareCard | null
  onClose: () => void
}) {
  const [preview, setPreview] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!open || !card) return
    setPreview(null)
    setFailed(false)
    let cancelled = false
    renderCard(card)
      .then((url) => {
        if (!cancelled) setPreview(url)
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
      })
    return () => {
      cancelled = true
    }
  }, [open, card])

  return (
    <Sheet open={open} title="分享到微信" onClose={onClose}>
      <p className="share-hint">长按图片转发给微信好友</p>
      <div className="share-preview">
        {preview ? (
          <img src={preview} alt="分享卡片预览" />
        ) : failed ? (
          <p className="share-hint">生成失败，请关闭后重试</p>
        ) : (
          <Skeleton h={420} r={16} />
        )}
      </div>
    </Sheet>
  )
}
