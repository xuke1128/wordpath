/**
 * 确定性洗牌（纯函数可单测）。
 *
 * 学习顺序要求打乱词书顺序（不再是字母序），但同一天的队列又必须稳定
 * （重复拉取队列、答几题后再拉，剩余词相对顺序不变）。做法：
 * 以 seed 字符串派生 PRNG（FNV-1a 哈希 + mulberry32），对词表做 Fisher-Yates 洗牌——
 * seed 相同则结果完全一致，不同用户/不同日期/不同词书互不相同。
 */

/** FNV-1a 32 位哈希：字符串 → 非负整数种子。 */
export function hashSeed(seed: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/** mulberry32：种子 → [0, 1) 伪随机数生成器。 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Fisher-Yates 洗牌：不修改入参，返回新数组；seed 相同 ⇒ 输出相同。 */
export function seededShuffle<T>(items: readonly T[], seed: string): T[] {
  const out = [...items]
  const rand = mulberry32(hashSeed(seed))
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}
