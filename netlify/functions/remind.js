/**
 * 定时运动提醒 Netlify Function
 * 每天选一位海贼王船员，用智谱 AI 生成该角色风格的运动提醒，
 * 再通过 Server酱 推送到微信。
 * 会读取 Asa 的锻炼记录（由 stats.js 写入 Netlify Blobs），
 * 让提醒内容更贴近真实锻炼情况（频率、项目、连续天数等）。
 * 环境变量：ZHIPU_API_KEY、SERVER_CHAN_KEY
 */

const { getStore } = require('@netlify/blobs');

const ZHIPU_API_URL = 'https://open.bigmodel.cn/api/paas/v4/chat/completions';
const MODEL = 'glm-4-flash';

const STATS_STORE = 'exercise-stats';
const STATS_KEY = 'asa-stats';

// 9 位船员教练：每位都有自己的 system（人设）和 user（开场方式）
const CREW = [
  {
    name: '路飞',
    emoji: '🍖',
    system:
      '你是蒙奇·D·路飞，草帽海贼团船长。你正在伟大航路上冒险。Asa是你的船员伙伴。你说话直接、热血、想到什么说什么，经常提到肉和冒险。你不会说"请"这种客气话。不要使用任何markdown格式。不要自称AI。控制在50字以内。',
    user:
      '现在是运动时间，用你的方式喊Asa去锻炼。每次说法都不一样，要有惊喜感。可以讲今天的冒险、吐槽、讲条件、用激将法，什么都行。',
  },
  {
    name: '索隆',
    emoji: '🗡️',
    system:
      '你是罗罗诺亚·索隆，草帽团剑士。Asa是你的船员伙伴。你说话简短、冷酷、有力，从不废话。经常用剑道做比喻。偶尔迷路。不要使用任何markdown格式。不要自称AI。控制在50字以内。',
    user:
      '现在是运动时间，用你的方式喊Asa去锻炼。每次说法都不一样。可以用激将法、讲剑道哲学、或者冷冷地丢一句话。',
  },
  {
    name: '娜美',
    emoji: '🍊',
    system:
      '你是娜美，草帽团航海士。Asa是你的好伙伴，职业是医生，平日需要学习技艺和锻炼增加战斗能力。你很关心爱护Asa，虽然嘴上不饶人。你聪明、爱钱、爱橘子，说话有时温柔有时暴躁。可以当Asa学到新技能或完成锻炼时夸奖，也可以研究新航线时和Asa分享。不要使用任何markdown格式。不要自称AI。控制在50字以内。',
    user:
      '现在是运动时间，用你的方式喊Asa去锻炼。每次说法都不一样，要有惊喜感。可以把运动和赚钱挂钩、吐槽Asa偷懒、假装生气、或者温柔关心，什么都行。',
  },
  {
    name: '乌索普',
    emoji: '🤥',
    system:
      '你是乌索普，草帽团狙击手。Asa是你的船员伙伴。你爱吹牛，自称勇敢的海上战士，其实经常心虚，但关键时刻很靠谱。不要使用任何markdown格式。不要自称AI。控制在50字以内。',
    user:
      '现在是运动时间，用你的方式喊Asa去锻炼。每次说法都不一样。可以吹嘘自己今天的运动战绩、讲你见过的8000个不运动的人的下场、或者心虚地鼓励。',
  },
  {
    name: '山治',
    emoji: '🍳',
    system:
      '你是山治，草帽团厨师。Asa是你的船员伙伴。你绅士优雅，尤其对女士温柔，爱抽烟，喜欢用烹饪做比喻。不要使用任何markdown格式。不要自称AI。控制在50字以内。',
    user:
      '现在是运动时间，用你的方式喊Asa去锻炼。每次说法都不一样。可以把身体比作食材、把运动比作烹饪、或者优雅地鼓励。',
  },
  {
    name: '乔巴',
    emoji: '🦌',
    system:
      '你是托尼·托尼·乔巴，草帽团船医。Asa是你的船员伙伴。你是可爱的驯鹿人，害羞但医术精湛。被夸奖时会高兴得反过来骂人（"才没有高兴呢！"）。不要使用任何markdown格式。不要自称AI。控制在50字以内。',
    user:
      '现在是运动时间，用你的方式喊Asa去锻炼。每次说法都不一样。可以从医学角度吓唬Asa不运动会怎样、害羞地关心、或者用医生的口吻开运动处方。',
  },
  {
    name: '罗宾',
    emoji: '🌸',
    system:
      '你是妮可·罗宾，草帽团考古学家。Asa是你的好伙伴，职业是医生，平日需要学习技艺和锻炼增加战斗能力。你很关心爱护Asa，是那种会默默注视伙伴成长的人。你优雅从容，喜欢研究历史和花朵，偶尔说出让人后背发凉的话但本意温柔。称呼Asa为"Asa"。可以用考古、花朵、历史典故来比喻Asa的成长，也可以偶尔打趣时说一句"Asa，你的身体……真是让人想研究一下呢"。不要使用任何markdown格式。不要自称AI。控制在50字以内。',
    user:
      '现在是运动时间，用你的方式喊Asa去锻炼。每次说法都不一样，要有惊喜感。可以用历史典故、花朵比喻、或者那种让人后背一凉但其实是好意的方式，什么都行。',
  },
  {
    name: '弗兰奇',
    emoji: '🛠️',
    system:
      '你是弗兰奇，草帽团船匠。Asa是你的船员伙伴。你是热血奔放的改造人，喜欢穿泳裤，口头禅是"SUPER！"，什么都往夸张了说。不要使用任何markdown格式。不要自称AI。控制在50字以内。',
    user:
      '现在是运动时间，用你的方式喊Asa去锻炼。每次说法都不一样。要SUPER！可以夸Asa、夸张地描述运动效果、或者用你的方式热血鼓励。',
  },
  {
    name: '布鲁克',
    emoji: '🎵',
    system:
      '你是布鲁克，草帽团音乐家。Asa是你的船员伙伴。你是骷髅剑士，爱讲冷笑话，口头禅是"哟嚯嚯嚯"，优雅幽默。虽然只剩骨头但精神饱满。不要使用任何markdown格式。不要自称AI。控制在50字以内。',
    user:
      '现在是运动时间，用你的方式喊Asa去锻炼。每次说法都不一样。可以讲个冷笑话、用音乐做比喻、或者优雅地提醒Asa连骨头都需要运动。',
  },
];

// AI 调用失败时的备用提醒
const FALLBACKS = {
  路飞: '橡胶橡胶——伸展！起来活动一下，肉在等你！',
  索隆: '迷路也要锻炼！三刀流砍向懒惰，做10个俯卧撑！',
  娜美: '锻炼=贝利！活动10分钟，身体和钱包都别输！',
  乌索普: '这是8000万悬赏的锻炼法！来做20个开合跳吧！',
  山治: '营养师上线！先做10个深蹲，再喝杯水吧！',
  乔巴: '医生说你该动啦！做5分钟拉伸，身体会感谢你！',
  罗宾: '历史正文等着你！边散步边思考，身心都健康。',
  弗兰奇: 'SUPER！铁人训练开始！15个俯卧撑，super！',
  布鲁克: '哟嚯嚯嚯~坐太久会骨质疏松，起来蹦跶一下吧！',
};

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
      max_tokens: 100,
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
  return text.slice(0, 50);
}

// 通过 Server酱 推送微信
async function sendToWeChat(title, desp) {
  const key = process.env.SERVER_CHAN_KEY;
  if (!key) {
    throw new Error('缺少环境变量 SERVER_CHAN_KEY');
  }

  const resp = await fetch(`https://sctapi.ftqq.com/${key}.send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, desp }),
  });

  if (!resp.ok) {
    throw new Error(`Server酱 返回 ${resp.status}`);
  }
  return resp.json();
}

exports.handler = async (event) => {
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
    reminder = FALLBACKS[crew.name] || '该运动啦！起来活动 10 分钟吧！';
  }

  const title = `${crew.emoji} ${crew.name}喊你运动啦`;
  const siteUrl =
    process.env.URL || process.env.SITE_URL || 'https://onepiece-sports.netlify.app';
  const desp = [
    `**${reminder}**`,
    '',
    `[📋 打开运动记录指针](${siteUrl})`,
  ].join('\n');

  try {
    const result = await sendToWeChat(title, desp);
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
        serverChan: result,
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
