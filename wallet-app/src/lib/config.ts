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
 * По умолчанию — релей бот-хоста `/api/tonapi` (реализован в http-wrapper.js).
 * Ключ `TONAPI_KEY` живёт в env бот-хоста и в клиентский бандл НЕ попадает:
 * сервер сам подставляет заголовок Authorization.
 *
 * Если приложение и бот-хост на разных доменах (например, GitHub Pages +
 * отдельный хост) — укажите полный URL релея:
 *   VITE_TONAPI_BASE=https://ваш-бот-хост/api/tonapi
 *
 * Значение 'https://tonapi.io' тоже допустимо — это прямые вызовы из браузера
 * без ключа, на бесплатном лимите.
 */
export const TONAPI_BASE: string =
  import.meta.env.VITE_TONAPI_BASE ?? '/api/tonapi';

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
