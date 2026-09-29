/**
 * 单词发音（v1.3.3）：在线真人发音音频优先，系统 TTS 兜底。
 * - 音频源：有道词典发音接口（国内可达、真人美音），<audio> 播放无 CORS 限制；
 *   微信内置浏览器等无 TTS 引擎的环境也能出声。
 * - 音频播放失败（断网/接口异常）时回退 Web Speech API；两者都失败返回 false。
 */

let audioEl: HTMLAudioElement | null = null

function playPronunciationAudio(word: string): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      audioEl?.pause()
    } catch {
      // 忽略暂停失败
    }
    const el = audioEl ?? new Audio()
    audioEl = el
    let settled = false
    const done = (ok: boolean) => {
      if (settled) return
      settled = true
      el.removeEventListener('error', onError)
      resolve(ok)
    }
    const onError = () => done(false)
    el.addEventListener('error', onError)
    el.src = `https://dict.youdao.com/dictvoice?type=2&audio=${encodeURIComponent(word)}&le=eng`
    el.currentTime = 0
    el.play()
      .then(() => done(true))
      .catch(() => done(false))
  })
}

/** Web Speech API 兜底：美音优先；无引擎/无英文语音时返回 false。 */
function ttsSpeak(text: string): boolean {
  const synth = window.speechSynthesis
  if (!synth) return false
  const voices = synth.getVoices().filter((v) => v.lang?.toLowerCase().startsWith('en'))
  if (voices.length === 0) return false
  const prefer = voices.find((v) => v.lang.toLowerCase() === 'en-us') ?? voices[0]
  synth.cancel()
  const utter = new SpeechSynthesisUtterance(text)
  utter.voice = prefer
  utter.lang = prefer.lang
  utter.rate = 0.9
  synth.speak(utter)
  return true
}

export function useSpeech(): { speak: (text: string) => Promise<boolean> } {
  const speak = async (text: string): Promise<boolean> => {
    if (await playPronunciationAudio(text)) return true
    return ttsSpeak(text)
  }
  return { speak }
}
