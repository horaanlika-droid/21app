import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { calcStats, fetchIncomingDonations, TonApiError } from '../lib/tonapi';
import { HISTORY_LIMIT, REFRESH_INTERVAL_MS } from '../lib/config';
import type { Donation, DonationStats, LoadState } from '../lib/types';

interface UseDonationsResult {
  /** Последние N донатов (N = HISTORY_LIMIT). */
  donations: Donation[];
  /** Статистика считается по всей выборке, а не только по показанным. */
  stats: DonationStats;
  state: LoadState;
  error: string | null;
  refresh: () => void;
}

/**
 * История донатов и статистика по адресу фонда.
 *
 * Тянем с запасом (fetchLimit), чтобы «всего донатов / донатеров» считались
 * не по десяти видимым строкам, а по последним сотне переводов.
 */
export function useDonations(
  address: string | null,
  intervalMs: number = REFRESH_INTERVAL_MS,
  fetchLimit = 100,
): UseDonationsResult {
  const [all, setAll] = useState<Donation[]>([]);
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

    setState((prev) => (prev === 'ready' ? prev : 'loading'));

    try {
      const list = await fetchIncomingDonations(address, fetchLimit, controller.signal);
      if (!mountedRef.current || controller.signal.aborted) return;
      setAll(list);
      setState('ready');
      setError(null);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      if (!mountedRef.current) return;
      setError(err instanceof TonApiError ? err.message : 'Не удалось загрузить историю');
      setState((prev) => (prev === 'ready' ? prev : 'error'));
    }
  }, [address, fetchLimit]);

  useEffect(() => {
    if (!address) return;

    void load();

    const tick = () => {
      if (typeof document !== 'undefined' && document.hidden) return;
      void load();
    };
    const timer = window.setInterval(tick, intervalMs);

    return () => window.clearInterval(timer);
  }, [address, intervalMs, load]);

  const donations = useMemo(() => all.slice(0, HISTORY_LIMIT), [all]);
  const stats = useMemo(() => calcStats(all), [all]);

  return { donations, stats, state, error, refresh: load };
}
