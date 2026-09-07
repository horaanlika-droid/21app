#!/usr/bin/env python3
"""Нарезка листов стикеров (5x3 или any N×M) с ANY фоном: клетка-прозрачность,
белый, кремовый. Для каждой ячейки: flood-fill светлого/нейтрального фона от
краёв ячейки, кадрирование по bbox контента + паддинг, запись RGBA PNG.

Запуск: python3 tools/slice_stickers.py лист.png папка_вывода [cols rows]
Файлы: <папка>/<листимя>_r<row>c<col>.png  + contact.png для проверки."""
import os, sys
from PIL import Image

def flood_bg(im, tol):
    """Прозрачность пикселям фона, достижимым от края (фон = близко к любому
    из цветов, встретившихся на рамке)."""
    w, h = im.size
    px = im.load()
    border = []
    for x in range(0, w, 7): border += [px[x, 0], px[x, h-1]]
    for y in range(0, h, 7): border += [px[0, y], px[w-1, y]]
    def nearbg(c):
        if c[3] < 40: return True  # уже прозрачно
        if max(c[0], c[1], c[2]) - min(c[0], c[1], c[2]) > 30: return False
        if c[0] < 140: return False
        return True
    seen = bytearray(w * h)
    stack = []
    for x in range(w):
        for y in (0, h-1):
            if nearbg(px[x, y]): stack.append((x, y)); seen[y*w+x] = 1
    for y in range(h):
        for x in (0, w-1):
            k = y*w+x
            if not seen[k] and nearbg(px[x, y]): stack.append((x, y)); seen[k] = 1
    while stack:
        x, y = stack.pop()
        c = px[x, y]
        a = c[3]
        px[x, y] = (c[0], c[1], c[2], 0 if nearbg(c) else a)
        for nx, ny in ((x+1,y),(x-1,y),(x,y+1),(x,y-1)):
            if 0 <= nx < w and 0 <= ny < h and not seen[ny*w+nx]:
                seen[ny*w+nx] = 1
                cc = px[nx, ny]
                if nearbg(cc): stack.append((nx, ny))

def drop_islands(im, maxdim=26, min_dim=8):
    """Мелкие изолированные острова (блески, точки) не удаляем — это часть
    стикера. Но крошечный мусор < 8px убираем."""
    w, h = im.size; px = im.load()
    seen = bytearray(w*h); comps = []
    for i in range(w*h):
        if not seen[i] and px[i % w, i // w][3] > 30:
            sx, sy = i % w, i // w
            stack = [(sx, sy)]; seen[i] = 1; comp = []
            minx = maxx = sx; miny = maxy = sy
            while stack:
                x, y = stack.pop(); comp.append((x, y))
                minx = min(minx, x); maxx = max(maxx, x); miny = min(miny, y); maxy = max(maxy, y)
                for nx, ny in ((x+1,y),(x-1,y),(x,y+1),(x,y-1)):
                    k = ny*w+nx
                    if 0 <= nx < w and 0 <= ny < h and not seen[k] and px[nx, ny][3] > 30:
                        seen[k] = 1; stack.append((nx, ny))
            comps.append((comp, minx, miny, maxx, maxy))
    for comp, a, b, c, d in comps:
        if len(comp) < 40 and max(c-a, d-b) < min_dim:
            for x, y in comp:
                p = px[x, y]; px[x, y] = (p[0], p[1], p[2], 0)
    return im


def content_mask(im):
    """255 где контент (не светлый фон и не прозрачно)."""
    w, h = im.size
    r, g, b, a = im.split()
    rp, gp, bp, ap = r.load(), g.load(), b.load(), a.load()
    m = Image.new('L', (w, h), 0)
    mp = m.load()
    for y in range(h):
        for x in range(w):
            R, G, B, A = rp[x, y], gp[x, y], bp[x, y], ap[x, y]
            if A < 60: continue
            mx = R if R > G else G; mx = B if B > mx else mx
            mn = R if R < G else G; mn = B if B < mn else mn
            if mx < 140 or mx - mn > 28: mp[x, y] = 255
    return m

def proj_segments(mask):
    """Полосы контента по проекциям."""
    w, h = mask.size
    mp = mask.load()
    rowsum = [0] * h; colsum = [0] * w
    for y in range(h):
        rs = 0
        for x in range(w):
            if mp[x, y]: rs += 1; colsum[x] += 1
        rowsum[y] = rs
    def bands(line):
        out = []; st = None
        for i, c in enumerate(line):
            if c > 3:
                if st is None: st = i
            else:
                if st is not None and i - st >= 40: out.append((st, i))
                st = None
        if st is not None and len(line) - st >= 40: out.append((st, len(line)))
        return out
    return bands(rowsum), bands(colsum)

def auto_slice(im, cols=5, rows_n=3):
    """Сетка cols×rows, границы «прилипают» к минимумам проекции контента."""
    m = content_mask(im)
    w, h = im.size
    mp = m.load()
    colsum = [0] * w; rowsum = [0] * h
    for y in range(h):
        rs = 0
        for x in range(w):
            if mp[x, y]: rs += 1; colsum[x] += 1
        rowsum[y] = rs
    def bounds(total, sums, n):
        ideal = total / n
        cuts = [0]
        for k in range(1, n):
            c = int(ideal * k)
            lo = max(cuts[-1] + 60, c - int(ideal * 0.22)); hi = min(total - 60, c + int(ideal * 0.22))
            best = min(range(lo, max(hi, lo + 1)), key=lambda i: sums[i])
            cuts.append(best)
        cuts.append(total)
        return list(zip(cuts[:-1], cuts[1:]))
    return [(c0, r0, c1, r1) for (r0, r1) in bounds(h, rowsum, rows_n) for (c0, c1) in bounds(w, colsum, cols)], None



def clean_strips(cell, t_frac=0.60, cap=14, min_gap=2):
    """Срезает у края тайла первую непрерывную полосу контента (<=cap строк),
    если за ней идёт пустой зазор (>=min_gap строк) и дальше контент плотный.
    Это обрезанные ноги/осколки соседнего ряда. Сплошной шлем (без зазора) не
    трогает, длинные объекты (солнце, флаг) — не трогает."""
    ap = cell.load(); w, h = cell.size
    rc = []
    for y in range(h):
        c = 0
        for x in range(0, w, 2):
            if ap[x, y][3] > 40: c += 1
        rc.append(c)
    peak = max(rc) or 1
    T = max(3, peak * t_frac)
    cuts = []
    # сверху
    i = 0
    while i < h and rc[i] == 0: i += 1
    j = i
    while j < h and rc[j] > 0: j += 1
    if i < j and (j - i) <= cap:
        k = j
        while k < h and rc[k] == 0: k += 1
        if k - j >= min_gap and k < h and max(rc[k:]) > T:
            cuts.append((0, j))
    # снизу
    i2 = h - 1
    while i2 >= 0 and rc[i2] == 0: i2 -= 1
    j2 = i2
    while j2 >= 0 and rc[j2] > 0: j2 -= 1
    if j2 < i2 and (i2 - j2) <= cap:
        k2 = j2
        while k2 >= 0 and rc[k2] == 0: k2 -= 1
        if j2 - k2 >= min_gap and k2 >= 0 and max(rc[:k2 + 1]) > T:
            cuts.append((j2 + 1, h))
    for a_, b_ in cuts:
        for yy in range(a_, b_):
            for x in range(w):
                r, g, b, a = ap[x, yy]
                ap[x, yy] = (r, g, b, 0)


def crop_tile(orig, box, alpha_full):
    pad = 10
    x0 = max(0, box[0] - pad); y0 = max(0, box[1] - pad)
    x1 = min(orig.width, box[2] + pad); y1 = min(orig.height, box[3] + pad)
    cell = orig.crop((x0, y0, x1, y1)).copy()
    flood_bg(cell, 30)
    clean_strips(cell)
    a = cell.split()[3].point(lambda v: 255 if v > 30 else 0)
    bb = a.getbbox()
    if not bb: return None
    cell = cell.crop(bb)
    side = max(cell.size) + 4
    sq = Image.new('RGBA', (side, side), (0, 0, 0, 0))
    sq.paste(cell, ((side - cell.width) // 2, (side - cell.height) // 2), cell)
    return sq

def main():
    src = sys.argv[1]; out = sys.argv[2]
    grid = None
    if len(sys.argv) > 4: grid = (int(sys.argv[3]), int(sys.argv[4]))
    os.makedirs(out, exist_ok=True)
    base = os.path.splitext(os.path.basename(src))[0]
    im = Image.open(src).convert('RGBA')
    made = []
    if grid:
        cols, rows = grid
        w, h = im.size
        cw, ch = w // cols, h // rows
        for r in range(rows):
            for c in range(cols):
                cell = im.crop((c*cw, r*ch, (c+1)*cw if c < cols-1 else w, (r+1)*ch if r < rows-1 else h))
                cell.load(); flood_bg(cell, 30)
                bb = cell.split()[3].point(lambda a: 255 if a > 30 else 0).getbbox()
                if not bb: continue
                pad = 4
                box = (max(0, bb[0]-pad), max(0, bb[1]-pad), min(cell.width, bb[2]+pad), min(cell.height, bb[3]+pad))
                t = cell.crop(box); side = max(t.size)
                sq = Image.new('RGBA', (side, side), (0, 0, 0, 0))
                sq.paste(t, ((side-t.width)//2, (side-t.height)//2), t)
                name = f'{base}_r{r+1}c{c+1}.png'
                sq.save(os.path.join(out, name), optimize=True); made.append((name, sq))
    else:
        # авто-режим: сегментация по проекциям
        tiles, _ = auto_slice(im)
        tiles = [t for t in tiles if t]
        idx = 0
        for k, box in enumerate(tiles):
            sq = crop_tile(im, box, None)
            if sq is None: continue
            idx += 1
            r = k // 5; c = k % 5
            name = f'{base}_r{r+1}c{c+1}.png'
            sq.save(os.path.join(out, name), optimize=True); made.append((name, sq))
    # contact
    n = len(made); cc2 = 5; rr2 = (n + cc2 - 1) // cc2; cell = 190
    from PIL import ImageDraw
    sheet = Image.new('RGB', (cc2 * cell, max(1, rr2) * cell), (238, 240, 244))
    d = ImageDraw.Draw(sheet)
    for k, (name, t) in enumerate(made):
        tt = t.copy(); tt.thumbnail((cell - 22, cell - 30), Image.LANCZOS)
        x, y = (k % cc2) * cell, (k // cc2) * cell
        sheet.paste(tt, (x + 11, y + 8), tt)
        d.text((x + 4, y + cell - 18), name.replace(base + '_', '').replace('.png', ''), fill=(60, 64, 72))
    sheet.save(os.path.join(out, 'contact.png'))
    print(f'{base}: {n} tiles -> {out}')

if __name__ == '__main__':
    main()
