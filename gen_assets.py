#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Генератор всех PNG-ассетов приложения «21».
16-битный пиксель-арт: ч/б + оттенки серого + акцент #d4a373.
Каждый спрайт рисуется как символьная карта и масштабируется NEAREST."""
import os, random, math
from PIL import Image, ImageDraw

random.seed(21)
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "assets")
os.makedirs(OUT, exist_ok=True)

PAL = {
    'K': (18, 18, 18),    # чёрные чернила
    'D': (66, 66, 66),    # тёмно-серый
    'M': (124, 124, 124), # средний серый
    'L': (190, 190, 190), # светло-серый
    'W': (244, 241, 234), # бумага
    'A': (212, 163, 115), # акцент — тёплый беж
    'a': (168, 122, 74),  # тёмный акцент
}

def make(rows, scale=6):
    h = len(rows); w = max(len(r) for r in rows)
    img = Image.new('RGBA', (w*scale, h*scale), (0, 0, 0, 0))
    px = img.load()
    for y, row in enumerate(rows):
        row = row.ljust(w)[:w]
        for x, ch in enumerate(row):
            c = PAL.get(ch)
            if c:
                for dy in range(scale):
                    for dx in range(scale):
                        px[x*scale+dx, y*scale+dy] = c + (255,)
    return img

def save(img, name):
    img.save(os.path.join(OUT, name))
    print("ok", name, img.size)

def S(name, rows, scale=6):
    save(make(rows, scale), name)

def blank(w, h, scale=6, bg=None):
    img = Image.new('RGBA', (w*scale, h*scale), bg+(255,) if bg else (0,0,0,0))
    return img, scale

def stamp(img, rows, ox, oy, scale):
    px = img.load()
    for y, row in enumerate(rows):
        for x, ch in enumerate(row):
            c = PAL.get(ch)
            if c:
                for dy in range(scale):
                    for dx in range(scale):
                        px[(ox+x)*scale+dx, (oy+y)*scale+dy] = c+(255,)

# ─────────────────────────── ЛОГОТИП «21» ───────────────────────────
DIG = {
'0':[".KKK.","K...K","K..KK","K.K.K","KK..K","K...K",".KKK."],
'1':["..K..",".KK..","KKK..","..K..","..K..","..K..","KKKKK"],
'2':[".KKK.","K...K","....K","...K.","..K..",".K...","KKKKK"],
'3':[".KKK.","K...K","....K","..KK.","....K","K...K",".KKK."],
}
logo, ls = blank(30, 22, scale=8)
dx = 5
for ch in "21":
    for y, row in enumerate(DIG[ch]):
        for x, c in enumerate(row):
            if c == 'K':
                stamp(logo, ['D'], dx+x+1, y+2, ls)   # смещённая тень
                stamp(logo, ['K'], dx+x, y+1, ls)
    dx += 6
# подчёркивание акцентом + капли краски
stamp(logo, ['AAAAAAAAAAAAAAAAAAAAAA'], 4, 11, ls)
drips = [(6,3),(8,5),(12,2),(15,6),(19,3),(22,4),(10,4)]
for x, ln in drips:
    for i in range(ln):
        stamp(logo, ['K'], x, 12+i, ls)
    stamp(logo, ['K'], x, 12+ln, ls)
save(logo, "logo.png")

# ─────────────────────────── ЗЕРНО (текстура) ───────────────────────────
g = Image.new('L', (96, 96))
gp = g.load()
for y in range(96):
    for x in range(96):
        gp[x, y] = random.randint(0, 255)
g.save(os.path.join(OUT, "grain.png"))

# ─────────────────────────── ПИКСЕЛЬНЫЙ ФОН (горы/лес) ───────────────────────────
bg, bs = blank(120, 46, scale=4)
d = ImageDraw.Draw(bg)
def poly(points, color):
    d.polygon([(x*bs, y*bs) for x, y in points], fill=color+(255,))
def rect(x0,y0,x1,y1,color):
    d.rectangle([x0*bs,y0*bs,x1*bs,y1*bs], fill=color+(255,))
# дальние горы
poly([(0,38),(22,10),(40,38)], (190,190,190))
poly([(18,38),(40,6),(64,38)], (124,124,124))
poly([(28,14),(40,6),(52,14),(44,18),(36,18)], (244,241,234))  # снег
poly([(52,38),(78,12),(104,38)], (190,190,190))
poly([(72,38),(96,8),(120,38),(120,46),(72,46)], (124,124,124))
poly([(88,16),(96,8),(104,16),(99,19),(93,19)], (244,241,234))
# земля
rect(0, 36, 120, 46, (66,66,66))
rect(0, 40, 120, 46, (18,18,18))
# ёлки
def tree(cx, base, h):
    for i in range(h):
        w = h - i
        poly([(cx-w//2, base-i),(cx+w//2, base-i),(cx, base-i-2)], (18,18,18) if i % 2 == 0 else (66,66,66))
for cx, base, h in [(8,40,7),(16,41,5),(54,40,6),(66,41,8),(108,40,6),(114,42,5)]:
    tree(cx, base, h)
# домик
rect(44, 30, 56, 40, (18,18,18))
poly([(42,30),(50,24),(58,30)], (66,66,66))
rect(48, 34, 52, 40, (212,163,115))
save(bg, "mountains.png")

# ─────────────────────────── ПИКСЕЛЬНАЯ КАРТА (фоллбэк) ───────────────────────────
mb, ms = blank(64, 64, scale=4, bg=(244,241,234))
dm = ImageDraw.Draw(mb)
def mrect(x0,y0,x1,y1,c):
    dm.rectangle([x0*ms,y0*ms,x1*ms,y1*ms], fill=c+(255,))
# дороги
mrect(0, 30, 64, 34, (190,190,190)); mrect(30, 0, 34, 64, (190,190,190))
mrect(0, 31, 64, 31, (244,241,234)); mrect(31, 0, 31, 64, (244,241,234))
# кварталы (домики)
random.seed(7)
for _ in range(26):
    bx = random.choice([2, 6, 12, 18, 38, 44, 50, 56])
    by = random.choice([2, 8, 14, 20, 38, 44, 50, 56])
    bw = random.randint(4, 7); bh = random.randint(4, 6)
    mrect(bx, by, bx+bw, by+bh, random.choice([(124,124,124),(66,66,66),(190,190,190)]))
    mrect(bx+1, by+1, bx+bw-1, by+1, (244,241,234))
# деревья
for _ in range(18):
    tx = random.randint(0, 60); ty = random.randint(0, 60)
    mrect(tx, ty, tx+2, ty+2, (66,66,66))
save(mb, "map_bg.png")

# ─────────────────────────── ПЕРСОНАЖИ ───────────────────────────
HERO = [
"........................",
"........KKKKKKKK........",
"......KKDDDDDDDDKK......",
".....KDDDDDDDDDDDDK.....",
"....KKDDDDDDDDDDDDKK....",
"....KKKKKKKKKKKKKKKK....",
".....KWWWWWWWWWWWWK.....",
"....KWWKKWWWWWWKKWWK....",
"....KWWWWWWWWWWWWWWK....",
".....KWWWWKKKWWWWWK.....",
"......KWWWWWWWWWWK......",
"......KKKKKKKKKKKK......",
"..KKKKDDDDDDDDDDDDKKKK..",
".KDDDDDAADDDDDDAADDDDDK.",
".KDDDDDAADDDDDDAADDDDDK.",
"KDDK...DDDDKKDDDD...KDDK",
"KDDK...DDDDKKDDDD...KDDK",
".KDDK..DDDDKKDDDD..KDDK.",
".KDDK..DDDDKKDDDD..KDDK.",
"..KDDW.KKKKKKKKKK.WDDK..",
"......KDDDK.KDDDK.......",
"......KDDDK.KDDDK.......",
"......KDDDK.KDDDK.......",
"......KDDDK.KDDDK.......",
".....KKKKKK.KKKKKK......",
"....KKKKKKK.KKKKKKK.....",
"........................",
"........................",
]
S("hero.png", HERO, scale=6)

WORKER = [
"........................",
"........KKKKKKKK........",
"......KKDDDDDDDDKK......",
".....KDDDDDDDDDDDDK.....",
"....KKDDDDDDDDDDDDKK....",
"....KKKKKKKKKKKKKKKK....",
".....KWWWWWWWWWWWWK.....",
"....KWWKKWWWWWWKKWWK..KK",
"....KWWWWWWWWWWWWWWK.KWK",
".....KWWWWKKKWWWWK..KWK",
"......KWWWWWWWWWWK..KWK.",
"......KKKKKKKKKKKKKKWK..",
"..KKKKLLLLLLLLLLLLLLKK..",
".KLLLLLLLLLLLLLLLLLLLLK.",
".LKLLLLLLLLLLLLLLLLLLLK.",
"KLLK...LLLLKKLLLL...KLLK",
"KLLK...WWWWKKWWWW...KLLK",
".KLLK..LLLLKKLLLL..KLLK.",
".KLLK..LLLLKKLLLL..KLLK.",
"..KLLW.KKKKKKKKKK.WLLK..",
"......KDDDK.KDDDK.......",
"......KDDDK.KDDDK.......",
"......KDDDK.KDDDK.......",
"......KDDDK.KDDDK.......",
".....KKKKKK.KKKKKK......",
"....KKKKKKK.KKKKKKK.....",
"........................",
"........................",
]
S("worker.png", WORKER, scale=6)

ROBOT = [
".........A..........",
"........KKK.........",
"......KKKKKKKK......",
".....KDDDDDDDDK.....",
"....KDDDDDDDDDDK....",
"....KDWWKKKKDWWK....",
"....KDDDDDDDDDDK....",
"....KDDDDKKDDDDK....",
".....KKKKKKKKKK.....",
"...KKKKKKKKKKKKKK...",
"..KDDDDDDDDDDDDDDK..",
"..KDDDKKKKKKKKDDDK..",
"..KDDDK.KKKK.KDDDK..",
"..KDDDK.KAAK.KDDDK..",
"..KDDDK.KKKK.KDDDK..",
"..KDDDDDDDDDDDDDDK..",
"...KKDDDKKKKDDDKK...",
".....KDDK...KDDK....",
".....KDDK...KDDK....",
".....KDDK...KDDK....",
"....KKKKK...KKKKK...",
"....................",
]
S("robot.png", ROBOT, scale=6)

FACE = [
"................",
"....KKKKKKKK....",
"..KKDDDDDDDDKK..",
".KDDDDDDDDDDDDK.",
".KKKKKKKKKKKKKK.",
"..KWWWWWWWWWWK..",
".KWWKKWWWWKKWWK.",
".KWWWWWWWWWWWWK.",
".KWWWWKKKKWWWWK.",
"..KWWWWWWWWWWK..",
"..KKKKKKKKKKKK..",
".KDDDDDDDDDDDDK.",
"KDDDAADDDDAADDDK",
".KDDDDDDDDDDDDK.",
"..KKKKKKKKKKKK..",
"................",
]
S("face.png", FACE, scale=6)

# ─────────────────────────── НАВИГАЦИЯ ───────────────────────────
S("nav_home.png", [
".....KK.....",
"....KDDK....",
"...KDDDDK...",
"..KDDDDDDK..",
".KDDKKDDDK..",
"KDDK.KK.KDDK",
"KDDK.KK.KDDK",
"KKKKKKKKKKK",
"...........",
], scale=7)

S("nav_map.png", [
"...KKKKKK...",
"..KDDDDDDK..",
".KDDDWWDDDK.",
".KDDDDDDDK.",
".KDDDDDDDK.",
"..KDDDDDK..",
"...KDDDK...",
"....KDK....",
"....KKK....",
], scale=7)

S("nav_sword.png", [
"..........KK...",
".........KWWK..",
"........KWWWK..",
".......KWWWWK..",
"......KWWWWWK..",
".....KWWWWWWK..",
"....KWWWWWWK...",
"...KWWWWWWK....",
"..KKKWWWWK.....",
".KWWKKWWK......",
"KWWK..KK.......",
".KK...K........",
"......KK.......",
".....KWWK......",
".....KWWK......",
"......KK.......",
], scale=6)

S("nav_book.png", [
"..KKKKKKKKKK..",
".KDDDDKKDDDDK.",
"KDDDDDKKDDDDDK",
"KDDDDDKKDDDDDK",
"KDDDDDKKDDDDDK",
"KDDDDDKKDDDDDK",
"KDDDDDKKDDDDDK",
".KKKKKKKKKKKK.",
"..............",
], scale=7)

S("nav_user.png", [
"....KKKK....",
"...KWWWWK...",
"..KWWWWWWK..",
"..KWWWWWWK..",
"...KWWWWK...",
"..KKKKKKKK..",
".KDDDDDDDDK.",
"KDDDDDDDDDDK",
"KDDDDDDDDDDK",
".KDDDDDDDDK.",
"..KKKKKKKK..",
], scale=7)

# ─────────────────────────── ИКОНКИ КВЕСТОВ ───────────────────────────
S("q_bench.png", [
"KKKKKKKKKKKKKKK",
"KDDDDDDDDDDDDDK",
"KKKKKKKKKKKKKKK",
"KDDDDDDDDDDDDDK",
"KKKKKKKKKKKKKKK",
"..KK......KK...",
"..KK......KK...",
"..KK......KK...",
".KKKK....KKKK..",
"KKKKKKKKKKKKKKK",
], scale=6)

S("q_recycle.png", [
"..KKKKKKKKKK...",
".KKKKKKKKKKKK..",
".KDDDDDDDDDDK..",
"KDDDKKKKKKDDDK.",
"KDDDWKKKKKWDDDK",
"KDDWK.K.KWDDDK.",
"KDDWKKKKKKWDDDK",
".KDDWKKKKWDDK..",
"..KDDDDDDDDK...",
"...KDDDDDK.....",
"....KKKKK......",
], scale=6)

S("q_plant.png", [
"......KK.......",
".....KWWK......",
"....KWWWWK.....",
"...KKWWWWKK....",
"..KWW.KK.WWK...",
".KWW..KK..WWK..",
"KWW...KK...WWK.",
"......KK.......",
"......KK.......",
".....KKKK......",
"....KKWWKK.....",
"...KKKWWKKK....",
"..KKKKKKKKKK...",
], scale=6)

S("q_lamp.png", [
".....KKKK......",
"....KWWWWK.....",
"...KKWWWWKK....",
"...KWWWWWWK....",
"....KWWWWK.....",
"......KK.......",
"......KK.......",
"......KK.......",
"......KK.......",
"......KK.......",
"....KKKKKK.....",
"...KKKKKKKK....",
], scale=6)

S("q_water.png", [
"...KKKKKK......",
"..KWWWWWWK.....",
"..KWWKKWWK.....",
"..KWWK.KK......",
"..KWWK.........",
"..KWWK..K......",
"..KKK...K......",
"........K......",
".......KK......",
"......KWWK.....",
"......KWWK.....",
".......KK......",
], scale=6)

S("q_hands.png", [
"..KK......KK..",
".KWWK....KWWK.",
".KWWWK..KWWWK.",
".KWWWWKKWWWWK.",
"..KWWWWWWWWK..",
"...KWWWWWWK...",
"....KWWWWK....",
".....KWWK.....",
"......KK......",
], scale=7)

S("q_books.png", [
".KKKKKKKKKKKK.",
"KWWWK....KWWWK",
"KWWWK.KK.KWWWK",
"KWWWK.KK.KWWWK",
"KWWWK.KK.KWWWK",
"KWWWK.KK.KWWWK",
".KKK..KK..KKK.",
], scale=7)

S("q_easel.png", [
"...K....K......",
"..KKK..KKK.....",
"...KWWWWK......",
"...KWWWWK......",
"..KWWWWWWK.....",
".KK.KK.KK.KK...",
"....K..K.......",
"....K..K.......",
"...KKK.KKK.....",
], scale=7)

# ─────────────────────────── ЭНЦИКЛОПЕДИЯ ───────────────────────────
S("e_drop.png", [
"......KK.......",
".....KWWK......",
"....KWWWWK.....",
"...KWWWWWWK....",
"..KWWWWWWWWK...",
"..KWWWWWWWWK...",
".KWWWWWWWWWWK..",
".KWWWWWWWWWWK..",
"KWWWWWWWWWWWWK.",
"KWWWWWWWWWWWWK.",
".KWWWWWWWWWWK..",
".KWWWWWWWWWWK..",
"..KWWWWWWWWK...",
"...KKKKKKKK....",
], scale=6)

S("e_bolt.png", [
"......KKK......",
".....KWWWK.....",
"....KWWWK......",
"...KWWWK.......",
"..KWWWWWWKK....",
"....KWWWWK.....",
"...KWWWK.......",
"..KWWWK........",
".KWWWK.........",
"KWWWW..........",
], scale=7)

S("e_apple.png", [
"....K....K.....",
"....KK.KK......",
".....KKK.......",
"..KWWWWWWWWK...",
".KWWWWWWWWWWK..",
"KWWWWWWWWWWWWK.",
"KWWWWWWWWWWWWK.",
"KWWWWWWWWWWWWK.",
"KWWWWWWWWWWWWK.",
"KWWWWWWWWWWWWK.",
".KWWWWWWWWWWK..",
"..KWWWWWWWWK...",
"...KKKKKKKK....",
], scale=6)

S("e_gear.png", [
"...KK....KK....",
"..KWWK..KWWK...",
"..KWWWKKWWWWK..",
".KWWWWWWWWWWK..",
"KKWWWWWWWWWWKK.",
"KWWWWK..KWWWWK.",
"KWWWK....KWWWK.",
"KWWWK....KWWWK.",
"KWWWK....KWWWK.",
"KWWWK....KWWWK.",
"KWWWWK..KWWWWK.",
"KKWWWWWWWWWWKK.",
".KWWWWWWWWWWK..",
"..KWWWKKWWWWK..",
"..KWWK..KWWK...",
"...KK....KK....",
], scale=6)

S("e_scales.png", [
"......KK.......",
"......KK.......",
".KKKKKKKKKKKKK.",
"......KK.......",
"..KK...KK...KK.",
".KWWK..KK..KWWK",
".KWWK..KK..KWWK",
"..KK...KK...KK.",
"......KK.......",
"......KK.......",
"....KKKKKK.....",
"...KK....KK....",
"..KK......KK...",
".KKKKKKKKKKKKK.",
], scale=6)

S("e_house.png", [
".....KKKK......",
"....KWWWWK.....",
"...KWWWWWWK....",
"..KWWWWWWWWK...",
".KWWKKKKKKWWK..",
"KWWWK....KWWWK.",
"KWWWK.KK.KWWWK.",
"KWWWK.KK.KWWWK.",
"KWWWK.KK.KWWWK.",
"KWWWK.KKKKWWWK.",
"KWWW......WWWK.",
"KKKKKKKKKKKKKK.",
], scale=6)

S("e_shield.png", [
"..KKKKKKKKKK...",
".KWWWWWWWWWWK..",
"KWWWWWWWWWWWWK.",
"KWWWKKKKKKWWWK.",
"KWWWK...KWWWWK.",
"KWWWK.K.KWWWWK.",
"KWWWK...KWWWWK.",
".KWWWWK.KWWWWK.",
"..KWWWWKWWWWK..",
"...KWWWWWWWK...",
"....KWWWWWK....",
".....KWWWK.....",
"......KWK......",
".......K.......",
], scale=6)

# ─────────────────────────── ИНСТРУМЕНТЫ (ЧЕК-ЛИСТ) ───────────────────────────
S("t_hammer.png", [
".KKKKKKK......",
"KWWWWWWWK.....",
"KWWWWWWWK.....",
".KKKKKKK......",
".....KK.......",
".....KK.......",
".....KK.......",
".....KK.......",
"....KKKK......",
], scale=7)

S("t_screwdriver.png", [
".......KK....",
"......KWWK...",
".....KWWWK...",
"....KKWWKK...",
"......KK.....",
"......KK.....",
"......KK.....",
".....KKKK....",
], scale=7)

S("t_pliers.png", [
".KK......KK..",
"KWWK....KWWK.",
"KWWWK..KWWWK.",
".KWWKKKKWWK..",
"..KWWWWWWK...",
"...KWWWWK....",
"....KWWK.....",
".....KK......",
], scale=7)

S("t_tape.png", [
"...KKKKKK...",
"..KWWWWWWK..",
".KWWWK.KWWWK",
".KWWK...KWWK",
".KWWK...KWWK",
".KWWWK.KWWWK",
"..KWWWWWWK..",
"...KKKKKK...",
], scale=7)

S("t_rope.png", [
".KK......KK.",
"KWWK....KWWK",
".KWK....KWK.",
"..KK....KK..",
"..KWK..KWK..",
"...KK..KK...",
"....KKKK....",
], scale=7)

S("t_flash.png", [
"....KKKK....",
"...KWWWWK...",
"..KWWWWWWK..",
"..KWWWWWWK..",
"...KKKKKK...",
".....KK.....",
".....KK.....",
"....KKKK....",
], scale=7)

S("t_knife.png", [
".KKKKKKKK....",
"KWWWWWWWW....",
".KWWWWWW.....",
"..KKKKKK.....",
"......KK.....",
"......KK.....",
".....KKKK....",
], scale=7)

S("t_bucket.png", [
".KKKKKKKKKKK.",
"K.KKKKKKKKK.K",
"..KWWWWWWK...",
"..KWWWWWWK...",
"..KWWWWWWK...",
"..KWWWWWWK...",
"...KKKKKK....",
], scale=7)

S("t_trowel.png", [
"...KKKK...",
"..KWWWWK..",
".KWWWWWWK.",
".KWWWWWWK.",
"..KWWWWK..",
"...KWWK...",
"....KK....",
"....KK....",
"...KKKK...",
], scale=7)

# ─────────────────────────── UI-ИКОНКИ ───────────────────────────
S("ui_lock.png", [
"...KKKKKK...",
"..KWWWWWWK..",
"..KWK..KWK..",
"..KWK..KWK..",
"..KWWWWWWK..",
".KKKKKKKKKK.",
"KWWWWWWWWWWK",
"KWWWKKKKWWWK",
"KWWWK.KKWWWK",
"KWWWK.KKWWWK",
"KWWWKKKKWWWK",
".KKKKKKKKKK.",
], scale=6)

S("ui_chat.png", [
".KKKKKKKKKKK.",
"KWWWWWWWWWWK.",
"KWWWWWWWWWWK.",
"KWWWWWWWWWWK.",
"KWWWWWWWWWWK.",
".KWWWWWWWWK..",
"..KWWWWWWK..",
"...KWWWWK...",
"....KKKK....",
], scale=6)

S("ui_send.png", [
"KKKKKKKKKKKKK.",
"KWWWWWWWWWWWK.",
".KWWWWWWWWWK..",
"..KWWWWWWWK...",
"...KWWWWWK....",
"..KWWWWWWK....",
".KWWK.KWWK....",
"KKK...KKK.....",
], scale=6)

S("ui_plus.png", [
".....KKK.....",
".....KKK.....",
".....KKK.....",
"KKKKKKKKKKKKK",
"KKKKKKKKKKKKK",
"KKKKKKKKKKKKK",
".....KKK.....",
".....KKK.....",
".....KKK.....",
".....KKK.....",
".....KKK.....",
".....KKK.....",
], scale=6)

S("ui_back.png", [
"......KK.....",
"....KKKK.....",
"..KKKKKK.....",
"KKKKKKKKKKKK.",
"..KKKKKK.....",
"....KKKK.....",
"......KK.....",
], scale=7)

S("ui_filter.png", [
"KKKKKKKKKKKKK",
"KWWWWWWWWWWWK",
".KWWWWWWWWWK.",
"..KWWWWWWWK..",
"...KWWWWWK...",
"....KWWWK....",
"....KWWK.....",
"....KWWK.....",
"....KWWK.....",
"...KKWWKK....",
], scale=6)

S("ui_close.png", [
"KK........KK",
".KK......KK.",
"..KK....KK..",
"...KK..KK...",
"....KKKK....",
"....KKKK....",
"...KK..KK...",
"..KK....KK..",
".KK......KK.",
"KK........KK",
], scale=6)

S("ui_download.png", [
".KK......KK.",
".KK......KK.",
".KK......KK.",
".KKKKKKKKKK.",
"..KKWWWWKK..",
"...KWWWWK...",
"....KWWK....",
".....KK.....",
".....KK.....",
"KKKKKKKKKKKK",
], scale=6)

S("ui_search.png", [
"...KKKKK....",
"..KWWWWWK...",
".KWWWWWWWK..",
".KWWK.KWWK..",
".KWWWWWWWK..",
"..KWWWWWK...",
"...KKKKK.K..",
"........KK..",
".......KKK..",
"......KK....",
], scale=6)

S("ui_edit.png", [
"..........KK",
".........KWK",
"........KWWK",
".......KWWWK",
"......KWWWWK",
".....KWWWWWK",
"....KWWWWWK.",
"...KKKKKK...",
"..KK........",
".KK.........",
], scale=6)

S("ui_info.png", [
"...KKKKKK...",
"..KWWWWWWK..",
"..KWWKKWWK..",
"..KWWKKWWK..",
"..KWWWWWWK..",
"..KWWKKWWK..",
"..KWWKKWWK..",
"..KWWKKWWK..",
"...KKKKKK...",
], scale=6)

S("ui_star.png", [
".......K.......",
"......KKK......",
".......K.......",
".K.....K.....K.",
".KK...KKK...KK.",
"..KKKKKKKKKK..",
"...KKKKKKKK...",
".KKKKKKKKKKKK.",
"..KK...K...KK..",
".K.....K.....K",
".......K.......",
"......KKK......",
".......K.......",
], scale=6)

S("ui_tg.png", [
".KKKKKKKKKKKK.",
"KWWWWWWWWWWWWK",
".KWWWWWWWWWWK.",
"..KKWWWWWWKK..",
"...KKWWWWKK...",
"....KKWWKK....",
".....KKK......",
"......K.......",
], scale=6)

S("ui_heart.png", [
"...KK....KK...",
"..KWWK..KWWK..",
"..KWWWWWWWWK..",
"..KWWWWWWWWK..",
"...KWWWWWWK...",
"....KWWWWK....",
".....KWWK.....",
"......KK......",
], scale=6)

S("ui_coin.png", [
"...KKKKKK...",
"..KWAAAAWK..",
".KWAAAAAAWK.",
".KWAAKKAAWK.",
".KWAKAAKAWK.",
".KWAAKKAAWK.",
".KWAAAAAAWK.",
"..KWAAAAWK..",
"...KKKKKK...",
], scale=6)

S("ui_trophy.png", [
"..KKKKKKKK..",
".KWAAAAAAWK.",
".KWAAAAAAWK.",
"..KWAAA AWK.".replace(" ",""),
"...KWA AWK..".replace(" ",""),
".....KWK.....",
"...KKKKKK....",
"...K....K....",
"..KKK..KKK...",
], scale=6)

S("ui_calendar.png", [
".KKKKKKKKKKKK.",
"KWK.KKKK.K.KWK",
"KKKKKKKKKKKKK",
"K............K",
"K.KK.KK.KK.KK.",
"K.KK.KK.KK.KK.",
"K............K",
"KKKKKKKKKKKKKK",
], scale=6)

S("ui_vote.png", [
"...KKKKKKKK...",
"..KWWWWWWWWK..",
"..KWWK....WK..",
"..KWWK.KK.WK..",
"..KWWK..KKWK..",
"..KWWK....WK..",
"..KWWWWWWWWK..",
"...KKKKKKKK...",
"....K....K....",
"...KKK..KKK...",
], scale=6)

S("ui_camera.png", [
".KKKKKKKKKKKK.",
"KWWWKKKKKKWWWK",
"KWWK......KWWK",
"KWWK.KKKK.KWWK",
"KWWK.KAAK.KWWK",
"KWWK.KKKK.KWWK",
"KWWK......KWWK",
".KKKKKKKKKKKK.",
], scale=6)

S("ui_mic.png", [
"...KKKKKK...",
"..KWWWWWWK..",
"..KWWWWWWK..",
"..KWWWWWWK..",
"..KWWWWWWK..",
"...KKKKKK...",
".....KK.....",
".....KK.....",
"....KKKK....",
"...KK..KK...",
], scale=6)

S("ui_paint.png", [
".....KKKK......",
"....KWWWWK.....",
"....KWWWWK.....",
"...KKKKKKKK....",
"..KWWWWWWWWK...",
"..KWWAAWWWWK...",
"..KWWAAWWWWK...",
"..KWWWWWWWWK...",
"..KWWWWWWWWK...",
"..KWWWWWWWWK...",
"..KWWWWWWWWK...",
"..KWWWWWWWWK...",
"...KKKKKKKK....",
], scale=6)

S("ui_bell.png", [
"....KKKKKK....",
"...KWWWWWWK...",
"..KWWWWWWWWK..",
".KWWWWWWWWWWK.",
"KWWWKKKKWWWWK.",
"KWWKKKKKKWWWK.",
"KWWKKKKKKWWWK.",
".KKKKKKKKKKKK.",
".....KKKK.....",
".....KWWK.....",
], scale=6)

S("ui_qr.png", [
"KKKKKKKKKKKKKKK",
"KWWWK.K.K.WWWK",
"KWWWK.K.K.WWWK",
"KWWWWWWK.WWWWW",
"K....K.K.K...K",
".KKK.KKKKK.KK.",
"K...K.K...K..K",
"K.KKK.KKK.KKK.",
"K.K...K.K.K..K",
"K.K.KKKKK.KK.K",
"K...K...K...K.",
"KKKKKKKKKKKKKK",
], scale=6)

# ─────────────────────────── МАРКЕРЫ КАРТЫ ───────────────────────────
S("mk_problem.png", [
"....KKKKKK....",
"..KKWWWWWWKK..",
".KWWWWWWWWWWK.",
".KWWWKWWKWWWWK",
"KWWWWKWWKWWWWW",
"KWWWWKWWKWWWWW",
".KWWWKWWKWWWWK",
".KWWWWKWWKWWWK",
"..KWWWKKWWWWK.",
"...KWWWWWWK...",
"....KWWWWK....",
".....KWWK.....",
"......KK......",
], scale=6)

S("mk_quest.png", [
"....KKKKKK....",
"..KKWWWWWWKK..",
".KWWWWWWWWWWK.",
".KWWWKKKKKWWWK",
".KWWWK...KWWWK",
"KWWWWK...KWWWW",
"KWWWWKKKKKWWWW",
".KWWWWK...KWWWK",
"..KWWWK...KWWK.",
"...KWWWWWWWK...",
"....KWWWWK....",
".....KWWK.....",
"......KK......",
], scale=6)

S("mk_done.png", [
"....KKKKKK....",
"..KKWWWWWWKK..",
".KWWWWWWWWWWK.",
".KWWWWWWWWWWWK",
"KWWWKWWWWWWWWW",
"KWWWWKWWWWWWWW",
"KWWWWWKWWWWWWW",
".KWWWWWWKWWWWK",
".KWWWWWWWKWWWK",
"..KWWWWWWWK...",
"...KWWWWWWK...",
"....KWWWWK....",
".....KWWK.....",
"......KK......",
], scale=6)

S("mk_project.png", [
"....KKKKKK....",
"..KKWWWWWWKK..",
".KWWWWWWWWWWK.",
".KWWWKKKKWWWWK",
"KWWWKWAAWKWWWW",
"KWWWKWAAWKWWWW",
"KWWWKWAAWKWWWW",
".KWWWKKKKWWWWK",
"..KWWWWWWWWK..",
"...KWWWWWWK...",
"....KWWWWK....",
".....KWWK.....",
"......KK......",
], scale=6)

# ─────────────────────────── БЕЙДЖИ (скаутские) ───────────────────────────
def badge(name, icon_rows, inner_scale=3):
    B = 18
    img = Image.new('RGBA', (B*6, B*6), (0,0,0,0))
    px = img.load()
    cx = cy = (B-1)/2
    for y in range(B):
        for x in range(B):
            r = math.hypot(x-cx, y-cy)
            if 7.2 <= r <= 8.8:
                for dy in range(6):
                    for dx in range(6):
                        px[x*6+dx, y*6+dy] = (18,18,18,255)
    # внутренний значок
    icon = make(icon_rows, inner_scale)
    icon = icon.resize((10*6//1, 10*6//1), Image.NEAREST)
    ih = len(icon_rows); iw = max(len(r) for r in icon_rows)
    icon2 = make(icon_rows, 6*10//max(iw, ih))
    img.alpha_composite(icon2, ((B*6-icon2.width)//2, (B*6-icon2.height)//2))
    save(img, name)

badge("bd_water.png", [
"...KK...",
"..KAWK..",
"..KAWK..",
".KAAAAK.",
".KAAAAK.",
"..KAAK..",
"...KK...",
])
badge("bd_energy.png", [
"...KK.",
"..KAK.",
"..KAK.",
".KKAKK",
"..KAK.",
".KAK..",
"KAK...",
])
badge("bd_garden.png", [
"..K.K..",
".KAKAK.",
"..KAK..",
"...K...",
"..KAK..",
".KKAKK.",
"KKKKKKK",
])
badge("bd_repair.png", [
".KK.KK.",
"KAAKKAAK",
".KAAAAK",
"KKAAAKK",
".KAAAAK",
"KAAKKAAK",
".KK.KK.",
])
badge("bd_help.png", [
".K...K.",
"KAK.KAK",
"KAAAAAK",
".KAAAK.",
"..KAK..",
"...K...",
])
badge("bd_voice.png", [
".KKKK.",
"KAAAAK",
"KAAAAK",
".KKKK.",
"..K...",
".KKK.",
"K.K",
])
badge("bd_book.png", [
"KKKKKKK",
"KAAKAAK",
"KAAKAAK",
"KAAKAAK",
"KKKKKKK",
])
badge("bd_law.png", [
"K.K.K.K",
"KKKKKKK",
".K.K.K.",
"K.K.K.K",
"..KKK..",
".K...K.",
"KKKKKKK",
])

# ─────────────────────────── КАСТОМИЗАЦИЯ (16×16) ───────────────────────────
S("hat_cap.png", [
"................",
"....KKKKKKKK....",
"..KKDDDDDDDDKK..",
".KDDDDDDDDDDDDK.",
".KKKKKKKKKKKKKK.",
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
], scale=6)

S("hat_helmet.png", [
"................",
"....KKKKKKKK....",
"..KKAAAAAAAAKK..",
".KAAAAAAAAAAAAK.",
".KKKKKKKKKKKKKK.",
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
], scale=6)

S("hat_beanie.png", [
"................",
"....KKKKKKKK....",
"..KKLLLLLLLLKK..",
".KLLLLLLLLLLLLK.",
".KLLLLLLLLLLLLK.",
"..KKKKKKKKKKKK..",
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
], scale=6)

S("hat_crown.png", [
"................",
".K.K.K.K.K.K.K..",
".KKKKKKKKKKKKKK.",
"..KAAAAAAAAAK...",
"..KKKKKKKKKKKK..",
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
], scale=6)

S("acc_glasses.png", [
"................",
"................",
"................",
"................",
"................",
"................",
".KKKKK....KKKKK.",
".KDDDK.KK.KDDDK.",
".KKKKK.KK.KKKKK.",
"................",
"................",
"................",
"................",
"................",
"................",
"................",
], scale=6)

S("acc_scarf.png", [
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
".KAAAAAAAAAAAAK.",
"..KAAK....KAAK..",
"................",
"................",
"................",
"................",
], scale=6)

S("acc_mask.png", [
"................",
"................",
"................",
"................",
"................",
"................",
"..KKKKKKKKKKKK..",
".KWWWWWWWWWWWWK.",
".KWKKWWWWWWKKWK.",
"..KKKKKKKKKKKK..",
"................",
"................",
"................",
"................",
"................",
"................",
], scale=6)

S("acc_phones.png", [
"................",
".KK..........KK.",
".KDK........KDK.",
".KDK........KDK.",
".KDK........KDK.",
".KK..........KK.",
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
], scale=6)

# ─────────────────────────── КРАУДФАНДИНГ-АРТ ───────────────────────────
S("cf_slide.png", [
"....KK................",
"....KDK................",
"....KKKKKKK............",
"....KDK...K............",
"....KDK...KKKKKKK......",
"....KKK...KDDDDDK......",
"..........KDDDDDK......",
"...........KDDDDDK.....",
"...........KDDDDDK.....",
"............KDDDDKK....",
".............KKKK......",
], scale=5)

S("cf_trees.png", [
"....KKK.........KKK....",
"..KKKKKKK.....KKKKKKK..",
".KKKKKKKKK...KKKKKKKKK.",
"..KKKKKKK.....KKKKKKK..",
"....KKK.........KKK....",
".....K...........K.....",
".....K...........K.....",
".....KK.........KK.....",
], scale=5)

# ─────────────────────────── СТИКЕР (герой с табличкой 21) ───────────────────────────
st, ss = blank(34, 30, scale=6)
# герой
stamp(st, HERO, 2, 2, ss)
# табличка
for y in range(12, 24):
    for x in range(15, 33):
        c = None
        if y in (12, 23) or x in (15, 32): c = 'K'
        if c: stamp(st, [c], x, y, ss)
stamp(st, ['W'], 16, 13, ss)
# цифра 21 на табличке
dx = 19
for ch in "21":
    for y, row in enumerate(DIG[ch]):
        for x, c in enumerate(row):
            if c == 'K':
                stamp(st, ['K'], dx+x, 16+y, ss)
    dx += 6
save(st, "sticker.png")

# favicon
fav = make([
"....KKKKKK....",
"..KKDDDDDDKK..",
".KDDDDDDDDDDK.",
"KDDDAAKKAADDDK",
"KDDDAKKKKA DDK".replace(" ",""),
"KDDDAKKKKA DDK".replace(" ",""),
"KDDDAAKKAADDDK",
".KDDDDDDDDDDK.",
"..KKDDDDDDKK..",
"....KKKKKK....",
], scale=4)
save(fav, "favicon.png")

print("\nВсе ассеты созданы в", OUT)
