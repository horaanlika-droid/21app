/**
 * Конфигурация приложения.
 *
 * Все значения можно переопределить через .env (префикс VITE_), чтобы форк
 * не требовал правок в коде: см. .env.example.
 */

/** Адрес фонда района — получатель донатов. */
export const FUND_ADDRESS: string =
  import.meta.env.VITE_FUND_ADDRESS ?? 'UQC1xYc4aPgMaHjER3xZPRKz4LfYgDyNSBSxykZmB2YbsWLW';

/**
 * URL манифеста TON Connect.
 *
 * Кошельки скачивают манифест сами, поэтому он обязан быть публичным и лежать
 * на том же домене, что и приложение. По умолчанию берём его рядом с index.html —
 * так путь корректен и в корне, и на подпути (GitHub Pages).
 */
export const MANIFEST_URL: string =
  import.meta.env.VITE_MANIFEST_URL ??
  new URL('tonconnect-manifest.json', document.baseURI).toString();

/**
 * База TON API.
 *
 * По умолчанию бьём в tonapi.io напрямую из браузера — CORS там разрешён,
 * и это работает везде, включая GitHub Pages без своего бэкенда.
 *
 * Если нужен ключ (выше лимиты) — не кладите его в бандл: поднимите прокси и
 * укажите VITE_TONAPI_BASE=/tonapi, тогда запросы пойдут через сервер
 * (dev-прокси уже настроен в vite.config.ts и подставляет TONAPI_KEY).
 */
export const TONAPI_BASE: string =
  import.meta.env.VITE_TONAPI_BASE ?? 'https://tonapi.io';

/** Ключ tonapi. ВНИМАНИЕ: в бандле он виден всем — для продакшена используйте прокси. */
export const TONAPI_KEY: string | undefined = import.meta.env.VITE_TONAPI_KEY;

/** Интервал автообновления баланса, мс (по ТЗ — 5 секунд). */
export const REFRESH_INTERVAL_MS = 5000;

/** Сколько последних донатов показываем. */
export const HISTORY_LIMIT = 10;

/** Пресеты сумм для доната, TON. */
export const PRESET_AMOUNTS = [0.5, 1, 2, 5] as const;

/** Минимальная сумма доната, TON (ниже — не покроется комиссия сети). */
export const MIN_AMOUNT = 0.01;

/** Максимальная сумма доната, TON — защита от опечатки вроде «1000» вместо «1». */
export const MAX_AMOUNT = 1000;

/** Лимит длины комментария. Комментарий уходит в блокчейн как текстовый payload. */
export const MAX_COMMENT_LENGTH = 120;

/** Время жизни запроса на транзакцию, сек. */
export const TX_VALID_SECONDS = 300;

/** Ссылка возврата в мини-апп после подтверждения в кошельке. */
export const TWA_RETURN_URL: `${string}://${string}` =
  (import.meta.env.VITE_TWA_RETURN_URL as `${string}://${string}`) ??
  'https://t.me/twentyonemovementbot/app';
