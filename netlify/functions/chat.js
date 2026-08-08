/**
 * 智谱 AI 聊天代理 Netlify Function
 * 前端 POST { messages: [...] }（可带 crew 角色名），转发给智谱 API 并返回 { reply: "AI回复" }
 * 环境变量：ZHIPU_API_KEY
 */

const { CREW } = require('./crew-data');

const ZHIPU_API_URL = 'https://open.bigmodel.cn/api/paas/v4/chat/completions';
const MODEL = 'glm-4-flash';

const HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: HEADERS, body: '' };
  }

  // 只允许 POST 请求
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: HEADERS,
      body: JSON.stringify({ error: '仅支持 POST 请求' }),
    };
  }

  const apiKey = process.env.ZHIPU_API_KEY;
  if (!apiKey) {
    return {
      statusCode: 500,
      headers: HEADERS,
      body: JSON.stringify({ error: '未设置 ZHIPU_API_KEY 环境变量' }),
    };
  }

  // 解析前端传来的请求体
  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch (err) {
    return {
      statusCode: 400,
      headers: HEADERS,
      body: JSON.stringify({ error: '请求体不是合法的 JSON' }),
    };
  }

  let messages = body.messages;
  if (!Array.isArray(messages) || messages.length === 0) {
    return {
      statusCode: 400,
      headers: HEADERS,
      body: JSON.stringify({ error: 'messages 必须是包含至少一条消息的数组' }),
    };
  }

  // 如果传了角色名且消息里没有 system，自动补上该角色的人设
  if (body.crew && !messages.some((m) => m.role === 'system')) {
    const member = CREW.find((c) => c.name === body.crew);
    if (member) {
      messages = [{ role: 'system', content: member.system }, ...messages];
    }
  }

  try {
    const resp = await fetch(ZHIPU_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages,
        temperature: 0.8,
      }),
    });

    if (!resp.ok) {
      const detail = await resp.text();
      return {
        statusCode: 502,
        headers: HEADERS,
        body: JSON.stringify({ error: `智谱 API 请求失败：${resp.status} ${detail}` }),
      };
    }

    const data = await resp.json();
    const reply =
      data?.choices?.[0]?.message?.content?.trim() ||
      '抱歉，我没有收到回复，请再试一次。';

    return {
      statusCode: 200,
      headers: HEADERS,
      body: JSON.stringify({ reply }),
    };
  } catch (err) {
    return {
      statusCode: 502,
      headers: HEADERS,
      body: JSON.stringify({ error: `调用智谱 API 失败：${err.message}` }),
    };
  }
};
