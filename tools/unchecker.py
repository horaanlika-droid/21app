#!/usr/bin/env python3
"""Убирает «шахматку»/светлый фон с PNG: flood fill от границ + прозрачный альфа-канал.

python3 tools/unchecker.py in.png out.png [--tol 34]
Фон определяется «цветом границы» (самый частотный цвет на рамке, усреднённый);
пиксели, достижимые от границы с расстоянием <= tol — в прозрачность.
"""
import argparse
from collections import Counter, deque
from PIL import Image

Image.MAX_IMAGE_PIXELS = None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('src'); ap.add_argument('dst')
    ap.add_argument('--tol', type=int, default=34)
    args = ap.parse_args()

    im = Image.open(args.src).convert('RGB')
    w, h = im.size
    px = im.load()

    cnt = Counter()
    for x in range(w):
        cnt[px[x, 0]] += 1; cnt[px[x, h - 1]] += 1
    for y in range(h):
        cnt[px[0, y]] += 1; cnt[px[w - 1, y]] += 1
    # кластеры фона: 2 самых частотных цвета рамки (шахматка = 2 тона)
    tops = [c for c, _ in cnt.most_common(6)]
    bg_list = []
    for c in tops:
        if all(sum((a - b) ** 2 for a, b in zip(c, d)) > 40 * 40 for d in bg_list):
            bg_list.append(c)
        if len(bg_list) == 2:
            break
    t2 = args.tol * args.tol

    def is_bg(p):
        return min(sum((a - b) ** 2 for a, b in zip(p, c)) for c in bg_list) <= t2

    rgba = im.convert('RGBA')
    rp = rgba.load()
    seen = bytearray(w * h)
    q = deque()
    for x in range(w):
        for y in (0, h - 1):
            if not seen[y * w + x] and is_bg(px[x, y]):
                seen[y * w + x] = 1; q.append((x, y))
    for y in range(h):
        for x in (0, w - 1):
            if not seen[y * w + x] and is_bg(px[x, y]):
                seen[y * w + x] = 1; q.append((x, y))
    while q:
        x, y = q.popleft()
        rp[x, y] = (0, 0, 0, 0)
        for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
            if 0 <= nx < w and 0 <= ny < h and not seen[ny * w + nx] and is_bg(px[nx, ny]):
                seen[ny * w + nx] = 1
                q.append((nx, ny))
    rgba.save(args.dst, optimize=True)
    print('bg clusters:', bg_list, '| filled:', sum(seen), '/', w * h)


if __name__ == '__main__':
    main()
