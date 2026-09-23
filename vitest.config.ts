import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    // node:sqlite 为 Node 22.5+ 内置模块；显式外置，交给 Node 原生解析
    server: {
      deps: {
        external: [/^node:/],
      },
    },
  },
})
