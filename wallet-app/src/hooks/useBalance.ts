import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchBalance, TonApiError } from '../lib/tonapi';
import { REFRESH_INTERVAL_MS } from '../lib/config';
import type { LoadState } from '../lib/types';

interface UseBalanceResult {
  /** Баланс в нанотонах; null — ещё не загружен. */
  balance: bigint | null;
  state: LoadState;
  error: string | null;
  /** Принудительно обновить (например, сразу после доната). */
  refresh: () => void;
}

/**
 * Баланс адреса с автообновлением.
 *
 * Особенности:
 *  - опрос на паузе, когда вкладка скрыта (document.hidden) — не жжём лимит API;
 *  - каждый новый запрос отменяет предыдущий, поэтому «медленный» ответ
 *    не перезапишет более свежий;
 *  - при ошибке прошлое значение остаётся на экране (не мигаем пустотой).
 *
 * @param address адрес для опроса; null — опрос выключен
 * @param intervalMs период опроса
 */
export function useBalance(
  address: string | null,
  intervalMs: number = REFRESH_INTERVAL_MS,
): UseBalanceResult {
  const [balance, setBalance] = useState<bigint | null>(null);
  const [state, setState] = useState<LoadState>('idle');
  const [error, setError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      abortRef.current?.abort();
    };
  }, []);

  const load = useCallback(async () => {
    if (!address) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    // «loading» показываем только на первой загрузке, иначе UI мигает каждые 5 сек
    setState((prev) => (prev === 'ready' ? prev : 'loading'));

    try {
      const value = await fetchBalance(address, controller.signal);
      if (!mountedRef.current || controller.signal.aborted) return;
      setBalance(value);
      setState('ready');
      setError(null);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      if (!mountedRef.current) return;
      setError(err instanceof TonApiError ? err.message : 'Не удалось получить баланс');
      setState((prev) => (prev === 'ready' ? prev : 'error'));
    }
  }, [address]);

  useEffect(() => {
    if (!address) {
      setBalance(null);
      setState('idle');
      setError(null);
      return;
    }

    void load();

    const tick = () => {
      if (typeof document !== 'undefined' && document.hidden) return;
      void load();
    };

    const timer = window.setInterval(tick, intervalMs);

    // вернулись во вкладку — обновляем сразу, не дожидаясь следующего тика
    const onVisible = () => {
      if (!document.hidden) void load();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [address, intervalMs, load]);

  return { balance, state, error, refresh: load };
}
