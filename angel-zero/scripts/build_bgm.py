"""Batch-convert raw_bgm/*.m4a into streamed Ogg Vorbis scenario beds.

Run with a Python that can find ffmpeg (this repo uses the Voicebox venv):
    D:\\voicebox\\backend\\venv\\Scripts\\python.exe -I angel-zero/scripts/build_bgm.py

Sources stay in D:\\tech\\raw_bgm/ (gitignored, never deployed). Output goes to
angel-zero/assets/audio/bgm/ because Cloudflare deploys angel-zero/ as the root.
"""
import argparse, json, re, shutil, struct, subprocess, sys
from pathlib import Path

ROOT = Path(r'D:\tech')
SRC = ROOT / 'raw_bgm'
OUT = ROOT / 'angel-zero' / 'assets' / 'audio' / 'bgm'
BGM_BUDGET = 12 * 1024 * 1024
PER_FILE_CAP = 25 * 1024 * 1024

def ffmpeg_exe():
    exe = shutil.which('ffmpeg')
    if exe:
        return exe
    try:
        import imageio_ffmpeg
        return imageio_ffmpeg.get_ffmpeg_exe()
    except ImportError:
        raise SystemExit('ffmpeg not found; install imageio-ffmpeg or put ffmpeg on PATH')

FF = None if '--manifest-only' in sys.argv else ffmpeg_exe()

def scenario_of(path):
    # "01_hangar_01 — Main Theme" -> "01_hangar"
    return re.sub(r'_\d+$', '', re.sub(r'\s*[—–-]\s.*$', '', path.stem))

def title_of(path):
    # "01_hangar_01 - Main Theme" -> "MAIN THEME" (UTF-8 em dash / en dash safe).
    m = re.search(r'\s*[—–-]\s*(.*)$', path.stem)
    return (m.group(1) if m else path.stem).strip().upper()

ap = argparse.ArgumentParser()
ap.add_argument('--manifest-only', action='store_true', help='rescan raw_bgm/ and rewrite manifest.json without re-encoding')
args = ap.parse_args()

srcs = sorted(SRC.glob('*.m4a'), key=lambda p: p.name)
assert len(srcs) == 24, f'expected 24 source tracks, found {len(srcs)}'
groups = {}
for p in srcs:
    groups.setdefault(scenario_of(p), []).append(p)
assert len(groups) == 12, f'expected 12 scenarios, found {len(groups)}'

if args.manifest_only:
    # Rescan the (gitignored) sources for titles; keep the already-encoded clips.
    outs = sorted(OUT.glob('*.ogg'))
    total = sum(f.stat().st_size for f in outs)
    cfg = dict(rate='48k', trim=80)
else:
    # Escalate bitrate / length until the folder fits the 12 MB streaming budget.
    # Ogg Vorbis at 64 kbps runs ~7.4 kB/s, so 24 full-length tracks cannot fit;
    # 48 kbps with an 80 s fade-out loop keeps all 12 scenarios under budget.
    settings = [
        dict(rate='64k', trim=None),
        dict(rate='48k', trim=None),
        dict(rate='48k', trim=150),
        dict(rate='48k', trim=80),
    ]
    for si, cfg in enumerate(settings):
        OUT.mkdir(parents=True, exist_ok=True)
        for f in OUT.glob('*.ogg'):
            f.unlink()
        for scn, paths in sorted(groups.items()):
            paths.sort(key=lambda p: p.name)             # title order -> _01 / _02
            for idx, p in enumerate(paths, 1):
                dst = OUT / f'{scn}_{idx:02d}.ogg'
                af = 'loudnorm=I=-14:TP=-1.5:LRA=11'
                if cfg['trim']:
                    af += f",afade=t=out:st={cfg['trim'] - 3}:d=3"
                cmd = [FF, '-hide_banner', '-loglevel', 'error', '-y', '-i', str(p),
                       '-af', af, '-ar', '44100', '-ac', '2', '-c:a', 'libvorbis',
                       '-b:a', cfg['rate'], '-vn', '-map_metadata', '-1']
                if cfg['trim']:
                    cmd += ['-t', str(cfg['trim'])]
                cmd.append(str(dst))
                r = subprocess.run(cmd, capture_output=True, text=True, encoding='utf-8')
                if r.returncode:
                    raise SystemExit(f'ffmpeg failed for {p.name}: {r.stderr[:400]}')
        outs = sorted(OUT.glob('*.ogg'))
        total = sum(f.stat().st_size for f in outs)
        if total <= BGM_BUDGET:
            break
        print(f'budget {total/1048576:.2f} MB > 12 MB; escalating to {settings[si+1] if si+1 < len(settings) else "FAILED"}')
    else:
        raise SystemExit(f'BGM folder still {total/1048576:.2f} MB over 12 MB budget')

assert len(outs) == 24
for f in outs:
    assert f.stat().st_size < PER_FILE_CAP, f'{f.name} exceeds Cloudflare per-file cap'
scenarios, tracks = {}, []
for scn, paths in sorted(groups.items()):
    paths.sort(key=lambda p: p.name)
    entries = []
    for idx, p in enumerate(paths, 1):
        file = f'{scn}_{idx:02d}.ogg'
        title = title_of(p)
        entry = {'file': file, 'title': title}
        entries.append(entry)
        tracks.append({'id': len(tracks), 'scn': scn, 'file': file, 'title': title})
    scenarios[scn] = entries
manifest = {'v': 2, 'scenarios': scenarios, 'tracks': tracks, 'bytes': total}
(OUT / 'manifest.json').write_text(json.dumps(manifest, separators=(',', ':'), ensure_ascii=False), encoding='utf-8')
site = sum(f.stat().st_size for f in ROOT.joinpath('angel-zero').rglob('*') if f.is_file())
print(('manifest only' if args.manifest_only else f'wrote {len(outs)} clips at {cfg["rate"]}' + (f', trim {cfg["trim"]}s' if cfg['trim'] else '')))
print(f'bgm {total/1048576:.2f} MB / 12 MB budget')
print(f'angel-zero total {site/1048576:.2f} MB')
