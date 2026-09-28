/**
 * 认领 PIN 的哈希（node:crypto scrypt，无需外部依赖）。
 * 存储格式：scrypt$<salt hex>$<hash hex>；校验用 timingSafeEqual 防时序侧信道。
 */
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'

const KEY_LEN = 32

export function hashPin(pin: string): string {
  const salt = randomBytes(16)
  const hash = scryptSync(pin, salt, KEY_LEN)
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`
}

export function verifyPin(pin: string, stored: string): boolean {
  const parts = stored.split('$')
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false
  try {
    const salt = Buffer.from(parts[1], 'hex')
    const expected = Buffer.from(parts[2], 'hex')
    const actual = scryptSync(pin, salt, KEY_LEN)
    return expected.length === actual.length && timingSafeEqual(expected, actual)
  } catch {
    return false
  }
}
