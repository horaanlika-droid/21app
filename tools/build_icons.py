#!/usr/bin/env python3
"""Сборка иконок приложения из нарезанного атласа.

Читает out/tiles.json (из slice_atlas.py) + out/icons_map.json вида:
  { "logo.png":    {"tile": 0,   "size": 256},
    "ic_coin.png": {"tile": 30,  "size": 128, "pad": 0.04}, ... }
— tile: номер тайла из tiles.json; size: сторона выходного PNG;
— pad: дополнительный прозрачный отступ (доля от стороны).

Каждый тайл режется из ИСХОДНИКА атласа по box из tiles.json (без потерь от
промежуточных ресайзов), кадрируется в квадрат, ресайзится LANCZOS и пишется
в assets/<имя>.png (RGBA, optimize). Заодно складывает все тайлы в assets/atlas/.

Запуск: python3 tools/build_icons.py atlas.png out/
"""
import argparse, json, os
from PIL import Image

Image.MAX_IMAGE_PIXELS = None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('atlas'); ap.add_argument('out')
    ap.add_argument('--map', default=None, help='путь к icons_map.json (по умолчанию out/icons_map.json)')
    ap.add_argument('--atlas-dir', default=None, help='папка для полного набора тайлов (по умолчанию assets/atlas)')
    args = ap.parse_args()

    tiles = json.load(open(os.path.join(args.out, 'tiles.json')))
    boxes = {t['i']: t['box'] for t in tiles['tiles']}
    map_path = args.map or os.path.join(args.out, 'icons_map.json')
    mapping = json.load(open(map_path))

    im = Image.open(args.atlas).convert('RGBA')
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    assets = os.path.join(root, 'assets')
    adir = args.atlas_dir or os.path.join(assets, 'atlas')
    os.makedirs(adir, exist_ok=True)

    used = {}
    def tile_img(idx):
        if idx not in used:
            x0, y0, x1, y1 = boxes[idx]
            used[idx] = im.crop((x0, y0, x1, y1))
        return used[idx]

    for i in sorted(boxes):
        t = tile_img(i)
        side = max(t.size)
        sq = Image.new('RGBA', (side, side), (0, 0, 0, 0))
        sq.paste(t, ((side - t.width) // 2, (side - t.height) // 2), t)
        sq.thumbnail((256, 256), Image.LANCZOS)
        sq.save(os.path.join(adir, f'{i}.png'), optimize=True)

    for name, cfg in mapping.items():
        t = tile_img(cfg['tile'])
        size = int(cfg.get('size', 128))
        side = max(t.size)
        sq = Image.new('RGBA', (side, side), (0, 0, 0, 0))
        sq.paste(t, ((side - t.width) // 2, (side - t.height) // 2), t)
        if sq.size != (size, size):
            sq = sq.resize((size, size), Image.LANCZOS)
        pad = float(cfg.get('pad', 0))
        if pad > 0:
            inner = max(1, int(size / (1 + 2 * pad)))
            core = sq.resize((inner, inner), Image.LANCZOS)
            sq = Image.new('RGBA', (size, size), (0, 0, 0, 0))
            sq.paste(core, ((size - inner) // 2, (size - inner) // 2), core)
        sq.save(os.path.join(assets, name), optimize=True)
        print(f'{name:18s} <- {cfg["tile"]} @ {size}px ({os.path.getsize(os.path.join(assets, name))} B)')

    print('all tiles ->', adir)


if __name__ == '__main__':
    main()
