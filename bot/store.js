'use strict';
/* ============================================================
   21 — общее хранилище бота
   ------------------------------------------------------------
   Один JSON-файл рядом с сервером. Раньше всё состояние жило в
   localStorage браузера, поэтому созданное админом видел только он сам.
   Здесь данные общие: бот пишет, приложение читает через /api/*.

   Запись атомарная (tmp + rename) и с дебаунсом: при частых правках
   не тратим диск и не рискуем получить обрезанный файл, если процесс
   упадёт в момент сохранения.
   ============================================================ */

const fs = require('fs');
const path = require('path');

/** Базовые цены ордеров: категория → ₽. Совпадает с ORDER_PRICE в index.html. */
const DEFAULT_PRICES = { clean: 200, help: 300, fix: 500, swap: 0, class: 0 };

/** Категории заданий (ключ → название и иконка приложения). */
const TYPES = {
  fix:   { n: 'починить',     icon: 'qt_fix' },
  help:  { n: 'помочь',       icon: 'qt_help' },
  swap:  { n: 'обменять',     icon: 'qt_swap' },
  class: { n: 'мастер-класс', icon: 'qt_class' },
  clean: { n: 'уборка',       icon: 'qt_clean' },
};

/** Центр района — координаты по умолчанию для новых заданий. */
const CENTER = [48.7894, 44.7783];

const DEFAULT_DATA = () => ({
  v: 1,
  /** Опубликованные задания — их видят все в приложении. */
  tasks: [],
  /** Заявки от жителей, ждут решения админа. */
  requests: [],
  /** Заблокированные: не могут присылать заявки и брать задания. */
  blacklist: [],
  /** Цены по категориям. */
  prices: { ...DEFAULT_PRICES },
  /** Лента района: объявления админа, можно с картинкой. */
  feed: [],
  /** Журнал действий админа — кто что сделал. */
  log: [],
  /** offset для getUpdates: чтобы после перезапуска не читать старое заново. */
  offset: 0,
  /** Последние чаты, писавшие боту (для кнопки «найти чат» в приложении). */
  recentChats: [],
});

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

class Store {
  /**
   * @param {string} file путь к JSON-файлу
   * @param {{saveDelay?: number}} [opts]
   */
  constructor(file, opts = {}) {
    this.file = file;
    this.saveDelay = opts.saveDelay ?? 300;
    this.data = DEFAULT_DATA();
    this._timer = null;
    this._writing = false;
    this._again = false;
    this.load();
  }

  /* ---------------- загрузка / сохранение ---------------- */

  load() {
    try {
      const raw = fs.readFileSync(this.file, 'utf8');
      const parsed = JSON.parse(raw);
      // сливаем с дефолтом: файл от старой версии может не иметь новых полей
      this.data = Object.assign(DEFAULT_DATA(), parsed);
      this.data.prices = Object.assign({ ...DEFAULT_PRICES }, parsed.prices || {});
    } catch (e) {
      if (e.code !== 'ENOENT') {
        // битый файл не затираем молча — отводим в сторону, чтобы можно было разобрать
        try {
          fs.renameSync(this.file, this.file + '.broken-' + Date.now());
          console.error('21 ✕ Хранилище повреждено, файл сохранён как *.broken-*');
        } catch (_) { /* каталога может не быть */ }
      }
      this.data = DEFAULT_DATA();
    }
  }

  /** Отложенное сохранение — склеивает серию правок в одну запись. */
  save() {
    if (this._timer) return;
    this._timer = setTimeout(() => {
      this._timer = null;
      this.flush();
    }, this.saveDelay);
    if (this._timer.unref) this._timer.unref();
  }

  /** Немедленная запись на диск (atomic). */
  flush() {
    if (this._writing) { this._again = true; return; }
    this._writing = true;
    try {
      const dir = path.dirname(this.file);
      fs.mkdirSync(dir, { recursive: true });
      const tmp = this.file + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2));
      fs.renameSync(tmp, this.file); // rename атомарен в пределах ФС
    } catch (e) {
      console.error('21 ✕ Не удалось сохранить хранилище:', e.message);
    } finally {
      this._writing = false;
      if (this._again) { this._again = false; this.flush(); }
    }
  }

  /* ---------------- журнал ---------------- */

  /** Пишет действие в журнал (последние 200 записей). */
  addLog(text, by) {
    this.data.log.unshift({ id: uid(), t: Date.now(), text: String(text).slice(0, 300), by: by || null });
    if (this.data.log.length > 200) this.data.log.length = 200;
    this.save();
  }

  /* ---------------- задания ---------------- */

  listTasks(filter) {
    const all = this.data.tasks;
    if (!filter || filter === 'all') return all;
    return all.filter(t => t.status === filter);
  }

  getTask(id) {
    return this.data.tasks.find(t => t.id === id) || null;
  }

  /** Создать задание. Цена по умолчанию — из таблицы цен категории. */
  createTask(input, by) {
    const type = TYPES[input.type] ? input.type : 'fix';
    const task = {
      id: uid(),
      type,
      title: String(input.title || '').slice(0, 80),
      desc: String(input.desc || '').slice(0, 500),
      x: Number.isFinite(input.x) ? input.x : CENTER[0],
      y: Number.isFinite(input.y) ? input.y : CENTER[1],
      xp: Number.isFinite(input.xp) ? input.xp : 40,
      karma: Number.isFinite(input.karma) ? input.karma : 6,
      reward: Number.isFinite(input.reward) ? input.reward : (this.data.prices[type] ?? 0),
      budget: Number.isFinite(input.budget) ? input.budget : 0,
      status: 'active',
      author: input.author || 'район',
      authorId: input.authorId || null,
      /* исполнитель и отчёт */
      takenBy: null,      // имя взявшего — показывается в его статусе
      takenById: null,    // telegram-id, чтобы уведомить о решении
      takenAt: null,
      report: '',         // текст отчёта о выполнении
      reportPhoto: null,
      reportAt: null,
      payTo: '',          // куда платить (TON-адрес исполнителя)
      photo: input.photo || null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    this.data.tasks.unshift(task);
    this.save();
    this.addLog('создано задание «' + task.title + '»', by);
    return task;
  }

  /** Точечное обновление полей задания. */
  updateTask(id, patch, by) {
    const task = this.getTask(id);
    if (!task) return null;
    const allowed = [
      'title', 'desc', 'reward', 'xp', 'karma', 'x', 'y', 'status', 'type',
      'takenBy', 'takenById', 'takenAt', 'report', 'reportPhoto', 'reportAt', 'payTo',
    ];
    for (const key of allowed) {
      if (patch[key] !== undefined) task[key] = patch[key];
    }
    task.updatedAt = Date.now();
    this.save();
    if (by !== false) this.addLog('изменено задание «' + task.title + '»', by);
    return task;
  }

  deleteTask(id, by) {
    const task = this.getTask(id);
    if (!task) return null;
    this.data.tasks = this.data.tasks.filter(t => t.id !== id);
    this.save();
    this.addLog('удалено задание «' + task.title + '»', by);
    return task;
  }

  /* ---------------- жизненный цикл задания ----------------
     active → doing (взял) → verify (отчитался) → done (принято админом).
     Админ может вернуть на доработку: verify → doing. */

  /** Житель берёт задание. Возвращает {error} если занято/недоступно. */
  takeTask(id, user) {
    const task = this.getTask(id);
    if (!task) return { error: 'not-found' };
    if (task.status === 'hidden') return { error: 'hidden' };
    if (task.status === 'done') return { error: 'done' };
    // уже взято другим — второй исполнитель не должен перехватывать
    if (task.takenById && String(task.takenById) !== String(user.id)) return { error: 'taken' };
    if (task.status === 'verify') return { error: 'on-review' };

    task.takenBy = String(user.name || 'сосед').slice(0, 40);
    task.takenById = user.id != null ? String(user.id) : null;
    task.takenAt = Date.now();
    task.status = 'doing';
    task.updatedAt = Date.now();
    this.save();
    return { task };
  }

  /** Отказ от задания — возвращаем в общий доступ. */
  releaseTask(id, user) {
    const task = this.getTask(id);
    if (!task) return { error: 'not-found' };
    if (task.takenById && String(task.takenById) !== String(user.id)) return { error: 'not-yours' };
    task.takenBy = null;
    task.takenById = null;
    task.takenAt = null;
    task.status = 'active';
    task.report = '';
    task.reportPhoto = null;
    task.reportAt = null;
    task.updatedAt = Date.now();
    this.save();
    return { task };
  }

  /** Отчёт о выполнении: текст + фото. Уходит админу на проверку. */
  reportTask(id, user, report) {
    const task = this.getTask(id);
    if (!task) return { error: 'not-found' };
    if (task.takenById && String(task.takenById) !== String(user.id)) return { error: 'not-yours' };
    if (task.status === 'done') return { error: 'done' };

    task.report = String(report.text || '').slice(0, 600);
    task.reportPhoto = report.photo || null;
    task.reportAt = Date.now();
    task.payTo = String(report.payTo || '').slice(0, 80);
    task.status = 'verify';
    // если брал не через приложение — фиксируем исполнителя по отчёту
    if (!task.takenBy) {
      task.takenBy = String(user.name || 'сосед').slice(0, 40);
      task.takenById = user.id != null ? String(user.id) : null;
    }
    task.updatedAt = Date.now();
    this.save();
    return { task };
  }

  /** Админ принимает работу. */
  acceptTask(id, by) {
    const task = this.getTask(id);
    if (!task) return null;
    task.status = 'done';
    task.updatedAt = Date.now();
    this.save();
    this.addLog('принята работа «' + task.title + '»' + (task.takenBy ? ' от ' + task.takenBy : ''), by);
    return task;
  }

  /** Админ возвращает на доработку — исполнитель остаётся тот же. */
  reworkTask(id, by, reason) {
    const task = this.getTask(id);
    if (!task) return null;
    task.status = 'doing';
    task.reworkReason = String(reason || '').slice(0, 300);
    task.updatedAt = Date.now();
    this.save();
    this.addLog('возврат на доработку «' + task.title + '»', by);
    return task;
  }

  /** Задания, ждущие проверки админом. */
  listReports() {
    return this.data.tasks.filter(t => t.status === 'verify');
  }

  /** Задания конкретного жителя — для его статуса в приложении. */
  listMine(userId) {
    if (userId == null || userId === '') return [];
    const key = String(userId);
    return this.data.tasks.filter(t => String(t.takenById) === key);
  }

  /* ---------------- заявки ---------------- */

  listRequests() {
    return this.data.requests;
  }

  getRequest(id) {
    return this.data.requests.find(r => r.id === id) || null;
  }

  /** Заявка от жителя из приложения. */
  addRequest(input) {
    const type = TYPES[input.type] ? input.type : 'fix';
    const req = {
      id: uid(),
      type,
      title: String(input.title || '').slice(0, 80),
      desc: String(input.desc || '').slice(0, 500),
      x: Number.isFinite(input.x) ? input.x : CENTER[0],
      y: Number.isFinite(input.y) ? input.y : CENTER[1],
      cost: Number.isFinite(input.cost) ? input.cost : (this.data.prices[type] ?? 0),
      author: String(input.author || 'сосед').slice(0, 40),
      authorId: input.authorId || null,
      photo: input.photo || null,
      ts: Date.now(),
      status: 'mod',
    };
    this.data.requests.unshift(req);
    this.save();
    return req;
  }

  /** Принять заявку → появляется задание на карте. */
  approveRequest(id, by, priceOverride) {
    const req = this.getRequest(id);
    if (!req) return null;
    this.data.requests = this.data.requests.filter(r => r.id !== id);
    const task = this.createTask({
      type: req.type, title: req.title, desc: req.desc || req.title,
      x: req.x, y: req.y,
      reward: Number.isFinite(priceOverride) ? priceOverride : req.cost,
      author: req.author, authorId: req.authorId, photo: req.photo,
    }, by);
    this.addLog('принята заявка «' + req.title + '»', by);
    return { req, task };
  }

  rejectRequest(id, by, reason) {
    const req = this.getRequest(id);
    if (!req) return null;
    this.data.requests = this.data.requests.filter(r => r.id !== id);
    this.save();
    this.addLog('отклонена заявка «' + req.title + '»' + (reason ? ' (' + reason + ')' : ''), by);
    return req;
  }

  /* ---------------- лента ---------------- */

  listFeed() {
    return this.data.feed;
  }

  /** Пост в ленту района. Картинка необязательна. */
  addPost(input, by) {
    const post = {
      id: uid(),
      text: String(input.text || '').slice(0, 1000),
      photo: input.photo || null,
      photoId: input.photoId || null,
      author: String(input.author || 'район').slice(0, 40),
      authorId: input.authorId != null ? String(input.authorId) : null,
      ts: Date.now(),
    };
    this.data.feed.unshift(post);
    if (this.data.feed.length > 100) this.data.feed.length = 100;
    this.save();
    this.addLog('пост в ленту' + (post.photo ? ' с фото' : '') + ': ' + post.text.slice(0, 40), by);
    return post;
  }

  deletePost(id, by) {
    const post = this.data.feed.find(p => p.id === id);
    if (!post) return null;
    this.data.feed = this.data.feed.filter(p => p.id !== id);
    this.save();
    this.addLog('удалён пост из ленты', by);
    return post;
  }

  /* ---------------- блеклист ---------------- */

  listBlacklist() {
    return this.data.blacklist;
  }

  isBlocked(userId) {
    if (userId == null || userId === '') return false;
    const key = String(userId);
    return this.data.blacklist.some(b => String(b.id) === key);
  }

  /** Добавить в блеклист. Заявки заблокированного снимаются с модерации. */
  block(userId, name, reason, by) {
    const key = String(userId);
    if (this.isBlocked(key)) return null;
    const entry = { id: key, name: String(name || '').slice(0, 60), reason: String(reason || '').slice(0, 200), at: Date.now(), by: by || null };
    this.data.blacklist.unshift(entry);
    // чистим его заявки — иначе останутся висеть в модерации
    const before = this.data.requests.length;
    this.data.requests = this.data.requests.filter(r => String(r.authorId) !== key);
    entry.removedRequests = before - this.data.requests.length;
    this.save();
    this.addLog('заблокирован ' + (entry.name || key), by);
    return entry;
  }

  unblock(userId, by) {
    const key = String(userId);
    const entry = this.data.blacklist.find(b => String(b.id) === key);
    if (!entry) return null;
    this.data.blacklist = this.data.blacklist.filter(b => String(b.id) !== key);
    this.save();
    this.addLog('разблокирован ' + (entry.name || key), by);
    return entry;
  }

  /* ---------------- цены ---------------- */

  setPrice(type, value, by) {
    if (!TYPES[type]) return null;
    this.data.prices[type] = Math.max(0, Math.round(value));
    this.save();
    this.addLog('цена «' + TYPES[type].n + '» → ' + this.data.prices[type] + ' ₽', by);
    return this.data.prices[type];
  }

  /* ---------------- прочее ---------------- */

  setOffset(offset) {
    this.data.offset = offset;
    this.save();
  }

  /** Запоминаем чаты, писавшие боту, — для кнопки «найти чат» в приложении. */
  rememberChat(chat) {
    if (!chat || chat.id == null) return;
    const list = this.data.recentChats.filter(c => c.id !== chat.id);
    list.unshift({
      id: chat.id,
      type: chat.type || '',
      title: chat.title || [chat.first_name, chat.last_name].filter(Boolean).join(' ') || '',
      username: chat.username || '',
      at: Date.now(),
    });
    this.data.recentChats = list.slice(0, 10);
    this.save();
  }

  stats() {
    const tasks = this.data.tasks;
    return {
      tasksTotal: tasks.length,
      tasksActive: tasks.filter(t => t.status === 'active').length,
      tasksDoing: tasks.filter(t => t.status === 'doing').length,
      tasksDone: tasks.filter(t => t.status === 'done').length,
      tasksVerify: tasks.filter(t => t.status === 'verify').length,
      requests: this.data.requests.length,
      blacklist: this.data.blacklist.length,
      rewardActive: tasks.filter(t => t.status === 'active').reduce((s, t) => s + (t.reward || 0), 0),
    };
  }
}

module.exports = { Store, TYPES, DEFAULT_PRICES, CENTER, uid };
