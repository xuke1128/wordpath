import type { FastifyInstance } from 'fastify'
import type { DB } from '../db/connection'
import * as repo from '../db/repo'
import { requireAuth } from '../auth/session'
import { getLeaderboard, getStreak } from '../study-service'
import { addDays, daysInMonth, isMonthStr, monthOf, todayInShanghai } from '../core/dates'
import type { CalendarDTO, LeaderboardDTO, StatsDTO } from '../../shared/types'

export function registerStatsRoutes(app: FastifyInstance, db: DB): void {
  const auth = requireAuth(db)

  app.get('/api/stats', { preHandler: auth }, async (request): Promise<StatsDTO> => {
    const user = request.user!
    const today = todayInShanghai()

    const streak = getStreak(db, user.id, today)
    const totalLearned = repo.countTotalLearned(db, user.id)
    const counts = repo.todayCounts(db, user.id, today)

    let activeBook: StatsDTO['activeBook'] = null
    if (user.active_book_id) {
      const book = repo.getBook(db, user.active_book_id)
      if (book) {
        const total = repo.bookWordCount(db, book.id)
        const learned = repo.countLearnedByBook(db, user.id).get(book.id) ?? 0
        activeBook = {
          id: book.id,
          name: book.name,
          learned,
          total,
          pct: total > 0 ? Math.round((learned / total) * 100) : 0,
        }
      }
    }

    // 近 7 天（含今日）：口径 = 当日完成任务项数（review_logs 聚合，设计 §7 风险 4）
    const last7: StatsDTO['last7'] = []
    const rangeCounts = repo.countsByDateRange(db, user.id, addDays(today, -6), today)
    for (let i = 6; i >= 0; i--) {
      const date = addDays(today, -i)
      const c = rangeCounts.get(date)
      last7.push({
        date,
        newCount: c?.newCount ?? 0,
        reviewCount: c?.reviewCount ?? 0,
        total: (c?.newCount ?? 0) + (c?.reviewCount ?? 0),
      })
    }

    return {
      streak,
      totalLearned,
      today: { newCount: counts.newCount, reviewCount: counts.reviewCount },
      activeBook,
      last7,
    }
  })

  app.get('/api/stats/leaderboard', { preHandler: auth }, async (request): Promise<LeaderboardDTO> => {
    return getLeaderboard(db, todayInShanghai(), request.user!.id)
  })

  app.get('/api/stats/calendar', { preHandler: auth }, async (request, reply): Promise<CalendarDTO | void> => {
    const user = request.user!
    const today = todayInShanghai()
    const query = request.query as { month?: string }
    const month = query.month && query.month.trim() !== '' ? query.month : monthOf(today)
    if (!isMonthStr(month)) {
      reply.code(400).send({ error: 'BAD_MONTH' })
      return
    }
    // 未来月份不返回日历数据（前端同时禁用按钮，双保险）
    if (month > monthOf(today)) {
      return { month, today, days: [] }
    }
    const checked = repo.listCheckinDates(db, user.id)
    return {
      month,
      today,
      days: daysInMonth(month).map((date) => ({ date, checked: checked.has(date) })),
    }
  })
}
