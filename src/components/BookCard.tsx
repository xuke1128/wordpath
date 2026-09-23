import { useState } from 'react'
import type { BookDTO } from '../../shared/types'
import { ProgressBar } from './ui'

export const STAGE_LABELS: Record<string, string> = {
  primary: '小学',
  junior: '初中',
  senior: '高中',
  cet4: 'CET-4',
  cet6: 'CET-6',
  kaoyan: '考研',
}

/**
 * 词书卡（P5 / P1 步骤1）。
 * - selectMode：onboarding 精简态，点卡片选中；
 * - 普通态：学段徽章、词数、简介、进度条、激活按钮/「使用中 ✓」徽章。
 */
export function BookCard({
  book,
  activating,
  selectMode,
  selected,
  onSelect,
  onActivate,
}: {
  book: BookDTO
  activating?: boolean
  selectMode?: boolean
  selected?: boolean
  onSelect?: () => void
  onActivate?: (b: BookDTO) => void
}) {
  const pct = book.wordCount > 0 ? Math.round((book.learnedCount / book.wordCount) * 100) : 0
  const [expanded, setExpanded] = useState(false)
  const body = (
    <>
      <div className="book-card-top">
        <span className={`badge badge-stage-${book.stage}`}>{STAGE_LABELS[book.stage] ?? book.stage}</span>
        <span className="book-name">{book.name}</span>
        {book.isActive && <span className="badge badge-active">使用中 ✓</span>}
        {book.wordCount > 0 && book.learnedCount >= book.wordCount && !book.isActive && (
          <span className="badge badge-done-book">已学完 🎉</span>
        )}
      </div>
      <div className="book-desc">
        {book.wordCount} 个词{book.description ? ` · ${book.description}` : ''}
      </div>
      {!selectMode && (
        <div className="book-progress-row">
          <ProgressBar value={book.learnedCount} total={book.wordCount} />
          <span style={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
            {book.learnedCount}/{book.wordCount} · {pct}%
          </span>
        </div>
      )}
      {!selectMode && onActivate && !book.isActive && (
        <div className="book-footer">
          <span />
          <button
            className="btn btn-secondary"
            style={{ minHeight: 40, padding: '8px 18px' }}
            disabled={activating}
            onClick={(e) => {
              e.stopPropagation()
              onActivate(book)
            }}
          >
            {activating ? (
              <>
                <span className="spinner spinner-dark" /> 切换中
              </>
            ) : book.learnedCount > 0 ? (
              '继续学习'
            ) : (
              '开始学习'
            )}
          </button>
        </div>
      )}
    </>
  )

  if (selectMode) {
    return (
      <div
        className={`book-card selectable${selected ? ' selected' : ''}`}
        onClick={onSelect}
        role="radio"
        aria-checked={selected}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            onSelect?.()
          }
        }}
      >
        {body}
      </div>
    )
  }

  return (
    <div className="book-card" onClick={() => setExpanded((v) => !v)}>
      {body}
      {expanded && (
        <div style={{ marginTop: 10, fontSize: 13, color: 'var(--text-sub)' }}>
          {book.learnedCount > 0 ? `本书已学 ${book.learnedCount} 词，` : '尚未开始，'}
          进度独立保留，可随时切换。
        </div>
      )}
    </div>
  )
}
