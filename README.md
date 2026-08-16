# One Piece Sports 🏴‍☠️ 海贼王运动教练

一个以海贼王为主题的趣味运动记录小站，结合 AI 对话与微信提醒，让 9 位船员教练陪你一起运动。

## 文件结构

| 路径 | 说明 |
| --- | --- |
| `index.html` | 前端页面（运动记录小游戏） |
| `netlify.toml` | Netlify 构建配置（函数目录 + 静态站点根目录） |
| `netlify/functions/chat.js` | 智谱 AI 对话代理（`/.netlify/functions/chat`） |
| `netlify/functions/remind.js` | 每日运动提醒（Server酱 推送微信，`/.netlify/functions/remind`） |
| `netlify/functions/stats.js` | 锻炼记录存取（Netlify Blobs 持久化，`/.netlify/functions/stats`） |
| `package.json` | 函数依赖声明（`@netlify/blobs` 用于存储锻炼记录） |
| `manifest.webmanifest` + `sw.js` + `icon-*.png` | 手机"添加到主屏幕"所需的应用清单、离线缓存与图标 |

## 功能介绍

- **9 位船员教练**：路飞、索隆、娜美、乌索普、山治、乔巴、罗宾、弗兰奇、布鲁克按星期轮流出场，每位船员都有专属人设（system）和开场方式（user），每天由一位船员用他/她的风格喊你运动。
- **对话交互**：页面通过 `chat` 函数调用智谱 AI（`glm-4-flash`），让船员角色和你聊天、陪你打卡。
- **伙伴聊天**：点击甲板上的伙伴头像（或按 🔄 切换伙伴）会弹出聊天窗，可以和 9 位船员 AI 聊天；人设与微信提醒共用同一份配置。
- **运动 AI 点评**：每次训练结束或输入散步步数后，当前伙伴会用 AI 点评这次锻炼，显示在结算弹窗里。
- **定时提醒**：`remind` 函数每天生成角色风格的运动提醒，通过企业微信群机器人推送到群，并附上运动记录页链接。提醒会读取你在小游戏里记录的真实锻炼情况（锻炼次数、项目、连续天数），让船员像朋友一样聊到你的实际运动，而不是空喊口号。
- **锻炼记录**：每次在页面完成深蹲/挥拳训练或输入散步步数，`stats.js` 会自动保存记录，`remind` 函数据此生成个性化提醒。
- **本周锻炼统计**：甲板页顶部显示本周练了几次、连续打卡几天、练过哪些项目，每次练完自动刷新。
- **目标/成就系统**：甲板页可设置本周目标（1–10 次），进度条实时显示；达标那一刻，当前伙伴的点评会附上祝贺。
- **像 App 一样用**：手机浏览器里"添加到主屏幕"后，点图标全屏打开，底部导航常驻，断网也能打开页面。

## 部署步骤

1. **上传 GitHub**：把整个文件夹推到 GitHub 仓库 `onepiece-sports`。
2. **关联 Netlify**：登录 [Netlify](https://app.netlify.com)，选择 “Add new site → Import an existing project”，关联你的 GitHub 仓库。Build command 和 Publish directory 都可以留空，`netlify.toml` 已配置好。
3. **设置环境变量**：在 Netlify 站点 Settings → Environment variables 中添加：
   - `ZHIPU_API_KEY`：智谱开放平台创建的 API Key
   - `WECOM_WEBHOOK_URL`：企业微信群机器人的 Webhook 地址（不需要群提醒时可不设置）
4. **设置定时提醒**：在 [cron-job.org](https://cron-job.org) 创建**两个**定时任务（每天早上 07:00 和下午 13:00，时区选 `Asia/Shanghai`），URL 都填：

   ```
   https://<你的站点>.netlify.app/.netlify/functions/remind
   ```

   函数会根据北京时间自动区分早/午时段：早上触发生成晨间提醒，下午触发生成午后提醒，9 位船员也会错开轮换。也可以用 `?slot=morning` 或 `?slot=afternoon` 手动指定时段测试。`remind` 函数支持 GET 请求，可直接在浏览器打开上面的地址手动测试。

## 接口说明

- 聊天：`POST https://<你的站点>.netlify.app/.netlify/functions/chat`
  请求体：`{ "crew": "娜美", "messages": [{ "role": "user", "content": "你好" }] }`（`crew` 可选，传角色名会自动带上人设）
  返回：`{ "reply": "AI回复内容" }`
- 提醒：`GET https://<你的站点>.netlify.app/.netlify/functions/remind`
- 锻炼记录：`POST https://<你的站点>.netlify.app/.netlify/functions/stats`
  请求体：`{ "type": "squat|punch|walk", "count": 30, "seconds": 600 }`
