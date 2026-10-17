#!/usr/bin/env python3
"""Validate a built private IELTS lesson pack (output of build-lesson-pack.py).

Checks student/teacher separation, withheld fresh-check isolation, slide parity between PPTX,
HTML and slides.json, absence of automatic advance/autoplay, manifest hashes and source hash.
It cannot confer academic or human approval.
"""
import hashlib, json, re, sys, zipfile
from pathlib import Path
from pypdf import PdfReader

ROOT = Path(__file__).resolve().parents[2]


def text_of(pdf):
    return re.sub(r'\s+', ' ', ' '.join(page.extract_text() or '' for page in PdfReader(str(pdf)).pages)).lower()


def norm(s):
    return re.sub(r'\s+', ' ', s.replace('’', "'").replace('‘', "'")).lower().strip()


def main(out):
    out = Path(out)
    errors = []
    m = json.loads((out / 'manifest.json').read_text())
    src = ROOT / m['source']
    d = json.loads(src.read_text())
    if hashlib.sha256(src.read_bytes()).hexdigest() != m['source_sha256']:
        errors.append('manifest source hash does not match the current lesson.json')
    for f in m['files']:
        if hashlib.sha256((out / f['file']).read_bytes()).hexdigest() != f['sha256']:
            errors.append(f"hash mismatch: {f['file']}")

    student = ' '.join(text_of(p) for p in (out / 'Students').glob('*.pdf'))
    teacher_keys = text_of(out / 'Teacher-private/Teacher_Keys_Scripts_Models.pdf')
    fresh = text_of(out / 'Teacher-private/Fresh_Check_WITHHELD.pdf')
    non_fresh = student + ' ' + teacher_keys + ' ' + text_of(out / 'Teacher-private/Teacher_Guide.pdf') + ' ' + (out / 'Teacher-private/slides.json').read_text().lower()

    def present(fragment, haystack):
        frag = norm(fragment)[:60]
        return frag and frag in haystack

    for b in d['blocks']:
        st = b.get('stimulus') or {}
        if st.get('type') in ('transcript', 'teacher_script'):
            for line in st['paragraphs']:
                if present(line, student):
                    errors.append(f"student PDF contains script line from {b['id']}: {line[:40]}")
        for it in b.get('items', []):
            if st.get('type') == 'transcript' and present(it['evidence'], student):
                errors.append(f"student PDF contains listening evidence for {it['id']}")
            if present(it['reason'], student):
                errors.append(f"student PDF contains key explanation for {it['id']}")
            if not present(it['reason'], teacher_keys):
                errors.append(f"teacher key missing explanation for {it['id']}")
        if b['kind'] == 'writing' and present(b['model'], student):
            errors.append(f"student PDF contains model for {b['id']}")
        if b['kind'] == 'contrast':
            for ex in b['examples']:
                if present(ex['comment'], student):
                    errors.append(f"student PDF contains teaching comment in {b['id']}")
    for b in d['followup']['blocks']:
        texts = [i['prompt'] for i in b.get('items', [])] + b.get('prompts', []) + ([b['prompt']] if b.get('prompt') else []) + (b.get('stimulus') or {}).get('paragraphs', [])
        for t in texts:
            if present(t, non_fresh):
                errors.append(f"withheld fresh-check text appears outside the withheld file: {t[:40]}")
            if not present(t, fresh):
                errors.append(f"fresh-check text missing from withheld file: {t[:40]}")

    slides = json.loads((out / 'Teacher-private/slides.json').read_text())
    pptx = next((out / 'Teacher-private').glob('*.pptx'))
    with zipfile.ZipFile(pptx) as z:
        slide_xml = [n for n in z.namelist() if re.fullmatch(r'ppt/slides/slide\d+\.xml', n)]
        if len(slide_xml) != len(slides):
            errors.append(f'PPTX has {len(slide_xml)} slides, slides.json has {len(slides)}')
        for n in slide_xml:
            x = z.read(n).decode()
            if 'advTm' in x or '<p:timing' in x:
                errors.append(f'{n}: automatic advance or animation timing present')
        notes = [n for n in z.namelist() if re.fullmatch(r'ppt/notesSlides/notesSlide\d+\.xml', n)]
        if len(notes) != len(slides):
            errors.append('every slide needs speaker notes')
    html_text = next((out / 'Teacher-private').glob('*_Slides.html')).read_text()
    if html_text.count('class="slide') != len(slides):
        errors.append('HTML slide count differs from slides.json')
    if re.search(r'autoplay|setInterval|setTimeout\(\s*show', html_text):
        errors.append('HTML presentation contains automatic playback or advance')
    for s in slides:
        if norm(s['title'])[:40] not in norm(html_text):
            errors.append(f"HTML missing slide: {s['title']}")

    # Every item's reveal comes after its question slide.
    for b in d['blocks']:
        if b['kind'] != 'items':
            continue
        q = next((i for i, s in enumerate(slides) if s['title'].startswith(b['title']) and not s.get('reveal')), None)
        a = next((i for i, s in enumerate(slides) if s['title'].startswith(f"{b['title']}: answers")), None)
        if q is None or a is None or a < q:
            errors.append(f"{b['id']}: question slide must precede its reveal slide")

    if any(p.suffix == '.pdf' and 'Teacher' in p.name for p in (out / 'Students').iterdir()):
        errors.append('teacher file in Students folder')
    start = (out / '01-START-HERE.html').read_text()
    for f in m['files']:
        if f['file'].startswith(('Students/', 'Teacher-private/')) and f['file'].endswith(('.pdf', '.pptx', '.html')) and f['file'] not in start:
            errors.append(f"start guide does not link {f['file']}")

    print(json.dumps({'pack': str(out), 'lesson': d['code'], 'slides': len(slides), 'errors': errors}, indent=2))
    return 1 if errors else 0


if __name__ == '__main__':
    sys.exit(max(main(p) for p in sys.argv[1:]))
