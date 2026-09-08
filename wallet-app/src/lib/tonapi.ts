/**
 * Тонкий клиент TON API (tonapi.io).
 *
 * Берём только два эндпоинта:
 *   GET /v2/accounts/{address}                 — баланс
 *   GET /v2/blockchain/accounts/{a}/transactions — транзакции для истории/статистики
 *
 * Все запросы отменяемы через AbortSignal: интервальный опрос не должен
 * копить «висящие» ответы, которые перезапишут свежие данные.
 */

import { TONAPI_BASE } from './config';
import type { Donation, DonationStats } from './types';

/** Ошибка API с кодом ответа — UI по нему различает 429 и остальное. */
export class TonApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'TonApiError';
  }
}

async function request<T>(path: string, signal?: AbortSignal): Promise<T> {
  // Ключа здесь нет и быть не должно: его подставляет релей бот-хоста.
  const headers: Record<string, string> = { Accept: 'application/json' };

  let response: Response;
  try {
    response = await fetch(`${TONAPI_BASE}${path}`, { headers, signal });
  } catch (error) {
    // сеть недоступна / CORS / прокси лёг — отмену пробрасываем как есть
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new TonApiError('Нет связи с TON API', 0);
  }

  if (!response.ok) {
    const text = response.status === 429
      ? 'Слишком много запросов к TON API'
      : `TON API ответил ${response.status}`;
    throw new TonApiError(text, response.status);
  }

  return (await response.json()) as T;
}

/* ------------------------------ баланс ------------------------------ */

interface AccountResponse {
  balance: number | string;
  status?: string;
}

/** Баланс аккаунта в нанотонах. */
export async function fetchBalance(address: string, signal?: AbortSignal): Promise<bigint> {
  const data = await request<AccountResponse>(
    `/v2/accounts/${encodeURIComponent(address)}`,
    signal,
  );
  // tonapi отдаёт число; при больших значениях безопаснее через строку
  return BigInt(Math.trunc(Number(data.balance ?? 0)));
}

/* --------------------------- транзакции --------------------------- */

interface RawMessage {
  source?: { address?: string };
  destination?: { address?: string };
  value?: number | string;
  decoded_body?: { text?: string } | null;
  message_content?: { decoded?: { comment?: string } } | null;
  comment?: string | null;
}

interface RawTransaction {
  hash: string;
  utime: number;
  success?: boolean;
  in_msg?: RawMessage | null;
}

interface TransactionsResponse {
  transactions?: RawTransaction[];
}

/** Достаёт текст комментария из разных форм ответа tonapi. */
function extractComment(msg: RawMessage): string {
  return (
    msg.decoded_body?.text ??
    msg.message_content?.decoded?.comment ??
    msg.comment ??
    ''
  ).trim();
}

/**
 * Входящие переводы на адрес фонда.
 *
 * Берём только транзакции с in_msg, где есть отправитель и ненулевая сумма:
 * это отсекает служебные сообщения и исходящие операции.
 *
 * @param limit сколько транзакций запросить (для статистики берём с запасом)
 */
export async function fetchIncomingDonations(
  address: string,
  limit = 100,
  signal?: AbortSignal,
): Promise<Donation[]> {
  const data = await request<TransactionsResponse>(
    `/v2/blockchain/accounts/${encodeURIComponent(address)}/transactions?limit=${limit}`,
    signal,
  );

  const list: Donation[] = [];

  for (const tx of data.transactions ?? []) {
    const msg = tx.in_msg;
    if (!msg) continue;

    const from = msg.source?.address ?? '';
    const amountNano = BigInt(Math.trunc(Number(msg.value ?? 0)));

    // без отправителя — это external-сообщение (не донат), нулевые тоже пропускаем
    if (!from || amountNano <= 0n) continue;
    if (tx.success === false) continue;

    list.push({
      hash: tx.hash,
      from,
      amountNano: amountNano.toString(),
      comment: extractComment(msg),
      utime: tx.utime,
    });
  }

  return list;
}

/** Считает сумму донатов и число уникальных отправителей. */
export function calcStats(donations: Donation[]): DonationStats {
  let totalNano = 0n;
  const donors = new Set<string>();

  for (const d of donations) {
    totalNano += BigInt(d.amountNano);
    donors.add(d.from);
  }

  return { totalNano, donorsCount: donors.size, txCount: donations.length };
}
