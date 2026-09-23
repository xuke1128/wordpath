/** 前后端共享类型：API DTO 与词书条目。 */

export type Stage = 'primary' | 'junior' | 'senior' | 'cet4' | 'cet6' | 'kaoyan'

export const STAGES: Stage[] = ['primary', 'junior', 'senior', 'cet4', 'cet6', 'kaoyan']

export type StudyMode = 'card' | 'choice' | 'spelling'
export const STUDY_MODES: StudyMode[] = ['card', 'choice', 'spelling']

/** 词书 JSON 导入格式（assets/wordbooks 与导入脚本共用）。 */
export interface WordTranslation {
  pos: string
  meaning: string
}

export interface WordEntry {
  headword: string
  phonetic: string
  translations: WordTranslation[]
  example: { en: string; cn: string }
}

export interface WordBookFile {
  id: string
  stage: Stage
  name: string
  description: string
  words: WordEntry[]
}

/** —— API DTO —— */

export interface UserDTO {
  id: string
  nickname: string
  provider: 'mock' | 'wechat'
}

export interface SettingsDTO {
  dailyNewLimit: number
  lastMode: StudyMode
}

export interface ActiveBookDTO {
  id: string
  name: string
}

export interface MeDTO {
  user: UserDTO
  settings: SettingsDTO
  activeBook: ActiveBookDTO | null
}

export interface BookDTO {
  id: string
  stage: Stage
  name: string
  description: string
  wordCount: number
  learnedCount: number
  isActive: boolean
}

export interface TodayTaskDTO {
  reviewCount: number
  newCount: number
  doneCount: number
  totalCount: number
  /** 今日已完成中新学/复习的拆分（完成结算页与预览文案用）。 */
  doneNewCount: number
  doneReviewCount: number
}

export interface TodayDTO {
  date: string
  hasBook: boolean
  task: TodayTaskDTO | null
  completed: boolean
  bookFinished: boolean
  streak: number
  lastMode: StudyMode
}

export interface WordFullDTO {
  wordId: number
  isNew: boolean
  headword: string
  phonetic: string
  translations: WordTranslation[]
  exampleEn: string
  exampleCn: string
}

/** 选择题（服务端不暴露正确项索引；题干随题型方向判别）。 */
export interface ChoiceItemBase {
  wordId: number
  isNew: boolean
  options: string[]
}

export interface ChoiceItemE2C extends ChoiceItemBase {
  direction: 'e2c'
  stem: { headword: string; phonetic: string }
}

export interface ChoiceItemC2E extends ChoiceItemBase {
  direction: 'c2e'
  stem: { translations: WordTranslation[] }
}

export type ChoiceItemDTO = ChoiceItemE2C | ChoiceItemC2E

export type QueueItemDTO =
  | ({ kind: 'card' } & WordFullDTO)
  | ({ kind: 'choice' } & ChoiceItemDTO)
  // 拼写项：headword 仅供 TTS 发音（浏览器语音必须有文本），UI 不渲染它；防泄题在界面层保证
  | ({ kind: 'spelling'; wordId: number; isNew: boolean; headword: string; translations: WordTranslation[] })

export interface QueueDTO {
  date: string
  items: QueueItemDTO[]
}

export interface AnswerResultDTO {
  correct: boolean
  quality: number
  word: WordFullDTO
  /** 选择题判分后回传正确项索引（作答后展示用）。 */
  correctIndex?: number
  /** 调度结果（用于「N 天后再见」轻提示与透明化）。 */
  nextIntervalDays: number
  nextDueDate: string
  progress: { done: number; total: number; date: string }
  /** 本次提交使当日队列清空时才有值（自动打卡）。 */
  checkin: { streak: number } | null
}

export interface StatsDTO {
  streak: number
  totalLearned: number
  today: { newCount: number; reviewCount: number }
  activeBook: { id: string; name: string; learned: number; total: number; pct: number } | null
  last7: Array<{ date: string; newCount: number; reviewCount: number; total: number }>
}

export interface CalendarDTO {
  month: string
  today: string
  days: Array<{ date: string; checked: boolean }>
}

/** 排行榜条目（US13）：累计学习天数 = 打卡日数；连续天数 = 当前 streak；累计词汇量 = 有进度去重词数。 */
export interface LeaderboardEntryDTO {
  rank: number
  userId: string
  nickname: string
  provider: 'mock' | 'wechat'
  totalDays: number
  currentStreak: number
  totalWords: number
  isMe: boolean
}

export interface LeaderboardDTO {
  today: string
  /** Top 20；若我不在榜内则末尾追加我的真实名次行。 */
  entries: LeaderboardEntryDTO[]
  totalUsers: number
}

export interface AuthConfigDTO {
  mock: boolean
  wechat: boolean
}
