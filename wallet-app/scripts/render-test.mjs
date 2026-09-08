/**
 * Проверка рендера: собираем приложение с моками TON API и TON Connect
 * и рендерим в строку через react-dom/server. Ловим падения и проверяем,
 * что реальные данные (баланс, статистика, история) доходят до разметки.
 */
import { build } from 'vite';
import react from '@vitejs/plugin-react';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

// собираем внутри проекта: из /tmp Node не резолвит react из node_modules
const dir = join(process.cwd(), '.render-test');
rmSync(dir, { recursive: true, force: true });
mkdirSync(dir, { recursive: true });

// мок-данные: 3 доната от 2 уникальных адресов
const DONATIONS = [
  { hash: 'h1', from: 'UQAAAA1111111111111111111111111111111111111A', amountNano: '2500000000', comment: 'на лампы', utime: Math.floor(Date.now()/1000) - 60 },
  { hash: 'h2', from: 'UQBBBB2222222222222222222222222222222222222B', amountNano: '1000000000', comment: '', utime: Math.floor(Date.now()/1000) - 7200 },
  { hash: 'h3', from: 'UQAAAA1111111111111111111111111111111111111A', amountNano: '500000000', comment: 'ещё немного', utime: Math.floor(Date.now()/1000) - 90000 },
];

const entry = join(dir, 'entry.jsx');
writeFileSync(entry, `
import { renderToString } from 'react-dom/server';
import { FundStats } from '${process.cwd()}/src/components/FundStats.tsx';
import { DonationHistory } from '${process.cwd()}/src/components/DonationHistory.tsx';
import { DonateForm } from '${process.cwd()}/src/components/DonateForm.tsx';
import { Toasts } from '${process.cwd()}/src/components/Toasts.tsx';
import { calcStats } from '${process.cwd()}/src/lib/tonapi.ts';
import { formatTon, tonToNano } from '${process.cwd()}/src/lib/format.ts';

const donations = ${JSON.stringify(DONATIONS)};
const stats = calcStats(donations);

export const html = [
  renderToString(<FundStats fundAddress="UQC1xYc4aPgMaHjER3xZPRKz4LfYgDyNSBSxykZmB2YbsWLW" fundBalance={12345678901n} stats={stats} state="ready" error={null} onCopy={()=>{}} />),
  renderToString(<DonationHistory donations={donations} state="ready" error={null} myAddress="UQAAAA1111111111111111111111111111111111111A" />),
  renderToString(<DonateForm connected={true} sending={false} onDonate={()=>{}} />),
  renderToString(<DonateForm connected={true} sending={true} onDonate={()=>{}} />),
  renderToString(<Toasts toasts={[{id:1,kind:'success',text:'Перевод отправлен'},{id:2,kind:'error',text:'Перевод отменён'}]} onDismiss={()=>{}} />),
].join('\\n<!-- ---- -->\\n');

export const checks = {
  totalTon: formatTon(stats.totalNano, 2),
  donors: stats.donorsCount,
  nano: tonToNano('2.5').toString(),
};
`);

await build({
  root: dir,
  logLevel: 'error',
  plugins: [react()],
  resolve: { alias: {} },
  build: {
    ssr: entry,
    outDir: join(dir, 'out'),
    rollupOptions: {
      external: ['react', 'react-dom', 'react-dom/server', 'react/jsx-runtime', 'react/jsx-dev-runtime'],
      output: { format: 'esm', entryFileNames: 'entry.mjs' },
    },
    minify: false,
  },
});

// config.ts читает document.baseURI на импорте — в Node подставляем заглушку
globalThis.document ??= { baseURI: 'https://example.com/wallet/' };

const mod = await import(join(dir, 'out', 'entry.mjs'));
const { html, checks } = mod;

// React вставляет <!-- --> между соседними текстовыми узлами — для проверок убираем
const flat = html.replaceAll('<!-- -->', '');

const expect = [
  ['баланс фонда 12.34 TON', html.includes('12.34')],
  ['сумма донатов 4 TON', checks.totalTon === '4'],
  ['уникальных донатеров = 2', checks.donors === 2],
  ['склонение «донатера»', html.includes('донатера')],
  ['комментарий в истории', html.includes('на лампы')],
  ['метка «вы» для своих', html.includes('badge')],
  ['пресеты сумм 0.5/1/2/5', ['0.5 TON','1 TON','2 TON','5 TON'].every(t=>flat.includes(t))],
  ['кнопка отправки с суммой', html.includes('Отправить 1 TON')],
  ['блокировка при отправке', html.includes('Подтвердите в кошельке') && html.includes('disabled')],
  ['поле комментария', html.includes('Комментарий')],
  ['счётчик 0/120', flat.includes('0/120')],
  ['тосты success+error', html.includes('toast--success') && html.includes('toast--error')],
  ['tonToNano("2.5")', checks.nano === '2500000000'],
];

if (process.env.DUMP === '1') {
  const i = html.indexOf('preset');
  console.log('--- presets snippet ---');
  console.log(html.slice(i-200, i+400));
  console.log('--- counter snippet ---');
  const j = html.indexOf('field__counter');
  console.log(html.slice(j-100, j+200));
}

let bad = 0;
for (const [name, ok] of expect) { if(!ok) bad++; console.log(`${ok?'✓':'✗'} ${name}`); }
console.log(bad === 0 ? '\nOK: рендер и данные корректны' : `\nFAIL: ${bad}`);
rmSync(dir, { recursive: true, force: true });
process.exit(bad === 0 ? 0 : 1);
