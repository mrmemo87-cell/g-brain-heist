#!/usr/bin/env python3
"""Build the computer-delivered Writing rewrite of a paper mock (Diagnostic Bible 2.7.5 section 12B).

Reads the approved mock source (bh-ielts-mock-source/1) and writes:
  * the Task 1 process diagram as a clean, original SVG laid out for phone width (two stages per row), plus a PNG
    rendering of it for the exam page (rsvg-convert, 2x), under public/ielts/mocks/<code>/;
  * the student payload (Writing only, no models or checklists), the empty key/audio records and the timing record,
    printed as JSON for the install migration.

Usage:
  python3 scripts/ielts/build-mock-writing-rewrite.py --source docs/ielts/mocks/mock-1/mock.json --code IELTS-M1W \
      --title "Mock Test 1 · Writing rewrite" --fresh-title "Mock Test 1 · Writing" --version 1.0.0 > /tmp/m1w.json
"""
import argparse, hashlib, json, subprocess, textwrap
from pathlib import Path
from xml.sax.saxutils import escape

ROOT = Path(__file__).resolve().parents[2]
INK, PRIMARY, MUTED, LINE, WASH = '#15243A', '#1746B0', '#4C6076', '#DCE5EF', '#EEF3FA'
FONT = "'IBM Plex Sans', Inter, 'DejaVu Sans', Arial, sans-serif"


def canon(o):
    return json.dumps(o, ensure_ascii=False, sort_keys=True, separators=(',', ':'))


def process_svg(fig):
    """Numbered stages in a snake of two per row, so stage text stays readable on a phone. An optional dashed branch
    leaves one stage (for example an overflow pipe) and is labelled in the free gap below it."""
    steps, branch = fig['steps'], fig.get('branch')
    W, M, BW, GX, BH, GY, BIG = 560, 20, 240, 40, 84, 36, 80
    FS, WRAP = 18, 19
    rows = -(-len(steps) // 2)
    branch_row = branch['from'] // 2 if branch else None
    ys, y = [], 58
    for r in range(rows):
        ys.append(y)
        y += BH + (BIG if r == branch_row else GY)
    H = ys[-1] + BH + 44
    out = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}" role="img" '
           f'aria-labelledby="t d" font-family="{escape(FONT)}">',
           f'<title id="t">{escape(fig["title"])}</title>',
           f'<desc id="d">{escape(fig.get("alt", fig["title"]))}</desc>',
           '<defs><marker id="a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">'
           f'<path d="M0 0L10 5L0 10z" fill="{INK}"/></marker>'
           '<marker id="m" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">'
           f'<path d="M0 0L10 5L0 10z" fill="{MUTED}"/></marker></defs>',
           f'<rect width="{W}" height="{H}" fill="#FFFFFF"/>',
           f'<text x="{M}" y="34" font-size="20" font-weight="700" fill="{INK}">{escape(fig["title"])}</text>']
    pos = []
    for i, text in enumerate(steps):
        r, c = divmod(i, 2)
        if r % 2:
            c = 1 - c
        x = M + c * (BW + GX)
        pos.append((x, ys[r]))
        out.append(f'<rect x="{x}" y="{ys[r]}" width="{BW}" height="{BH}" rx="10" fill="#FFFFFF" stroke="{PRIMARY}" stroke-width="2"/>')
        out.append(f'<circle cx="{x + 18}" cy="{ys[r] + 18}" r="12" fill="{WASH}" stroke="{PRIMARY}" stroke-width="1.5"/>')
        out.append(f'<text x="{x + 18}" y="{ys[r] + 23}" font-size="14" font-weight="700" fill="{PRIMARY}" text-anchor="middle">{i + 1}</text>')
        lines = textwrap.wrap(text, WRAP)
        top = ys[r] + BH / 2 - (len(lines) - 1) * (FS * 1.2) / 2 + FS * 0.35 + 4
        for k, ln in enumerate(lines):
            out.append(f'<text x="{x + BW / 2 + 8}" y="{top + k * FS * 1.2:.1f}" font-size="{FS}" fill="{INK}" text-anchor="middle">{escape(ln)}</text>')
    for i in range(len(steps) - 1):
        (x0, y0), (x1, y1) = pos[i], pos[i + 1]
        if y0 == y1:
            a, b = ((x0 + BW, y0 + BH / 2), (x1 - 2, y1 + BH / 2)) if x1 > x0 else ((x0, y0 + BH / 2), (x1 + BW + 2, y1 + BH / 2))
        else:
            a, b = (x0 + BW / 2, y0 + BH), (x1 + BW / 2, y1 - 2)
        out.append(f'<line x1="{a[0]}" y1="{a[1]}" x2="{b[0]}" y2="{b[1]}" stroke="{INK}" stroke-width="2" marker-end="url(#a)"/>')
    if branch:
        x, y0 = pos[branch['from']]
        cx = x + BW / 2
        out.append(f'<line x1="{cx}" y1="{y0 + BH}" x2="{cx}" y2="{y0 + BH + 24}" stroke="{MUTED}" stroke-width="2" stroke-dasharray="6 5" marker-end="url(#m)"/>')
        for k, ln in enumerate(textwrap.wrap(branch['label'], 30)):
            out.append(f'<text x="{cx}" y="{y0 + BH + 44 + k * 18}" font-size="15" font-style="italic" fill="{MUTED}" text-anchor="middle">{escape(ln)}</text>')
    out.append(f'<text x="{M}" y="{H - 16}" font-size="13" fill="{MUTED}">{escape(fig.get("note", ""))}</text>')
    out.append('</svg>')
    return '\n'.join(out) + '\n'


def build(args):
    src = Path(args.source)
    d = json.loads(src.read_text())
    w = d['writing']
    fig = w['task1']['figure']
    if fig.get('type') != 'process':
        raise SystemExit('only process diagrams are supported')
    folder = ROOT / 'public' / 'ielts' / 'mocks' / args.code
    folder.mkdir(parents=True, exist_ok=True)
    svg = folder / 'writing-task1.svg'
    png = folder / 'writing-task1.png'
    svg.write_text(process_svg(fig))
    subprocess.run(['rsvg-convert', '--zoom', '2', '--format', 'png', '--output', str(png), str(svg)], check=True)
    digest = hashlib.sha256(png.read_bytes()).hexdigest()[:12]
    figure = {'src': f'/ielts/mocks/{args.code}/writing-task1.png?v={digest}', 'title': fig['title'],
              'note': fig.get('note', ''), 'alt': fig.get('alt', fig['title'])}
    payload = {
        'schema': 'bh-ielts-mock-cbt/1', 'code': args.code, 'title': args.title, 'version': args.version,
        'kind': 'writing_rewrite', 'fresh_title': args.fresh_title, 'source_form': d['code'], 'source_version': d['version'],
        'test_type': d['test_type'], 'rights': d['rights'],
        'writing': {
            'task1': {'prompt': w['task1']['prompt'], 'minimum_words': 150, 'suggested_minutes': 20, 'figure': figure},
            'task2': {'prompt': w['task2']['prompt'], 'minimum_words': 250, 'suggested_minutes': 40},
        },
    }
    text = canon(payload)
    for banned in ('"model"', '"checklist"', '"answer"', '"model_label"'):
        if banned in text:
            raise SystemExit(f'student payload leaks {banned}')
    key, audio = {}, {}
    # rewrite_of: students who already sat that mock take this as practice (a rewrite); everyone else takes it as a first,
    # unseen Writing sitting of the mock (Diagnostic Bible 12B, owner decision 2026-11-27).
    timing = {'sections': ['writing'], 'writing_seconds': 3600, 'grace_seconds': 20, 'rewrite_of': d['code'], 'max_attempts': 1}
    content_sha = hashlib.sha256(canon({'payload': payload, 'key': key, 'audio': audio, 'timing': timing}).encode()).hexdigest()
    return {'code': args.code, 'version': args.version, 'content_sha256': content_sha,
            'source_sha256': hashlib.sha256(src.read_bytes()).hexdigest(), 'source': src.as_posix(),
            'payload': payload, 'answer_key': key, 'audio': audio, 'timing': timing,
            'svg_sha256': hashlib.sha256(svg.read_bytes()).hexdigest(), 'png_sha256': hashlib.sha256(png.read_bytes()).hexdigest()}


def main():
    ap = argparse.ArgumentParser()
    for a in ('--source', '--code', '--title', '--fresh-title', '--version'):
        ap.add_argument(a, required=True)
    print(json.dumps(build(ap.parse_args()), ensure_ascii=False, indent=1))


if __name__ == '__main__':
    main()
