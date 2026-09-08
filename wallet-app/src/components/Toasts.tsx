import type { Toast } from '../lib/types';

interface Props {
  toasts: Toast[];
  onDismiss: (id: number) => void;
}

const ICON: Record<Toast['kind'], string> = {
  success: '✓',
  error: '✕',
  info: 'i',
};

/** Стек уведомлений в нижней части экрана (над безопасной зоной). */
export function Toasts({ toasts, onDismiss }: Props) {
  if (toasts.length === 0) return null;

  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((toast) => (
        <button
          key={toast.id}
          type="button"
          className={`toast toast--${toast.kind}`}
          onClick={() => onDismiss(toast.id)}
        >
          <span className={`toast__icon toast__icon--${toast.kind}`}>{ICON[toast.kind]}</span>
          <span className="toast__text">{toast.text}</span>
        </button>
      ))}
    </div>
  );
}
