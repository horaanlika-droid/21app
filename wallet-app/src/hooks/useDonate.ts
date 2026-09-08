import { useCallback, useRef, useState } from 'react';
import { useTonConnectUI } from '@tonconnect/ui-react';
import { beginCell } from '../lib/cell';
import { tonToNano } from '../lib/format';
import { FUND_ADDRESS, MAX_AMOUNT, MIN_AMOUNT, TX_VALID_SECONDS } from '../lib/config';

/** Человекочитаемый разбор ошибок кошелька. */
function describeError(error: unknown): string {
  const name = (error as { name?: string } | null)?.name ?? '';
  const message = (error as { message?: string } | null)?.message ?? '';
  const text = `${name} ${message}`;

  if (/UserReject|UserRejects|rejected|declined|cancel/i.test(text)) {
    return 'Перевод отменён в кошельке';
  }
  if (/WalletNotConnected/i.test(text)) {
    return 'Кошелёк не подключён';
  }
  if (/expire|timeout|Timeout/i.test(text)) {
    return 'Время подтверждения истекло — попробуйте ещё раз';
  }
  if (/Insufficient|balance/i.test(text)) {
    return 'Недостаточно средств на кошельке';
  }
  return message || 'Не удалось отправить перевод';
}

interface DonateArgs {
  /** Сумма в TON (число или строка из инпута). */
  amount: string | number;
  /** Необязательный комментарий — уйдёт в блокчейн текстовым payload. */
  comment?: string;
}

interface UseDonateResult {
  /** true, пока ждём подтверждения в кошельке — блокирует кнопку. */
  sending: boolean;
  donate: (args: DonateArgs) => Promise<boolean>;
}

/**
 * Отправка доната на адрес фонда через TON Connect.
 *
 * Важное:
 *  - validUntil измеряется в СЕКУНДАХ (в мс кошелёк отвергнет как просроченную);
 *  - комментарий кодируется в payload как text comment (32 нулевых бита + UTF-8);
 *  - двойной клик отсекается на уровне ref, а не только через состояние —
 *    состояние обновляется асинхронно и успевает пропустить второй клик.
 */
export function useDonate(
  onSuccess?: (amount: string | number) => void,
  onError?: (message: string) => void,
): UseDonateResult {
  const [tonConnectUI] = useTonConnectUI();
  const [sending, setSending] = useState(false);
  const inFlightRef = useRef(false);

  const donate = useCallback(
    async ({ amount, comment }: DonateArgs): Promise<boolean> => {
      if (inFlightRef.current) return false; // защита от повторных кликов
      inFlightRef.current = true;
      setSending(true);

      try {
        // 1) проверяем сумму
        let nano: bigint;
        try {
          nano = tonToNano(amount);
        } catch {
          onError?.('Введите корректную сумму');
          return false;
        }

        const minNano = tonToNano(MIN_AMOUNT);
        const maxNano = tonToNano(MAX_AMOUNT);
        if (nano < minNano) {
          onError?.(`Минимальная сумма — ${MIN_AMOUNT} TON`);
          return false;
        }
        if (nano > maxNano) {
          onError?.(`Максимальная сумма — ${MAX_AMOUNT} TON`);
          return false;
        }

        // 2) кошелёк должен быть подключён
        if (!tonConnectUI.connected) {
          onError?.('Сначала подключите кошелёк');
          return false;
        }

        // 3) комментарий → payload (BOC в base64)
        const trimmed = (comment ?? '').trim();
        const payload = trimmed
          ? beginCell().storeUint(0, 32).storeStringTail(trimmed).endCell().toBoc()
          : undefined;

        // 4) отправляем
        await tonConnectUI.sendTransaction({
          validUntil: Math.floor(Date.now() / 1000) + TX_VALID_SECONDS,
          messages: [
            {
              address: FUND_ADDRESS,
              amount: nano.toString(),
              ...(payload ? { payload } : {}),
            },
          ],
        });

        onSuccess?.(amount);
        return true;
      } catch (error) {
        onError?.(describeError(error));
        return false;
      } finally {
        inFlightRef.current = false;
        setSending(false);
      }
    },
    [onError, onSuccess, tonConnectUI],
  );

  return { sending, donate };
}
