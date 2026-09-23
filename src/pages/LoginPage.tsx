import { useEffect, useState } from 'react'
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { fetchAuthConfig, type AuthConfigResponse } from '../api/client'
import { useAuth } from '../state/AuthContext'
import { useToast } from '../state/ToastContext'
import { usePageTitle, SKIP_ONBOARDING_KEY } from '../App'
import { PathLogo } from '../components/AppHeader'
import { ErrorBlock } from '../components/ui'

/** P0 登录页：体验登录（默认唯一入口）+ 条件性微信入口（两态渲染防闪现）。 */
export function LoginPage() {
  usePageTitle('登录')
  const { me, loading, mockLogin } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const next = params.get('next') || ''
  const wechatFailed = params.get('wechat') === 'fail'

  const [config, setConfig] = useState<AuthConfigResponse | null>(null)
  const [configError, setConfigError] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    fetchAuthConfig()
      .then(setConfig)
      .catch(() => setConfigError(true))
  }, [])

  // 已登录访问 /login：重定向（F1-4）
  if (!loading && me) {
    if (!me.activeBook && sessionStorage.getItem(SKIP_ONBOARDING_KEY) !== '1') {
      return <Navigate to="/onboarding" replace />
    }
    return <Navigate to={next || '/today'} replace />
  }

  const onMockLogin = async () => {
    setSubmitting(true)
    try {
      const data = await mockLogin()
      toast.show(data.user.provider === 'mock' ? '已进入体验模式' : '欢迎回来', 'success')
      if (!data.activeBook) {
        navigate('/onboarding', { replace: true })
      } else {
        navigate(next || '/today', { replace: true })
      }
    } catch {
      toast.show('服务暂时不可用，请稍后重试', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-brand-ico">
          <PathLogo size={54} />
        </div>
        <h1 className="login-title">词径 WordPath</h1>
        <p className="login-tagline">从小学到考研，一条词径走到底</p>

        {wechatFailed && (
          <div style={{ marginBottom: 14 }}>
            <ErrorBlock message="微信登录未完成，可先用体验登录" />
          </div>
        )}

        <div className="login-btns">
          <button
            className="btn btn-primary btn-lg btn-block login-btn-main"
            onClick={onMockLogin}
            disabled={submitting || loading}
          >
            {submitting ? (
              <>
                <span className="spinner" /> 进入中…
              </>
            ) : (
              <>
                <span>🚀 体验登录</span>
                <span className="btn-sub">无需注册，直接开始</span>
              </>
            )}
          </button>

          {/* 微信入口两态：仅当服务端确认已配置时渲染（US2） */}
          {config?.wechat && (
            <button
              className="btn btn-block login-btn-wechat"
              onClick={() => {
                fetch('/api/auth/wechat/authorize')
                  .then((r) => (r.ok ? r.json() : Promise.reject(new Error('failed'))))
                  .then((d: { url: string }) => {
                    window.location.href = d.url
                  })
                  .catch(() => toast.show('服务暂时不可用，请稍后重试', 'error'))
              }}
            >
              💬 微信登录
            </button>
          )}

          {configError && <ErrorBlock message="服务暂时不可用，请稍后重试" />}
        </div>

        <p className="login-trust">免费开源 · 进度自动保存</p>
      </div>
    </div>
  )
}
