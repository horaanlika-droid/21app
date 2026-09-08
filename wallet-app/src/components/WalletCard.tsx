import { useCallback, useEffect, useState } from 'react';
import { TonConnectButton, useTonWallet } from '@tonconnect/ui-react';
import { formatTon, shortAddress } from '../lib/format';
import type { LoadState } from '../lib/types';

interface Props {
  /** Адрес подключённого кошелька (user-friendly). */
  address: string | null;
  balance: bigint | null;
  state: LoadState;
  error: string | null;
  onCopy: (text: string) => void;
}

/**
 * Карточка кошелька: статус подключения, баланс с автообновлением,
 * копирование адреса и штатная кнопка TON Connect.
 */
export function WalletCard({ address, balance, state, error, onCopy }: Props) {
  const wallet = useTonWallet();
  const [pulse, setPulse] = useState(false);

  // короткая подсветка при изменении баланса — видно, что данные живые
  useEffect(() => {
    if (balance === null) return;
    setPulse(true);
    const timer = window.setTimeout(() => setPulse(false), 600);
    return () => window.clearTimeout(timer);
  }, [balance]);

  const handleCopy = useCallback(() => {
    if (address) onCopy(address);
  }, [address, onCopy]);

  const connected = Boolean(address);
  const walletName = wallet?.device.appName ?? '';

  return (
    <section className="card">
      <header className="card__head">
        <div>
          <h2 className="card__title">Мой кошелёк</h2>
          <p className={`status ${connected ? 'status--on' : 'status--off'}`}>
            <span className="status__dot" />
            {connected ? `Подключён${walletName ? ` · ${walletName}` : ''}` : 'Не подключён'}
          </p>
        </div>
        <TonConnectButton />
      </header>

      {connected && (
        <>
          <div className="balance">
            <span className="balance__label">Баланс</span>
            <span className={`balance__value ${pulse ? 'balance__value--pulse' : ''}`}>
              {balance === null
                ? state === 'loading'
                  ? '…'
                  : '—'
                : `${formatTon(balance, 4)} TON`}
            </span>
            <span className="balance__hint">
              {error ? error : 'обновляется автоматически каждые 5 секунд'}
            </span>
          </div>

          <button type="button" className="btn btn--ghost btn--full" onClick={handleCopy}>
            <span className="btn__mono">{shortAddress(address!, 8, 6)}</span>
            Скопировать адрес
          </button>
        </>
      )}

      {!connected && (
        <p className="muted">
          Подключите кошелёк, чтобы поддержать район и видеть свой баланс.
        </p>
      )}
    </section>
  );
}
