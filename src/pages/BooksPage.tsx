import { useCallback, useEffect, useState } from 'react'
import { api } from '../api/client'
import { useAuth } from '../state/AuthContext'
import { useToast } from '../state/ToastContext'
import { usePageTitle } from '../App'
import { Page } from '../components/AppHeader'
import { BookCard } from '../components/BookCard'
import { EmptyState, ErrorBlock, Skeleton } from '../components/ui'
import type { BookDTO } from '../../shared/types'

/** P5 词书页：浏览 6 本学段词书并激活（F3：切换不弹确认，toast 可感知）。 */
export function BooksPage() {
  usePageTitle('词书')
  const { refresh } = useAuth()
  const toast = useToast()
  const [books, setBooks] = useState<BookDTO[] | null>(null)
  const [error, setError] = useState(false)
  const [activatingId, setActivatingId] = useState<string | null>(null)

  const load = useCallback(() => {
    setError(false)
    api
      .get<{ books: BookDTO[] }>('/api/books')
      .then((d) => setBooks(d.books))
      .catch(() => setError(true))
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const activate = async (b: BookDTO) => {
    if (activatingId) return
    setActivatingId(b.id)
    try {
      await api.post(`/api/books/${b.id}/activate`)
      await refresh()
      toast.show(`已切换到《${b.name}》，原词书进度已保留`, 'success')
      load()
    } catch {
      toast.show('切换失败，请重试', 'error')
    } finally {
      setActivatingId(null)
    }
  }

  return (
    <Page>
      <h1 className="page-title">词书</h1>
      <p className="page-sub">切换词书不打断学习，各书进度独立保留</p>

      {error && <ErrorBlock message="网络开小差了" onRetry={load} />}
      {!books && !error && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} h={120} r={16} />
          ))}
        </div>
      )}
      {books && books.length === 0 && (
        <div className="card">
          <EmptyState ico="📚" title="暂无词书" desc="请先运行种子数据初始化" />
        </div>
      )}
      {books && books.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {books.map((b) => (
            <BookCard key={b.id} book={b} activating={activatingId === b.id} onActivate={activate} />
          ))}
        </div>
      )}
    </Page>
  )
}
