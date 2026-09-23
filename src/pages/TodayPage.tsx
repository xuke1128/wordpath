import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../api/client'
import { useAuth } from '../state/AuthContext'
import { useToast } from '../state/ToastContext'
import { usePageTitle } from '../App'
import { Page } from '../components/AppHeader'
import { QuantityPicker } from '../components/QuantityPicker'
import { EmptyState, ErrorBlock, Sheet, Skeleton } from '../components/ui'
import { MODE_LABELS } from '../components/ModeTabs'
import type { TodayDTO } from '../../shared/types'

const WEEK_CN = ['日', '一', '二', '三', '四', '五', '六']

function formatDateLine(date: string): string {
  const d = new Date(`${date}T12:00:00Z`)
  return `${d.getUTCMonth() + 1}月${d.getUTCDate()}日 周${WEEK_CN[d.getUTCDay()]}`
}

/** P2 今日页（应用首页）：任务四态 + 快捷卡。 */
export function TodayPage() {
  usePageTitle('今日')
  const { me, refresh } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()

  const [data, setData] = useState<TodayDTO | null>(null)
  const [error, setError] = useState(false)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [qty, setQty] = useState(me?.settings.dailyNewLimit ?? 20)
  const [savingQty, setSavingQty] = useState(false)

  const load = useCallback(() => {
    setError(false)
    api
      .get<TodayDTO>('/api/today')
      .then(setData)
      .catch(() => setError(true))
  }, [])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    if (me) setQty(me.settings.dailyNewLimit)
  }, [me])

  const streak = data?.streak ?? 0

  const saveQty = async (n: number) => {
    setSavingQty(true)
    const task = data?.task
    const newDone = task?.doneNewCount ?? 0
    const actual = Math.max(0, Math.min(n, (task?.newCount ?? 0) + newDone) - newDone)
    try {
      await api.patch('/api/me/settings', { dailyNewLimit: n })
      setSheetOpen(false)
      await refresh()
      toast.show(`已更新，今日新词 ${actual} 个`, 'success')
      load()
    } catch {
      toast.show('保存失败，请重试', 'error')
    } finally {
      setSavingQty(false)
    }
  }

  const task = data?.task
  const remaining = task ? task.totalCount - task.doneCount : 0
  const allDone = data !== null && data.hasBook && task !== null && remaining === 0 && !data.bookFinished && data.completed

  return (
    <Page streak={streak}>
      <div className="today-meta">
        <span>{data ? formatDateLine(data.date) : '—'}</span>
        {me?.activeBook && (
          <>
            <span>·</span>
            <Link to="/books">
              <b>《{me.activeBook.name}》</b> <span className="chev">›</span>
            </Link>
          </>
        )}
      </div>

      {error && <ErrorBlock message="网络开小差了" onRetry={load} />}

      {!data && !error && (
        <div className="card" style={{ minHeight: 190 }}>
          <Skeleton h={20} w={90} />
          <div style={{ height: 14 }} />
          <Skeleton h={16} w={200} />
          <div style={{ height: 18 }} />
          <Skeleton h={10} />
          <div style={{ height: 22 }} />
          <Skeleton h={52} r={12} />
        </div>
      )}

      {data && !data.hasBook && (
        <div className="card">
          <EmptyState
            ico="🌱"
            title="先选一本词书，开始你的词径 🌱"
            desc="从小学到考研，六本词书任你选"
            action={
              <button className="btn btn-primary btn-lg" onClick={() => navigate('/onboarding')}>
                去选书
              </button>
            }
          />
        </div>
      )}

      {data && data.hasBook && data.bookFinished && remaining === 0 && (
        <div className="card">
          <EmptyState
            ico="🎉"
            title={`《${me?.activeBook?.name ?? ''}》已全部学完 🎉`}
            desc="可以切换下一本词书继续进阶"
            action={
              <button className="btn btn-primary btn-lg" onClick={() => navigate('/books')}>
                切换词书
              </button>
            }
          />
        </div>
      )}

      {data && data.hasBook && !data.bookFinished && allDone && (
        <div className="card">
          <EmptyState
            ico="✅"
            title="今日任务已全部完成 ✅"
            desc={`已自动打卡 · 连续 ${streak} 天 🔥`}
            action={
              <button className="btn btn-primary btn-lg" onClick={() => navigate('/stats')}>
                查看统计
              </button>
            }
          />
        </div>
      )}

      {data && data.hasBook && task && remaining > 0 && (
        <div className="card">
          <div className="card-title">今日任务</div>
          <div className="task-legend">
            <span>
              <span className="dot dot-review" />
              复习 {task.reviewCount}
            </span>
            <span>
              <span className="dot dot-new" />
              新词 {task.newCount}
            </span>
            {data.bookFinished && <span className="badge badge-done-book">本书新词已学完</span>}
          </div>
          <div className="task-progress-row">
            <span style={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
              {task.doneCount}/{task.totalCount}
            </span>
            <div
              className="progressbar"
              role="progressbar"
              aria-valuenow={task.doneCount}
              aria-valuemin={0}
              aria-valuemax={task.totalCount}
            >
              <div
                className="progressbar-fill"
                style={{ width: `${task.totalCount ? Math.round((task.doneCount / task.totalCount) * 100) : 0}%` }}
              />
            </div>
          </div>
          <button className="btn btn-primary btn-lg btn-block" onClick={() => navigate('/study')}>
            开始学习 →
          </button>
          <div className="last-mode-note">上次模式：{MODE_LABELS[me?.settings.lastMode ?? 'card']}，学习页内可换</div>
        </div>
      )}

      <div className="two-col">
        <div className="card stat-mini">
          <div className="lbl">每日新词量</div>
          <div className="num">{me?.settings.dailyNewLimit ?? '—'}</div>
          <button className="btn btn-ghost" style={{ minHeight: 40 }} onClick={() => setSheetOpen(true)}>
            调整
          </button>
        </div>
        <div className="card stat-mini">
          <div className="lbl">连续打卡</div>
          <div className="num">🔥 {streak} 天</div>
          <Link to="/stats" className="btn btn-ghost" style={{ minHeight: 40 }}>
            查看日历
          </Link>
        </div>
      </div>

      <Sheet open={sheetOpen} title="每日新词量" onClose={() => setSheetOpen(false)}>
        <QuantityPicker
          value={qty}
          onChange={setQty}
          onSave={saveQty}
          saving={savingQty}
          bookName={me?.activeBook?.name}
          previewFn={(n) => {
            const newDone = task?.doneNewCount ?? 0
            const actual = Math.max(0, Math.min(n, (task?.newCount ?? 0) + newDone) - newDone)
            return `今日新词将变为 ${actual} 个`
          }}
        />
      </Sheet>
    </Page>
  )
}
