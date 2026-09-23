# 贡献指南

感谢关注词径 WordPath！欢迎通过 Issue 反馈问题、通过 PR 提交改进。

## 开发环境

要求：Node.js ≥ 22.5（使用内置 `node:sqlite`，无需任何原生编译依赖）。

```bash
npm install
npm run dev      # API :8787 + 前端 :5173（Vite 代理），首次启动自动播种词书
```

完整命令见 [README](./README.md#常用命令)。

## 提交前自查

CI（Node 22/24 矩阵）会跑以下四步，本地请先通过：

```bash
npm run lint     # ESLint（0 error 才算通过）
npm run build    # tsc 双项目类型检查 + 服务端编译 + 前端构建
npm test         # 单测 + fastify.inject 集成测试，需全绿
```

## 约定与红线

- **提交信息**：遵循 [Conventional Commits](https://www.conventionalcommits.org/zh-hans/)（`feat:` / `fix:` / `docs:` / `chore:` / `refactor:` / `test:`）。
- **业务规则在服务端**：SM-2 调度、判分、组队、打卡一律由服务端裁决，前端不做业务计算；请勿把调度逻辑移入 `src/`。
- **算法口径**：SM-2 实现以 `server/core/sm2.ts` 为唯一事实来源，改动需同步更新对应单测（q∈{1,3,5}、EF 下限 1.3、间隔 1→6→round(×EF)）。
- **密钥安全**：任何真实密钥不入仓库；新增环境变量请同步更新 `.env.example` 与 README 环境变量表。
- **词书数据**：内置词书 JSON 需通过 `npm run wordbook:validate -- <file>` 校验（≥100 词、字段完整、书内 headword 唯一）。

## Issue / PR

- Bug 报告请附复现步骤、期望与实际行为、运行环境（Node 版本 / 部署方式）。
- 功能建议请说明使用场景；大特性建议先开 Issue 讨论再动手。
- PR 请保持小而聚焦，一个 PR 解决一件事，并确保 CI 全绿。
