"""EuroKink - generate Instagram feed-post graphics (1080x1350 JPEG).

Usage:
  python3 make.py playstore OUT.jpg
  python3 make.py spotlight OUT.jpg "<title_fr>" "<title_en>" "<date_fr>" "<city>" "<flag_emoji>"
"""
import sys
from PIL import Image, ImageDraw, ImageFont, ImageFilter

W, H = 1080, 1350
BG, SURF, BORDER = (14, 14, 14), (26, 26, 26), (44, 44, 44)
TXT, MUTED, RED, RED_T = (237, 237, 237), (150, 150, 150), (208, 20, 44), (255, 90, 106)
FD = '/usr/share/fonts/opentype/inter/'
EMOJI = '/usr/share/fonts/truetype/noto/NotoColorEmoji.ttf'
_fc = {}

def F(name, size):
    k = (name, size)
    if k not in _fc:
        _fc[k] = ImageFont.truetype(FD + name + '.otf', size)
    return _fc[k]

BLACK = lambda s: F('InterDisplay-Black', s)
BOLD = lambda s: F('Inter-Bold', s)
SEMI = lambda s: F('Inter-SemiBold', s)
REG = lambda s: F('Inter-Regular', s)

def emoji(img, ch, x, y, size):
    f = ImageFont.truetype(EMOJI, 109)
    tmp = Image.new('RGBA', (160, 160), (0, 0, 0, 0))
    ImageDraw.Draw(tmp).text((80, 80), ch, font=f, embedded_color=True, anchor='mm')
    bb = tmp.getbbox()
    if not bb:
        return
    tmp = tmp.crop(bb)
    r = size / max(tmp.size)
    tmp = tmp.resize((max(1, int(tmp.width * r)), max(1, int(tmp.height * r))), Image.LANCZOS)
    img.alpha_composite(tmp, (int(x - tmp.width / 2), int(y - tmp.height / 2)))

def wrap(d, text, font, maxw):
    for p in (' ?', ' !', ' :', ' ;', ' »'):
        text = text.replace(p, ' ' + p[1:])
    text = text.replace('« ', '« ')
    lines, cur = [], ''
    for w in text.split(' '):
        t = (cur + ' ' + w).strip()
        if d.textlength(t, font=font) <= maxw:
            cur = t
        else:
            if cur:
                lines.append(cur)
            cur = w
    if cur:
        lines.append(cur)
    return lines

def text_block(d, text, font, y, color, maxw=900, lh=1.15, x=90):
    for line in wrap(d, text, font, maxw):
        d.text((x, y), line, font=font, fill=color)
        y += int(font.size * lh)
    return y

def base():
    img = Image.new('RGBA', (W, H), BG + (255,))
    glow = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    gd.ellipse((600, -420, 1500, 480), fill=(208, 20, 44, 95))
    gd.ellipse((-480, 820, 340, 1620), fill=(208, 20, 44, 55))
    img.alpha_composite(glow.filter(ImageFilter.GaussianBlur(170)))
    d = ImageDraw.Draw(img)
    d.text((80, 70), 'Euro', font=BLACK(52), fill=TXT)
    d.text((80 + d.textlength('Euro', font=BLACK(52)), 70), 'Kink', font=BLACK(52), fill=RED_T)
    return img, d

def pill(d, x, y, text, fill, txtcol, fsize=30, pad=22, h=56):
    f = BOLD(fsize)
    w = d.textlength(text, font=f)
    d.rounded_rectangle((x, y, x + w + pad * 2, y + h), radius=h // 2, fill=fill)
    d.text((x + pad, y + h / 2), text, font=f, fill=txtcol, anchor='lm')
    return x + w + pad * 2

def footer_cta(img, d, line1='eurokink.eu', y=1120):
    f = BLACK(50)
    tw = d.textlength(line1, font=f)
    x0 = (W - tw - 96) / 2
    d.rounded_rectangle((x0, y, x0 + tw + 96, y + 92), radius=46, fill=TXT)
    d.text((W / 2, y + 46), line1, font=f, fill=BG, anchor='mm')

def post_playstore_teaser(out):
    img, d = base()
    x = pill(d, 90, 180, 'DÉJÀ DISPONIBLE · ALREADY LIVE', RED, (255, 255, 255))
    y = text_block(d, 'eurokink.eu, dès maintenant.', BLACK(78), 300, TXT)
    y = text_block(d, 'eurokink.eu, right now.', SEMI(42), y + 4, MUTED) + 50
    d.rectangle((90, y, 170, y + 6), fill=RED)
    y += 46
    pill(d, 90, y, 'BIENTÔT · COMING SOON', SURF, RED_T, fsize=28)
    y += 76
    y = text_block(d, 'Bientôt sur Google Play.', BLACK(70), y, TXT)
    y = text_block(d, 'Coming soon to Google Play.', SEMI(38), y + 2, MUTED) + 36
    y = text_block(d,
                    'En attendant, ajoute eurokink.eu à ton écran d’accueil : même confort, notifications incluses.',
                    REG(36), y, TXT, lh=1.3)
    text_block(d, 'Until then, add eurokink.eu to your home screen: same comfort, notifications included.',
               REG(32), y + 14, MUTED, lh=1.3)
    # simple Play-triangle glyph to suggest the store, without using the real logo
    tri_x, tri_y = 905, 230
    d.ellipse((tri_x - 70, tri_y - 70, tri_x + 70, tri_y + 70), fill=SURF, outline=RED, width=4)
    d.polygon([(tri_x - 22, tri_y - 36), (tri_x - 22, tri_y + 36), (tri_x + 40, tri_y)], fill=RED_T)
    footer_cta(img, d)
    img.convert('RGB').save(out, 'JPEG', quality=92, optimize=True)
    return out

def post_spotlight(out, title_fr, title_en, date_label, city, flag='📍'):
    img, d = base()
    pill(d, 90, 180, 'À NE PAS MANQUER · DON’T MISS', RED, (255, 255, 255))
    y = text_block(d, title_fr, BLACK(72), 300, TXT, maxw=900)
    y = text_block(d, title_en, SEMI(38), y + 6, MUTED, maxw=900) + 40
    d.rounded_rectangle((90, y, 990, y + 150), radius=28, fill=SURF, outline=BORDER, width=2)
    emoji(img, flag, 170, y + 75, 60)
    d.text((240, y + 44), date_label, font=BOLD(42), fill=TXT)
    d.text((240, y + 96), city, font=SEMI(34), fill=MUTED)
    y += 190
    text_block(d, 'Dress code, billets et qui y va : tout est sur EuroKink.', REG(36), y, TXT, lh=1.3)
    footer_cta(img, d)
    img.convert('RGB').save(out, 'JPEG', quality=92, optimize=True)
    return out

if __name__ == '__main__':
    kind = sys.argv[1]
    out = sys.argv[2]
    if kind == 'playstore':
        print(post_playstore_teaser(out))
    elif kind == 'spotlight':
        print(post_spotlight(out, *sys.argv[3:8]))
    else:
        raise SystemExit(f'unknown kind: {kind}')
