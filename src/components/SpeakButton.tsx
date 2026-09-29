import { useRef, useState } from 'react'
import { useSpeech } from '../hooks/useSpeech'
import { useToast } from '../state/ToastContext'

/** 发音按钮（F11）：手动触发；在线真人发音，失败回退系统 TTS，再失败才提示。 */
export function SpeakButton({ word, large }: { word: string; large?: boolean }) {
  const { speak } = useSpeech()
  const toast = useToast()
  const [playing, setPlaying] = useState(false)
  const failedRef = useRef(false)

  const onClick = () => {
    setPlaying(true)
    window.setTimeout(() => setPlaying(false), 700)
    void speak(word).then((ok) => {
      if (!ok && !failedRef.current) {
        failedRef.current = true
        toast.show('发音播放失败，请检查网络后重试', 'error')
      }
    })
  }

  return (
    <button
      type="button"
      className={`speak-btn${large ? ' speak-btn-lg' : ''}${playing ? ' playing' : ''}`}
      onClick={onClick}
      aria-label={`朗读单词 ${word}`}
      title="朗读单词"
    >
      🔊
    </button>
  )
}
