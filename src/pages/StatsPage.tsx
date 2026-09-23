import { useCallback, useEffect, useState } from 'react'
import { api } from '../api/client'
import { usePageTitle } from '../App'
import { Page } from '../components/AppHeader'
import { ProgressBar } from '../components/ui'
import { BarChart7, CalendarGrid } from '../components/charts'
import { EmptyState, ErrorBlock, Skeleton } from '../components/ui'
import type { CalendarDTO, LeaderboardDTO, StatsDTO } from '../../shared/types'

/** P6 统计页：指标卡 + 词书进度 + 近 7 天柱状图 + 当月打卡日历 + 学习排行榜（US10 / US9 / US13）。 */
export function StatsPage() {
  usePageTitle('统计')
  const [stats, setStats] = useState<StatsDTO | null>(null)
  const [cal, setCal] = useState<CalendarDTO | null>(null)
  const [board, setBoard] = useState<LeaderboardDTO | null>(null)
  const [error, setError] = useState(false)
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const [month, setMonth] = useState(`${now.getFullYear()}-${pad(now.getMonth() + 1)}`)

  const load = useCallback(() => {
    setError(false)
    Promise.all([
      api.get<StatsDTO>('/api/stats'),
      api.get<CalendarDTO>(`/api/stats/calendar?month=${month}`),
      api.get<LeaderboardDTO>('/api/stats/leaderboard'),
    ])
      .then(([s, c, b]) => {
        setStats(s)
        setCal(c)
        setBoard(b)
      })
      .catch(() => setError(true))
  }, [month])

  useEffect(() => {
    load()
  }, [load])

  const today = cal?.today ?? ''
  const currentMonth = today ? today.slice(0, 7) : month
  const canNext = month < currentMonth
  const shiftMonth = (delta: number) => {
    const [y, m] = month.split('-').map(Number)
    const d = new Date(Date.UTC(y, m - 1 + delta, 1))
    setMonth(`${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`)
  }

  const hasNoRecord =
    stats !== null &&
    stats.totalLearned === 0 &&
    stats.last7.every((d) => d.total === 0)

  return (
    <Page streak={stats?.streak}>
      <h1 className="page-title">统计</h1>

      {error && (
        <div style={{ marginTop: 12 }}>
          <ErrorBlock message="网络开小差了" onRetry={load} />
        </div>
      )}

      {!stats && !error && (
        <>
          <div className="stat-cards">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} h={86} r={16} />
            ))}
          </div>
          <Skeleton h={110} r={16} />
          <div style={{ height: 14 }} />
          <Skeleton h={220} r={16} />
        </>
      )}

      {stats && (
        <>
          <div className="card">
            <div className="card-title">学习排行榜</div>
            <div className="lb-sub">按累计学习词汇量排名 · 微信与体验用户同榜</div>
            {!board ? (
              <Skeleton h={180} r={10} />
            ) : board.entries.length === 0 || board.entries.every((e) => e.totalWords === 0 && e.totalDays === 0) ? (
              <EmptyState ico="🏆" title="还没有上榜数据，去学第一个单词抢占榜首吧" />
            ) : (
              <ol className="lb-list">
                {board.entries.map((e) => (
                  <li key={e.userId} className={`lb-row${e.isMe ? ' lb-me' : ''}`}>
                    <span className={`lb-rank${e.rank <= 3 ? ` lb-rank-${e.rank}` : ''}`}>
                      {e.rank === 1 ? '🥇' : e.rank === 2 ? '🥈' : e.rank === 3 ? '🥉' : e.rank}
                    </span>
                    <span className="lb-name">
                      {e.nickname}
                      <i className={`lb-tag${e.provider === 'wechat' ? ' lb-tag-wechat' : ''}`}>
                        {e.provider === 'wechat' ? '微信' : '体验'}
                      </i>
                      {e.isMe && <i className="lb-tag lb-tag-me">我</i>}
                    </span>
                    <span className="lb-metrics">
                      {e.totalWords}个单词 · 连续学习{e.currentStreak}天 · 累计学习{e.totalDays}天
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </div>

          <div className="stat-cards">
            <div className="stat-card">
              <div className="num">🔥{stats.streak}<small> 天</small></div>
              <div className="lbl">连续打卡</div>
            </div>
            <div className="stat-card">
              <div className="num">
                {stats.totalLearned}
                <small> 词</small>
              </div>
              <div className="lbl">累计学习</div>
            </div>
            <div className="stat-card">
              <div className="num">
                {stats.today.newCount}
                <small> 新</small> {stats.today.reviewCount}
                <small> 复</small>
              </div>
              <div className="lbl">今日</div>
            </div>
          </div>

          <div className="card">
            {stats.activeBook ? (
              <>
                <div className="card-title">《{stats.activeBook.name}》进度</div>
                <div className="book-progress-row" style={{ fontSize: 15 }}>
                  <ProgressBar value={stats.activeBook.learned} total={stats.activeBook.total} large />
                  <span style={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                    {stats.activeBook.learned}/{stats.activeBook.total} · {stats.activeBook.pct}%
                  </span>
                </div>
              </>
            ) : (
              <EmptyState ico="📚" title="还未激活词书" />
            )}
          </div>

          <div className="stats-two-col">
            <div className="card">
              <div className="card-title">近 7 天学习量</div>
              {hasNoRecord ? (
                <EmptyState ico="🌱" title="还没有学习记录，从今天开始吧" />
              ) : (
                <BarChart7 data={stats.last7} />
              )}
            </div>
            <div className="card">
              {cal ? (
                <CalendarGrid
                  month={cal.month}
                  days={cal.days}
                  today={cal.today}
                  onPrev={() => shiftMonth(-1)}
                  onNext={() => shiftMonth(1)}
                  canNext={canNext}
                />
              ) : (
                <Skeleton h={220} r={10} />
              )}
            </div>
          </div>
        </>
      )}
    </Page>
  )
}
