/**
 * 全量词书构建脚本：从 kajweb/dict（百词斩词书数据提取）合并生成 assets/wordbooks 下
 * 的 6 本标准格式词书（headword + 美音音标 + 中文释义 + 双语例句）。
 *
 * 数据源 NDJSON：每行一个词条（headWord / content.word.content.{usphone,ukphone,trans,sentence}）。
 * 来源 zip 从 https://github.com/kajweb/dict （book/ 目录）下载后解压到本地目录使用：
 *   用法：npm run wordbook:build -- <srcDir>
 *   其中 <srcDir> 下为解压出的子目录（如 1521164649209_CET4_1/），脚本按学段模式匹配。
 *
 * 合并规则：小写 headword 去重；多来源冲突时优先「有双语例句、有美音音标、释义更多」的词条。
 * 质量红线：音标/释义/例句任一缺失的词条直接丢弃（校验器与 QA 数据体检均要求非空）。
 */
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs'
import * as path from 'node:path'
import type { Stage, WordBookFile, WordEntry, WordTranslation } from '../shared/types'

interface StageSpec {
  id: string
  stage: Stage
  name: string
  description: string
  /** 子目录名匹配（不区分大小写）。 */
  patterns: RegExp[]
}

const SPECS: StageSpec[] = [
  { id: 'primary', stage: 'primary', name: '小学词书', description: '人教版小学英语（3-6 年级）核心词汇', patterns: [/PEPXiaoXue/i] },
  { id: 'junior', stage: 'junior', name: '初中词书', description: '中考核心词汇（人教/外研教材与中考词表合并）', patterns: [/ChuZhong/i] },
  { id: 'senior', stage: 'senior', name: '高中词书', description: '高考核心词汇（人教/北师大教材与高考词表合并）', patterns: [/GaoZhong/i] },
  { id: 'cet4', stage: 'cet4', name: 'CET-4 全量词', description: '四级考纲全集（含高中基础词，适合系统打底）', patterns: [/CET4/i] },
  { id: 'cet6', stage: 'cet6', name: 'CET-6 全量词', description: '六级词书全集（含四级基础词，适合系统打底）', patterns: [/CET6/i] },
  { id: 'kaoyan', stage: 'kaoyan', name: '考研全量词', description: '考研词书全集（含四六级基础词，适合系统打底）', patterns: [/KaoYan/i] },
]

interface RawEntry {
  headWord?: string
  content?: {
    word?: {
      wordHead?: string
      content?: {
        usphone?: string
        ukphone?: string
        phone?: string
        trans?: Array<{ pos?: string; tranCn?: string }>
        sentence?: { sentences?: Array<{ sContent?: string; sCn?: string }> }
      }
    }
  }
}

function stripTags(s: string): string {
  return s
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** 统一音标：取美音（缺失回退英音），撇号重音符转 IPA ˈ，多读音取第一种，包 /.../。 */
function buildPhonetic(c: NonNullable<NonNullable<RawEntry['content']>['word']>['content']): string | null {
  let raw = (c?.usphone || '').trim() || (c?.ukphone || '').trim() || (c?.phone || '').trim()
  if (!raw) return null
  raw = stripTags(raw).split(/[;；]/)[0].trim()
  if (!raw) return null
  // 百词斩音标转写规范：' 为重音、: 为长音，统一转 IPA 记号 ˈ 与 ː
  raw = raw.replace(/'/g, 'ˈ').replace(/:/g, 'ː')
  return raw.startsWith('/') ? raw : `/${raw}/`
}

function buildTranslations(c: NonNullable<NonNullable<RawEntry['content']>['word']>['content']): WordTranslation[] | null {
  const out: WordTranslation[] = []
  const seen = new Set<string>()
  for (const t of c?.trans ?? []) {
    const meaning = stripTags(t.tranCn ?? '')
    if (!meaning) continue
    let pos = stripTags(t.pos ?? '')
    if (pos && !pos.endsWith('.')) pos += '.'
    if (!pos) pos = '—'
    const key = `${pos}|${meaning}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ pos, meaning })
  }
  return out.length > 0 ? out : null
}

function buildExample(c: NonNullable<NonNullable<RawEntry['content']>['word']>['content']): { en: string; cn: string } | null {
  for (const s of c?.sentence?.sentences ?? []) {
    const en = stripTags(s.sContent ?? '')
    const cn = stripTags(s.sCn ?? '')
    if (en && cn) return { en, cn }
  }
  return null
}

function scoreEntry(e: { example: unknown; phonetic: unknown; translations: WordTranslation[] }): number {
  let s = 0
  if (e.example) s += 4
  if (e.phonetic) s += 2
  s += Math.min(e.translations.length, 4)
  return s
}

function collectDirs(srcDir: string, spec: StageSpec): string[] {
  return readdirSync(srcDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && spec.patterns.some((p) => p.test(d.name)))
    .map((d) => path.join(srcDir, d.name))
    .sort()
}

/**
 * 全源词性字典：key = 小写 headword，value = (pos+meaning) → 出现次数。
 * 用于回填课本词表（如人教小学）缺失的词性标注。
 */
function collectPosIndex(srcDir: string): Map<string, Map<string, number>> {
  const index = new Map<string, Map<string, number>>()
  for (const d of readdirSync(srcDir, { withFileTypes: true }).filter((d) => d.isDirectory())) {
    const dir = path.join(srcDir, d.name)
    for (const f of readdirSync(dir).filter((f) => f.endsWith('.json'))) {
      for (const line of readFileSync(path.join(dir, f), 'utf8').split(/\r?\n/)) {
        if (!line.trim()) continue
        let raw: RawEntry
        try {
          raw = JSON.parse(line) as RawEntry
        } catch {
          continue
        }
        const headword = stripTags(raw.headWord || raw.content?.word?.wordHead || '').toLowerCase()
        const c = raw.content?.word?.content
        for (const t of c?.trans ?? []) {
          let pos = stripTags(t.pos ?? '')
          const meaning = stripTags(t.tranCn ?? '')
          if (!pos || !meaning || pos === '—') continue
          if (!pos.endsWith('.')) pos += '.'
          const key = `${pos}|${meaning}`
          const bucket = index.get(headword) ?? new Map<string, number>()
          bucket.set(key, (bucket.get(key) ?? 0) + 1)
          index.set(headword, bucket)
        }
      }
    }
  }
  return index
}

/** 用词性字典回填：整条缺词性 → 替换为字典最高频的至多 3 条释义；部分缺 → 仅剔除 '—' 条目。 */
function fillTranslations(
  entry: WordEntry,
  posIndex: Map<string, Map<string, number>>,
): void {
  const key = entry.headword.toLowerCase()
  const bucket = posIndex.get(key)
  const allUnknown = entry.translations.every((t) => t.pos === '—')
  if (allUnknown && bucket && bucket.size > 0) {
    const top = [...bucket.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3)
    entry.translations = top.map(([k]) => {
      const [pos, meaning] = k.split('|')
      return { pos, meaning }
    })
    return
  }
  if (!allUnknown) {
    const kept = entry.translations.filter((t) => t.pos !== '—')
    if (kept.length > 0) entry.translations = kept
  }
}

function buildStage(
  srcDir: string,
  spec: StageSpec,
  posIndex: Map<string, Map<string, number>>,
): { book: WordBookFile; dropped: number; sources: number } {
  const dirs = collectDirs(srcDir, spec)
  if (dirs.length === 0) throw new Error(`${spec.id}: 未在 ${srcDir} 找到匹配 ${spec.patterns} 的数据目录`)
  const byKey = new Map<string, { entry: WordEntry; score: number }>()
  let dropped = 0

  for (const dir of dirs) {
    for (const f of readdirSync(dir).filter((f) => f.endsWith('.json'))) {
      const text = readFileSync(path.join(dir, f), 'utf8')
      for (const line of text.split(/\r?\n/)) {
        if (!line.trim()) continue
        let raw: RawEntry
        try {
          raw = JSON.parse(line) as RawEntry
        } catch {
          dropped++
          continue
        }
        const headword = stripTags(raw.headWord || raw.content?.word?.wordHead || '')
        if (!headword || !/^[A-Za-z][A-Za-z''-]*$/.test(headword)) {
          dropped++
          continue
        }
        const c = raw.content?.word?.content
        const phonetic = buildPhonetic(c)
        const translations = buildTranslations(c)
        const example = buildExample(c)
        if (!phonetic || !translations || !example) {
          dropped++
          continue
        }
        const entry: WordEntry = { headword, phonetic, translations, example }
        fillTranslations(entry, posIndex)
        const score = scoreEntry(entry)
        const key = headword.toLowerCase()
        const prev = byKey.get(key)
        if (!prev || score > prev.score || (score === prev.score && headword.length < prev.entry.headword.length)) {
          byKey.set(key, { entry, score })
        }
      }
    }
  }

  const words = [...byKey.values()].map((v) => v.entry).sort((a, b) => a.headword.localeCompare(b.headword, 'en'))
  return { book: { id: spec.id, stage: spec.stage, name: spec.name, description: spec.description, words }, dropped, sources: dirs.length }
}

/** 序列化：元数据可读，词条单行紧凑（与既有词书文件风格一致）。 */
function serializeBook(book: WordBookFile): string {
  const lines = book.words.map((w) => `    ${JSON.stringify(w)}`).join(',\n')
  return `{
  "id": ${JSON.stringify(book.id)},
  "stage": ${JSON.stringify(book.stage)},
  "name": ${JSON.stringify(book.name)},
  "description": ${JSON.stringify(book.description)},
  "words": [
${lines}
  ]
}
`
}

/** 读取考纲参考表为小写词集合（assets/reference/*.txt，格式「单词 [音标] 释义」或纯单词行）。 */
function loadSyllabusSet(name: string): Set<string> {
  const file = path.resolve(process.cwd(), 'assets/reference', name)
  return new Set(
    readFileSync(file, 'utf8')
      .replace(/^\uFEFF/, '')
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter((s) => s && !/^[A-Za-z]$/.test(s) && !/^[(（\d]/.test(s))
      .map((s) => s.split(/[\s[]/)[0].toLowerCase().replace(/[^a-z'-]/g, ''))
      .filter((w) => w.length > 0),
  )
}

interface CoreSpec {
  id: string
  sourceId: string
  stage: Stage
  name: string
  description: string
  /** 从源书剔除这些考纲表中的词（该阶段之前已学的词）。 */
  subtract: string[]
}

const CORE_SPECS: CoreSpec[] = [
  {
    id: 'cet4core',
    sourceId: 'cet4',
    stage: 'cet4',
    name: 'CET-4 核心词',
    description: '四级考纲新词（剔除高中基础词），适合已过高中词汇的大学生',
    subtract: ['highschool-syllabus.txt'],
  },
  {
    id: 'cet6core',
    sourceId: 'cet6',
    stage: 'cet6',
    name: 'CET-6 核心词',
    description: '六级考纲新词（剔除四级考纲词），适合已过四级',
    subtract: ['cet4-syllabus.txt'],
  },
  {
    id: 'kaoyancore',
    sourceId: 'kaoyan',
    stage: 'kaoyan',
    name: '考研核心词',
    description: '考研词书新词（剔除高中考纲词），大学阶段需要新学的词',
    subtract: ['highschool-syllabus.txt'],
  },
]

/** 派生核心书：源书 − 低阶考纲词 − 专有名词（April/American 类，核心书不收）− 单字母词。 */
function deriveCoreBook(outDir: string, spec: CoreSpec): void {
  const subtract = new Set<string>()
  for (const ref of spec.subtract) {
    for (const w of loadSyllabusSet(ref)) subtract.add(w)
  }
  const full = JSON.parse(readFileSync(path.join(outDir, `${spec.sourceId}.json`), 'utf8')) as WordBookFile
  const words = full.words.filter(
    (w) =>
      w.headword.length >= 2 &&
      !/^[A-Z]/.test(w.headword) &&
      !subtract.has(w.headword.toLowerCase()),
  )
  if (words.length < 100) throw new Error(`${spec.id}: 仅 ${words.length} 词（<100），拒绝生成`)
  const core: WordBookFile = {
    id: spec.id,
    stage: spec.stage,
    name: spec.name,
    description: spec.description,
  }
  writeFileSync(path.join(outDir, `${spec.id}.json`), serializeBook({ ...core, words }), 'utf8')
  // eslint-disable-next-line no-console
  console.log(
    `✔ ${spec.id}：《${spec.name}》${words.length} 词（${spec.sourceId} 全量 ${full.words.length} 剔除 ${spec.subtract.join('+')} 与专有名词派生）`,
  )
}

function main(): void {
  const srcDir = process.argv[2]
  if (!srcDir) {
    // 无参数：跳过全量重建，仅从现有全量书派生核心书
    const outDir = path.resolve(process.cwd(), 'assets/wordbooks')
    for (const spec of CORE_SPECS) deriveCoreBook(outDir, spec)
    return
  }
  const outDir = path.resolve(process.cwd(), 'assets/wordbooks')
  mkdirSync(outDir, { recursive: true })

  // eslint-disable-next-line no-console
  console.log('扫描全源建立词性字典…')
  const posIndex = collectPosIndex(srcDir)

  let total = 0
  for (const spec of SPECS) {
    const { book, dropped, sources } = buildStage(srcDir, spec, posIndex)
    if (book.words.length < 100) throw new Error(`${spec.id}: 仅 ${book.words.length} 词（<100），拒绝生成`)
    writeFileSync(path.join(outDir, `${spec.id}.json`), serializeBook(book), 'utf8')
    total += book.words.length
    // eslint-disable-next-line no-console
    console.log(`✔ ${spec.id}：《${book.name}》${book.words.length} 词（来源 ${sources} 目录，丢弃 ${dropped} 条缺失音标/释义/例句的记录）`)
  }
  // eslint-disable-next-line no-console
  console.log(`共 ${total} 词 → ${outDir}`)
  for (const spec of CORE_SPECS) deriveCoreBook(outDir, spec)
}

main()
