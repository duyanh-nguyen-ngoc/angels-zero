"""Select, download and process a compact VSCO-2-CE (CC0) orchestral sample set for ANGELS ZERO.

Output: assets/music/orch/<section>/*.mp3 + manifest.json, played by src/orchestra.js.

usage (needs numpy + pedalboard):
  gh api "repos/sgossner/VSCO-2-CE/git/trees/HEAD?recursive=1" > tree.json
  python -I scripts/build_orch.py tree.json <empty scratch dir for raw WAVs> assets/music/orch [--dry]
Raw downloads (~220 MB) are cached in the scratch dir; keep it outside the repo.
"""
import json, os, re, sys, time, urllib.parse, urllib.request
import numpy as np
from pedalboard.io import AudioFile

TREE, RAW, OUT = sys.argv[1], sys.argv[2], sys.argv[3]
SR = 44100
BASE = 'https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/'
NOTE = {'C': 0, 'C#': 1, 'D': 2, 'D#': 3, 'E': 4, 'F': 5, 'F#': 6, 'G': 7, 'G#': 8, 'A': 9, 'A#': 10, 'B': 11}

# key: (folder, max_len_s, fade_s, rr_keep, pitched, midi_lo, midi_hi)
GROUPS = {
    'vln_spic':  ('Strings/Violin Section/Spic',    0.55, 0.05, 2, True, 55, 96),
    'vla_spic':  ('Strings/Viola Section/spic',     0.55, 0.05, 2, True, 48, 84),
    'vc_spic':   ('Strings/Cello Section/spic',     0.6,  0.06, 2, True, 36, 72),
    'cb_spic':   ('Strings/Solo Contrabass/Spic',   0.6,  0.06, 1, True, 24, 55),
    'vln_sus':   ('Strings/Violin Section/susVib',  1.8,  0.3, 1, True, 55, 96),
    'vln_trem':  ('Strings/Violin Section/Trem',    1.8,  0.3, 1, True, 55, 96),
    'vc_sus':    ('Strings/Cello Section/susvib',   1.8,  0.3, 1, True, 36, 72),
    'hn_stac':   ('Brass/F Horn/stac',              0.7,  0.08, 2, True, 34, 77),
    'hn_sus':    ('Brass/F Horn/sus',               1.8,  0.3, 1, True, 34, 77),
    'tbn_stac':  ('Brass/Tenor Trombone/stac',      0.7,  0.08, 2, True, 28, 70),
    'tbn_sus':   ('Brass/Tenor Trombone/sus',       1.8,  0.3, 1, True, 28, 70),
    'tpt_stac':  ('Brass/Trumpet/stac',             0.6,  0.08, 1, True, 52, 86),
    'tpt_sus':   ('Brass/Trumpet/sus',              1.8,  0.3,  1, True, 52, 86),
    'tuba_stac': ('Brass/Tuba/stac',                0.7,  0.08, 1, True, 22, 55),
    'glock':     ('Percussion/Glock',               1.8,  0.4,  1, True, 70, 110),
}
UNPITCHED = {   # key: (exact paths, max_len, fade)
    'timp_hit':  (None, 2.2, 0.4),
    'timp_roll': (None, 3.0, 0.5),
    'bdrum':     (['VSCO 1 Percussion/drums/bass/bdrum_fff_1.wav', 'VSCO 1 Percussion/drums/bass/bdrum_fff_2.wav',
                   'VSCO 1 Percussion/drums/bass/bdrum_ff_1.wav', 'VSCO 1 Percussion/drums/bass/bdrum_f_1.wav'], 2.2, 0.4),
    'snare':     (['VSCO 1 Percussion/drums/snare/drum1/snare1_fff_1.wav', 'VSCO 1 Percussion/drums/snare/drum1/snare1_fff_2.wav',
                   'VSCO 1 Percussion/drums/snare/drum1/snare1_ff_1.wav', 'VSCO 1 Percussion/drums/snare/drum1/snare1_f_1.wav',
                   'VSCO 1 Percussion/drums/snare/drum1/snare1_mp_1.wav', 'VSCO 1 Percussion/drums/snare/drum1/snare1_mp_2.wav'], 0.6, 0.15),
    'cym':       (None, 4.0, 1.0),
}

tree = [t for t in json.load(open(TREE, encoding='utf-8-sig'))['tree'] if t['type'] == 'blob' and t['path'].lower().endswith('.wav')]
paths = [t['path'] for t in tree]

def parse(fn):
    m = re.search(r'_([A-G]#?)(-?\d)_', fn + '_')
    vel = re.search(r'_v(\d)', fn)
    rr = re.search(r'_(?:rr|RR)(\d)', fn)
    return (NOTE[m.group(1)], int(m.group(2))) if m else None, int(vel.group(1)) if vel else 1, int(rr.group(1)) if rr else 1

def pick_pitched(folder, rr_keep):
    files = [p for p in paths if p.rsplit('/', 1)[0] == folder]
    by_note = {}
    for p in files:
        n, v, r = parse(p.rsplit('/', 1)[1])
        if n is None and 'glock_medium' in p:
            m = re.search(r'([A-G]#?)(\d)\.wav$', p); n = (NOTE[m.group(1)], int(m.group(2)))
        if n is None or (('glock' in folder) and 'medium' not in p):
            continue
        by_note.setdefault(n, []).append((v, r, p))
    out = []
    for n, lst in by_note.items():
        vmax = max(v for v, _, _ in lst)
        top = sorted([x for x in lst if x[0] == vmax], key=lambda x: x[1])[:rr_keep]
        out += [(n, r, p) for _, r, p in top]
    return out

sel = {}
for k, (folder, *_r) in GROUPS.items():
    sel[k] = pick_pitched(folder, GROUPS[k][3])
sel['timp_hit'] = [(None, 1, p) for p in paths if re.search(r'Percussion/Timpani/Timpani\d_Hit_v(4|3)_rr[12]_Sum', p)
                   and not (re.search(r'Timpani[2-5]_Hit_v3', p))]
sel['timp_roll'] = [(None, 1, p) for p in paths if re.search(r'Percussion/Timpani/(Rolls/)?Timpani\d_Roll_v(5|4)_rr1_Sum', p)]
sel['bdrum'] = [(None, 1, p) for p in UNPITCHED['bdrum'][0]]
sel['snare'] = [(None, 1, p) for p in UNPITCHED['snare'][0]]
cyms = [p for p in paths if p.startswith('VSCO 1 Percussion/varMetal/Cymbals/')]
print('cymbal candidates:', len(cyms)); [print('   ', c) for c in cyms[:40]]
C = 'VSCO 1 Percussion/varMetal/Cymbals/'
sel['cym'] = [(None, 1, C + p) for p in ('clash/crash_hit_fff_loose.wav', 'clash/crash_hit_ff_loose.wav', 'susp/susp_hit_softmall_roll2_cresc.wav')]
UNPITCHED['cym'] = (None, 4.0, 1.0)

total = sum(len(v) for v in sel.values())
size = sum(t['size'] for t in tree if any(t['path'] == p for v in sel.values() for _, _, p in v))
print(f'selected {total} files, {size / 1e6:.1f} MB raw')
if '--dry' in sys.argv:
    for k, v in sel.items(): print(k, len(v), [os.path.basename(p) for _, _, p in v][:6])
    sys.exit(0)

os.makedirs(RAW, exist_ok=True); os.makedirs(OUT, exist_ok=True)
def fetch(p):
    dst = os.path.join(RAW, p.replace('/', '__'))
    if os.path.exists(dst) and os.path.getsize(dst) > 0: return dst
    req = urllib.request.Request(BASE + urllib.parse.quote(p), headers={'User-Agent': 'sample-fetch/1.0'})
    for a in range(4):
        try:
            with urllib.request.urlopen(req, timeout=60) as r, open(dst + '.part', 'wb') as f: f.write(r.read())
            os.replace(dst + '.part', dst); return dst
        except Exception as e:
            print('  retry', p, e); time.sleep(2 + a * 3)
    raise RuntimeError('failed ' + p)

def load(path):
    with AudioFile(path) as f:
        x = f.read(f.frames); sr = f.samplerate
    x = x.mean(axis=0) if x.ndim > 1 else x
    if sr != SR:
        t = np.arange(int(len(x) * SR / sr)) * sr / SR
        x = np.interp(t, np.arange(len(x)), x)
    return x.astype(np.float32)

def f0(x):
    seg = x[int(0.12 * SR): int(0.12 * SR) + 8192]
    if len(seg) < 8192: seg = x[:8192] if len(x) >= 8192 else np.pad(x, (0, 8192 - len(x)))
    sp = np.abs(np.fft.rfft(seg * np.hanning(len(seg)), 65536))
    hps = sp.copy()
    for h in (2, 3, 4):
        d = sp[::h]; hps[:len(d)] *= d
    lo, hi = int(25 * 65536 / SR), int(4500 * 65536 / SR)
    k = lo + int(np.argmax(hps[lo:hi]))
    return k * SR / 65536

manifest = {}
for key, items in sel.items():
    maxlen, fade = (GROUPS[key][1], GROUPS[key][2]) if key in GROUPS else UNPITCHED[key][1:]
    clips = []
    for n, rr, p in items:
        x = load(fetch(p))
        env = np.abs(x); thr = max(env.max() * 0.02, 1e-4)
        on = max(0, int(np.argmax(env > thr)) - int(0.004 * SR))
        x = x[on: on + int(maxlen * SR)]
        fl = min(int(fade * SR), len(x)); x[-fl:] *= np.linspace(1, 0, fl) ** 2
        midi, named, det = None, None, None
        if key in GROUPS:
            named = 12 * (n[1] + 1) + n[0]
            det = 69 + 12 * np.log2(f0(x) / 440)
        elif key.startswith('timp'):
            midi = round(69 + 12 * np.log2(f0(x) / 440), 1)
            if not (36 <= midi <= 53): continue        # drop octave-error detections
        clips.append({'x': x, 'midi': midi, 'named': named, 'det': det, 'rr': rr, 'src': p})
    if key in GROUPS:
        # The VSCO octave convention differs per instrument: one offset per group, from the median measured shift.
        shifts = [round((c['det'] - c['named']) / 12) for c in clips]
        off = 12 * int(np.median(shifts))
        lo, hi = GROUPS[key][5], GROUPS[key][6]
        for c in clips: c['midi'] = c['named'] + off
        clips = [c for c in clips if lo <= c['midi'] <= hi]
        print(f'  {key}: octave offset {off:+d} (votes {sorted(set(shifts))})')
    if not clips: print('!! no clips for', key); continue
    peak = max(np.abs(c['x']).max() for c in clips)
    g = 0.89 / peak
    os.makedirs(os.path.join(OUT, key), exist_ok=True)
    manifest[key] = []
    for i, c in enumerate(sorted(clips, key=lambda c: (c['midi'] or 0, c['rr']))):
        name = f"{key}_{i:02d}.mp3"
        with AudioFile(os.path.join(OUT, key, name), 'w', SR, 1, quality=96) as f:
            f.write((c['x'] * g).reshape(1, -1))
        manifest[key].append({'f': f'{key}/{name}', 'm': c['midi'], 'rr': c['rr'], 'len': round(len(c['x']) / SR, 3)})
    print(f'{key:10s} {len(clips):3d} clips  midi {[c["m"] for c in manifest[key]][:12]}')

json.dump(manifest, open(os.path.join(OUT, 'manifest.json'), 'w'), indent=0)
tot = sum(os.path.getsize(os.path.join(dp, f)) for dp, _, fs in os.walk(OUT) for f in fs)
print(f'OUT {tot / 1e6:.2f} MB')
