'use strict';
/* Тесты хранилища и логики админ-бота. Запуск: node bot/test.js
   Telegram не дёргаем — вместо call() подставляем перехватчик. */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { Store } = require('./store');
const { AdminBot } = require('./admin-bot');

let bad = 0;
const ok = (name, cond) => { if (!cond) bad++; console.log((cond ? '✓ ' : '✗ ') + name); };

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), '21store-'));
const file = path.join(tmp, 'board.json');

/* ---------------- хранилище ---------------- */
console.log('— хранилище —');
const s = new Store(file, { saveDelay: 0 });

const t1 = s.createTask({ type: 'fix', title: 'Скамейка', desc: 'две доски' }, 1);
ok('задание создано', s.listTasks('all').length === 1);
ok('цена подставлена из таблицы (fix=500)', t1.reward === 500);
ok('статус active', t1.status === 'active');

s.setPrice('fix', 750, 1);
const t2 = s.createTask({ type: 'fix', title: 'Фонарь' }, 1);
ok('новая цена применяется к новым', t2.reward === 750);
ok('у старого задания цена не изменилась', s.getTask(t1.id).reward === 500);

s.updateTask(t1.id, { reward: 900 }, 1);
ok('цена задания меняется', s.getTask(t1.id).reward === 900);

s.updateTask(t1.id, { status: 'hidden' }, 1);
ok('скрытие работает', s.getTask(t1.id).status === 'hidden');
ok('фильтр active не отдаёт скрытое', s.listTasks('active').length === 1);

/* заявки */
console.log('— заявки —');
const r1 = s.addRequest({ type: 'help', title: 'Донести продукты', author: 'Аня', authorId: 555 });
ok('заявка добавлена', s.listRequests().length === 1);
ok('цена заявки из таблицы (help=300)', r1.cost === 300);

const appr = s.approveRequest(r1.id, 1);
ok('заявка принята → создано задание', !!appr && !!appr.task);
ok('заявка убрана из очереди', s.listRequests().length === 0);
ok('автор перенесён в задание', appr.task.author === 'Аня');

const r2 = s.addRequest({ type: 'fix', title: 'Дверь', author: 'Боб', authorId: 777 });
const appr2 = s.approveRequest(r2.id, 1, 1234);
ok('принятие со своей ценой', appr2.task.reward === 1234);

const r3 = s.addRequest({ type: 'fix', title: 'Мусор', author: 'Спамер', authorId: 999 });
s.rejectRequest(r3.id, 1, 'спам');
ok('отклонение убирает заявку', s.listRequests().length === 0);
ok('повторное отклонение безопасно', s.rejectRequest(r3.id, 1) === null);

/* блеклист */
console.log('— блеклист —');
s.addRequest({ type: 'fix', title: 'Спам 1', author: 'Спамер', authorId: 999 });
s.addRequest({ type: 'fix', title: 'Спам 2', author: 'Спамер', authorId: 999 });
s.addRequest({ type: 'fix', title: 'Норм', author: 'Витя', authorId: 111 });
const blocked = s.block(999, 'Спамер', 'спам', 1);
ok('пользователь заблокирован', s.isBlocked(999));
ok('id как строка тоже находится', s.isBlocked('999'));
ok('заявки заблокированного сняты', blocked.removedRequests === 2);
ok('чужие заявки не тронуты', s.listRequests().length === 1);
ok('повторная блокировка не дублирует', s.block(999, 'Спамер', '', 1) === null);
s.unblock(999, 1);
ok('разблокировка работает', !s.isBlocked(999));
ok('незаблокированный не считается заблокированным', !s.isBlocked(12345));
ok('пустой id не считается заблокированным', !s.isBlocked('') && !s.isBlocked(null));

/* удаление и журнал */
s.deleteTask(t1.id, 1);
ok('задание удалено', !s.getTask(t1.id));
ok('журнал пишется', s.data.log.length > 5);
ok('в журнале есть запись о блокировке', s.data.log.some(l => /аблокирован/.test(l.text)));

/* персистентность */
console.log('— персистентность —');
s.flush();
const s2 = new Store(file, { saveDelay: 0 });
ok('данные читаются после перезапуска', s2.listTasks('all').length === s.listTasks('all').length);
ok('цены сохранились', s2.data.prices.fix === 750);

/* битый файл */
fs.writeFileSync(file, '{ это не json');
const s3 = new Store(file, { saveDelay: 0 });
ok('битый файл не роняет сервер', Array.isArray(s3.data.tasks));
ok('битый файл отложен в сторону', fs.readdirSync(tmp).some(f => f.includes('broken')));

/* ---------------- жизненный цикл задания ---------------- */
console.log('— отчёты о выполнении —');
const lc = new Store(path.join(tmp, 'lc.json'), { saveDelay: 0 });
const job = lc.createTask({ type: 'fix', title: 'Дверь подъезда', reward: 800 }, 1);

let r = lc.takeTask(job.id, { id: 100, name: 'Витя' });
ok('житель взял задание', !r.error && r.task.status === 'doing');
ok('исполнитель записан', lc.getTask(job.id).takenBy === 'Витя');
ok('id исполнителя записан', String(lc.getTask(job.id).takenById) === '100');

r = lc.takeTask(job.id, { id: 200, name: 'Другой' });
ok('второй не может перехватить', r.error === 'taken');
r = lc.takeTask(job.id, { id: 100, name: 'Витя' });
ok('тот же житель может открыть снова', !r.error);

ok('задание видно в «моих»', lc.listMine(100).length === 1);
ok('у чужого пусто', lc.listMine(200).length === 0);

r = lc.reportTask(job.id, { id: 200, name: 'Чужой' }, { text: 'я сделал' });
ok('чужой не может отчитаться', r.error === 'not-yours');

r = lc.reportTask(job.id, { id: 100, name: 'Витя' },
  { text: 'заменил замок', photo: 'data:image/png;base64,AAA', payTo: 'UQtest' });
ok('отчёт принят', !r.error && r.task.status === 'verify');
ok('текст отчёта сохранён', lc.getTask(job.id).report === 'заменил замок');
ok('фото отчёта сохранено', !!lc.getTask(job.id).reportPhoto);
ok('кошелёк для выплаты сохранён', lc.getTask(job.id).payTo === 'UQtest');
ok('задание в очереди проверки', lc.listReports().length === 1);

lc.reworkTask(job.id, 1, 'докрасить');
ok('возврат на доработку', lc.getTask(job.id).status === 'doing');
ok('исполнитель сохранён при возврате', lc.getTask(job.id).takenBy === 'Витя');
ok('причина возврата записана', lc.getTask(job.id).reworkReason === 'докрасить');

lc.reportTask(job.id, { id: 100, name: 'Витя' }, { text: 'докрасил' });
lc.acceptTask(job.id, 1);
ok('работа принята', lc.getTask(job.id).status === 'done');
ok('очередь проверки пуста', lc.listReports().length === 0);

const job2 = lc.createTask({ type: 'help', title: 'Отказ' }, 1);
lc.takeTask(job2.id, { id: 100, name: 'Витя' });
lc.releaseTask(job2.id, { id: 100, name: 'Витя' });
ok('отказ возвращает в общий доступ', lc.getTask(job2.id).status === 'active');
ok('исполнитель очищен', lc.getTask(job2.id).takenBy === null);

ok('счётчик verify в сводке', typeof lc.stats().tasksVerify === 'number');

/* ---------------- лента с картинками ---------------- */
console.log('— лента —');
const post1 = lc.addPost({ text: 'Мастерская открыта', author: 'район' }, 1);
ok('пост создан', lc.listFeed().length === 1);
ok('пост без фото допустим', post1.photo === null);
const post2 = lc.addPost({ text: 'С фото', photo: '/api/photo/abc', photoId: 'abc' }, 1);
ok('пост с фото', post2.photo === '/api/photo/abc');
ok('новые посты сверху', lc.listFeed()[0].id === post2.id);
lc.deletePost(post1.id, 1);
ok('пост удаляется', lc.listFeed().length === 1);

/* ---------------- логика бота ---------------- */
console.log('— бот —');
const store = new Store(path.join(tmp, 'b.json'), { saveDelay: 0 });
const bot = new AdminBot({ token: 'X', store, adminId: '1896036065', log: () => {} });

const sent = [];
bot.call = async (method, params) => { sent.push({ method, params }); return { ok: true, result: {} }; };

// доступ
(async () => {
  await bot.handle({ message: { chat: { id: 42 }, from: { id: 42 }, text: '/start' } });
  ok('чужой не получает панель', !sent.some(m => (m.params.text || '').includes('админ-панель')));

  sent.length = 0;
  await bot.handle({ message: { chat: { id: 1896036065 }, from: { id: 1896036065 }, text: '/start' } });
  ok('админ получает панель', sent.some(m => (m.params.text || '').includes('админ-панель')));

  sent.length = 0;
  await bot.onCallback({ id: 'c1', from: { id: 42 }, data: 'panel', message: { chat: { id: 42 }, message_id: 1 } });
  ok('чужой не проходит по кнопке',
     sent.some(m => m.method === 'answerCallbackQuery' && /админа/.test(m.params.text || '')));

  // создание задания через диалог
  const admin = { chat: { id: 1896036065 }, from: { id: 1896036065 } };
  sent.length = 0;
  await bot.handle({ message: Object.assign({ text: '/new' }, admin) });
  ok('шаг 1: спрашивает категорию', sent.some(m => /категорию/.test(m.params.text || '')));

  await bot.onCallback({ id: 'c2', from: { id: 1896036065 }, data: 'ntype:fix',
                         message: { chat: { id: 1896036065 }, message_id: 5 } });
  await bot.handle({ message: Object.assign({ text: 'Лавочка у 3-го' }, admin) });
  await bot.handle({ message: Object.assign({ text: 'Сломана спинка' }, admin) });
  await bot.handle({ message: Object.assign({ text: '650' }, admin) });
  sent.length = 0;
  await bot.handle({ message: Object.assign({ text: '-' }, admin) });

  const created = store.listTasks('all')[0];
  ok('задание создано через диалог', !!created && created.title === 'Лавочка у 3-го');
  ok('цена из диалога', created && created.reward === 650);
  ok('описание сохранено', created && created.desc === 'Сломана спинка');
  ok('координаты по умолчанию — центр', created && Math.abs(created.x - 48.7894) < 0.001);

  // редактирование цены
  await bot.onCallback({ id: 'c3', from: { id: 1896036065 }, data: 'edit:reward:' + created.id,
                         message: { chat: { id: 1896036065 }, message_id: 6 } });
  await bot.handle({ message: Object.assign({ text: '1500 руб' }, admin) });
  ok('цена отредактирована (мусор в вводе отброшен)', store.getTask(created.id).reward === 1500);

  // некорректный ввод не ломает диалог
  await bot.onCallback({ id: 'c4', from: { id: 1896036065 }, data: 'edit:reward:' + created.id,
                         message: { chat: { id: 1896036065 }, message_id: 7 } });
  sent.length = 0;
  await bot.handle({ message: Object.assign({ text: 'абв' }, admin) });
  ok('нечисловая цена отвергнута', sent.some(m => /Нужно число/.test(m.params.text || '')));
  ok('диалог остался активным', bot.flows.has(1896036065));
  await bot.handle({ message: Object.assign({ text: '/cancel' }, admin) });
  ok('/cancel закрывает диалог', !bot.flows.has(1896036065));

  // координаты
  ok('парсер координат', JSON.stringify(bot.parseXY('48.7894, 44.7783')) === '[48.7894,44.7783]');
  ok('координаты через пробел', JSON.stringify(bot.parseXY('48.7894 44.7783')) === '[48.7894,44.7783]');
  ok('мусор в координатах отвергнут', bot.parseXY('привет') === null);
  ok('нереальные координаты отвергнуты', bot.parseXY('999, 999') === null);

  // заявка → уведомление с кнопками
  const rq = store.addRequest({ type: 'help', title: 'Собака', author: 'Ким', authorId: 321 });
  const btns = bot.requestButtons(rq.id);
  const flat = JSON.stringify(btns);
  ok('кнопки уведомления: принять', flat.includes('appr:' + rq.id));
  ok('кнопки уведомления: заблокировать', flat.includes('rejbl:' + rq.id));

  // отклонить и заблокировать
  await bot.onCallback({ id: 'c5', from: { id: 1896036065 }, data: 'rejbl:' + rq.id,
                         message: { chat: { id: 1896036065 }, message_id: 8 } });
  ok('заявка отклонена', !store.getRequest(rq.id));
  ok('автор заблокирован', store.isBlocked(321));

  // экранирование HTML — иначе парсер Telegram упадёт на < >
  const evil = store.createTask({ type: 'fix', title: '<b>x</b> & <script>' }, 1);
  sent.length = 0;
  await bot.showTask(1896036065, evil.id);
  const shown = sent[0].params.text;
  ok('HTML в названии экранирован', shown.includes('&lt;b&gt;') && shown.includes('&amp;'));

  console.log(bad === 0 ? '\nOK: все проверки пройдены' : '\nFAIL: ошибок ' + bad);
  fs.rmSync(tmp, { recursive: true, force: true });
  process.exit(bad ? 1 : 0);
})();
