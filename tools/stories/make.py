"""EuroKink - generate Instagram stories (1080x1920 JPEG), 3 per day.

Usage: python3 make.py data.json OUT_DIR START_DATE DAYS
Files: OUT_DIR/YYYY-MM-DD-1.jpg (9 h), -2.jpg (13 h), -3.jpg (19 h)
"""
import json, sys, datetime as dt
from PIL import Image, ImageDraw, ImageFont, ImageFilter

W, H = 1080, 1920
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
        text = text.replace(p, '\u00a0' + p[1:])
    text = text.replace('« ', '«\u00a0')
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

def text_block(d, text, font, y, color, maxw=900, lh=1.12, x=90):
    for line in wrap(d, text, font, maxw):
        d.text((x, y), line, font=font, fill=color)
        y += int(font.size * lh)
    return y

def base(kicker):
    img = Image.new('RGBA', (W, H), BG + (255,))
    glow = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    gd.ellipse((560, -380, 1500, 560), fill=(208, 20, 44, 95))
    gd.ellipse((-500, 1450, 420, 2300), fill=(208, 20, 44, 55))
    img.alpha_composite(glow.filter(ImageFilter.GaussianBlur(170)))
    d = ImageDraw.Draw(img)
    # wordmark
    d.text((90, 250), 'Euro', font=BLACK(64), fill=TXT)
    d.text((90 + d.textlength('Euro', font=BLACK(64)), 250), 'Kink', font=BLACK(64), fill=RED_T)
    # kicker pill
    kf = BOLD(32)
    kw = d.textlength(kicker, font=kf)
    d.rounded_rectangle((90, 370, 90 + kw + 56, 432), radius=31, fill=RED)
    d.text((118, 401), kicker, font=kf, fill=(255, 255, 255), anchor='lm')
    return img, d

def footer(img, d, line_fr='Gratuit · Français · English · Deutsch'):
    f = BLACK(58)
    t = 'eurokink.eu'
    tw = d.textlength(t, font=f)
    x0 = (W - tw - 110) / 2
    d.rounded_rectangle((x0, 1560, x0 + tw + 110, 1668), radius=54, fill=TXT)
    d.text((W / 2, 1614), t, font=f, fill=BG, anchor='mm')
    d.text((W / 2, 1712), line_fr, font=SEMI(30), fill=MUTED, anchor='mm')

MOIS = ['JANV', 'FÉVR', 'MARS', 'AVR', 'MAI', 'JUIN', 'JUIL', 'AOÛT', 'SEPT', 'OCT', 'NOV', 'DÉC']
FLAG = {'FR': '🇫🇷', 'DE': '🇩🇪', 'BE': '🇧🇪', 'PL': '🇵🇱', 'NL': '🇳🇱', 'ES': '🇪🇸', 'GB': '🇬🇧', 'IT': '🇮🇹', 'CH': '🇨🇭', 'AT': '🇦🇹'}
BANNED = ('fist', 'sex', 'porn', 'cum', 'nude', 'naked')

def dlabel(a, b):
    if a == b:
        return f'{a.day}', MOIS[a.month - 1]
    if a.month == b.month:
        return f'{a.day}–{b.day}', MOIS[a.month - 1]
    return f'{a.day}–{b.day}', f'{MOIS[a.month - 1][:3]}/{MOIS[b.month - 1][:3]}'

def tag(day, a, b):
    if a <= day <= b:
        return 'EN CE MOMENT · NOW'
    if a == day + dt.timedelta(1):
        return 'DEMAIN · TOMORROW'
    if (a - day).days <= 7:
        return f'DANS {(a - day).days} JOURS · IN {(a - day).days} DAYS'
    return None

def story_events(day, data, title_fr, title_en):
    img, d = base('À VENIR · COMING UP')
    y = text_block(d, title_fr, BLACK(100), 480, TXT)
    y = text_block(d, title_en, SEMI(46), y + 6, MUTED) + 30
    evs = []
    for e in data['events']:
        a = dt.date.fromisoformat(e['d']); b = dt.date.fromisoformat(e.get('d2') or e['d'])
        if b < day or any(w in e['title'].lower() for w in BANNED):
            continue
        evs.append((a, b, e))
    evs = evs[:4]
    card_h = 190
    avail = 1520 - y
    gap = 22
    while len(evs) * (card_h + gap) > avail and len(evs) > 2:
        evs.pop()
    for a, b, e in evs:
        d.rounded_rectangle((90, y, 990, y + card_h), radius=28, fill=SURF, outline=BORDER, width=2)
        d.rounded_rectangle((112, y + 22, 262, y + card_h - 22), radius=20, fill=RED)
        dd, mm = dlabel(a, b)
        df = BLACK(54 if len(dd) <= 2 else (44 if len(dd) <= 5 else 36))
        d.text((187, y + card_h / 2 - 16), dd, font=df, fill=(255, 255, 255), anchor='mm')
        d.text((187, y + card_h / 2 + 34), mm, font=BOLD(26), fill=(255, 225, 228), anchor='mm')
        tg = tag(day, a, b)
        ty = y + 30
        if tg:
            d.text((292, ty), tg, font=BOLD(24), fill=RED_T)
            ty += 36
        tl = wrap(d, e['title'], BOLD(38), 670)
        if len(tl) > 2 or (tg and len(tl) > 1):
            tl = tl[:1]
            while d.textlength(tl[0] + '…', font=BOLD(38)) > 670:
                tl[0] = tl[0][:-1]
            tl[0] = tl[0].rstrip() + '…'
        for l in tl:
            d.text((292, ty), l, font=BOLD(38), fill=TXT)
            ty += 46
        city = e['city'].title() if e['city'].isupper() else e['city']
        emoji(img, FLAG.get(e['country'], '📍'), 312, ty + 22, 34)
        d.text((340, ty + 4), city, font=SEMI(32), fill=MUTED)
        y += card_h + gap
    footer(img, d, 'Toutes les soirées · All the parties → eurokink.eu')
    return img

def story_feature(em, fr, en, txt_fr, txt_en, kicker='DANS L’APPLI · IN THE APP'):
    img, d = base(kicker)
    d.ellipse((90, 500, 330, 740), fill=SURF, outline=RED, width=4)
    emoji(img, em, 210, 620, 120)
    y = text_block(d, fr, BLACK(96), 800, TXT)
    y = text_block(d, en, SEMI(46), y + 4, MUTED) + 40
    d.rectangle((90, y, 170, y + 6), fill=RED)
    y += 40
    y = text_block(d, txt_fr, REG(40), y, TXT, lh=1.3)
    text_block(d, txt_en, REG(34), y + 16, MUTED, lh=1.3)
    footer(img, d)
    return img

def story_quiz(q_fr, q_en, options):
    img, d = base('QUESTION DU JOUR · DAILY QUESTION')
    y = text_block(d, q_fr, BLACK(104), 480, TXT)
    y = text_block(d, q_en, SEMI(48), y + 6, MUTED) + 50
    n = len(options)
    oh = 150 if n <= 3 else 128
    for i, (em, lab) in enumerate(options):
        d.rounded_rectangle((90, y, 990, y + oh), radius=oh // 2, fill=SURF, outline=BORDER, width=2)
        d.ellipse((108, y + 18, 108 + oh - 36, y + oh - 18), fill=BG)
        emoji(img, em, 108 + (oh - 36) / 2, y + oh / 2, oh * 0.48)
        d.text((108 + oh, y + oh / 2), lab, font=BOLD(48), fill=TXT, anchor='lm')
        d.text((950, y + oh / 2), 'ABCD'[i], font=BLACK(44), fill=RED_T, anchor='rm')
        y += oh + 24
    d.text((90, y + 20), 'Réponds en DM · Reply in DM', font=BOLD(40), fill=RED_T)
    footer(img, d)
    return img

def story_stat(big, fr, en, sub_fr, sub_en, kicker='LA COMMUNAUTÉ · COMMUNITY'):
    img, d = base(kicker)
    d.text((80, 520), big, font=BLACK(330), fill=RED_T)
    y = text_block(d, fr, BLACK(92), 900, TXT)
    y = text_block(d, en, SEMI(46), y + 4, MUTED) + 50
    d.rectangle((90, y, 170, y + 6), fill=RED)
    y = text_block(d, sub_fr, REG(40), y + 40, TXT, lh=1.3)
    text_block(d, sub_en, REG(34), y + 16, MUTED, lh=1.3)
    footer(img, d)
    return img

FEATURES = {
    'alerts': ('🎟️', 'Les billets sortent ? Tu le sais en premier.', 'Tickets drop? You know first.',
               'Mets une soirée en favori : rappel avant le jour\u00a0J et alerte dès que la billetterie ouvre.',
               'Save a party: reminder before the night and an alert when tickets go on sale.'),
    'going': ('👀', 'Vois qui y va.', 'See who’s going.',
              'Touche « J’y vais » et découvre qui sera là. Tu choisis qui voit tes sorties.',
              'Tap “I’m going” and see who’ll be there. You choose who sees your outings.'),
    'passport': ('🏅', 'Collectionne tes sorties.', 'Collect your nights out.',
                 'Valide ta présence sur place et débloque des badges : Tour de France, Globetrotter, Pionnier…',
                 'Check in at the party and unlock badges: Tour de France, Globetrotter, Pioneer…'),
    'stay': ('🛏️', 'Soirée à l’étranger ? Ton lit est trouvé.', 'Party abroad? Your bed is sorted.',
             'Sur chaque fiche, les hébergements autour du lieu, déjà aux bonnes dates.',
             'On every event page, stays around the venue, already set to the right dates.'),
    'privacy': ('🔒', 'Discret par nature.', 'Discreet by design.',
                'Juste un pseudo, ta ville jamais ton adresse, profil invisible en un geste.',
                'Just a username, your city never your address, invisible profile in one tap.'),
    'messages': ('💬', 'Dis bonjour avant la soirée.', 'Say hi before the party.',
                 'Ton premier message est une demande : il choisit de l’accepter ou non.',
                 'Your first message is a request: they choose to accept it or not.'),
    'memory': ('🏆', 'Défi Memory de la semaine.', 'Weekly Memory challenge.',
               'Retrouve les paires le plus vite possible. Le meilleur score gagne le badge Champion chaque lundi.',
               'Match the pairs as fast as you can. Best score wins the Champion badge every Monday.'),
}

def plan(day, data):
    """Return the 3 stories of a given day."""
    n = data['members']
    wd = day.weekday()  # 0 = Monday
    ev_titles = {
        5: ('Ce week-end et après', 'This weekend and beyond'),
        6: ('Tes prochaines soirées', 'Your next parties'),
    }
    t_fr, t_en = ev_titles.get(wd, ('Tes prochaines soirées', 'Your next parties'))
    s1 = story_events(day, data, t_fr, t_en)
    feat = ['going', 'passport', 'stay', 'privacy', 'messages', 'alerts', 'memory'][wd]
    s2 = story_feature(*FEATURES[feat], kicker=('MINI-JEU · MINI-GAME' if feat == 'memory' else 'DANS L’APPLI · IN THE APP'))
    third = {
        0: lambda: story_quiz('Ton style ?', 'Your style?', [('👟', 'Sportswear'), ('🐶', 'Pup'), ('🪖', 'Uniforme'), ('🏍️', 'Cuir')]),
        1: lambda: story_stat(str(data['countries']), 'pays couverts', 'countries covered',
                              'De Paris à Varsovie, toutes les soirées au même endroit.', 'From Paris to Warsaw, every party in one place.',
                              kicker='TOUTE L’EUROPE · ALL OF EUROPE'),
        2: lambda: story_quiz('Ta prochaine destination ?', 'Your next trip?', [('🌴', 'Nice'), ('🗼', 'Paris'), ('🍺', 'Cologne'), ('🐻', 'Berlin')]),
        3: lambda: story_feature(*FEATURES['memory'], kicker='MINI-JEU · MINI-GAME'),
        4: lambda: story_quiz('Bottes ou baskets ?', 'Boots or sneakers?', [('🥾', 'Bottes · Boots'), ('👟', 'Baskets · Sneakers'), ('🤷', 'Les deux · Both')]),
        5: lambda: story_quiz('Cuir ou latex ?', 'Leather or rubber?', [('🖤', 'Cuir · Leather'), ('✨', 'Latex · Rubber'), ('🔥', 'Les deux · Both')]),
        6: lambda: story_stat(f'{n}', 'membres dès la 1re semaine', 'members in week one',
                              'Merci ! Invite tes potes : plus on est, plus l’agenda est complet.', 'Thank you! Invite your mates: the more we are, the fuller the agenda.'),
    }[wd]
    return [s1, s2, third()]

if __name__ == '__main__':
    data = json.load(open(sys.argv[1]))
    out = sys.argv[2]
    start = dt.date.fromisoformat(sys.argv[3])
    for i in range(int(sys.argv[4])):
        day = start + dt.timedelta(i)
        for k, im in enumerate(plan(day, data), 1):
            im.convert('RGB').save(f'{out}/{day.isoformat()}-{k}.jpg', 'JPEG', quality=90, optimize=True)
            print(f'{out}/{day.isoformat()}-{k}.jpg')
