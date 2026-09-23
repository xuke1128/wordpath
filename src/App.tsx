import { useEffect } from 'react'
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './state/AuthContext'
import { ToastProvider } from './state/ToastContext'
import { LoginPage } from './pages/LoginPage'
import { OnboardingPage } from './pages/OnboardingPage'
import { TodayPage } from './pages/TodayPage'
import { StudyPage } from './pages/StudyPage'
import { CompletePage } from './pages/CompletePage'
import { BooksPage } from './pages/BooksPage'
import { StatsPage } from './pages/StatsPage'
import { SettingsPage } from './pages/SettingsPage'
import { NotFoundPage } from './pages/NotFoundPage'
import { ConfirmDialog } from './components/ui'
import { Page } from './components/AppHeader'

export const SKIP_ONBOARDING_KEY = 'wp_skip_onboarding'

function PageLoading() {
  return (
    <Page>
      <div style={{ padding: '12px 0' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="skeleton" style={{ height: 160 }} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div className="skeleton" style={{ height: 110 }} />
            <div className="skeleton" style={{ height: 110 }} />
          </div>
        </div>
      </div>
    </Page>
  )
}

/** 登录保护路由 + 首次引导守卫（F1/F2）。 */
function RequireAuth({ children }: { children: React.ReactNode }) {
  const { me, loading } = useAuth()
  const location = useLocation()
  if (loading) return <PageLoading />
  if (!me) {
    const next = encodeURIComponent(location.pathname + location.search)
    return <Navigate to={`/login?next=${next}`} replace />
  }
  const skipped = sessionStorage.getItem(SKIP_ONBOARDING_KEY) === '1'
  if (!me.activeBook && !skipped && location.pathname !== '/onboarding') {
    return <Navigate to="/onboarding" replace />
  }
  return <>{children}</>
}

/** 会话过期弹层（F1-5）。 */
function SessionExpiredDialog() {
  const { expired, dismissExpired } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  if (!expired) return null
  return (
    <ConfirmDialog
      open
      title="登录已过期"
      message="请重新登录后继续，进度已自动保存"
      confirmText="重新登录"
      cancelText="关闭"
      onConfirm={() => {
        dismissExpired()
        navigate(`/login?next=${encodeURIComponent(location.pathname)}`)
      }}
      onCancel={dismissExpired}
    />
  )
}

function Shell() {
  return (
    <>
      <SessionExpiredDialog />
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/onboarding"
          element={
            <RequireAuth>
              <OnboardingPage />
            </RequireAuth>
          }
        />
        <Route
          path="/today"
          element={
            <RequireAuth>
              <TodayPage />
            </RequireAuth>
          }
        />
        <Route
          path="/study"
          element={
            <RequireAuth>
              <StudyPage />
            </RequireAuth>
          }
        />
        <Route
          path="/study/complete"
          element={
            <RequireAuth>
              <CompletePage />
            </RequireAuth>
          }
        />
        <Route
          path="/books"
          element={
            <RequireAuth>
              <BooksPage />
            </RequireAuth>
          }
        />
        <Route
          path="/stats"
          element={
            <RequireAuth>
              <StatsPage />
            </RequireAuth>
          }
        />
        <Route
          path="/settings"
          element={
            <RequireAuth>
              <SettingsPage />
            </RequireAuth>
          }
        />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </>
  )
}

export default function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <Shell />
      </AuthProvider>
    </ToastProvider>
  )
}

/** 供守卫外使用：确保任意未匹配路径也有壳。 */
export function usePageTitle(title: string) {
  useEffect(() => {
    document.title = title ? `${title} · 词径` : '词径 WordPath'
  }, [title])
}
