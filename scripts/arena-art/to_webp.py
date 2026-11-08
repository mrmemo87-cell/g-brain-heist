"""Converts the rendered animation sheets to WebP for the game.

    python3 scripts/arena-art/to_webp.py <render_dir> public/arena/anim rivet fizz vex boulder

Each sheet has one row per direction (8) and one column per frame, already at the final frame size.
"""
import os
import sys

from PIL import Image

src, dst = sys.argv[1], sys.argv[2]
os.makedirs(dst, exist_ok=True)
total = 0
for f in sys.argv[3:]:
    for a in ('idle', 'run', 'attack', 'ko'):
        im = Image.open(f'{src}/{f}_{a}.png').convert('RGBA')
        out = f'{dst}/{f}_{a}.webp'
        im.save(out, 'WEBP', quality=76, method=6, alpha_quality=85)
        total += os.path.getsize(out)
        print(f'{f}_{a}', im.size, os.path.getsize(out))
print('total bytes', total)
