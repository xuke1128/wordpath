/**
 * v1.1 学习顺序打乱 —— API 层验收：
 * - 同日队列确定性（重复拉取顺序一致）；
 * - 新词不再按词书（字母）顺序；
 * - 学掉部分新词后，剩余词相对顺序不变（当日计划稳定）；
 * - 不同用户同日洗牌序不同（种子含用户 id）。
 */
import { describe, expect, it } from 'vitest'
import { makeApp, mockLogin, getJSON, postJSON } from './helpers'
import * as repo from '../../server/db/repo'
import type { QueueDTO } from '../../shared/types'

async function loginAndActivate(deviceId: string) {
  const { app, db } = await makeApp()
  const jar = await mockLogin(app, deviceId)
  const r = await postJSON(app, jar, '/api/books/cet4/activate')
  expect(r.status).toBe(200)
  return { app, db, jar }
}

function newIds(q: QueueDTO): number[] {
  return q.items.map((i) => ('wordId' in i ? i.wordId : -1))
}

describe('学习顺序打乱（API）', () => {
  it('同日重复拉取队列顺序一致，且新词不按词书顺序', async () => {
    const { app, db, jar } = await loginAndActivate('shuf-a')
    const q1 = await getJSON<QueueDTO>(app, jar, '/api/study/queue?mode=card')
    const q2 = await getJSON<QueueDTO>(app, jar, '/api/study/queue?mode=card')
    expect(q1.body.items).toEqual(q2.body.items)
    const ids = newIds(q1.body)
    const bookOrder = repo.listWordsByBook(db, 'cet4').map((w) => w.id)
    expect(ids).not.toEqual(bookOrder.slice(0, ids.length))
  })

  it('学掉 1 个新词后：剩余新词 = 原队列 − 该词，相对顺序不变', async () => {
    const { app, jar } = await loginAndActivate('shuf-b')
    const before = newIds((await getJSON<QueueDTO>(app, jar, '/api/study/queue?mode=card')).body)
    const answered = before[0]
    const r = await postJSON(app, jar, '/api/study/answer', { wordId: answered, mode: 'card', quality: 5 })
    expect(r.status).toBe(200)
    const after = newIds((await getJSON<QueueDTO>(app, jar, '/api/study/queue?mode=card')).body)
    expect(after).toEqual(before.filter((id) => id !== answered))
  })

  it('不同用户同日洗牌序不同', async () => {
    const a = await loginAndActivate('shuf-u1')
    const b = await loginAndActivate('shuf-u2')
    const qa = newIds((await getJSON<QueueDTO>(a.app, a.jar, '/api/study/queue?mode=card')).body)
    const qb = newIds((await getJSON<QueueDTO>(b.app, b.jar, '/api/study/queue?mode=card')).body)
    expect(qa).not.toEqual(qb)
  })
})
