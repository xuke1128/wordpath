/**
 * 词书 JSON 文件解析与校验（seed 与导入脚本共用，PRD §3.2）。
 * 校验失败返回 errors 数组（逐条可读），调用方决定如何呈现。
 */

import type { Stage, WordBookFile } from '../../shared/types'
import { STAGES } from '../../shared/types'
import { isStage } from '../core/choices'

export interface ParsedWordBook {
  book: WordBookFile
}

export interface ParseFailure {
  errors: string[]
}

export function parseWordBookFile(raw: unknown, sourceName = 'wordbook'): ParsedWordBook | ParseFailure {
  const errors: string[] = []
  const fail = (msg: string) => errors.push(`[${sourceName}] ${msg}`)

  if (typeof raw !== 'object' || raw === null) {
    return { errors: [`[${sourceName}] 文件顶层必须是 JSON 对象`] }
  }
  const obj = raw as Record<string, unknown>

  const id = obj.id
  if (typeof id !== 'string' || !/^[a-z0-9_-]{1,40}$/.test(id)) {
    fail(`id 非法（需为 1-40 位小写字母/数字/-/_）：${JSON.stringify(id)}`)
  }

  const stage = obj.stage
  if (typeof stage !== 'string' || !isStage(stage)) {
    fail(`stage 非法（应为 ${STAGES.join('/')} 之一）：${JSON.stringify(stage)}`)
  }

  const name = obj.name
  if (typeof name !== 'string' || name.trim().length === 0 || name.length > 60) {
    fail(`name 必须为 1-60 字符：${JSON.stringify(name)}`)
  }

  const description = obj.description
  if (typeof description !== 'string' || description.length > 200) {
    fail(`description 必须为不超过 200 字符的字符串`)
  }

  const wordsRaw = obj.words
  if (!Array.isArray(wordsRaw) || wordsRaw.length < 100) {
    fail(`words 必须为至少 100 条的数组（当前 ${Array.isArray(wordsRaw) ? wordsRaw.length : 0} 条）`)
  }
  if (Array.isArray(wordsRaw)) {
    const seen = new Set<string>()
    wordsRaw.forEach((w, i) => {
      const label = `words[${i}]`
      if (typeof w !== 'object' || w === null) {
        fail(`${label} 必须为对象`)
        return
      }
      const e = w as Record<string, unknown>
      const headword = e.headword
      if (typeof headword !== 'string' || headword.trim().length === 0) {
        fail(`${label}.headword 缺失`)
        return
      }
      if (seen.has(headword)) fail(`${label}.headword 重复：${headword}`)
      seen.add(headword)

      if (typeof e.phonetic !== 'string' || e.phonetic.trim().length === 0) {
        fail(`${label}(${headword}).phonetic 缺失`)
      }
      const trs = e.translations
      if (!Array.isArray(trs) || trs.length === 0) {
        fail(`${label}(${headword}).translations 必须为非空数组`)
      } else {
        trs.forEach((t, j) => {
          if (
            typeof t !== 'object' ||
            t === null ||
            typeof (t as Record<string, unknown>).pos !== 'string' ||
            typeof (t as Record<string, unknown>).meaning !== 'string' ||
            ((t as Record<string, unknown>).meaning as string).trim().length === 0
          ) {
            fail(`${label}(${headword}).translations[${j}] 需包含 pos 与非空 meaning`)
          }
        })
      }
      const ex = e.example
      if (
        typeof ex !== 'object' ||
        ex === null ||
        typeof (ex as Record<string, unknown>).en !== 'string' ||
        typeof (ex as Record<string, unknown>).cn !== 'string' ||
        ((ex as Record<string, unknown>).en as string).trim().length === 0 ||
        ((ex as Record<string, unknown>).cn as string).trim().length === 0
      ) {
        fail(`${label}(${headword}).example 需包含非空的 en 与 cn`)
      }
    })
  }

  if (errors.length > 0) return { errors }

  return {
    book: {
      id: id as string,
      stage: stage as Stage,
      name: name as string,
      description: description as string,
      words: wordsRaw as WordBookFile['words'],
    },
  }
}
