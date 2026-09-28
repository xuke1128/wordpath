/**
 * 分享卡片（v1.3）：前端 canvas 生成「今日成果 / 学习排行榜」分享图。
 * 个人开发者无法使用微信 JS-SDK（需认证公众号），采用 H5 标准替代：
 * 生成图片 → 保存到相册/长按转发微信群与好友；支持 navigator.share 文件分享与复制文案。
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
const TEXT = '#1f2937'
const SUB = '#6b7280'
const LINE = '#e5e7eb'
const SOFT = '#dcfce7'

const medalOf = (rank: number) => (rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `${rank}`)

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

function clipCircle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.beginPath()
  ctx.arc(x + r, y + r, r, 0, Math.PI * 2)
  ctx.clip()
}

function drawAvatar(ctx: CanvasRenderingContext2D, url: string, x: number, y: number, r: number): Promise<void> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      ctx.save()
      clipCircle(ctx, x, y, r)
      ctx.drawImage(img, x, y, r * 2, r * 2)
      ctx.restore()
      resolve()
    }
    img.onerror = () => resolve()
    img.src = url
  })
}

async function loadQrDataUrl(url: string): Promise<string | null> {
  try {
    const QRCode = (await import('qrcode')).default
    return await QRCode.toDataURL(url, { margin: 1, width: 200, color: { dark: PRIMARY_DARK, light: '#ffffff' } })
  } catch {
    return null
  }
}

async function renderCard(card: ShareCard): Promise<string> {
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')!
  const origin = window.location.origin

  // 背景 + 主卡
  ctx.fillStyle = SOFT
  ctx.fillRect(0, 0, W, H)
  ctx.fillStyle = '#ffffff'
  roundRect(ctx, 24, 24, W - 48, H - 48, 28)
  ctx.fill()

  // 页眉
  ctx.fillStyle = PRIMARY
  ctx.font = '700 44px system-ui, -apple-system, "PingFang SC", sans-serif'
  ctx.fillText('WordPath', 56, 108)
  ctx.fillStyle = SUB
  ctx.font = '400 24px system-ui, -apple-system, "PingFang SC", sans-serif'
  ctx.fillText('从小学到考研，一条词径走到底', 56, 148)
  ctx.strokeStyle = LINE
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(56, 178)
  ctx.lineTo(W - 56, 178)
  ctx.stroke()

  if (card.kind === 'today') {
    ctx.fillStyle = TEXT
    ctx.font = '700 40px system-ui, -apple-system, "PingFang SC", sans-serif'
    ctx.fillText(`${card.nickname} 的今日成果`, 56, 258)
    if (card.hasAvatar) await drawAvatar(ctx, `/api/avatar/${card.userId}`, W - 176, 218, 56)

    const big = (label: string, value: string, x: number) => {
      ctx.fillStyle = PRIMARY
      ctx.font = '800 96px system-ui, -apple-system, sans-serif'
      ctx.fillText(value, x, 420)
      ctx.fillStyle = SUB
      ctx.font = '400 28px system-ui, -apple-system, "PingFang SC", sans-serif'
      ctx.fillText(label, x + 8, 464)
    }
    big('今日新词', `${card.newCount}`, 72)
    big('今日复习', `${card.reviewCount}`, 400)

    ctx.fillStyle = TEXT
    ctx.font = '600 32px system-ui, -apple-system, "PingFang SC", sans-serif'
    ctx.fillText(`🔥 连续打卡 ${card.streak} 天 · 累计学习 ${card.totalWords} 词`, 72, 556)
  } else {
    ctx.fillStyle = TEXT
    ctx.font = '700 40px system-ui, -apple-system, "PingFang SC", sans-serif'
    ctx.fillText('学习排行榜', 56, 252)
    ctx.fillStyle = SUB
    ctx.font = '400 24px system-ui, -apple-system, "PingFang SC", sans-serif'
    ctx.fillText('按累计学习词汇量排名', 56, 290)

    let y = 330
    for (const e of card.entries.slice(0, 5)) {
      const isMe = e.isMe
      if (isMe) {
        ctx.fillStyle = SOFT
        roundRect(ctx, 40, y - 40, W - 80, 64, 14)
        ctx.fill()
      }
      ctx.fillStyle = TEXT
      ctx.font = '600 30px system-ui, -apple-system, sans-serif'
      ctx.fillText(medalOf(e.rank), 64, y)
      const name = e.nickname.length > 8 ? `${e.nickname.slice(0, 8)}…` : e.nickname
      ctx.fillText(name, 140, y)
      ctx.fillStyle = PRIMARY_DARK
      ctx.font = '700 30px system-ui, -apple-system, sans-serif'
      ctx.fillText(`${e.totalWords} 词`, W - 200, y)
      if (e.hasAvatar) await drawAvatar(ctx, `/api/avatar/${e.userId}`, 92, y - 28, 20)
      y += 78
    }
    const me = card.entries.find((e) => e.isMe)
    if (me && !card.entries.slice(0, 5).includes(me)) {
      ctx.fillStyle = SOFT
      roundRect(ctx, 40, y - 40, W - 80, 64, 14)
      ctx.fill()
      ctx.fillStyle = TEXT
      ctx.font = '600 30px system-ui, -apple-system, sans-serif'
      ctx.fillText(`${me.rank}`, 64, y)
      ctx.fillText(`${me.nickname}（我）`, 140, y)
      ctx.fillStyle = PRIMARY_DARK
      ctx.font = '700 30px system-ui, -apple-system, sans-serif'
      ctx.fillText(`${me.totalWords} 词`, W - 200, y)
    }
  }

  // 页脚：二维码（弱化尺寸）+ 引导语
  const qr = await loadQrDataUrl(origin)
  ctx.fillStyle = SUB
  ctx.font = '400 24px system-ui, -apple-system, "PingFang SC", sans-serif'
  ctx.textAlign = 'center'
  if (qr) {
    const qimg = new Image()
    await new Promise<void>((resolve) => {
      qimg.onload = () => resolve()
      qimg.onerror = () => resolve()
      qimg.src = qr
    })
    ctx.drawImage(qimg, W / 2 - 52, H - 204, 104, 104)
    ctx.fillText('扫码和我一起背单词', W / 2, H - 76)
  } else {
    ctx.fillText(origin, W / 2, H - 90)
  }
  ctx.textAlign = 'left'

  return canvas.toDataURL('image/png')
}

function shareText(card: ShareCard): string {
  const origin = window.location.origin
  if (card.kind === 'today') {
    return `我在「WordPath」今天新学 ${card.newCount} 个单词、复习 ${card.reviewCount} 个，已连续打卡 ${card.streak} 天！一起来背单词吧 👉 ${origin}`
  }
  const top = card.entries
    .slice(0, 3)
    .map((e) => `${medalOf(e.rank)} ${e.nickname}（${e.totalWords}词）`)
    .join(' ')
  const me = card.entries.find((e) => e.isMe)
  const meLine = me ? `我排第 ${me.rank} 名！` : ''
  return `「WordPath」学习排行榜：${top} ${meLine}一起来背单词吧 👉 ${origin}`
}

/** 分享弹层：预览图 + 保存/复制/系统分享。微信内置浏览器提示长按保存。 */
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
  const isWeChat = /MicroMessenger/i.test(navigator.userAgent)

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

  const savePng = async () => {
    if (!preview) return
    const a = document.createElement('a')
    a.href = preview
    a.download = 'wordpath-share.png'
    a.click()
  }

  const systemShare = async () => {
    if (!preview || !card) return
    try {
      const blob = await (await fetch(preview)).blob()
      const file = new File([blob], 'wordpath-share.png', { type: 'image/png' })
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: '词径 WordPath', text: shareText(card) })
      }
    } catch {
      // 用户取消分享不视为错误
    }
  }

  const copyText = async () => {
    if (!card) return
    const text = shareText(card)
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      window.prompt('复制以下文案', text)
    }
  }

  const canSystemShare = typeof navigator.canShare === 'function'

  return (
    <Sheet open={open} title="分享到微信" onClose={onClose}>
      {isWeChat && (
        <p className="share-hint">在微信内打开时：长按下方图片 →「保存图片」，再转发到群或好友</p>
      )}
      <div className="share-preview">
        {preview ? <img src={preview} alt="分享卡片预览" /> : failed ? (
          <p className="share-hint">生成失败，请重试</p>
        ) : (
          <Skeleton h={420} r={16} />
        )}
      </div>
      <div className="share-actions">
        <button className="btn btn-primary btn-lg" disabled={!preview} onClick={() => void savePng()}>
          保存图片
        </button>
        {canSystemShare && (
          <button className="btn btn-secondary btn-lg" disabled={!preview} onClick={() => void systemShare()}>
            系统分享
          </button>
        )}
        <button className="btn btn-ghost btn-lg" disabled={!card} onClick={() => void copyText()}>
          复制文案
        </button>
      </div>
      {!isWeChat && <p className="share-hint">保存图片后，在微信里发送到群 / 好友，或发朋友圈</p>}
    </Sheet>
  )
}
