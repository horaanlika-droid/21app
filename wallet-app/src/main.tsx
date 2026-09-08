import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { THEME, TonConnectUIProvider } from '@tonconnect/ui-react';

import App from './App';
import { MANIFEST_URL, TWA_RETURN_URL } from './lib/config';
import './styles.css';

/**
 * Точка входа.
 *
 * TonConnectUIProvider поднимает TON Connect на всё приложение:
 *  - manifestUrl — публичный манифест на том же домене (иначе кошелёк откажет);
 *  - twaReturnUrl — куда вернуть пользователя после подтверждения в кошельке;
 *  - language: 'ru' + тёмная тема под стиль Telegram.
 */

// Telegram WebApp: разворачиваем на весь экран и включаем тёмный header
const tg = (window as unknown as { Telegram?: { WebApp?: any } }).Telegram?.WebApp;
if (tg) {
  try {
    tg.ready();
    tg.expand();
    tg.setHeaderColor?.('#17212b');
    tg.setBackgroundColor?.('#17212b');
  } catch {
    /* вне Telegram методов может не быть */
  }
}

const container = document.getElementById('root');
if (!container) throw new Error('Не найден #root');

createRoot(container).render(
  <StrictMode>
    <TonConnectUIProvider
      manifestUrl={MANIFEST_URL}
      language="ru"
      uiPreferences={{ theme: THEME.DARK }}
      actionsConfiguration={{
        twaReturnUrl: TWA_RETURN_URL,
        returnStrategy: 'back',
      }}
    >
      <App />
    </TonConnectUIProvider>
  </StrictMode>,
);
