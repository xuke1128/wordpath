import { useState } from 'react'
import { useSpeech } from '../hooks/useSpeech'
import { useToast } from '../state/ToastContext'

/** 发音按钮（F11）：手动触发；不可用时禁用态 + 点击提示。 */
export function SpeakButton({ word, large }: { word: string; large?: boolean }) {
  const { availability, speak } = useSpeech()
  const toast = useToast()
  const [playing, setPlaying] = useState(false)
  const disabled = availability === 'unavailable'

  const onClick = () => {
    if (disabled) {
      toast.show('当前浏览器不支持语音朗读', 'error')
      return
    }
    if (speak(word)) {
      setPlaying(true)
      window.setTimeout(() => setPlaying(false), 700)
    } else {
      toast.show('当前浏览器不支持语音朗读', 'error')
    }
  }

  return (
    <button
      type="button"
      className={`speak-btn${large ? ' speak-btn-lg' : ''}${playing ? ' playing' : ''}`}
      onClick={onClick}
      disabled={disabled}
      aria-label={`朗读单词 ${word}${disabled ? '（不可用）' : ''}`}
      aria-disabled={disabled}
      title={disabled ? '当前浏览器不支持语音朗读' : '朗读单词'}
    >
      🔊
    </button>
  )
}
