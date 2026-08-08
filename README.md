# One Piece Sports 🏴‍☠️ 海贼王运动教练

一个以海贼王为主题的趣味运动记录小站，结合 AI 对话与微信提醒，让 9 位船员教练陪你一起运动。

## 文件结构

| 路径 | 说明 |
| --- | --- |
| `index.html` | 前端页面（运动记录小游戏） |
| `netlify.toml` | Netlify 构建配置（函数目录 + 静态站点根目录） |
| `netlify/functions/chat.js` | 智谱 AI 对话代理（`/.netlify/functions/chat`） |
| `netlify/functions/remind.js` | 每日运动提醒（Server酱 推送微信，`/.netlify/functions/remind`） |

## 功能介绍

- **9 位船员教练**：路飞、索隆、娜美、乌索普、山治、乔巴、罗宾、弗兰奇、布鲁克按星期轮流出场，每天由一位船员用他/她的风格喊你运动。
- **对话交互**：页面通过 `chat` 函数调用智谱 AI（`glm-4-flash`），让船员角色和你聊天、陪你打卡。
- **微信提醒**：`remind` 函数每天生成角色风格的运动提醒，通过 Server酱 推送到微信，并附上运动记录页链接。

## 部署步骤

1. **上传 GitHub**：把整个文件夹推到 GitHub 仓库 `onepiece-sports`。
2. **关联 Netlify**：登录 [Netlify](https://app.netlify.com)，选择 “Add new site → Import an existing project”，关联你的 GitHub 仓库。Build command 和 Publish directory 都可以留空，`netlify.toml` 已配置好。
3. **设置环境变量**：在 Netlify 站点 Settings → Environment variables 中添加：
   - `ZHIPU_API_KEY`：智谱开放平台创建的 API Key
   - `SERVER_CHAN_KEY`：Server酱 的 SendKey（不需要微信提醒时可不设置）
4. **设置定时提醒**：在 [cron-job.org](https://cron-job.org) 创建**两个**定时任务（每天早上 07:00 和下午 13:00，时区选 `Asia/Shanghai`），URL 都填：

   ```
   https://<你的站点>.netlify.app/.netlify/functions/remind
   ```

   函数会根据北京时间自动区分早/午时段：早上触发生成晨间提醒，下午触发生成午后提醒，9 位船员也会错开轮换。也可以用 `?slot=morning` 或 `?slot=afternoon` 手动指定时段测试。`remind` 函数支持 GET 请求，可直接在浏览器打开上面的地址手动测试。

## 接口说明

- 聊天：`POST https://<你的站点>.netlify.app/.netlify/functions/chat`
  请求体：`{ "messages": [{ "role": "user", "content": "你好" }] }`
  返回：`{ "reply": "AI回复内容" }`
- 提醒：`GET https://<你的站点>.netlify.app/.netlify/functions/remind`
