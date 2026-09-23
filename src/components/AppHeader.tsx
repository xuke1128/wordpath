import { type ReactNode } from 'react'
import { NavLink, Link } from 'react-router-dom'
import { useAuth } from '../state/AuthContext'

/** 径形小路 logo（线性几何风格）。 */
export function PathLogo({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 20c0-6 4-6 8-9s4-7 8-7"
        stroke="var(--primary)"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeDasharray="0.5 5"
      />
      <path
        d="M4 20c0-6 4-6 8-9s4-7 8-7"
        stroke="var(--primary)"
        strokeWidth="1.2"
        strokeLinecap="round"
        opacity="0.4"
      />
    </svg>
  )
}

const NAV_ITEMS = [
  { to: '/today', ico: '⌂', label: '今日' },
  { to: '/books', ico: '📚', label: '词书' },
  { to: '/stats', ico: '📊', label: '统计' },
  { to: '/settings', ico: '⚙', label: '设置' },
]

/** 登录后全局顶栏（学习页/引导页不渲染）。 */
export function AppHeader({ streak }: { streak?: number }) {
  const { me } = useAuth()
  return (
    <header className="app-header">
      <div className="app-header-inner">
        <Link to="/today" className="logo" aria-label="词径 首页">
          <PathLogo />
          词径
        </Link>
        <nav className="top-nav" aria-label="主导航">
          {NAV_ITEMS.map((n) => (
            <NavLink key={n.to} to={n.to} className={({ isActive }) => (isActive ? 'active' : '')}>
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="header-right">
          {typeof streak === 'number' && streak > 0 && (
            <Link to="/stats" className="streak-badge" aria-label={`连续打卡 ${streak} 天`}>
              🔥{streak}
            </Link>
          )}
          <Link to="/settings" className="avatar-btn" aria-label="设置" title={me?.user.nickname ?? ''}>
            {me?.user.provider === 'wechat' ? '🙂' : '🚀'}
          </Link>
        </div>
      </div>
    </header>
  )
}

/** 移动端底部 TabBar；桌面端由 CSS 隐藏（导航收进顶栏）。 */
export function TabBar() {
  return (
    <>
      <nav className="tabbar" aria-label="底部导航">
        {NAV_ITEMS.map((n) => (
          <NavLink key={n.to} to={n.to} className={({ isActive }) => (isActive ? 'active' : '')}>
            <span className="tab-ico" aria-hidden="true">
              {n.ico}
            </span>
            {n.label}
          </NavLink>
        ))}
      </nav>
      <div className="tabbar-spacer" />
    </>
  )
}

export function Page({ children, streak }: { children: ReactNode; streak?: number }) {
  return (
    <div className="app-shell">
      <AppHeader streak={streak} />
      <main className="page-main">{children}</main>
      <TabBar />
    </div>
  )
}
