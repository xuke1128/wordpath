import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api, ApiError } from '../api/client'
import { useAuth } from '../state/AuthContext'
import { useToast } from '../state/ToastContext'
import { usePageTitle } from '../App'
import { Page } from '../components/AppHeader'
import { QuantityPicker } from '../components/QuantityPicker'
import { ConfirmDialog, Sheet } from '../components/ui'

/** 客户端缩图：cover 裁剪到 256×256 JPEG（顺带去除 EXIF），返回 dataURL。 */
async function fileToAvatarDataUrl(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file)
  const size = 256
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!
  const scale = Math.max(size / bitmap.width, size / bitmap.height)
  const w = bitmap.width * scale
  const h = bitmap.height * scale
  ctx.drawImage(bitmap, (size - w) / 2, (size - h) / 2, w, h)
  return canvas.toDataURL('image/jpeg', 0.85)
}

/** 认领/编辑昵称与 PIN 的弹层表单。 */
function ClaimSheet({
  open,
  claimed,
  currentNickname,
  onClose,
  onDone,
}: {
  open: boolean
  claimed: boolean
  currentNickname: string
  onClose: () => void
  onDone: () => void
}) {
  const toast = useToast()
  const [nickname, setNickname] = useState(currentNickname)
  const [pin, setPin] = useState('')
  const [pin2, setPin2] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) {
      setNickname(claimed ? currentNickname : '')
      setPin('')
      setPin2('')
    }
  }, [open, claimed, currentNickname])

  const submit = async () => {
    if (saving) return
    if (!nickname.trim() || pin.length < 4) {
      toast.show('昵称不能为空，PIN 至少 4 位', 'error')
      return
    }
    if (pin !== pin2) {
      toast.show('两次输入的 PIN 不一致', 'error')
      return
    }
    setSaving(true)
    try {
      await api.post('/api/account/claim', { nickname: nickname.trim(), pin })
      toast.show(claimed ? '已更新昵称与 PIN' : '认领成功！换设备可用昵称+PIN 找回进度', 'success')
      onDone()
      onClose()
    } catch (err) {
      const msg = err instanceof ApiError && err.message ? err.message : '保存失败，请重试'
      toast.show(msg, 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Sheet open={open} title={claimed ? '编辑昵称与 PIN' : '认领账号'} onClose={onClose}>
      <div className="form-fields">
        <label className="field-label" htmlFor="claim-nickname">
          昵称（排行榜展示，1-16 个字符）
        </label>
        <input
          id="claim-nickname"
          className="form-input"
          value={nickname}
          maxLength={16}
          placeholder="给自己起个名字"
          onChange={(e) => setNickname(e.target.value)}
        />
        <label className="field-label" htmlFor="claim-pin">
          PIN（4-12 位字母或数字，用于找回）
        </label>
        <input
          id="claim-pin"
          className="form-input"
          value={pin}
          type="password"
          maxLength={12}
          placeholder="4-12 位字母或数字"
          onChange={(e) => setPin(e.target.value)}
        />
        <label className="field-label" htmlFor="claim-pin2">
          再输入一次 PIN
        </label>
        <input
          id="claim-pin2"
          className="form-input"
          value={pin2}
          type="password"
          maxLength={12}
          placeholder="再输入一次"
          onChange={(e) => setPin2(e.target.value)}
        />
        {!claimed && <p className="hint-info">认领后：换设备 / 清理浏览器后，用昵称+PIN 找回进度并继续上榜</p>}
        <button className="btn btn-primary btn-lg btn-block" disabled={saving} onClick={() => void submit()}>
          {saving ? '保存中…' : claimed ? '保存修改' : '认领'}
        </button>
      </div>
    </Sheet>
  )
}

/** P7 设置页：学习计划 + 账号（头像/认领/退出）+ 关于。 */
export function SettingsPage() {
  usePageTitle('设置')
  const { me, refresh, logout } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const [sheetOpen, setSheetOpen] = useState(false)
  const [logoutOpen, setLogoutOpen] = useState(false)
  const [claimOpen, setClaimOpen] = useState(false)
  const [qty, setQty] = useState(me?.settings.dailyNewLimit ?? 20)
  const [saving, setSaving] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

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

  const uploadAvatar = async (file: File | undefined) => {
    if (!file || !me) return
    try {
      const image = await fileToAvatarDataUrl(file)
      await api.post('/api/me/avatar', { image })
      await refresh()
      toast.show('头像已更新', 'success')
    } catch (err) {
      const msg = err instanceof ApiError && err.message ? err.message : '上传失败，请换张图片试试'
      toast.show(msg, 'error')
    } finally {
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const removeAvatar = async () => {
    try {
      await api.delete('/api/me/avatar')
      await refresh()
      toast.show('已移除头像', 'success')
    } catch {
      toast.show('操作失败，请重试', 'error')
    }
  }

  const doLogout = async () => {
    await logout()
    setLogoutOpen(false)
    navigate('/login', { replace: true })
  }

  const user = me?.user
  const avatarContent = user?.hasAvatar ? (
    <img className="avatar-img" src={`/api/avatar/${user.id}`} alt="我的头像" />
  ) : user?.provider === 'wechat' ? (
    '🙂'
  ) : (
    '🚀'
  )

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
          <button
            className="avatar-btn"
            style={{ width: 46, height: 46, fontSize: 22 }}
            aria-label="更换头像"
            title="点击更换头像"
            onClick={() => fileRef.current?.click()}
          >
            {avatarContent}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/*"
            hidden
            onChange={(e) => void uploadAvatar(e.target.files?.[0])}
          />
          <div className="account-info">
            <div className="account-name">
              {user?.nickname ?? ''}
              {user?.claimed && <i className="lb-tag lb-tag-me">已认领</i>}
            </div>
            <div className="account-provider">
              登录方式：{user?.provider === 'wechat' ? '微信登录' : '体验登录'}
              {user && !user.claimed && (
                <>
                  {' · '}
                  <button className="link-btn" onClick={() => setClaimOpen(true)}>
                    认领账号
                  </button>
                </>
              )}
              {user?.claimed && (
                <>
                  {' · '}
                  <button className="link-btn" onClick={() => setClaimOpen(true)}>
                    编辑
                  </button>
                </>
              )}
              {user?.hasAvatar && (
                <>
                  {' · '}
                  <button className="link-btn" onClick={() => void removeAvatar()}>
                    移除头像
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
        <button className="settings-row danger" onClick={() => setLogoutOpen(true)}>
          退出登录
        </button>
      </div>

      <div className="settings-group-label">关于</div>
      <div className="card settings-card">
        <div className="about-note">词径 WordPath v1.3.0 · 免费开源 · 开源协议见仓库 LICENSE</div>
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

      <ClaimSheet
        open={claimOpen}
        claimed={user?.claimed ?? false}
        currentNickname={user?.nickname ?? ''}
        onClose={() => setClaimOpen(false)}
        onDone={() => void refresh()}
      />

      <ConfirmDialog
        open={logoutOpen}
        title="退出登录"
        message={
          user?.claimed
            ? '退出后进度会保留，回来可用「昵称+PIN」或本设备直接登录'
            : '退出后进度会保留，下次登录可继续。认领账号后可跨设备找回'
        }
        confirmText="退出登录"
        cancelText="取消"
        danger
        onConfirm={doLogout}
        onCancel={() => setLogoutOpen(false)}
      />
    </Page>
  )
}
