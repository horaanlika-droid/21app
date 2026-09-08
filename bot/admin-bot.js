'use strict';
/* ============================================================
   21 — админ-панель в Telegram-боте
   ------------------------------------------------------------
   Долгий опрос getUpdates + inline-кнопки. Всё состояние — в общем
   хранилище (bot/store.js), поэтому созданное здесь сразу видно в
   приложении через /api/*.

   ВАЖНО: getUpdates может читать только ОДИН потребитель. Поэтому
   приложение больше не вызывает getUpdates напрямую (см. index.html →
   кнопка «найти чат» ходит в /api/admin/recent-chats).
   ============================================================ */

const { TYPES } = require('./store');

const API = 'https://api.telegram.org/bot';

/** Экранирование под parse_mode: HTML. */
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function fmtR(n) {
  return (Math.round(n) || 0).toLocaleString('ru-RU') + ' ₽';
}

function shortId(id) {
  return String(id).slice(-6);
}

class AdminBot {
  /**
   * @param {object} opts
   * @param {string} opts.token   токен бота
   * @param {import('./store').Store} opts.store
   * @param {number|string} opts.adminId  id админа — только он видит панель
   * @param {(text:string)=>void} [opts.log]
   */
  constructor({ token, store, adminId, log }) {
    this.token = token;
    this.store = store;
    this.adminId = String(adminId || '');
    this.log = log || (() => {});
    this.running = false;
    this.aborter = null;
    /** Пошаговые диалоги: chatId → {action, step, draft} */
    this.flows = new Map();
    this.failCount = 0;
  }

  /* ---------------- транспорт ---------------- */

  async call(method, params, timeoutMs = 15000) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const r = await fetch(API + this.token + '/' + method, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params || {}),
        signal: ctrl.signal,
      });
      return await r.json();
    } finally {
      clearTimeout(timer);
    }
  }

  send(chatId, text, extra) {
    return this.call('sendMessage', Object.assign({
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    }, extra || {}));
  }

  editText(chatId, messageId, text, extra) {
    return this.call('editMessageText', Object.assign({
      chat_id: chatId, message_id: messageId, text,
      parse_mode: 'HTML', disable_web_page_preview: true,
    }, extra || {}));
  }

  answer(callbackId, text, alert) {
    return this.call('answerCallbackQuery', {
      callback_query_id: callbackId,
      text: text || '',
      show_alert: !!alert,
    }).catch(() => {});
  }

  /* ---------------- жизненный цикл ---------------- */

  async start() {
    if (this.running) return;
    this.running = true;

    // вебхук и getUpdates взаимоисключающи — снимаем вебхук на всякий случай
    try { await this.call('deleteWebhook', { drop_pending_updates: false }); } catch (e) {}

    try {
      const me = await this.call('getMe');
      if (me && me.ok) {
        this.username = me.result.username;
        this.log('админ-бот: @' + me.result.username + ' (админ ' + this.adminId + ')');
      } else {
        this.log('админ-бот: токен отклонён Telegram — ' + ((me && me.description) || 'нет ответа'));
      }
    } catch (e) {
      this.log('админ-бот: нет связи с Telegram (' + e.message + ') — продолжаю попытки');
    }

    this.setCommands().catch(() => {});
    this.loop();
  }

  stop() {
    this.running = false;
    if (this.aborter) { try { this.aborter.abort(); } catch (e) {} }
  }

  setCommands() {
    return this.call('setMyCommands', {
      commands: [
        { command: 'start',   description: 'Админ-панель' },
        { command: 'new',     description: 'Создать задание' },
        { command: 'tasks',   description: 'Список заданий' },
        { command: 'queue',   description: 'Заявки на модерации' },
        { command: 'prices',  description: 'Цены по категориям' },
        { command: 'block',   description: 'Блеклист' },
        { command: 'stats',   description: 'Сводка' },
        { command: 'cancel',  description: 'Отменить ввод' },
      ],
    });
  }

  /** Цикл long polling. При ошибках — плавный backoff, без спама в лог. */
  async loop() {
    while (this.running) {
      try {
        const res = await this.call('getUpdates', {
          offset: this.store.data.offset || 0,
          timeout: 25,
          allowed_updates: ['message', 'callback_query'],
        }, 35000);

        if (!res || !res.ok) {
          // 409 = другой процесс уже читает апдейты этого бота
          if (res && res.error_code === 409) {
            this.log('админ-бот: конфликт getUpdates — бот запущен ещё где-то. Пауза 30 с.');
            await this.sleep(30000);
            continue;
          }
          throw new Error((res && res.description) || 'getUpdates failed');
        }

        this.failCount = 0;
        for (const upd of res.result || []) {
          this.store.setOffset(upd.update_id + 1);
          try {
            await this.handle(upd);
          } catch (e) {
            this.log('админ-бот: ошибка обработки — ' + e.message);
          }
        }
      } catch (e) {
        if (!this.running) break;
        this.failCount++;
        const delay = Math.min(30000, 1000 * Math.pow(2, Math.min(this.failCount, 5)));
        if (this.failCount <= 2 || this.failCount % 10 === 0) {
          this.log('админ-бот: опрос не удался (' + e.message + '), повтор через ' + Math.round(delay / 1000) + ' с');
        }
        await this.sleep(delay);
      }
    }
  }

  sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
  }

  /* ---------------- роутинг ---------------- */

  isAdmin(id) {
    return String(id) === this.adminId;
  }

  async handle(upd) {
    if (upd.callback_query) return this.onCallback(upd.callback_query);
    const msg = upd.message;
    if (!msg) return;

    if (msg.chat) this.store.rememberChat(msg.chat);

    const from = msg.from || {};
    if (!this.isAdmin(from.id)) {
      // не админ — вежливо отвечаем и ничего не показываем
      if (msg.text && msg.text.startsWith('/')) {
        await this.send(msg.chat.id, 'Это служебный бот района 21. Задания и заявки — в приложении.');
      }
      return;
    }

    // фото/подпись: Telegram кладёт текст в caption, а не в text
    const text = (msg.text || msg.caption || '').trim();

    // активный пошаговый диалог перехватывает ввод (кроме команд)
    const flow = this.flows.get(msg.chat.id);
    if (flow && !text.startsWith('/')) return this.onFlowInput(msg, flow, text);

    if (text.startsWith('/')) {
      const cmd = text.split(/[\s@]/)[0].slice(1).toLowerCase();
      const rest = text.slice(text.split(/\s/)[0].length).trim();
      return this.onCommand(msg, cmd, rest);
    }

    // просто текст без диалога — показываем панель
    return this.showPanel(msg.chat.id);
  }

  async onCommand(msg, cmd, rest) {
    const chatId = msg.chat.id;
    switch (cmd) {
      case 'start':
      case 'menu':
      case 'admin':
        return this.showPanel(chatId);
      case 'new':
        return this.startNewTask(chatId);
      case 'tasks':
        return this.showTasks(chatId, 'active');
      case 'queue':
        return this.showQueue(chatId);
      case 'prices':
        return this.showPrices(chatId);
      case 'block':
        return rest ? this.blockByText(chatId, rest) : this.showBlacklist(chatId);
      case 'unblock':
        return rest ? this.unblockByText(chatId, rest) : this.showBlacklist(chatId);
      case 'stats':
        return this.showStats(chatId);
      case 'log':
        return this.showLog(chatId);
      case 'cancel':
        this.flows.delete(chatId);
        return this.send(chatId, 'Ввод отменён.', this.kbBack());
      case 'id':
        return this.send(chatId, 'Ваш id: <code>' + msg.from.id + '</code>\nЧат: <code>' + chatId + '</code>');
      default:
        return this.send(chatId, 'Не знаю такую команду. /start — панель.');
    }
  }

  /* ---------------- экраны ---------------- */

  kbBack() {
    return { reply_markup: { inline_keyboard: [[{ text: '‹ Панель', callback_data: 'panel' }]] } };
  }

  async showPanel(chatId, messageId) {
    const s = this.store.stats();
    const text =
      '<b>21 · админ-панель</b>\n\n' +
      'Заданий активно: <b>' + s.tasksActive + '</b>' +
      (s.tasksDoing ? ' · в работе ' + s.tasksDoing : '') +
      (s.tasksDone ? ' · сделано ' + s.tasksDone : '') + '\n' +
      (s.tasksVerify ? '⚠️ Ждут проверки: <b>' + s.tasksVerify + '</b>\n' : '') +
      'Заявок на модерации: <b>' + s.requests + '</b>\n' +
      'В блеклисте: <b>' + s.blacklist + '</b>\n' +
      'Фонд обещал по активным: <b>' + fmtR(s.rewardActive) + '</b>';

    const kb = { inline_keyboard: [
      [{ text: '➕ Создать задание', callback_data: 'new' }],
      [{ text: '🔍 Отчёты' + (s.tasksVerify ? ' (' + s.tasksVerify + ')' : ''), callback_data: 'reports' }],
      [{ text: '📋 Задания (' + s.tasksActive + ')', callback_data: 'tasks:active:0' },
       { text: '📨 Заявки' + (s.requests ? ' (' + s.requests + ')' : ''), callback_data: 'queue' }],
      [{ text: '💰 Цены', callback_data: 'prices' },
       { text: '🚫 Блеклист (' + s.blacklist + ')', callback_data: 'bl' }],
      [{ text: '📣 Опубликовать в ленту', callback_data: 'post' }],
      [{ text: '📊 Сводка', callback_data: 'stats' },
       { text: '🧾 Журнал', callback_data: 'log' }],
    ] };

    if (messageId) return this.editText(chatId, messageId, text, { reply_markup: kb });
    return this.send(chatId, text, { reply_markup: kb });
  }

  taskLine(t) {
    const mark = t.status === 'done' ? '✅' : t.status === 'doing' ? '🔧' : t.status === 'hidden' ? '🙈' : '🟢';
    return mark + ' <b>' + esc(t.title) + '</b>\n' +
      '   ' + TYPES[t.type].n + ' · ' + fmtR(t.reward) + ' · ' + t.xp + ' XP' +
      (t.takenBy ? ' · взял ' + esc(t.takenBy) : '');
  }

  async showTasks(chatId, filter, page = 0, messageId) {
    const all = this.store.listTasks(filter);
    const perPage = 6;
    const pages = Math.max(1, Math.ceil(all.length / perPage));
    const safePage = Math.min(Math.max(0, page), pages - 1);
    const slice = all.slice(safePage * perPage, safePage * perPage + perPage);

    const titles = { active: 'Активные', doing: 'В работе', done: 'Сделанные', all: 'Все' };
    let text = '<b>Задания · ' + (titles[filter] || filter) + '</b> (' + all.length + ')\n\n';
    text += slice.length ? slice.map(t => this.taskLine(t)).join('\n\n') : '<i>пусто</i>';

    const rows = slice.map(t => ([{ text: '✏️ ' + t.title.slice(0, 28), callback_data: 'task:' + t.id }]));

    const nav = [];
    if (safePage > 0) nav.push({ text: '‹', callback_data: 'tasks:' + filter + ':' + (safePage - 1) });
    if (safePage < pages - 1) nav.push({ text: '›', callback_data: 'tasks:' + filter + ':' + (safePage + 1) });
    if (nav.length) rows.push(nav);

    rows.push([
      { text: filter === 'active' ? '● Активные' : 'Активные', callback_data: 'tasks:active:0' },
      { text: filter === 'doing' ? '● В работе' : 'В работе', callback_data: 'tasks:doing:0' },
    ]);
    rows.push([
      { text: filter === 'done' ? '● Сделанные' : 'Сделанные', callback_data: 'tasks:done:0' },
      { text: filter === 'all' ? '● Все' : 'Все', callback_data: 'tasks:all:0' },
    ]);
    rows.push([{ text: '‹ Панель', callback_data: 'panel' }]);

    const kb = { reply_markup: { inline_keyboard: rows } };
    if (messageId) return this.editText(chatId, messageId, text, kb);
    return this.send(chatId, text, kb);
  }

  async showTask(chatId, id, messageId) {
    const t = this.store.getTask(id);
    if (!t) return this.send(chatId, 'Задание не найдено (возможно, удалено).', this.kbBack());

    const text =
      '<b>' + esc(t.title) + '</b>\n\n' +
      (t.desc ? esc(t.desc) + '\n\n' : '') +
      'Категория: ' + TYPES[t.type].n + '\n' +
      'Цена: <b>' + fmtR(t.reward) + '</b>\n' +
      'XP / карма: ' + t.xp + ' / ' + t.karma + '\n' +
      'Статус: ' + t.status + (t.takenBy ? ' (' + esc(t.takenBy) + ')' : '') + '\n' +
      'Координаты: ' + Number(t.x).toFixed(4) + ', ' + Number(t.y).toFixed(4) + '\n' +
      'Автор: ' + esc(t.author) + '\n' +
      (t.photo ? '📷 фото приложено\n' : '') +
      (t.report ? '\n<b>Отчёт исполнителя:</b>\n<i>' + esc(t.report) + '</i>\n' : '') +
      '<code>#' + shortId(t.id) + '</code>';

    const kb = { reply_markup: { inline_keyboard: [
      [{ text: '💰 Цена', callback_data: 'edit:reward:' + t.id },
       { text: '📝 Название', callback_data: 'edit:title:' + t.id }],
      [{ text: '📄 Описание', callback_data: 'edit:desc:' + t.id },
       { text: '📍 Координаты', callback_data: 'edit:xy:' + t.id }],
      [{ text: t.photo ? '📷 Заменить фото' : '📷 Добавить фото', callback_data: 'photo:' + t.id }],
      [{ text: t.status === 'active' ? '🙈 Скрыть' : '🟢 Опубликовать', callback_data: 'toggle:' + t.id },
       { text: '✅ Закрыть', callback_data: 'done:' + t.id }],
      [{ text: '🗑 Удалить', callback_data: 'del:' + t.id }],
      [{ text: '‹ К списку', callback_data: 'tasks:active:0' }],
    ] } };

    if (messageId) return this.editText(chatId, messageId, text, kb);
    return this.send(chatId, text, kb);
  }

  async showQueue(chatId, messageId) {
    const list = this.store.listRequests();
    if (!list.length) {
      const kb = this.kbBack();
      const text = '<b>Заявки</b>\n\n<i>Пока пусто — новые заявки из приложения появятся здесь.</i>';
      if (messageId) return this.editText(chatId, messageId, text, kb);
      return this.send(chatId, text, kb);
    }

    const r = list[0];
    const text =
      '<b>Заявка 1 из ' + list.length + '</b>\n\n' +
      '<b>' + esc(r.title) + '</b>\n' +
      (r.desc ? esc(r.desc) + '\n' : '') + '\n' +
      'Категория: ' + TYPES[r.type].n + '\n' +
      'Предложенная цена: <b>' + fmtR(r.cost) + '</b>\n' +
      'Координаты: ' + Number(r.x).toFixed(4) + ', ' + Number(r.y).toFixed(4) + '\n' +
      'От: ' + esc(r.author) + (r.authorId ? ' (<code>' + r.authorId + '</code>)' : '');

    const kb = { reply_markup: { inline_keyboard: [
      [{ text: '✅ Принять', callback_data: 'appr:' + r.id },
       { text: '💰 Цена и принять', callback_data: 'apprp:' + r.id }],
      [{ text: '✕ Отклонить', callback_data: 'rej:' + r.id }],
      [{ text: '🚫 Отклонить и заблокировать', callback_data: 'rejbl:' + r.id }],
      [{ text: '‹ Панель', callback_data: 'panel' }],
    ] } };

    if (messageId) return this.editText(chatId, messageId, text, kb);
    return this.send(chatId, text, kb);
  }

  /** Отчёты жителей о выполненной работе — очередь проверки. */
  async showReports(chatId, messageId) {
    const list = this.store.listReports();
    if (!list.length) {
      const text = '<b>Отчёты</b>\n\n<i>Нет работ на проверке. Когда житель сдаст задание, оно появится здесь.</i>';
      const kb = this.kbBack();
      if (messageId) return this.editText(chatId, messageId, text, kb);
      return this.send(chatId, text, kb);
    }

    const t = list[0];
    const waited = t.reportAt ? Math.round((Date.now() - t.reportAt) / 3600000) : 0;
    const text =
      '<b>Отчёт 1 из ' + list.length + '</b>\n\n' +
      '<b>' + esc(t.title) + '</b>\n' +
      'Исполнитель: <b>' + esc(t.takenBy || '—') + '</b>\n' +
      'К выплате: <b>' + fmtR(t.reward) + '</b>\n' +
      (waited ? 'Ждёт: ' + waited + ' ч\n' : '') +
      '\n' + (t.report ? '<i>' + esc(t.report) + '</i>' : '<i>без комментария</i>') +
      (t.payTo ? '\n\nКошелёк: <code>' + esc(t.payTo) + '</code>' : '') +
      (t.reportPhoto ? '\n\n📷 фото приложено — смотрите в приложении' : '');

    const kb = { reply_markup: { inline_keyboard: [
      [{ text: '✅ Принять работу', callback_data: 'acc:' + t.id }],
      [{ text: '↩️ На доработку', callback_data: 'rew:' + t.id }],
      [{ text: '✏️ Открыть задание', callback_data: 'task:' + t.id }],
      [{ text: '‹ Панель', callback_data: 'panel' }],
    ] } };

    if (messageId) return this.editText(chatId, messageId, text, kb);
    return this.send(chatId, text, kb);
  }

  async showPrices(chatId, messageId) {
    const p = this.store.data.prices;
    const text = '<b>Цены по категориям</b>\n\n' +
      Object.keys(TYPES).map(k => TYPES[k].n + ' — <b>' + fmtR(p[k] ?? 0) + '</b>').join('\n') +
      '\n\n<i>Цена подставляется в новые задания. У созданных не меняется.</i>';

    const rows = Object.keys(TYPES).map(k => ([{
      text: TYPES[k].n + ' · ' + fmtR(p[k] ?? 0), callback_data: 'price:' + k,
    }]));
    rows.push([{ text: '‹ Панель', callback_data: 'panel' }]);

    const kb = { reply_markup: { inline_keyboard: rows } };
    if (messageId) return this.editText(chatId, messageId, text, kb);
    return this.send(chatId, text, kb);
  }

  async showBlacklist(chatId, messageId) {
    const list = this.store.listBlacklist();
    let text = '<b>Блеклист</b> (' + list.length + ')\n\n';
    text += list.length
      ? list.slice(0, 15).map(b =>
          '• ' + esc(b.name || b.id) + ' <code>' + b.id + '</code>' +
          (b.reason ? '\n   ' + esc(b.reason) : '')).join('\n')
      : '<i>пусто</i>';
    text += '\n\nЗаблокированный не может присылать заявки и брать задания.\n' +
      'Команды: <code>/block id причина</code>, <code>/unblock id</code>';

    const rows = list.slice(0, 8).map(b => ([{
      text: '✓ Разблокировать ' + (b.name || b.id).slice(0, 22), callback_data: 'unbl:' + b.id,
    }]));
    rows.unshift([{ text: '➕ Заблокировать по id', callback_data: 'blockask' }]);
    rows.push([{ text: '‹ Панель', callback_data: 'panel' }]);

    const kb = { reply_markup: { inline_keyboard: rows } };
    if (messageId) return this.editText(chatId, messageId, text, kb);
    return this.send(chatId, text, kb);
  }

  async showStats(chatId, messageId) {
    const s = this.store.stats();
    const p = this.store.data.prices;
    const text = '<b>Сводка</b>\n\n' +
      'Заданий всего: ' + s.tasksTotal + '\n' +
      '  активных: ' + s.tasksActive + '\n' +
      '  в работе: ' + s.tasksDoing + '\n' +
      '  закрыто: ' + s.tasksDone + '\n\n' +
      'Заявок на модерации: ' + s.requests + '\n' +
      'В блеклисте: ' + s.blacklist + '\n\n' +
      'Обещано по активным: <b>' + fmtR(s.rewardActive) + '</b>\n\n' +
      'Цены: ' + Object.keys(TYPES).map(k => TYPES[k].n + ' ' + (p[k] ?? 0)).join(' · ');

    const kb = this.kbBack();
    if (messageId) return this.editText(chatId, messageId, text, kb);
    return this.send(chatId, text, kb);
  }

  async showLog(chatId, messageId) {
    const log = this.store.data.log.slice(0, 15);
    const text = '<b>Журнал действий</b>\n\n' + (log.length
      ? log.map(l => {
          const d = new Date(l.t);
          const time = d.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
          return '<code>' + time + '</code> ' + esc(l.text);
        }).join('\n')
      : '<i>пусто</i>');

    const kb = this.kbBack();
    if (messageId) return this.editText(chatId, messageId, text, kb);
    return this.send(chatId, text, kb);
  }

  /* ---------------- callback-кнопки ---------------- */

  async onCallback(cq) {
    const chatId = cq.message && cq.message.chat && cq.message.chat.id;
    const msgId = cq.message && cq.message.message_id;

    if (!this.isAdmin(cq.from.id)) return this.answer(cq.id, 'Только для админа', true);

    const data = cq.data || '';
    const [action, ...args] = data.split(':');

    try {
      switch (action) {
        case 'panel':
          await this.answer(cq.id);
          return this.showPanel(chatId, msgId);

        case 'new':
          await this.answer(cq.id);
          return this.startNewTask(chatId);

        case 'tasks':
          await this.answer(cq.id);
          return this.showTasks(chatId, args[0] || 'active', parseInt(args[1], 10) || 0, msgId);

        case 'task':
          await this.answer(cq.id);
          return this.showTask(chatId, args[0], msgId);

        case 'queue':
          await this.answer(cq.id);
          return this.showQueue(chatId, msgId);

        case 'reports':
          await this.answer(cq.id);
          return this.showReports(chatId, msgId);

        case 'acc': {
          const t = this.store.acceptTask(args[0], cq.from.id);
          if (!t) return this.answer(cq.id, 'Не найдено', true);
          await this.answer(cq.id, 'Работа принята');
          if (t.takenById) {
            this.send(t.takenById,
              '✅ Работа принята: «' + esc(t.title) + '»' +
              (t.reward ? '\nК выплате: ' + fmtR(t.reward) : '')).catch(() => {});
          }
          return this.showReports(chatId, msgId);
        }

        case 'rew': {
          this.flows.set(chatId, { action: 'rework', id: args[0], step: 'value' });
          await this.answer(cq.id);
          return this.send(chatId, 'Что доделать? Пришлите комментарий (или «-» без пояснений).\n\n/cancel — отмена');
        }

        case 'post': {
          this.flows.set(chatId, { action: 'post', step: 'text', draft: {} });
          await this.answer(cq.id);
          return this.send(chatId,
            '<b>Публикация в ленту</b>\n\nПришлите текст поста.\n' +
            'Можно сразу отправить <b>фото с подписью</b> — оно попадёт в пост.\n\n/cancel — отмена');
        }

        case 'prices':
          await this.answer(cq.id);
          return this.showPrices(chatId, msgId);

        case 'bl':
          await this.answer(cq.id);
          return this.showBlacklist(chatId, msgId);

        case 'stats':
          await this.answer(cq.id);
          return this.showStats(chatId, msgId);

        case 'log':
          await this.answer(cq.id);
          return this.showLog(chatId, msgId);

        /* --- тип при создании --- */
        case 'ntype': {
          const flow = this.flows.get(chatId);
          if (!flow || flow.action !== 'new') return this.answer(cq.id, 'Создание не начато');
          flow.draft.type = args[0];
          flow.step = 'title';
          await this.answer(cq.id, TYPES[args[0]].n);
          return this.editText(chatId, msgId,
            'Категория: <b>' + TYPES[args[0]].n + '</b>\n\nТеперь пришлите <b>название</b> задания.');
        }

        /* --- редактирование --- */
        case 'edit': {
          const [field, id] = args;
          const t = this.store.getTask(id);
          if (!t) return this.answer(cq.id, 'Задание не найдено', true);
          const prompts = {
            reward: 'Пришлите новую цену в рублях (число).',
            title: 'Пришлите новое название.',
            desc: 'Пришлите новое описание.',
            xy: 'Пришлите координаты (<code>48.7894, 44.7783</code>) или ссылку на Яндекс/Google Карты.',
          };
          this.flows.set(chatId, { action: 'edit', field, id, step: 'value' });
          await this.answer(cq.id);
          return this.send(chatId, prompts[field] + '\n\n/cancel — отмена');
        }

        case 'photo': {
          this.flows.set(chatId, { action: 'photo', id: args[0], step: 'value' });
          await this.answer(cq.id);
          return this.send(chatId, 'Пришлите изображение для задания.\n\n/cancel — отмена');
        }

        case 'toggle': {
          const t = this.store.getTask(args[0]);
          if (!t) return this.answer(cq.id, 'Не найдено', true);
          const next = t.status === 'active' ? 'hidden' : 'active';
          this.store.updateTask(t.id, { status: next }, cq.from.id);
          await this.answer(cq.id, next === 'active' ? 'Опубликовано' : 'Скрыто');
          return this.showTask(chatId, t.id, msgId);
        }

        case 'done': {
          const t = this.store.getTask(args[0]);
          if (!t) return this.answer(cq.id, 'Не найдено', true);
          this.store.updateTask(t.id, { status: 'done' }, cq.from.id);
          await this.answer(cq.id, 'Закрыто');
          return this.showTask(chatId, t.id, msgId);
        }

        case 'del': {
          await this.answer(cq.id);
          return this.editText(chatId, msgId, 'Удалить задание? Действие необратимо.', {
            reply_markup: { inline_keyboard: [[
              { text: '🗑 Да, удалить', callback_data: 'delyes:' + args[0] },
              { text: '‹ Отмена', callback_data: 'task:' + args[0] },
            ]] },
          });
        }

        case 'delyes': {
          const t = this.store.deleteTask(args[0], cq.from.id);
          await this.answer(cq.id, t ? 'Удалено' : 'Не найдено');
          return this.showTasks(chatId, 'active', 0, msgId);
        }

        /* --- заявки --- */
        case 'appr': {
          const res = this.store.approveRequest(args[0], cq.from.id);
          if (!res) return this.answer(cq.id, 'Заявка уже обработана', true);
          await this.answer(cq.id, 'Принято');
          await this.notifyAuthor(res.req, '✅ Ваша заявка «' + res.req.title + '» принята — задание на карте.');
          return this.showQueue(chatId, msgId);
        }

        case 'apprp': {
          this.flows.set(chatId, { action: 'apprPrice', id: args[0], step: 'value' });
          await this.answer(cq.id);
          return this.send(chatId, 'Пришлите цену в рублях для этой заявки (число).\n\n/cancel — отмена');
        }

        case 'rej': {
          const r = this.store.rejectRequest(args[0], cq.from.id);
          if (!r) return this.answer(cq.id, 'Заявка уже обработана', true);
          await this.answer(cq.id, 'Отклонено');
          await this.notifyAuthor(r, '⛔ Ваша заявка «' + r.title + '» отклонена.');
          return this.showQueue(chatId, msgId);
        }

        case 'rejbl': {
          const r = this.store.getRequest(args[0]);
          if (!r) return this.answer(cq.id, 'Заявка уже обработана', true);
          this.store.rejectRequest(r.id, cq.from.id, 'блокировка');
          if (r.authorId) this.store.block(r.authorId, r.author, 'спам в заявках', cq.from.id);
          await this.answer(cq.id, 'Отклонено и заблокировано');
          return this.showQueue(chatId, msgId);
        }

        /* --- цены --- */
        case 'price': {
          this.flows.set(chatId, { action: 'price', type: args[0], step: 'value' });
          await this.answer(cq.id);
          return this.send(chatId,
            'Новая цена для «' + TYPES[args[0]].n + '» в рублях (число).\n\n/cancel — отмена');
        }

        /* --- блеклист --- */
        case 'blockask': {
          this.flows.set(chatId, { action: 'block', step: 'value' });
          await this.answer(cq.id);
          return this.send(chatId,
            'Пришлите <code>id причина</code>.\nНапример: <code>123456789 спам</code>\n\n/cancel — отмена');
        }

        case 'unbl': {
          const e = this.store.unblock(args[0], cq.from.id);
          await this.answer(cq.id, e ? 'Разблокирован' : 'Не найден');
          return this.showBlacklist(chatId, msgId);
        }

        default:
          return this.answer(cq.id);
      }
    } catch (e) {
      this.log('админ-бот: callback «' + data + '» — ' + e.message);
      return this.answer(cq.id, 'Ошибка: ' + e.message, true);
    }
  }

  /* ---------------- пошаговые диалоги ---------------- */

  async startNewTask(chatId) {
    this.flows.set(chatId, { action: 'new', step: 'type', draft: {} });
    const rows = Object.keys(TYPES).map(k => ([{ text: TYPES[k].n, callback_data: 'ntype:' + k }]));
    return this.send(chatId, '<b>Новое задание</b>\n\nВыберите категорию:', {
      reply_markup: { inline_keyboard: rows },
    });
  }

  /**
   * Достаёт файл изображения из сообщения и возвращает публичный URL.
   * Telegram отдаёт несколько размеров — берём самый большой.
   */
  async extractPhoto(msg) {
    let fileId = null;
    if (Array.isArray(msg.photo) && msg.photo.length) {
      fileId = msg.photo[msg.photo.length - 1].file_id;
    } else if (msg.document && /^image\//.test(msg.document.mime_type || '')) {
      fileId = msg.document.file_id;
    }
    if (!fileId) return null;

    try {
      const r = await this.call('getFile', { file_id: fileId });
      if (!r || !r.ok || !r.result || !r.result.file_path) return null;
      // ссылка содержит токен, поэтому наружу отдаём через прокси сервера
      return { fileId, path: r.result.file_path, url: '/api/photo/' + encodeURIComponent(fileId) };
    } catch (e) {
      return null;
    }
  }

  async onFlowInput(msg, flow, textArg) {
    const chatId = msg.chat.id;
    const text = textArg !== undefined ? textArg : (msg.text || msg.caption || '').trim();
    const by = msg.from.id;

    /* --- создание задания --- */
    if (flow.action === 'new') {
      if (flow.step === 'type') {
        return this.send(chatId, 'Сначала выберите категорию кнопкой выше.');
      }
      if (flow.step === 'title') {
        if (text.length < 3) return this.send(chatId, 'Слишком коротко. Пришлите название ещё раз.');
        flow.draft.title = text.slice(0, 80);
        flow.step = 'desc';
        return this.send(chatId, 'Теперь <b>описание</b> (или «-», чтобы пропустить).');
      }
      if (flow.step === 'desc') {
        flow.draft.desc = text === '-' ? '' : text.slice(0, 500);
        flow.step = 'reward';
        const suggested = this.store.data.prices[flow.draft.type] ?? 0;
        return this.send(chatId,
          'Цена в рублях. По категории — <b>' + fmtR(suggested) + '</b>.\n' +
          'Пришлите число или «-», чтобы взять её.');
      }
      if (flow.step === 'reward') {
        let reward;
        if (text === '-') {
          reward = this.store.data.prices[flow.draft.type] ?? 0;
        } else {
          reward = this.parseMoney(text);
          if (reward === null) return this.send(chatId, 'Нужно число, например <code>500</code>. Ещё раз:');
        }
        flow.draft.reward = reward;
        flow.step = 'xy';
        return this.send(chatId,
          'Координаты, ссылка на Яндекс/Google Карты или «-» для центра района.\n' +
          'Например: <code>48.7894, 44.7783</code>');
      }
      if (flow.step === 'xy') {
        if (text !== '-') {
          const xy = this.parseXY(text);
          if (!xy) return this.send(chatId, 'Не разобрал координаты. Формат: <code>48.7894, 44.7783</code>');
          flow.draft.x = xy[0];
          flow.draft.y = xy[1];
        }
        const task = this.store.createTask(flow.draft, by);
        this.flows.delete(chatId);
        await this.send(chatId,
          '✅ Задание создано и опубликовано.\n\n' + this.taskLine(task),
          { reply_markup: { inline_keyboard: [
            [{ text: '✏️ Открыть', callback_data: 'task:' + task.id }],
            [{ text: '➕ Ещё одно', callback_data: 'new' }, { text: '‹ Панель', callback_data: 'panel' }],
          ] } });
        return;
      }
    }

    /* --- редактирование поля --- */
    if (flow.action === 'edit') {
      const t = this.store.getTask(flow.id);
      if (!t) { this.flows.delete(chatId); return this.send(chatId, 'Задание пропало.', this.kbBack()); }

      if (flow.field === 'reward') {
        const v = this.parseMoney(text);
        if (v === null) return this.send(chatId, 'Нужно число. Ещё раз:');
        this.store.updateTask(t.id, { reward: v }, by);
      } else if (flow.field === 'title') {
        if (text.length < 3) return this.send(chatId, 'Слишком коротко. Ещё раз:');
        this.store.updateTask(t.id, { title: text.slice(0, 80) }, by);
      } else if (flow.field === 'desc') {
        this.store.updateTask(t.id, { desc: text === '-' ? '' : text.slice(0, 500) }, by);
      } else if (flow.field === 'xy') {
        const xy = this.parseXY(text);
        if (!xy) return this.send(chatId, 'Формат: <code>48.7894, 44.7783</code>. Ещё раз:');
        this.store.updateTask(t.id, { x: xy[0], y: xy[1] }, by);
      }

      this.flows.delete(chatId);
      await this.send(chatId, '✅ Сохранено.');
      return this.showTask(chatId, t.id);
    }

    /* --- цена категории --- */
    if (flow.action === 'price') {
      const v = this.parseMoney(text);
      if (v === null) return this.send(chatId, 'Нужно число. Ещё раз:');
      this.store.setPrice(flow.type, v, by);
      this.flows.delete(chatId);
      await this.send(chatId, '✅ Цена «' + TYPES[flow.type].n + '» → ' + fmtR(v));
      return this.showPrices(chatId);
    }

    /* --- принять заявку со своей ценой --- */
    if (flow.action === 'apprPrice') {
      const v = this.parseMoney(text);
      if (v === null) return this.send(chatId, 'Нужно число. Ещё раз:');
      const res = this.store.approveRequest(flow.id, by, v);
      this.flows.delete(chatId);
      if (!res) return this.send(chatId, 'Заявка уже обработана.', this.kbBack());
      await this.notifyAuthor(res.req, '✅ Ваша заявка «' + res.req.title + '» принята — задание на карте.');
      await this.send(chatId, '✅ Принято с ценой ' + fmtR(v));
      return this.showQueue(chatId);
    }

    /* --- возврат работы на доработку --- */
    if (flow.action === 'rework') {
      const reason = text === '-' ? '' : text;
      const t = this.store.reworkTask(flow.id, by, reason);
      this.flows.delete(chatId);
      if (!t) return this.send(chatId, 'Задание пропало.', this.kbBack());
      if (t.takenById) {
        this.send(t.takenById,
          '↩️ Работа «' + esc(t.title) + '» возвращена на доработку.' +
          (reason ? '\n\n' + esc(reason) : '')).catch(() => {});
      }
      await this.send(chatId, '↩️ Возвращено исполнителю.');
      return this.showReports(chatId);
    }

    /* --- публикация в ленту (с картинкой) --- */
    if (flow.action === 'post') {
      const photo = await this.extractPhoto(msg);
      if (!text && !photo) {
        return this.send(chatId, 'Пришлите текст или фото с подписью.');
      }
      const post = this.store.addPost({
        text, photo: photo ? photo.url : null, photoId: photo ? photo.fileId : null,
        author: 'район', authorId: by,
      }, by);
      this.flows.delete(chatId);
      return this.send(chatId,
        '📣 Опубликовано в ленте' + (post.photo ? ' с фото' : '') + '.\n\n' +
        (post.text ? esc(post.text.slice(0, 200)) : ''),
        { reply_markup: { inline_keyboard: [
          [{ text: '📣 Ещё пост', callback_data: 'post' }, { text: '‹ Панель', callback_data: 'panel' }],
        ] } });
    }

    /* --- фото к заданию --- */
    if (flow.action === 'photo') {
      const photo = await this.extractPhoto(msg);
      if (!photo) return this.send(chatId, 'Пришлите изображение (фото или файл-картинку).');
      this.store.updateTask(flow.id, { photo: photo.url }, by);
      this.flows.delete(chatId);
      await this.send(chatId, '📷 Фото добавлено к заданию.');
      return this.showTask(chatId, flow.id);
    }

    /* --- блокировка по id --- */
    if (flow.action === 'block') {
      const m = text.match(/^(\S+)\s*(.*)$/);
      if (!m) return this.send(chatId, 'Формат: <code>id причина</code>. Ещё раз:');
      const entry = this.store.block(m[1], '', m[2], by);
      this.flows.delete(chatId);
      await this.send(chatId, entry
        ? '🚫 Заблокирован <code>' + esc(m[1]) + '</code>' +
          (entry.removedRequests ? '\nСнято заявок: ' + entry.removedRequests : '')
        : 'Этот id уже в блеклисте.');
      return this.showBlacklist(chatId);
    }
  }

  /* ---------------- утилиты ---------------- */

  parseMoney(text) {
    const v = parseInt(String(text).replace(/[^\d]/g, ''), 10);
    if (!Number.isFinite(v) || v < 0 || v > 1000000) return null;
    return v;
  }

  /**
   * Разбирает пару координат из текста.
   * Принимает «48.7894, 44.7783», «48.7894 44.7783» и русскую раскладку
   * с десятичной запятой: «48,7894 44,7783» — раньше такой ввод отвергался.
   * Также понимает ссылки Яндекс/Google Карт с координатами.
   */
  parseXY(text) {
    let str = String(text).trim();

    // ссылка на карты: ll=44.77,48.78 (Яндекс — долгота первая) или @48.78,44.77 (Google)
    const ll = str.match(/[?&]ll=(-?\d+\.\d+)[,%2C]+(-?\d+\.\d+)/i);
    if (ll) {
      const lng = parseFloat(ll[1]), lat = parseFloat(ll[2]);
      if (Math.abs(lat) <= 90 && Math.abs(lng) <= 180) return [lat, lng];
    }
    const at = str.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
    if (at) str = at[1] + ' ' + at[2];

    // достаём два числа; десятичный разделитель — точка или запятая
    const nums = str.match(/-?\d+(?:[.,]\d+)?/g);
    if (!nums || nums.length < 2) return null;
    const x = parseFloat(nums[0].replace(',', '.'));
    const y = parseFloat(nums[1].replace(',', '.'));
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    if (Math.abs(x) > 90 || Math.abs(y) > 180) return null;
    return [x, y];
  }

  /** Сообщить жителю о решении по его заявке (если он писал боту). */
  async notifyAuthor(req, text) {
    if (!req || !req.authorId) return;
    try { await this.send(req.authorId, text); } catch (e) { /* мог не начать диалог с ботом */ }
  }

  /** Уведомление админу — вызывается из http-wrapper при новой заявке. */
  async notifyAdmin(text, extra) {
    if (!this.adminId) return;
    try { await this.send(this.adminId, text, extra); } catch (e) {}
  }

  /** Кнопки под уведомлением о новой заявке. */
  requestButtons(id) {
    return { reply_markup: { inline_keyboard: [
      [{ text: '✅ Принять', callback_data: 'appr:' + id },
       { text: '💰 Цена', callback_data: 'apprp:' + id }],
      [{ text: '✕ Отклонить', callback_data: 'rej:' + id },
       { text: '🚫 И заблокировать', callback_data: 'rejbl:' + id }],
    ] } };
  }
}

module.exports = { AdminBot };
