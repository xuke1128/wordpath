import { useEffect, useState } from 'react'

export const QUICK_VALUES = [5, 10, 20, 30, 50]

/**
 * 新词量控件（P1 步骤2 / F4 弹层）：滑杆 5-100 步长 5 + 数字输入 + 快捷档 chips。
 * 越界标红禁存；previewFn 用于实时预览「今日新词将变为 X 个」。
 */
export function QuantityPicker({
  value,
  onChange,
  onSave,
  saving,
  previewFn,
  bookName,
}: {
  value: number
  onChange: (v: number) => void
  onSave?: (v: number) => void
  saving?: boolean
  previewFn?: (v: number) => string
  bookName?: string
}) {
  const [text, setText] = useState(String(value))
  const parsed = Number.parseInt(text, 10)
  const valid = Number.isInteger(parsed) && parsed >= 5 && parsed <= 100

  useEffect(() => setText(String(value)), [value])

  const updateText = (raw: string) => {
    setText(raw)
    const n = Number.parseInt(raw, 10)
    if (Number.isInteger(n) && n >= 5 && n <= 100) onChange(n)
  }

  return (
    <div>
      {bookName && (
        <div style={{ textAlign: 'center', color: 'var(--text-sub)', fontSize: 14, marginBottom: 4 }}>
          《{bookName}》
        </div>
      )}
      <div className="qty-value-row">
        <input
          className={`qty-input${valid ? '' : ' invalid'}`}
          aria-label="每日新词量"
          aria-invalid={!valid}
          inputMode="numeric"
          value={text}
          onChange={(e) => updateText(e.target.value)}
          onBlur={() => {
            if (!valid) {
              setText(String(value))
              onChange(value)
            }
          }}
        />
        <span style={{ color: 'var(--text-sub)' }}>个/天</span>
      </div>
      <input
        type="range"
        min={5}
        max={100}
        step={5}
        value={valid ? parsed : 20}
        aria-label="每日新词量滑杆"
        onChange={(e) => updateText(e.target.value)}
      />
      <div className="qty-chips">
        {QUICK_VALUES.map((q) => (
          <button
            key={q}
            type="button"
            className={`chip${parsed === q ? ' active' : ''}`}
            onClick={() => updateText(String(q))}
          >
            {q}
          </button>
        ))}
        <button
          type="button"
          className={`chip${valid && !QUICK_VALUES.includes(parsed) ? ' active' : ''}`}
          onClick={() => {
            const el = document.querySelector<HTMLInputElement>('.qty-input')
            el?.focus()
            el?.select()
          }}
        >
          自定义
        </button>
      </div>
      {previewFn && (
        <div className="qty-preview">
          {valid ? previewFn(parsed) : <span style={{ color: 'var(--danger)' }}>请输入 5-100 之间的整数</span>}
        </div>
      )}
      <div className="hint-info">
        <span aria-hidden="true">ℹ</span>
        <span>复习量由记忆算法自动安排，无需设置。学习会话进行中调整时，下次进入学习生效。</span>
      </div>
      {onSave && (
        <div className="sheet-actions">
          <button className="btn btn-primary btn-lg" disabled={!valid || saving} onClick={() => valid && onSave(parsed)}>
            {saving ? (
              <>
                <span className="spinner" /> 保存中
              </>
            ) : (
              '保存'
            )}
          </button>
        </div>
      )}
    </div>
  )
}
