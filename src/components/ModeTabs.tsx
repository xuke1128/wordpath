import type { StudyMode } from '../../shared/types'

export const MODE_LABELS: Record<StudyMode, string> = {
  card: '卡片',
  choice: '选择',
  spelling: '拼写',
}

/** 学习页模式分段控件（F8：即时切换、队列位置不变）。 */
export function ModeTabs({ mode, onChange }: { mode: StudyMode; onChange: (m: StudyMode) => void }) {
  const modes: StudyMode[] = ['card', 'choice', 'spelling']
  return (
    <div className="mode-tabs" role="tablist" aria-label="学习模式">
      {modes.map((m) => (
        <button
          key={m}
          role="tab"
          aria-selected={mode === m}
          className={`mode-tab${mode === m ? ' active' : ''}`}
          onClick={() => m !== mode && onChange(m)}
        >
          {MODE_LABELS[m]}
        </button>
      ))}
    </div>
  )
}
