import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api/client'
import { usePageTitle } from '../App'
import { ErrorBlock } from '../components/ui'
import type { TodayDTO } from '../../shared/types'

/** P4 完成结算页：自动打卡 + streak + 数据小结（F9）。 */
export function CompletePage() {
  usePageTitle('今日任务完成')
  const [data, setData] = useState<TodayDTO | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    api
      .get<TodayDTO>('/api/today')
      .then(setData)
      .catch(() => setError(true))
  }, [])

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
              <Link to="/stats" className="btn btn-primary btn-lg btn-block">
                查看统计 →
              </Link>
              <Link to="/today" className="btn btn-secondary btn-block">
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
    </div>
  )
}
