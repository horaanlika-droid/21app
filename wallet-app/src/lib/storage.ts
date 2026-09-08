/**
 * Кеш адреса кошелька в localStorage.
 *
 * TON Connect сам хранит сессию, но восстановление занимает несколько сотен
 * миллисекунд. Кешированный адрес позволяет сразу показать баланс и не мигать
 * состоянием «не подключён» при каждом открытии мини-аппа.
 *
 * Все обращения обёрнуты в try/catch: в приватном режиме и внутри некоторых
 * WebView доступ к localStorage бросает исключение.
 */

import { isValidAddress } from './format';

const KEY = 'os21_wallet_address';

/** Прочитать сохранённый адрес. Возвращает null, если его нет или он битый. */
export function cachedAddress(): string | null {
  try {
    const value = localStorage.getItem(KEY);
    if (!value) return null;
    // не доверяем содержимому хранилища — оно могло устареть или быть изменено
    return isValidAddress(value) ? value : null;
  } catch {
    return null;
  }
}

/** Сохранить адрес; null — очистить. */
export function cacheAddress(address: string | null): void {
  try {
    if (address) localStorage.setItem(KEY, address);
    else localStorage.removeItem(KEY);
  } catch {
    /* хранилище недоступно — не критично, работаем без кеша */
  }
}
