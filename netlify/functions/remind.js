/**
 * 定时运动提醒 Netlify Function
 * 每天选一位海贼王船员，用智谱 AI 生成该角色风格的运动提醒，
 * 再通过企业微信群机器人 推送到群。
 * 会读取 Asa 的锻炼记录（由 stats.js 写入 Netlify Blobs），
 * 让提醒内容更贴近真实锻炼情况（频率、项目、连续天数等）。
 * 环境变量：ZHIPU_API_KEY、WECOM_WEBHOOK_URL
 */

const { getStore, connectLambda } = require('@netlify/blobs');
const { CREW } = require('./crew-data');

const ZHIPU_API_URL = 'https://open.bigmodel.cn/api/paas/v4/chat/completions';
const MODEL = 'glm-4-flash';

const STATS_STORE = 'exercise-stats';
const STATS_KEY = '***';

// 北京时间当前小时（Netlify 函数运行在 UTC，这里转成 UTC+8）
function getBeijingHour(date = new Date()) {
  return new Date(date.getTime() + 8 * 3600 * 1000).getUTCHours();
}

// 解析本次触发的时段：query 参数优先，否则按北京时间推断
function resolveSlot(event) {
  const slot = event.queryStringParameters?.slot;
  if (slot === 'morning' || slot === 'afternoon') {
    return slot;
  }
  return getBeijingHour() < 12 ? 'morning' : 'afternoon';
}

// 根据日期和时段选出今天的船员（早晚各一位，9 人轮流）
function pickCrew(date = new Date(), slotIndex = 0) {
  const dayKey = Math.floor(date.getTime() / 86400000);
  const idx = (dayKey * 2 + slotIndex) % CREW.length;
  return CREW[idx];
}

// 读取 Asa 的锻炼记录（Netlify Blobs）
async function getExerciseStats() {
  try {
    const store = getStore(STATS_STORE);
    const stats = await store.get(STATS_KEY, { type: 'json' });
    return stats || null;
  } catch (err) {
    console.error('读取锻炼记录失败：', err.message);
    return null;
  }
}

// 把锻炼记录整理成一段人话，方便 AI 自然地引用
function summarizeStats(stats) {
  const TYPE_NAMES = { squat: '深蹲', punch: '挥拳', walk: '散步' };
  const sessions = stats?.sessions || [];
  if (sessions.length === 0) {
    return '最近还没有任何锻炼记录（可以把Asa当成刚开始运动的新手）';
  }

  // 近 7 天（北京时间）
  const now = new Date(Date.now() + 8 * 3600 * 1000);
  const last7 = new Set();
  for (let i = 0; i < 7; i++) {
    last7.add(new Date(now.getTime() - i * 86400000).toISOString().slice(0, 10));
  }
  const week = sessions.filter((s) => last7.has(s.date));

  const types = [...new Set(week.map((s) => TYPE_NAMES[s.type] || s.type))];
  const totalCount = week.reduce((sum, s) => sum + (s.count || 0), 0);

  // 连续锻炼天数
  const dateSet = new Set(sessions.map((s) => s.date));
  let streak = 0;
  let cursor = now.toISOString().slice(0, 10);
  if (!dateSet.has(cursor)) {
    cursor = new Date(now.getTime() - 86400000).toISOString().slice(0, 10);
  }
  while (dateSet.has(cursor)) {
    streak++;
    cursor = new Date(new Date(cursor + 'T00:00:00Z').getTime() - 86400000)
      .toISOString()
      .slice(0, 10);
  }

  const last = sessions[sessions.length - 1];
  const parts = [];
  parts.push(`近7天锻炼了${week.length}次`);
  if (types.length) parts.push(`主要项目：${types.join('、')}`);
  if (totalCount) parts.push(`共完成约${totalCount}次动作`);
  if (streak > 0) parts.push(`已连续锻炼${streak}天`);
  if (last) parts.push(`最近一次是${last.date}（${TYPE_NAMES[last.type] || last.type} ${last.count || 0}次）`);
  return parts.join('；');
}

// 用智谱 AI 生成角色风格的运动提醒；失败时抛出异常
async function generateReminder(crew, slot, statsLine) {
  const apiKey = process.env.ZHIPU_API_KEY;
  if (!apiKey) {
    throw new Error('缺少环境变量 ZHIPU_API_KEY');
  }

  const slotLabel = slot === 'morning' ? '早上7点' : '下午1点';
  const prompt = [
    crew.user,
    `现在是${slotLabel}（北京时间）。`,
    `Asa最近的锻炼情况：${statsLine}。`,
    '请像朋友一样自然地提到这些真实情况（夸夸坚持、吐槽偷懒、结合锻炼项目开个玩笑都可以），自然不生硬，不要罗列数据，不要超出角色人设，也不要使用markdown格式。',
  ].join('\n');

  const resp = await fetch(ZHIPU_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: 'system', content: crew.system },
        { role: 'user', content: prompt },
      ],
      temperature: 0.9,
      max_tokens: 150,
    }),
  });

  if (!resp.ok) {
    throw new Error(`智谱 API 返回 ${resp.status}`);
  }

  const data = await resp.json();
  const text = (data?.choices?.[0]?.message?.content || '').trim();
  if (!text) {
    throw new Error('智谱 API 返回空内容');
  }
  return text.slice(0, 200);
}

// 通过企业微信群机器人推送
async function sendToWeCom(title, content, siteUrl) {
  const webhookUrl = process.env.WECOM_WEBHOOK_URL;
  if (!webhookUrl) {
    throw new Error('缺少环境变量 WECOM_WEBHOOK_URL');
  }

  const mdContent = `## ${title}
${content}
[📋 打开运动记录指针](${siteUrl})`;

  const resp = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      msgtype: 'markdown',
      markdown: { content: mdContent },
    }),
  });

  if (!resp.ok) {
    throw new Error(`企业微信 返回 ${resp.status}`);
  }
  return resp.json();
}

exports.handler = async (event) => {
  // Lambda compatibility mode 下手动接入 Blobs 环境（供 getExerciseStats 读取记录）
  connectLambda(event);

  // 支持 GET（cron 定时触发 / 手动测试）和 POST
  if (event.httpMethod !== 'GET' && event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method Not Allowed' }),
    };
  }

  const date = new Date();
  const slot = resolveSlot(event);
  const slotIndex = slot === 'morning' ? 0 : 1;
  const crew = pickCrew(date, slotIndex);
  const statsLine = summarizeStats(await getExerciseStats());

  // 生成提醒；AI 失败则使用 fallback
  let reminder;
  let aiUsed = true;
  try {
    reminder = await generateReminder(crew, slot, statsLine);
  } catch (err) {
    aiUsed = false;
    reminder = crew.fallback || '该运动啦！起来活动 10 分钟吧！';
  }

  const title = `${crew.emoji} ${crew.name}喊你运动啦`;
  const siteUrl =
    process.env.URL || process.env.SITE_URL || 'https://onepiece-sports.netlify.app';

  try {
    const result = await sendToWeCom(title, reminder, siteUrl);
    return {
      statusCode: 200,
      body: JSON.stringify({
        ok: true,
        date: date.toISOString(),
        slot,
        crew: crew.name,
        emoji: crew.emoji,
        title,
        reminder,
        aiUsed,
        statsLine,
        siteUrl,
        wecom: result,
      }),
    };
  } catch (err) {
    return {
      statusCode: 502,
      body: JSON.stringify({
        ok: false,
        error: err.message,
        slot,
        title,
        reminder,
        siteUrl,
      }),
    };
  }
};
