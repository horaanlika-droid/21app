import { useCallback, useEffect, useState } from 'react';
import { useTonAddress, useTonConnectUI } from '@tonconnect/ui-react';

import { WalletCard } from './components/WalletCard';
import { DonateForm } from './components/DonateForm';
import { FundStats } from './components/FundStats';
import { DonationHistory } from './components/DonationHistory';
import { Toasts } from './components/Toasts';

import { useBalance } from './hooks/useBalance';
import { useDonations } from './hooks/useDonations';
import { useDonate } from './hooks/useDonate';
import { useToasts } from './hooks/useToasts';

import { FUND_ADDRESS } from './lib/config';
import { cachedAddress, cacheAddress } from './lib/storage';

/** Копирование с фолбэком для окружений без Clipboard API (старый WebView). */
async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* упадём в фолбэк ниже */
  }

  try {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(area);
    return ok;
  } catch {
    return false;
  }
}

export default function App() {
  const [tonConnectUI] = useTonConnectUI();
  const { toasts, push, dismiss } = useToasts();

  // адрес из TON Connect; пока сессия восстанавливается — берём кеш из localStorage,
  // чтобы баланс и UI не «моргали» пустым состоянием при открытии мини-аппа
  const liveAddress = useTonAddress();
  const [address, setAddress] = useState<string | null>(() => cachedAddress());

  useEffect(() => {
    if (liveAddress) {
      setAddress(liveAddress);
      cacheAddress(liveAddress);
      return;
    }

    // отличаем «ещё восстанавливаемся» от «пользователь отключил кошелёк»
    const unsubscribe = tonConnectUI.onStatusChange((wallet) => {
      if (!wallet) {
        setAddress(null);
        cacheAddress(null);
      }
    });
    return unsubscribe;
  }, [liveAddress, tonConnectUI]);

  // баланс пользователя и фонда — оба с автообновлением раз в 5 секунд
  const userBalance = useBalance(address);
  const fundBalance = useBalance(FUND_ADDRESS);
  const { donations, stats, state: histState, error: histError, refresh: refreshHistory } =
    useDonations(FUND_ADDRESS);

  const handleCopy = useCallback(
    (text: string) => {
      void copyText(text).then((ok) =>
        ok ? push('success', 'Адрес скопирован') : push('error', 'Не удалось скопировать'),
      );
    },
    [push],
  );

  const onDonateSuccess = useCallback(
    (amount: string | number) => {
      push('success', `Перевод на ${amount} TON отправлен`);
      // сеть подтверждает не мгновенно — обновляем сразу и ещё раз чуть позже
      userBalance.refresh();
      fundBalance.refresh();
      refreshHistory();
      window.setTimeout(() => {
        userBalance.refresh();
        fundBalance.refresh();
        refreshHistory();
      }, 6000);
    },
    [fundBalance, push, refreshHistory, userBalance],
  );

  const onDonateError = useCallback((message: string) => push('error', message), [push]);

  const { sending, donate } = useDonate(onDonateSuccess, onDonateError);

  const handleDonate = useCallback(
    (amount: string, comment: string) => {
      void donate({ amount, comment });
    },
    [donate],
  );

  return (
    <div className="page">
      <header className="page__head">
        <h1 className="page__title">21 · кошелёк района</h1>
        <p className="page__sub">Донаты в общий фонд · сеть TON</p>
      </header>

      <WalletCard
        address={address}
        balance={userBalance.balance}
        state={userBalance.state}
        error={userBalance.error}
        onCopy={handleCopy}
      />

      <FundStats
        fundAddress={FUND_ADDRESS}
        fundBalance={fundBalance.balance}
        stats={stats}
        state={histState}
        error={fundBalance.error ?? histError}
        onCopy={handleCopy}
      />

      <DonateForm connected={Boolean(address)} sending={sending} onDonate={handleDonate} />

      <DonationHistory
        donations={donations}
        state={histState}
        error={histError}
        myAddress={address}
      />

      <footer className="page__foot">
        Данные из блокчейна TON через tonapi.io · обновление каждые 5 секунд
      </footer>

      <Toasts toasts={toasts} onDismiss={dismiss} />
    </div>
  );
}
