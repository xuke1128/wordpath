import { useState } from 'react'
import type { StatsDTO } from '../../shared/types'

/** 近 7 天柱状图（纯样式实现）：柱=当日完成项数；今日柱径绿；点按出明细。 */
export function BarChart7({ data }: { data: StatsDTO['last7'] }) {
  const [selected, setSelected] = useState<number | null>(null)
  const max = Math.max(1, ...data.map((d) => d.total))
  const sel = selected !== null ? data[selected] : null

  return (
    <div>
      <div className="bar-chart" role="img" aria-label="近 7 天学习量柱状图">
        {data.map((d, i) => {
          const date = new Date(`${d.date}T12:00:00Z`)
          const label = `${date.getUTCMonth() + 1}/${date.getUTCDate()}`
          const isToday = i === data.length - 1
          return (
            <div key={d.date} className="bar-col">
              <span className="bar-val">{d.total > 0 ? d.total : ''}</span>
              <button
                type="button"
                className={`bar${isToday ? ' today' : ''}`}
                style={{ height: `${Math.max(4, (d.total / max) * 100)}%` }}
                aria-label={`${label} 完成 ${d.total} 项`}
                onClick={() => setSelected(selected === i ? null : i)}
              />
              <span className="bar-date">{label}</span>
            </div>
          )
        })}
      </div>
      <div className="bar-detail" aria-live="polite">
        {sel ? `${sel.date.slice(5).replace('-', '/')}：新学 ${sel.newCount} · 复习 ${sel.reviewCount}` : '点按柱形查看当日明细'}
      </div>
    </div>
  )
}

const WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日']

/** 打卡日历（P6）：月历网格、打卡主色圆底、今日描边、‹›切月、未来月禁用。 */
export function CalendarGrid({
  month,
  days,
  today,
  onPrev,
  onNext,
  canNext,
}: {
  month: string
  days: Array<{ date: string; checked: boolean }>
  today: string
  onPrev: () => void
  onNext: () => void
  canNext: boolean
}) {
  const [y, m] = month.split('-').map(Number)
  const first = new Date(Date.UTC(y, m - 1, 1, 12))
  const leadBlanks = (first.getUTCDay() + 6) % 7 // 周一为第一列
  return (
    <div>
      <div className="cal-header">
        <button className="cal-nav" onClick={onPrev} aria-label="上一月">
          ‹
        </button>
        <span className="cal-month">{y}年{m}月</span>
        <button className="cal-nav" onClick={onNext} disabled={!canNext} aria-label="下一月" aria-disabled={!canNext}>
          ›
        </button>
      </div>
      <div className="cal-grid">
        {WEEKDAYS.map((w) => (
          <span key={w} className="cal-week">
            {w}
          </span>
        ))}
        {Array.from({ length: leadBlanks }).map((_, i) => (
          <span key={`b${i}`} className="cal-cell blank" aria-hidden="true" />
        ))}
        {days.map((d) => {
          const dom = Number(d.date.slice(8))
          return (
            <span
              key={d.date}
              className={`cal-cell${d.checked ? ' checked' : ''}${d.date === today ? ' today' : ''}`}
              title={d.checked ? `${d.date} 已打卡` : d.date}
              aria-label={`${d.date}${d.checked ? ' 已打卡' : ''}`}
            >
              {dom}
            </span>
          )
        })}
      </div>
      <div className="cal-legend">
        <span>● 已打卡</span>
        <span>◌ 今日</span>
      </div>
    </div>
  )
}
