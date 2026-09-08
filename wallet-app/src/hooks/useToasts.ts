import { useCallback, useEffect, useRef, useState } from 'react';
import type { Toast, ToastKind } from '../lib/types';

/** Очередь всплывающих уведомлений с автоскрытием. */
export function useToasts(timeout = 4000) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const idRef = useRef(0);
  const timersRef = useRef<number[]>([]);

  // чистим таймеры при размонтировании, чтобы не звать setState у мёртвого компонента
  useEffect(
    () => () => {
      timersRef.current.forEach((t) => window.clearTimeout(t));
      timersRef.current = [];
    },
    [],
  );

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (kind: ToastKind, text: string) => {
      const id = ++idRef.current;
      setToasts((prev) => [...prev, { id, kind, text }]);

      const timer = window.setTimeout(() => dismiss(id), timeout);
      timersRef.current.push(timer);
      return id;
    },
    [dismiss, timeout],
  );

  return { toasts, push, dismiss };
}
