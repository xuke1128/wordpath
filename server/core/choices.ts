/**
 * 选择题干扰项生成（PRD US6 / 设计 §7 风险 2、5，纯函数可单测）。
 *
 * 约束：
 * - 4 个选项、互不相同（文本级去重）、恰 1 个正确；
 * - 干扰项取自同词书；
 * - 中→英（c2e）选项为 headword，需排除题干词自身；
 * - 确定性：以 wordId 为随机种子，同一题多次生成选项一致（模式切换重拉不变）。
 */

import type { Stage, WordEntry } from '../../shared/types'

export type ChoiceDirection = 'e2c' | 'c2e'

export interface ChoiceBuildInput {
  wordId: number
  headword: string
  translations: WordEntry['translations']
  /** 同词书内其他候选词（含 headword 与格式化后的释义文本）。 */
  pool: Array<{ wordId: number; headword: string; meaningText: string }>
  direction: ChoiceDirection
}

/** 释义数组的统一展示文本（英→中选项文本口径，与前端渲染一致）。 */
export function formatMeaningText(translations: WordEntry['translations']): string {
  return translations.map((t) => `${t.pos} ${t.meaning}`).join('；')
}

/** mulberry32：小型确定性 PRNG。 */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export interface ChoiceBuildResult {
  options: string[]
  correctIndex: number
}

/**
 * 生成一道四选一。无法凑齐 3 个互异干扰项时返回 null（调用方换词或降级为卡片）。
 */
export function buildChoice(input: ChoiceBuildInput): ChoiceBuildResult | null {
  const rng = mulberry32(input.wordId * 2654435761 + (input.direction === 'e2c' ? 1 : 2))
  const correct =
    input.direction === 'e2c' ? formatMeaningText(input.translations) : input.headword

  const distractors: string[] = []
  const used = new Set([correct])
  const shuffled = [...input.pool]
  // Fisher–Yates（确定性）
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }
  for (const cand of shuffled) {
    if (cand.wordId === input.wordId) continue
    const text = input.direction === 'e2c' ? cand.meaningText : cand.headword
    if (used.has(text)) continue // 文本级去重：近义同文案的干扰项直接跳过
    used.add(text)
    distractors.push(text)
    if (distractors.length === 3) break
  }
  if (distractors.length < 3) return null

  const options = [...distractors, correct]
  // 确定性洗牌选项顺序
  for (let i = options.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[options[i], options[j]] = [options[j], options[i]]
  }
  return { options, correctIndex: options.indexOf(correct) }
}

/** 按队列位置奇偶决定题型方向：偶=英→中，奇=中→英（技术方案 §5 决策 1）。 */
export function directionForPosition(position: number): ChoiceDirection {
  return position % 2 === 0 ? 'e2c' : 'c2e'
}

/** stage 合法性（校验器与导入脚本共用）。 */
export function isStage(s: string): s is Stage {
  return ['primary', 'junior', 'senior', 'cet4', 'cet6', 'kaoyan'].includes(s)
}
