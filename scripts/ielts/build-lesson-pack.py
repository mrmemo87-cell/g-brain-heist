#!/usr/bin/env python3
"""Build a private IELTS lesson review pack from a bh-ielts-lesson-source/2 lesson.json.

Never installs, registers or publishes catalogue content. Output is a private teacher-review
pack: student PDFs (no keys, scripts or models), teacher-private keys/scripts/models, a
withheld fresh check, planning and human-review records, a motion-free editable PPTX, an
accessible offline HTML presentation, a start guide, a hash manifest and a ZIP.

Usage:
  python3 scripts/ielts/build-lesson-pack.py --source docs/ielts/lessons/lesson-05/lesson.json \
      --output /private/out/IELTS-05 [--school "Authorized school"] [--logo logo.png] [--review-date "..."]
"""
import argparse, hashlib, html, json, re, shutil, subprocess, zipfile
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import PageBreak, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle, KeepTogether, Image

INK, PRIMARY, MUTED, LINE, WASH = '#15243A', '#1746B0', '#4C6076', '#DCE5EF', '#EEF3FA'
ROOT = Path(__file__).resolve().parents[2]
E = html.escape


def sha256(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def answers_title(title):
    return f"{title} — answers" if title.rstrip().endswith('?') else f"{title}: answers"


def is_homework_essay(b):
    # Full Task 2 essays default to the homework sheet; 'in_class': true keeps a timed, observed essay in the workbook.
    return b['kind'] == 'writing' and not b.get('in_class') and (b.get('task') == 'task2' or bool(b.get('homework')))


def normalize_title(t):
    return re.sub(r'\W+', ' ', t).strip().lower()


def letters(n):
    return [chr(65 + i) for i in range(n)]


class Pack:
    def __init__(self, args):
        self.source = Path(args.source).resolve()
        self.d = json.loads(self.source.read_text())
        self.source_sha = sha256(self.source)
        self.school = args.school
        self.logo = Path(args.logo).resolve() if args.logo else None
        self.review_date = args.review_date
        self.out = Path(args.output).resolve()
        if self.out.exists() and any(self.out.iterdir()):
            raise SystemExit(f'Output directory {self.out} is not empty; use a new directory for each build.')
        for sub in ['Students', 'Teacher-private', 'assets']:
            (self.out / sub).mkdir(parents=True, exist_ok=True)
        if self.logo:
            shutil.copyfile(self.logo, self.out / 'assets' / ('school-logo' + self.logo.suffix.lower()))
        self.code = self.d['code']
        self.n = self.d['number']
        self.files = []
        self._fonts()
        self.blocks = {b['id']: b for b in self.d['blocks']}

    # ---------- PDF primitives ----------
    def _fonts(self):
        for name, query in [('BHRegular', 'DejaVu Sans'), ('BHBold', 'DejaVu Sans:style=Bold'), ('BHItalic', 'DejaVu Sans:style=Oblique')]:
            path = subprocess.check_output(['fc-match', '-f', '%{file}', query], text=True).strip()
            if 'DejaVuSans' not in path:
                raise RuntimeError('DejaVu Sans is required for consistent PDF output')
            pdfmetrics.registerFont(TTFont(name, path))
        s = getSampleStyleSheet()
        s.add(ParagraphStyle('T', fontName='BHBold', fontSize=21, leading=26, textColor=colors.HexColor(INK), spaceAfter=10))
        s.add(ParagraphStyle('H', fontName='BHBold', fontSize=13, leading=17, textColor=colors.HexColor(PRIMARY), spaceBefore=8, spaceAfter=5, keepWithNext=1))
        s.add(ParagraphStyle('B', fontName='BHRegular', fontSize=10.5, leading=15, textColor=colors.HexColor(INK), spaceAfter=6))
        s.add(ParagraphStyle('P', fontName='BHRegular', fontSize=10.5, leading=15.5, textColor=colors.HexColor(INK), spaceAfter=7, leftIndent=18, firstLineIndent=-18))
        s.add(ParagraphStyle('O', fontName='BHRegular', fontSize=10.5, leading=14, textColor=colors.HexColor(INK), spaceAfter=3, leftIndent=24))
        s.add(ParagraphStyle('S', fontName='BHRegular', fontSize=8.5, leading=12, textColor=colors.HexColor(MUTED), spaceAfter=5))
        s.add(ParagraphStyle('Cell', fontName='BHRegular', fontSize=8.8, leading=11.5, textColor=colors.HexColor(INK)))
        self.st = s

    def p(self, text, style='B'):
        return Paragraph(E(str(text)).replace('\n', '<br/>'), self.st[style])

    def lines(self, n):
        out = []
        for _ in range(n):
            t = Table([['']], colWidths=[511], rowHeights=[20])
            t.setStyle(TableStyle([('LINEBELOW', (0, 0), (-1, -1), .4, colors.HexColor(LINE))]))
            out.append(t)
        out.append(Spacer(1, 6))
        return out

    def table(self, rows, widths, row_height=None):
        t = Table([[self.p(c, 'Cell') for c in r] for r in rows], colWidths=widths, repeatRows=1, hAlign='LEFT',
                  rowHeights=[None] + [row_height] * (len(rows) - 1) if row_height else None)
        t.setStyle(TableStyle([('BACKGROUND', (0, 0), (-1, 0), colors.HexColor(WASH)), ('VALIGN', (0, 0), (-1, -1), 'TOP'),
                               ('BOX', (0, 0), (-1, -1), .5, colors.HexColor(LINE)), ('INNERGRID', (0, 0), (-1, -1), .4, colors.HexColor(LINE)),
                               ('LEFTPADDING', (0, 0), (-1, -1), 6), ('RIGHTPADDING', (0, 0), (-1, -1), 6), ('TOPPADDING', (0, 0), (-1, -1), 6), ('BOTTOMPADDING', (0, 0), (-1, -1), 6)]))
        return [t, Spacer(1, 8)]

    def pdf(self, rel, title, pages, audience, label):
        story = []
        for i, page in enumerate(pages):
            if i:
                story.append(PageBreak())
            story.append(self.p(title if i == 0 else f'{title} (continued)', 'T'))
            story.extend(page)

        def header(c, doc):
            w, h = doc.pagesize
            c.saveState()
            c.setFillColor(colors.HexColor(PRIMARY)); c.rect(0, h - 8, w, 8, fill=1, stroke=0)
            c.setFont('BHBold', 9); c.setFillColor(colors.HexColor(INK)); c.drawString(42, h - 32, self.school)
            c.setFont('BHRegular', 8); c.setFillColor(colors.HexColor(MUTED))
            c.drawString(42, h - 46, f"Brains Heist IELTS | Lesson {self.n} | {label}")
            if self.logo:
                c.drawImage(ImageReader(str(self.logo)), w - 80, h - 66, 38, 40, preserveAspectRatio=True, mask='auto')
            c.setStrokeColor(colors.HexColor(LINE)); c.line(42, 37, w - 42, 37)
            c.setFont('BHRegular', 8)
            c.drawString(42, 24, f"{self.code} v{self.d['version']} | {self.d['status']} | No official IELTS result")
            c.drawRightString(w - 42, 24, str(doc.page))
            c.restoreState()

        dest = self.out / rel
        doc = SimpleDocTemplate(str(dest), pagesize=(595.276, 841.89), leftMargin=42, rightMargin=42, topMargin=80, bottomMargin=50,
                                title=f"{self.code} {title}", author='Brains Heist IELTS')
        doc.build(story, onFirstPage=header, onLaterPages=header)
        from pypdf import PdfReader
        self.files.append({'file': rel, 'audience': audience, 'pages': len(PdfReader(str(dest)).pages)})

    def page_label(self, rel):
        n = next(f['pages'] for f in self.files if f['file'] == rel)
        return f"{n} page" + ('' if n == 1 else 's')

    # ---------- figures (Academic Writing Task 1 visuals) ----------
    def figure_path(self, b):
        fig = b.get('figure')
        if not fig:
            return None
        dest = self.out / 'assets' / f"{b['id']}.png"
        if dest.exists():
            return dest
        import matplotlib
        matplotlib.use('Agg')
        import matplotlib.pyplot as plt
        plt.rcParams.update({'font.family': 'DejaVu Sans', 'font.size': 11})
        palette = ['#1746B0', '#C2410C', '#0E7490', '#6D28D9', '#4C6076']
        markers = ['o', 's', '^', 'D', 'v']
        if fig['type'] in ('plan', 'table'):
            return self._render_special(fig, dest, plt)
        fw, fh = (8, 4.6)
        f, ax = plt.subplots(figsize=(fw, fh), dpi=200)
        x = fig['x']
        if fig['type'] == 'line':
            for i, ser in enumerate(fig['series']):
                ax.plot(x, ser['values'], marker=markers[i % 5], color=palette[i % 5], linewidth=2.2, label=ser['name'])
        else:
            n = len(fig['series']); width = 0.8 / n
            for i, ser in enumerate(fig['series']):
                pos = [j + (i - (n - 1) / 2) * width for j in range(len(x))]
                bars = ax.bar(pos, ser['values'], width=width * 0.95, color=palette[i % 5], label=ser['name'],
                              hatch=['', '//', '..', 'xx', '\\\\'][i % 5], edgecolor='white')
            ax.set_xticks(range(len(x)), x)
        ax.set_title(fig['title'], fontsize=13, fontweight='bold', color=INK, loc='left')
        ax.set_xlabel(fig.get('x_label', '')); ax.set_ylabel(fig.get('y_label', ''))
        ax.grid(axis='y', color='#DCE5EF'); ax.set_axisbelow(True)
        for side in ('top', 'right'):
            ax.spines[side].set_visible(False)
        if fig.get('y_max') is not None:
            ax.set_ylim(0, fig['y_max'])
        if len(fig['series']) > 1:
            ax.legend(frameon=False, loc='upper left', bbox_to_anchor=(1.0, 1.0))
        f.text(0.01, 0.01, fig.get('note', ''), fontsize=8.5, color=MUTED)
        f.tight_layout(rect=(0, 0.04, 1, 1))
        f.savefig(dest); plt.close(f)
        return dest

    def _render_special(self, fig, dest, plt):
        from matplotlib.patches import FancyBboxPatch
        if fig['type'] == 'plan':
            # Map/plan labelling: fixed places are named; blank places carry a letter for matching.
            f, ax = plt.subplots(figsize=(8, 5.6), dpi=200)
            W, H = fig.get('width', 100), fig.get('height', 70)
            ax.set_xlim(0, W); ax.set_ylim(0, H); ax.set_aspect('equal'); ax.axis('off')
            ax.add_patch(FancyBboxPatch((0.5, 0.5), W - 1, H - 1, boxstyle='round,pad=0,rounding_size=1.5', fill=False, linewidth=1.6, edgecolor=INK))
            for path_ in fig.get('paths', []):
                xs, ys = zip(*path_['points'])
                ax.plot(xs, ys, color='#B8C4D6', linewidth=path_.get('width', 7), solid_capstyle='round', zorder=0)
                if path_.get('label'):
                    lx, ly = path_.get('label_at', path_['points'][0])
                    ax.text(lx, ly, path_['label'], fontsize=8.5, color=MUTED, ha='center', va='center', style='italic')
            for area in fig['areas']:
                blank = area.get('letter') is not None
                ax.add_patch(FancyBboxPatch((area['x'], area['y']), area['w'], area['h'], boxstyle='round,pad=0,rounding_size=0.8',
                                            facecolor='#FFFFFF' if blank else '#EEF3FA', edgecolor=PRIMARY if blank else MUTED,
                                            linewidth=1.8 if blank else 1, linestyle='-' if blank else '-'))
                ax.text(area['x'] + area['w'] / 2, area['y'] + area['h'] / 2, area['letter'] if blank else area['label'],
                        ha='center', va='center', fontsize=15 if blank else 9, fontweight='bold' if blank else 'normal', color=PRIMARY if blank else INK, wrap=True)
            if fig.get('compass', True):
                cx, cy = fig.get('compass_at', (W - 6, 1.5))
                ax.annotate('', xy=(cx, cy + 5), xytext=(cx, cy), arrowprops=dict(arrowstyle='->', color=INK, lw=1.5))
                ax.text(cx + 2, cy + 2.5, 'N', fontsize=10, fontweight='bold', color=INK, va='center')
            ax.set_title(fig['title'], fontsize=13, fontweight='bold', color=INK, loc='left')
            f.text(0.01, 0.01, fig.get('note', ''), fontsize=8.5, color=MUTED)
        else:
            rows = [[str(x)] + [str(s_['values'][i]) for s_ in fig['series']] for i, x in enumerate(fig['x'])]
            cols = [fig.get('x_label', '')] + [s_['name'] for s_ in fig['series']]
            f, ax = plt.subplots(figsize=(8, 0.9 + 0.42 * (len(rows) + 1)), dpi=200)
            ax.axis('off')
            t = ax.table(cellText=rows, colLabels=cols, loc='center', cellLoc='center')
            t.auto_set_font_size(False); t.set_fontsize(10.5); t.scale(1, 1.55)
            for (r, c), cell in t.get_celld().items():
                cell.set_edgecolor('#DCE5EF')
                if r == 0:
                    cell.set_facecolor('#EEF3FA'); cell.set_text_props(fontweight='bold', color=INK)
                if c == 0 and r > 0:
                    cell.set_text_props(ha='left', color=INK); cell.set_facecolor('#F8FAFD')
            ax.set_title(fig['title'], fontsize=13, fontweight='bold', color=INK, loc='left')
            f.text(0.01, 0.01, fig.get('note', ''), fontsize=8.5, color=MUTED)
        f.tight_layout(rect=(0, 0.04, 1, 1))
        f.savefig(dest); plt.close(f)
        return dest

    def figure_flow(self, b, with_table=False):
        path = self.figure_path(b)
        if not path:
            return []
        from PIL import Image as PILImage
        iw, ih = PILImage.open(path).size
        out = [Image(str(path), width=500, height=500 * ih / iw)]
        if with_table and b['figure']['type'] != 'plan':
            # The text description summarises trends, so it stays in teacher materials (and as HTML alt text).
            out.append(self.p('Figure description: ' + b['figure']['alt'], 'S'))
            fig = b['figure']
            rows = [[fig.get('x_label', '') or ''] + [s_['name'] for s_ in fig['series']]] + [[str(xv)] + [str(s_['values'][i]) for s_ in fig['series']] for i, xv in enumerate(fig['x'])]
            out += self.table(rows, [100] + [int(411 / len(fig['series']))] * len(fig['series']))
        elif with_table:
            out.append(self.p('Figure description: ' + b['figure']['alt'], 'S'))
        return out

    # ---------- content renderers ----------
    def student_items(self, b, number_from=None, show_hints=True):
        out = [self.p(b['title'], 'H'), self.p(b['instructions'])]
        st = b.get('stimulus') or {}
        if st.get('type') == 'passage' and not st.get('workbook_reference'):
            if normalize_title(st['title']) != normalize_title(b['title']):
                out.append(self.p(st['title'], 'H'))
            for i, para in enumerate(st['paragraphs']):
                out.append(self.p((f"{chr(65 + i)}   " if st.get('labelled') else '') + para, 'P' if st.get('labelled') else 'B'))
        elif st.get('workbook_reference'):
            out.append(self.p(st['workbook_reference'], 'S'))
        elif st.get('type') == 'options_list':
            out.extend(self.table([[st['title']]] + [[x] for x in st['paragraphs']], [511]))
        elif st.get('type') in ('transcript', 'teacher_script'):
            out.append(self.p('Listen. The script is not printed for students.', 'S'))
        out += self.figure_flow(b, with_table=b['figure'].get('show_table', False) if b.get('figure') else False)
        if b.get('form_title'):
            out.append(self.p(b['form_title'], 'H'))
        for i, it in enumerate(b['items']):
            num = it['id'].rsplit('-Q', 1)[-1]
            body = [self.p(f"{num}.  {it['prompt']}")]
            for opt in it.get('options', []) if it['type'] in ('mcq', 'choice') else []:
                body.append(self.p(opt, 'O'))
            if it['type'] in ('matching', 'paragraph_match') and st.get('type') == 'passage':
                body.append(self.p('Answer: ______   Evidence: ________________________________________'))
            elif it['type'] in ('matching', 'paragraph_match'):
                body.append(self.p('Answer: ______'))
            elif it['type'] == 'completion':
                hint = f"   (support hint: {it['hint']})" if show_hints and it.get('hint') else ''
                body.append(self.p('Answer: ____________________' + hint))
            elif it['type'] in ('mcq', 'choice', 'tfng', 'ynng'):
                body.append(self.p('Answer: ______'))
            out.append(KeepTogether(body))
        for key, label in [('extension', 'Extension'), ('high_band', 'High-band challenge')]:
            if b.get(key):
                out += [self.p(f'{label}: ' + b[key], 'S')] + self.lines(2)
        return out

    def student_block(self, b):
        flow = self._student_block(b)
        # Keep the heading with its instructions; nested KeepTogether groups can force empty pages.
        return [KeepTogether(flow[:2])] + flow[2:] if len(flow) > 2 else flow

    def _student_block(self, b):
        k = b['kind']
        if k == 'items':
            return self.student_items(b)
        if k == 'contrast':
            out = [self.p(b['title'], 'H'), self.p(b['instructions'])]
            for i, ex in enumerate(b['examples']):
                out += [self.p(f"{letters(len(b['examples']))[i]}.  {ex['text']}", 'P'), self.p('My notes: ______________________________________________')]
            return out
        if k == 'writing':
            n = {'task2': 25 if b.get('in_class') else 30, 'paragraph': 12}.get(b.get('task'), 16)
            out = [self.p(b['title'], 'H'), self.p(b['prompt'])] + self.figure_flow(b) + [self.p('Conditions: ' + b['conditions'], 'S')]
            if b.get('support'):
                out.append(self.p('Support (tick if used) [ ]  ' + b['support'], 'S'))
            out += self.lines(n)
            if b.get('task') == 'task2':
                out += [self.p('Essay (continued)', 'H'), *self.lines(14)]
            out.append(KeepTogether([self.p('Criterion checklist for your review', 'H')] + [self.p('[ ]  ' + c, 'S') for c in b['checklist']]))
            return out
        if k == 'speaking':
            out = [self.p(b['title'], 'H'), self.p(b['instructions'])] + [self.p('•  ' + q, 'P') for q in b['prompts']]
            if b.get('support'):
                out.append(self.p('Support: ' + b['support'], 'S'))
            out += [self.p('Partner notes: I heard  [ ] a direct answer  [ ] a reason  [ ] an example  [ ] a contrast  [ ] a consequence'), self.p('One useful next step: ____________________________________________')]
            return out
        raise ValueError(k)

    def key_block(self, b):
        k = b['kind']
        out = [self.p(f"{b['id']}  {b['title']}", 'H'), self.p('Conditions: ' + b['mode'], 'S')] + self.figure_flow(b, with_table=True)
        if k == 'items':
            st = b.get('stimulus') or {}
            if st.get('type') in ('transcript', 'teacher_script'):
                rec = next((r for r in self.d['audio'].get('recordings', []) if r['block'] == b['id']), None)
                if rec:
                    out.append(self.p(f"Recording {rec['id']}: production order ({rec['status']})", 'H'))
                    for seg in rec.get('segments', []):
                        if seg['type'] == 'silence':
                            out.append(self.p(f"[{seg['seconds']} seconds of measured silence]", 'S'))
                        elif seg['type'] == 'passage':
                            out.append(self.p('[Passage: the transcript below]', 'S'))
                        else:
                            out.append(self.p(f"{seg['voice'].upper()} VOICE: {seg['text']}", 'P'))
                    out.append(self.p('Voices: ' + '; '.join(f"{k}: {v}" for k, v in rec.get('voices', {}).items()), 'S'))
                out.append(self.p(st['title'], 'H'))
                out += [self.p(x, 'P') for x in st['paragraphs']]
            for it in b['items']:
                acc = f"  (also accept: {', '.join(it['accept'])})" if it.get('accept') else ''
                out.append(KeepTogether([self.p(f"{it['id']}:  {it['answer']}{acc}", 'B'), self.p('Evidence: ' + it['evidence'], 'S'), self.p('Why: ' + it['reason'] + f"   [draft focus: {it['focus']}]", 'S')]))
            for key, label in [('support', 'Support'), ('extension', 'Extension'), ('high_band', 'High band')]:
                if b.get(key):
                    out.append(self.p(f'{label}: ' + b[key], 'S'))
        elif k == 'contrast':
            for ex in b['examples']:
                out += [self.p(ex['label'] + ':  ' + ex['text'], 'P'), self.p('Teaching point: ' + ex['comment'], 'S')]
        elif k == 'writing':
            out += [self.p('Prompt: ' + b['prompt']), self.p(b['model_label'], 'S')]
            out += [self.p(x) for x in b['model'].split('\n\n')]
            out.append(self.p(f"Model length: {len(b['model'].split())} words.", 'S'))
            out += [self.p('Feedback checklist (official criterion names; no band assigned)', 'H')] + [self.p('•  ' + c, 'P') for c in b['checklist']]
            for key, label in [('support', 'Support'), ('extension', 'Extension'), ('high_band', 'High band')]:
                if b.get(key):
                    out.append(self.p(f'{label}: ' + b[key], 'S'))
        elif k == 'speaking':
            out += [self.p('•  ' + q, 'P') for q in b['prompts']]
            if b.get('model'):
                out += [self.p('Illustrative spoken model (teacher reads naturally; not a script to memorise)', 'H'), self.p(b['model'])]
            out.append(self.p('Observation rule: ' + b['observation'], 'S'))
        return out

    # ---------- slides ----------
    def fit_chunks(self, paragraphs, max_chars=520):
        chunks, cur = [], []
        for para in paragraphs:
            if cur and sum(len(x) for x in cur) + len(para) > max_chars:
                chunks.append(cur); cur = []
            cur.append(para)
        if cur:
            chunks.append(cur)
        return chunks

    def block_slides(self, b, part):
        out = self._block_slides(b, part)
        if b.get('figure') and part in ('questions', 'prompt') and out:
            self.figure_path(b)
            out[0] = {**out[0], 'image': f"assets/{b['id']}.png", 'alt': b['figure']['alt']}
        return out

    def _block_slides(self, b, part):
        k, out = b['kind'], []
        notes_base = f"{b['id']} · {b['mode']}."
        if k == 'items' and part == 'questions':
            st = b.get('stimulus') or {}
            pre = []
            if st.get('type') == 'options_list':
                pre = [st['title'] + ':  ' + '   '.join(st['paragraphs'])]
            elif any(it['type'] in ('matching', 'paragraph_match') for it in b['items']):
                # Option lists (headings, groups, speakers) must stay visible next to every item when projected.
                text = b['instructions']
                if 'List of' in text:
                    head, _, rest = text.partition('List of')
                    text = head.strip() + '\nList of' + rest.replace('; ', '\n')
                pre = [text]
            groups, cur, size = [], [], 0
            short_matching = pre and all(it['type'] in ('matching', 'paragraph_match') and len(it['prompt']) < 40 for it in b['items'])
            for it in ([] if short_matching else b['items']):
                cost = len(it['prompt']) + sum(len(o) for o in it.get('options', []) if it['type'] == 'mcq') + 40
                if cur and (size + cost > 360 or len(cur) == 4):
                    groups.append(cur); cur, size = [], 0
                cur.append(it); size += cost
            if cur:
                groups.append(cur)
            if short_matching:
                groups = [b['items']]
            for gi, g in enumerate(groups):
                body = list(pre if gi == 0 else [])
                for it in g:
                    num = it['id'].rsplit('-Q', 1)[-1]
                    line = f"{num}.  {it['prompt']}"
                    if it['type'] in ('mcq', 'choice') and it.get('options'):
                        line += '\n' + '\n'.join('      ' + o for o in it['options'])
                    body.append(line)
                notes = notes_base + ' Learners commit answers before the reveal.'
                if st.get('type') == 'teacher_script':
                    notes += ' Read aloud once: ' + ' / '.join(st['paragraphs'])
                if st.get('type') == 'transcript':
                    notes += ' Play the approved recording only; never read the transcript as a substitute.'
                out.append({'title': b['title'] + (f' ({gi + 1}/{len(groups)})' if len(groups) > 1 else ''), 'body': body, 'notes': notes})
        elif k == 'items' and part == 'answers':
            for i in range(0, len(b['items']), 2):
                g = b['items'][i:i + 2]
                body = []
                for it in g:
                    num = it['id'].rsplit('-Q', 1)[-1]
                    quotable = (b.get('stimulus') or {}).get('type') in ('passage', 'transcript', 'teacher_script')
                    ev = f"“{it['evidence']}”" if quotable else it['evidence']
                    body.append(f"{num}   {it['answer']}\n{ev}\n{it['reason']}")
                ids = ', '.join(it['id'] for it in g)
                out.append({'title': answers_title(b['title']), 'body': body, 'reveal': True, 'notes': f'Reveal only after learners explain their choices. {ids}. Corrections remain guided practice.'})
        elif k == 'contrast' and part == 'questions':
            labels = letters(len(b['examples']))
            for i in range(0, len(b['examples']), 2):
                body = [b['instructions']] if i == 0 else []
                body += [f"{labels[j]}.  {ex['text']}" for j, ex in enumerate(b['examples']) if i <= j < i + 2]
                out.append({'title': b['title'], 'body': body, 'notes': notes_base + ' Learners decide before the reveal.'})
        elif k == 'contrast' and part == 'answers':
            labels = letters(len(b['examples']))
            for i in range(0, len(b['examples']), 2):
                body = [f"{labels[j]}.  {ex['label']}\n{ex['comment']}" for j, ex in enumerate(b['examples']) if i <= j < i + 2]
                out.append({'title': f"{b['title']} — discussion", 'body': body, 'reveal': True, 'notes': 'Ask learners to explain their choice before revealing each comment.'})
        elif k == 'writing' and part == 'prompt':
            out.append({'title': b['title'], 'body': [b['prompt'], b['conditions']], 'dark': True, 'notes': notes_base + ' The model is not shown until after learners write.'})
        elif k == 'writing' and part == 'model':
            paras = b['model'].split('\n\n')
            chunks = self.fit_chunks(paras, 700)
            for ci, ch in enumerate(chunks):
                out.append({'title': 'Illustrative model' + (f' ({ci + 1}/{len(chunks)})' if len(chunks) > 1 else ''), 'body': ch + ([b['model_label']] if ci == len(chunks) - 1 else []), 'reveal': True, 'notes': b['model_label'] + ' Point out the argument chain. Do not ask learners to memorise it.'})
        elif k == 'speaking' and part == 'prompt':
            out.append({'title': b['title'], 'body': b['prompts'], 'notes': b['instructions'] + ' ' + b['observation']})
        elif k == 'speaking' and part == 'model':
            out.append({'title': 'A developed spoken answer', 'body': [b['model']], 'reveal': True, 'notes': 'Read naturally once. This is a live classroom model, not a script to memorise or a Listening task.'})
        return out

    def build_slides(self):
        d = self.d
        slides = [{'title': d['title'], 'body': [f"Lesson {self.n} · Week {d['week']}", '\n'.join(o['text'] for o in d['objectives'][:2])], 'dark': True, 'notes': f"{d['status']}. Confirm the reviewed version before teaching. " + d['audio']['statement']},
                  {'title': 'Today you will', 'body': [o['text'] for o in d['objectives']], 'notes': 'Objectives are teaching goals, not measured results.'}]
        self.stage_slides = []
        for si, s in enumerate(d['stages']):
            slides.append({'stage': si, 'title': s['title'], 'body': [s['student'], f"{s['start']}–{s['end']} minutes"], 'dark': si in (0,) or not s['show'], 'notes': f"{s['start']}-{s['end']} min. Teacher: {s['teacher']} Say: {s['say']} Check: {s['check']}"})
            for ref in s['show']:
                for bs in self.block_slides(self.blocks[ref['block']], ref['part']):
                    slides.append({**bs, 'stage': si})
        slides.append({'title': 'Exit ticket', 'body': d['exit_ticket'], 'dark': True, 'notes': 'Collect original work. Feedback stays scoped to today.'})
        self.slides = slides
        self.slides = self.legible(slides)
        return slides

    # ---------- outputs ----------
    def build_pdfs(self):
        d = self.d
        # Student workbook: one page per block, then reflection.
        pages = []
        for b in d['blocks']:
            if is_homework_essay(b):
                continue  # full timed tasks go on the homework sheet
            if b.get('in_workbook') is False:
                continue  # projected teaching contrast only; keeps analysis out of the practice pages
            needs_page = b['kind'] == 'writing' or bool(b.get('figure')) or (b.get('stimulus') or {}).get('type') == 'passage' and not (b.get('stimulus') or {}).get('workbook_reference')
            if not pages or needs_page:
                pages.append([])
            elif pages[-1]:
                pages[-1].append(Spacer(1, 10))
            pages[-1].extend(self.student_block(b))
            if needs_page and b['kind'] == 'writing':
                pages.append([])
        pages = [pg for pg in pages if pg]
        pages[0] = [self.p('Name: __________________________   Date: ________________')] + pages[0]
        if d.get('answer_grid'):
            n_ans = d['answer_grid']
            grid = [['No.', 'Answer', 'No.', 'Answer']]
            half = -(-n_ans // 2)
            for i in range(half):
                right = i + half + 1
                grid.append([str(i + 1), '', str(right) if right <= n_ans else '', ''])
            pages.append([self.p('Answer grid', 'H'), self.p('Transfer your answers here. One answer per box; for "choose TWO", write both letters. Spelling counts.'),
                          *self.table(grid, [40, 215, 40, 216], row_height=30)])
        if d.get('feedback_form'):
            rows = [['Round', 'Criterion', 'Quote: what the candidate said', 'Next step']] + [[str(r), '', '', ''] for r in (1, 1, 2, 2)]
            pages.append([self.p('Peer feedback form', 'H'),
                          self.p('The examiner writes two comments per round. Each comment names one criterion, quotes the candidate exactly, and gives one next step.'),
                          *self.table(rows, [44, 100, 210, 157], row_height=60),
                          self.p('Criteria: Fluency and Coherence, Lexical Resource, Grammatical Range and Accuracy, Pronunciation. Peer comments are practice notes, not band scores.', 'S')])
        if d.get('progress_review'):
            pr = d['progress_review']
            pages.append([self.p('My self-review: ' + re.sub(r'^.*\((.*)\)$', r'\1', pr['title']), 'H'), self.p('Write what you have actually done. Your teacher will add what the saved evidence shows.'),
                          *self.table([['Skill', 'Tasks I completed on my own', 'What I find difficult', 'Question for my teacher']] + [[r, '', '', ''] for r in pr['rows']], [70, 150, 150, 141], row_height=64),
                          *([] if d.get('personal_plan') else [self.p('My proposed priority for the next four weeks:'), *self.lines(2)]), self.p('This is a learning conversation, not an IELTS score.', 'S')])
        if d.get('personal_plan'):
            rows = [['', 'Evidence (task, date, conditions)', 'Action and how often', 'Check: what and when']] + [[f'Priority {i}', '', '', ''] for i in (1, 2)]
            pages.append([self.p(d['personal_plan'] if isinstance(d['personal_plan'], str) else 'My personal plan', 'H'),
                          self.p('Two priorities only. Each one must come from evidence you can point to: a saved task, a returned essay, a check result or a teacher observation.'),
                          *self.table(rows, [62, 150, 150, 149], row_height=110),
                          self.p('If the evidence for a skill is missing, write "not yet observed" and plan a check instead of guessing.', 'S'),
                          self.p('Teacher comment:'), *self.lines(2)])
        pages.append([self.p('My error log and reflection', 'H'),
                      *self.table([['Question', 'My first answer', 'Trap or difficulty', 'What I will do next time']] + [['', '', '', ''] for _ in range(6)], [62, 100, 160, 189], row_height=26),
                      self.p('Exit ticket', 'H'), *[x for q in d['exit_ticket'] for x in [self.p(q)] + self.lines(1)],
                      self.p('Keep your first answers visible. Corrections and repeated tasks are practice. This workbook does not save to IELTS Journey.', 'S')])
        self.pdf('Students/Student_Workbook.pdf', f'Lesson {self.n} workbook', pages, 'student', 'Student workbook')

        hw = [self.p('Name: __________________________   Due: ________________'), self.p('Homework', 'H')] + [self.p(f'{i + 1}.  {x}', 'P') for i, x in enumerate(d['homework'])]
        essay = [b for b in d['blocks'] if is_homework_essay(b)]
        hw_pages = [hw + [self.p('A printed instruction does not create an online assignment. Keep your original work.', 'S')]]
        for b in essay:
            hw_pages.append([self.p(b['title'], 'H'), self.p(b['prompt']), *self.figure_flow(b), self.p('Conditions: ' + b['conditions'], 'S'), self.p('Start time: ________   Finish time: ________   Interruptions / help: ______________'), *self.lines(30)])
            hw_pages.append([self.p('Essay (continued)', 'H'), *self.lines(18), self.p('Plan used: ' + b['support'], 'S'), self.p('Criterion checklist', 'H'), *[self.p('[ ]  ' + c, 'S') for c in b['checklist']]])
        self.pdf('Students/Homework.pdf', f'Lesson {self.n} homework', hw_pages, 'student', 'Student homework')

        # Teacher guide
        lv = d['levels']
        guide = [[self.p('Purpose', 'H'), self.p(f"{d['duration']} minutes. IELTS {d['test_type']}. " + ' '.join(o['text'] for o in d['objectives'])),
                  self.p('Audio: ' + d['audio']['statement']),
                  self.p('Status: ' + d['status'] + '. Complete the human review record in Planning_and_Review_Record.pdf before classroom release. Not installed in the online lesson library.', 'S'),
                  self.p('Prerequisites', 'H'), *[self.p('•  ' + x, 'P') for x in d['prerequisites']],
                  self.p('Differentiation (teaching pathways, not ability labels or bands)', 'H'),
                  *self.table([['Pathway', 'In this lesson'], ['A Foundation', lv['foundation']], ['B Core', lv['core']], ['C Extension', lv['extension']], ['D High-band challenge', lv['high_band']]], [120, 391]),
                  self.p('Before class', 'H'),
                  self.p('1. Open 01-START-HERE.html and keep the extracted folder together.'),
                  self.p(f"2. Print Student_Workbook.pdf ({self.page_label('Students/Student_Workbook.pdf')}) and Homework.pdf ({self.page_label('Students/Homework.pdf')}) for each learner. Keep all Teacher-private files private."),
                  self.p(f"3. Open Lesson_{self.n:02d}_Presentation.pptx (motion-free) or Lesson_{self.n:02d}_Slides.html. Answers appear only on separate reveal slides."),
                  self.p('4. Arrange unfinished screeners outside this lesson. Never shorten a screener or replace it with lesson tasks.')]]
        if d['audio']['required']:
            guide[0] += [self.p('Recordings', 'H')] + [self.p(f"•  {r['id']}: {r['status']}. {r['conditions']}", 'P') for r in d['audio']['recordings']]
        stage_rows = []
        for (s, (a, z)) in zip(d['stages'], self.stage_slides):
            stage_rows.append([self.p(f"{s['start']}–{s['end']} min · {s['title']} · slides {a}–{z}", 'H'), self.p('Teacher: ' + s['teacher']), self.p('Students: ' + s['student']), self.p('Say: ' + s['say'], 'S'), self.p('Before moving on: ' + s['check'], 'S')])
        for i in range(0, len(stage_rows), 3):
            guide.append([x for row in stage_rows[i:i + 3] for x in row])
        guide.append([self.p('Plan B', 'H'),
                      self.p('Internet fails: the pack works offline. Note any online follow-up for later.'),
                      self.p('Projector fails: read prompts from this guide; learners use their workbooks; keep the key private.'),
                      self.p('Printing fails: show only the student workbook PDF; learners answer in notebooks.'),
                      *([self.p('Approved recording unavailable or fails: stop the listening activity. Do not read the transcript aloud as a substitute for the practice recording, and do not record results. Teach the paraphrase and mini-model stages, then reschedule.')] if d['audio']['required'] else []),
                      self.p('After class', 'H'),
                      self.p('Keep original answers, support notes and actual observations with dates and task IDs. Give narrow feedback: one strength, one next step, how it will be checked.'),
                      self.p('Fresh check: ' + d['followup']['delivery']),
                      self.p('Delayed follow-up: ' + d['delayed_followup']),
                      self.p('Use the school reporting cutoff and actual joining dates. ' + (f'Programme review date: {self.review_date}.' if self.review_date else 'Record the programme review date before teaching.'), 'S')])
        self.pdf('Teacher-private/Teacher_Guide.pdf', f'Lesson {self.n} teacher guide', guide, 'teacher', 'Teacher-only guide')

        keys = [self.key_block(b) for b in d['blocks']]
        self.pdf('Teacher-private/Teacher_Keys_Scripts_Models.pdf', 'Private keys, scripts and models', keys, 'teacher', 'Teacher-only keys')

        f = d['followup']
        fresh = [[self.p('Withheld fresh check', 'H'), self.p(f['status']), self.p('Delivery: ' + f['delivery']), self.p('Review rule: ' + f['review']),
                  self.p('Record conditions', 'H'), self.p('Teacher / date: ______________________   Learner: ______________________'), self.p('Prior exposure check: ______________________   Time / support / interruptions:'), *self.lines(3),
                  self.p('Print the student pages only for the planned check. Keep the final key pages private.', 'S')]]
        for b in f['blocks']:
            fresh.append([self.p('Name: __________________________   Date: ________________')] + self.student_block(b))
        for b in f['blocks']:
            fresh.append(self.key_block(b))
        self.pdf('Teacher-private/Fresh_Check_WITHHELD.pdf', 'Private fresh check', fresh, 'teacher-withheld', 'Teacher-only, withheld')

        mapping_rows = [['Item / task', 'Proposed focus (draft)', 'Evidence scope']]
        for b in d['blocks']:
            if b['kind'] == 'items':
                for it in b['items']:
                    mapping_rows.append([it['id'], it['focus'], b['mode']])
            else:
                mapping_rows.append([b['id'], b['kind'], b['mode']])
        review_rows = [['Required scope', 'Reviewer decision and evidence reference'], ['Editorial and instructions', 'Pending'], ['Answer keys and accepted answers', 'Pending'], ['Proposed subskill mapping', 'Pending'], ['Difficulty and learner suitability', 'Pending'], ['Originality against retained inventory', 'Pending'], ['Rights and provenance', 'Pending'], ['Device, print and PowerPoint playback', 'Pending']]
        if d['audio']['required']:
            review_rows += [[f"Recording {r['id']}: sound, pauses, transcript fidelity, hash", 'Pending (not produced)'] for r in d['audio']['recordings']]
        planning = [[self.p('Class observation sheet', 'H'), self.p('Teacher: ____________________   Date: __________   Reporting cutoff: __________'),
                     *self.table([['Learner', 'Task IDs attempted', 'Support given', 'Observation actually made', 'Next action']] + [['', '', '', '', ''] for _ in range(12)], [95, 90, 85, 151, 90]),
                     self.p('Record only what you observed. Learners not observed stay "not yet observed".', 'S')],
                    [self.p('Human content review record', 'H'), self.p(f"Exact lesson.json SHA-256: {self.source_sha}"), self.p('Reviewer: ______________________   Date: ______________'),
                     *self.table(review_rows, [230, 281]), self.p('Decision and limitations:'), *self.lines(2),
                     self.p('The AI author has not recorded human approval. Generation and automated checks cannot approve content. Worksheet IDs are lesson-local, not registered catalogue task codes.', 'S'),
                     self.p('Open release blockers', 'H'), *[self.p('•  ' + x, 'P') for x in d['release_blockers']]],
                    [self.p('Proposed mapping notes for review', 'H'), self.p(d['mapping_notes'], 'S'), *self.table(mapping_rows, [130, 150, 231])]]
        if d.get('progress_review'):
            pr = d['progress_review']
            planning.insert(1, [self.p(pr['title'] + ' (one sheet per learner, completed before class)', 'H'),
                                self.p('Learner: ______________________   Joining date: __________   Evidence cutoff: __________'),
                                *self.table([['Skill'] + pr['columns']] + [[r, '', '', '', ''] for r in pr['rows']], [62, 120, 110, 100, 119]),
                                self.p('Agreed priority 1 and its evidence:'), *self.lines(1), self.p('Agreed priority 2 and its evidence (optional):'), *self.lines(1),
                                self.p('Rules', 'H'), *[self.p('•  ' + r, 'P') for r in pr['rules']]])
        self.pdf('Teacher-private/Planning_and_Review_Record.pdf', 'Planning and review record', planning, 'teacher', 'Teacher-only records')

    def build_pptx(self):
        from pptx import Presentation
        from pptx.dml.color import RGBColor
        from pptx.util import Inches, Pt
        prs = Presentation()
        prs.slide_width, prs.slide_height = Inches(13.333), Inches(7.5)
        blank = prs.slide_layouts[6]
        total = len(self.slides)
        rgb = lambda h: RGBColor.from_string(h.lstrip('#'))
        for i, s in enumerate(self.slides):
            sl = prs.slides.add_slide(blank)
            dark = s.get('dark')
            bg = sl.background.fill; bg.solid(); bg.fore_color.rgb = rgb(INK if dark else '#FFFFFF')
            fg = '#FFFFFF' if dark else INK
            bar = sl.shapes.add_shape(1, 0, 0, prs.slide_width, Inches(0.09)); bar.fill.solid(); bar.fill.fore_color.rgb = rgb(PRIMARY); bar.line.fill.background()
            ident = sl.shapes.add_textbox(Inches(0.6), Inches(0.22), Inches(10.5), Inches(0.4)).text_frame
            ident.text = f"{self.school} · Brains Heist IELTS · {self.code} · presentation {self.d['presentation_version']} · {i + 1}/{total}"
            ident.paragraphs[0].runs[0].font.size = Pt(12); ident.paragraphs[0].runs[0].font.color.rgb = rgb('#C9D6EA' if dark else MUTED)
            if self.logo:
                sl.shapes.add_picture(str(self.logo), Inches(12.2), Inches(0.18), height=Inches(0.55))
            if s.get('reveal'):
                tag = sl.shapes.add_textbox(Inches(10.9), Inches(6.85), Inches(2.0), Inches(0.4)).text_frame
                tag.text = 'Answer reveal'; tag.paragraphs[0].runs[0].font.size = Pt(12); tag.paragraphs[0].runs[0].font.color.rgb = rgb(PRIMARY if not dark else '#C9D6EA')
            title = sl.shapes.add_textbox(Inches(0.6), Inches(0.75), Inches(12.1), Inches(1.1)).text_frame
            title.word_wrap = True; title.text = s['title']
            r = title.paragraphs[0].runs[0]; r.font.size = Pt(36 if len(s['title']) < 48 else 30); r.font.bold = True; r.font.color.rgb = rgb(fg); r.font.name = 'Arial'
            text = '\n\n'.join(s['body'])
            if s.get('image'):
                sl.shapes.add_picture(str(self.out / s['image']), Inches(0.5), Inches(2.0), width=Inches(7.4))
                size = self.body_size(text, 4.9)
                body = sl.shapes.add_textbox(Inches(8.1), Inches(2.0), Inches(4.9), Inches(4.9)).text_frame
            else:
                size = self.body_size(text)
                body = sl.shapes.add_textbox(Inches(0.6), Inches(2.0), Inches(12.1), Inches(4.9)).text_frame
            body.word_wrap = True
            for li, line in enumerate(text.split('\n')):
                para = body.paragraphs[0] if li == 0 else body.add_paragraph()
                para.text = line
                for run in para.runs:
                    run.font.size = Pt(size); run.font.color.rgb = rgb(fg); run.font.name = 'Arial'
            sl.notes_slide.notes_text_frame.text = s['notes']
        dest = self.out / f"Teacher-private/Lesson_{self.n:02d}_Presentation.pptx"
        prs.save(dest)
        self.files.append({'file': str(dest.relative_to(self.out)), 'audience': 'teacher', 'slides': total, 'motion': 'none (motion-free; click to advance)'})

    MIN_SIZE = 20

    def legible(self, slides):
        """Split dense slides so body text stays at least MIN_SIZE pt; never truncate content."""
        out = []
        for sl in slides:
            pending = [sl]
            while pending:
                cur = pending.pop(0)
                if self.body_size('\n\n'.join(cur['body']), 4.9 if cur.get('image') else 12.1) >= self.MIN_SIZE - (2 if cur.get('image') else 0):
                    out.append(cur); continue
                body = cur['body']
                if len(body) > 1:
                    half = max(1, len(body) // 2)
                    parts = [body[:half], body[half:]]
                else:
                    sentences = re.split(r'(?<=[.!?])\s+', body[0])
                    half = max(1, len(sentences) // 2)
                    parts = [[' '.join(sentences[:half])], [' '.join(sentences[half:])]]
                    if not parts[1][0]:
                        raise ValueError(f"Cannot split slide legibly: {cur['title']}")
                base = re.sub(r' \(continued\)$', '', cur['title'])
                pending[:0] = [{**cur, 'body': parts[0]}, {**cur, 'title': base + ' (continued)', 'body': parts[1]}]
        stages = {}
        for i, sl in enumerate(out, start=1):
            if 'stage' in sl:
                lo, hi = stages.get(sl['stage'], (i, i)); stages[sl['stage']] = (min(lo, i), max(hi, i))
        self.stage_slides = [stages[i] for i in range(len(self.d['stages']))]
        return out

    @staticmethod
    def body_size(text, width=12.1):
        for size in (26, 24, 22, 20, 18, 16, 14, 12, 10):
            chars_per_line = width * 72 / (size * 0.52)
            lines = sum(max(1, -(-len(line) // int(chars_per_line))) for line in text.split('\n'))
            if lines * size * 1.2 / 72 <= 4.7:
                return size
        return 8

    def build_html(self):
        css = ('*{box-sizing:border-box}body{margin:0;background:#F5F7FC;color:#15243A;font:16px/1.6 Arial,sans-serif}main{max-width:980px;margin:auto;padding:24px 16px}'
               'h1{font-size:clamp(28px,5vw,48px);line-height:1.15}h2{color:#1746B0}a{color:#1746B0}'
               'a:focus-visible,button:focus-visible,select:focus-visible,summary:focus-visible,input:focus-visible{outline:3px solid #0E7490;outline-offset:3px}'
               'button,select{min-height:44px;font:inherit;padding:8px 14px}button{background:#1746B0;color:#fff;border:0;border-radius:8px}button:disabled{opacity:.45}'
               'section{background:#fff;padding:24px;margin:20px 0}small{color:#4C6076}li{margin:10px 0}html{overflow-wrap:anywhere}'
               '@media print{body{background:#fff}main{padding:0}button,nav{display:none}section{break-inside:avoid}}')
        d, n = self.d, self.n
        audio = ''.join(f"<li>{E(r['id'])}: {E(r['status'])}</li>" for r in d['audio']['recordings'])
        audio_html = f"<p><strong>Recordings required.</strong> {E(d['audio']['statement'])}</p><ul>{audio}</ul>" if d['audio']['required'] else f"<p><strong>{E(d['audio']['statement'])}</strong></p>"
        start = (f'<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Lesson {n} start guide</title><style>{css}</style><main>'
                 f'<p>{E(self.school)}<br>Brains Heist IELTS</p><h1>Lesson {n}<br>{E(d["title"])}</h1>'
                 f'<p><strong>{E(d["status"])}.</strong> Complete the human review record before classroom release. This content is not published in Brains Heist.</p>'
                 f'<section><h2>Start here</h2><ol><li>Keep the extracted folder together. Read the <a href="Teacher-private/Teacher_Guide.pdf">teacher guide</a>.</li>'
                 f'<li>Print the <a href="Students/Student_Workbook.pdf">student workbook</a> and <a href="Students/Homework.pdf">homework</a> for each learner.</li>'
                 f'<li>Open the <a href="Teacher-private/Lesson_{n:02d}_Presentation.pptx">motion-free PowerPoint</a> or the <a href="Teacher-private/Lesson_{n:02d}_Slides.html">offline HTML slides</a>. Answers appear only on separate reveal slides.</li>'
                 f'<li>Keep <a href="Teacher-private/Teacher_Keys_Scripts_Models.pdf">keys, scripts and models</a> and the <a href="Teacher-private/Fresh_Check_WITHHELD.pdf">withheld fresh check</a> private.</li>'
                 f'<li>Use the <a href="Teacher-private/Planning_and_Review_Record.pdf">planning and review record</a> for observations and the human review.</li></ol>{audio_html}</section>'
                 f'<section><h2>Needs internet?</h2><p>No. Everything in this pack works offline. Any online practice must be assigned through the existing Brains Heist workflow.</p></section>'
                 f'<section><h2>Learners who join later</h2><p>Keep completed results. Arrange missing screeners separately with their full time, then join the current lesson.</p></section>'
                 f'<section><h2>Plan B</h2><p>Projector fails: use the teacher guide and printed workbook. Printing fails: show only the student workbook. '
                 + ('Recording unavailable: stop the listening activity and reschedule; never read the transcript as a substitute.' if d['audio']['required'] else 'No audio device is needed.')
                 + f'</p></section><small>{E(self.code)} v{E(d["version"])}. Diagnostic Bible {E(d["bibles"]["diagnostic"])}; Lessons Bible {E(d["bibles"]["lessons"])}; Visual &amp; UX Bible {E(d["bibles"]["visual"])}. Paper work does not save into IELTS Journey.</small></main></html>')
        (self.out / '01-START-HERE.html').write_text(start)

        parts = []
        for i, s in enumerate(self.slides):
            body = '<br><br>'.join(E(x).replace('\n', '<br>') for x in s['body'])
            parts.append(f'<section class="slide{" dark" if s.get("dark") else ""}" data-slide="{i}"{" hidden" if i else ""} aria-roledescription="slide" aria-label="Slide {i + 1} of {len(self.slides)}">'
                         f'<p class="identity">{E(self.school)} · Brains Heist IELTS · {E(self.code)} · presentation {E(d["presentation_version"])} · {i + 1}/{len(self.slides)}{" · Answer reveal" if s.get("reveal") else ""}</p>'
                         f'<h1>{E(s["title"])}</h1>' + (f'<img class="fig" src="../{E(s["image"])}" alt="{E(s.get("alt", ""))}">' if s.get('image') else '') + f'<p class="body">{body}</p><details><summary>Teacher notes</summary><p>{E(s["notes"])}</p></details></section>')
        options = ''.join(f'<option value="{i}">{i + 1}. {E(s["title"])}</option>' for i, s in enumerate(self.slides))
        slidecss = ('.slide{min-height:72vh;margin:0;padding:32px 16px}.slide[hidden]{display:none}.dark{background:#15243A;color:#fff}.identity{font-size:14px}'
                    '.body{font-size:clamp(18px,2.6vw,28px);line-height:1.45}details{font-size:16px}nav{display:flex;flex-wrap:wrap;gap:12px;padding:12px 16px;background:#fff;position:sticky;bottom:0}'
                    'select{max-width:100%;min-width:0;flex:1}nav label{display:flex;align-items:center;gap:8px}main{max-width:1280px;padding:0}'
                    '.fig{display:block;max-width:100%;height:auto;background:#fff;border-radius:8px;margin:8px 0}.slide.fade{animation:entry .25s ease-out}@keyframes entry{from{opacity:0}to{opacity:1}}@media(prefers-reduced-motion:reduce){.slide.fade{animation:none}}'
                    '@media print{.slide{display:block!important;break-after:page;min-height:0}details{display:none}}')
        js = ("const slides=[...document.querySelectorAll('.slide')],sel=document.getElementById('select'),status=document.getElementById('status'),motion=document.getElementById('motion');let index=0;"
              "function show(n){index=Math.max(0,Math.min(slides.length-1,n));slides.forEach((s,i)=>{s.hidden=i!==index;s.classList.toggle('fade',i===index&&motion.checked&&!matchMedia('(prefers-reduced-motion: reduce)').matches)});"
              "sel.value=index;status.textContent='Slide '+(index+1)+' of '+slides.length;document.getElementById('previous').disabled=index===0;document.getElementById('next').disabled=index===slides.length-1}"
              "document.getElementById('previous').onclick=()=>show(index-1);document.getElementById('next').onclick=()=>show(index+1);sel.onchange=()=>show(Number(sel.value));"
              "document.addEventListener('keydown',e=>{if(e.target.closest('button,input,select,textarea,summary,a,[contenteditable]'))return;let n;"
              "if(e.key==='ArrowRight'||e.key===' '){n=index+1}else if(e.key==='ArrowLeft'){n=index-1}else if(e.key==='Home'){n=0}else if(e.key==='End'){n=slides.length-1}else{return}e.preventDefault();show(n)});show(0);")
        (self.out / f'Teacher-private/Lesson_{n:02d}_Slides.html').write_text(
            f'<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Teacher-only Lesson {n} slides</title><style>{css}{slidecss}</style><main>'
            + ''.join(parts) + f'</main><nav aria-label="Slide controls"><button id="previous">Previous</button><button id="next">Next</button><label for="select">Slide</label><select id="select">{options}</select>'
            f'<label><input id="motion" type="checkbox">Fade</label><span id="status" aria-live="polite"></span></nav><script>{js}</script></html>')
        (self.out / 'Teacher-private/slides.json').write_text(json.dumps(self.slides, ensure_ascii=False, indent=2))
        self.files += [{'file': '01-START-HERE.html', 'audience': 'teacher'}, {'file': f'Teacher-private/Lesson_{n:02d}_Slides.html', 'audience': 'teacher', 'slides': len(self.slides)}]

    def finish(self):
        for f in self.files:
            f['sha256'] = sha256(self.out / f['file'])
        manifest = {'lesson_code': self.code, 'version': self.d['version'], 'presentation_version': self.d['presentation_version'], 'school': self.school,
                    'status': self.d['status'], 'test_type': self.d['test_type'], 'bibles': self.d['bibles'], 'source': str(self.source.relative_to(ROOT)),
                    'source_sha256': self.source_sha, 'rights': self.d['rights'], 'audio': self.d['audio'], 'files': self.files,
                    'stage_slides': [{'stage': s['title'], 'slides': list(r)} for s, r in zip(self.d['stages'], self.stage_slides)],
                    'release_blockers': self.d['release_blockers'],
                    'release_gates': 'Human editorial/key/mapping/difficulty/originality review, audio production where required, device/print/PowerPoint acceptance. No platform release or automated evidence capture.'}
        (self.out / 'manifest.json').write_text(json.dumps(manifest, indent=2, ensure_ascii=False))
        zpath = self.out.parent / f"{self.code}_v{self.d['version']}_private_review_pack.zip"
        with zipfile.ZipFile(zpath, 'w', zipfile.ZIP_DEFLATED) as z:
            for path in sorted(self.out.rglob('*')):
                if path.is_file():
                    z.write(path, Path(self.code) / path.relative_to(self.out))
        return zpath


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--source', required=True)
    ap.add_argument('--output', required=True)
    ap.add_argument('--school', default='School IELTS Programme')
    ap.add_argument('--logo')
    ap.add_argument('--review-date')
    args = ap.parse_args()
    check = subprocess.run(['node', str(ROOT / 'scripts/ielts/lesson-source-contract.mjs'), args.source], capture_output=True, text=True)
    if check.returncode:
        raise SystemExit('Source contract failed; fix the lesson source first.\n' + check.stdout)
    pack = Pack(args)
    pack.build_slides()
    pack.build_pdfs()
    pack.build_pptx()
    pack.build_html()
    zpath = pack.finish()
    print(json.dumps({'output': str(pack.out), 'zip': str(zpath), 'slides': len(pack.slides), 'files': len(pack.files)}))


if __name__ == '__main__':
    main()
