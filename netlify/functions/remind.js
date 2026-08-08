/**
 * 定时运动提醒 Netlify Function
 * 每天选一位海贼王船员，用智谱 AI 生成该角色风格的运动提醒，
 * 再通过 Server酱 推送到微信。
 * 环境变量：ZHIPU_API_KEY、SERVER_CHAN_KEY
 */

const ZHIPU_API_URL = 'https://open.bigmodel.cn/api/paas/v4/chat/completions';
const MODEL = 'glm-4-flash';

// 未单独配置 system 的船员使用的默认提示词
const DEFAULT_SYSTEM = '你是一位海贼王角色，负责给用户发送简短的运动提醒。';

// 9 位船员教练，按「星期 + 周数」轮换
const CREW = [
  { name: '路飞', emoji: '🍖' },
  { name: '索隆', emoji: '⚔️' },
  {
    name: '娜美',
    emoji: '🧭',
    system:
      '你是娜美，草帽团航海士。Asa是你的好伙伴，职业是医生，平日需要学习技艺和锻炼增加战斗能力。你很关心爱护Asa，虽然嘴上不饶人。你聪明、爱钱、爱橘子，说话有时温柔有时暴躁。可以当Asa学到新技能或完成锻炼时夸奖，也可以研究新航线时和Asa分享。不要使用任何markdown格式。不要自称AI。控制在50字以内。',
  },
  { name: '乌索普', emoji: '🎯' },
  { name: '山治', emoji: '🍳' },
  { name: '乔巴', emoji: '🦌' },
  {
    name: '罗宾',
    emoji: '🌸',
    system:
      '你是妮可·罗宾，草帽团考古学家。Asa是你的好伙伴，职业是医生，平日需要学习技艺和锻炼增加战斗能力。你很关心爱护Asa，是那种会默默注视伙伴成长的人。你优雅从容，喜欢研究历史和花朵，偶尔说出让人后背发凉的话但本意温柔。称呼Asa为"Asa"。可以用考古、花朵、历史典故来比喻Asa的成长，也可以偶尔打趣时说一句"Asa，你的身体……真是让人想研究一下呢"。不要使用任何markdown格式。不要自称AI。控制在50字以内。',
  },
  { name: '弗兰奇', emoji: '🤖' },
  { name: '布鲁克', emoji: '💀' },
];

// AI 调用失败时的备用提醒（不超过 40 字）
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

// 计算 ISO 周数，让 9 位船员能跨周循环
function getISOWeek(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

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

// 不同时段使用不同的 AI 提示词
const SLOT_PROMPTS = {
  morning: '现在是早上 7 点，请写一条晨间运动提醒，鼓励用户起床活动、开启元气满满的一天',
  afternoon: '现在是下午 1 点，请写一条午间运动提醒，提醒用户午饭后别久坐，起来活动一下',
};

// 用智谱 AI 生成角色风格的运动提醒；失败时抛出异常
async function generateReminder(crew, slot) {
  const apiKey = process.env.ZHIPU_API_KEY;
  if (!apiKey) {
    throw new Error('缺少环境变量 ZHIPU_API_KEY');
  }

  const prompt = `你是海贼王角色「${crew.name}」。${SLOT_PROMPTS[slot]}。整条提醒不超过 40 个字，用他/她的口吻，亲切有动力。只输出提醒内容本身，不要加引号、前缀或解释。`;

  const resp = await fetch(ZHIPU_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: 'system', content: crew.system || DEFAULT_SYSTEM },
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
  return text.slice(0, 40);
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

  // 生成提醒；AI 失败则使用 fallback
  let reminder;
  let aiUsed = true;
  try {
    reminder = await generateReminder(crew, slot);
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
