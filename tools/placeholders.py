#!/usr/bin/env python3
"""Однотипные заглушки для всех иконок из icons_map.json (пока атлас не готов).
Запуск: python3 tools/placeholders.py   (из корня репо)"""
import json, os
from PIL import Image, ImageDraw, ImageFont
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
F = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
m = json.load(open(os.path.join(ROOT, 'tools/icons_map.json')))
for name, cfg in m.items():
    size = int(cfg.get('size', 96))
    im = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    r = max(3, int(size * 0.16)); bw = max(2, int(size * 0.025))
    d.rounded_rectangle([0, 0, size - 1, size - 1], radius=r, fill=(232, 235, 240, 255), outline=(176, 184, 198, 255), width=bw)
    label = '21' if name in ('logo.png', 'favicon.png') else name[:-4].split('_', 1)[-1].upper()
    fs = int(size * 0.22)
    while fs > 8:
        f = ImageFont.truetype(F, fs)
        if d.textlength(label, font=f) <= size - 2 * r - 6: break
        fs -= 1
    f = ImageFont.truetype(F, fs)
    bb = d.textbbox((0, 0), label, font=f)
    d.text(((size - bb[2] + bb[0]) / 2, (size - bb[3] + bb[1]) / 2 - bb[1]), label, font=f, fill=(90, 98, 112, 255))
    im.save(os.path.join(ROOT, 'assets', name), optimize=True)
print('stubs:', len(m))
