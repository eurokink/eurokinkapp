"""EuroKink - generate a fresh Instagram Reel (1080x1920 MP4, ~18-20s) from live data.

Builds several scenes (reusing the stories visual templates), animates each with a
slow zoom/pan (ffmpeg), concatenates them, and appends the branded outro jingle
(promo/fin-reel-jingle.mp4, which carries its own sound).

Usage: python3 tools/reels/make.py data.json OUT.mp4 [feature_id]
  data.json: same shape as tools/stories/data.json ({"members", "countries", "events": [...]})
  feature_id: one of tools/stories/make.py's FEATURES keys (default: rotates by ISO week)
"""
import json, sys, os, subprocess, datetime as dt

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'stories'))
from make import (story_events, story_feature, story_styles, story_stat, FEATURES, FEATURE_ORDER)

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUTRO = os.path.join(ROOT, 'promo', 'fin-reel-jingle.mp4')

# (zoom target, x/y pan expression) — a little variety from scene to scene
PANS = [
    ("1.07", "iw/2-(iw/zoom/2)", "ih/2-(ih/zoom/2)"),                      # centered zoom-in
    ("1.09", "iw/2-(iw/zoom/2)+20", "ih/2-(ih/zoom/2)-30"),                # slight pan up-right
    ("1.08", "iw/2-(iw/zoom/2)-25", "ih/2-(ih/zoom/2)+20"),                # slight pan down-left
    ("1.06", "iw/2-(iw/zoom/2)", "ih/2-(ih/zoom/2)"),                      # centered, gentler
]

def animate_scene(img, out_mp4, duration, pan_idx):
    png = out_mp4 + '.png'
    img.convert('RGB').save(png, 'PNG')
    zoom, px, py = PANS[pan_idx % len(PANS)]
    d = int(duration * 30)
    vf = (f"scale=1080:1920,zoompan=z='min(zoom+0.0015,{zoom})':x='{px}':y='{py}':d={d}:s=1080x1920:fps=30,"
          f"format=yuv420p,fade=t=in:st=0:d=0.25,fade=t=out:st={duration - 0.25}:d=0.25")
    subprocess.run(['ffmpeg', '-y', '-loop', '1', '-i', png, '-vf', vf, '-t', str(duration),
                    '-an', '-c:v', 'libx264', '-crf', '18', '-preset', 'veryfast', '-movflags', '+faststart',
                    out_mp4], check=True, capture_output=True)
    os.remove(png)

def build_reel(data, out_path, feature_id=None, day=None):
    day = day or dt.date.today()
    wk = day.isocalendar()[1]
    feature_id = feature_id or FEATURE_ORDER[wk % len(FEATURE_ORDER)]
    tmp = out_path + '.parts'
    os.makedirs(tmp, exist_ok=True)
    clips = []

    s1 = story_events(day, data, 'Cette semaine en Europe', 'This week in Europe')
    c1 = f'{tmp}/1.mp4'; animate_scene(s1, c1, 4.0, 0); clips.append(c1)

    s2 = story_styles()
    c2 = f'{tmp}/2.mp4'; animate_scene(s2, c2, 4.0, 1); clips.append(c2)

    s3 = story_feature(*FEATURES[feature_id])
    c3 = f'{tmp}/3.mp4'; animate_scene(s3, c3, 4.0, 2); clips.append(c3)

    s4 = story_stat(str(data['countries']), 'pays couverts', 'countries covered',
                     'De Paris à Varsovie, toutes les soirées au même endroit.',
                     'From Paris to Warsaw, every party in one place.',
                     kicker='TOUTE L’EUROPE · ALL OF EUROPE')
    c4 = f'{tmp}/4.mp4'; animate_scene(s4, c4, 3.5, 3); clips.append(c4)

    if os.path.exists(OUTRO):
        clips.append(OUTRO)

    # pad scenes 1-4 (silent) with a matching silent audio track so concat keeps one consistent a/v layout,
    # then concat demuxer + stream copy (cheap: no re-encode of already-rendered scenes).
    padded = []
    for i, c in enumerate(clips[:-1] if os.path.exists(OUTRO) else clips):
        p = f'{tmp}/{i}-padded.mp4'
        subprocess.run(['ffmpeg', '-y', '-i', c, '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo',
                        '-shortest', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '64k', p],
                       check=True, capture_output=True)
        padded.append(p)
    if os.path.exists(OUTRO):
        padded.append(OUTRO)

    listfile = f'{tmp}/list.txt'
    with open(listfile, 'w') as f:
        for p in padded:
            f.write(f"file '{os.path.abspath(p)}'\n")
    subprocess.run(['ffmpeg', '-y', '-f', 'concat', '-safe', '0', '-i', listfile,
                    '-c', 'copy', out_path], check=True, capture_output=True)

    for p in padded:
        if p not in (OUTRO,):
            os.remove(p)
    for c in clips:
        if c != OUTRO and os.path.exists(c):
            os.remove(c)
    os.remove(listfile)
    os.rmdir(tmp)
    return out_path, feature_id

if __name__ == '__main__':
    data = json.load(open(sys.argv[1]))
    out = sys.argv[2]
    feat = sys.argv[3] if len(sys.argv) > 3 else None
    path, used_feat = build_reel(data, out, feat)
    print(path, 'feature=', used_feat)
