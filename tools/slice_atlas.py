#!/usr/bin/env python3
"""Нарезка PNG-атласа иконок на отдельные тайлы.

Атлас = PNG с прозрачным фоном; тайлы в случайных размерах, под каждым —
подпись текстом. Скрипт:
  1. строит маску контента по альфа-каналу (или по ключевому фону, если он непрозрачен);
  2. находит связные компоненты, склеивает соседние (детали иконки);
  3. отсекает текстовые подписи (обрывает блок по первой широкой пустой строке снизу);
  4. режет ровно по bounding box + паддинг, кадрирует в квадрат;
  5. пишет tiles/tileNNN.png + tiles.json + контрольный лист contacts.png
     с пронумерованными рамками (для визуальной проверки).

Запуск: python3 tools/slice_atlas.py atlas.png out/
"""
import argparse, json, os, sys
from collections import deque
from PIL import Image, ImageDraw

Image.MAX_IMAGE_PIXELS = None


def load_mask(im, fuzz):
    """Маска контента. Если альфа есть — alpha>16. Иначе — всё, что отличается от цвета рамки."""
    w, h = im.size
    rgba = im.convert('RGBA')
    px = rgba.load()
    a_min = min(px[x, y][3] for y in range(0, h, max(1, h // 400)) for x in range(0, w, max(1, w // 400)))
    if a_min < 200:  # фон прозрачный
        return [px[x, y][3] > 16 for y in range(h) for x in range(w)], w, h
    # непрозрачный фон: ключ по цвету угла (самому частотному на рамке)
    from collections import Counter
    cnt = Counter()
    for x in range(0, w, 3):
        cnt[px[x, 0][:3]] += 1; cnt[px[x, h - 1][:3]] += 1
    for y in range(0, h, 3):
        cnt[px[0, y][:3]] += 1; cnt[px[w - 1, y][:3]] += 1
    bg = cnt.most_common(1)[0][0]
    r2 = fuzz * fuzz
    return [sum((a - b) ** 2 for a, b in zip(px[x, y][:3], bg)) > r2 for y in range(h) for x in range(w)], w, h


def downsample(mask, w, h, f):
    dw, dh = w // f + (1 if w % f else 0), h // f + (1 if h % f else 0)
    small = [False] * (dw * dh)
    for y in range(h):
        row = y * w
        for x in range(w):
            if mask[row + x]:
                small[(y // f) * dw + x // f] = True
    return small, dw, dh


def components(small, dw, dh, diag=True):
    seen = [False] * (dw * dh)
    res = []
    nb = [(-1, -1), (0, -1), (1, -1), (-1, 0), (1, 0), (-1, 1), (0, 1), (1, 1)] if diag else [(0, -1), (-1, 0), (1, 0), (0, 1)]
    for i in range(dw * dh):
        if not small[i] or seen[i]:
            continue
        seen[i] = True
        q = deque([(i % dw, i // dw)])
        x0 = x1 = i % dw; y0 = y1 = i // dw; area = 0
        while q:
            x, y = q.popleft(); area += 1
            x0 = min(x0, x); x1 = max(x1, x); y0 = min(y0, y); y1 = max(y1, y)
            for dx, dy in nb:
                nx, ny = x + dx, y + dy
                if 0 <= nx < dw and 0 <= ny < dh and not seen[ny * dw + nx] and small[ny * dw + nx]:
                    seen[ny * dw + nx] = True
                    q.append((nx, ny))
        res.append([x0, y0, x1 + 1, y1 + 1, area])
    return res


def boxes_overlap(a, b, grow):
    return (a[0] - grow < b[2] and b[0] - grow < a[2] and
            a[1] - grow < b[3] and b[1] - grow < a[3])


def merge(boxes, grow):
    merged = True
    while merged:
        merged = False
        out = []
        for b in boxes:
            hit = None
            for o in out:
                if boxes_overlap(b, o, grow):
                    hit = o; break
            if hit:
                hit[0] = min(hit[0], b[0]); hit[1] = min(hit[1], b[1])
                hit[2] = max(hit[2], b[2]); hit[3] = max(hit[3], b[3])
                hit[4] += b[4]
                merged = True
            else:
                out.append(list(b))
        boxes = out
    return boxes


def longest_run(row):
    best = cur = 0
    for v in row:
        if v:
            cur += 1
            best = max(best, cur)
        else:
            cur = 0
    return best


def tight_box(mask, w, box):
    """Точный bounding box контента внутри рамок box=[x0,y0,x1,y1]."""
    x0, y0, x1, y1 = box
    x = x0
    while x < x1 and not any(mask[y * w + x] for y in range(y0, y1)):
        x += 1
    nx0 = x
    x = x1 - 1
    while x > nx0 and not any(mask[y * w + x] for y in range(y0, y1)):
        x -= 1
    nx1 = x + 1
    y = y0
    while y < y1 and not any(mask[y * w + x] for x in range(nx0, nx1)):
        y += 1
    ny0 = y
    y = y1 - 1
    while y > ny0 and not any(mask[y * w + x] for x in range(nx0, nx1)):
        y -= 1
    return [nx0, ny0, nx1, y + 1]


def trim_to_icon(mask, w, h, box, gap_min):
    """Снизу вверх режет блок на «полосы контента», отделённые пустыми строками.
    Полоса — подпись, если: над ней пустой зазор >= gap_min, она низкая и разреженная.
    Так тонкие «ножки/ручки» иконок (без зазора или плотные) не отрезаются."""
    x0, y0, x1, y1 = box[:4]
    y = y1 - 1
    cut = y1
    while y > y0 + int(0.10 * (y1 - y0)):
        # пустые строки над потенциальной подписью
        g = 0
        while y >= y0 and not any(mask[y * w + x0: y * w + x1]):
            g += 1; y -= 1
        if g < gap_min:
            break
        # сама полоса
        b0 = y
        while y > y0:
            if not any(mask[y * w + x0: y * w + x1]):
                break
            y -= 1
        b1 = y + 1
        band_h = b0 - b1 + 1
        if band_h > 0.32 * (y1 - y0):
            break
        filled = sum(1 for yy in range(b1, b0 + 1) for xx in range(x0, x1) if mask[yy * w + xx])
        if filled > 0.30 * (x1 - x0) * band_h:
            break
        cut = b1
        y = b1 - 1
    box = tight_box(mask, w, [x0, y0, x1, cut])
    if box[3] - box[1] < 0.45 * (y1 - y0) or box[2] - box[0] < 0.35 * (x1 - x0):
        return None  # обрезка съела почти весь блок — считаем блок мусором
    return box


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('atlas'); ap.add_argument('outdir')
    ap.add_argument('--fuzz', type=int, default=40, help='допуск цвета фона (для непрозрачных атласов)')
    ap.add_argument('--scale', type=int, default=2, help='даунсэмпл при разметке (2=быстро/точно, 4=ещё быстрее)')
    ap.add_argument('--grow', type=float, default=0.010, help='радиус склейки компонентов (доля ширины)')
    ap.add_argument('--minh', type=float, default=0.035, help='мин. высота тайла (доля высоты атласа)')
    ap.add_argument('--gapmin', type=int, default=5, help='пустой зазор (px) между иконкой и подписью для отсечки')
    ap.add_argument('--pad', type=float, default=0.012, help='внешний отступ тайла (доля высоты)')
    ap.add_argument('--max-tiles', type=int, default=80)
    args = ap.parse_args()

    im = Image.open(args.atlas)
    w, h = im.size
    mask, w2, h2 = load_mask(im, args.fuzz)
    small, dw, dh = downsample(mask, w, h, args.scale)
    comps = components(small, dw, dh)
    grow = int(args.grow * w)
    boxes = []
    for x0, y0, x1, y1, area in comps:
        X0, Y0, X1, Y1 = x0 * args.scale, y0 * args.scale, x1 * args.scale, y1 * args.scale
        th_, tw_ = Y1 - Y0, X1 - X0
        if th_ >= args.minh * h and tw_ >= 0.02 * w and th_ / tw_ > 0.18:  # широкое низкое = текст/заголовок
            boxes.append([X0, Y0, X1, Y1, area])
    boxes = merge(boxes, grow)
    tiles = []
    for b in boxes:
        bb = trim_to_icon(mask, w, h, b, args.gapmin)
        if bb is None:
            continue
        x0, y0, x1, y1 = bb
        if (y1 - y0) < args.minh * h * 0.6 or (x1 - x0) < 0.015 * w:
            continue
        pad = int(args.pad * min(y1 - y0, x1 - x0))
        tiles.append([max(0, x0 - pad), max(0, y0 - pad), min(w, x1 + pad), min(h, y1 + pad)])
    # квадрат + сортировка по рядам
    out = []
    for x0, y0, x1, y1 in tiles:
        cw, ch = x1 - x0, y1 - y0
        side = max(cw, ch)
        cx, cy = (x0 + x1) // 2, (y0 + y1) // 2
        X0, Y0 = max(0, cx - side // 2), max(0, cy - side // 2)
        X1, Y1 = min(w, X0 + side), min(h, Y0 + side)
        out.append([X0, Y0, X1, Y1])
    out.sort(key=lambda b: (b[1] // (h // 12), b[0]))

    tdir = os.path.join(args.outdir, 'tiles')
    os.makedirs(tdir, exist_ok=True)
    if len(out) > args.max_tiles:
        print(f'!! найдено {len(out)} тайлов (>--max-tiles) — увеличь --minh или почини атлас', file=sys.stderr)
    json.dump({'image': os.path.basename(args.atlas), 'size': [w, h],
                'tiles': [{'i': i, 'box': b} for i, b in enumerate(out)]},
               open(os.path.join(args.outdir, 'tiles.json'), 'w'), indent=1)
    for i, b in enumerate(out):
        im.convert('RGBA').crop(b).save(os.path.join(tdir, f'tile{i:03d}.png'))

    # контрольный лист
    n = len(out)
    cols = min(6, max(2, int(n ** 0.5)))
    rows = (n + cols - 1) // cols
    th = 168
    cs = Image.new('RGBA', (cols * (th + 8), rows * (th + 30)), (245, 245, 245, 255))
    d = ImageDraw.Draw(cs)
    for i, b in enumerate(out):
        t = Image.open(os.path.join(tdir, f'tile{i:03d}.png')).convert('RGBA')
        t.thumbnail((th, th), Image.LANCZOS)
        cellx, celly = (i % cols) * (th + 8), (i // cols) * (th + 30)
        bg = Image.new('RGBA', (th, th), (255, 255, 255, 255))
        bg.alpha_composite(t, ((th - t.width) // 2, (th - t.height) // 2))
        cs.paste(bg, (cellx + 4, celly + 22))
        d.rectangle([cellx + 4, celly + 22, cellx + th + 3, celly + th + 21], outline=(200, 0, 0, 255))
        d.text((cellx + 8, celly + 6), f'#{i}', fill=(0, 0, 0, 255))
    cs.convert('RGB').save(os.path.join(args.outdir, 'contacts.png'))
    print(f'ok: {n} тайлов → {tdir}; контакты: {args.outdir}/contacts.png')


if __name__ == '__main__':
    main()
