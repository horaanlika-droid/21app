#!/usr/bin/env node
/* ============================================================
   21 — http-wrapper
   Минимальный статический сервер (без зависимостей).
   Точка входа для node-хостинга: node http-wrapper.js
   Порт: env PORT (по умолчанию 8080), bind 0.0.0.0
   ============================================================ */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const PORT = parseInt(process.env.PORT, 10) || 8080;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.woff2': 'font/woff2',
  '.map': 'application/json',
};

function send(res, code, body, headers) {
  res.writeHead(code, Object.assign({ 'Cache-Control': 'no-cache' }, headers));
  res.end(body);
}
function sendJson(res, code, obj) {
  send(res, code, JSON.stringify(obj), { 'Content-Type': 'application/json; charset=utf-8' });
}
function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', c => { data += c; if (data.length > (limit || 65536)) { reject(new Error('body too large')); req.destroy(); } });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

/* ---------- Bot API relay: POST /api/bot/<method> ----------
   Токен живёт только здесь — в env бот-хоста:  TELEGRAM_BOT_TOKEN=... node http-wrapper.js
   Приложение (Telegram Mini App) вызывает методы БЕЗ токена; мы проксируем на
   api.telegram.org. Разрешены только методы, нужные приложению. */
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || process.env.BOT_TOKEN || '';
const BOT_ALLOWED = new Set(['getMe', 'sendMessage', 'getUpdates', 'setMyCommands', 'deleteWebhook', 'getWebhookInfo']);
const BOT_ALLOW_ORIGIN = process.env.BOT_ALLOW_ORIGIN || '*'; // свой домен: https://example.pages.dev
const botCors = {
  'Access-Control-Allow-Origin': BOT_ALLOW_ORIGIN,
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};
async function handleBotApi(req, res, method) {
  if (!BOT_ALLOWED.has(method) || method.includes('..')) return sendJson(res, 400, { ok: false, description: 'bad request' });
  if (!BOT_TOKEN) return sendJson(res, 503, { ok: false, description: 'service unavailable' });
  let params = {};
  try { params = JSON.parse((await readBody(req)) || '{}'); } catch (e) { /* пустое тело допустимо */ }
  try {
    const r = await fetch('https://api.telegram.org/bot' + BOT_TOKEN + '/' + method, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(params),
    });
    const text = await r.text();
    res.writeHead(r.status, Object.assign({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }, botCors));
    res.end(text);
  } catch (e) {
    sendJson(res, 502, { ok: false, description: 'service unavailable' });
  }
}

const PUBLIC_FILE = /^\/(index\.html|sw\.js|manifest\.webmanifest|favicon\.ico)$/;
const ASSET_FILE = /^\/assets\/[A-Za-z0-9_\/. -]+\.(png|jpe?g|gif|svg|webp|css|js|json|woff2)$/;

let __rateCache = { v: 0, ts: 0 };
const __payLimit = new Map();

const server = http.createServer((req, res) => {
  let urlPath;
  try {
    urlPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  } catch (e) {
    return send(res, 400, 'Bad');
  }
  if (urlPath === '/') urlPath = '/index.html';

  // бот-релей (админ-функции приложения идут через него)
  if (urlPath.indexOf('/api/bot/') === 0 || urlPath === '/api/bot') {
    if (req.method === 'OPTIONS') return send(res, 204, '', botCors);
    if (req.method !== 'POST') return send(res, 405, '', botCors);
    return handleBotApi(req, res, urlPath.slice('/api/bot/'.length));
  }

  // ── выплаты GRAM ──
  // курс Toncoin→RUB (публичный, кэш 10 мин)
  if (urlPath === '/api/rate') {
    (async () => {
      const now = Date.now();
      if (__rateCache.v > 0 && now - __rateCache.ts < 600000) return sendJson(res, 200, { ok: true, gram_rub: __rateCache.v });
      try {
        const r = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=the-open-network&vs_currencies=rub');
        const j = await r.json();
        const v = j && j['the-open-network'] && j['the-open-network'].rub;
        if (v > 0) { __rateCache = { v, ts: now }; return sendJson(res, 200, { ok: true, gram_rub: v }); }
        sendJson(res, 200, { ok: false });
      } catch (e) { sendJson(res, 200, { ok: false }); }
    })();
    return;
  }
  // адрес кошелька выплат (и баланс, если задан TONCENTER_API_KEY)
  if (urlPath === '/api/wallet') {
    (async () => {
      const address = process.env.TON_PAYOUT_ADDRESS || '';
      if (!address) return sendJson(res, 200, { ok: false });
      let balance = '';
      if (process.env.TONCENTER_API_KEY) {
        try {
          const r = await fetch('https://toncenter.com/api/v2/getAddressBalance?address=' + encodeURIComponent(address) + '&apikey=' + process.env.TONCENTER_API_KEY);
          const j = await r.json();
          if (j && j.ok && j.result) balance = (parseInt(j.result, 10) / 1e9).toFixed(2);
        } catch (e) {}
      }
      sendJson(res, 200, { ok: true, address, balance });
    })();
    return;
  }
  // заявка на выплату: авто-отправка через внешний подписчик (TON_SEND_CMD "<addr>" <grams>)
  // или режим «вручную» — ссылка ton:// открывается из приложения самим модератором
  if (urlPath === '/api/payout') {
    if (req.method !== 'POST') return send(res, 405, '', botCors);
    const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '') + '';
    const now = Date.now();
    const hits = (__payLimit.get(ip) || []).filter(t => now - t < 3600000);
    if (hits.length >= 10) return sendJson(res, 429, { ok: false, description: 'limit' });
    hits.push(now);
    __payLimit.set(ip, hits);
    (async () => {
      let b = {};
      try { b = JSON.parse((await readBody(req)) || '{}'); } catch (e) {}
      const to = String(b.to || '');
      const rub = Number(b.amount_rub || 0);
      if (!/^(UQ|EQ)[-A-Za-z0-9_]{46,50}$/.test(to) && !/^[a-z0-9_]{4,32}\.ton$/i.test(to)) return sendJson(res, 400, { ok: false, description: 'bad address' });
      if (!(rub > 0) || rub > 100000) return sendJson(res, 400, { ok: false, description: 'bad amount' });
      const gram = __rateCache.v > 0 ? (rub / __rateCache.v).toFixed(4) : '';
      const cmd = process.env.TON_SEND_CMD || '';
      let sent = false;
      if (cmd && gram) {
        try {
          require('child_process').execSync(cmd + ' "' + to + '" ' + gram, { timeout: 20000, stdio: 'ignore' });
          sent = true;
        } catch (e) { sent = false; }
      }
      if (BOT_TOKEN && sent) {
        const chat = String(b.chat || process.env.BOT_ADMIN_CHAT || '');
        if (chat) {
          try { await fetch('https://api.telegram.org/bot' + BOT_TOKEN + '/sendMessage', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: chat, text: '💸 21 · выплата ' + rub + ' ₽ ≈ ' + gram + ' GRAM → ' + to }) }); } catch (e) {}
        }
      }
      sendJson(res, 200, { ok: true, sent, gram, link: gram ? 'ton://transfer/' + encodeURIComponent(to) + '?amount=' + gram : '' });
    })();
    return;
  }

  // публичная статистика сообщества: сколько людей в чате района (счётчик в шапке)
  if (urlPath === '/api/stats') {
    (async () => {
      const chat = process.env.BOT_STATS_CHAT || '';
      if (!BOT_TOKEN || !chat) return sendJson(res, 200, { ok: false });
      try {
        const r = await fetch('https://api.telegram.org/bot' + BOT_TOKEN + '/getChatMemberCount', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: chat }),
        });
        const j = await r.json();
        sendJson(res, 200, { ok: !!(j && j.ok && j.result > 0), count: j && j.result ? j.result : 0 });
      } catch (e) { sendJson(res, 200, { ok: false }); }
    })();
    return;
  }

  if (urlPath === '/tonconnect-manifest.json') {
    const host = req.headers.host || ('localhost:' + PORT);
    const proto = req.headers['x-forwarded-proto'] || 'https';
    const origin = proto + '://' + host;
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({
      name: '21 · районная сеть',
      description: 'Карта дел, задачи во дворе, общий фонд и суд соседей.',
      url: origin,
      iconUrl: origin + '/assets/logo.png',
      version: '1',
    }));
    return;
  }

  // наружу — только файлы приложения; остальное (служебное, исходники, фото) не отдаём
  if (urlPath.includes('/.') || !(PUBLIC_FILE.test(urlPath) || ASSET_FILE.test(urlPath))) {
    return send(res, 404, '404');
  }
  // защита от выхода за корень
  const filePath = path.normalize(path.join(ROOT, urlPath));
  if (!filePath.startsWith(ROOT + path.sep) && filePath !== ROOT) {
    return send(res, 403, '403');
  }

  fs.stat(filePath, (err, st) => {
    let target = filePath;
    if (!err && st.isDirectory()) target = path.join(filePath, 'index.html');
    else if (err) {
      // SPA-фолбэк для путей без расширения (роуты приложения — через hash)
      if (!path.extname(urlPath)) target = path.join(ROOT, 'index.html');
      else return send(res, 404, '404');
    }
    fs.readFile(target, (err2, data) => {
      if (err2) return send(res, 404, '404');
      const type = MIME[path.extname(target).toLowerCase()] || 'application/octet-stream';
      const cache = target.includes(path.sep + 'assets' + path.sep)
        ? { 'Cache-Control': 'public, max-age=86400' }
        : {};
      send(res, 200, data, Object.assign({ 'Content-Type': type, 'Content-Length': data.length }, cache));
    });
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('21 → http://0.0.0.0:' + PORT + '  (root: ' + ROOT + ', bot relay: ' + (BOT_TOKEN ? 'ON' : 'OFF — TELEGRAM_BOT_TOKEN не задан') + ')');
});
