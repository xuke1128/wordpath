# 词径 WordPath

> 按学段选词书、用间隔重复科学抗遗忘的背单词 Web 应用——**从小学到考研，一条词径走到底。**

免费开源 · 纯 Web 免下载 · 六学段词书统一覆盖 · 公开可解释的 SM-2 复习调度 · 自动打卡与统计。

## 功能

- **六本内置学段词书**：小学 676 词 / 初中 2,416 词 / 高中 4,750 词 / CET-4 4,500 词 / CET-6 3,907 词 / 考研 4,988 词（共 **21,237 词**，均含美音音标、中文释义、双语例句；支持 JSON 导入自定义词书）
- **每日计划**：自定义每日新词量（5–100，默认 20），当日任务 = 到期复习（优先）+ 新词
- **三种学习模式**：卡片认读自评、四选一选择题、拼写，共享任务队列、随时切换
- **SM-2 间隔重复调度**（服务端计算，规则公开可解释）：间隔 1 → 6 → round(interval × EF)，忘记即重来
- **自动打卡**：完成当日任务自动记 1 次打卡，连续天数 + 当月打卡日历
- **统计看板**：今日/累计学习、词书进度、近 7 天学习量
- **单词发音**：浏览器 Web Speech API 美音朗读（无第三方付费 TTS）
- **登录**：体验登录（mock，免注册）+ 微信网页授权（可选，凭据走环境变量）

## 快速开始

要求：Node.js ≥ 22.5（使用内置 `node:sqlite`）。

```bash
npm install
npm run dev
```

打开 http://localhost:5173 ，点击「体验登录」即可开始（首次启动自动播种词书）。

生产模式（单端口托管前后端）：

```bash
npm run build
npm start        # 自动以 NODE_ENV=production 启动，默认 http://localhost:8787
```

> Windows 本机如不走 Docker，请在 PowerShell 中执行 `$env:NODE_ENV='production'; node dist/server/index.js`。

## 截图

<!-- TODO(release): 发布前补充 4-6 张关键界面截图（登录 / 今日 / 三种学习模式 / 统计）。 -->

_占位：截图待补。_

## 常用命令

| 命令 | 说明 |
|---|---|
| `npm run dev` | 本地开发（API :8787 + 前端 :5173 代理） |
| `npm run build` | 类型检查 + 编译服务端 + 构建前端 |
| `npm run lint` | ESLint 静态检查 |
| `npm test` | 运行全部测试（SM-2/纯函数单测 + 核心接口集成测试） |
| `npm start` | 生产模式启动 |
| `npm run seed` | 手动播种/更新内置词书 |
| `npm run wordbook:validate -- <file.json>` | 校验自定义词书 JSON |
| `npm run wordbook:import -- <file.json>` | 校验并导入自定义词书 |

## 自定义词书 JSON 格式

```json
{
  "id": "my-book",
  "stage": "cet4",
  "name": "我的四级词书",
  "description": "自定义词表",
  "words": [
    {
      "headword": "abandon",
      "phonetic": "/əˈbændən/",
      "translations": [{ "pos": "v.", "meaning": "放弃；抛弃" }],
      "example": { "en": "The plan was abandoned.", "cn": "计划被放弃了。" }
    }
  ]
}
```

要求：`id` 为小写字母/数字/连字符；`stage` ∈ primary/junior/senior/cet4/cet6/kaoyan；词数 ≥ 100；书内 headword 唯一。

## 环境变量

复制 `.env.example` 为 `.env` 按需修改。真实密钥只放环境变量，切勿提交仓库。

| 变量 | 默认 | 说明 |
|---|---|---|
| `PORT` | `8787` | 服务端口 |
| `WORDPATH_DB` | `./data/wordpath.db` | SQLite 文件路径 |
| `FRONTEND_ORIGIN` | `http://localhost:5173` | 微信回调后跳转的前端源 |
| `WECHAT_APPID` / `WECHAT_SECRET` / `WECHAT_REDIRECT_URI` | 空 | 三项全部配置后登录页才出现「微信登录」入口 |

> 微信登录使用开放平台「网站应用」扫码授权（`snsapi_login`），回调地址需指向 `/api/auth/wechat/callback` 且为已备案 HTTPS 域名。未配置时仅提供体验登录，不影响部署。

## 部署

单进程方案（任选）：

- **云主机 + Docker**：`docker build -t wordpath .`，容器内 `npm start`，把 `data/` 目录挂载为 volume 持久化 SQLite，前置 Nginx/Caddy 终止 HTTPS。
- **Render / Railway / Fly.io 免费档**：Build `npm ci && npm run build`，Start `npm start`，持久盘挂到 `data/`，健康检查 `GET /api/health`。

## 技术栈

Fastify 4 + React 18 + Vite 5 + TypeScript + SQLite（Node 内置 `node:sqlite`）+ Vitest。

**架构一图流**：浏览器 SPA（Vite 构建产物）→ 同源 `/api/*` → Fastify 单进程（路由 / 认证 / 纯函数核心：SM-2、自然日、打卡、组队、出题 / SQLite 仓储）→ SQLite 单文件库；生产模式下同一进程托管前端静态资源。调度、判分、组队、打卡全部在服务端完成，前端不做业务裁决。

## Roadmap

- [ ] FSRS 记忆算法（可切换调度器）
- [ ] 深色模式
- [ ] 词书学习完成庆祝页
- [ ] 公众号 H5 微信授权场景
- [ ] 词书切换时保留各书学习计划偏好

## License

MIT

## 词书数据来源与致谢

内置六本词书由 [`scripts/build-wordbooks.ts`](scripts/build-wordbooks.ts) 从公开词库数据（[kajweb/dict](https://github.com/kajweb/dict)，提取自百词斩词书）合并生成：跨多册教材/词表去重合并，统一为美音音标（IPA）、中文释义、双语例句的标准格式，并跨书回填词性标注。仅作学习用途，感谢原数据维护者。
