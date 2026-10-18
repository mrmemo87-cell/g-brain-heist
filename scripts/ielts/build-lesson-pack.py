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
TOKEN = '{{BH_SCHOOL_NAME}}'


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
        self.template = bool(getattr(args, 'template', False))
        self.school = TOKEN if self.template else args.school
        self.logo = Path(args.logo).resolve() if args.logo else None
        self.pdf_pages = {}
        self.review_date = args.review_date
        self.args = args
        self.out = Path(args.output).resolve()
        if self.out.exists() and any(self.out.iterdir()):
            raise SystemExit(f'Output directory {self.out} is not empty; use a new directory for each build.')
        for sub in ['Students', 'Teacher-private', 'assets']:
            (self.out / sub).mkdir(parents=True, exist_ok=True)
        if self.template:
            # A unique transparent placeholder: the download step replaces it with the authorized school's logo.
            from PIL import Image as PILImage
            ph = self.out / 'assets' / 'school-logo.png'
            im = PILImage.new('RGBA', (600, 675), (255, 255, 255, 0)); im.putpixel((0, 0), (23, 70, 176, 1)); im.save(ph)
            self.logo = ph
        elif self.logo:
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
            if not self.template:
                c.setFont('BHBold', 9); c.setFillColor(colors.HexColor(INK)); c.drawString(42, h - 32, self.school)
            c.setFont('BHRegular', 8); c.setFillColor(colors.HexColor(MUTED))
            c.drawString(42, h - 46, f"Brains Heist IELTS | Lesson {self.n} | {label}")
            if self.logo and not self.template:
                c.drawImage(ImageReader(str(self.logo)), w - 80, h - 66, 38, 40, preserveAspectRatio=True, mask='auto')
            c.setStrokeColor(colors.HexColor(LINE)); c.line(42, 37, w - 42, 37)
            c.setFont('BHRegular', 8)
            c.drawString(42, 24, f"{self.code} v{self.d['version']} | {'Approved for teaching' if self.d.get('approval_record') else self.d['status']} | No official IELTS result")
            c.drawRightString(w - 42, 24, str(doc.page))
            c.restoreState()

        dest = self.out / rel
        doc = SimpleDocTemplate(str(dest), pagesize=(595.276, 841.89), leftMargin=42, rightMargin=42, topMargin=80, bottomMargin=50,
                                title=f"{self.code} {title}", author='Brains Heist IELTS')
        doc.build(story, onFirstPage=header, onLaterPages=header)
        from pypdf import PdfReader
        pages_n = len(PdfReader(str(dest)).pages)
        self.pdf_pages[rel] = pages_n
        self.files.append({'file': rel, 'audience': audience, 'pages': pages_n})

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

    def copy_audio(self):
        audio_dir = Path(self.args.audio_dir) if getattr(self.args, 'audio_dir', None) else None
        for r in self.d['audio'].get('recordings', []):
            src = audio_dir / f"{r['id']}_v1.mp3" if audio_dir else None
            if src and src.is_file():
                # Recordings travel inside the private pack; status text says whether they are approved.
                rel = f"Teacher-private/Audio/{r['id']}_v1.mp3"
                (self.out / 'Teacher-private/Audio').mkdir(exist_ok=True)
                shutil.copyfile(src, self.out / rel)
                self.files.append({'file': rel, 'audience': 'teacher', 'recording': r['id'], 'status': r['status'], 'sha256_source': sha256(src)})

    def recording_for(self, b):
        """Classroom recording for a listening block (withheld fresh-check audio never goes on slides)."""
        rec = next((r for r in self.d['audio'].get('recordings', []) if r['block'] == b['id']), None)
        if not rec or b['id'] not in self.blocks:
            return None
        rel = f"Audio/{rec['id']}_v1.mp3"
        have = (self.out / 'Teacher-private' / rel).exists()
        return {'id': rec['id'], 'src': rel if have else None, 'status': rec['status']}

    def _block_slides(self, b, part):
        k, out = b['kind'], []
        notes_base = f"{b['id']} · {b['mode']}."
        wb = b['title']
        if k == 'items' and part == 'questions':
            st = b.get('stimulus') or {}
            pre, pre_meta = [], []
            pre.append(b['instructions']); pre_meta.append({'t': 'instr'})
            if st.get('type') == 'options_list':
                pre.append(st['title'] + ':\n' + '\n'.join(st['paragraphs']))
                pre_meta.append({'t': 'options', 'title': st['title'], 'options': st['paragraphs']})
            elif any(it['type'] in ('matching', 'paragraph_match') for it in b['items']) and 'List of' in b['instructions']:
                # Option lists (headings, groups, speakers) stay visible next to every item when projected.
                head, _, rest = b['instructions'].partition('List of')
                title, _, opts = ('List of' + rest).partition(':')
                pre = [head.strip(), title.strip() + ':\n' + '\n'.join(o.strip() for o in opts.split(';') if o.strip())]
                pre_meta = [{'t': 'instr'}, {'t': 'options', 'title': title.strip(), 'options': [o.strip() for o in opts.split(';') if o.strip()]}]
            if not any(m['t'] == 'options' for m in pre_meta) and any(it['type'] == 'matching' for it in b['items']):
                # Inline option lists such as "(A shorten it; B add examples; ...)" become a visible side panel.
                mm = re.search(r'\(([A-H] [^;()]+(?:; [A-H] [^;()]+){2,})\)', b['instructions'])
                if mm:
                    opts = [o.strip() for o in mm.group(1).split(';')]
                    pre_meta = pre_meta + [{'t': 'options', 'title': 'Options', 'options': [o[0] + '  ' + o[2:] for o in opts]}]
                    pre = pre + ['Options:\n' + '\n'.join(opts)]
            mcqs = [it for it in b['items'] if it['type'] in ('mcq', 'choice')]
            shared = None
            if len(mcqs) >= 3 and len(mcqs) == len(b['items']) and mcqs[0].get('options') and all(it.get('options') == mcqs[0].get('options') for it in mcqs):
                # Same options for every question: show them once beside the questions instead of repeating them.
                shared = mcqs[0]['options']
                pre_meta = pre_meta + [{'t': 'options', 'title': 'Options', 'options': shared}]
                pre = pre + ['Options:\n' + '\n'.join(shared)]
            passage = None
            if st.get('type') == 'passage' and not st.get('workbook_reference'):
                passage = {'title': st['title'], 'labelled': bool(st.get('labelled')), 'paragraphs': st['paragraphs']}
            audio = self.recording_for(b) if st.get('type') == 'transcript' else None
            groups, cur, size = [], [], 0
            short_matching = len(pre) > 1 and all(it['type'] in ('matching', 'paragraph_match') and len(it['prompt']) < 40 for it in b['items'])
            for it in ([] if short_matching else b['items']):
                cost = len(it['prompt']) + (0 if shared else sum(len(o) for o in it.get('options', []) if it['type'] in ('mcq', 'choice'))) + 40
                if cur and (size + cost > 360 or len(cur) == 4):
                    groups.append(cur); cur, size = [], 0
                cur.append(it); size += cost
            if cur:
                groups.append(cur)
            if short_matching:
                groups = [b['items']]
            panel = next((m for m in pre_meta if m['t'] == 'options'), None)
            for gi, g in enumerate(groups):
                # The option list stays beside every group of items (HTML and PowerPoint), so it is not repeated in the body.
                body = [b['instructions']] if gi == 0 else []
                meta = [{'t': 'instr'}] if gi == 0 else []
                if pre[0] != b['instructions']:
                    body, meta = ([pre[0]], [{'t': 'instr'}]) if gi == 0 else ([], [])
                for it in g:
                    num = it['id'].rsplit('-Q', 1)[-1]
                    line = f"{num}.  {it['prompt']}"
                    opts = it['options'] if it['type'] in ('mcq', 'choice') and it.get('options') and not shared else []
                    if opts:
                        line += '\n' + '\n'.join('      ' + o for o in opts)
                    body.append(line)
                    meta.append({'t': 'item', 'num': num, 'prompt': it['prompt'], 'options': opts,
                                 'gap': it['type'] == 'completion', 'kind': it['type']})
                notes = notes_base + ' Learners commit answers before the reveal.'
                if st.get('type') == 'teacher_script':
                    notes += ' Read aloud once: ' + ' / '.join(st['paragraphs'])
                if st.get('type') == 'transcript':
                    notes += ' Play the approved recording from this slide only after learners have read the questions; never read the transcript as a substitute.'
                slide = {'title': b['title'] + (f' ({gi + 1}/{len(groups)})' if len(groups) > 1 else ''), 'body': body, 'meta': meta,
                         'notes': notes, 'workbook': wb, 'build': audio is None}
                if passage:
                    slide['passage'] = passage
                if panel:
                    slide['panel'] = {'title': panel['title'], 'options': panel['options']}
                if audio:
                    slide['audio'] = {**audio, 'part': gi + 1, 'parts': len(groups)}
                out.append(slide)
        elif k == 'items' and part == 'answers':
            quotable = (b.get('stimulus') or {}).get('type') in ('passage', 'transcript', 'teacher_script')
            groups, i = [], 0
            weigh = lambda it: len(it['prompt']) + len(it['evidence']) + len(it['reason']) + sum(len(o) for o in it.get('options', []) if it['type'] in ('mcq', 'choice')) // 3
            while i < len(b['items']):
                take = 2 if i + 1 < len(b['items']) and weigh(b['items'][i]) + weigh(b['items'][i + 1]) <= 430 else 1
                groups.append(b['items'][i:i + take]); i += take
            for g in groups:
                body, meta = [], []
                for it in g:
                    num = it['id'].rsplit('-Q', 1)[-1]
                    ev = f"“{it['evidence']}”" if quotable else it['evidence']
                    body.append(f"{num}   {it['answer']}\n{ev}\n{it['reason']}")
                    meta.append({'t': 'answer', 'num': num, 'prompt': it['prompt'], 'answer': it['answer'], 'evidence': ev, 'reason': it['reason']})
                ids = ', '.join(it['id'] for it in g)
                out.append({'title': answers_title(b['title']), 'body': body, 'meta': meta, 'reveal': True, 'build': True, 'workbook': wb,
                            'notes': f'Reveal only after learners explain their choices. Click to show each answer. {ids}. Corrections remain guided practice.'})
        elif k == 'contrast' and part == 'questions':
            labels = letters(len(b['examples']))
            for i in range(0, len(b['examples']), 2):
                body = [b['instructions']] if i == 0 else []
                meta = [{'t': 'instr'}] if i == 0 else []
                for j, ex in enumerate(b['examples']):
                    if i <= j < i + 2:
                        body.append(f"{labels[j]}.  {ex['text']}"); meta.append({'t': 'example', 'num': labels[j], 'text': ex['text']})
                out.append({'title': b['title'], 'body': body, 'meta': meta, 'build': True, 'workbook': wb, 'notes': notes_base + ' Learners decide before the reveal.'})
        elif k == 'contrast' and part == 'answers':
            labels = letters(len(b['examples']))
            for i in range(0, len(b['examples']), 2):
                body, meta = [], []
                for j, ex in enumerate(b['examples']):
                    if i <= j < i + 2:
                        body.append(f"{labels[j]}.  {ex['label']}\n{ex['comment']}")
                        meta.append({'t': 'discussion', 'num': labels[j], 'label': ex['label'], 'text': ex['comment']})
                out.append({'title': f"{b['title']} — discussion", 'body': body, 'meta': meta, 'reveal': True, 'build': True, 'workbook': wb,
                            'notes': 'Ask learners to explain their choice before revealing each comment.'})
        elif k == 'writing' and part == 'prompt':
            out.append({'title': b['title'], 'body': [b['prompt'], b['conditions']], 'meta': [{'t': 'task'}, {'t': 'conditions'}],
                        'workbook': wb, 'timer': self.writing_minutes(b), 'notes': notes_base + ' The model is not shown until after learners write.'})
        elif k == 'writing' and part == 'model':
            paras = b['model'].split('\n\n')
            chunks = self.fit_chunks(paras, 700)
            for ci, ch in enumerate(chunks):
                body = ch + ([b['model_label']] if ci == len(chunks) - 1 else [])
                meta = [{'t': 'model'} for _ in ch] + ([{'t': 'small'}] if ci == len(chunks) - 1 else [])
                out.append({'title': 'Illustrative model' + (f' ({ci + 1}/{len(chunks)})' if len(chunks) > 1 else ''), 'body': body, 'meta': meta, 'reveal': True,
                            'workbook': wb, 'notes': b['model_label'] + ' Point out the argument chain. Do not ask learners to memorise it.'})
        elif k == 'speaking' and part == 'prompt':
            out.append({'title': b['title'], 'body': b['prompts'], 'meta': [{'t': 'card'} for _ in b['prompts']], 'build': True, 'workbook': wb,
                        'notes': b['instructions'] + ' ' + b['observation']})
        elif k == 'speaking' and part == 'model':
            out.append({'title': 'A developed spoken answer', 'body': [b['model']], 'meta': [{'t': 'model'}], 'reveal': True, 'workbook': wb,
                        'notes': 'Read naturally once. This is a live classroom model, not a script to memorise or a Listening task.'})
        return out

    @staticmethod
    def writing_minutes(b):
        m = re.search(r'(\d+)\s*minutes', b.get('conditions', ''))
        return int(m.group(1)) if m else None

    def build_slides(self):
        d = self.d
        slides = [{'title': d['title'], 'kind': 'cover', 'body': [f"Lesson {self.n} · Week {d['week']}", '\n'.join(o['text'] for o in d['objectives'][:2])],
                   'meta': [{'t': 'kicker'}, {'t': 'lead'}], 'dark': True, 'notes': f"{d['status']}. Confirm the reviewed version before teaching. " + d['audio']['statement']},
                  {'title': 'Today you will', 'body': [o['text'] for o in d['objectives']], 'meta': [{'t': 'goal'} for _ in d['objectives']], 'build': True,
                   'notes': 'Objectives are teaching goals, not measured results.'}]
        self.stage_slides = []
        for si, s in enumerate(d['stages']):
            wbs = []
            for ref in s['show']:
                t = self.blocks[ref['block']]['title']
                if t not in wbs:
                    wbs.append(t)
            minutes = s['end'] - s['start']
            slides.append({'stage': si, 'kind': 'stage', 'title': s['title'], 'body': [s['student'], f"{s['start']}–{s['end']} minutes"],
                           'meta': [{'t': 'lead'}, {'t': 'time'}], 'dark': si in (0,) or not s['show'], 'workbook_list': wbs, 'timer': minutes,
                           'step': f"Step {si + 1} of {len(d['stages'])}",
                           'notes': f"{s['start']}-{s['end']} min. Teacher: {s['teacher']} Say: {s['say']} Check: {s['check']}"})
            for ref in s['show']:
                for bs in self.block_slides(self.blocks[ref['block']], ref['part']):
                    slides.append({**bs, 'stage': si})
        # A recording plays only where learners listen: the last question showing of its block before the reveal.
        for rid in {sl['audio']['id'] for sl in slides if sl.get('audio')}:
            idx = [i for i, sl in enumerate(slides) if (sl.get('audio') or {}).get('id') == rid]
            last_stage = slides[idx[-1]]['stage']
            for i in idx:
                if slides[i]['stage'] != last_stage:
                    slides[i] = {k: v for k, v in slides[i].items() if k != 'audio'}
                    slides[i]['build'] = True
        slides.append({'title': 'Exit ticket', 'kind': 'exit', 'body': d['exit_ticket'], 'meta': [{'t': 'goal'} for _ in d['exit_ticket']], 'dark': True,
                       'workbook': 'Exit ticket', 'notes': 'Collect original work. Feedback stays scoped to today.'})
        self.slides = self.legible(slides)
        return self.slides

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
                  self.p(f"3. Project Lesson_{self.n:02d}_Slides.html (the classroom presentation: recordings, timers and click-by-click reveals are built in; press F for full screen, N for notes). PowerPoint versions: Lesson_{self.n:02d}_Presentation.pptx (animated, recordings embedded) and Lesson_{self.n:02d}_Presentation_motion_free.pptx. Answers appear only on separate reveal slides."),
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
        import sys
        sys.path.insert(0, str(Path(__file__).resolve().parent))
        from lesson_pptx import build
        for animated, name, motion in ((True, f"Lesson_{self.n:02d}_Presentation.pptx", 'click-triggered 250 ms fade builds and fade transitions; nothing automatic'),
                                       (False, f"Lesson_{self.n:02d}_Presentation_motion_free.pptx", 'none (motion-free; click to advance)')):
            dest = self.out / 'Teacher-private' / name
            total = build(self, self.body_size, animated, dest)
            self.files.append({'file': str(dest.relative_to(self.out)), 'audience': 'teacher', 'slides': total, 'motion': motion})

    MIN_SIZE = 20

    def legible(self, slides):
        """Split dense slides so body text stays at least MIN_SIZE pt; never truncate content."""
        out = []
        for sl in slides:
            pending = [sl]
            while pending:
                cur = pending.pop(0)
                if self.body_size('\n\n'.join(cur['body']), 4.9 if (cur.get('image') or cur.get('panel') or cur.get('passage')) else 12.1) >= self.MIN_SIZE - (2 if (cur.get('image') or cur.get('panel') or cur.get('passage')) else 0):
                    out.append(cur); continue
                body = cur['body']
                meta = cur.get('meta') or [{'t': 'text'} for _ in body]
                if len(body) == 2 and meta[0].get('t') == 'instr':
                    out.append(cur); continue  # instructions stay with their first question
                if len(body) > 1:
                    half = max(1, len(body) // 2)
                    while half < len(body) - 1 and all(x.get('t') in ('instr', 'options') for x in meta[:half]):
                        half += 1
                    parts = [body[:half], body[half:]]
                    metas = [meta[:half], meta[half:]]
                else:
                    sentences = re.split(r'(?<=[.!?])\s+', body[0])
                    half = max(1, len(sentences) // 2)
                    parts = [[' '.join(sentences[:half])], [' '.join(sentences[half:])]]
                    metas = [[{**meta[0]}], [{**meta[0]}]]
                    if not parts[1][0]:
                        raise ValueError(f"Cannot split slide legibly: {cur['title']}")
                base = re.sub(r' \(continued\)$', '', cur['title'])
                second = dict(cur)
                pending[:0] = [{**cur, 'body': parts[0], 'meta': metas[0]}, {**second, 'title': base + ' (continued)', 'body': parts[1], 'meta': metas[1]}]
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
        items = []
        for r in d['audio']['recordings']:
            rel = f"Teacher-private/Audio/{r['id']}_v1.mp3"
            if (self.out / rel).exists():
                items.append(f"<li><a href=\"{E(rel)}\">{E(r['id'])}</a>: {E(r['status'])}</li>")
            else:
                items.append(f"<li>{E(r['id'])}: {E(r['status'])}</li>")
        audio = ''.join(items)
        audio_html = f"<p><strong>Recordings required.</strong> {E(d['audio']['statement'])}</p><ul>{audio}</ul>" if d['audio']['required'] else f"<p><strong>{E(d['audio']['statement'])}</strong></p>"
        status_html = (f'<p><strong>{E(d["status"])}.</strong> Ready to teach. Student tasks are not published in Brains Heist by this pack; paper work does not save to IELTS Journey.</p>' if d.get('approval_record') else f'<p><strong>{E(d["status"])}.</strong> Complete the human review record before classroom release. This content is not published in Brains Heist.</p>')
        start = (f'<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Lesson {n} start guide</title><style>{css}</style><main>'
                 f'<p>{E(self.school)}<br>Brains Heist IELTS</p><h1>Lesson {n}<br>{E(d["title"])}</h1>'
                 f'{status_html}'
                 f'<section><h2>Start here</h2><ol><li>Keep the extracted folder together. Read the <a href="Teacher-private/Teacher_Guide.pdf">teacher guide</a>.</li>'
                 f'<li>Print the <a href="Students/Student_Workbook.pdf">student workbook</a> and <a href="Students/Homework.pdf">homework</a> for each learner.</li>'
                 f'<li>Project the <a href="Teacher-private/Lesson_{n:02d}_Slides.html">classroom presentation</a>: it follows the workbook, plays the recordings from the slide, and reveals questions and answers on your clicks (F full screen, N teacher notes, P play/pause). PowerPoint versions: <a href="Teacher-private/Lesson_{n:02d}_Presentation.pptx">animated, with recordings</a> and <a href="Teacher-private/Lesson_{n:02d}_Presentation_motion_free.pptx">motion-free</a>. Answers appear only on separate reveal slides.</li>'
                 f'<li>Keep <a href="Teacher-private/Teacher_Keys_Scripts_Models.pdf">keys, scripts and models</a> and the <a href="Teacher-private/Fresh_Check_WITHHELD.pdf">withheld fresh check</a> private.</li>'
                 f'<li>Use the <a href="Teacher-private/Planning_and_Review_Record.pdf">planning and review record</a> for observations and the human review.</li></ol>{audio_html}</section>'
                 f'<section><h2>Needs internet?</h2><p>No. Everything in this pack works offline. Any online practice must be assigned through the existing Brains Heist workflow.</p></section>'
                 f'<section><h2>Learners who join later</h2><p>Keep completed results. Arrange missing screeners separately with their full time, then join the current lesson.</p></section>'
                 f'<section><h2>Plan B</h2><p>Projector fails: use the teacher guide and printed workbook. Printing fails: show only the student workbook. '
                 + ('Recording unavailable: stop the listening activity and reschedule; never read the transcript as a substitute.' if d['audio']['required'] else 'No audio device is needed.')
                 + f'</p></section><small>{E(self.code)} v{E(d["version"])}. Diagnostic Bible {E(d["bibles"]["diagnostic"])}; Lessons Bible {E(d["bibles"]["lessons"])}; Visual &amp; UX Bible {E(d["bibles"]["visual"])}. Paper work does not save into IELTS Journey.</small></main></html>')
        (self.out / '01-START-HERE.html').write_text(start)

        import sys
        sys.path.insert(0, str(Path(__file__).resolve().parent))
        from lesson_presenter import render
        (self.out / f'Teacher-private/Lesson_{n:02d}_Slides.html').write_text(render(self, self.body_size))
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
        if self.template:
            return self.finish_template(manifest)
        zpath = self.out.parent / f"{self.code}_v{self.d['version']}_private_review_pack.zip"
        with zipfile.ZipFile(zpath, 'w', zipfile.ZIP_DEFLATED) as z:
            for path in sorted(self.out.rglob('*')):
                if path.is_file():
                    z.write(path, Path(self.code) / path.relative_to(self.out))
        return zpath

    def finish_template(self, manifest):
        """School-neutral template for the per-school branding route (services/ieltsPackBranding.ts, branding 1.0.0)."""
        code, n = self.code, self.n
        w, h = 595.276, 841.89
        slot = {'names': [{'text': TOKEN, 'x': 42, 'y': 32, 'width': w - 42 - 90, 'size': 9, 'color': 0x15243A, 'bold': True}],
                'logos': [[w - 80, 26, w - 42, 66]]}
        pdfs = {f'{code}/{rel}': [slot] * pages for rel, pages in self.pdf_pages.items()}
        placeholder = (self.out / 'assets' / 'school-logo.png').read_bytes()
        pptx_media = {}
        for deck in sorted((self.out / 'Teacher-private').glob('*.pptx')):
            with zipfile.ZipFile(deck) as z:
                hits = [m for m in z.namelist() if m.startswith('ppt/media/') and z.read(m) == placeholder]
            if len(hits) != 1:
                raise SystemExit(f'{deck.name}: expected exactly one logo placeholder media part, found {len(hits)}')
            pptx_media[f'{code}/Teacher-private/{deck.name}'] = hits[0]
        branding = {'version': '1.0.0', 'lesson_code': code, 'pdfs': pdfs, 'pptx_media': pptx_media,
                    'source_archive_sha256': self.source_sha, 'approved_source_sha256': self.source_sha,
                    'content_revision': self.d['version'],
                    'resources': {'slides': f'{code}/Teacher-private/Lesson_{n:02d}_Slides.html',
                                  'workbook': f'{code}/Students/Student_Workbook.pdf',
                                  'pptx': f'{code}/Teacher-private/Lesson_{n:02d}_Presentation.pptx'}}
        zpath = self.out.parent / f"{code}_v{self.d['version']}_school_template.zip"
        with zipfile.ZipFile(zpath, 'w', zipfile.ZIP_DEFLATED) as z:
            for path in sorted(self.out.rglob('*')):
                if path.is_file() and path.name != 'manifest.json':
                    z.write(path, Path(code) / path.relative_to(self.out))
            z.writestr('TEMPLATE-MANIFEST.json', json.dumps(manifest, indent=2, ensure_ascii=False))
            z.writestr('BRANDING.json', json.dumps(branding, indent=1))
            z.write('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 'assets/branding-regular.ttf')
            z.write('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 'assets/branding-bold.ttf')
        return zpath


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--source', required=True)
    ap.add_argument('--output', required=True)
    ap.add_argument('--school', default='School IELTS Programme')
    ap.add_argument('--logo')
    ap.add_argument('--review-date')
    ap.add_argument('--template', action='store_true', help='School-neutral template for per-school branding at download time')
    ap.add_argument('--audio-dir', help='Folder with produced <recording id>_v1.mp3 files to include for teacher review')
    args = ap.parse_args()
    check = subprocess.run(['node', str(ROOT / 'scripts/ielts/lesson-source-contract.mjs'), args.source], capture_output=True, text=True)
    if check.returncode:
        raise SystemExit('Source contract failed; fix the lesson source first.\n' + check.stdout)
    pack = Pack(args)
    pack.copy_audio()
    pack.build_slides()
    pack.build_pdfs()
    pack.build_pptx()
    pack.build_html()
    zpath = pack.finish()
    print(json.dumps({'output': str(pack.out), 'zip': str(zpath), 'slides': len(pack.slides), 'files': len(pack.files)}))


if __name__ == '__main__':
    main()
