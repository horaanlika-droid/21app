import { defineConfig, type ProxyOptions } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Vite-конфиг.
 *
 * base: './' — ассеты подключаются относительно index.html, поэтому сборка
 * одинаково работает и в корне домена, и на подпути GitHub Pages (/21app/wallet/).
 *
 * server.host: '0.0.0.0' + allowedHosts: true — dev-сервер должен принимать
 * запросы с внешнего превью-домена, иначе Vite отвечает "Blocked request".
 *
 * /api/tonapi — dev-прокси. По умолчанию ведёт на локальный бот-хост
 * (node http-wrapper.js на :8080), у которого в env лежит TONAPI_KEY.
 * Адрес можно переопределить: BOT_HOST=https://ваш-хост npm run dev
 *
 * Так в разработке путь ровно тот же, что в проде, — /api/tonapi/... —
 * и ключ ни в одном режиме не попадает в браузер.
 */
export default defineConfig(({ mode }) => {
  const isDev = mode === 'development';
  const botHost = process.env.BOT_HOST || 'http://localhost:8080';

  const tonapiProxy: Record<string, ProxyOptions> = {
    '/api/tonapi': {
      target: botHost,
      changeOrigin: true,
      secure: !botHost.startsWith('http://'),
    },
  };

  return {
    plugins: [react()],
    base: './',
    server: {
      host: '0.0.0.0',
      port: 5173,
      strictPort: false,
      allowedHosts: true,
      proxy: isDev ? tonapiProxy : undefined,
    },
    preview: {
      host: '0.0.0.0',
      port: 4173,
      allowedHosts: true,
    },
    build: {
      outDir: 'dist',
      sourcemap: true,
      target: 'es2020',
    },
  };
});
