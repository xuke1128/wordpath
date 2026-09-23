import { useCallback, useEffect, useRef, useState } from 'react'

export type SpeechAvailability = 'checking' | 'available' | 'unavailable'

/**
 * Web Speech API（PRD §3.7）：英文朗读，美音优先；全部手动触发。
 * 检测不到可用英文语音时返回 unavailable（按钮禁用并提示）。
 */
export function useSpeech(): {
  availability: SpeechAvailability
  speak: (text: string) => boolean
} {
  const [availability, setAvailability] = useState<SpeechAvailability>('checking')
  const voicesRef = useRef<SpeechSynthesisVoice[]>([])

  useEffect(() => {
    const synth = window.speechSynthesis
    if (!synth) {
      setAvailability('unavailable')
      return
    }
    const load = () => {
      const voices = synth.getVoices().filter((v) => v.lang?.toLowerCase().startsWith('en'))
      voicesRef.current = voices
      setAvailability(voices.length > 0 ? 'available' : 'unavailable')
    }
    load()
    // Chrome 异步加载 voices
    synth.addEventListener?.('voiceschanged', load)
    const retry = window.setTimeout(load, 600)
    return () => {
      synth.removeEventListener?.('voiceschanged', load)
      window.clearTimeout(retry)
    }
  }, [])

  const speak = useCallback(
    (text: string): boolean => {
      const synth = window.speechSynthesis
      if (!synth) return false
      const voices = voicesRef.current.length
        ? voicesRef.current
        : synth.getVoices().filter((v) => v.lang?.toLowerCase().startsWith('en'))
      if (voices.length === 0) return false
      const prefer =
        voices.find((v) => v.lang.toLowerCase() === 'en-us') ?? voices[0]
      synth.cancel()
      const utter = new SpeechSynthesisUtterance(text)
      utter.voice = prefer
      utter.lang = prefer.lang
      utter.rate = 0.9
      synth.speak(utter)
      return true
    },
    [],
  )

  return { availability, speak }
}
