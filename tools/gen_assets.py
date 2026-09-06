#!/usr/bin/env python3
"""Генератор пиксель-арт заглушек для «21 — городская ОС».
Палитра: белый фон, чёрный + серые + акцент #d4a373.
Запуск: python3 tools/gen_assets.py  (из корня репо)
"""
import math, os
from PIL import Image

OUT = os.path.join(os.path.dirname(__file__), '..', 'assets')
os.makedirs(OUT, exist_ok=True)

PALETTE = {
    '.': None,
    'K': (0, 0, 0),
    'k': (51, 51, 51),
    'm': (102, 102, 102),
    'g': (153, 153, 153),
    's': (204, 204, 204),
    'S': (230, 230, 230),
    'w': (255, 255, 255),
    'A': (212, 163, 115),   # #d4a373
    'D': (168, 124, 79),    # тёмный оттенок акцента
    'T': (119, 119, 119),   # тонируемый (перекрашивается в рантайме)
}
A = (212, 163, 115)
D = (168, 124, 79)
TINT = (119, 119, 119)

def from_map(rows, scale=1):
    w = len(rows[0])
    assert all(len(r) == w for r in rows), f'bad rows: {w} vs {[len(r) for r in rows]}'
    h = len(rows)
    im = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    px = im.load()
    for y, row in enumerate(rows):
        for x, ch in enumerate(row):
            c = PALETTE.get(ch)
            if c:
                px[x, y] = c + (255,)
    if scale > 1:
        im = im.resize((w * scale, h * scale), Image.NEAREST)
    return im

def save(name, im):
    p = os.path.join(OUT, name)
    im.save(p)
    print(f'  {name:24s} {im.size[0]}x{im.size[1]}')

def blank(w, h):
    return Image.new('RGBA', (w, h), (0, 0, 0, 0))

def rect(im, x, y, w, h, c):
    px = im.load()
    for j in range(y, y + h):
        for i in range(x, x + w):
            if 0 <= i < im.width and 0 <= j < im.height:
                px[i, j] = c + (255,)

def ring_circ(im, cx, cy, r_out, r_in, c):
    px = im.load()
    for y in range(im.height):
        for x in range(im.width):
            d = math.hypot(x - cx, y - cy)
            if r_in <= d <= r_out:
                px[x, y] = c + (255,)

def fill_circ(im, cx, cy, r, c):
    px = im.load()
    for y in range(im.height):
        for x in range(im.width):
            if math.hypot(x - cx, y - cy) <= r:
                px[x, y] = c + (255,)

# ---------------------------------------------------------------- иконки 16x16
def ic_map():
    im = blank(16, 16)
    rect(im, 1, 2, 13, 12, (204, 204, 204))
    rect(im, 1, 2, 13, 1, (0, 0, 0)); rect(im, 1, 13, 13, 1, (0, 0, 0))
    rect(im, 1, 2, 1, 12, (0, 0, 0)); rect(im, 13, 2, 1, 12, (0, 0, 0))
    rect(im, 5, 3, 1, 10, (153, 153, 153)); rect(im, 10, 3, 1, 10, (153, 153, 153))
    # пин
    rect(im, 7, 4, 3, 1, (0, 0, 0))
    rect(im, 6, 5, 5, 3, (0, 0, 0))
    rect(im, 7, 5, 3, 3, A); rect(im, 8, 6, 1, 1, (255, 255, 255))
    rect(im, 7, 8, 3, 1, (0, 0, 0)); rect(im, 8, 8, 1, 1, A)
    rect(im, 8, 9, 1, 1, (0, 0, 0))
    return im

def ic_quest():
    im = blank(16, 16)
    rect(im, 2, 1, 9, 2, (51, 51, 51))
    rect(im, 2, 2, 9, 1, (102, 102, 102))
    rect(im, 3, 3, 7, 8, (255, 255, 255))
    rect(im, 2, 3, 1, 8, (0, 0, 0)); rect(im, 10, 3, 1, 8, (0, 0, 0))
    rect(im, 2, 3, 9, 1, (0, 0, 0))
    for y in (5, 7): rect(im, 4, y, 5, 1, (153, 153, 153))
    rect(im, 4, 9, 2, 2, A)
    rect(im, 2, 11, 9, 2, (51, 51, 51))
    rect(im, 2, 11, 9, 1, (102, 102, 102))
    return im

def ic_user():
    im = blank(16, 16)
    fill_circ(im, 7.5, 5.5, 3.6, (255, 255, 255))
    ring_circ(im, 7.5, 5.5, 4.6, 3.4, (0, 0, 0))
    rect(im, 5, 5, 1, 1, (0, 0, 0)); rect(im, 9, 5, 1, 1, (0, 0, 0))
    rect(im, 7, 7, 2, 1, (102, 102, 102))
    rect(im, 3, 11, 9, 3, (0, 0, 0))
    rect(im, 4, 11, 7, 3, A)
    rect(im, 7, 11, 1, 3, D)
    return im

def ic_book():
    im = blank(16, 16)
    rect(im, 2, 3, 12, 9, (255, 255, 255))
    rect(im, 2, 3, 12, 1, (0, 0, 0)); rect(im, 2, 11, 12, 1, (0, 0, 0))
    rect(im, 2, 3, 1, 9, (0, 0, 0)); rect(im, 13, 3, 1, 9, (0, 0, 0))
    rect(im, 7, 3, 1, 9, (0, 0, 0))
    rect(im, 8, 4, 4, 1, (153, 153, 153))
    rect(im, 8, 6, 4, 1, (153, 153, 153))
    rect(im, 8, 8, 3, 1, (153, 153, 153))
    rect(im, 3, 5, 3, 1, A); rect(im, 3, 7, 3, 1, (153, 153, 153))
    return im

def ic_wallet():
    im = blank(16, 16)
    rect(im, 1, 4, 13, 8, (0, 0, 0))
    rect(im, 2, 5, 11, 6, (230, 230, 230))
    rect(im, 10, 5, 3, 6, (204, 204, 204))
    rect(im, 12, 7, 2, 2, A)
    rect(im, 4, 7, 1, 2, (153, 153, 153))
    rect(im, 6, 7, 1, 2, (153, 153, 153))
    return im

def ic_court():
    im = blank(16, 16)
    rect(im, 7, 1, 2, 2, A)
    rect(im, 7, 3, 2, 10, (0, 0, 0))
    rect(im, 2, 4, 12, 1, (0, 0, 0))
    rect(im, 2, 5, 1, 2, (0, 0, 0)); rect(im, 12, 5, 1, 2, (0, 0, 0))
    for (bx) in (2, 12):
        rect(im, bx - 2, 7, 5, 1, (0, 0, 0))
        rect(im, bx - 1, 8, 3, 1, (0, 0, 0))
    rect(im, 5, 13, 6, 1, (0, 0, 0)); rect(im, 6, 12, 4, 1, (102, 102, 102))
    return im

def ic_admin():
    im = blank(16, 16)
    cx = cy = 7.5
    px = im.load()
    for a in range(8):
        ang = a * math.pi / 4 + math.pi / 8
        tx = round(cx + 5.4 * math.cos(ang)); ty = round(cy + 5.4 * math.sin(ang))
        for dx in (-1, 0):
            for dy in (-1, 0):
                if 0 <= tx + dx < 16 and 0 <= ty + dy < 16:
                    px[tx + dx, ty + dy] = (0, 0, 0, 255)
    for y in range(16):
        for x in range(16):
            d = math.hypot(x - cx, y - cy)
            if 2.4 <= d <= 4.4: px[x, y] = (153, 153, 153, 255)
            elif 1.2 <= d < 2.4: px[x, y] = (255, 255, 255, 255)
    return im

def ic_char():
    im = blank(16, 16)
    fill_circ(im, 7.5, 6.5, 3.6, (255, 255, 255))
    ring_circ(im, 7.5, 6.5, 4.6, 3.4, (0, 0, 0))
    rect(im, 5, 6, 1, 1, (0, 0, 0)); rect(im, 9, 6, 1, 1, (0, 0, 0))
    rect(im, 7, 8, 2, 1, (102, 102, 102))
    rect(im, 3, 12, 9, 2, (0, 0, 0)); rect(im, 4, 12, 7, 2, A)
    # искры
    rect(im, 12, 1, 2, 2, A); rect(im, 13, 4, 1, 1, A); rect(im, 1, 3, 1, 1, A); rect(im, 3, 0, 1, 1, A)
    return im

def ic_qr():
    im = blank(16, 16)
    for (x0, y0) in ((2, 2), (10, 2), (2, 10)):
        rect(im, x0, y0, 4, 4, (0, 0, 0))
        rect(im, x0 + 1, y0 + 1, 2, 2, (255, 255, 255))
        rect(im, x0 + 1, y0 + 1, 1, 1, (0, 0, 0))
    pts = [(8, 3), (9, 5), (11, 6), (13, 8), (7, 8), (9, 9), (12, 11), (10, 13), (13, 13), (7, 11), (6, 13), (14, 4), (8, 6)]
    for (x, y) in pts:
        rect(im, x, y, 1, 1, (0, 0, 0))
    rect(im, 12, 12, 2, 2, A)
    return im

def ic_feed():
    im = blank(16, 16)
    rect(im, 1, 2, 13, 11, (0, 0, 0))
    rect(im, 2, 3, 11, 9, (255, 255, 255))
    rect(im, 3, 4, 5, 4, (153, 153, 153))
    rect(im, 9, 4, 3, 1, A)
    for y in (5, 6, 7): rect(im, 9, y, 3, 1, (204, 204, 204))
    for y in (9, 10): rect(im, 3, y, 9, 1, (153, 153, 153))
    rect(im, 3, 11, 6, 1, (204, 204, 204))
    return im

def ic_pc():
    im = blank(16, 16)
    rect(im, 1, 2, 13, 9, (0, 0, 0))
    rect(im, 2, 3, 11, 7, (230, 230, 230))
    rect(im, 3, 4, 9, 5, (204, 204, 204))
    rect(im, 4, 5, 4, 3, A)
    rect(im, 10, 4, 1, 1, A)
    rect(im, 6, 11, 4, 2, (102, 102, 102))
    rect(im, 4, 13, 8, 1, (0, 0, 0))
    return im

def ic_power():
    im = blank(16, 16)
    ring_circ(im, 7.5, 8.5, 5.6, 4.4, (0, 0, 0))
    rect(im, 7, 1, 2, 5, A)
    ring_circ(im, 7.5, 8.5, 4.4, 4.4, (0, 0, 0))
    for y in range(16):
        for x in range(16):
            d = math.hypot(x - 7.5, y - 8.5)
            if d < 4.4:
                pass
    # стёрём верх кольца под штырь
    px = im.load()
    for x in (6, 7, 8, 9):
        if 2 <= x + 0 < 16:
            for y in (3, 4, 5):
                if px[x, y] == (0, 0, 0, 255):
                    px[x, y] = (0, 0, 0, 0)
    return im

def ic_coin():
    im = blank(16, 16)
    fill_circ(im, 7.5, 7.5, 5.4, A)
    ring_circ(im, 7.5, 7.5, 6.4, 5.3, (0, 0, 0))
    ring_circ(im, 7.5, 7.5, 3.9, 3.0, D)
    rect(im, 5, 5, 2, 1, (255, 255, 255)); rect(im, 4, 6, 1, 1, (255, 255, 255))
    return im

def ic_star():
    rows = R_STAR + ['.' * 16] * (16 - len(R_STAR))
    return from_map(rows)

STAR16 = [
"................",
".......KK.......",
"......KAAK......",
".....KAAAAK.....",
".KK.KAAAAAAK.KK.",
".KKKAAAAAAAKKKK.",
"...KAAAAAAAAK...",
"...KAAAAAAAAK...",
"....KAAAAAAK....",
"....KAK..KAK....",
".....KK..KK.....",
"................",
]
R_STAR = STAR16

def ic_xp():
    return from_map([
"......KKK.......",
".....KAAAK......",
"....KAAAADK.....",
"...KAAAADADK....",
".KKKAAAAAADAKK..",
".KKAAAAAAADAAKK.",
"...KAAADAAAAK...",
"....KAAADAAK....",
".....KAAADK.....",
"......KADK......",
".......KK.......",
"................",
"................",
"................",
"................",
"................",
])

def ic_heart():
    return from_map([
"................",
"..KKK....KKK....",
".KAADK..KAADK...",
"KAAAAAKKAAAADK..",
"KAAAAAAAAAADK...",
"KAAAAAAAAAADK...",
".KAAAAAAAAAK....",
"..KAAAAAAAКK....".replace('К', 'K'),
"...KAAAAAAK.....",
"....KAAAAK......",
".....KAAK.......",
"......KK........",
"................",
"................",
"................",
"................",
])

def ic_check():
    return from_map([
"................",
"................",
"............KK..",
"...........KAK..",
"..........KAAK..",
"KK.......KAAK...",
"KKK.....KAAK....",
".KK...KAAK......",
"..KKKAAK........",
"...KAAK.........",
"....KK..........",
"................",
"................",
"................",
"................",
"................",
])

def ic_trash():
    return from_map([
"................",
"....KKKKKKK.....",
"...KkwwwwwwK....",
"KKKKKKKKKKKKK...",
".KkKwwwwwwwwK...",
".KkKwwKwwKwwK...",
".KkKwwKwwKwwK...",
".KkwwwwwwwwwwK..",
".KkwwKwwwwKwwK..",
".KkwwKwwwwKwwK..",
".KkwwwwwwwwwwK..",
".KkwwwwwwwwwwK..",
"..KKKKKKKKKKK...",
"................",
"................",
"................",
])

def ic_plus():
    return from_map([
"................",
"................",
".......KK.......",
".......KK.......",
".......KK.......",
".......KK.......",
".KKKKKKKKKKK....",
".KKKKKKKKKKK....",
".KKKKKKKKKKK....",
".KKKKKKKKKKK....",
".......KK.......",
".......KK.......",
".......KK.......",
".......KK.......",
"................",
"................",
])

def ic_cam():
    return from_map([
"................",
".....KK.........",
"....KkkK........",
".KKKKKKKKKKKK...",
"KkkkkkkkkkkkkK..",
"KkwkkkkkkkwwkK..",
"KkwkkKAAKkwwkK..",
"KkwkKAAAkKwwkK..",
"KkwkkKAAKkwwkK..",
"KkwkkkkkkkwwkK..",
"KkkkkkkkkkkkkK..",
".KKKKKKKKKKKK...",
"................",
"................",
"................",
"................",
])

def ic_dl():
    return from_map([
"................",
".......KK.......",
"......KAAK......",
".....KAAAAK.....",
"....KAAAAAAK....",
"...KAAAAAAAAK...",
".....KAAAAK.....",
".......KK.......",
"................",
".KKKKKKKKKKK....",
".KwwwwwwwwwwK...",
".KwwwwwwwwwwK...",
".KKKKKKKKKKK....",
"................",
"................",
"................",
])

def ic_wifi():
    return from_map([
"................",
"......KKKKKK....",
"....KK......KK..",
"...K..........K.",
"..K....KK....K..",
".K...KAAAAK..K..",
".K..KAAwAAK..K..",
"..K.KAAAAAK.K...",
"...K.KAAAK.K....",
"......KAAK......",
".......KK.......",
"................",
"................",
"................",
"................",
"................",
])

def ic_sound():
    return from_map([
"................",
"................",
"....KK..........",
"....KkK.KK......",
".KKKkKkkKAAK....",
".KwwkkkkKAAA K..".replace(' ', 'K'),
".KwwkkkkKAAAK...",
".KwwkkkkKAAA K..".replace(' ', 'K'),
".KKKkKkkKAAK....",
"....KkK.KK......",
"....KK..........",
"................",
"................",
"................",
"................",
"................",
])

def ic_vote():
    return from_map([
"................",
"................",
"..KKKKKKK.......",
"..KwwwwwKK......",
"..KwwwwwK.KKKK..",
"..KwwwwwKKKAAK..",
".KKKKKKKKKAAAAK.",
".KwwwwwwKAAAAAK.",
".KwwwwwwKKAAA K.".replace(' ', 'K'),
".KwwwwwwKKKKKKK.",
".KKKKKKKKKKKKK..",
"................",
"................",
"................",
"................",
"................",
])

def ic_dice():
    return from_map([
"................",
"..KKKKKKKKKKK...",
".KwwwwwwwwwwK...",
".KwwKKwwwwwwK...",
".KwwKKwwKKwwK...",
".KwwKKwwKKwwK...",
".KwwwwwwKKwwK...",
".KwwwwwwKKwwK...",
".KwwwwwwwwwwK...",
".KwwKKwwwwwwK...",
".KwwKKwwwwwwK...",
"..KKKKKKKKKKK...",
"................",
"................",
"................",
"................",
])

def ic_save():
    return from_map([
"................",
".KKKKKKKKKKK....",
".KkwwwwwwKkK....",
".KkwKKKwwKkK....",
".KkwKAAKwKkK....",
".KkwKKKwwKkK....",
".KkwwwwwwKkK....",
".KkkkkkkkkkK....",
".KwwwwwwwwwwK...",
".KwKKKKKKKKwK...",
".KwKwwwwwwKwK...",
".KwKwwwwwwKwK...",
".KKKKKKKKKKK....",
"................",
"................",
"................",
])

def ic_ai():
    return from_map([
"................",
"...K..K..K......",
"....K..K........",
".KKKKKKKKKKK....",
"KkkkkkkkkkkkK...",
"KkwAAAAAAAwkK...",
"KkwAAwwAAAwkK...",
"KkwAAwwAAAwkK...",
"KkwAAAAAAAwkK...",
"KkkkkkkkkkkkK...",
".KKKKKKKKKKK....",
"....K..K........",
"...K..K..K......",
"................",
"................",
"................",
])

def ic_edit():
    return from_map([
"................",
"............KK..",
"...........KAK..",
"..........KAAK..",
"KK.......KAAK...",
"KKK.....KAAK....",
".KKK...KAAK.....",
"..KKK.KAAK......",
"...KKKAAK.......",
"....KKKAK.......",
".....KKK........",
"......KK........",
"................",
"................",
"................",
"................",
])

def qt_fix():
    return from_map([
"................",
".KKKKK..........",
".KssskK.........",
".KssskK.........",
".KssskK.........",
".KKKKK..........",
"...KKK..........",
"....KKK.........",
".....KKK........",
"......KKK.......",
".......KKK......",
"........KKK.....",
"........KKKKK...",
"..........KssK..",
"..........KssK..",
"..........KKKK..",
])

def qt_help():
    return from_map([
"................",
"....KKKKKK......",
"...KAAAAAAK.....",
"..KAAAAAAAAK....",
"..KAAKKAAKKK....",
"..KAAKKAAKKKK...",
"..KAAAAAAAAKKK..",
"..KAAAAAAAAKK...",
"..KAAAAAAAAK....",
"..KAAAAAAAAK....",
"...KAAAAAAK.....",
"....KAAAK.......",
".....KKK........",
"................",
"................",
"................",
])

def qt_swap():
    return from_map([
"................",
"................",
".KKKKKKKKKK.....",
".KwwwwwwwwK.....",
".KwwKKKKwwK.....",
".KwwKKKKwwK.....",
".KwwwwwwwwK.....",
".KKKKKKKKKK.....",
".KKKKKKKKKKK....",
".KAAAAAAA KKK..." .replace(' ', 'K'),
".KAAAAAAA KKK..." .replace(' ', 'K'),
".KAAAAAAAKKKK...",
".KAAAKKKKKKKK...",
".KAAKKKKKKKKK...",
"................",
"................",
])

def qt_class():
    return from_map([
"................",
"......KK........",
".....KAAK.......",
"....KAAAAK......",
"...KAAAAAAK.....",
"..KAAAAAAAAK....",
".KKKKKKKKKKK....",
"..KkkkkkkkkK....",
"...KkkkkkkK.....",
"....KkkkkK......",
".....KkkK.......",
"........AA......",
"........AA......",
"........AA......",
"................",
"................",
])

def en_water():
    return from_map([
"................",
".......KK.......",
"......KggK......",
".....KggggK.....",
"....KggggggK....",
"....KggggggK....",
"...Kggwg gggK..." .replace(' ', 'g'),
"...Kggwg gggK..." .replace(' ', 'g'),
"...KggggggggK...",
"...KggggggggK...",
"....KggggggK....",
".....KggggK.....",
"......KKKK......",
"................",
"................",
"................",
])

def en_energy():
    return from_map([
"................",
"......KKKKK.....",
".....KAAAAADK...",
"....KAAAAAADK...",
"...KAAAAAADK....",
".KKKAAAAAADK....",
".KKAAAAAAAAK....",
"...KAAAAAAADK...",
"....KAAAAADK....",
".....KAAADK.....",
"......KADK......",
".......KK.......",
"................",
"................",
"................",
"................",
])

def en_food():
    return from_map([
"................",
".......KK.......",
"......KkkK......",
"......KkkK......",
".KKKK.KkkK......",
".KAAAADKKK......",
".KAAAAAAADK.....",
".KAAAAAAADK.....",
".KAAAAAAADK.....",
".KAAAADAAK......",
".KAAAADAAK......",
"..KAAAAAAK......",
"...KKKKKK.......",
"................",
"................",
"................",
])

def marker(fill, outline, hole):
    rows = [
"................",
"......KKKK......",
"....KKKKKKKK....",
"...KAAAAAAAAK...",
"...KAAAAAAAAK...",
"..KAAAAAAAAAK...",
"..KAAAAAAwAAK...",
"..KAAAAAwAAAK...",
"..KAAAAAAAAAK...",
"...KAAAAAAAK....",
"....KAAAAAK.....",
".....KAAAK......",
"......KAK.......",
".......K........",
".......K........",
".......K........",
    ]
    im = from_map(rows)
    px = im.load()
    for y in range(im.height):
        for x in range(im.width):
            r, g, b, a = px[x, y]
            if (r, g, b) == A:
                px[x, y] = fill + (255,)
            if (r, g, b) == (255, 255, 255):
                px[x, y] = hole + (255,)
    # контур уже K
    return im

# ---------------------------------------------------------------- персонаж
FACE_BASE = [  # лицо: w, глаза K, рот m, T — тонируемое
"................",
"................",
"................",
"................",
"................",
"................",
"................",
"................",
"................",
"................",
"................",
"................",
"................",
"................",
"................",
"................",
]

def face_short():
    return from_map([
"................",
".....TTTTTTT....",
"....TTTTTTTTT...",
"...TTTTTTTTTTT..",
"...TTTwwwwwwTT..",
"...TwTwwwwwwTT..",
"...TwwKwwwwKwT..",
"...TwwKwwwwKwT..",
"...TwwwwwwwwTT..",
"...TTwwmmmmmTT..",
"....TTwwwwwwT...",
".....TTTTTTT....",
"......TTTTT.....",
"................",
"................",
"................",
])

def face_long():
    return from_map([
"................",
".....TTTTTTT....",
"....TTTTTTTTT...",
"...TTTTTTTTTTT..",
"...TTTTwwwwTTT..",
"...TTTwwwwwwTT..",
"...TTwKwwwwKwT..",
"...TTwKwwwwKwT..",
"...TTwwwwwwwwT..",
"...TTwwmmmmwwT..",
"...TTwwwwwwwwT..",
"...TTTwwwwwwTT..",
"....TTTTTTTTT...",
"....TT....TT....",
"....T......T....",
"................",
])

def face_cap():
    return from_map([
"................",
".....TTTTTTT....",
"....TTTTTTTTT...",
"...TTTTTTTTTTT..",
".TTTTTTTTTTTTTT.",
".TTTTTTTTTTTTTT.",
"...TwwwwwwwwT...",
"...TwKwwwwKwT...",
"...TwwwwwwwwT...",
"...TwwmmmmwwT...",
"....TwwwwwwT....",
".....TTTTTT.....",
"......TTTTT.....",
"................",
"................",
"................",
])

def face_hood():
    return from_map([
"................",
".....TTTTTTT....",
"....TTTTTTTTT...",
"...TTTTTTTTTTT..",
"..TTTTwwwwwwTT..",
"..TTTwwwwwwwwT..",
"..TTwKwwwwwwKTT.",
"..TTwKwwwwwwKTT.",
"..TTwwwwwwwwwwT.",
"..TTwwmmmmwwwwT.",
"..TTwwwwwwwwwwT.",
"...TTTTTTTTTTT..",
"....TTTTTTTTT...",
".....TTTTTTT....",
"................",
"................",
])

def acc_glasses():
    return from_map([
"................",
"................",
"................",
"................",
"................",
".KKKKK..KKKKK...",
".KwwwK..KwwwK...",
".KKKKKKKKKKKKK..",
"................",
"................",
"................",
"................",
"................",
"................",
"................",
"................",
])

def acc_phones():
    return from_map([
"................",
"......KKKKKK....",
"....KKKKKKKKK...",
"...KKKKKKKKKKK..",
"..KKK....KKK....",
"..KAAK..KAAK....",
"..KAAK..KAAK....",
"..KAAK..KAAK....",
"..KAAK..KAAK....",
"..KKK....KKK....",
"................",
"................",
"................",
"................",
"................",
"................",
])

def acc_antenna():
    return from_map([
"................",
".....AAAA.......",
".....AwAA.......",
"......KK........",
"......KK........",
"......KK........",
"......KK........",
"......KK........",
"................",
"................",
"................",
"................",
"................",
"................",
"................",
"................",
])

def acc_bow():
    return from_map([
"................",
"................",
"..AAA....AAA....",
".KAAA..KKKAAK...",
".KAAA.KKKKAAK...",
".KAAA..KKKAAK...",
"..AAA....AAA....",
"................",
"................",
"................",
"................",
"................",
"................",
"................",
"................",
"................",
])

# ---------------------------------------------------------------- логотип / orb
def logo(scale=3):
    im = blank(16, 16)
    K = (0, 0, 0)
    # «2»
    rect(im, 4, 4, 5, 2, K)
    rect(im, 8, 5, 1, 2, K)
    rect(im, 4, 7, 5, 2, K)
    rect(im, 4, 8, 1, 2, K)
    rect(im, 4, 10, 5, 1, K)
    # «1»
    rect(im, 10, 4, 3, 1, A)
    rect(im, 11, 5, 1, 5, A)
    rect(im, 10, 10, 4, 1, A)
    # подчёркивание
    rect(im, 4, 12, 10, 1, D)
    rect(im, 4, 13, 10, 1, A)
    return im.resize((16 * scale, 16 * scale), Image.NEAREST)

def orb():
    im = blank(24, 24)
    px = im.load()
    cx = cy = 11.5
    for y in range(24):
        for x in range(24):
            d = math.hypot(x - cx, y - cy)
            if d <= 10.8:
                if d > 9.4:
                    px[x, y] = (0, 0, 0, 255)
                elif d > 5.5 and (x + y) < 21:
                    px[x, y] = (153, 153, 153, 255)
                else:
                    px[x, y] = (51, 51, 51, 255)
    W = (255, 255, 255)
    # «2»
    rect(im, 6, 8, 5, 2, W)
    rect(im, 10, 10, 1, 1, W)
    rect(im, 6, 10, 5, 1, W)
    rect(im, 6, 11, 1, 2, W)
    rect(im, 6, 13, 5, 1, W)
    # «1»
    rect(im, 12, 8, 2, 2, W)
    rect(im, 13, 8, 1, 6, W)
    rect(im, 12, 13, 4, 1, W)
    return im

def favicon():
    return orb()  # 24x24

# ---------------------------------------------------------------- фон
def wallpaper():
    im = Image.new('RGBA', (120, 90), (255, 255, 255, 255))
    px = im.load()
    for y in range(6, 90, 12):
        for x in range(6, 120, 12):
            px[x, y] = (240, 240, 240, 255)
    return im

def skyline():
    im = blank(240, 80)
    px = im.load()
    import random
    rnd = random.Random(21)
    x = 0
    while x < 240:
        edge = (x < 16 or x > 224)
        w = rnd.randint(10, 26) if not edge else 16
        h = rnd.randint(18, 52) if not edge else 18
        col = rnd.choice([(224, 224, 224), (214, 214, 214), (235, 235, 235)])
        for j in range(80 - h, 80):
            for i in range(x, min(x + w, 240)):
                px[i, j] = col + (255,)
        # окна
        for j in range(80 - h + 3, 78, 5):
            for i in range(x + 2, min(x + w - 2, 240), 5):
                if rnd.random() < 0.22:
                    px[i, j] = (212, 163, 115, 255)
        if not edge and rnd.random() < 0.3 and h > 34:
            for j in range(80 - h - 4, 80 - h):
                px[x + w // 2, j] = (153, 153, 153, 255)
        x += w
    # ровный край для тайла
    for x in (0, 1, 228, 229, 230, 231, 232, 233, 234, 235, 236, 237, 238, 239):
        for y in range(62, 80):
            if im.getpixel((x, y))[3] == 0:
                pass
    return im

def cloud():
    return from_map([
"......................",
"........SSSS..........",
".....SSSSSSSSS........",
"....SSSSSSSSSSSS......",
"...SSSSSSSSSSSSSS.....",
"...SSSSSSSSSSSSSS.....",
"....SSSSSSSSSSSS......",
".....SSSSSSSSSSS......",
"......................",
"......................",
])

def sun():
    im = blank(16, 16)
    rect(im, 3, 3, 10, 10, A)
    for (x, y) in ((3, 3), (12, 3), (3, 12), (12, 12)):
        rect(im, x, y, 1, 1, D)
    rect(im, 5, 5, 2, 2, (255, 255, 255))
    return im

def map_bg():
    im = Image.new('RGBA', (256, 256), (250, 250, 250, 255))
    px = im.load()
    for x in range(0, 256, 32):
        for y in range(256): px[x, y] = (236, 236, 236, 255)
    for y in range(0, 256, 32):
        for x in range(256): px[x, y] = (236, 236, 236, 255)
    rect(im, 0, 118, 256, 16, (224, 224, 224))
    rect(im, 100, 0, 16, 256, (224, 224, 224))
    rect(im, 150, 30, 90, 70, (240, 240, 240))
    rect(im, 150, 30, 90, 1, (214, 214, 214)); rect(im, 150, 99, 90, 1, (214, 214, 214))
    rect(im, 150, 30, 1, 70, (214, 214, 214)); rect(im, 239, 30, 1, 70, (214, 214, 214))
    import random
    rnd = random.Random(7)
    for _ in range(14):
        x = 158 + rnd.randint(0, 74); y = 38 + rnd.randint(0, 54)
        rect(im, x, y, 2, 2, (204, 204, 204))
    blocks = [(16, 16, 70, 60), (16, 150, 70, 70), (130, 150, 110, 80), (16, 16, 60, 60)]
    for (x, y, w, h) in blocks:
        rect(im, x, y, w, h, (244, 244, 244))
        rect(im, x, y, w, 1, (224, 224, 224)); rect(im, x, y + h - 1, w, 1, (224, 224, 224))
        rect(im, x, y, 1, h, (224, 224, 224)); rect(im, x + w - 1, y, 1, h, (224, 224, 224))
    return im

# ---------------------------------------------------------------- дудлы 32x32
def dd_city():
    im = Image.new('RGBA', (32, 32), (255, 255, 255, 255))
    rect(im, 24, 3, 5, 5, A)
    buildings = [(2, 14, 8), (11, 8, 7), (19, 16, 9), (28, 11, 4)]
    cols = [(153, 153, 153), (102, 102, 102), (204, 204, 204), (153, 153, 153)]
    for (x, h, w), c in zip(buildings, cols):
        rect(im, x, 30 - h, w, h, c)
        rect(im, x, 30 - h, w, 1, (51, 51, 51))
        for j in range(30 - h + 2, 29, 3):
            for i in range(x + 1, x + w - 1, 2):
                if (i * 7 + j * 13) % 5 < 2:
                    rect(im, i, j, 1, 1, A)
    rect(im, 0, 30, 32, 2, (51, 51, 51))
    return im

def dd_cat():
    im = Image.new('RGBA', (32, 32), (255, 255, 255, 255))
    M = (102, 102, 102); K = (0, 0, 0); W = (255, 255, 255)
    rect(im, 10, 4, 3, 4, M); rect(im, 19, 4, 3, 4, M)
    rect(im, 9, 7, 14, 9, M)
    rect(im, 10, 8, 12, 7, W)
    rect(im, 12, 10, 2, 2, K); rect(im, 18, 10, 2, 2, K)
    rect(im, 15, 13, 2, 1, A)
    for dx in (10, 12, 14, 16, 18, 20):
        rect(im, dx, 16, 1, 1, K) if dx % 4 == 0 else None
    rect(im, 8, 16, 16, 12, M)
    rect(im, 12, 20, 8, 8, W)
    rect(im, 4, 24, 4, 4, M); rect(im, 3, 27, 3, 3, M)
    rect(im, 22, 22, 7, 3, M); rect(im, 27, 25, 2, 3, A)
    return im

def dd_robot():
    im = Image.new('RGBA', (32, 32), (255, 255, 255, 255))
    G = (153, 153, 153); K = (0, 0, 0); W = (255, 255, 255)
    rect(im, 15, 2, 2, 4, K); rect(im, 14, 1, 4, 2, A)
    rect(im, 8, 6, 16, 10, G); rect(im, 8, 6, 16, 1, K); rect(im, 8, 15, 16, 1, K)
    rect(im, 8, 6, 1, 10, K); rect(im, 23, 6, 1, 10, K)
    rect(im, 10, 8, 12, 6, W)
    rect(im, 12, 10, 3, 2, A); rect(im, 17, 10, 3, 2, A)
    rect(im, 13, 13, 6, 1, (102, 102, 102))
    rect(im, 6, 17, 20, 10, G); rect(im, 6, 17, 20, 1, K); rect(im, 6, 26, 20, 1, K)
    rect(im, 6, 17, 1, 10, K); rect(im, 25, 17, 1, 10, K)
    rect(im, 11, 19, 10, 6, W)
    rect(im, 13, 20, 2, 2, K); rect(im, 17, 20, 2, 2, K)
    rect(im, 9, 27, 4, 3, (102, 102, 102)); rect(im, 19, 27, 4, 3, (102, 102, 102))
    rect(im, 3, 18, 3, 6, G); rect(im, 26, 18, 3, 6, G)
    return im

# ---------------------------------------------------------------- бейджи
def badge(glyph_rows):
    base = [
".KKKKKKKKKK.....",
"KAAAAAAAAAAK....",
"KAAAAAAAAAAK....",
"KAAAAAAAAAAK....",
"KAAAAAAAAAAK....",
"KAAAAAAAAAAK....",
"KAAAAAAAAAAK....",
"KAAAAAAAAAAK....",
".KAAAAAAAAK.....",
"..KAAAAAAK......",
"...KAAAAK.......",
"....KAAK........",
".....KK.........",
"................",
"................",
"................",
]
    im = from_map(base)
    px = im.load()
    for y, row in enumerate(glyph_rows):
        for x, ch in enumerate(row):
            if ch == 'x':
                px[x + 3, y + 3] = (0, 0, 0, 255)
            elif ch == 'w':
                px[x + 3, y + 3] = (255, 255, 255, 255)
    return im

def bd_first():
    return badge([
"......",
"..xx..",
".xxxx.",
"xxxxxx",
".xxxx.",
"..x.x.",
"......",
"......",
])

def bd_ten():
    return badge([
"..x.xx",
".x.x.x",
".x.x.x",
".x.x.x",
".x.x.x",
".x.x.x",
".x.x.x",
".x.xx.",
])

def bd_voter():
    return badge([
"xxxxxx",
"x....x",
"x..x..",
"x.xxx.",
"x.....",
"x.....",
"xxxxxx",
"......",
])

def bd_donor():
    return badge([
".xxxx.",
"x....x",
"x..w.x",
"x..w.x",
"x....x",
".xxxx.",
"......",
"......",
])

def bd_post():
    return badge([
".....x",
"....xx",
"...xx.",
"..xx..",
".xx...",
"xx....",
"......",
"......",
])

def bd_admin():
    return badge([
"..x.x.",
".x...x",
"x..x..",
"x..x..",
".x...x",
"..x.x.",
"......",
"......",
])

def bd_style():
    return badge([
"x...x.",
"xxx.xx",
"xxx.xx",
"x...x.",
"......",
"......",
"......",
"......",
])

def bd_level5():
    return badge([
"x..x..x",
"x.x.x.x",
"xxxxxxx",
".xxxxx.",
".xxxxx.",
"......",
"......",
"......",
])

# ---------------------------------------------------------------- GIF
def loading_gif():
    frames = []
    n = 12
    cx = cy = 16
    r = 12
    cols = [A, D, (153, 153, 153), (102, 102, 102), (102, 102, 102), (153, 153, 153), (204, 204, 204)]
    pts = []
    for i in range(n):
        ang = 2 * math.pi * i / n - math.pi / 2
        pts.append((int(round(cx + r * math.cos(ang))), int(round(cy + r * math.sin(ang)))))
    for f in range(n):
        im = blank(32, 32)
        px = im.load()
        for i in range(n):
            d = (i - f) % n
            if d < len(cols):
                x, y = pts[i]
                for dx in (-1, 0, 1):
                    for dy in (-1, 0, 1):
                        px[x + dx, y + dy] = cols[d] + (255,)
        frames.append(im)
    return frames

def working_gif():
    frames = []
    cells = 20
    for f in range(8):
        im = blank(44, 12)
        px = im.load()
        for x in range(44):
            px[x, 0] = (0, 0, 0, 255); px[x, 11] = (0, 0, 0, 255)
        for y in range(12):
            px[0, y] = (0, 0, 0, 255); px[43, y] = (0, 0, 0, 255)
        filled = int(cells * (f + 1) / 8)
        for i in range(filled):
            x0 = 2 + i * 2
            px[x0, 2] = A + (255,); px[x0, 3] = A + (255,); px[x0, 4] = A + (255,)
            px[x0, 5] = D + (255,); px[x0, 6] = D + (255,); px[x0, 7] = D + (255,)
            px[x0, 8] = A + (255,); px[x0, 9] = A + (255,); px[x0, 10] = A + (255,)
        frames.append(im)
    return frames

def _star(size, px, cx, cy, c_fill, c_edge):
    # простой «ромбовый» звёзд
    for y in range(-size, size + 1):
        for x in range(-size, size + 1):
            d = abs(x) + abs(y)
            X, Y = cx + x, cy + y
            if 0 <= X < 16 and 0 <= Y < 16:
                if d == size:
                    px[X, Y] = c_edge + (255,)
                elif d < size:
                    px[X, Y] = c_fill + (255,)

def success_gif():
    frames = []
    specs = [(3, 0.4), (5, 0.7), (7, 1.0), (7, 1.0), (5, 0.7)]
    for s, _ in specs:
        im = blank(16, 16)
        px = im.load()
        size = max(2, s)
        _star(size, px, 8, 8, A, (0, 0, 0))
        if s >= 7:
            px[6, 6] = (255, 255, 255, 255); px[6, 7] = (255, 255, 255, 255)
        frames.append(im)
    return frames

def thinking_gif():
    frames = []
    for f in range(6):
        im = blank(24, 12)
        px = im.load()
        levels = [A, D, (153, 153, 153)]
        for i in range(3):
            d = (i - f) % 3
            if d < 3:
                x0 = 3 + i * 7
                for dx in range(4):
                    for dy in range(4):
                        px[x0 + dx, 4 + dy] = levels[d] + (255,)
        frames.append(im)
    return frames

def gif_save(name, frames, dur):
    p = os.path.join(OUT, name)
    q = [f.convert('RGB') for f in frames]
    q[0].save(p, save_all=True, append_images=q[1:], duration=dur, loop=0, dispose=2)
    print(f'  {name:24s} {q[0].size[0]}x{q[0].size[1]} x{len(frames)}')

# ---------------------------------------------------------------- атлас
def atlas(names):
    n = len(names)
    cols = 10
    rows = (n + cols - 1) // cols
    im = Image.new('RGBA', (cols * 20, rows * 20), (255, 255, 255, 255))
    for i, nm in enumerate(names):
        spr = from_map(IMGS[nm]) if isinstance(IMGS[nm], list) else IMGS[nm]
        spr = spr.resize((16, 16), Image.NEAREST)
        im.paste(spr, ((i % cols) * 20 + 2, (i // cols) * 20 + 2), spr)
    return im

if __name__ == '__main__':
    print('icons:')
    save('ic_map.png', ic_map())
    save('ic_quest.png', ic_quest())
    save('ic_user.png', ic_user())
    save('ic_book.png', ic_book())
    save('ic_wallet.png', ic_wallet())
    save('ic_court.png', ic_court())
    save('ic_admin.png', ic_admin())
    save('ic_char.png', ic_char())
    save('ic_qr.png', ic_qr())
    save('ic_feed.png', ic_feed())
    save('ic_pc.png', ic_pc())
    save('ic_power.png', ic_power())
    save('ic_coin.png', ic_coin())
    save('ic_star.png', ic_star())
    save('ic_xp.png', ic_xp())
    save('ic_heart.png', ic_heart())
    save('ic_check.png', ic_check())
    save('ic_trash.png', ic_trash())
    save('ic_plus.png', ic_plus())
    save('ic_cam.png', ic_cam())
    save('ic_dl.png', ic_dl())
    save('ic_wifi.png', ic_wifi())
    save('ic_sound.png', ic_sound())
    save('ic_vote.png', ic_vote())
    save('ic_dice.png', ic_dice())
    save('ic_save.png', ic_save())
    save('ic_ai.png', ic_ai())
    save('ic_edit.png', ic_edit())
    print('quest types / encyclopedia:')
    save('qt_fix.png', qt_fix())
    save('qt_help.png', qt_help())
    save('qt_swap.png', qt_swap())
    save('qt_class.png', qt_class())
    save('en_water.png', en_water())
    save('en_energy.png', en_energy())
    save('en_food.png', en_food())
    save('en_repair.png', qt_fix())
    print('markers:')
    save('mk_quest.png', marker(A, (0, 0, 0), (255, 255, 255)))
    save('mk_problem.png', marker((51, 51, 51), (0, 0, 0), (255, 255, 255)))
    save('mk_done.png', marker((204, 204, 204), (0, 0, 0), (255, 255, 255)))
    print('character:')
    save('face0.png', face_short())
    save('face1.png', face_long())
    save('face2.png', face_cap())
    save('face3.png', face_hood())
    save('acc_glasses.png', acc_glasses())
    save('acc_phones.png', acc_phones())
    save('acc_antenna.png', acc_antenna())
    save('acc_bow.png', acc_bow())
    print('branding:')
    save('logo.png', logo(3))
    save('orb.png', orb())
    save('favicon.png', favicon())
    print('backgrounds:')
    save('wallpaper.png', wallpaper())
    save('skyline.png', skyline())
    save('cloud.png', cloud())
    save('sun.png', sun())
    save('map_bg.png', map_bg())
    print('doodles:')
    save('dd_city.png', dd_city())
    save('dd_cat.png', dd_cat())
    save('dd_robot.png', dd_robot())
    print('badges:')
    save('bd_first.png', bd_first())
    save('bd_ten.png', bd_ten())
    save('bd_voter.png', bd_voter())
    save('bd_donor.png', bd_donor())
    save('bd_post.png', bd_post())
    save('bd_admin.png', bd_admin())
    save('bd_style.png', bd_style())
    save('bd_level5.png', bd_level5())
    print('gif:')
    gif_save('loading.gif', loading_gif(), 100)
    gif_save('working.gif', working_gif(), 130)
    gif_save('success.gif', success_gif(), 90)
    gif_save('thinking.gif', thinking_gif(), 160)
    print('atlas:')
    names = ['ic_map', 'ic_quest', 'ic_user', 'ic_book', 'ic_wallet', 'ic_court', 'ic_admin', 'ic_char', 'ic_qr', 'ic_feed',
             'ic_pc', 'ic_power', 'ic_coin', 'ic_star', 'ic_xp', 'ic_heart', 'ic_check', 'ic_trash', 'ic_plus', 'ic_cam',
             'ic_dl', 'ic_wifi', 'ic_sound', 'ic_vote', 'ic_dice', 'ic_save', 'ic_ai', 'ic_edit', 'qt_fix', 'qt_help',
             'qt_swap', 'qt_class', 'en_water', 'en_energy', 'en_food', 'en_repair', 'bd_first', 'bd_voter', 'bd_donor', 'bd_level5']
    def _gen(nm):
        return {'ic_map': ic_map, 'ic_quest': ic_quest, 'ic_user': ic_user, 'ic_book': ic_book, 'ic_wallet': ic_wallet,
                'ic_court': ic_court, 'ic_admin': ic_admin, 'ic_char': ic_char, 'ic_qr': ic_qr, 'ic_feed': ic_feed,
                'ic_pc': ic_pc, 'ic_power': ic_power, 'ic_coin': ic_coin, 'ic_star': ic_star, 'ic_xp': ic_xp,
                'ic_heart': ic_heart, 'ic_check': ic_check, 'ic_trash': ic_trash, 'ic_plus': ic_plus, 'ic_cam': ic_cam,
                'ic_dl': ic_dl, 'ic_wifi': ic_wifi, 'ic_sound': ic_sound, 'ic_vote': ic_vote, 'ic_dice': ic_dice,
                'ic_save': ic_save, 'ic_ai': ic_ai, 'ic_edit': ic_edit, 'qt_fix': qt_fix, 'qt_help': qt_help,
                'qt_swap': qt_swap, 'qt_class': qt_class, 'en_water': en_water, 'en_energy': en_energy,
                'en_food': en_food, 'en_repair': qt_fix, 'bd_first': bd_first, 'bd_voter': bd_voter,
                'bd_donor': bd_donor, 'bd_level5': bd_level5}[nm]()
    IMGS = {nm: _gen(nm) for nm in names}
    save('atlas.png', atlas(names))
    print('done.')
