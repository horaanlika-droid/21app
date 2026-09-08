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
 * /tonapi — dev-прокси на tonapi.io: браузер зовёт относительный путь, а ключ
 * TONAPI_KEY (если задан) подставляется на сервере и не попадает в бандл.
 */
export default defineConfig(({ mode }) => {
  const isDev = mode === 'development';

  const tonapiProxy: Record<string, ProxyOptions> = {
    '/tonapi': {
      target: 'https://tonapi.io',
      changeOrigin: true,
      secure: true,
      rewrite: (p) => p.replace(/^\/tonapi/, ''),
      configure: (proxy) => {
        const key = process.env.TONAPI_KEY;
        if (!key) return;
        proxy.on('proxyReq', (proxyReq) => {
          proxyReq.setHeader('Authorization', `Bearer ${key}`);
        });
      },
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
