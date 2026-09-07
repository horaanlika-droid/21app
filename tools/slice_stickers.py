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

def main():
    src = sys.argv[1]; out = sys.argv[2]
    cols, rows = (int(sys.argv[3]), int(sys.argv[4])) if len(sys.argv) > 4 else (5, 3)
    os.makedirs(out, exist_ok=True)
    base = os.path.splitext(os.path.basename(src))[0]
    im = Image.open(src).convert('RGBA')
    w, h = im.size
    cw, ch = w // cols, h // rows
    made = []
    for r in range(rows):
        for c in range(cols):
            cell = im.crop((c*cw, r*ch, (c+1)*cw if c < cols-1 else w, (r+1)*ch if r < rows-1 else h))
            cell.load()
            flood_bg(cell, tol=30)
            cell = drop_islands(cell)
            bb = cell.getbbox()
            # bbox по альфе
            alpha = cell.split()[3].point(lambda a: 255 if a > 30 else 0)
            bb = alpha.getbbox()
            if not bb: continue
            pad = int(0.02 * max(bb[2]-bb[0], bb[3]-bb[1])) + 2
            box = (max(0, bb[0]-pad), max(0, bb[1]-pad), min(cell.width, bb[2]+pad), min(cell.height, bb[3]+pad))
            tile = cell.crop(box)
            side = max(tile.size)
            sq = Image.new('RGBA', (side, side), (0, 0, 0, 0))
            sq.paste(tile, ((side-tile.width)//2, (side-tile.height)//2), tile)
            name = f'{base}_r{r+1}c{c+1}.png'
            sq.save(os.path.join(out, name), optimize=True)
            made.append((name, sq.size))
    # contact sheet
    n = len(made)
    cc2 = 5; rr2 = (n+cc2-1)//cc2; cell = 190
    sheet = Image.new('RGB', (cc2*cell, rr2*cell), (238, 240, 244))
    from PIL import ImageDraw
    d = ImageDraw.Draw(sheet)
    for k, (name, _) in enumerate(made):
        t = Image.open(os.path.join(out, name)).convert('RGBA'); t.thumbnail((cell-22, cell-30), Image.LANCZOS)
        x, y = (k % cc2)*cell, (k//cc2)*cell
        sheet.paste(t, (x+11, y+8), t)
        d.text((x+4, y+cell-18), name.replace(base+'_', '').replace('.png', ''), fill=(60, 64, 72))
    sheet.save(os.path.join(out, 'contact.png'))
    print(f'{base}: {n} tiles -> {out}')

if __name__ == '__main__':
    main()
