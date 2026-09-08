'use strict';
/* Проверка QR-кодера настоящим декодером (jsQR).
   Запуск: npm i --no-save jsqr && node tools/qr-test.js

   Главное, что проверяем: код читается ДАЖЕ когда середина вырезана
   под логотип. Для этого нужен уровень коррекции H. */

const fs = require('fs');
const path = require('path');
const jsQR = require('jsqr');

// подгружаем кодер из общего файла (он же вшит в index.html)
const src = fs.readFileSync(path.join(__dirname, 'qr.js'), 'utf8');
const QR21 = new Function(src + '; return QR21;')();

let bad = 0;
const ok = (name, cond) => { if (!cond) bad++; console.log((cond ? '✓ ' : '✗ ') + name); };

/** Рендер матрицы в RGBA-пиксели с полем (quiet zone). */
function render(q, scale = 8, quiet = 4, holeRatio = 0) {
  const n = q.size;
  const px = (n + quiet * 2) * scale;
  const data = new Uint8ClampedArray(px * px * 4).fill(255);

  const put = (x, y, dark) => {
    const v = dark ? 0 : 255;
    const i = (y * px + x) * 4;
    data[i] = v; data[i + 1] = v; data[i + 2] = v; data[i + 3] = 255;
  };

  for (let yy = 0; yy < n; yy++) {
    for (let xx = 0; xx < n; xx++) {
      const dark = q.get(xx, yy);
      for (let dy = 0; dy < scale; dy++) {
        for (let dx = 0; dx < scale; dx++) {
          put((quiet + xx) * scale + dx, (quiet + yy) * scale + dy, dark);
        }
      }
    }
  }

  // «дырка» под логотип: белый круг в центре
  if (holeRatio > 0) {
    const cx = px / 2, cy = px / 2, r = px * holeRatio;
    for (let y = 0; y < px; y++) {
      for (let x = 0; x < px; x++) {
        if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) put(x, y, false);
      }
    }
  }
  return { data, width: px, height: px };
}

const decode = (img) => {
  const r = jsQR(img.data, img.width, img.height);
  return r ? r.data : null;
};

console.log('— базовое кодирование —');
const samples = [
  'https://t.me/twentyonemovementbot/app',
  'https://horaanlika-droid.github.io/21app/#q=abc123',
  'https://horaanlika-droid.github.io/21app/#u=tg1896036065',
  '21',
  'https://t.me/twentyonemovementbot/contemporarysociety',
];

for (const text of samples) {
  const q = QR21.encode(text, { ec: 'H' });
  const got = decode(render(q));
  const good = got === text;
  if (!good) bad++;
  console.log(`${good ? '✓' : '✗'} v${q.version}H «${text.slice(0, 42)}${text.length > 42 ? '…' : ''}»`);
  if (!good) console.log('   декодировано:', got);
}

console.log('\n— все уровни коррекции —');
for (const ec of ['L', 'M', 'Q', 'H']) {
  const text = 'https://t.me/twentyonemovementbot/app';
  const q = QR21.encode(text, { ec });
  ok(`уровень ${ec} (v${q.version}) читается`, decode(render(q)) === text);
}

console.log('\n— логотип в центре —');
const link = 'https://horaanlika-droid.github.io/21app/#q=abc123';
// доля радиуса от ширины картинки: 0.11 ≈ 15% площади кода
for (const [ec, ratio] of [['L', 0.10], ['H', 0.10], ['H', 0.12]]) {
  const q = QR21.encode(link, { ec });
  const got = decode(render(q, 8, 4, ratio));
  const area = (Math.PI * ratio * ratio * 100).toFixed(1);
  const good = got === link;
  if (ec === 'H') { if (!good) bad++; }
  console.log(`${good ? '✓' : '✗'} ${ec}, дырка ~${area}% площади → ${good ? 'читается' : 'НЕ читается'}`);
}

console.log('\n— устойчивость: масштаб и поворот —');
const q = QR21.encode(link, { ec: 'H' });
ok('мелкий масштаб (4 px/модуль)', decode(render(q, 4)) === link);
ok('крупный масштаб (12 px/модуль)', decode(render(q, 12)) === link);
ok('узкая quiet zone (2 модуля)', decode(render(q, 8, 2)) === link);

console.log('\n— структура —');
const q2 = QR21.encode(link, { ec: 'H' });
ok('размер = 17 + 4·версия', q2.size === 17 + 4 * q2.version);
ok('уровень возвращается', q2.ec === 'H');
ok('isFinder помечает три «глаза»',
  q2.isFinder(0, 0) && q2.isFinder(q2.size - 1, 0) && q2.isFinder(0, q2.size - 1) && !q2.isFinder(Math.floor(q2.size / 2), Math.floor(q2.size / 2)));

let threw = false;
try { QR21.encode('x'.repeat(500), { ec: 'H' }); } catch (e) { threw = true; }
ok('слишком длинные данные → понятная ошибка', threw);

console.log(bad === 0 ? '\nOK: QR читается настоящим декодером' : `\nFAIL: ошибок ${bad}`);
process.exit(bad ? 1 : 0);
