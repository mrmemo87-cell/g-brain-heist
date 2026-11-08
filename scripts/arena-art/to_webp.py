import sys, os
from PIL import Image
src, dst = sys.argv[1], sys.argv[2]
os.makedirs(dst, exist_ok=True)
tot = 0
for f in sys.argv[3:]:
    for a in ('idle', 'run', 'attack', 'ko'):
        im = Image.open(f'{src}/{f}_{a}.png').convert('RGBA')
        n = im.width // 256
        im = im.resize((192 * n, 192), Image.LANCZOS)
        out = f'{dst}/{f}_{a}.webp'
        im.save(out, 'WEBP', quality=78, method=6, alpha_quality=90)
        tot += os.path.getsize(out); print(f'{f}_{a}', os.path.getsize(out))
print('total', tot)
