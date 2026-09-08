/** Общие типы приложения. */

/** Один донат в истории. */
export interface Donation {
  /** hash транзакции — используется как React key. */
  hash: string;
  /** Отправитель в user-friendly виде (UQ…/EQ…). */
  from: string;
  /** Сумма в нанотонах (1 TON = 1e9 nanoTON). Строкой, чтобы не терять точность. */
  amountNano: string;
  /** Комментарий, если отправитель его приложил. */
  comment: string;
  /** Unix-время (секунды). */
  utime: number;
}

/** Агрегированная статистика по донатам. */
export interface DonationStats {
  /** Сумма всех входящих донатов, нанотоны. */
  totalNano: bigint;
  /** Количество уникальных адресов-донатеров. */
  donorsCount: number;
  /** Всего учтённых переводов. */
  txCount: number;
}

/** Статус загрузки для UI. */
export type LoadState = 'idle' | 'loading' | 'ready' | 'error';

/** Тип уведомления. */
export type ToastKind = 'success' | 'error' | 'info';

/** Уведомление. */
export interface Toast {
  id: number;
  kind: ToastKind;
  text: string;
}
