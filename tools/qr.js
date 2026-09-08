/*QR:BEGIN*/
// «21» QR-кодер: byte mode, уровни коррекции L/M/Q/H, версии 1–6, выбор маски по penalty.
// Чистый JS, без зависимостей. QR21.encode(text, {ec:'H'}) → {size, get(x,y), mask, version, ec}
//
// Уровень H (30%) нужен, чтобы логотип в центре не ломал считывание:
// «дырка» под лого съедает ~10% модулей, а L восстанавливает только 7%.
const QR21 = (function () {
  'use strict';
  // --- GF(256), примитив 0x11D ---
  const EXP = new Int32Array(512), LOG = new Int32Array(256);
  (function () {
    let x = 1;
    for (let i = 0; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 0x100) x ^= 0x11d; }
    for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
  })();
  const gmul = (a, b) => (a && b) ? EXP[LOG[a] + LOG[b]] : 0;

  /* Таблицы блоков, версии 1..6.
     Формат: [ecPerBlock, [ [блоков, данных в блоке], ... ] ]
     Разбиение на блоки обязательно: начиная с версии 3 уровень H
     использует несколько блоков, и без интерливинга код не прочитается. */
  const RS = {
    L: [
      [7,  [[1, 19]]],
      [10, [[1, 34]]],
      [15, [[1, 55]]],
      [20, [[1, 80]]],
      [26, [[1, 108]]],
      [18, [[2, 68]]],
    ],
    M: [
      [10, [[1, 16]]],
      [16, [[1, 28]]],
      [26, [[1, 44]]],
      [18, [[2, 32]]],
      [24, [[2, 43]]],
      [16, [[4, 27]]],
    ],
    Q: [
      [13, [[1, 13]]],
      [22, [[1, 22]]],
      [18, [[2, 17]]],
      [26, [[2, 24]]],
      [18, [[2, 15], [2, 16]]],
      [24, [[4, 19]]],
    ],
    H: [
      [17, [[1, 9]]],
      [28, [[1, 16]]],
      [22, [[2, 13]]],
      [16, [[4, 9]]],
      [22, [[2, 11], [2, 12]]],
      [28, [[4, 15]]],
    ],
  };
  /** Биты уровня коррекции в поле формата. */
  const EC_BITS = { L: 1, M: 0, Q: 3, H: 2 };

  /** Сколько всего кодовых слов данных у версии+уровня. */
  function dataCapacity(ec, ver) {
    const [, groups] = RS[ec][ver - 1];
    return groups.reduce((s, [blocks, cw]) => s + blocks * cw, 0);
  }

  function rsGen(deg) { // полином делителя, коэффициенты по возрастанию степени
    let g = [1];
    for (let i = 0; i < deg; i++) {
      const a = EXP[i];
      const ng = new Array(g.length + 1).fill(0);
      for (let k = 0; k < g.length; k++) {
        ng[k] ^= gmul(g[k], a);
        ng[k + 1] ^= g[k];
      }
      g = ng;
    }
    return g; // g[deg] === 1
  }

  function rsEncode(data, deg) {
    const gen = rsGen(deg);
    const rem = new Array(deg).fill(0);
    for (let i = 0; i < data.length; i++) {
      const factor = data[i] ^ rem[0];
      rem.shift(); rem.push(0);
      if (factor) for (let k = 0; k < deg; k++) rem[k] ^= gmul(gen[deg - 1 - k], factor);
    }
    return rem;
  }

  const MASKS = [
    (x, y) => (x + y) % 2 === 0,
    (x, y) => y % 2 === 0,
    (x, y) => x % 3 === 0,
    (x, y) => (x + y) % 3 === 0,
    (x, y) => (((y >> 1) & 1) + Math.floor(x / 3)) % 2 === 0,
    (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
    (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
    (x, y) => (((x * y) % 3) + ((x + y) % 2)) % 2 === 0,
  ];

  function formatBits(ec, mask) {
    const data = (EC_BITS[ec] << 3) | mask;
    let rem = data;
    for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    return ((data << 10) | rem) ^ 0x5412;
  }

  /**
   * @param {string} text данные
   * @param {{ec?: 'L'|'M'|'Q'|'H', minVersion?: number}} [opts]
   *
   * Если данные не влезают на запрошенном уровне, коррекция понижается
   * (H→Q→M→L), а фактический уровень возвращается в поле .ec — вызывающий
   * код по нему решает, можно ли рисовать логотип поверх.
   */
  function encode(text, opts) {
    const want = (opts && opts.ec) || 'L';
    if (!RS[want]) throw new Error('QR: неизвестный уровень ' + want);
    const minVer = (opts && opts.minVersion) || 1;
    const bytes = new TextEncoder().encode(text);

    // порядок понижения: только вниз от запрошенного
    const order = ['H', 'Q', 'M', 'L'];
    const chain = order.slice(order.indexOf(want));

    let ec = null, ver = 0;
    for (const lvl of chain) {
      for (let v = Math.max(1, minVer); v <= RS[lvl].length; v++) {
        if (4 + 8 + bytes.length * 8 <= dataCapacity(lvl, v) * 8) { ec = lvl; ver = v; break; }
      }
      if (ver) break;
    }
    if (!ver) {
      throw new Error('QR: данные не помещаются (' + bytes.length +
        ' байт, максимум ' + dataCapacity('L', RS.L.length) + ')');
    }

    const [ecPerBlock, groups] = RS[ec][ver - 1];
    const totalData = dataCapacity(ec, ver);
    const n = 17 + 4 * ver;

    // --- битовый поток ---
    const bits = [];
    const push = (val, len) => { for (let i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1); };
    push(4, 4);                 // режим: byte
    push(bytes.length, 8);      // длина (версии 1..9 → 8 бит)
    for (let i = 0; i < bytes.length; i++) push(bytes[i], 8);
    push(0, Math.min(4, totalData * 8 - bits.length));  // терминатор
    while (bits.length % 8) bits.push(0);
    const pads = [0xec, 0x11];
    let pi = 0;
    while (bits.length < totalData * 8) { push(pads[pi & 1], 8); pi++; }

    const dataCw = [];
    for (let i = 0; i < bits.length; i += 8) {
      let b = 0;
      for (let j = 0; j < 8; j++) b = (b << 1) | bits[i + j];
      dataCw.push(b);
    }

    // --- разбиение на блоки + RS для каждого ---
    const dataBlocks = [], ecBlocks = [];
    let pos = 0;
    for (const [blocks, cwPerBlock] of groups) {
      for (let b = 0; b < blocks; b++) {
        const chunk = dataCw.slice(pos, pos + cwPerBlock);
        pos += cwPerBlock;
        dataBlocks.push(chunk);
        ecBlocks.push(rsEncode(chunk, ecPerBlock));
      }
    }

    // --- интерливинг: по одному слову из каждого блока по кругу ---
    const all = [];
    const maxData = Math.max(...dataBlocks.map(b => b.length));
    for (let i = 0; i < maxData; i++) {
      for (const b of dataBlocks) if (i < b.length) all.push(b[i]);
    }
    for (let i = 0; i < ecPerBlock; i++) {
      for (const b of ecBlocks) all.push(b[i]);
    }

    // --- матрица ---
    const mod = Array.from({ length: n }, () => new Array(n).fill(null));
    const isFunc = Array.from({ length: n }, () => new Array(n).fill(false));
    const set = (x, y, dark) => { mod[y][x] = dark ? 1 : 0; isFunc[y][x] = true; };

    function finder(cx, cy) {
      for (let dy = -1; dy <= 7; dy++) for (let dx = -1; dx <= 7; dx++) {
        const x = cx + dx, y = cy + dy;
        if (x < 0 || x >= n || y < 0 || y >= n) continue;
        let dark;
        if (dx < 0 || dx > 6 || dy < 0 || dy > 6) dark = false;
        else { const m = Math.max(Math.abs(dx - 3), Math.abs(dy - 3)); dark = m !== 2; }
        set(x, y, dark);
      }
    }
    finder(0, 0); finder(n - 7, 0); finder(0, n - 7);

    for (let i = 8; i <= n - 9; i++) {
      if (mod[6][i] === null) set(i, 6, i % 2 === 0);
      if (mod[i][6] === null) set(6, i, i % 2 === 0);
    }
    // выравнивающий узор (версии 2..6 — ровно один, в правом нижнем углу)
    if (ver >= 2) {
      const c = n - 7;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++)
        set(c + dx, c + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    }
    for (let i = 0; i <= 8; i++) {
      if (mod[8][i] === null) set(i, 8, 0);
      if (mod[i][8] === null) set(8, i, 0);
    }
    for (let i = 0; i < 8; i++) set(n - 1 - i, 8, 0);
    for (let i = 0; i < 7; i++) set(8, n - 7 + i, 0);
    set(8, n - 8, 1); // тёмный модуль

    let bi = 0;
    const totalBits = all.length * 8;
    for (let col = n - 1; col >= 1; col -= 2) {
      if (col === 6) col--;
      for (let k = 0; k < n; k++) {
        for (let c = 0; c < 2; c++) {
          const x = col - c;
          const y = (((col + 1) & 2) === 0) ? n - 1 - k : k;
          if (mod[y][x] === null) {
            mod[y][x] = bi < totalBits ? (all[bi >> 3] >>> (7 - (bi & 7))) & 1 : 0;
            bi++;
          }
        }
      }
    }

    const clone = () => mod.map(r => r.slice());
    function drawFormat(bits, m) {
      const b = i => ((bits >>> i) & 1) !== 0;
      for (let i = 0; i <= 5; i++) m[i][8] = b(i) ? 1 : 0;
      m[7][8] = b(6) ? 1 : 0; m[8][8] = b(7) ? 1 : 0; m[8][7] = b(8) ? 1 : 0;
      for (let i = 9; i < 15; i++) m[8][14 - i] = b(i) ? 1 : 0;
      for (let i = 0; i < 8; i++) m[8][n - 1 - i] = b(i) ? 1 : 0;
      for (let i = 8; i < 15; i++) m[n - 15 + i][8] = b(i) ? 1 : 0;
      m[n - 8][8] = 1;
    }

    function penalty(m) {
      let s = 0;
      for (let y = 0; y < n; y++) {
        let run = 1;
        for (let x = 1; x < n; x++) {
          if (m[y][x] === m[y][x - 1]) run++;
          else { if (run >= 5) s += 3 + (run - 5); run = 1; }
        }
        if (run >= 5) s += 3 + (run - 5);
      }
      for (let x = 0; x < n; x++) {
        let run = 1;
        for (let y = 1; y < n; y++) {
          if (m[y][x] === m[y - 1][x]) run++;
          else { if (run >= 5) s += 3 + (run - 5); run = 1; }
        }
        if (run >= 5) s += 3 + (run - 5);
      }
      for (let y = 0; y < n - 1; y++) for (let x = 0; x < n - 1; x++) {
        const c = m[y][x];
        if (c === m[y][x + 1] && c === m[y + 1][x] && c === m[y + 1][x + 1]) s += 3;
      }
      const pat = [1, 0, 1, 1, 1, 0, 1];
      for (let y = 0; y < n; y++) for (let x = 0; x <= n - 7; x++) {
        let ok = true;
        for (let i = 0; i < 7; i++) if (m[y][x + i] !== pat[i]) { ok = false; break; }
        if (!ok) continue;
        const before = x >= 4 && !m[y][x - 1] && !m[y][x - 2] && !m[y][x - 3] && !m[y][x - 4];
        const after = x + 11 < n && !m[y][x + 7] && !m[y][x + 8] && !m[y][x + 9] && !m[y][x + 10];
        if (before || after) s += 40;
      }
      for (let x = 0; x < n; x++) for (let y = 0; y <= n - 7; y++) {
        let ok = true;
        for (let i = 0; i < 7; i++) if (m[y + i][x] !== pat[i]) { ok = false; break; }
        if (!ok) continue;
        const before = y >= 4 && !m[y - 1][x] && !m[y - 2][x] && !m[y - 3][x] && !m[y - 4][x];
        const after = y + 11 < n && !m[y + 7][x] && !m[y + 8][x] && !m[y + 9][x] && !m[y + 10][x];
        if (before || after) s += 40;
      }
      let dark = 0;
      for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) dark += m[y][x];
      s += Math.floor(Math.abs(dark * 100 / (n * n) - 50) / 5) * 10;
      return s;
    }

    let best = null, bestPen = Infinity, bestMask = 0;
    for (let mk = 0; mk < 8; mk++) {
      const m = clone();
      for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
        if (!isFunc[y][x] && MASKS[mk](x, y)) m[y][x] ^= 1;
      }
      drawFormat(formatBits(ec, mk), m);
      const p = penalty(m);
      if (p < bestPen) { bestPen = p; best = m; bestMask = mk; }
    }
    return {
      size: n, version: ver, mask: bestMask, ec,
      get: (x, y) => best[y][x] === 1,
      /** true для трёх «глаз» — их рисуем скруглёнными. */
      isFinder: (x, y) =>
        (x < 7 && y < 7) || (x >= n - 7 && y < 7) || (x < 7 && y >= n - 7),
    };
  }
  return { encode };
})();
/*QR:END*/
