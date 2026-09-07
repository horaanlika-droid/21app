/*QR:BEGIN*/
// «21» QR-кодер: byte mode, EC level L, версии 1–5, выбор маски по penalty.
// Чистый JS, без зависимостей. QR21.encode(text) → {size, get(x,y), mask, version}
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

  // EC level L, версии 1..5: [dataCodewords, ecCodewords]
  const L = [[19, 7], [34, 10], [55, 15], [80, 20], [108, 26]];

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
    const gen = rsGen(deg); // gen[k] — коэффициент x^k, gen[deg]=1
    const rem = new Array(deg).fill(0);
    for (let i = 0; i < data.length; i++) {
      const factor = data[i] ^ rem[0];
      rem.shift(); rem.push(0);
      // rem[k] имеет степень deg-1-k → умножаем на gen[deg-1-k]
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

  function formatBits(mask) {
    const data = (1 << 3) | mask; // EC L
    let rem = data;
    for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    return ((data << 10) | rem) ^ 0x5412;
  }

  function encode(text) {
    const bytes = new TextEncoder().encode(text);
    let ver = 0;
    for (let v = 1; v <= L.length; v++) {
      if (4 + 8 + bytes.length * 8 <= L[v - 1][0] * 8) { ver = v; break; }
    }
    if (!ver) throw new Error('QR: data too long');
    const dataCw = L[ver - 1][0], ecCw = L[ver - 1][1];
    const n = 17 + 4 * ver;

    // биты данных
    const bits = [];
    const push = (val, len) => { for (let i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1); };
    push(4, 4);
    push(bytes.length, 8);
    for (let i = 0; i < bytes.length; i++) push(bytes[i], 8);
    push(0, Math.min(4, dataCw * 8 - bits.length));
    while (bits.length % 8) bits.push(0);
    const pads = [0xec, 0x11];
    let pi = 0;
    while (bits.length < dataCw * 8) { push(pads[pi & 1], 8); pi++; }
    const data = [];
    for (let i = 0; i < bits.length; i += 8) {
      let b = 0;
      for (let j = 0; j < 8; j++) b = (b << 1) | bits[i + j];
      data.push(b);
    }
    const all = data.concat(rsEncode(data, ecCw));

    // матрица
    const mod = Array.from({ length: n }, () => new Array(n).fill(null));
    const isFunc = Array.from({ length: n }, () => new Array(n).fill(false));
    const set = (x, y, dark) => { mod[y][x] = dark ? 1 : 0; isFunc[y][x] = true; };

    function finder(cx, cy) {
      for (let dy = -1; dy <= 7; dy++) for (let dx = -1; dx <= 7; dx++) {
        const x = cx + dx, y = cy + dy;
        if (x < 0 || x >= n || y < 0 || y >= n) continue;
        let dark;
        if (dx < 0 || dx > 6 || dy < 0 || dy > 6) dark = false; // сепаратор
        else { const m = Math.max(Math.abs(dx - 3), Math.abs(dy - 3)); dark = m !== 2; }
        set(x, y, dark);
      }
    }
    finder(0, 0); finder(n - 7, 0); finder(0, n - 7);
    for (let i = 8; i <= n - 9; i++) {
      if (mod[6][i] === null) set(i, 6, i % 2 === 0);
      if (mod[i][6] === null) set(6, i, i % 2 === 0);
    }
    if (ver >= 2) {
      const c = n - 7;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++)
        set(c + dx, c + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    }
    // резерв под формат (заполним для выбранной маски)
    for (let i = 0; i <= 8; i++) {
      if (mod[8][i] === null) set(i, 8, 0);
      if (mod[i][8] === null) set(8, i, 0);
    }
    for (let i = 0; i < 8; i++) set(n - 1 - i, 8, 0);
    for (let i = 0; i < 7; i++) set(8, n - 7 + i, 0);
    set(8, n - 8, 1); // тёмный модуль (row size-8, col 8)

    // зигзаг данных
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

    // выбор маски
    const clone = () => mod.map(r => r.slice());
    function drawFormat(bits, m) {
      const b = i => ((bits >>> i) & 1) !== 0;
      // копия 1: (8,i) i=0..5; (8,7); (8,8); (7,8); (14-i,8) i=9..14
      for (let i = 0; i <= 5; i++) m[i][8] = b(i) ? 1 : 0;
      m[7][8] = b(6) ? 1 : 0; m[8][8] = b(7) ? 1 : 0; m[8][7] = b(8) ? 1 : 0;
      for (let i = 9; i < 15; i++) m[8][14 - i] = b(i) ? 1 : 0;
      // копия 2: (size-1-i,8) i=0..7; (8,size-15+i) i=8..14
      for (let i = 0; i < 8; i++) m[8][n - 1 - i] = b(i) ? 1 : 0;
      for (let i = 8; i < 15; i++) m[n - 15 + i][8] = b(i) ? 1 : 0;
      // тёмный модуль (row size-8, col 8)
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

    let best = null, bestPen = Infinity;
    for (let mk = 0; mk < 8; mk++) {
      const m = clone();
      for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
        if (!isFunc[y][x] && MASKS[mk](x, y)) m[y][x] ^= 1;
      }
      drawFormat(formatBits(mk), m);
      const p = penalty(m);
      if (p < bestPen) { bestPen = p; best = m; }
    }
    return {
      size: n,
      version: ver,
      mask: -1,
      get: (x, y) => best[y][x] === 1,
    };
  }

  return { encode };
})();
/*QR:END*/
if (typeof module !== 'undefined' && module.exports) module.exports = QR21;
