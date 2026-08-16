# onepieceai 项目交接文档（One Piece Sports）

> 给接手人：读完这份文档就能维护网页、后端、定时提醒，并把任意外部设备（目前是 Rokid 眼镜）接到同一份运动数据上。

## 0. 一句话概况

海贼王主题的运动记录与 AI 陪伴小站：网页端记录锻炼、和 9 位船员 AI 聊天；每天 07:00 和 13:00 由定时任务生成角色风格提醒，推送到企业微信群；Rokid 眼镜端「草帽陪练」通过同一套公开接口读写同一份数据。三端（网页 / 后端 / 眼镜）共用一份锻炼记录和一套船员人设。

## 1. 三端架构

- **网页端（本仓库 onepiece-sports）**：单文件 `index.html`，零构建，直接静态托管。
- **后端**：Netlify Functions（Node.js CommonJS + esbuild 打包）。
- **站点**：Netlify，项目名 onepieceai，网址 https://onepieceai.netlify.app 。
- **眼镜端（独立目录，不在本仓库）**：Rokid AIUI 应用「草帽陪练」`roki/onepiece-coach`，通过 HTTP 调本后端。
- **定时任务**：cron-job.org（外部服务，两个任务：07:00、13:00，时区 Asia/Shanghai）。
- **AI**：智谱开放平台 open.bigmodel.cn，文本用 `glm-4-flash`。
- **推送**：企业微信群机器人 Webhook。
- **存储**：Netlify Blobs（免费额度内，单用户设计）。

## 2. 仓库与部署

- GitHub 仓库（公开）：https://github.com/yidaoyi/onepiece-sports
- 本地路径：`D:\todo代码写长一点不然真的很难找\俺写的小代码 学习项目无关\onepiece-sports`
- 分支：`main`。push 后 Netlify 自动构建部署；无需本地构建。
- 部署配置在 `netlify.toml`：函数目录 `netlify/functions`、站点根目录 `.`、打包器 esbuild；另外给 PWA 的两个文件配了响应头。
- 环境变量（Netlify 后台 Site settings → Environment variables，改完要重新 Deploy）：
  - `ZHIPU_API_KEY`：必填，智谱 API Key（聊天、点评、提醒都靠它）。
  - `WECOM_WEBHOOK_URL`：选填，企业微信群机器人地址；不设时提醒推送会失败，聊天和统计不受影响。
  - 旧的 `SERVER_CHAN_KEY`（Server酱）已弃用，不要再设。

## 3. 目录结构（本仓库）

| 路径 | 作用 |
| --- | --- |
| `index.html` | 全部前端：样式 + 页面 + 逻辑，单文件 |
| `netlify.toml` | Netlify 构建与响应头配置 |
| `netlify/functions/chat.js` | AI 聊天代理（`/.netlify/functions/chat`） |
| `netlify/functions/stats.js` | 锻炼记录存取（Netlify Blobs，`/.netlify/functions/stats`） |
| `netlify/functions/remind.js` | 每日提醒：AI 生成 + 企业微信推送（`/.netlify/functions/remind`） |
| `netlify/functions/crew-data.js` | **9 位船员人设的唯一来源**（system / user / fallback） |
| `scripts/sync-crew-fallback.mjs` | 把人设兜底语料同步到眼镜端工程 |
| `manifest.webmanifest`、`sw.js`、`icon-*.png` | 手机"添加到主屏幕"（PWA）与离线缓存 |
| `进度清单.txt` | 进度跟踪，看最后一行 |
| `README.md` | 部署说明（稍简，本文档更全） |
| `package.json` | 依赖 `@netlify/blobs`；脚本 `npm run sync:crew` |

## 4. 功能介绍（用户视角）

1. **伙伴聊天**：点甲板页伙伴头像弹全屏聊天窗；9 位船员各有人设；聊天记录存浏览器本地（`op_chat_history`，每人最近 30 条），刷新不丢。点头像旁 🔄 换伙伴。
2. **运动记录**：深蹲 / 挥拳靠设备运动传感器计次，散步手动输入步数；训练结束自动写记录并刷新统计。
3. **运动 AI 点评**：训练结束（或输入步数）后，当前伙伴在结算弹窗里点评本次锻炼，内容同步进聊天记录；练到达成本周目标那一组时，点评会附祝贺。
4. **统计面板**：甲板页显示本周锻炼次数、连续天数、练过哪些项目。
5. **目标系统**：甲板页可设本周目标（1–10 次），进度条实时显示，达标有提示（`op_weekly_goal`）。
6. **游戏内容**：磁力、悬赏金、航海日志、收藏册（数据在 localStorage `op_*`）；两套主题：一档水彩像素风、二档黑白漫画风（右上角切换）。
7. **定时提醒**：每天 07:00 / 13:00（北京时间）触发，按日期轮换船员（早晚各一位），AI 结合真实锻炼数据生成 ≤50 字提醒推送到企业微信群；AI 失败用本地 fallback，不会空场。
8. **PWA**：手机浏览器"添加到主屏幕"后全屏打开，有图标、有离线缓存（页面网络优先、AI 接口不缓存）。

## 5. 外部设备接入（重点）

任意设备只要会发 HTTP 请求，就能读写同一份数据。

接口前缀：`https://onepieceai.netlify.app/.netlify/functions`

### 5.1 写一条锻炼记录

`POST /stats`

请求体 JSON：

```json
{ "type": "squat", "count": 30, "seconds": 600, "date": "2026-08-16" }
```

- `type`：`squat`（深蹲）/ `punch`（挥拳）/ `walk`（散步），三选一。
- `count`：动作次数（散步填步数）；`seconds`：用时秒数（可 0）。
- `date`：可选，格式 `YYYY-MM-DD`，不传默认按北京时间取今天。

返回：`{ "ok": true, "stats": { ...汇总... } }`

### 5.2 读锻炼汇总

`GET /stats`

返回示例：

```json
{
  "ok": true,
  "stats": {
    "totalSessions": 12,
    "weeklyCount": 4,
    "typeCount": { "squat": 60, "walk": 3000 },
    "typeNames": ["深蹲", "散步"],
    "streakDays": 3,
    "lastWorkout": { "date": "2026-08-16", "type": "深蹲", "count": 30 }
  }
}
```

- `weeklyCount`：近 7 天锻炼次数（北京时间）。
- `typeCount`：近 7 天各项目动作次数合计。
- `streakDays`：连续锻炼天数（含今天；今天没练则从昨天起算）。
- 服务端最多保留最近 60 条会话记录。

### 5.3 AI 聊天（角色化）

`POST /chat`

请求体 JSON：

```json
{ "crew": "罗宾", "messages": [ { "role": "user", "content": "刚练完，夸夸我" } ] }
```

- `crew`：可选，填 9 位船员名字之一（路飞/索隆/娜美/乌索普/山治/乔巴/罗宾/弗兰奇/布鲁克），服务端会自动带上该角色人设（system）。
- `messages`：必填数组，`role` 用 `user` / `assistant` 交替；别自己加 system，服务端会补。

返回：`{ "reply": "AI 回复内容" }`

### 5.4 手动触发一次提醒

`GET /remind`

- 会真实发一条企业微信消息并消耗一次智谱调用，仅测试用。
- 生产由 cron-job.org 每天 07:00、13:00（Asia/Shanghai）调用同一个地址。

### 5.5 CORS

`chat`、`stats` 已放开跨域（OPTIONS 预检也处理了），设备端可直接调用。

### 5.6 眼镜端现状

- 工程目录：`D:\todo代码写长一点不然真的很难找\roki\onepiece-coach`（Rokid AIUI；设备 RV101，系统 YODAOS-SPRITE 1.23.009）。
- `pages/index/index.ink` 顶部 `API_BASE` 已指向本后端。
- 收工时 `POST /stats`（type/count/seconds/date）；点评时 `POST /chat`（crew + 一条 user 消息）。
- 断网时记录暂存设备本地（localStorage `op-pending-sessions`），联网后自动补传。
- 人设唯一来源是 `netlify/functions/crew-data.js`；改完人设运行 `npm run sync:crew`，会生成眼镜端 `assets/crew-fallback.js`（该文件勿手改）。
- 新设备接入三步：①把请求指向上面的前缀；②按 5.1 / 5.2 读写记录；③聊天按 5.3 传角色名即可复用同一套人设。

## 6. 关键实现细节与坑

- **零构建**：前端单 HTML；函数是 Node CommonJS，由 Netlify esbuild 打包。
- **Blobs 初始化**：Netlify 旧版 Lambda 兼容模式下，使用 `@netlify/blobs` 前必须 `connectLambda(event)`（两个用到存储的函数已写好），删了会报 `The environment has not been configured to use Netlify Blobs`。
- **单用户设计**：所有数据存 Blobs 的一个 key（`asa-stats`），没有账号体系。
- **接口无鉴权**：`/chat` 公开可调、会消耗智谱额度；如果被盗刷，再加校验。
- **提醒细节**：标题格式 `{emoji} {角色名}喊你运动啦`；内容走企业微信 markdown；AI 失败用 `crew-data.js` 里的 fallback。
- **PWA 缓存**：`sw.js` 对页面用"网络优先"，所以部署后用户刷新即最新版；静态图标走缓存；`/.netlify/functions/*` 不缓存。
- **密钥安全**：智谱 Key 只存在 Netlify 环境变量里，本仓库不含密钥。
- **已知限制**：微信内置浏览器不能"添加到主屏幕"，需引导用户转 Safari / Edge / Chrome。

## 7. 接手后常用操作

1. **改人设 / 换台词**：只改 `netlify/functions/crew-data.js` →（如需同步眼镜端）`npm run sync:crew` → `git add/commit/push`。
2. **改提醒时间或次数**：不动代码，去 cron-job.org 增删定时任务即可；`remind` 函数会按北京时间自动区分早 7 点 / 下午 1 点的口吻。
3. **前端改动**：改完 `index.html` 后先做语法检查（把 `<script>` 里的 JS 抽出来 `node --check`），再提交推送；网页无构建，风险低。
4. **部署与验证**：push 到 `main` → 等约 1–2 分钟 Netlify 构建 → 强刷浏览器验证。快速自测地址：
   - 页面：https://onepieceai.netlify.app
   - 记录：https://onepieceai.netlify.app/.netlify/functions/stats
   - 清单：https://onepieceai.netlify.app/manifest.webmanifest
5. **回退**：用 `git revert <提交号>`；**不要 `git push --force`**。
6. **本地开发**：函数依赖 Blobs 需要 Netlify 运行时，建议小改动直接部署验证；前端可以本地浏览器打开看版式（AI 接口在本地文件打开时不可用，属正常）。

## 8. 与眼镜项目的关系（避免混淆）

- 本仓库 = 网页 + 后端 + 提醒，就是"onepieceai"。
- `roki/onepiece-coach` = 眼镜运动陪练，**连接本仓库**。
- `roki/bu-lin`（步临）= 眼镜字帖应用，与本仓库无关，不要混改。

## 9. 进度与验收约定

- 项目进度看 `进度清单.txt`，永远看最后一行【下一步】。
- 每次改版式/功能的验收三条：手机不用缩放、不用整页滚动、字和按钮都完整。
