import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../api/client'
import { useAuth } from '../state/AuthContext'
import { useToast } from '../state/ToastContext'
import { usePageTitle } from '../App'
import { Page } from '../components/AppHeader'
import { QuantityPicker } from '../components/QuantityPicker'
import { ConfirmDialog, Sheet } from '../components/ui'

/** P7 设置页：学习计划（新词量/激活词书）+ 账号（退出确认）+ 关于。 */
export function SettingsPage() {
  usePageTitle('设置')
  const { me, refresh, logout } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const [sheetOpen, setSheetOpen] = useState(false)
  const [logoutOpen, setLogoutOpen] = useState(false)
  const [qty, setQty] = useState(me?.settings.dailyNewLimit ?? 20)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (me) setQty(me.settings.dailyNewLimit)
  }, [me])

  const saveQty = async (n: number) => {
    setSaving(true)
    try {
      await api.patch('/api/me/settings', { dailyNewLimit: n })
      await refresh()
      setSheetOpen(false)
      toast.show(`已更新，每日新词 ${n} 个`, 'success')
    } catch {
      toast.show('保存失败，请重试', 'error')
    } finally {
      setSaving(false)
    }
  }

  const doLogout = async () => {
    await logout()
    setLogoutOpen(false)
    navigate('/login', { replace: true })
  }

  return (
    <Page>
      <h1 className="page-title">设置</h1>

      <div className="settings-group-label">学习计划</div>
      <div className="card settings-card">
        <button className="settings-row" onClick={() => setSheetOpen(true)}>
          <span className="row-label">每日新词量</span>
          <span className="row-value">
            {me?.settings.dailyNewLimit ?? '—'} 个 <span style={{ color: 'var(--text-disabled)' }}>›</span>
          </span>
        </button>
        <Link to="/books" className="settings-row">
          <span className="row-label">当前激活词书</span>
          <span className="row-value">
            {me?.activeBook ? `《${me.activeBook.name}》` : '未选择'} <span style={{ color: 'var(--text-disabled)' }}>›</span>
          </span>
        </Link>
      </div>

      <div className="settings-group-label">账号</div>
      <div className="card settings-card">
        <div className="account-row">
          <div className="avatar-btn" style={{ width: 46, height: 46, fontSize: 22 }}>
            {me?.user.provider === 'wechat' ? '🙂' : '🚀'}
          </div>
          <div className="account-info">
            <div className="account-name">
              {me?.user.nickname ?? ''}
            </div>
            <div className="account-provider">
              登录方式：{me?.user.provider === 'wechat' ? '微信登录' : '体验登录'}
            </div>
          </div>
        </div>
        <button className="settings-row danger" onClick={() => setLogoutOpen(true)}>
          退出登录
        </button>
      </div>

      <div className="settings-group-label">关于</div>
      <div className="card settings-card">
        <div className="about-note">词径 WordPath v1.1.0 · 免费开源 · 开源协议见仓库 LICENSE</div>
      </div>

      <Sheet open={sheetOpen} title="每日新词量" onClose={() => setSheetOpen(false)}>
        <QuantityPicker
          value={qty}
          onChange={setQty}
          onSave={saveQty}
          saving={saving}
          bookName={me?.activeBook?.name}
        />
      </Sheet>

      <ConfirmDialog
        open={logoutOpen}
        title="退出登录"
        message="退出后进度会保留，下次登录可继续"
        confirmText="退出登录"
        cancelText="取消"
        danger
        onConfirm={doLogout}
        onCancel={() => setLogoutOpen(false)}
      />
    </Page>
  )
}
