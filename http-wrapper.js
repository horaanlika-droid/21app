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

/* ---------- .env: секреты только из файла рядом с сервером ----------
   Формат KEY=VALUE, строки с # — комментарии. Файл в .gitignore, поэтому
   токены не попадают в репозиторий. Реальное окружение (env хостинга)
   имеет приоритет: заданные снаружи переменные не перезатираем. */
(function loadDotEnv() {
  try {
    const raw = fs.readFileSync(path.join(ROOT, '.env'), 'utf8');
    for (const line of raw.split('\n')) {
      const s = line.trim();
      if (!s || s.startsWith('#')) continue;
      const eq = s.indexOf('=');
      if (eq < 1) continue;
      const key = s.slice(0, eq).trim();
      let val = s.slice(eq + 1).trim();
      // снимаем кавычки, если значение обёрнуто
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (!(key in process.env)) process.env[key] = val;
    }
  } catch (e) { /* .env нет — работаем на переменных окружения */ }
})();

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

/* ---------- TON API relay: GET /api/tonapi/<path> ----------
   Ключ живёт ТОЛЬКО здесь, в env бот-хоста:  TONAPI_KEY=... node http-wrapper.js
   Клиент (кошелёк района) ходит на /api/tonapi/... без ключа — мы подставляем
   Authorization и проксируем на tonapi.io. Без ключа тоже работает: у tonapi
   есть бесплатный лимит, просто ниже.

   Разрешены только два пути, нужных приложению (баланс и транзакции), — чтобы
   релей нельзя было использовать как открытый прокси к произвольному API. */
const TONAPI_KEY = process.env.TONAPI_KEY || '';
const TONAPI_BASE = process.env.TONAPI_BASE || 'https://tonapi.io';
const TONAPI_ALLOWED = [
  /^v2\/accounts\/[A-Za-z0-9_:-]{48,68}$/,
  /^v2\/blockchain\/accounts\/[A-Za-z0-9_:-]{48,68}\/transactions$/,
];
/* Микрокеш ответов: клиенты опрашивают баланс раз в 5 сек, и без кеша каждый
   зритель умножал бы нагрузку на лимит ключа. TTL чуть меньше периода опроса. */
const __tonapiCache = new Map();
const TONAPI_TTL = 4000;

async function handleTonApi(req, res, rest) {
  const cors = {
    'Access-Control-Allow-Origin': BOT_ALLOW_ORIGIN,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
  if (req.method === 'OPTIONS') return send(res, 204, '', cors);
  if (req.method !== 'GET') return send(res, 405, '', cors);

  const qIndex = rest.indexOf('?');
  const pathOnly = qIndex >= 0 ? rest.slice(0, qIndex) : rest;
  const query = qIndex >= 0 ? rest.slice(qIndex) : '';

  if (!TONAPI_ALLOWED.some(re => re.test(pathOnly))) {
    res.writeHead(400, Object.assign({ 'Content-Type': 'application/json; charset=utf-8' }, cors));
    return res.end(JSON.stringify({ error: 'path not allowed' }));
  }
  // из query пропускаем только limit — остальное отбрасываем
  const limitMatch = query.match(/[?&]limit=(\d{1,3})/);
  const safeQuery = limitMatch ? '?limit=' + limitMatch[1] : '';
  const target = TONAPI_BASE + '/' + pathOnly + safeQuery;

  const hit = __tonapiCache.get(target);
  if (hit && Date.now() - hit.ts < TONAPI_TTL) {
    res.writeHead(200, Object.assign(
      { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Cache': 'HIT' }, cors));
    return res.end(hit.body);
  }

  try {
    const headers = { Accept: 'application/json' };
    if (TONAPI_KEY) headers.Authorization = 'Bearer ' + TONAPI_KEY;
    const r = await fetch(target, { headers, signal: AbortSignal.timeout(15000) });
    const text = await r.text();
    if (r.ok) {
      __tonapiCache.set(target, { ts: Date.now(), body: text });
      if (__tonapiCache.size > 50) __tonapiCache.delete(__tonapiCache.keys().next().value);
    }
    res.writeHead(r.status, Object.assign(
      { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Cache': 'MISS' }, cors));
    res.end(text);
  } catch (e) {
    // отдаём протухший кеш, если он есть: лучше слегка старые данные, чем ошибка
    if (hit) {
      res.writeHead(200, Object.assign(
        { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Cache': 'STALE' }, cors));
      return res.end(hit.body);
    }
    res.writeHead(502, Object.assign({ 'Content-Type': 'application/json; charset=utf-8' }, cors));
    res.end(JSON.stringify({ error: 'tonapi unavailable' }));
  }
}
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

const PUBLIC_FILE = /^\/(index\.html|sw\.js|manifest\.webmanifest|tonconnect-manifest\.json|favicon\.ico)$/;
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

  // TON API релей (ключ — только в env бот-хоста, см. TONAPI_KEY)
  if (urlPath.indexOf('/api/tonapi/') === 0) {
    const rest = req.url.slice(req.url.indexOf('/api/tonapi/') + '/api/tonapi/'.length);
    return handleTonApi(req, res, rest);
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

  // TON Connect: манифест генерим под фактический origin хоста (localhost / превью / прод),
  // чтобы кошелёк не отбраковал заявку из-за несовпадения домена.
  if (urlPath === '/tonconnect-manifest.json') {
    const host = req.headers.host || ('localhost:' + PORT);
    const proto = req.headers['x-forwarded-proto']
      || (/^localhost|^127\.|^0\.0\.0\.0|^\[::1\]/.test(host) ? 'http' : 'https');
    const origin = proto + '://' + host;
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-store',
    });
    res.end(JSON.stringify({
      name: '21 · районная сеть',
      description: 'Карта дел, задачи во дворе, общий фонд и суд соседей.',
      url: origin,
      iconUrl: origin + '/assets/logo.png',
      termsOfUseUrl: origin + '/',
      privacyPolicyUrl: origin + '/',
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
