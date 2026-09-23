import { useEffect, type ReactNode } from 'react'

export function ProgressBar({ value, total, large }: { value: number; total: number; large?: boolean }) {
  const pct = total > 0 ? Math.min(100, Math.round((value / total) * 100)) : 0
  return (
    <div
      className={`progressbar${large ? ' progressbar-lg' : ''}`}
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={total}
    >
      <div className="progressbar-fill" style={{ width: `${pct}%` }} />
    </div>
  )
}

/** 防误触确认弹层：主操作安全色、破坏性操作 danger。 */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmText,
  cancelText,
  danger,
  onConfirm,
  onCancel,
}: {
  open: boolean
  title: string
  message?: string
  confirmText: string
  cancelText: string
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  if (!open) return null
  return (
    <div className="sheet-mask" onClick={onCancel}>
      <div className="sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={title}>
        <div className="sheet-title">{title}</div>
        {message && <p className="dialog-text">{message}</p>}
        <div className="sheet-actions">
          <button className="btn btn-primary btn-lg" onClick={onCancel}>
            {cancelText}
          </button>
          <button className={`btn ${danger ? 'btn-danger-text' : 'btn-ghost'}`} onClick={onConfirm}>
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  )
}

/** 移动底部弹层 / 桌面居中弹窗（同一组件，断点响应式）。 */
export function Sheet({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="sheet-mask" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={title}>
        <div className="sheet-title">{title}</div>
        {children}
      </div>
    </div>
  )
}

export function Skeleton({ w = '100%', h = 16, r = 10, style }: { w?: number | string; h?: number; r?: number; style?: React.CSSProperties }) {
  return <div className="skeleton" style={{ width: w, height: h, borderRadius: r, ...style }} />
}

export function EmptyState({ ico, title, desc, action }: { ico: string; title: string; desc?: string; action?: ReactNode }) {
  return (
    <div className="empty-state">
      <div className="empty-ico" aria-hidden="true">
        {ico}
      </div>
      <div className="empty-title">{title}</div>
      {desc && <div>{desc}</div>}
      {action && <div style={{ marginTop: 16 }}>{action}</div>}
    </div>
  )
}

export function ErrorBlock({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="error-block" role="alert">
      <span>⚠ {message}</span>
      {onRetry && (
        <button className="btn" onClick={onRetry}>
          重试
        </button>
      )}
    </div>
  )
}
