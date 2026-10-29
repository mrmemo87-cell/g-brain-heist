"""Editable PowerPoint decks for IELTS lesson packs (Lessons Bible LB-04, LB-05).

Two decks from the same slide sequence as the HTML presenter:
- animated: one click-triggered 250 ms fade that shows a whole answer key (questions show in full), click-advanced
  fade transitions, recordings embedded as audio on the listening slide (teacher clicks to play);
- motion-free: identical content and audio, no builds and no transitions.
Nothing advances or plays automatically.
"""
import re
import zipfile
from pathlib import Path

from pptx import Presentation
from pptx.dml.color import RGBColor
from pptx.enum.shapes import MSO_SHAPE
from pptx.enum.text import MSO_ANCHOR
from pptx.oxml.ns import qn
from pptx.util import Emu, Inches, Pt
from lxml import etree

INK, PRIMARY, MUTED, LINE, WASH, OK = '#15243A', '#1746B0', '#4C6076', '#DCE5EF', '#EEF3FA', '#0F7B4B'
P_NS = 'http://schemas.openxmlformats.org/presentationml/2006/main'


def rgb(h):
    return RGBColor.from_string(h.lstrip('#'))


def poster(path, rec_id, ok):
    """A large play card used as the clickable audio object."""
    from PIL import Image, ImageDraw, ImageFont
    W, H = 1600, 260
    im = Image.new('RGB', (W, H), (21, 36, 58))
    d = ImageDraw.Draw(im)
    for x in range(W):
        t = x / W
        d.line([(x, 0), (x, H)], fill=(int(21 + (23 - 21) * t), int(36 + (70 - 36) * t), int(58 + (176 - 58) * t)))
    d.ellipse((50, 50, 210, 210), fill=(255, 255, 255))
    d.polygon([(110, 85), (110, 175), (185, 130)], fill=(23, 70, 176))
    bold = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 58)
    reg = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 34)
    d.text((260, 62), f'Recording {rec_id}', font=bold, fill=(255, 255, 255))
    d.text((260, 150), 'Click to play or pause' if ok else 'Play the recording file (see below)', font=reg, fill=(201, 214, 234))
    im.save(path)


def _textbox(slide, x, y, w, h, wrap=True):
    tb = slide.shapes.add_textbox(x, y, w, h)
    tf = tb.text_frame
    tf.word_wrap = wrap
    return tb, tf


def _run(par, text, size, color, bold=False, italic=False):
    r = par.add_run()
    r.text = text
    f = r.font
    f.size = Pt(size); f.color.rgb = rgb(color); f.bold = bold; f.italic = italic; f.name = 'Arial'
    return r


def _element_paragraphs(tf, m, text, size, fg, first):
    """Write one body element; returns how many paragraphs it used."""
    t = m.get('t', 'text')
    pars = []

    def newpar():
        p = tf.paragraphs[0] if (first and not pars) else tf.add_paragraph()
        p.space_after = Pt(4)
        pars.append(p)
        return p
    if t == 'item':
        p = newpar(); _run(p, f"{m['num']}   ", size, PRIMARY, bold=True); _run(p, m['prompt'], size, fg)
        for o in m.get('options') or []:
            letter, _, rest = o.strip().partition('  ')
            p = newpar(); p.level = 1; _run(p, f'      {letter}  ', size - 2, PRIMARY, bold=True); _run(p, rest.strip() or letter, size - 2, fg)
        pars[-1].space_after = Pt(10)
    elif t == 'answer':
        # Number, answer and proof only; the explanation is in the speaker notes.
        p = newpar(); _run(p, f"{m['num']}   ", size, PRIMARY, bold=True); _run(p, m['answer'], size, OK, bold=True)
        p = newpar(); _run(p, m['evidence'], size - 3, fg, italic=True); p.space_after = Pt(12)
    elif t in ('example', 'discussion'):
        p = newpar(); _run(p, f"{m['num']}   ", size, PRIMARY if fg == INK else '#8FB4FF', bold=True)
        if t == 'discussion':
            _run(p, m['label'] + ': ', size, fg, bold=True)
        _run(p, m['text'], size, fg); p.space_after = Pt(12)
    elif t == 'instr':
        for line in text.split('\n'):
            p = newpar(); _run(p, line, size - 3, MUTED if fg == INK else '#C9D6EA')
        pars[-1].space_after = Pt(10)
    elif t == 'goal':
        p = newpar(); _run(p, '■  ', size - 6, '#2F7DF6'); _run(p, text, size, fg); p.space_after = Pt(10)
    elif t in ('small', 'conditions', 'time'):
        p = newpar(); _run(p, text, max(14, size - 6), MUTED if fg == INK else '#C9D6EA')
    elif t == 'kicker':
        p = newpar(); _run(p, text.upper(), 18, '#8FB4FF', bold=True)
    else:
        for line in text.split('\n'):
            p = newpar(); _run(p, line, size, fg)
        pars[-1].space_after = Pt(10)
    return len(pars)


def _fade_build_xml(spid, start_id):
    """One click-triggered 250 ms fade that shows the whole shape (an answer key appears all at once)."""
    cid = start_id
    seq = []
    for _ in (0,):
        a, b, c, e = cid, cid + 1, cid + 2, cid + 3
        cid += 4
        tgt = f'<p:tgtEl><p:spTgt spid="{spid}"/></p:tgtEl>'
        seq.append(
            f'<p:par><p:cTn id="{a}" fill="hold"><p:stCondLst><p:cond delay="indefinite"/></p:stCondLst><p:childTnLst>'
            f'<p:par><p:cTn id="{b}" fill="hold"><p:stCondLst><p:cond delay="0"/></p:stCondLst><p:childTnLst>'
            f'<p:par><p:cTn id="{c}" presetID="10" presetClass="entr" presetSubtype="0" fill="hold" grpId="0" nodeType="clickEffect">'
            f'<p:stCondLst><p:cond delay="0"/></p:stCondLst><p:childTnLst>'
            f'<p:set><p:cBhvr><p:cTn id="{e}" dur="1" fill="hold"><p:stCondLst><p:cond delay="0"/></p:stCondLst></p:cTn>{tgt}'
            f'<p:attrNameLst><p:attrName>style.visibility</p:attrName></p:attrNameLst></p:cBhvr><p:to><p:strVal val="visible"/></p:to></p:set>'
            f'<p:animEffect transition="in" filter="fade"><p:cBhvr><p:cTn id="{cid}" dur="250"/>{tgt}</p:cBhvr></p:animEffect>'
            f'</p:childTnLst></p:cTn></p:par></p:childTnLst></p:cTn></p:par></p:childTnLst></p:cTn></p:par>')
        cid += 1
    return ''.join(seq), cid


def _set_timing(slide, spid, reveal, media_spid=None):
    """Replace the slide timing with a single click reveal (and keep any embedded media node)."""
    sld = slide._element
    old = sld.find(qn('p:timing'))
    if old is not None:
        sld.remove(old)
    media = ''
    next_id = 3
    if media_spid is not None:
        mspid, span = media_spid
        media = (f'<p:audio><p:cMediaNode vol="80000" numSld="{span}"><p:cTn id="{next_id}" fill="hold" display="0"><p:stCondLst><p:cond delay="indefinite"/></p:stCondLst></p:cTn>'
                 f'<p:tgtEl><p:spTgt spid="{mspid}"/></p:tgtEl></p:cMediaNode></p:audio>')
        next_id += 1
    builds, _ = _fade_build_xml(spid, next_id) if reveal else ('', next_id)
    main = (f'<p:seq concurrent="1" nextAc="seek"><p:cTn id="2" dur="indefinite" nodeType="mainSeq"><p:childTnLst>{builds}</p:childTnLst></p:cTn>'
            f'<p:prevCondLst><p:cond evt="onPrev" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:prevCondLst>'
            f'<p:nextCondLst><p:cond evt="onNext" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:nextCondLst></p:seq>') if builds else ''
    if not main and not media:
        return
    bld = ''
    xml = (f'<p:timing xmlns:p="{P_NS}"><p:tnLst><p:par><p:cTn id="1" dur="indefinite" restart="never" nodeType="tmRoot"><p:childTnLst>'
           f'{main}{media}</p:childTnLst></p:cTn></p:par></p:tnLst>{bld}</p:timing>')
    sld.append(etree.fromstring(xml))


def _add_transition(slide):
    sld = slide._element
    trans = etree.fromstring(f'<p:transition xmlns:p="{P_NS}" spd="med"><p:fade/></p:transition>')
    timing = sld.find(qn('p:timing'))
    if timing is not None:
        timing.addprevious(trans)
    else:
        ext = sld.find(qn('p:extLst'))
        if ext is not None:
            ext.addprevious(trans)
        else:
            sld.append(trans)


def build(pack, body_size, animated, dest):
    prs = Presentation()
    prs.slide_width, prs.slide_height = Inches(13.333), Inches(7.5)
    blank = prs.slide_layouts[6]
    total = len(pack.slides)
    media_shapes = []
    for i, s in enumerate(pack.slides):
        sl = prs.slides.add_slide(blank)
        dark = s.get('dark')
        bg = sl.background.fill; bg.solid(); bg.fore_color.rgb = rgb(INK if dark else '#FFFFFF')
        fg = '#FFFFFF' if dark else INK
        # header
        x0 = Inches(0.55)
        if pack.logo:
            back = sl.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(0.45), Inches(0.1), Inches(0.62), Inches(0.62))
            back.fill.solid(); back.fill.fore_color.rgb = rgb('#FFFFFF'); back.line.fill.background()
            pic = sl.shapes.add_picture(str(pack.logo), Inches(0.5), Inches(0.14), height=Inches(0.54))
            back.width = pic.width + Inches(0.1)
            x0 = Inches(0.5) + pic.width + Inches(0.2)
            if s.get('kind') == 'cover':
                card = sl.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(10.3), Inches(2.2), Inches(2.5), Inches(2.8))
                card.fill.solid(); card.fill.fore_color.rgb = rgb('#FFFFFF'); card.line.fill.background()
                big = sl.shapes.add_picture(str(pack.logo), Inches(10.5), Inches(2.4), height=Inches(2.4))
                big.left = int(card.left + (card.width - big.width) / 2)
        _, tf = _textbox(sl, x0, Inches(0.18), Inches(5.5), Inches(0.45))
        _run(tf.paragraphs[0], pack.school, 13, '#C9D6EA' if dark else MUTED, bold=True)
        chip_text = f"Workbook · {s['workbook']}" if s.get('workbook') else 'Brains Heist IELTS'
        chip = sl.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(6.3), Inches(0.2), Inches(4.6), Inches(0.42))
        chip.fill.solid(); chip.fill.fore_color.rgb = rgb('#24395C' if dark else WASH); chip.line.fill.background()
        ctf = chip.text_frame; ctf.margin_top = ctf.margin_bottom = 0; ctf.vertical_anchor = MSO_ANCHOR.MIDDLE
        _run(ctf.paragraphs[0], chip_text[:70], 12, '#DCE7FA' if dark else PRIMARY, bold=True)
        _, tf = _textbox(sl, Inches(11.0), Inches(0.22), Inches(2.0), Inches(0.4))
        _run(tf.paragraphs[0], f"{pack.code} · {i + 1}/{total}", 11, '#AFC2E0' if dark else MUTED)
        line = sl.shapes.add_connector(1, Inches(0.5), Inches(0.78), Inches(12.83), Inches(0.78)); line.line.color.rgb = rgb('#2B3E5E' if dark else LINE)
        if s.get('reveal'):
            tag = sl.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(11.3), Inches(6.85), Inches(1.6), Inches(0.38))
            tag.fill.solid(); tag.fill.fore_color.rgb = rgb(OK); tag.line.fill.background()
            _run(tag.text_frame.paragraphs[0], 'Answer reveal', 12, '#FFFFFF', bold=True)
        # title
        _, tf = _textbox(sl, Inches(0.55), Inches(0.9), Inches(12.2), Inches(0.9))
        _run(tf.paragraphs[0], s['title'], 34 if len(s['title']) < 50 else 28, fg, bold=True)
        # progress bar
        track = sl.shapes.add_shape(MSO_SHAPE.RECTANGLE, 0, prs.slide_height - Emu(60000), prs.slide_width, Emu(60000))
        track.fill.solid(); track.fill.fore_color.rgb = rgb('#24395C' if dark else WASH); track.line.fill.background()
        done = sl.shapes.add_shape(MSO_SHAPE.RECTANGLE, 0, prs.slide_height - Emu(60000), int(prs.slide_width * (i + 1) / total), Emu(60000))
        done.fill.solid(); done.fill.fore_color.rgb = rgb('#2F7DF6'); done.line.fill.background()
        # side panels
        top = Inches(1.85)
        left, width = Inches(0.55), Inches(12.2)
        side = s.get('panel') or s.get('passage') or s.get('image')
        if s.get('image'):
            sl.shapes.add_picture(str(pack.out / s['image']), Inches(0.5), top, width=Inches(6.6))
            left, width = Inches(7.4), Inches(5.4)
        elif s.get('panel') or s.get('passage'):
            box = sl.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(0.5), top, Inches(5.0), Inches(5.3))
            box.fill.solid(); box.fill.fore_color.rgb = rgb(WASH); box.line.fill.background(); box.adjustments[0] = 0.05
            btf = box.text_frame; btf.word_wrap = True; btf.vertical_anchor = MSO_ANCHOR.TOP
            btf.margin_left = btf.margin_right = Inches(0.2); btf.margin_top = Inches(0.15)
            if s.get('panel'):
                pn = s['panel']
                _run(btf.paragraphs[0], pn['title'].upper(), 13, PRIMARY, bold=True)
                chars = sum(len(o) for o in pn['options'])
                osize = 18 if len(pn['options']) <= 8 and chars <= 260 else 15 if len(pn['options']) <= 12 and chars <= 480 else 13
                for o in pn['options']:
                    letter, _, rest = o.strip().partition('  ')
                    if not rest:
                        letter, _, rest = o.strip().partition(' ')
                    p = btf.add_paragraph(); p.space_after = Pt(3)
                    _run(p, letter + '  ', osize, PRIMARY, bold=True); _run(p, rest.strip(), osize, INK)
            else:
                ps = s['passage']
                _run(btf.paragraphs[0], ps['title'], 18, INK, bold=True)
                if sum(len(x) for x in ps['paragraphs']) <= 650:
                    # A short text (a model paragraph, a source note) fits on the slide, so show it in full.
                    for x in ps['paragraphs']:
                        p = btf.add_paragraph(); _run(p, x, 15, INK); p.space_before = Pt(6)
                    ps = None
                p = btf.add_paragraph() if ps else None
                if ps: _run(p, f"Reading passage: paragraphs {'A–' + chr(64 + len(ps['paragraphs'])) if ps['labelled'] else '1–' + str(len(ps['paragraphs']))}. "
                        'Learners read it in the workbook; the HTML presentation shows the full passage on screen.', 15, MUTED)
            left, width = Inches(5.75), Inches(7.05)
        audio = s.get('audio')
        if audio and audio.get('src') and any((x.get('audio') or {}).get('id') == audio['id'] for x in pack.slides[:i]) and (pack.slides[i - 1].get('audio') or {}).get('id') == audio['id']:
            # Continuation slide: the recording started on the first question slide keeps playing across slides.
            _, ntf = _textbox(sl, left, top, width, Inches(0.4))
            _run(ntf.paragraphs[0], f"Recording {audio['id']} continues from the previous slide.", 14, MUTED, italic=True)
            top = top + Inches(0.45)
            audio = None
        if audio:
            pw = min(width, Inches(6.4))  # a compact player leaves room for the whole question set
            ok = bool(audio.get('src')) and animated  # the motion-free deck links to the audio file instead of embedding a second copy
            pimg = pack.out / 'assets' / f"player-{audio['id']}{'' if animated else '-file'}.png"
            poster(pimg, audio['id'], ok)
            if ok:
                mp3 = pack.out / 'Teacher-private' / audio['src']
                mv = sl.shapes.add_movie(str(mp3), left, top, pw, int(pw * 260 / 1600), poster_frame_image=str(pimg), mime_type='audio/mpeg')
                span = 1
                while i + span < total and (pack.slides[i + span].get('audio') or {}).get('id') == audio['id']:
                    span += 1
                media_shapes.append((i, mv.shape_id))
                sid = (mv.shape_id, span)
            else:
                sl.shapes.add_picture(str(pimg), left, top, width=pw)
                sid = None
                if audio.get('src'):
                    _, ntf = _textbox(sl, left, top + int(pw * 260 / 1600), width, Inches(0.35))
                    _run(ntf.paragraphs[0], f"Play Teacher-private/{audio['src']} or use the animated deck / HTML presentation, which play it on this slide.", 12, MUTED, italic=True)
                    top = top + Inches(0.35)
            top = top + int(pw * 260 / 1600) + Inches(0.15)
        else:
            sid = None
        if s.get('size'):
            size = s['size'] + (0 if audio else 2)  # sized for the HTML layout, whose line spacing is looser
        else:
            size = max(body_size('\n\n'.join(s['body']), 5.4 if side else 12.1), 18)
            if audio:
                size = max(16, size - 2)
        if s.get('kind') == 'cover' and pack.logo:
            width = Inches(9.4)
        meta = s.get('meta') or [{'t': 'text'} for _ in s['body']]
        pairs = list(zip(s['body'], meta))
        if s.get('cols'):
            # Instructions sit above the whole question set; the set itself flows down two text columns.
            head = [(t, m) for t, m in pairs if m.get('t') == 'instr']
            pairs = [(t, m) for t, m in pairs if m.get('t') != 'instr']
            if head:
                lines = sum(max(1, -(-len(t) // max(8, int(width / 914400 * 72 / ((size - 3) * 0.52))))) for t, _ in head)
                hh = Emu(int(Inches(1) * (lines * (size - 3) * 1.25 / 72 + 0.12)))
                _, htf = _textbox(sl, left, top, width, hh)
                for j, (t, m) in enumerate(head):
                    _element_paragraphs(htf, m, t, size, fg, j == 0)
                top = top + hh + Inches(0.08)
        height = prs.slide_height - top - Inches(0.35)
        if s.get('cols') == 2 and len(pairs) > 1:
            # Two columns with the same break as the HTML presentation; a question never splits across columns.
            # The columns sit in one group, so a single click reveals a whole answer key.
            k = s.get('split', (len(pairs) + 1) // 2)
            gap = Inches(0.3)
            col_w = int((width - gap) / 2)
            grp = sl.shapes.add_group_shape()
            boxes = []
            for c, chunk in enumerate((pairs[:k], pairs[k:])):
                tb = grp.shapes.add_textbox(left + c * (col_w + gap), top, col_w, height)
                tf = tb.text_frame; tf.word_wrap = True
                for j, (txt, m) in enumerate(chunk):
                    _element_paragraphs(tf, m, txt, size, fg, j == 0)
                boxes.append(tf)
            target_id = grp.shape_id
        else:
            tb, tf = _textbox(sl, left, top, width, height)
            for j, (txt, m) in enumerate(pairs):
                _element_paragraphs(tf, m, txt, size, fg, j == 0)
            boxes = [tf]
            target_id = tb.shape_id
        reveal_group = bool(s.get('reveal_all'))
        sl.notes_slide.notes_text_frame.text = s['notes']
        if animated:
            if reveal_group or sid is not None:
                _set_timing(sl, target_id, reveal_group, sid)
            _add_transition(sl)
        elif sid is not None:
            _set_timing(sl, target_id, False, sid)
    prs.save(dest)
    _audio_not_video(dest)
    return total


def _audio_not_video(path):
    """python-pptx embeds media as video; mark MP3s as audio so PowerPoint shows its audio controls."""
    tmp = Path(str(path) + '.tmp')
    with zipfile.ZipFile(path) as zin, zipfile.ZipFile(tmp, 'w', zipfile.ZIP_DEFLATED) as zout:
        for item in zin.infolist():
            data = zin.read(item.filename)
            if re.fullmatch(r'ppt/slides/slide\d+\.xml', item.filename) and b'videoFile' in data:
                data = data.replace(b'<a:videoFile ', b'<a:audioFile ')
                data = re.sub(rb'<p:video>(.*?)</p:video>', rb'<p:audio>\1</p:audio>', data, flags=re.S)
            if re.fullmatch(r'ppt/slides/_rels/slide\d+\.xml\.rels', item.filename) and b'.mp3' in data:
                data = re.sub(rb'relationships/video"( Target="\.\./media/[^"]+\.mp3")', rb'relationships/audio"\1', data)
            zout.writestr(item, data)
    tmp.replace(path)
