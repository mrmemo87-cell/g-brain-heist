#!/usr/bin/env python3
"""Shrink the app's PNG images in place without changing any file names or code.

Why: the website and the iPhone/Android apps ship the same images, and the app download was ~540 MB
(Google Play allows 200 MB). Most of that was full-colour, unoptimised PNGs.

What it does (per file, keeping the .png name so no import or JSON path changes):
  * scanned exam questions that are really black-and-white -> 32-level greyscale palette PNG
  * colour art (characters, maps, backgrounds) -> 256-colour palette PNG via libimagequant
    (the same engine as pngquant), keeping full resolution and transparency
A file is only replaced when the result is at least 15% smaller, so running it twice is a no-op.

Usage:
  pip install imagequant pillow
  python3 scripts/optimize-png-assets.py            # optimise the default folders
  python3 scripts/optimize-png-assets.py --dry-run  # report savings only
  python3 scripts/optimize-png-assets.py public/maps # specific folders or files
"""
from __future__ import annotations

import argparse
import io
import subprocess
import sys
from pathlib import Path

from PIL import Image, ImageChops

try:
    import imagequant
except ImportError:  # pragma: no cover - tooling hint
    sys.exit("Install the encoder first: pip install imagequant pillow")

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_TARGETS = ["components/Biology", "src/assets", "src/features", "public"]
# Small UI icons and install icons are already tuned by hand; leave them alone.
SKIP_PARTS = {"node_modules", "android", "ios", "dist", "dist-native", "icons"}
MIN_BYTES = 20 * 1024
MIN_SAVING = 0.15


def is_greyscale(img: Image.Image, tolerance: int = 24) -> bool:
    rgb = img.convert("RGB")
    r, g, b = rgb.split()
    return max(ImageChops.difference(r, g).getextrema()[1], ImageChops.difference(g, b).getextrema()[1]) <= tolerance


def encode(path: Path) -> bytes:
    with Image.open(path) as src:
        src.load()
        has_alpha = src.mode in ("RGBA", "LA") or (src.mode == "P" and "transparency" in src.info)
        if not has_alpha and is_greyscale(src):
            out = src.convert("L").quantize(32)
        else:
            out = imagequant.quantize_pil_image(
                src.convert("RGBA"), dithering_level=1.0, max_colors=256, min_quality=0, max_quality=95
            )
        buf = io.BytesIO()
        out.save(buf, "PNG", optimize=True)
        return buf.getvalue()


def iter_pngs(targets: list[str]):
    """Only files tracked by git, so build output and copies inside android/ or ios/ are never touched."""
    listed = subprocess.run(
        ["git", "ls-files", "-z", "--", *targets], cwd=ROOT, check=True, capture_output=True
    ).stdout.decode().split("\0")
    for rel in sorted(filter(None, listed)):
        f = ROOT / rel
        if f.suffix.lower() != ".png" or SKIP_PARTS.intersection(Path(rel).parts) or not f.is_file():
            continue
        yield f


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("targets", nargs="*", default=DEFAULT_TARGETS)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    before = after = changed = scanned = 0
    for f in iter_pngs(args.targets):
        size = f.stat().st_size
        scanned += 1
        if size < MIN_BYTES:
            continue
        try:
            data = encode(f)
        except Exception as exc:  # keep going; report the odd file
            print(f"skip {f.relative_to(ROOT)}: {exc}", file=sys.stderr)
            continue
        if len(data) > size * (1 - MIN_SAVING):
            continue
        before += size
        after += len(data)
        changed += 1
        if not args.dry_run:
            f.write_bytes(data)

    verb = "would shrink" if args.dry_run else "shrank"
    print(f"Scanned {scanned} PNGs; {verb} {changed}: {before / 1e6:.1f} MB -> {after / 1e6:.1f} MB "
          f"(saved {(before - after) / 1e6:.1f} MB)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
