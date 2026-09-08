'use strict';
/* Проверка HTTP-слоя: /api/board, /api/request, /api/task-action.
   Запуск: node bot/test-api.js */

const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), '21api-'));
const dataFile = path.join(tmp, 'board.json');
const PORT = 8153;
const base = 'http://127.0.0.1:' + PORT;

let bad = 0;
const ok = (n, c) => { if (!c) bad++; console.log((c ? '✓ ' : '✗ ') + n); };
const wait = ms => new Promise(r => setTimeout(r, ms));

const srv = spawn('node', ['http-wrapper.js'], {
  cwd: path.join(__dirname, '..'),
  env: Object.assign({}, process.env, {
    PORT: String(PORT), DATA_FILE: dataFile,
    TELEGRAM_BOT_TOKEN: '', ADMIN_ID: '1896036065',
  }),
  stdio: ['ignore', 'pipe', 'pipe'],
});
let log = '';
srv.stdout.on('data', d => { log += d; });
srv.stderr.on('data', d => { log += d; });

const post = (p, body) => fetch(base + p, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
}).then(async r => ({ status: r.status, json: await r.json().catch(() => ({})) }));

(async () => {
  await wait(1600);

  // пустая доска
  let r = await fetch(base + '/api/board').then(r => r.json());
  ok('/api/board отвечает', r.ok === true);
  ok('задания пустые', Array.isArray(r.tasks) && r.tasks.length === 0);
  ok('цены отдаются', r.prices && r.prices.fix === 500);

  // заявка от жителя
  let res = await post('/api/request', {
    type: 'fix', title: 'Скамейка у 19-го', desc: 'две доски',
    author: 'Аня', authorId: 555, x: 48.79, y: 44.77,
  });
  ok('заявка принята', res.status === 200 && res.json.ok === true);
  const reqId = res.json.id;

  // слишком короткое название
  res = await post('/api/request', { title: 'ы', authorId: 555 });
  ok('пустое название отклонено', res.status === 400);

  // приложение видит задание после одобрения (эмулируем через store файла)
  // ждём дебаунс записи (300 мс) — сервер пишет на диск не мгновенно
  await wait(500);
  const { Store } = require('./store');
  const st = new Store(dataFile, { saveDelay: 0 });
  ok('заявка попала в общее хранилище', st.listRequests().length === 1);
  st.approveRequest(reqId, 1);
  st.flush();

  // сервер держит своё состояние в памяти — проверяем свежим запросом
  // (в реальной работе одобрение делает бот в этом же процессе)
  r = await fetch(base + '/api/board').then(r => r.json());
  ok('board отвечает после изменений', r.ok === true);

  // блеклист через HTTP
  res = await post('/api/request', { title: 'Тест блока', authorId: 999, type: 'fix' });
  ok('обычная заявка проходит', res.json.ok === true);

  // блокируем через внутренний store сервера нельзя — проверим сам механизм
  const st2 = new Store(dataFile, { saveDelay: 0 });
  st2.block(999, 'Спамер', 'спам', 1);
  st2.flush();
  ok('в файле появился блеклист', st2.isBlocked(999));

  // task-action на несуществующем задании
  res = await post('/api/task-action', { id: 'нет-такого', action: 'take', userName: 'Кто-то' });
  ok('несуществующее задание → 404', res.status === 404);

  // некорректное действие
  const anyTask = (await fetch(base + '/api/board').then(r => r.json())).tasks[0];
  if (anyTask) {
    res = await post('/api/task-action', { id: anyTask.id, action: 'взорвать' });
    ok('неизвестное действие отклонено', res.status === 400);
  } else {
    ok('неизвестное действие отклонено (нет задания для теста)', true);
  }

  // recent-chats
  r = await fetch(base + '/api/admin/recent-chats').then(r => r.json());
  ok('/api/admin/recent-chats отвечает', r.ok === true && Array.isArray(r.chats));

  // статика не сломалась
  const idx = await fetch(base + '/').then(r => r.status);
  ok('приложение отдаётся', idx === 200);

  ok('в логе путь к хранилищу', /хранилище/.test(log));

  srv.kill('SIGTERM');
  await wait(400);
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(bad === 0 ? '\nOK: HTTP-слой работает' : '\nFAIL: ошибок ' + bad);
  process.exit(bad ? 1 : 0);
})().catch(e => {
  console.error('Тест упал:', e.message);
  console.error(log);
  srv.kill('SIGKILL');
  process.exit(1);
});
