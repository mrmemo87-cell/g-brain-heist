#!/usr/bin/env python3
"""Build a paper mock-test pack from a bh-ielts-mock-source/1 mock.json.

Output: student question papers and answer sheet (no keys), teacher-only keys and transcripts, administration
guide, speaking examiner script, writing/speaking feedback forms, results record, a test-control page that plays
the listening recording under teacher control, a start guide, a hash manifest and a ZIP. With --template the
pack is school-neutral and carries the branding contract used by services/ieltsPackBranding.ts (1.0.0).

Usage:
  python3 scripts/ielts/build-mock-pack.py --source docs/ielts/mocks/mock-1/mock.json --output /private/out/M1 \
      [--audio /path/IELTS-M1_Listening_v1.mp3 --audio-record /path/production.json] [--template | --school NAME --logo FILE]
"""
import argparse, hashlib, html, json, re, shutil, subprocess, sys, zipfile
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import PageBreak, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle, KeepTogether, Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
import mock_figures  # noqa: E402

INK, PRIMARY, MUTED, LINE, WASH = '#15243A', '#1746B0', '#4C6076', '#DCE5EF', '#EEF3FA'
ROOT = Path(__file__).resolve().parents[2]
E = html.escape
TOKEN = '{{BH_SCHOOL_NAME}}'
ROMAN = re.compile(r'^(i|ii|iii|iv|v|vi|vii|viii|ix|x|xi|xii)$')


def sha256(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def items_of(groups):
    for g in groups:
        if g['type'] == 'multi':
            for n in range(g['range'][0], g['range'][1] + 1):
                yield n, g, None
        else:
            for it in g['items']:
                yield it['n'], g, it


class MockPack:
    def __init__(self, args):
        self.args = args
        self.source = Path(args.source).resolve()
        self.d = json.loads(self.source.read_text())
        self.source_sha = sha256(self.source)
        self.code, self.n = self.d['code'], self.d['number']
        self.template = bool(args.template)
        self.school = TOKEN if self.template else args.school
        self.out = Path(args.output).resolve()
        if self.out.exists() and any(self.out.iterdir()):
            raise SystemExit(f'Output directory {self.out} is not empty; use a new directory for each build.')
        for sub in ['Students', 'Teacher-private', 'assets']:
            (self.out / sub).mkdir(parents=True, exist_ok=True)
        self.logo = None
        if self.template:
            from PIL import Image as PILImage
            ph = self.out / 'assets' / 'school-logo.png'
            im = PILImage.new('RGBA', (600, 675), (255, 255, 255, 0)); im.putpixel((0, 0), (23, 70, 176, 1)); im.save(ph)
            self.logo = ph
        elif args.logo:
            self.logo = Path(args.logo).resolve()
            shutil.copyfile(self.logo, self.out / 'assets' / ('school-logo' + self.logo.suffix.lower()))
        self.files, self.pdf_pages = [], {}
        self.audio = None
        self._fonts()

    # ---------- PDF primitives ----------
    def _fonts(self):
        for name, query in [('BHRegular', 'DejaVu Sans'), ('BHBold', 'DejaVu Sans:style=Bold'), ('BHItalic', 'DejaVu Sans:style=Oblique')]:
            path = subprocess.check_output(['fc-match', '-f', '%{file}', query], text=True).strip()
            if 'DejaVuSans' not in path:
                raise RuntimeError('DejaVu Sans is required for consistent PDF output')
            pdfmetrics.registerFont(TTFont(name, path))
        s = getSampleStyleSheet()
        s.add(ParagraphStyle('T', fontName='BHBold', fontSize=20, leading=25, textColor=colors.HexColor(INK), spaceAfter=8))
        s.add(ParagraphStyle('H', fontName='BHBold', fontSize=12.5, leading=16, textColor=colors.HexColor(PRIMARY), spaceBefore=8, spaceAfter=4, keepWithNext=1))
        s.add(ParagraphStyle('I', fontName='BHItalic', fontSize=10, leading=14, textColor=colors.HexColor(INK), spaceAfter=6))
        s.add(ParagraphStyle('B', fontName='BHRegular', fontSize=10.5, leading=15, textColor=colors.HexColor(INK), spaceAfter=6))
        s.add(ParagraphStyle('Pass', fontName='BHRegular', fontSize=10.5, leading=15.5, textColor=colors.HexColor(INK), spaceAfter=8, firstLineIndent=0))
        s.add(ParagraphStyle('Q', fontName='BHRegular', fontSize=10.5, leading=15, textColor=colors.HexColor(INK), spaceAfter=5, leftIndent=26, firstLineIndent=-26))
        s.add(ParagraphStyle('O', fontName='BHRegular', fontSize=10.3, leading=14, textColor=colors.HexColor(INK), spaceAfter=2, leftIndent=44))
        s.add(ParagraphStyle('S', fontName='BHRegular', fontSize=8.6, leading=12, textColor=colors.HexColor(MUTED), spaceAfter=5))
        s.add(ParagraphStyle('Arrow', fontName='BHBold', fontSize=13, leading=15, textColor=colors.HexColor(PRIMARY), leftIndent=174, spaceBefore=1, spaceAfter=1))
        s.add(ParagraphStyle('Cell', fontName='BHRegular', fontSize=9, leading=12, textColor=colors.HexColor(INK)))
        s.add(ParagraphStyle('Big', fontName='BHBold', fontSize=26, leading=32, textColor=colors.HexColor(INK), spaceAfter=10))
        self.st = s

    def p(self, text, style='B'):
        return Paragraph(E(str(text)).replace('\n', '<br/>'), self.st[style])

    def lines(self, n, h=22):
        t = Table([[''] for _ in range(n)], colWidths=[511], rowHeights=[h] * n)
        t.setStyle(TableStyle([('LINEBELOW', (0, 0), (-1, -1), .4, colors.HexColor(LINE))]))
        return [t, Spacer(1, 6)]

    def table(self, rows, widths, row_height=None, head=True):
        t = Table([[self.p(c, 'Cell') if isinstance(c, str) else c for c in r] for r in rows], colWidths=widths, repeatRows=1 if head else 0, hAlign='LEFT',
                  rowHeights=([None] + [row_height] * (len(rows) - 1)) if row_height else None)
        st = [('VALIGN', (0, 0), (-1, -1), 'MIDDLE'), ('BOX', (0, 0), (-1, -1), .5, colors.HexColor(LINE)), ('INNERGRID', (0, 0), (-1, -1), .4, colors.HexColor(LINE)),
              ('LEFTPADDING', (0, 0), (-1, -1), 5), ('RIGHTPADDING', (0, 0), (-1, -1), 5), ('TOPPADDING', (0, 0), (-1, -1), 4), ('BOTTOMPADDING', (0, 0), (-1, -1), 4)]
        if head:
            st.append(('BACKGROUND', (0, 0), (-1, 0), colors.HexColor(WASH)))
        t.setStyle(TableStyle(st))
        return [t, Spacer(1, 8)]

    def pdf(self, rel, title, pages, audience, label):
        story = []
        for i, page in enumerate(pages):
            if i:
                story.append(PageBreak())
            if page and page[0] == 'NOTITLE':
                story.extend(page[1:])
            else:
                story.append(self.p(title if i == 0 else f'{title} (continued)', 'T'))
                story.extend(page)

        def header(c, doc):
            w, h = doc.pagesize
            c.saveState()
            c.setFillColor(colors.HexColor(PRIMARY)); c.rect(0, h - 8, w, 8, fill=1, stroke=0)
            if not self.template:
                c.setFont('BHBold', 9); c.setFillColor(colors.HexColor(INK)); c.drawString(42, h - 32, self.school)
            c.setFont('BHRegular', 8); c.setFillColor(colors.HexColor(MUTED))
            c.drawString(42, h - 46, f"Brains Heist IELTS | {self.d['title']} | {label}")
            if self.logo and not self.template:
                c.drawImage(ImageReader(str(self.logo)), w - 80, h - 66, 38, 40, preserveAspectRatio=True, mask='auto')
            c.setStrokeColor(colors.HexColor(LINE)); c.line(42, 37, w - 42, 37)
            c.setFont('BHRegular', 8)
            state = 'Approved for teaching' if self.d.get('approval_record') else 'Draft for review'
            c.drawString(42, 24, f"{self.code} v{self.d['version']} | {state} | Practice test, not an official IELTS test")
            c.drawRightString(w - 42, 24, str(doc.page))
            c.restoreState()

        dest = self.out / rel
        doc = SimpleDocTemplate(str(dest), pagesize=(595.276, 841.89), leftMargin=42, rightMargin=42, topMargin=78, bottomMargin=50,
                                title=f"{self.code} {title}", author='Brains Heist IELTS')
        doc.build(story, onFirstPage=header, onLaterPages=header)
        from pypdf import PdfReader
        n = len(PdfReader(str(dest)).pages)
        self.pdf_pages[rel] = n
        self.files.append({'file': rel, 'audience': audience, 'pages': n})

    # ---------- question rendering ----------
    def figure(self, fig, name, width=500):
        dest = self.out / 'assets' / f'{name}.png'
        if not dest.exists():
            mock_figures.render(fig, dest)
        from PIL import Image as PILImage
        w, h = PILImage.open(dest).size
        height = width * h / w
        if height > 560:
            width, height = width * 560 / height, 560
        return Image(str(dest), width=width, height=height)

    def option_box(self, title, options):
        rows = [[title]] + [[o] for o in options]
        return self.table(rows, [511])

    def group_flow(self, g, student=True):
        a, b = g['range']
        out = [self.p(f'Questions {a}–{b}' if a != b else f'Question {a}', 'H'), self.p(g['instructions'], 'I')]
        t = g['type']
        if t == 'multi':
            out.append(self.p(g['stem']))
            out += [self.p(o, 'O') for o in g['options']]
            return out
        if g.get('form_title'):
            out.append(self.p(g['form_title'], 'H'))
        if t in ('matching', 'endings', 'headings') and g.get('options') and t != 'endings' and not g.get('map'):
            out += self.option_box(g.get('options_title', 'Options'), g['options'])
        if t == 'summary_box':
            out.append(self.p(g.get('summary_title', 'Summary'), 'H'))
            out.append(self.p(g['summary'], 'Pass'))
            out += self.option_box('Words', g['options'])
            return out
        if t == 'completion' and g.get('flow'):
            # flow-chart completion: one boxed stage per item, joined by downward arrows; optional fixed stages
            stages = g.get('stages') or [it['prompt'] for it in g['items']]
            nums = {it['prompt']: it['n'] for it in g['items']}
            chart = []
            for i, s in enumerate(stages):
                if i:
                    chart.append(self.p('↓', 'Arrow'))
                label = f"{nums[s]}   " if s in nums else ''
                chart += self.table([[label + s.replace('______', '__________')]], [360], head=False)[:1]
            out.append(KeepTogether(chart))
            return out
        for it in g['items']:
            if t == 'mcq':
                out.append(KeepTogether([self.p(f"{it['n']}   {it['prompt']}", 'Q')] + [self.p(o, 'O') for o in it['options']]))
            elif t == 'completion':
                out.append(self.p(f"{it['n']}   {it['prompt'].replace('______', '__________')}", 'Q'))
            elif t in ('tfng', 'ynng'):
                out.append(self.p(f"{it['n']}   {it['prompt']}", 'Q'))
            elif t == 'headings':
                out.append(self.p(f"{it['n']}   {it['prompt']}   ______", 'Q'))
            else:  # matching, endings, short
                out.append(self.p(f"{it['n']}   {it['prompt']}" + ('   ______' if t != 'endings' else ' ______'), 'Q'))
        if t == 'endings':
            out += self.option_box(g.get('options_title', 'Endings'), g['options'])
        if t in ('matching', 'headings', 'short', 'endings') and len(g['items']) <= 8:
            # a short set stays on one page with its heading, instructions and option box
            return [KeepTogether(out)]
        return out

    def answer_text(self, g, it):
        if g['type'] == 'multi':
            return ' and '.join(g['answer']) + ' (in either order)'
        acc = [a for a in it.get('accept', []) if a != it['answer']]
        return it['answer'] + (f"  (also accept: {', '.join(acc)})" if acc else '')

    # ---------- papers ----------
    def listening_paper(self):
        L = self.d['listening']
        pages = [[self.p('Time: approximately 30 minutes, plus 10 minutes to transfer your answers.', 'B'),
                  self.p('Write your answers on the question paper while you listen. At the end, you will have 10 minutes to transfer them to the answer sheet. Answer all the questions. There are 40 questions; each question carries one mark. The recording is played once only.', 'I'),
                  self.p('Candidate name: _____________________________   Date: ______________', 'B')]]
        for part in L['parts']:
            a = part['groups'][0]['range'][0]; b = part['groups'][-1]['range'][1]
            flow = [self.p(f"PART {part['part']}   Questions {a}–{b}", 'Big')]
            for g in part['groups']:
                if g.get('figure'):
                    flow.append(self.figure(g['figure'], f"listening-{g['range'][0]}"))
                flow += self.group_flow(g)
            pages.append(['NOTITLE'] + flow)
        self.pdf('Students/Listening_Question_Paper.pdf', f"{self.d['title']}: Listening", pages, 'student', 'Listening question paper')

    def reading_paper(self):
        pages = [[self.p('Time: 60 minutes. There is no extra time to transfer answers.', 'B'),
                  self.p('There are 40 questions on three passages. Write your answers on the answer sheet. Spelling counts. Answer all the questions; there is no penalty for wrong answers.', 'I'),
                  self.p('Candidate name: _____________________________   Date: ______________', 'B')]]
        for ps in self.d['reading']['passages']:
            a = ps['groups'][0]['range'][0]; b = ps['groups'][-1]['range'][1]
            text = [self.p(f"READING PASSAGE {ps['n']}", 'Big'),
                    self.p(f"You should spend about 20 minutes on Questions {a}–{b}, which are based on Reading Passage {ps['n']} below.", 'I'),
                    self.p(ps['title'], 'H')]
            for i, para in enumerate(ps['paragraphs']):
                text.append(self.p((f'{chr(65 + i)}   ' if ps['labelled'] else '') + para, 'Pass'))
            pages.append(['NOTITLE'] + text)
            q = []
            for g in ps['groups']:
                if g.get('figure'):
                    q.append(self.figure(g['figure'], f"reading-{g['range'][0]}"))
                q += self.group_flow(g)
            pages.append(['NOTITLE'] + q)
        self.pdf('Students/Reading_Question_Paper.pdf', f"{self.d['title']}: Reading", pages, 'student', 'Reading question paper')

    def writing_paper(self):
        W = self.d['writing']
        t1 = [self.p('Time: 60 minutes', 'B'), self.p('WRITING TASK 1', 'Big'), self.p('You should spend about 20 minutes on this task.', 'I'),
              self.p(W['task1']['prompt'], 'B'), self.figure(W['task1']['figure'], 'writing-task1')]
        t2 = ['NOTITLE', self.p('WRITING TASK 2', 'Big'), self.p('You should spend about 40 minutes on this task.', 'I'), self.p('Write about the following topic:', 'B'),
              self.p(W['task2']['prompt'].split(' Give reasons')[0], 'H'),
              self.p('Give reasons for your answer and include any relevant examples from your own knowledge or experience.' if 'Give reasons' in W['task2']['prompt'] else '', 'B'),
              self.p('Write at least 250 words.', 'B')]
        booklet = []
        for task, pages_n in (('Task 1', 2), ('Task 2', 3)):
            for k in range(pages_n):
                booklet.append(['NOTITLE', self.p(f"Answer booklet: {task}" + (' (continued)' if k else ''), 'H'),
                                self.p('Candidate name: _____________________________', 'S') if not k else Spacer(1, 2), *self.lines(26, 23)])
        self.pdf('Students/Writing_Question_Paper.pdf', f"{self.d['title']}: Writing", [t1, t2] + booklet, 'student', 'Writing question paper and answer booklet')

    def answer_sheet(self):
        def grid(label):
            rows = [['No.', 'Answer', '✓ ✗', 'No.', 'Answer', '✓ ✗']]
            for i in range(20):
                rows.append([str(i + 1), '', '', str(i + 21), '', ''])
            rows.append(['', f'{label} total (out of 40):', '', '', 'Marker initials:', ''])
            return self.table(rows, [30, 180, 34, 30, 183, 34], row_height=24)
        head = [self.p('Candidate name: _____________________________   Date: ______________', 'B'),
                self.p('Write clearly in pencil or pen. Spelling counts. Write one answer per box; for "choose TWO" questions, write one letter in each box, in either order.', 'S')]
        self.pdf('Students/Answer_Sheet.pdf', f"{self.d['title']}: answer sheet",
                 [head + [self.p('Listening', 'H')] + grid('Listening'), [self.p('Reading', 'H')] + grid('Reading')], 'student', 'Answer sheet')

    # ---------- teacher documents ----------
    def key_and_transcripts(self):
        L, R = self.d['listening'], self.d['reading']
        rows = [['Q', 'Answer', 'Evidence (transcript)']]
        for part in L['parts']:
            for n, g, it in items_of(part['groups']):
                if g['type'] == 'multi':
                    k = n - g['range'][0]
                    rows.append([str(n), self.answer_text(g, None) if k == 0 else '(see above)', f"“{g['evidence'][k]}”"])
                else:
                    rows.append([str(n), self.answer_text(g, it), f"“{it['evidence']}”"])
        p1 = [self.p('Keep this document private until all candidates have finished. Give one mark for each correct answer. Answers must be spelled correctly and respect the word limit; capital letters do not matter. For "choose TWO" questions, each correct letter scores one mark, in either order.', 'I'),
              self.p('Listening answer key', 'H'), Spacer(1, 0), *self.table(rows, [28, 150, 333])]
        rrows = [['Q', 'Answer', 'Evidence (passage)']]
        for ps in R['passages']:
            for n, g, it in items_of(ps['groups']):
                if g['type'] == 'multi':
                    k = n - g['range'][0]
                    rrows.append([str(n), self.answer_text(g, None) if k == 0 else '(see above)', f"“{g['evidence'][k]}”"])
                else:
                    ev = it.get('note') or it['evidence']
                    rrows.append([str(n), self.answer_text(g, it), ev if it['answer'] == 'NOT GIVEN' else f"“{ev}”"])
        p2 = [self.p('Reading answer key', 'H'), Spacer(1, 0), *self.table(rrows, [28, 150, 333])]
        trans = []
        for part in L['parts']:
            flow = [self.p(f"Listening Part {part['part']} transcript: {part['title']}", 'H'), self.p(part['intro'], 'I')]
            for seg in part['segments']:
                flow.append(self.p(f"[Reading time: {seg['reading_seconds']} seconds. Questions {seg['questions']}]", 'S'))
                flow += [self.p(line, 'Q') for line in seg['lines']]
            trans.append(flow)
        self.pdf('Teacher-private/Answer_Key_and_Transcripts.pdf', f"{self.d['title']}: answer key and transcripts", [p1, p2] + trans, 'teacher', 'Teacher-only key')

    def assessment_pack(self):
        W, S = self.d['writing'], self.d['speaking']
        crit_w = ['Task Achievement (Task 1) / Task Response (Task 2)', 'Coherence and Cohesion', 'Lexical Resource', 'Grammatical Range and Accuracy']
        crit_s = ['Fluency and Coherence', 'Lexical Resource', 'Grammatical Range and Accuracy', 'Pronunciation']
        intro = [self.p('How to use this document', 'H'),
                 self.p(self.d['scoring']['writing'], 'B'), self.p(self.d['scoring']['speaking'], 'B'), self.p(self.d['scoring']['bands'], 'I'),
                 self.p('For each criterion, quote the candidate exactly (a phrase or sentence), say what it shows, and give one next step. Use the public IELTS band descriptors as your reference for what each criterion looks at; do not write a band number on this mock.', 'B')]
        form_w = [self.p('Writing feedback form (one per candidate)', 'H'), self.p('Candidate: ________________________   Marker: ________________   Date: ________', 'B'),
                  self.p('Task 1: word count ______   Task 2: word count ______   Time used: ______', 'B'),
                  *self.table([['Criterion', 'Quote from the candidate', 'What it shows', 'Next step']] + [[c, '', '', ''] for c in crit_w], [130, 140, 120, 121], row_height=74),
                  self.p('Task 2 carries more weight than Task 1 when you summarise the candidate\'s writing.', 'S')]
        form_s = [self.p('Speaking feedback form (one per candidate)', 'H'), self.p('Candidate: ________________________   Examiner: ________________   Date: ________   Recorded: yes / no', 'B'),
                  *self.table([['Criterion', 'What the candidate said (exact words)', 'What it shows', 'Next step']] + [[c, '', '', ''] for c in crit_s], [120, 150, 120, 121], row_height=74),
                  self.p('Comment on pronunciation only from what you heard live or from the recording, never from notes or a transcript.', 'S')]
        models = [self.p('Illustrative models (withheld until after the mock)', 'H')]
        for key, title in (('task1', 'Task 1'), ('task2', 'Task 2')):
            models += [self.p(title, 'H'), self.p(W[key]['model_label'], 'S')] + [self.p(x, 'Pass') for x in W[key]['model'].split('\n\n')]
            models += [self.p(f"Model length: {len(W[key]['model'].split())} words.", 'S'), self.p('What to look for', 'H')] + [self.p('•  ' + c, 'Q') for c in W[key]['checklist']]
        self.pdf('Teacher-private/Writing_and_Speaking_Feedback.pdf', f"{self.d['title']}: Writing and Speaking feedback", [intro + form_w, form_s, models], 'teacher', 'Teacher-only assessment')

    def speaking_script(self):
        S = self.d['speaking']
        frame = [self.p('Each candidate is interviewed individually, for 11–14 minutes, in a quiet room. Record the interview if the candidate agrees and school consent rules allow; otherwise note exact phrases as they speak. Do not show the questions in advance.', 'I'),
                 self.p('Part 1 (4–5 minutes)', 'H'), self.p('"Good morning/afternoon. My name is ... Can you tell me your full name, please? ... Thank you. In this first part, I\'d like to ask you some questions about yourself."', 'B')]
        for topic in S['part1']:
            frame += [self.p(f"Let's talk about {topic['topic'].lower()}.", 'H')] + [self.p('•  ' + q, 'Q') for q in topic['questions']]
        p2 = S['part2']
        frame2 = [self.p('Part 2 (3–4 minutes)', 'H'),
                  self.p('"Now I\'m going to give you a topic, and I\'d like you to talk about it for one to two minutes. Before you talk, you\'ll have one minute to think about what you\'re going to say. You can make some notes if you wish. Do you understand? Here is some paper and a pencil for making notes, and here is your topic."', 'B'),
                  self.p('Give the candidate the cue card (next page). After one minute: "All right? Remember, you have one to two minutes for this, so don\'t worry if I stop you. I\'ll tell you when the time is up. Can you start speaking now, please?" Stop the candidate after two minutes.', 'B'),
                  self.p('Rounding-off questions (ask one or two):', 'H')] + [self.p('•  ' + q, 'Q') for q in p2['rounding_off']]
        frame2 += [self.p('Part 3 (4–5 minutes)', 'H'), self.p(f"\"We've been talking about {p2['card'][len('Describe '):].rstrip('.').lower()}, and I'd like to discuss with you one or two more general questions related to this.\"  Theme: {S['part3']['theme']}", 'B')]
        frame2 += [self.p('•  ' + q, 'Q') for q in S['part3']['questions']]
        frame2.append(self.p('Ask follow-up questions (Why? Can you give an example? Is that always true?) to extend the discussion. End: "Thank you. That is the end of the speaking test."', 'S'))
        card = ['NOTITLE', self.p('Candidate task card', 'S'), Spacer(1, 30), self.p(p2['card'], 'Big'), self.p('You should say:', 'B')] + [self.p('•  ' + x, 'Q') for x in p2['points']] + \
               [Spacer(1, 16), self.p('You will have to talk about the topic for one to two minutes. You have one minute to think about what you are going to say. You can make some notes to help you if you wish.', 'I')]
        self.pdf('Teacher-private/Speaking_Examiner_Script.pdf', f"{self.d['title']}: Speaking examiner script", [frame, frame2, card], 'teacher', 'Teacher-only speaking script')

    def admin_guide(self):
        t = self.d['timing']
        sched = [['Section', 'Time', 'What happens'],
                 ['Listening', f"about {t['listening_minutes']} minutes", 'Play the recording once from the test-control page. Candidates write on the question paper.'],
                 ['Transfer', f"{t['transfer_minutes']} minutes", 'Candidates copy their Listening answers onto the answer sheet. Start the transfer timer on the control page.'],
                 ['Reading', f"{t['reading_minutes']} minutes", 'No extra transfer time. Start the Reading timer.'],
                 ['Writing', f"{t['writing_minutes']} minutes", 'Task 1 about 20 minutes, Task 2 about 40 minutes. Start the Writing timer.'],
                 ['Speaking', t['speaking_minutes'], 'Individual interviews, the same day or within a week. Use the examiner script.']]
        page1 = [self.p('Purpose', 'H'),
                 self.p('A full-length practice test under real timing, so learners experience the pace and stamina of the whole exam. It is classroom practice, not an official IELTS test. Results are raw scores out of 40 for Listening and Reading, and criterion feedback for Writing and Speaking.', 'B'),
                 self.p(self.d['scoring']['bands'], 'I'),
                 self.p('Timetable (2 hours 40 minutes for the written papers, plus individual speaking)', 'H'), *self.table(sched, [70, 90, 351]),
                 self.p('A full mock needs its own session. Never compress it into a 60-minute lesson (Lessons Bible LB-10).', 'S')]
        page2 = [self.p('Before the test', 'H')] + [self.p(f'{i + 1}.  {x}', 'Q') for i, x in enumerate([
            'Print for each candidate: Listening question paper, Reading question paper, Writing question paper and answer booklet, answer sheet. Keep all Teacher-private files private.',
            'Open Teacher-private/Mock_Test_Control.html on the classroom computer, keep the folder together, and test the speakers at the back of the room with the sound check. Then return to the start.',
            'Arrange desks so candidates cannot see each other\'s papers. Phones off and away. Pencils, erasers and a visible clock.',
            'Book quiet slots for the speaking interviews (about 15 minutes per candidate).'])] + [
                 self.p('During the test', 'H')] + [self.p(f'{i + 1}.  {x}', 'Q') for i, x in enumerate([
            'Read the instructions on each paper aloud before starting it. Do not explain vocabulary or questions.',
            'Listening: press Play once. Do not pause or replay. The recording contains its own reading pauses. If the audio fails completely, stop, note the time and arrange a later sitting; do not read the transcript aloud.',
            'After Listening, start the 10-minute transfer timer. Then collect the Listening question papers.',
            'Reading and Writing: start each timer, announce 10 minutes and 1 minute remaining, and collect papers when time is up.',
            'Record anything unusual (late arrival, interruption, illness, extra time agreed for an access need).'])]
        page3 = [self.p('After the test', 'H')] + [self.p(f'{i + 1}.  {x}', 'Q') for i, x in enumerate([
            'Mark Listening and Reading with the private key: one mark per correct answer. Count only answers on the answer sheet.',
            'Give Writing and Speaking feedback with the forms in Writing_and_Speaking_Feedback.pdf. Quote the candidate; give one next step per criterion; no band number.',
            'Record raw scores and notes on the results record. Keep the papers as classroom evidence; nothing is saved to IELTS Journey automatically.',
            'Go through the answers with the class only after everyone, including absent learners, has sat the test, or keep this form for a later sitting.',
            'Compare with earlier mocks only when the conditions were the same; a different form is not automatically of equal difficulty.'])]
        self.pdf('Teacher-private/Administration_Guide.pdf', f"{self.d['title']}: administration guide", [page1, page2, page3], 'teacher', 'Teacher-only guide')

    def results_record(self):
        rows = [['Candidate', 'Listening /40', 'Reading /40', 'Writing: main next step', 'Speaking: main next step', 'Conditions / notes']] + [[''] * 6 for _ in range(16)]
        self.pdf('Teacher-private/Results_Record.pdf', f"{self.d['title']}: results record",
                 [[self.p('Raw scores and criterion notes only. Do not convert to bands or average across skills.', 'I'), *self.table(rows, [88, 52, 52, 112, 112, 95], row_height=30)]], 'teacher', 'Teacher-only record')

    # ---------- audio and control page ----------
    def copy_audio(self):
        if not self.args.audio:
            return
        src = Path(self.args.audio)
        rel = f"Teacher-private/Audio/{self.code}_Listening_v1.mp3"
        (self.out / 'Teacher-private/Audio').mkdir(exist_ok=True)
        shutil.copyfile(src, self.out / rel)
        record = json.loads(Path(self.args.audio_record).read_text()) if self.args.audio_record else {}
        self.audio = {'src': f"Audio/{self.code}_Listening_v1.mp3", 'parts': record.get('part_starts', []), 'duration': record.get('duration_seconds')}
        self.files.append({'file': rel, 'audience': 'teacher', 'recording': f'{self.code}-L', 'status': record.get('status', 'Produced; owner listening review pending'),
                           'sha256_source': sha256(src)})

    def control_page(self):
        logo = '../assets/school-logo.png' if self.template else ''
        if not self.template and self.logo:
            import base64
            mime = 'image/png' if self.logo.suffix.lower() == '.png' else 'image/jpeg'
            logo = f'data:{mime};base64,' + base64.b64encode(self.logo.read_bytes()).decode()
        t = self.d['timing']
        parts = [{'part': p['part'], 'title': p['title'], 'questions': f"{p['groups'][0]['range'][0]}–{p['groups'][-1]['range'][1]}"} for p in self.d['listening']['parts']]
        starts = self.audio['parts'] if self.audio else []
        audio_tag = f'<audio id="rec" preload="metadata" src="{E(self.audio["src"])}"></audio>' if self.audio else ''
        steps = [
            ('cover', self.d['title'], 'Academic practice test · Listening, Reading and Writing', None),
            ('listening', 'Listening', 'About 30 minutes. The recording is played once. Write your answers on the question paper.', None),
            ('timer', 'Transfer your answers', 'Copy your Listening answers onto the answer sheet.', t['transfer_minutes']),
            ('timer', 'Reading', '3 passages, 40 questions. Write your answers on the answer sheet. There is no extra transfer time.', t['reading_minutes']),
            ('timer', 'Writing', 'Task 1: about 20 minutes. Task 2: about 40 minutes. Task 2 counts for more.', t['writing_minutes']),
            ('end', 'End of the written test', 'Please stop writing and put your pen down.', None)]
        sec = []
        for i, (kind, title, sub, minutes) in enumerate(steps):
            body = f'<h1>{E(title)}</h1><p class="sub">{E(sub)}</p>'
            if kind == 'listening':
                if self.audio:
                    plist = ''.join(f'<li data-part="{p["part"]}"><b>Part {p["part"]}</b> · Questions {E(p["questions"])}</li>' for p in parts)
                    body += (f'<div class="player"><button type="button" id="play" class="big">▶ Start the recording</button><div class="meta"><div id="now">Ready</div>'
                             f'<div class="bar"><i id="fill"></i></div><div id="tm">0:00</div></div></div><ol class="parts">{plist}</ol>'
                             f'<p class="note">Teacher: press once and let it run. Do not pause or replay in a mock. Pause is available only for an emergency (P).</p>'
                             f'<p class="note"><button type="button" id="check">Sound check (10 seconds of Part 1)</button></p>')
                else:
                    body += '<p class="note">Recording not included in this pack. Do not read the transcript as a substitute; arrange the Listening section when the approved recording is available.</p>'
            if kind == 'timer':
                body += (f'<div class="timer" data-seconds="{int(minutes) * 60}"><span class="clock">{int(minutes)}:00</span>'
                         f'<button type="button" class="go">Start</button><button type="button" class="reset">Reset</button></div>'
                         f'<p class="note warn" hidden>10 minutes remaining</p>')
            sec.append(f'<section class="step{" dark" if kind in ("cover", "end") else ""}" {"hidden" if i else ""}>{body}</section>')
        css = (':root{--ink:#15243A;--primary:#1746B0;--muted:#4C6076;--line:#DCE5EF}*{box-sizing:border-box}html,body{margin:0;height:100%;background:#0B1424;font-family:Inter,Arial,sans-serif;color:var(--ink)}'
               '#stage{position:fixed;inset:0;display:flex;align-items:center;justify-content:center}#canvas{width:1280px;height:720px;background:#fff;position:relative;transform-origin:center;overflow:hidden}'
               '.top{display:flex;align-items:center;gap:14px;height:64px;padding:0 48px;border-bottom:1px solid var(--line)}.top img{height:40px}.top .school{font-weight:700}.top .code{margin-left:auto;color:var(--muted);font-size:14px}'
               'section{position:absolute;inset:64px 0 0 0;padding:56px 72px}section.dark{background:linear-gradient(135deg,#15243A,#1746B0);color:#fff}section.dark .sub{color:#C9D6EA}'
               'h1{font-size:56px;margin:0 0 14px}.sub{font-size:28px;color:var(--muted);margin:0 0 28px;max-width:1050px}'
               '.player{display:flex;gap:22px;align-items:center;background:linear-gradient(135deg,#15243A,#1746B0);color:#fff;border-radius:18px;padding:20px 26px}'
               '.player .big{font-size:22px;padding:16px 22px;border-radius:12px;border:0;background:#fff;color:var(--primary);font-weight:700;cursor:pointer}.player .meta{flex:1}#now{font-size:22px;font-weight:700;margin-bottom:8px}'
               '.bar{height:10px;background:rgba(255,255,255,.25);border-radius:5px;overflow:hidden}.bar i{display:block;height:100%;width:0;background:#8FB4FF}#tm{margin-top:6px;font-size:16px;color:#C9D6EA}'
               '.parts{display:flex;gap:12px;list-style:none;padding:0;margin:22px 0}.parts li{flex:1;border:1px solid var(--line);border-radius:12px;padding:14px 16px;font-size:20px}.parts li.on{border-color:var(--primary);background:#EEF3FA}'
               '.timer{display:inline-flex;gap:16px;align-items:center;background:#EEF3FA;border-radius:16px;padding:18px 24px}.clock{font-size:96px;font-weight:700;font-variant-numeric:tabular-nums;min-width:330px}'
               '.timer button,.note button{font-size:20px;padding:12px 18px;border-radius:10px;border:0;background:var(--primary);color:#fff;cursor:pointer}.timer .reset{background:#fff;color:var(--primary);border:1px solid var(--line)}'
               '.note{font-size:18px;color:var(--muted)}.warn{color:#B45309;font-weight:700;font-size:24px}'
               '.dock{position:fixed;bottom:12px;left:50%;transform:translateX(-50%);display:flex;gap:8px;background:rgba(255,255,255,.95);padding:6px 10px;border-radius:12px;opacity:0;transition:opacity .2s}'
               '.dock:hover,.dock:focus-within{opacity:1}.dock button{font-size:15px;padding:8px 12px;border-radius:8px;border:1px solid var(--line);background:#fff;cursor:pointer;min-height:44px}'
               'button:focus-visible{outline:3px solid #0E7490;outline-offset:3px}')
        js = ('const steps=[...document.querySelectorAll("section.step")];let cur=0;'
              'function show(i){cur=Math.max(0,Math.min(steps.length-1,i));steps.forEach((s,k)=>s.hidden=k!==cur);document.getElementById("pos").textContent=(cur+1)+" / "+steps.length;}'
              'document.getElementById("prev").onclick=()=>show(cur-1);document.getElementById("next").onclick=()=>show(cur+1);'
              'document.getElementById("full").onclick=()=>{if(!document.fullscreenElement)document.documentElement.requestFullscreen();else document.exitFullscreen();};'
              'document.addEventListener("keydown",e=>{if(e.target.tagName==="BUTTON")return;if(e.key==="ArrowRight"||e.key==="PageDown")show(cur+1);if(e.key==="ArrowLeft"||e.key==="PageUp")show(cur-1);'
              'if(e.key==="f"||e.key==="F")document.getElementById("full").click();if((e.key==="p"||e.key==="P")&&rec){rec.paused?rec.play():rec.pause();}});'
              'function fit(){const s=Math.min(innerWidth/1280,innerHeight/720);document.getElementById("canvas").style.transform="scale("+s+")";}addEventListener("resize",fit);fit();'
              'const fmt=t=>Math.floor(t/60)+":"+String(Math.floor(t%60)).padStart(2,"0");'
              f'const starts={json.dumps(starts)};const rec=document.getElementById("rec");'
              'if(rec){const play=document.getElementById("play"),fill=document.getElementById("fill"),tm=document.getElementById("tm"),now=document.getElementById("now"),lis=[...document.querySelectorAll(".parts li")];'
              'let check=null;play.onclick=()=>{if(check){clearTimeout(check);check=null;}rec.currentTime=0;rec.play();play.disabled=true;play.textContent="Playing";};'
              'document.getElementById("check").onclick=()=>{rec.currentTime=starts.length?starts[0]+40:60;rec.play();check=setTimeout(()=>{rec.pause();rec.currentTime=0;check=null;},10000);};'
              'rec.addEventListener("timeupdate",()=>{const d=rec.duration||1;fill.style.width=(100*rec.currentTime/d)+"%";tm.textContent=fmt(rec.currentTime)+" / "+fmt(d);'
              'let p=0;starts.forEach((s,k)=>{if(rec.currentTime>=s)p=k;});lis.forEach((l,k)=>l.classList.toggle("on",k===p&&!rec.paused));if(!check&&!rec.paused)now.textContent="Part "+(p+1)+" playing";});'
              'rec.addEventListener("ended",()=>{now.textContent="Recording finished. Move on to the transfer time.";play.textContent="Finished";});}'
              'document.querySelectorAll(".timer").forEach(t=>{const total=+t.dataset.seconds,clock=t.querySelector(".clock"),warn=t.parentElement.querySelector(".warn");let end=0,raf=0,left=total;'
              'const draw=()=>{clock.textContent=fmt(Math.max(0,left));if(warn)warn.hidden=!(left<=600&&left>0&&total>600);};'
              'const tick=()=>{left=Math.round((end-performance.now())/1000);draw();if(left>0)raf=requestAnimationFrame(tick);else{clock.textContent="Time is up";}};'
              't.querySelector(".go").onclick=()=>{if(raf){cancelAnimationFrame(raf);raf=0;left=Math.round((end-performance.now())/1000);t.querySelector(".go").textContent="Resume";return;}end=performance.now()+left*1000;t.querySelector(".go").textContent="Pause";raf=requestAnimationFrame(tick);};'
              't.querySelector(".reset").onclick=()=>{cancelAnimationFrame(raf);raf=0;left=total;t.querySelector(".go").textContent="Start";draw();};draw();});show(0);')
        page = (f'<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>{E(self.d["title"])}: test control</title><style>{css}</style></head><body>'
                f'<div id="stage"><div id="canvas"><div class="top">' + (f'<img src="{logo}" alt="">' if logo else '') + f'<span class="school">{E(self.school)}</span><span class="code">{E(self.code)} · Practice test</span></div>'
                + ''.join(sec) + f'</div></div>{audio_tag}<nav class="dock" aria-label="Test controls"><button type="button" id="prev">Previous</button><span id="pos" aria-live="polite"></span>'
                f'<button type="button" id="next">Next</button><button type="button" id="full">Full screen (F)</button></nav><script>{js}</script></body></html>')
        (self.out / 'Teacher-private/Mock_Test_Control.html').write_text(page)
        self.files.append({'file': 'Teacher-private/Mock_Test_Control.html', 'audience': 'teacher'})

    def start_guide(self):
        d = self.d
        status = (f'<p><strong>{E(d["status"])}.</strong></p>')
        files = [('Students/Listening_Question_Paper.pdf', 'Listening question paper (one per candidate)'),
                 ('Students/Reading_Question_Paper.pdf', 'Reading question paper (one per candidate)'),
                 ('Students/Writing_Question_Paper.pdf', 'Writing question paper and answer booklet (one per candidate)'),
                 ('Students/Answer_Sheet.pdf', 'Answer sheet for Listening and Reading (one per candidate)'),
                 ('Teacher-private/Administration_Guide.pdf', 'Administration guide: timetable, room set-up, what to say and how to mark'),
                 ('Teacher-private/Mock_Test_Control.html', 'Test control page: plays the Listening recording and runs the timers (project it)'),
                 ('Teacher-private/Answer_Key_and_Transcripts.pdf', 'Answer key with evidence, and Listening transcripts (private)'),
                 ('Teacher-private/Speaking_Examiner_Script.pdf', 'Speaking examiner script and candidate task card'),
                 ('Teacher-private/Writing_and_Speaking_Feedback.pdf', 'Writing and Speaking feedback forms and illustrative models (private)'),
                 ('Teacher-private/Results_Record.pdf', 'Results record: raw scores and notes')]
        lis = ''.join(f'<li><a href="{E(f)}">{E(f.split("/")[-1])}</a>: {E(t)}</li>' for f, t in files)
        css = ('*{box-sizing:border-box}body{margin:0;background:#F5F7FC;color:#15243A;font:16px/1.6 Arial,sans-serif}main{max-width:980px;margin:auto;padding:24px 16px}'
               'h1{font-size:clamp(28px,5vw,44px);line-height:1.15}h2{color:#1746B0}a{color:#1746B0}section{background:#fff;padding:24px;margin:20px 0}small{color:#4C6076}li{margin:8px 0}'
               'a:focus-visible{outline:3px solid #0E7490;outline-offset:3px}html{overflow-wrap:anywhere}')
        audio = ('The Listening recording is in Teacher-private/Audio and plays from the test control page.' if self.audio else
                 '<strong>The Listening recording is not in this pack yet.</strong> Do not read the transcript aloud instead.')
        page = (f'<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>{E(d["title"])} start guide</title><style>{css}</style><main>'
                f'<p>{E(self.school)}<br>Brains Heist IELTS</p><h1>{E(d["title"])}<br>Full Academic practice test</h1>{status}'
                f'<section><h2>What this is</h2><p>A complete paper practice test under real timing: Listening (30 minutes plus 10 minutes to transfer answers), Reading (60 minutes), Writing (60 minutes) and individual Speaking (11–14 minutes). It needs its own session of about 2 hours 45 minutes plus speaking slots; never squeeze it into a lesson.</p>'
                f'<p>{E(d["scoring"]["bands"])}</p></section>'
                f'<section><h2>Files</h2><ol>{lis}</ol><p>{audio}</p></section>'
                f'<section><h2>Needs internet?</h2><p>No. Everything works offline once the folder is extracted. Keep the folder together so the control page finds the recording.</p></section>'
                f'<section><h2>Plan B</h2><p>Projector fails: use a laptop and speakers for the recording and a wall clock for the timers. Audio fails: stop and arrange the Listening section for another day; never read the transcript. Printing fails: postpone; candidates need their own papers.</p></section>'
                f'<small>{E(self.code)} v{E(d["version"])}. Diagnostic Bible {E(d["bibles"]["diagnostic"])}; Lessons Bible {E(d["bibles"]["lessons"])}; Visual &amp; UX Bible {E(d["bibles"]["visual"])}. Practice material; not an official IELTS test.</small></main></html>')
        (self.out / '01-START-HERE.html').write_text(page)
        self.files.append({'file': '01-START-HERE.html', 'audience': 'teacher'})

    # ---------- finish ----------
    def finish(self):
        for f in self.files:
            f['sha256'] = sha256(self.out / f['file'])
        manifest = {'lesson_code': self.code, 'kind': 'mock', 'version': self.d['version'], 'school': self.school, 'status': self.d['status'], 'test_type': self.d['test_type'],
                    'bibles': self.d['bibles'], 'source': str(self.source.relative_to(ROOT)), 'source_sha256': self.source_sha, 'rights': self.d['rights'],
                    'scoring': self.d['scoring'], 'files': self.files, 'release_blockers': self.d['release_blockers']}
        (self.out / 'manifest.json').write_text(json.dumps(manifest, indent=2, ensure_ascii=False))
        code = self.code
        if not self.template:
            zpath = self.out.parent / f"{code}_v{self.d['version']}_private_review_pack.zip"
            with zipfile.ZipFile(zpath, 'w', zipfile.ZIP_DEFLATED) as z:
                for path in sorted(self.out.rglob('*')):
                    if path.is_file():
                        z.write(path, Path(code) / path.relative_to(self.out))
            return zpath
        w = 595.276
        slot = {'names': [{'text': TOKEN, 'x': 42, 'y': 32, 'width': w - 42 - 90, 'size': 9, 'color': 0x15243A, 'bold': True}], 'logos': [[w - 80, 26, w - 42, 66]]}
        branding = {'version': '1.0.0', 'lesson_code': code, 'pdfs': {f'{code}/{rel}': [slot] * n for rel, n in self.pdf_pages.items()}, 'pptx_media': {},
                    'source_archive_sha256': self.source_sha, 'approved_source_sha256': self.source_sha, 'content_revision': self.d['version'],
                    'resources': {'slides': f'{code}/Teacher-private/Mock_Test_Control.html', 'workbook': f'{code}/Students/Answer_Sheet.pdf'}}
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
    ap.add_argument('--template', action='store_true')
    ap.add_argument('--audio', help='Assembled full Listening recording (mp3)')
    ap.add_argument('--audio-record', help='Production record JSON with part_starts, duration_seconds and status')
    args = ap.parse_args()
    check = subprocess.run(['node', str(ROOT / 'scripts/ielts/mock-source-contract.mjs'), args.source], capture_output=True, text=True)
    if check.returncode:
        raise SystemExit('Mock source contract failed; fix the source first.\n' + check.stdout)
    pack = MockPack(args)
    pack.copy_audio()
    pack.listening_paper(); pack.reading_paper(); pack.writing_paper(); pack.answer_sheet()
    pack.key_and_transcripts(); pack.assessment_pack(); pack.speaking_script(); pack.admin_guide(); pack.results_record()
    pack.control_page(); pack.start_guide()
    z = pack.finish()
    print(json.dumps({'output': str(pack.out), 'zip': str(z), 'files': len(pack.files)}))


if __name__ == '__main__':
    main()
