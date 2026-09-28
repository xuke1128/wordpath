import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api/client'
import { useAuth } from '../state/AuthContext'
import { usePageTitle } from '../App'
import { ErrorBlock } from '../components/ui'
import { ShareSheet, type ShareCard } from '../components/ShareSheet'
import type { StatsDTO, TodayDTO } from '../../shared/types'

/** P4 完成结算页：自动打卡 + streak + 数据小结 + 分享（F9 / v1.3）。 */
export function CompletePage() {
  usePageTitle('今日任务完成')
  const { me } = useAuth()
  const [data, setData] = useState<TodayDTO | null>(null)
  const [stats, setStats] = useState<StatsDTO | null>(null)
  const [error, setError] = useState(false)
  const [shareCard, setShareCard] = useState<ShareCard | null>(null)

  useEffect(() => {
    Promise.all([api.get<TodayDTO>('/api/today'), api.get<StatsDTO>('/api/stats')])
      .then(([t, s]) => {
        setData(t)
        setStats(s)
      })
      .catch(() => setError(true))
  }, [])

  const buildTodayShareCard = (): ShareCard | null => {
    if (!data || !me) return null
    return {
      kind: 'today',
      date: data.date,
      nickname: me.user.nickname,
      userId: me.user.id,
      hasAvatar: me.user.hasAvatar,
      newCount: data.task?.doneNewCount ?? 0,
      reviewCount: data.task?.doneReviewCount ?? 0,
      streak: data.streak,
      totalWords: stats?.totalLearned ?? 0,
    }
  }

  const streak = data?.streak ?? 1
  const task = data?.task

  return (
    <div className="complete-page">
      <div className="complete-card">
        <div style={{ textAlign: 'center' }}>
          <span className="complete-ico" role="img" aria-label="庆祝">
            🎉
          </span>
          <div className="complete-title">今日任务完成！</div>
        </div>

        {error && <ErrorBlock message="网络开小差了" onRetry={() => window.location.reload()} />}

        {data && (
          <>
            <div className="checkin-card">已自动打卡 · 连续 {streak} 天 🔥</div>
            <div className="grid-2">
              <div className="result-cell">
                <div className="lbl">新学</div>
                <div className="num">{task?.doneNewCount ?? 0}</div>
              </div>
              <div className="result-cell">
                <div className="lbl">复习</div>
                <div className="num">{task?.doneReviewCount ?? 0}</div>
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <button
                className="btn btn-primary btn-lg btn-block"
                onClick={() => setShareCard(buildTodayShareCard())}
              >
                📤 分享今日成果
              </button>
              <Link to="/stats" className="btn btn-secondary btn-block">
                查看统计 →
              </Link>
              <Link to="/today" className="btn btn-ghost btn-block">
                返回今日
              </Link>
            </div>
          </>
        )}
        {!data && !error && (
          <div className="card" style={{ minHeight: 120 }}>
            <div className="skeleton" style={{ height: 90 }} />
          </div>
        )}
      </div>

      <ShareSheet open={shareCard !== null} card={shareCard} onClose={() => setShareCard(null)} />
    </div>
  )
}
