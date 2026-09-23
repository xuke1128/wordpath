import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api/client'
import { useAuth } from '../state/AuthContext'
import { useToast } from '../state/ToastContext'
import { usePageTitle, SKIP_ONBOARDING_KEY } from '../App'
import { BookCard } from '../components/BookCard'
import { QuantityPicker } from '../components/QuantityPicker'
import { ErrorBlock, Skeleton } from '../components/ui'
import type { BookDTO } from '../../shared/types'

/** P1 首次引导（全屏两步，无 TabBar）：① 选词书 → ② 每日新词量。 */
export function OnboardingPage() {
  usePageTitle('开始你的词径')
  const { me, refresh } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()

  const [step, setStep] = useState<1 | 2>(1)
  const [books, setBooks] = useState<BookDTO[] | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [bookId, setBookId] = useState<string>('')
  const [qty, setQty] = useState(20)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    api
      .get<{ books: BookDTO[] }>('/api/books')
      .then((d) => setBooks(d.books))
      .catch(() => setLoadError(true))
  }, [])

  // 已有激活词书：无需引导
  useEffect(() => {
    if (me?.activeBook) navigate('/today', { replace: true })
  }, [me?.activeBook, navigate])

  const finish = async () => {
    setSaving(true)
    try {
      await api.post(`/api/books/${bookId}/activate`)
      await api.patch('/api/me/settings', { dailyNewLimit: qty })
      sessionStorage.removeItem(SKIP_ONBOARDING_KEY)
      await refresh()
      const name = books?.find((b) => b.id === bookId)?.name ?? ''
      toast.show(`已选《${name}》，今日任务已备好`, 'success')
      navigate('/today', { replace: true })
    } catch {
      toast.show('保存失败，请重试', 'error')
      setSaving(false)
    }
  }

  const skip = () => {
    sessionStorage.setItem(SKIP_ONBOARDING_KEY, '1')
    navigate('/today', { replace: true })
  }

  return (
    <div className="app-shell">
      <main className="page-main" style={{ maxWidth: 640 }}>
        <div className="onboard-steps" aria-label={`第 ${step} 步，共 2 步`}>
          <span className={`step${step === 1 ? ' current' : ''}`}>{step === 1 ? '①' : '①'} 选词书</span>
          <span className="step-line" />
          <span className={`step${step === 2 ? ' current' : ''}`}>{step === 2 ? '②' : '②'} 每日新词量</span>
        </div>

        {step === 1 && (
          <>
            <h1 className="page-title">选一本词书，开始你的词径</h1>
            <p className="page-sub">切换词书不打断学习，各书进度独立保留</p>
            {loadError && (
              <ErrorBlock message="网络开小差了" onRetry={() => window.location.reload()} />
            )}
            {!books && !loadError && (
              <div className="book-list">
                {[0, 1, 2, 3].map((i) => (
                  <Skeleton key={i} h={92} r={16} />
                ))}
              </div>
            )}
            {books && (
              <div className="book-list" role="radiogroup" aria-label="选择词书">
                {books.map((b) => (
                  <BookCard
                    key={b.id}
                    book={b}
                    selectMode
                    selected={bookId === b.id}
                    onSelect={() => setBookId(b.id)}
                  />
                ))}
              </div>
            )}
            <div className="sheet-actions">
              <button className="btn btn-primary btn-lg btn-block" disabled={!bookId} onClick={() => setStep(2)}>
                下一步 →
              </button>
              <button className="link-btn" style={{ margin: '0 auto' }} onClick={skip}>
                跳过，稍后选
              </button>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <h1 className="page-title">每天学多少新词？</h1>
            <p className="page-sub" style={{ marginBottom: 8 }}>
              可在设置中随时调整
            </p>
            <div className="card">
              <QuantityPicker
                value={qty}
                onChange={setQty}
                bookName={books?.find((b) => b.id === bookId)?.name}
              />
            </div>
            <div className="sheet-actions">
              <button className="btn btn-primary btn-lg btn-block" disabled={saving} onClick={finish}>
                {saving ? (
                  <>
                    <span className="spinner" /> 保存中
                  </>
                ) : (
                  '完成，开始学习 →'
                )}
              </button>
              <button className="link-btn" style={{ margin: '0 auto' }} onClick={() => setStep(1)}>
                ← 上一步
              </button>
            </div>
          </>
        )}
      </main>
    </div>
  )
}
