// ESLint flat config（ESLint 9）：
// - 前端（src/、shared/）为浏览器环境；后端/脚本/测试为 Node 环境
// - no-console 全量启用：入口/CLI 的合法输出处已有 eslint-disable 注释
// - react-hooks 规则覆盖 src/（rules-of-hooks=error，exhaustive-deps=warn）
import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'
import globals from 'globals'

export default tseslint.config(
  // 构建产物、依赖与运行时数据不参与 lint
  { ignores: ['dist/', 'node_modules/', 'data/', 'coverage/'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    rules: {
      'no-console': 'error',
    },
  },
  {
    // 测试断言中「非 ASCII」字符类（如 /[^\x00-\x7F/]）为有意使用，非缺陷；
    // no-control-regex 仅对业务代码保留。
    files: ['tests/**/*.ts'],
    rules: {
      'no-control-regex': 'off',
    },
  },
  {
    files: ['src/**/*.{ts,tsx}', 'shared/**/*.ts'],
    languageOptions: {
      globals: { ...globals.browser },
    },
  },
  {
    files: [
      'server/**/*.ts',
      'scripts/**/*.ts',
      'tests/**/*.ts',
      '*.config.ts',
      '*.config.js',
    ],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
  {
    files: ['src/**/*.tsx'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
)
