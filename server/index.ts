/** 服务入口：读 env → 建库 → 播种 → 启动。 */
import { openDatabase } from './db/connection'
import { seedIfEmpty } from './db/seed'
import { loadDotEnv, configFromEnv } from './env'
import { buildApp } from './app'

async function main(): Promise<void> {
  loadDotEnv()
  const config = configFromEnv()
  const db = openDatabase(config.dbFile)
  const seed = seedIfEmpty(db)
  if (seed.seeded) {
    // eslint-disable-next-line no-console
    console.log(`[wordpath] 已播种 ${seed.books} 本词书、${seed.words} 个单词`)
  }
  const app = await buildApp(db, config)
  await app.listen({ port: config.port, host: '0.0.0.0' })
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[wordpath] 启动失败:', err)
  process.exit(1)
})
