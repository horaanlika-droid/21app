/**
 * Проверка бизнес-логики: разбор ответа tonapi, статистика, форматирование сумм.
 * TON API из песочницы недоступен, поэтому fetch подменяем фикстурой.
 */
import { transform } from 'esbuild';
import { readFileSync } from 'node:fs';

globalThis.document ??= { baseURI: 'https://example.com/wallet/' };
globalThis.btoa ??= (s) => Buffer.from(s, 'binary').toString('base64');

async function load(rel) {
  const src = readFileSync(new URL(`../src/${rel}`, import.meta.url), 'utf8')
    // подменяем import.meta.env, которого нет в Node
    .replaceAll('import.meta.env.DEV', 'false')
    .replace(/import\.meta\.env\.(\w+)/g, 'undefined');
  const { code } = await transform(src, { loader: 'ts', format: 'esm', target: 'es2022' });
  const withDeps = code
    .replace(/from '\.\/config'/g, `from './config.mjs'`)
    .replace(/from '\.\/format'/g, `from './format.mjs'`)
    .replace(/from '\.\/types'/g, `from './types.mjs'`);
  return withDeps;
}

// собираем модули в один инлайн-бандл
const [config, format, tonapi] = await Promise.all([load('lib/config.ts'), load('lib/format.ts'), load('lib/tonapi.ts')]);
const bundle = [
  config.replace(/export /g, 'export '),
  format,
  tonapi.replace(/^import[^\n]*\n/gm, ''),
].join('\n');

const mod = await import(`data:text/javascript;base64,${Buffer.from(bundle).toString('base64')}`);
const { formatTon, tonToNano, isValidAddress, shortAddress, calcStats, fetchIncomingDonations, fetchBalance } = mod;

let bad = 0;
const eq = (name, got, want) => {
  const ok = String(got) === String(want);
  if (!ok) bad++;
  console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : ` → got ${got}, want ${want}`}`);
};

console.log('— форматирование сумм —');
eq('1 TON', formatTon(1000000000n), '1');
eq('12.345678901 → 12.34', formatTon(12345678901n, 2), '12.34');
eq('0.5', formatTon(500000000n, 4), '0.5');
eq('дробь без хвостовых нулей', formatTon(1500000000n, 4), '1.5');
eq('крупная сумма с разделителем', formatTon(1234567000000000n, 2), '1 234 567');
eq('ноль', formatTon(0n), '0');
eq('точность 9 знаков (без float)', formatTon(999999999999999999n, 9), '999 999 999.999999999');

console.log('— парсинг ввода —');
eq('tonToNano(0.5)', tonToNano('0.5'), 5n * 10n ** 8n);
eq('запятая как разделитель', tonToNano('1,25'), 1250000000n);
eq('обрезка >9 знаков', tonToNano('1.1234567891'), 1123456789n);
eq('целое', tonToNano('5'), 5000000000n);
let threw = false; try { tonToNano('abc'); } catch { threw = true; }
eq('мусор → исключение', threw, true);

console.log('— адреса —');
eq('валидный UQ', isValidAddress('UQC1xYc4aPgMaHjER3xZPRKz4LfYgDyNSBSxykZmB2YbsWLW'), true);
eq('валидный raw', isValidAddress('0:' + 'a'.repeat(64)), true);
eq('мусор', isValidAddress('hello'), false);
eq('короткий адрес', shortAddress('UQC1xYc4aPgMaHjER3xZPRKz4LfYgDyNSBSxykZmB2YbsWLW'), 'UQC1xY…bsWLW');

console.log('— разбор ответа tonapi —');
const FIXTURE = {
  transactions: [
    // обычный донат с комментарием (decoded_body)
    { hash: 'a', utime: 1700000000, success: true, in_msg: { source: { address: 'UQ_A' }, value: 2000000000, decoded_body: { text: 'на лампы' } } },
    // донат без комментария
    { hash: 'b', utime: 1700000100, success: true, in_msg: { source: { address: 'UQ_B' }, value: 1000000000 } },
    // повторный донат того же адреса → донатер не должен считаться дважды
    { hash: 'c', utime: 1700000200, success: true, in_msg: { source: { address: 'UQ_A' }, value: 500000000, message_content: { decoded: { comment: 'ещё' } } } },
    // external-сообщение без отправителя → не донат
    { hash: 'd', utime: 1700000300, success: true, in_msg: { value: 900000000 } },
    // нулевая сумма → отбрасываем
    { hash: 'e', utime: 1700000400, success: true, in_msg: { source: { address: 'UQ_C' }, value: 0 } },
    // неуспешная транзакция → отбрасываем
    { hash: 'f', utime: 1700000500, success: false, in_msg: { source: { address: 'UQ_D' }, value: 3000000000 } },
    // без in_msg вовсе
    { hash: 'g', utime: 1700000600, success: true },
  ],
};

globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => FIXTURE });
const list = await fetchIncomingDonations('UQ_FUND', 100);
eq('отфильтровано до 3 донатов', list.length, 3);
eq('комментарий из decoded_body', list[0].comment, 'на лампы');
eq('комментарий из message_content', list[2].comment, 'ещё');
eq('пустой комментарий', list[1].comment, '');

const stats = calcStats(list);
eq('сумма 3.5 TON', formatTon(stats.totalNano, 2), '3.5');
eq('уникальных донатеров 2', stats.donorsCount, 2);

console.log('— баланс и ошибки —');
globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => ({ balance: 7500000000 }) });
eq('баланс 7.5 TON', formatTon(await fetchBalance('UQ_X'), 2), '7.5');

globalThis.fetch = async () => ({ ok: false, status: 429, json: async () => ({}) });
let msg = '';
try { await fetchBalance('UQ_X'); } catch (e) { msg = e.message; }
eq('429 → понятная ошибка', /Слишком много/.test(msg), true);

globalThis.fetch = async () => { throw new TypeError('fetch failed'); };
msg = '';
try { await fetchBalance('UQ_X'); } catch (e) { msg = e.message; }
eq('сеть недоступна → понятная ошибка', /Нет связи/.test(msg), true);

console.log(bad === 0 ? '\nOK: логика корректна' : `\nFAIL: ${bad}`);
process.exit(bad === 0 ? 0 : 1);
