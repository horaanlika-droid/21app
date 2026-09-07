#!/usr/bin/env python3
"""Кроп атласа по явным seed-боксам (имена → прямоугольники в координатах атласа).

Для каждого сид-бокса: вырезка из RGBA-атласа → авто-обрезка по альфа-bbox →
квадрат + паддинг → out/tiles/<slug>.png, tiles.json (по боксам ДО ресайза —
build_icons режет из оригинала), contacts.png для приёмки.

Запуск: python3 tools/crop_atlas.py atlas.png seeds.json out/
"""
import argparse, json, os
from PIL import Image, ImageDraw

Image.MAX_IMAGE_PIXELS = None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('atlas'); ap.add_argument('seeds'); ap.add_argument('out')
    ap.add_argument('--pad', type=float, default=0.02)
    ap.add_argument('--cell', type=int, default=168)
    args = ap.parse_args()

    im = Image.open(args.atlas).convert('RGBA')
    W, H = im.size
    seeds = json.load(open(args.seeds))
    os.makedirs(os.path.join(args.out, 'tiles'), exist_ok=True)
    out, boxes = [], {}

    def clamp(v, a, b): return max(a, min(b, v))

    def drop_grid(t):
        """Флуд-филл «карточки» атласа: near-grid-серые пиксели, связанные с
        границей сид-бокса, становятся прозрачными (внутренний арт цел)."""
        from collections import deque
        w, h = t.size
        data = list(t.getdata())
        def neargrid(c): return 150 <= c[0] <= 250 and max(c[0],c[1],c[2]) - min(c[0],c[1],c[2]) <= 14 and c[3] > 0
        seen = bytearray(w * h)
        q = deque()
        def push(i):
            if not seen[i] and neargrid(data[i]):
                seen[i] = 1; q.append(i)
        for x in range(w): push(x); push((h - 1) * w + x)
        for y in range(h): push(y * w); push(y * w + w - 1)
        while q:
            i = q.popleft(); x, y = i % w, i // w
            if x: push(i - 1)
            if x < w - 1: push(i + 1)
            if y: push(i - w)
            if y < h - 1: push(i + w)
        if 1 in seen:
            out = list(data)
            for i, f in enumerate(seen):
                if f: out[i] = (0, 0, 0, 0)
            t2 = t.copy(); t2.putdata(out); return t2
        return t

    def drop_specks(t, maxpx=24, maxdim=10):
        """Убирает мусор: связные компоненты <= maxpx пикселей и габаритом <= maxdim
        (самая крупная компонента защищена)."""
        from collections import deque
        w, h = t.size
        data = list(t.getdata())
        def solid(c): return c[3] > 20
        lab = [-1] * (w * h); comps = []
        for i0 in range(w * h):
            if not solid(data[i0]) or lab[i0] >= 0: continue
            q = deque([i0]); lab[i0] = len(comps); pix = []
            while q:
                i = q.popleft(); pix.append(i); x, y = i % w, i // w
                for j in ((i - 1) if x else -1, (i + 1) if x < w - 1 else -1, (i - w) if y else -1, (i + w) if y < h - 1 else -1):
                    if 0 <= j < w * h and lab[j] < 0 and solid(data[j]):
                        lab[j] = lab[i0]; q.append(j)
            comps.append(pix)
        if len(comps) < 2: return t
        keep_max = max(range(len(comps)), key=lambda k: len(comps[k]))
        out = list(data); dirty = False
        for k, pix in enumerate(comps):
            if k == keep_max: continue
            xs = [p % w for p in pix]; ys = [p // w for p in pix]
            if len(pix) <= maxpx and max(xs) - min(xs) <= maxdim and max(ys) - min(ys) <= maxdim:
                for p in pix: out[p] = (0, 0, 0, 0)
                dirty = True
        if dirty:
            t2 = t.copy(); t2.putdata(out); return t2
        return t

    for slug, (x0, y0, x1, y1) in seeds.items():
        x0, y0 = clamp(x0, 0, W - 1), clamp(y0, 0, H - 1)
        x1, y1 = clamp(x1, x0 + 4, W), clamp(y1, y0 + 4, H)
        c = im.crop((x0, y0, x1, y1))
        c = drop_grid(c)
        c = drop_specks(c)
        bbox = c.getbbox()
        if not bbox:
            print(f'!! {slug}: пусто в боксе, пропуск'); continue
        c = c.crop(bbox)
        gx0, gy0 = x0 + bbox[0], y0 + bbox[1]
        pad = max(2, int(args.pad * max(c.size)))
        side = max(c.size) + 2 * pad
        sq = Image.new('RGBA', (side, side), (0, 0, 0, 0))
        sq.paste(c, (pad + (side - 2 * pad - c.width) // 2, pad + (side - 2 * pad - c.height) // 2), c)
        c = sq
        gx0 -= pad; gy0 -= pad
        gx1, gy1 = gx0 + c.width, gy0 + c.height
        out.append({'slug': slug, 'art': [c.width, c.height]})
        boxes[slug] = [clamp(gx0, 0, W), clamp(gy0, 0, H), clamp(gx1, 0, W), clamp(gy1, 0, H)]
        c.save(os.path.join(args.out, 'tiles', f'{slug}.png'), optimize=True)

    # tiles.json в формате build_icons.py: {"tiles":[{"i":slug,"box":[...]}]}
    json.dump({'image': os.path.basename(args.atlas), 'size': [W, H],
               'tiles': [{'i': s, 'box': boxes[s]} for s in boxes]},
              open(os.path.join(args.out, 'tiles.json'), 'w'), indent=1)

    # приёмочный лист: тайл + подпись имени
    n = len(out)
    cols = 8
    rows = (n + cols - 1) // cols
    cell = args.cell
    cs = Image.new('RGBA', (cols * (cell + 8), rows * (cell + 26)), (240, 240, 240, 255))
    d = ImageDraw.Draw(cs)
    for k, o in enumerate(out):
        t = Image.open(os.path.join(args.out, 'tiles', f"{o['slug']}.png"))
        t.thumbnail((cell, cell), Image.LANCZOS)
        cx, cy = (k % cols) * (cell + 8), (k // cols) * (cell + 26)
        # белый фон, чтобы видеть края и просветы
        bg = Image.new('RGBA', (cell, cell), (255, 255, 255, 255))
        bg.alpha_composite(t, ((cell - t.width) // 2, (cell - t.height) // 2))
        cs.paste(bg, (cx + 4, cy + 22))
        d.rectangle([cx + 4, cy + 22, cx + cell + 3, cy + cell + 21], outline=(210, 0, 0, 255))
        d.text((cx + 6, cy + 6), o['slug'], fill=(0, 0, 0, 255))
    cs.convert('RGB').save(os.path.join(args.out, 'contacts.png'))
    print(f'ok: {len(out)} тайлов; контакты: {args.out}/contacts.png')


if __name__ == '__main__':
    main()
