import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, ApiError } from '../api/client'
import { useAuth } from '../state/AuthContext'
import { useToast } from '../state/ToastContext'
import { usePageTitle } from '../App'
import { ModeTabs, MODE_LABELS } from '../components/ModeTabs'
import { SpeakButton } from '../components/SpeakButton'
import { ConfirmDialog, ErrorBlock, Skeleton } from '../components/ui'
import type { AnswerResultDTO, QueueDTO, StudyMode, WordTranslation } from '../../shared/types'

function Meanings({ translations, center }: { translations: WordTranslation[]; center?: boolean }) {
  return (
    <div style={center ? { textAlign: 'center' } : undefined}>
      {translations.map((t, i) => (
        <div className="meaning-line" key={i}>
          {t.pos} {t.meaning}
        </div>
      ))}
    </div>
  )
}

const LETTERS = ['A', 'B', 'C', 'D']

/**
 * P3 学习页：全屏沉浸态；卡片/选择/拼写三变体共享任务队列（F5-F8、F11、F12）。
 * 判分、调度、打卡全部由服务端完成；本页只负责呈现与防误触。
 */
export function StudyPage() {
  usePageTitle('学习')
  const { me, refresh } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()

  const [mode, setMode] = useState<StudyMode>(me?.settings.lastMode ?? 'card')
  const [queue, setQueue] = useState<QueueDTO | null>(null)
  const [index, setIndex] = useState(0)
  const [flipped, setFlipped] = useState(false)
  const [choicePick, setChoicePick] = useState<number | null>(null)
  const [result, setResult] = useState<AnswerResultDTO | null>(null)
  const [spellText, setSpellText] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [loadError, setLoadError] = useState(false)
  const [submitError, setSubmitError] = useState(false)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [exitOpen, setExitOpen] = useState(false)
  const sessionDateRef = useRef<string | null>(null)
  const pendingAnswerRef = useRef<Record<string, unknown> | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const toastRef = useRef(toast)
  toastRef.current = toast

  const loadQueue = useCallback(async (m: StudyMode) => {
    setLoadError(false)
    try {
      const q = await api.get<QueueDTO>(`/api/study/queue?mode=${m}`)
      setQueue(q)
      if (sessionDateRef.current === null) sessionDateRef.current = q.date
      setProgress({ done: 0, total: q.items.length })
    } catch {
      setLoadError(true)
    }
  }, [])

  useEffect(() => {
    void loadQueue(mode)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const item = queue?.items[index] ?? null

  const resetItemState = () => {
    setFlipped(false)
    setChoicePick(null)
    setResult(null)
    setSpellText('')
    setSubmitError(false)
  }

  /** 判分成功后的公共处理：跨零点 / 打卡跳转 / 前进。返回是否已导航离开。 */
  const applyResult = useCallback(
    (resp: AnswerResultDTO, autoAdvance: boolean): boolean => {
      if (sessionDateRef.current && resp.progress.date !== sessionDateRef.current) {
        toastRef.current.show('已过零点，今日任务已刷新')
        navigate('/today', { replace: true })
        return true
      }
      setProgress({ done: resp.progress.done, total: resp.progress.total })
      if (resp.checkin) {
        void refresh()
        navigate('/study/complete', { replace: true })
        return true
      }
      if (autoAdvance) {
        resetItemState()
        setIndex((i) => i + 1)
      }
      return false
    },
    [navigate, refresh],
  )

  const submit = useCallback(
    async (payload: Record<string, unknown>) => {
      setSubmitting(true)
      setSubmitError(false)
      pendingAnswerRef.current = payload
      try {
        const resp = await api.post<AnswerResultDTO>('/api/study/answer', payload)
        if (payload.mode === 'card') {
          const q = payload.quality as number
          const n = resp.nextIntervalDays
          // 调度透明化：按下次复习间隔翻译成人话（设计 F5-4）
          toastRef.current.show(
            q >= 3 ? (n <= 1 ? '记下了 · 明天再见' : `记下了 · ${n} 天后再见`) : '别急 · 明天再见',
            'success',
          )
          window.setTimeout(() => applyResult(resp, true), 420)
        } else {
          setResult(resp)
          applyResult(resp, false) // 选择/拼写：展示解析，等「下一题」
        }
      } catch (err) {
        if (err instanceof ApiError && err.status === 400) {
          toastRef.current.show('任务已更新，请重新进入学习')
          navigate('/today', { replace: true })
          return
        }
        // 提交失败：错误条 + 重试，当前题保留不前进（设计 §4.3 状态）
        setSubmitError(true)
      } finally {
        setSubmitting(false)
      }
    },
    [applyResult, navigate],
  )

  const next = useCallback(() => {
    if (!result) return
    if (sessionDateRef.current && result.progress.date !== sessionDateRef.current) {
      toastRef.current.show('已过零点，今日任务已刷新')
      navigate('/today', { replace: true })
      return
    }
    resetItemState()
    setIndex((i) => i + 1)
  }, [result, navigate])

  // 模式切换：即时重拉（顺序稳定、位置不变），未提交作答作废（F8）
  const switchMode = (m: StudyMode) => {
    if (submitting || m === mode) return
    setMode(m)
    resetItemState()
    void loadQueue(m)
    toastRef.current.show(`已切换到${MODE_LABELS[m]}模式`)
  }

  // 键盘增强：Enter=翻转/下一题/提交拼写；1/2/3 自评；1-4 选项
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (submitting || exitOpen || !item) return
      if (e.key === 'Enter') {
        e.preventDefault()
        if (mode === 'card') {
          if (!flipped && !result) setFlipped(true)
        } else if (result) {
          next()
        } else if (mode === 'spelling' && spellText.trim()) {
          void submit({ wordId: item.wordId, mode: 'spelling', answer: spellText })
        }
        return
      }
      if (mode === 'card' && flipped && !result && ['1', '2', '3'].includes(e.key)) {
        const q = e.key === '1' ? 1 : e.key === '2' ? 3 : 5
        void submit({ wordId: item.wordId, mode: 'card', quality: q })
      }
      if (mode === 'choice' && !result && ['1', '2', '3', '4'].includes(e.key) && item.kind === 'choice') {
        const idx = Number(e.key) - 1
        if (idx < item.options.length) {
          setChoicePick(idx)
          void submit({ wordId: item.wordId, mode: 'choice', choiceIndex: idx })
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [submitting, exitOpen, item, mode, flipped, result, spellText, submit, next])

  // 拼写输入自动聚焦（F7）
  useEffect(() => {
    if (mode === 'spelling' && !result) inputRef.current?.focus()
  }, [mode, result, index])

  // 防御空队列：直接进入时队列已空 → 回今日页完成态
  if (queue && queue.items.length === 0) {
    return <RedirectToToday />
  }

  const total = progress?.total ?? 0
  const done = progress?.done ?? 0

  return (
    <div className="study-page">
      <div className="study-topbar">
        <button className="study-close" aria-label="退出学习" onClick={() => setExitOpen(true)}>
          ✕
        </button>
        <div className="progressbar" role="progressbar" aria-valuenow={done} aria-valuemin={0} aria-valuemax={total}>
          <div className="progressbar-fill" style={{ width: `${total ? Math.round((done / total) * 100) : 0}%` }} />
        </div>
        <span className="study-count">
          {done}/{total}
        </span>
      </div>

      <ModeTabs mode={mode} onChange={switchMode} />

      {submitError && (
        <div className="study-error">
          <ErrorBlock
            message="网络异常，答案未保存"
            onRetry={() => pendingAnswerRef.current && void submit(pendingAnswerRef.current)}
          />
        </div>
      )}

      <div className="study-content">
        {loadError && <ErrorBlock message="网络开小差了" onRetry={() => void loadQueue(mode)} />}
        {!queue && !loadError && (
          <div className="card-face">
            <Skeleton h={44} w="60%" style={{ margin: '18px auto' }} />
            <Skeleton h={18} w="40%" style={{ margin: '0 auto' }} />
          </div>
        )}

        {/* —— 变体 A：卡片认读（US5）—— */}
        {item && mode === 'card' && item.kind === 'card' && (
          <div className="study-item">
            <span className={`badge ${item.isNew ? 'badge-new' : 'badge-review'}`}>{item.isNew ? '新词' : '复习'}</span>
            {!flipped ? (
              <div
                className="card-face"
                style={{ marginTop: 12, cursor: 'pointer', textAlign: 'center', minHeight: 250 }}
                onClick={() => setFlipped(true)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') setFlipped(true)
                }}
                aria-label="点按卡片查看释义"
              >
                <div className="word-big">{item.headword}</div>
                <div className="center-row" style={{ marginTop: 8 }}>
                  <span className="phonetic">{item.phonetic}</span>
                  <SpeakButton word={item.headword} />
                </div>
                <div className="flip-hint">（点按卡片查看释义 · Enter）</div>
              </div>
            ) : (
              <div className="card-face" style={{ marginTop: 12 }}>
                <div className="center-row">
                  <div style={{ flex: 1 }}>
                    <div className="word-big" style={{ fontSize: 'clamp(28px, 8vw, 40px)' }}>
                      {item.headword}
                    </div>
                    <div className="phonetic">{item.phonetic}</div>
                  </div>
                  <SpeakButton word={item.headword} />
                </div>
                <div className="divider" />
                <Meanings translations={item.translations} />
                <div className="divider" />
                <div className="example-en">{item.exampleEn}</div>
                <div className="example-cn">{item.exampleCn}</div>
                <div className="rating-btns">
                  <button
                    className="rating-btn rating-forget"
                    disabled={submitting}
                    onClick={() => void submit({ wordId: item.wordId, mode: 'card', quality: 1 })}
                  >
                    😅 忘记<span className="kbd-hint">（1）</span>
                  </button>
                  <button
                    className="rating-btn rating-fuzzy"
                    disabled={submitting}
                    onClick={() => void submit({ wordId: item.wordId, mode: 'card', quality: 3 })}
                  >
                    🤔 模糊<span className="kbd-hint">（2）</span>
                  </button>
                  <button
                    className="rating-btn rating-know"
                    disabled={submitting}
                    onClick={() => void submit({ wordId: item.wordId, mode: 'card', quality: 5 })}
                  >
                    😄 认识<span className="kbd-hint">（3）</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* —— 变体 B：选择题（US6）—— */}
        {item && mode === 'choice' && item.kind === 'choice' && (
          <div className="study-item">
            <div className="choice-prompt">
              {item.direction === 'e2c' ? '选出正确的中文释义' : '选出对应的英文单词'}
            </div>
            {item.direction === 'e2c' ? (
              <div className="center-row">
                <div style={{ flex: 1 }}>
                  <div className="word-big" style={{ fontSize: 'clamp(30px, 9vw, 44px)' }}>
                    {item.stem.headword}
                  </div>
                  <div className="phonetic">{item.stem.phonetic}</div>
                </div>
                <SpeakButton word={item.stem.headword} />
              </div>
            ) : (
              <div className="card-face">
                <Meanings translations={item.stem.translations} center />
              </div>
            )}
            <div className="choice-options">
              {item.options.map((opt, i) => {
                const graded = result !== null
                const isCorrect = graded && i === result!.correctIndex
                const isPickedWrong = graded && choicePick === i && !isCorrect
                const cls = graded ? (isCorrect ? 'correct' : isPickedWrong ? 'wrong' : 'dimmed') : ''
                return (
                  <button
                    key={i}
                    className={`choice-option ${cls}`}
                    disabled={graded || submitting}
                    onClick={() => {
                      setChoicePick(i)
                      void submit({ wordId: item.wordId, mode: 'choice', choiceIndex: i })
                    }}
                  >
                    <span className="opt-letter">{LETTERS[i]}</span>
                    <span style={{ flex: 1 }}>{opt}</span>
                    {isCorrect && <span aria-hidden="true">✓</span>}
                    {isPickedWrong && <span aria-hidden="true">✗</span>}
                  </button>
                )
              })}
            </div>
            {result !== null && (
              <>
                {!result.correct && (
                  <div className="spell-feedback bad" style={{ marginTop: 12 }}>
                    正确答案是 {LETTERS[result.correctIndex ?? 0]}
                  </div>
                )}
                <div className="explain-card">
                  <div className="center-row" style={{ justifyContent: 'space-between' }}>
                    <b style={{ fontSize: 18 }}>{result.word.headword}</b>
                    <SpeakButton word={result.word.headword} />
                  </div>
                  <div className="phonetic" style={{ textAlign: 'left' }}>
                    {result.word.phonetic}
                  </div>
                  <Meanings translations={result.word.translations} />
                  <div className="example-en">{result.word.exampleEn}</div>
                  <div className="example-cn">{result.word.exampleCn}</div>
                </div>
                <div className="next-btn-wrap">
                  <button className="btn btn-primary btn-lg btn-block" onClick={next}>
                    下一题 →
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {/* —— 变体 C：拼写（US7）—— */}
        {item && mode === 'spelling' && item.kind === 'spelling' && (
          <div className="study-item">
            <div className="choice-prompt">拼出这个单词</div>
            <Meanings translations={item.translations} center />
            <div className="center-row" style={{ flexDirection: 'column', gap: 4, margin: '12px 0 18px' }}>
              {/* headword 不渲染，仅用于 TTS */}
              <SpeakButton word={item.headword} large />
              <span style={{ fontSize: 13, color: 'var(--text-sub)' }}>听发音</span>
            </div>
            <input
              ref={inputRef}
              className="spell-input"
              value={spellText}
              disabled={result !== null || submitting}
              placeholder="输入英文单词"
              aria-label="拼写输入"
              autoComplete="off"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              onChange={(e) => setSpellText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && spellText.trim() && !result && !submitting) {
                  void submit({ wordId: item.wordId, mode: 'spelling', answer: spellText })
                }
              }}
            />
            {result === null ? (
              <div className="next-btn-wrap">
                <button
                  className="btn btn-primary btn-lg btn-block"
                  disabled={!spellText.trim() || submitting}
                  onClick={() => void submit({ wordId: item.wordId, mode: 'spelling', answer: spellText })}
                >
                  {submitting ? (
                    <>
                      <span className="spinner" /> 判分中
                    </>
                  ) : (
                    '提交'
                  )}
                </button>
              </div>
            ) : result.correct ? (
              <>
                <div className="spell-feedback ok">正确 ✅</div>
                <div className="explain-card">
                  <div className="center-row" style={{ justifyContent: 'space-between' }}>
                    <b style={{ fontSize: 22 }}>{result.word.headword}</b>
                    <SpeakButton word={result.word.headword} />
                  </div>
                  <div className="phonetic" style={{ textAlign: 'left' }}>
                    {result.word.phonetic}
                  </div>
                </div>
                <div className="next-btn-wrap">
                  <button className="btn btn-primary btn-lg btn-block" onClick={next}>
                    下一题 →
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="spell-feedback bad">⚠ 再看看正确拼写</div>
                <div className="explain-card spell-compare">
                  <div>
                    你的答案：<span className="spell-word-wrong">{spellText.trim() || '（空）'}</span>
                  </div>
                  <div style={{ marginTop: 6 }}>
                    正确拼写：<span className="spell-word-right">{result.word.headword}</span>
                  </div>
                  <div className="phonetic" style={{ textAlign: 'left' }}>
                    {result.word.phonetic}
                  </div>
                </div>
                <div className="next-btn-wrap">
                  <button className="btn btn-primary btn-lg btn-block" onClick={next}>
                    下一题 →
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* F12 防误触退出确认 */}
      <ConfirmDialog
        open={exitOpen}
        title="学习还没完成"
        message={`已学的 ${done} 个词已保存，剩余任务仍保留在今日`}
        confirmText="退出"
        cancelText="继续学习"
        danger
        onConfirm={() => {
          setExitOpen(false)
          navigate('/today')
        }}
        onCancel={() => setExitOpen(false)}
      />
    </div>
  )
}

function RedirectToToday() {
  const navigate = useNavigate()
  useEffect(() => {
    navigate('/today', { replace: true })
  }, [navigate])
  return null
}
