/**
 * Проверка собственного BOC-энкодера (src/lib/cell.ts) против эталонного @ton/core.
 *
 * Запуск: node scripts/verify-cell.mjs
 * Требует devDependency @ton/core (нужен только для этой проверки).
 */
import { beginCell as refBeginCell } from '@ton/core';
import { readFileSync } from 'node:fs';
import { transform } from 'esbuild';

// компилируем cell.ts на лету, чтобы тестировать ровно тот код, что уходит в бандл
const source = readFileSync(new URL('../src/lib/cell.ts', import.meta.url), 'utf8');
const { code: js } = await transform(source, { loader: 'ts', format: 'esm', target: 'es2022' });

globalThis.btoa ??= (s) => Buffer.from(s, 'binary').toString('base64');
const mod = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
const { beginCell } = mod;

const cases = [
  '',
  'привет',
  '21 · донат в фонд района',
  'Hello, TON!',
  'a'.repeat(100),
  'x'.repeat(127),   // ровно граница первой ячейки
  'y'.repeat(128),   // +1 байт → появляется дочерняя ссылка
  'z'.repeat(500),   // несколько уровней вложенности
  'ю'.repeat(300),   // многобайтовый UTF-8
  '🚀 эмодзи и symbols &<>"\'',
];

let failed = 0;

for (const text of cases) {
  const mine = beginCell().storeUint(0, 32).storeStringTail(text).endCell().toBoc();

  const reference = refBeginCell()
    .storeUint(0, 32)
    .storeStringTail(text)
    .endCell()
    .toBoc()
    .toString('base64');

  const ok = mine === reference;
  if (!ok) failed++;

  const label = text.length > 24 ? `${text.slice(0, 24)}… (${text.length})` : `"${text}"`;
  console.log(`${ok ? '✓' : '✗'} ${label}`);
  if (!ok) {
    console.log(`   mine: ${mine}`);
    console.log(`   ref : ${reference}`);
  }
}

console.log(failed === 0 ? '\nOK: BOC совпадает с @ton/core' : `\nFAIL: расхождений ${failed}`);
process.exit(failed === 0 ? 0 : 1);
