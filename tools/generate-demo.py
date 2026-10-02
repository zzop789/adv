"""Generate original silent animation clips and Windows icons for both works.

Optional authoring dependencies: numpy, opencv-python, Pillow. These generated
assets are committed ready to use; players never need Python or these packages.
All shapes, colors and motion are original procedural artwork, with no downloads.
"""
from pathlib import Path
import math
import cv2
import numpy as np
from PIL import Image, ImageDraw

WIDTH, HEIGHT, FPS, SECONDS = 960, 540, 24, 6
ROOT = Path(__file__).resolve().parents[1]
XX, YY = np.meshgrid(np.arange(WIDTH), np.arange(HEIGHT))
STARS = np.random.default_rng(42).random((48, 3))
DUST = np.random.default_rng(17).random((32, 3))


def gradient(top, bottom):
    return np.repeat(np.linspace(top, bottom, HEIGHT).astype(np.uint8)[:, None, :], WIDTH, axis=1)


def poly(im, points, color):
    cv2.fillPoly(im, [np.array(points, np.int32)], color, cv2.LINE_AA)


def line(im, p, q, color, width=1):
    cv2.line(im, tuple(map(int, p)), tuple(map(int, q)), color, width, cv2.LINE_AA)


def circle(im, p, radius, color):
    cv2.circle(im, tuple(map(int, p)), int(radius), color, -1, cv2.LINE_AA)


def glow(im, x, y, radius, color, strength=.6):
    l, r = max(0, int(x-radius*2)), min(WIDTH, int(x+radius*2))
    t, b = max(0, int(y-radius*2)), min(HEIGHT, int(y+radius*2))
    if r <= l or b <= t:
        return
    area = im[t:b, l:r]
    w = (np.exp(-((XX[t:b, l:r]-x)**2+(YY[t:b, l:r]-y)**2)/radius**2)*strength)[..., None]
    area[:] = np.uint8(np.clip(area*(1-w)+np.array(color)*w, 0, 255))


def leaf(im, p, axes, angle, color):
    cv2.ellipse(im, tuple(map(int, p)), axes, angle, 0, 360, color, -1, cv2.LINE_AA)


def bird(im, x, y, time):
    wing = math.sin(time*4)*4
    line(im, (x-9, y-wing), (x, y+2), (128, 145, 138))
    line(im, (x, y+2), (x+9, y-wing), (128, 145, 138))


NIGHT = gradient((10, 24, 33), (39, 58, 60))
SEA = gradient((36, 56, 64), (9, 24, 34))
TABLE = gradient((205, 181, 148), (189, 151, 113))
CAFE = gradient((229, 208, 171), (229, 181, 127))


def sea(time, moon=True, reflection=680):
    im = NIGHT.copy()
    glow(im, 655, 176, 215, (112, 112, 83), .38)
    for sx, sy, bright in STARS:
        v = int(90+80*bright+20*math.sin(time*1.1+sx*40))
        circle(im, (sx*WIDTH, 20+sy*225), 1, (v, v, int(v*.9)))
    if moon:
        glow(im, 701, 137, 61, (215, 204, 158), .24)
        circle(im, (701, 137), 30, (220, 207, 167))
        circle(im, (711, 129), 27, (44, 58, 60))
    im[302:] = SEA[302:]
    line(im, (0, 302), (960, 302), (90, 104, 96))
    for n in range(30):
        y = 311+n*7.8
        xs = np.arange(-10, WIDTH+10, 4)
        ys = y+np.sin(xs/(38+n*1.9)+time*1.15+n*.6)*(1+n*.09)
        cv2.polylines(im, [np.stack((xs, ys), axis=1).astype(np.int32)], False, (35+n//4, 58+n//5, 64), 1, cv2.LINE_AA)
        rx, length, gold = reflection+math.sin(time*1.15+n*1.5)*(n+4), 7+n*1.4, max(42, 131-n*2.5)
        line(im, (rx-length, y+2), (rx+length, y+2), (int(gold), int(gold*.88), int(gold*.59)))
    haze = im.copy()
    for n in range(4):
        cv2.ellipse(haze, (int((n*310+time*11)%1240)-100, 279+n*7), (330, 12+n*4), 0, 0, 360, (145, 157, 143), -1, cv2.LINE_AA)
    cv2.addWeighted(haze, .14, im, .86, 0, im)
    return im


def opening(time):
    im = sea(time)
    poly(im, [(0, 319), (90, 314), (150, 329), (242, 320), (335, 339), (0, 339)], (16, 32, 39))
    for x in (21, 94, 167, 240):
        line(im, (x, 333), (x, 365), (17, 29, 33), 4)
    line(im, (12, 318), (282, 329), (53, 61, 51), 3)
    line(im, (114, 320), (114, 253), (20, 33, 36), 4)
    line(im, (114, 254), (144, 254), (20, 33, 36), 3)
    glow(im, 141, 265, 25, (230, 185, 101), .3)
    circle(im, (141, 265), 4, (240, 203, 126))
    x, y = 432+time*9, 358+math.sin(time*1.7)*2
    poly(im, [(x-43, y), (x+38, y), (x+25, y+12), (x-24, y+12)], (17, 30, 37))
    line(im, (x, y), (x, y-57), (32, 43, 46), 2)
    poly(im, [(x+3, y-54), (x+3, y-5), (x+30, y-5)], (96, 102, 85))
    poly(im, [(x-3, y-45), (x-3, y-5), (x-23, y-5)], (49, 65, 65))
    bird(im, 317+time*12, 151+math.sin(time)*3, time)
    return im


def lighthouse(time):
    im = sea(time, False, 688)
    beam, x = im.copy(), 250+math.sin(time*.65)*330
    poly(beam, [(690, 147), (x-145, 76), (x+95, 289)], (196, 185, 125))
    cv2.addWeighted(beam, .18, im, .82, 0, im)
    glow(im, 689, 148, 90, (250, 210, 132), .23)
    poly(im, [(619, 322), (663, 315), (687, 299), (730, 321), (746, 313), (808, 341), (599, 341)], (18, 32, 37))
    poly(im, [(671, 308), (680, 166), (701, 166), (713, 312)], (200, 194, 154))
    poly(im, [(694, 167), (701, 167), (713, 312), (697, 310)], (133, 143, 127))
    poly(im, [(677, 217), (705, 217), (708, 247), (675, 246)], (60, 76, 77))
    cv2.rectangle(im, (675, 158), (707, 168), (31, 47, 51), -1)
    cv2.rectangle(im, (679, 138), (702, 157), (238, 212, 141), -1)
    for x in (679, 690, 702):
        line(im, (x, 138), (x, 158), (36, 49, 52), 2)
    poly(im, [(672, 138), (690, 126), (709, 138)], (39, 50, 47))
    line(im, (689, 126), (689, 119), (78, 86, 68), 2)
    cv2.rectangle(im, (687, 280), (696, 312), (44, 63, 61), -1)
    glow(im, 690, 148, 21, (255, 226, 156), .33+.07*math.sin(time))
    bird(im, 212+time*19, 189+math.sin(time*.7)*9, time)
    return im


def shore(time):
    im = sea(time, reflection=352)
    poly(im, [(0, 262), (190, 271), (331, 260), (480, 278), (538, 303), (0, 326)], (22, 39, 45))
    for n, (x, y, w, h) in enumerate([(42, 267, 79, 50), (140, 243, 87, 72), (246, 262, 71, 53), (335, 247, 102, 70)]):
        cv2.rectangle(im, (x, y), (x+w, y+h), (53+n*4, 61+n*3, 59), -1)
        poly(im, [(x-8, y), (x+w/2, y-27), (x+w+8, y)], (25, 42, 46))
        for wx in (x+17, x+w-29):
            light = int(170+9*math.sin(time*.7+n))
            cv2.rectangle(im, (wx, y+15), (wx+12, y+29), (light+34, light, 98), -1)
            glow(im, wx+6, y+22, 25, (237, 185, 91), .12)
        cv2.rectangle(im, (x+w//2-6, y+h-23), (x+w//2+6, y+h), (32, 45, 43), -1)
    line(im, (0, 322), (537, 322), (58, 71, 65), 4)
    for x in range(0, 537, 64):
        line(im, (x, 322), (x, 346), (30, 42, 44), 4)
    poly(im, [(775, 389), (836, 376), (960, 383), (960, 540), (748, 540)], (15, 29, 35))
    line(im, (850, 390), (850, 191), (26, 39, 40), 6)
    line(im, (849, 191), (799, 191), (26, 39, 40), 5)
    glow(im, 800, 213, 87, (224, 176, 84), .35)
    poly(im, [(787, 198), (813, 198), (809, 225), (790, 225)], (240, 194, 108))
    poly(im, [(784, 198), (800, 188), (816, 198)], (45, 49, 42))
    line(im, (798, 198), (798, 224), (96, 81, 50), 2)
    bird(im, 533+time*17, 213+math.sin(time)*4, time)
    return im


def table(time):
    im = TABLE.copy()
    glow(im, 710-time*4, 110, 375, (255, 236, 180), .35)
    for y in range(85, HEIGHT, 91):
        line(im, (0, y), (960, y+14), (173, 139, 107), 2)
        line(im, (0, y+3), (960, y+17), (216, 184, 142))
    shade, o = im.copy(), int(math.sin(time*.35)*13)
    poly(shade, [(0, 0), (239+o, 0), (472+o, 540), (0, 540)], (91, 110, 111))
    poly(shade, [(328+o, 0), (355+o, 0), (599+o, 540), (562+o, 540)], (95, 112, 108))
    cv2.addWeighted(shade, .18, im, .82, 0, im)
    return im


def dust(im, time):
    for x, y, size in DUST:
        circle(im, ((x*WIDTH+time*(3+size*2))%WIDTH, (y*HEIGHT-time*(3+size))%HEIGHT), 1+size, (244, 224, 173))


def letter(time):
    im, sway = table(time), math.sin(time*.95)*6
    line(im, (47, 0), (156+sway, 245), (74, 98, 75), 5)
    for i in range(5):
        y, x = 36+i*39, 64+i*18+sway*i/5
        leaf(im, (x-19, y), (32, 12), 37, (81+i*3, 111+i*2, 82))
        leaf(im, (x+24, y+18), (35, 12), -24, (100+i*3, 127+i*2, 90))
    shade = im.copy()
    poly(shade, [(298, 184), (733, 216), (705, 445), (271, 412)], (91, 87, 70))
    cv2.addWeighted(shade, .24, im, .76, 0, im)
    poly(im, [(286, 169), (721, 203), (697, 421), (262, 389)], (239, 223, 186))
    poly(im, [(286, 169), (482, 330+math.sin(time)*1.3), (721, 203)], (250, 237, 207))
    poly(im, [(262, 389), (473, 283), (697, 421)], (244, 230, 196))
    for p, q in [((262, 389), (456, 272)), ((697, 421), (524, 282)), ((286, 169), (482, 330)), ((482, 330), (721, 203))]:
        line(im, p, q, (214, 194, 157))
    circle(im, (483, 325), 24, (123, 64, 48))
    circle(im, (482, 322), 23, (174, 74, 48))
    cv2.ellipse(im, (482, 322), (16, 16), 0, 0, 360, (194, 98, 66), 1, cv2.LINE_AA)
    line(im, (482, 330), (483, 313), (134, 55, 43), 2)
    leaf(im, (477, 317), (5, 3), 25, (134, 55, 43))
    leaf(im, (488, 321), (5, 3), -25, (134, 55, 43))
    dust(im, time)
    return im


def meet(time):
    im = CAFE.copy()
    glow(im, 681, 178+time*.7, 142, (255, 240, 179), .5)
    circle(im, (681, 178+time*.7), 40, (249, 221, 156))
    for i, (x, y, w) in enumerate([(20, 220, 95), (134, 243, 120), (277, 209, 113), (420, 239, 125), (598, 255, 99), (731, 232, 130), (894, 250, 80)]):
        cv2.rectangle(im, (x, y), (x+w, 355), (138+i*5, 157+i*2, 146+i), -1)
        poly(im, [(x-7, y), (x+w/2, y-26), (x+w+7, y)], (119+i*5, 143+i*2, 139+i))
        for wx in range(x+15, x+w-8, 27):
            cv2.rectangle(im, (wx, y+19), (wx+11, y+37), (208, 194, 151), -1)
    cv2.rectangle(im, (0, 330), (960, 371), (95, 126, 119), -1)
    line(im, (0, 337), (960, 337), (196, 190, 151), 3)
    for x in (44, 479, 916):
        cv2.rectangle(im, (x, 0), (x+14, 380), (57, 84, 87), -1)
        line(im, (x+15, 0), (x+15, 380), (118, 134, 117), 3)
    cv2.rectangle(im, (0, 62), (960, 73), (63, 88, 87), -1)
    cv2.rectangle(im, (0, 366), (960, 393), (55, 78, 78), -1)
    cv2.rectangle(im, (0, 393), (960, 540), (158, 111, 81), -1)
    for y in (425, 477, 520):
        line(im, (0, y), (960, y+8), (142, 95, 70))
    leaf(im, (346, 453), (107, 26), 0, (113, 85, 68))
    leaf(im, (335, 442), (99, 22), 0, (226, 210, 175))
    cv2.ellipse(im, (389, 412), (25, 24), 0, -90, 100, (242, 229, 195), 8, cv2.LINE_AA)
    poly(im, [(278, 383), (288, 437), (308, 449), (351, 449), (373, 436), (386, 383)], (244, 232, 198))
    leaf(im, (332, 384), (54, 12), 0, (222, 205, 168))
    leaf(im, (332, 384), (46, 8), 0, (99, 64, 44))
    steam = im.copy()
    for i in range(3):
        ys = np.arange(286, 376, 2)
        xs = 312+i*18+np.sin((ys-286)/19-time*2+i)*5
        cv2.polylines(steam, [np.stack((xs, ys), axis=1).astype(np.int32)], False, (246, 237, 211), 2, cv2.LINE_AA)
    cv2.addWeighted(steam, .4, im, .6, 0, im)
    poly(im, [(609, 420), (784, 412), (803, 493), (623, 502)], (232, 218, 185))
    line(im, (625, 440), (766, 435), (172, 177, 153))
    line(im, (629, 453), (735, 449), (172, 177, 153))
    for i in range(5):
        leaf(im, ((178+i*131+time*11)%WIDTH, 110+i*36+math.sin(time+i)*11), (5, 2), time*15+i*31, (189, 133, 91))
    return im


def reply(time):
    im = table(time)
    poly(im, [(266, 61), (740, 102), (703, 490), (229, 449)], (155, 130, 100))
    poly(im, [(252, 47), (725, 88), (689, 478), (215, 438)], (248, 239, 211))
    poly(im, [(657, 474), (689, 442), (689, 478)], (210, 200, 171))
    for i in range(9):
        line(im, (273, 133+i*32), (658, 164+i*32), (219, 218, 194))
    circle(im, (641, 151), 15, (184, 90, 67))
    cv2.ellipse(im, (641, 151), (11, 11), 0, 0, 360, (216, 150, 112), 1, cv2.LINE_AA)
    total, px, py = time/SECONDS*4.5, 303, 183
    for row in range(4):
        fraction = min(1, max(0, total-row))
        if fraction <= 0:
            continue
        xs = np.arange(max(2, int(247*fraction)))
        ys = 180+row*49+xs*.08+np.sin(xs*.18)*3+np.sin(xs*.41)*2
        points = np.stack((xs+300-row*4, ys), axis=1).astype(np.int32)
        cv2.polylines(im, [points], False, (78, 105, 110), 1, cv2.LINE_AA)
        if fraction < 1 or row == 3:
            px, py = map(int, points[-1])
    poly(im, [(px, py), (px+25, py-31), (px+106, py-154), (px+90, py-163), (px+15, py-38)], (159, 133, 93))
    poly(im, [(px+13, py-34), (px+92, py-157), (px+104, py-150), (px+27, py-27)], (47, 74, 84))
    line(im, (px+22, py-36), (px+95, py-150), (98, 117, 116), 2)
    poly(im, [(px, py), (px+13, py-34), (px+27, py-27)], (197, 161, 96))
    line(im, (px, py), (px+16, py-28), (82, 76, 59))
    leaf(im, (809, 402), (41, 12), 0, (141, 111, 81))
    cv2.rectangle(im, (779, 345), (837, 400), (50, 78, 87), -1)
    leaf(im, (808, 346), (29, 10), 0, (88, 106, 103))
    leaf(im, (808, 344), (20, 6), 0, (22, 42, 51))
    cv2.rectangle(im, (789, 366), (827, 388), (207, 194, 155), -1)
    dust(im, time)
    return im


def icon(work):
    canvas = Image.new('RGBA', (512, 512), (0, 0, 0, 0))
    d = ImageDraw.Draw(canvas)
    if work == 'demo':
        d.rounded_rectangle((12, 12, 500, 500), 88, fill='#142a34')
        d.ellipse((284, 70, 382, 168), fill='#ddc38a')
        d.ellipse((307, 54, 397, 148), fill='#142a34')
        d.polygon([(245, 164), (57, 204), (63, 111)], fill='#5e6b5c')
        d.polygon([(224, 350), (235, 175), (277, 175), (290, 350)], fill='#e7d3a1')
        d.rectangle((231, 250, 282, 284), fill='#637775')
        d.rectangle((228, 170, 283, 186), fill='#a5946e')
        d.rectangle((236, 138, 275, 169), fill='#e9c779')
        d.polygon([(225, 139), (255, 115), (286, 139)], fill='#baa677')
        d.polygon([(163, 366), (225, 341), (289, 350), (348, 367)], fill='#839387')
        for row in range(4):
            y = 387+row*23
            d.arc((58+row*12, y-13, 441-row*12, y+13), 0, 165, fill='#788f86', width=4)
    else:
        d.rounded_rectangle((12, 12, 500, 500), 88, fill='#f1ebdb')
        d.rounded_rectangle((71, 144, 441, 378), 11, fill='#273e4c')
        d.polygon([(76, 368), (254, 230), (436, 368)], fill='#3b5661')
        d.polygon([(76, 148), (256, 297), (436, 148)], fill='#526c72')
        d.line((76, 148, 256, 297, 436, 148), fill='#c7c9af', width=6)
        d.ellipse((217, 257, 295, 335), fill='#b64f38')
        d.ellipse((228, 268, 284, 324), outline='#dfb18c', width=3)
        d.line((255, 311, 255, 282), fill='#e3b993', width=4)
        d.ellipse((240, 280, 256, 290), fill='#e3b993')
        d.ellipse((255, 291, 271, 301), fill='#e3b993')
        d.line((329, 99, 394, 99), fill='#b64f38', width=6)
        d.line((357, 115, 419, 115), fill='#b64f38', width=4)
    target = ROOT / f'games/{work}/media/icon.ico'
    target.parent.mkdir(parents=True, exist_ok=True)
    sizes = {(n, n) for n in (256, 128, 64, 48, 32, 16)}
    canvas.save(target, format='ICO', sizes=sorted(sizes))
    with Image.open(target) as check:
        assert check.ico.sizes() == sizes
    print(f'Generated {work}/icon.ico: {target.stat().st_size:,} bytes, six resolutions', flush=True)


def render(work, name, scene):
    target = ROOT / f'games/{work}/media/{name}.webm'
    target.parent.mkdir(parents=True, exist_ok=True)
    writer = cv2.VideoWriter(str(target), cv2.VideoWriter_fourcc(*'VP80'), FPS, (WIDTH, HEIGHT))
    if not writer.isOpened():
        raise RuntimeError('This OpenCV build does not support VP8 WebM encoding')
    try:
        for frame in range(FPS*SECONDS):
            writer.write(cv2.cvtColor(scene(frame/FPS), cv2.COLOR_RGB2BGR))
    finally:
        writer.release()
    cap = cv2.VideoCapture(str(target))
    try:
        assert cap.isOpened(), f'Cannot decode {target}'
        width, height = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)), int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        fps, frames = cap.get(cv2.CAP_PROP_FPS), int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        assert (width, height) == (WIDTH, HEIGHT)
        assert frames == FPS*SECONDS and abs(fps-FPS) < .01
        ok, first = cap.read()
        assert ok
        cap.set(cv2.CAP_PROP_POS_FRAMES, FPS*3)
        ok, middle = cap.read()
        assert ok and np.mean(np.abs(first.astype(float)-middle.astype(float))) > .1
    finally:
        cap.release()
    print(f'Generated {work}/{name}.webm: {target.stat().st_size:,} bytes, {frames/fps:.1f}s, {width}x{height}, {fps:.0f}fps, VP8, silent', flush=True)


def main():
    for work, name, scene in [('demo', 'opening', opening), ('demo', 'lighthouse', lighthouse), ('demo', 'shore', shore), ('afterglow', 'letter', letter), ('afterglow', 'meet', meet), ('afterglow', 'reply', reply)]:
        render(work, name, scene)
    for work in ('demo', 'afterglow'):
        icon(work)


if __name__ == '__main__':
    main()
