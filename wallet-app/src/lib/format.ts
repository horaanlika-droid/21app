/** Форматирование адресов, сумм и времени. Без внешних зависимостей. */

const NANO_IN_TON = 1_000_000_000n;

/**
 * Нанотоны → строка в TON.
 * Работает на bigint, чтобы не ловить потерю точности float на больших суммах.
 *
 * @param nano   сумма в нанотонах
 * @param digits знаков после запятой (хвостовые нули отбрасываются)
 */
export function formatTon(nano: bigint | string, digits = 2): string {
  const value = typeof nano === 'string' ? BigInt(nano || '0') : nano;
  const negative = value < 0n;
  const abs = negative ? -value : value;

  const whole = abs / NANO_IN_TON;
  const frac = abs % NANO_IN_TON;

  // дробную часть дополняем нулями до 9 знаков, затем режем до digits
  const fracStr = frac.toString().padStart(9, '0').slice(0, Math.max(0, Math.min(9, digits)));
  const fracTrimmed = fracStr.replace(/0+$/, '');

  const wholeStr = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  const sign = negative ? '-' : '';

  return fracTrimmed ? `${sign}${wholeStr}.${fracTrimmed}` : `${sign}${wholeStr}`;
}

/** TON (число или строка из инпута) → нанотоны. Бросает при некорректном вводе. */
export function tonToNano(amount: number | string): bigint {
  const raw = String(amount).trim().replace(',', '.');
  if (!/^\d*\.?\d*$/.test(raw) || raw === '' || raw === '.') {
    throw new Error('Некорректная сумма');
  }

  const [whole = '0', frac = ''] = raw.split('.');
  // 9 знаков — предел точности TON; лишнее отбрасываем, а не округляем
  const fracPadded = frac.padEnd(9, '0').slice(0, 9);

  return BigInt(whole || '0') * NANO_IN_TON + BigInt(fracPadded || '0');
}

/** Короткий адрес: UQC1xY…bsWLW */
export function shortAddress(address: string, head = 6, tail = 5): string {
  if (!address) return '';
  return address.length > head + tail + 1
    ? `${address.slice(0, head)}…${address.slice(-tail)}`
    : address;
}

/** Unix-секунды → «сегодня, 14:03» / «12 мая, 14:03». */
export function formatDate(utime: number): string {
  const date = new Date(utime * 1000);
  const now = new Date();

  const time = date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  const sameDay =
    date.getDate() === now.getDate() &&
    date.getMonth() === now.getMonth() &&
    date.getFullYear() === now.getFullYear();

  if (sameDay) return `сегодня, ${time}`;

  const day = date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
  return `${day}, ${time}`;
}

/**
 * Проверка адреса TON.
 * Принимает user-friendly (UQ…/EQ…/0Q…/kQ…, 48 символов base64url) и raw (`0:hex`).
 */
export function isValidAddress(address: string): boolean {
  const value = address.trim();
  if (/^-?\d+:[0-9a-fA-F]{64}$/.test(value)) return true;
  return /^[A-Za-z0-9_-]{48}$/.test(value);
}
