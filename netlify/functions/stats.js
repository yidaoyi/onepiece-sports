/**
 * 锻炼记录 Netlify Function
 * POST：前端完成一次锻炼后写入记录（Netlify Blobs 持久化）
 * GET：返回 Asa 的锻炼汇总（remind.js 生成个性化提醒时读取）
 */

const { getStore, connectLambda } = require('@netlify/blobs');

const STORE_NAME = 'exercise-stats';
const KEY = 'asa-stats';
const MAX_SESSIONS = 60;

const TYPE_NAMES = { squat: '深蹲', punch: '挥拳', walk: '散步' };

const CORS_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

// 北京时间今天的日期 YYYY-MM-DD
function getBeijingToday() {
  return new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
}

function normalizeSession(body) {
  const type = String(body.type || '').toLowerCase();
  const count = Math.max(0, parseInt(body.count, 10) || 0);
  const seconds = Math.max(0, parseInt(body.seconds, 10) || 0);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(body.date || '') ? body.date : getBeijingToday();
  if (!TYPE_NAMES[type]) {
    throw new Error(`不支持的锻炼类型：${type}`);
  }
  return { date, type, count, seconds };
}

// 汇总：总次数、近 7 天次数、项目、连续天数、最近一次
function summarize(sessions) {
  const today = getBeijingToday();
  const last7 = new Set();
  const now = new Date(Date.now() + 8 * 3600 * 1000);
  for (let i = 0; i < 7; i++) {
    last7.add(new Date(now.getTime() - i * 86400000).toISOString().slice(0, 10));
  }

  const week = sessions.filter((s) => last7.has(s.date));
  const typeCount = {};
  week.forEach((s) => {
    typeCount[s.type] = (typeCount[s.type] || 0) + (s.count || 0);
  });

  const dateSet = new Set(sessions.map((s) => s.date));
  let streak = 0;
  let cursor = today;
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
  return {
    totalSessions: sessions.length,
    weeklyCount: week.length,
    typeCount,
    typeNames: Object.keys(typeCount).map((t) => TYPE_NAMES[t] || t),
    streakDays: streak,
    lastWorkout: last
      ? { date: last.date, type: TYPE_NAMES[last.type] || last.type, count: last.count }
      : null,
  };
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS_HEADERS, body: '' };
  }

  try {
    // Lambda compatibility mode 下不会自动注入 Blobs 运行环境，先手动接入当前请求
    connectLambda(event);
    const store = getStore(STORE_NAME);
    const existing = (await store.get(KEY, { type: 'json' })) || { sessions: [] };
    const sessions = existing.sessions || [];

    if (event.httpMethod === 'GET') {
      return {
        statusCode: 200,
        headers: CORS_HEADERS,
        body: JSON.stringify({ ok: true, stats: summarize(sessions) }),
      };
    }

    if (event.httpMethod === 'POST') {
      const body = JSON.parse(event.body || '{}');
      const session = normalizeSession(body);
      sessions.push(session);
      while (sessions.length > MAX_SESSIONS) {
        sessions.shift();
      }
      await store.set(KEY, JSON.stringify({ sessions, updatedAt: new Date().toISOString() }));
      return {
        statusCode: 200,
        headers: CORS_HEADERS,
        body: JSON.stringify({ ok: true, stats: summarize(sessions) }),
      };
    }

    return {
      statusCode: 405,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: 'Method Not Allowed' }),
    };
  } catch (err) {
    return {
      statusCode: 400,
      headers: CORS_HEADERS,
      body: JSON.stringify({ ok: false, error: err.message }),
    };
  }
};
