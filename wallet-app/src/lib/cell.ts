/**
 * Минимальный конструктор ячейки TON и сериализация в BOC (base64).
 *
 * Нужен ровно для одной задачи — собрать payload текстового комментария:
 *   32 нулевых бита (opcode 0 = text comment) + UTF-8 строка.
 *
 * Своя реализация вместо @ton/core, чтобы не тянуть в бандл всю библиотеку
 * ради одной операции. Корректность подтверждена побайтовым сравнением
 * с @ton/core — см. scripts/verify-cell.mjs.
 *
 * Формат BOC описан в TL-B (crypto/tl/boc.tlb) реализации TON.
 */

/** Ячейка: до 1023 бит данных и до 4 ссылок. */
const MAX_BITS = 1023;
const MAX_BYTES = 127; // 1016 бит — максимум байтов, влезающих целиком

export interface Cell {
  /** Данные ячейки (последний байт может быть заполнен частично). */
  bits: Uint8Array;
  /** Реальное число бит в data. */
  bitLength: number;
  /** Дочерние ячейки. */
  refs: Cell[];
}

class Builder {
  private bytes: number[] = [];
  private bitLength = 0;
  private refs: Cell[] = [];

  /** Записать одно значение шириной bitCount бит. */
  storeUint(value: number | bigint, bitCount: number): this {
    let v = BigInt(value);
    if (v < 0n) throw new Error('storeUint: отрицательное значение');
    if (this.bitLength + bitCount > MAX_BITS) throw new Error('storeUint: переполнение ячейки');

    for (let i = bitCount - 1; i >= 0; i--) {
      const bit = Number((v >> BigInt(i)) & 1n);
      this.storeBit(bit);
    }
    v = 0n;
    return this;
  }

  private storeBit(bit: number): void {
    const byteIndex = this.bitLength >> 3;
    const bitIndex = this.bitLength & 7;

    if (bitIndex === 0) this.bytes.push(0);
    if (bit) this.bytes[byteIndex]! |= 0x80 >> bitIndex;

    this.bitLength++;
  }

  /** Записать байты как есть. */
  storeBuffer(buffer: Uint8Array): this {
    for (const byte of buffer) this.storeUint(byte, 8);
    return this;
  }

  /**
   * Записать строку «хвостом»: что не влезло в текущую ячейку — уходит
   * в дочернюю ссылку, и так рекурсивно (так же поступает @ton/core).
   */
  storeStringTail(text: string): this {
    const data = new TextEncoder().encode(text);
    return this.storeBufferTail(data);
  }

  private storeBufferTail(data: Uint8Array): this {
    const freeBits = MAX_BITS - this.bitLength;
    const freeBytes = Math.min(freeBits >> 3, MAX_BYTES);

    const head = data.subarray(0, freeBytes);
    const tail = data.subarray(freeBytes);

    this.storeBuffer(head);

    if (tail.length > 0) {
      const child = new Builder();
      child.storeBufferTail(tail);
      this.storeRef(child.endCell());
    }

    return this;
  }

  storeRef(cell: Cell): this {
    if (this.refs.length >= 4) throw new Error('storeRef: больше 4 ссылок');
    this.refs.push(cell);
    return this;
  }

  endCell(): CellImpl {
    return new CellImpl(new Uint8Array(this.bytes), this.bitLength, this.refs);
  }
}

class CellImpl implements Cell {
  constructor(
    readonly bits: Uint8Array,
    readonly bitLength: number,
    readonly refs: Cell[],
  ) {}

  /** Сериализовать в BOC и вернуть base64 — формат, который ждёт TON Connect. */
  toBoc(): string {
    return bocToBase64(serializeBoc(this));
  }
}

export function beginCell(): Builder {
  return new Builder();
}

/* ------------------------- сериализация BOC ------------------------- */

/** Плоский список ячеек: корень первым, ссылки — после родителя. */
function flatten(root: Cell): Cell[] {
  const order: Cell[] = [];
  const seen = new Set<Cell>();

  const walk = (cell: Cell) => {
    if (seen.has(cell)) return;
    seen.add(cell);
    order.push(cell);
    cell.refs.forEach(walk);
  };

  walk(root);
  return order;
}

/** descriptor + data одной ячейки. */
function serializeCell(cell: Cell, indexOf: Map<Cell, number>, refSize: number): Uint8Array {
  const out: number[] = [];

  // d1: число ссылок (+ биты exotic/level, у нас всегда 0)
  out.push(cell.refs.length);

  // d2: полные байты + признак неполного последнего байта
  const fullBytes = Math.floor(cell.bitLength / 8);
  const hasPartial = cell.bitLength % 8 !== 0;
  out.push(fullBytes + (hasPartial ? fullBytes + 1 : fullBytes));

  const dataLength = Math.ceil(cell.bitLength / 8);
  const data = new Uint8Array(dataLength);
  data.set(cell.bits.subarray(0, dataLength));

  // completion tag: в неполном байте ставим 1 сразу после последнего значащего бита
  if (hasPartial) {
    const usedBits = cell.bitLength % 8;
    data[dataLength - 1]! |= 0x80 >> usedBits;
  }

  out.push(...data);

  // индексы ссылок
  for (const ref of cell.refs) {
    const index = indexOf.get(ref)!;
    for (let i = refSize - 1; i >= 0; i--) {
      out.push((index >> (i * 8)) & 0xff);
    }
  }

  return new Uint8Array(out);
}

function serializeBoc(root: Cell): Uint8Array {
  const cells = flatten(root);
  const indexOf = new Map<Cell, number>();
  cells.forEach((cell, index) => indexOf.set(cell, index));

  // байт на индекс ячейки
  const refSize = Math.max(1, Math.ceil(Math.log2(Math.max(cells.length, 2)) / 8));

  const serialized = cells.map((cell) => serializeCell(cell, indexOf, refSize));
  const totalSize = serialized.reduce((sum, chunk) => sum + chunk.length, 0);

  // байт на смещение
  const offsetSize = Math.max(1, Math.ceil(Math.log2(Math.max(totalSize + 1, 2)) / 8));

  const header: number[] = [
    0xb5, 0xee, 0x9c, 0x72, // magic
    // биты флагов: has_idx(0x80) | has_crc32c(0x40) | has_cache_bits(0x20) | flags | size
    // ставим только has_crc32c, размер индекса пишем в младшие 3 бита
    0x40 | refSize,
    offsetSize,
  ];

  const pushSized = (value: number, size: number) => {
    for (let i = size - 1; i >= 0; i--) header.push((value >> (i * 8)) & 0xff);
  };

  pushSized(cells.length, refSize); // cells_count
  pushSized(1, refSize);            // roots_count
  pushSized(0, refSize);            // absent
  pushSized(totalSize, offsetSize); // tot_cells_size
  pushSized(0, refSize);            // root_list: корень имеет индекс 0

  const body = new Uint8Array(totalSize);
  let cursor = 0;
  for (const chunk of serialized) {
    body.set(chunk, cursor);
    cursor += chunk.length;
  }

  const withoutCrc = new Uint8Array(header.length + body.length);
  withoutCrc.set(header, 0);
  withoutCrc.set(body, header.length);

  // has_crc32c=1 → в конец дописываем CRC32C (little-endian)
  const crc = crc32c(withoutCrc);
  const result = new Uint8Array(withoutCrc.length + 4);
  result.set(withoutCrc, 0);
  result[withoutCrc.length] = crc & 0xff;
  result[withoutCrc.length + 1] = (crc >>> 8) & 0xff;
  result[withoutCrc.length + 2] = (crc >>> 16) & 0xff;
  result[withoutCrc.length + 3] = (crc >>> 24) & 0xff;

  return result;
}

/* ------------------------------ утилиты ------------------------------ */

/** CRC-32C (Castagnoli), полином 0x1EDC6F41 в reflected-виде 0x82F63B78. */
const CRC32C_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let crc = i;
    for (let j = 0; j < 8; j++) {
      crc = crc & 1 ? (crc >>> 1) ^ 0x82f63b78 : crc >>> 1;
    }
    table[i] = crc >>> 0;
  }
  return table;
})();

function crc32c(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc = (crc >>> 8) ^ CRC32C_TABLE[(crc ^ byte) & 0xff]!;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/** Uint8Array → base64 (без Buffer, работает в браузере). */
function bocToBase64(data: Uint8Array): string {
  let binary = '';
  for (const byte of data) binary += String.fromCharCode(byte);
  return btoa(binary);
}
