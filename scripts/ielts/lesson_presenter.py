"""Classroom presenter for IELTS lesson packs (Lessons Bible LB-04).

One self-contained HTML file that is the only thing on the classroom screen: slides follow the
workbook order and headings, each question set shows in full on one slide (two columns when there is room)
and its answer key appears with a single teacher click (finite 250 ms fade, reduced motion respected,
manual Motion switch), recordings play from the slide with a teacher
controlled player (never automatic), and stage timers count down only when started. Teacher notes
stay hidden unless requested. No automatic advance of any kind.
"""
import base64
import html
from pathlib import Path

E = html.escape


def _px(pt):
    return round(pt * 4 / 3)


CSS = """
:root{--ink:#15243A;--primary:#1746B0;--accent:#2F7DF6;--muted:#4C6076;--line:#DCE5EF;--wash:#EEF3FA;--ok:#0F7B4B;--okbg:#E6F5EE;--paper:#FFFFFF;--warn:#9A5B00}
*{box-sizing:border-box}html,body{margin:0;height:100%;background:#0B1424;overflow:hidden}
body{font-family:"Segoe UI",Arial,Helvetica,sans-serif;color:var(--ink)}
#viewport{position:fixed;inset:0;display:flex;align-items:center;justify-content:center}
#deck{width:1280px;height:720px;position:relative;transform-origin:center center;flex:none}
section.slide{position:absolute;inset:0;background:var(--paper);display:flex;flex-direction:column;padding:0 56px 34px;overflow:hidden;border-radius:6px}
section.slide[hidden]{display:none}
section.slide.dark{background:linear-gradient(135deg,#0F1B2E 0%,#15243A 55%,#1A3A7A 100%);color:#fff}
.motion section.slide.enter{animation:enter .25s ease-out}@keyframes enter{from{opacity:0}to{opacity:1}}
.top{height:66px;display:flex;align-items:center;gap:14px;border-bottom:1px solid var(--line);margin:0 -56px 14px;padding:0 56px;flex:none}
.dark .top{border-color:rgba(255,255,255,.14)}
.top img{height:40px;width:auto;border-radius:4px;background:#fff;padding:2px}
.school{font-size:15px;font-weight:600;color:var(--muted)}.dark .school{color:#C9D6EA}
.chip{margin-left:auto;font-size:14px;font-weight:600;padding:6px 12px;border-radius:999px;background:var(--wash);color:var(--primary)}
.dark .chip{background:rgba(255,255,255,.1);color:#DCE7FA}
.code{font-size:13px;color:var(--muted)}.dark .code{color:#AFC2E0}
.reveal-tag{font-size:13px;font-weight:700;color:#fff;background:var(--ok);padding:5px 10px;border-radius:6px}
h1{font-size:40px;line-height:1.15;margin:4px 0 16px;letter-spacing:-.01em;flex:none}
.content{flex:1;min-height:0;display:flex;gap:28px}
.col{flex:1;min-width:0;overflow:auto;padding-right:6px}
.col.narrow{flex:0 0 46%}
.instr{color:var(--muted);margin:0 0 14px;line-height:1.4}.dark .instr{color:#C9D6EA}
.lead{line-height:1.4;margin:0 0 16px}
.kicker{font-size:20px;font-weight:700;color:#8FB4FF;text-transform:uppercase;letter-spacing:.08em;margin:0 0 12px}
.step{transition:none}.motion .step{transition:opacity .25s ease-out,transform .25s ease-out}
.step:not(.on){opacity:0;transform:translateY(8px)}
.card{background:#fff;border:1px solid var(--line);border-radius:14px;padding:14px 18px;margin:0 0 12px;box-shadow:0 1px 2px rgba(21,36,58,.06);display:flex;gap:14px;align-items:flex-start}
.dark .card{background:rgba(255,255,255,.07);border-color:rgba(255,255,255,.16);box-shadow:none}
.num{flex:none;min-width:40px;height:40px;border-radius:20px;background:var(--primary);color:#fff;font-weight:700;display:flex;align-items:center;justify-content:center;font-size:20px;padding:0 10px}
.card .txt{flex:1;line-height:1.38}
.items2{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:0 28px;align-items:start}.items2 .card{margin:0 0 12px}
.cards1 .card{margin:0 0 12px}.reveal-all{margin-top:4px}
.opts{list-style:none;margin:8px 0 0;padding:0;display:grid;gap:6px}
.opts li{display:flex;gap:10px;align-items:baseline}
.let{flex:none;font-weight:700;color:var(--primary);min-width:26px}
.gap{display:inline-block;min-width:120px;border-bottom:2px solid var(--ink);margin:0 4px}
.panel{background:var(--wash);border-radius:14px;padding:14px 18px;margin:0 0 14px}
.panel h3{margin:0 0 8px;font-size:18px;color:var(--primary);text-transform:uppercase;letter-spacing:.04em}
.panel .grid{display:grid;grid-template-columns:1fr 1fr;gap:6px 22px}.panel .list div{margin:0 0 8px;display:flex;gap:6px;line-height:1.3}
.passage{background:#FBFCFE;border:1px solid var(--line);border-radius:14px;padding:16px 20px;font-size:18px;line-height:1.5}
.passage h3{margin:0 0 10px;font-size:22px}
.passage p{margin:0 0 10px}.passage .pl{font-weight:700;color:var(--primary);margin-right:8px}
.answer .ans{display:inline-block;background:var(--okbg);color:var(--ok);font-weight:800;border-radius:8px;padding:2px 12px}
.answer .q{color:var(--muted)}.answer .ev{font-style:italic;margin-top:6px}.answer .why{margin-top:6px;color:var(--muted)}
.dark .answer .q,.dark .answer .why{color:#C9D6EA}
.example .txt{font-size:1.02em}.discussion b{color:var(--primary)}
.task{font-size:1.06em;line-height:1.45}.conditions{color:var(--muted);margin-top:12px;font-size:.8em}
.model p{margin:0 0 12px;line-height:1.45}.small{font-size:16px;color:var(--muted)}
.goal{display:flex;gap:14px;align-items:flex-start;margin:0 0 14px;line-height:1.35}
.goal:before{content:"";flex:none;width:12px;height:12px;border-radius:3px;background:var(--accent);margin-top:.45em}
.stagehead{display:flex;align-items:center;gap:16px;margin:6px 0 6px}
.stepbadge{font-size:16px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#8FB4FF}
.slide:not(.dark) .stepbadge{color:var(--primary)}
.wbl{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}.wbl span{font-size:16px;padding:6px 12px;border-radius:999px;background:rgba(255,255,255,.12)}
.slide:not(.dark) .wbl span{background:var(--wash);color:var(--primary)}
.figure{flex:0 0 52%;display:flex;align-items:flex-start;justify-content:center}.figure img{max-width:100%;max-height:520px;border-radius:10px;border:1px solid var(--line);background:#fff}
.player{display:flex;align-items:center;gap:18px;background:linear-gradient(135deg,#15243A,#1746B0);color:#fff;border-radius:16px;padding:16px 22px;margin:0 0 16px;flex:none}
.player button.play{width:64px;height:64px;border-radius:50%;border:0;background:#fff;color:var(--primary);font-size:26px;cursor:pointer;flex:none;display:flex;align-items:center;justify-content:center}
.player .meta{flex:1;min-width:0}.player .name{font-weight:700;font-size:20px}.player .st{font-size:13px;color:#C9D6EA}
.bar{height:10px;border-radius:5px;background:rgba(255,255,255,.25);margin-top:10px;position:relative;cursor:pointer}
.bar i{position:absolute;left:0;top:0;bottom:0;border-radius:5px;background:#8FB4FF;width:0}
.player .tm{font-variant-numeric:tabular-nums;font-size:18px;min-width:120px;text-align:right}
.player.none{background:var(--wash);color:var(--muted)}.player.compact{padding:8px 16px;margin-bottom:10px}.player.compact button.play{width:46px;height:46px;font-size:20px}.player.compact .st{display:none}
.timer{display:inline-flex;align-items:center;gap:10px;background:rgba(255,255,255,.1);border-radius:14px;padding:10px 14px;margin-top:18px}
.slide:not(.dark) .timer{background:var(--wash)}
.timer .clock{font-size:34px;font-weight:800;font-variant-numeric:tabular-nums;min-width:110px}
.timer .clock.done{color:#FFB347}
.timer button,.dock button,.dock select{min-height:44px;min-width:44px;border-radius:10px;border:1px solid rgba(21,36,58,.15);background:#fff;color:var(--ink);font:inherit;font-size:15px;padding:6px 12px;cursor:pointer}
.foot{position:absolute;left:0;right:0;bottom:0;height:6px;background:var(--wash)}.dark .foot{background:rgba(255,255,255,.1)}
.foot i{display:block;height:100%;background:var(--accent)}
.pos{position:absolute;right:56px;bottom:12px;font-size:13px;color:var(--muted)}.dark .pos{color:#AFC2E0}
.notes{position:fixed;left:16px;right:16px;bottom:76px;max-height:40vh;overflow:auto;background:#FFF8E6;color:#3B2A00;border:2px solid #E3B341;border-radius:12px;padding:14px 18px;font-size:16px;line-height:1.5;z-index:5}
.dock{position:fixed;left:50%;transform:translateX(-50%);bottom:12px;display:flex;flex-wrap:wrap;gap:8px;align-items:center;background:rgba(255,255,255,.97);border-radius:14px;padding:6px 10px;opacity:0;transition:opacity .2s;z-index:6;max-width:calc(100vw - 24px);box-shadow:0 6px 24px rgba(0,0,0,.25)}
#hot{position:fixed;left:0;right:0;bottom:0;height:90px;z-index:5}#hot:hover+.dock,.dock.show{opacity:1}
.dock:hover,.dock:focus-within{opacity:1}.dock select{max-width:260px}.dock label{display:flex;align-items:center;gap:6px;font-size:14px}
#status{font-size:14px;padding:0 6px}
button:focus-visible,select:focus-visible,input:focus-visible,.bar:focus-visible{outline:3px solid #0E7490;outline-offset:3px}
@media print{html,body{overflow:visible;background:#fff}#viewport{position:static;display:block}#deck{transform:none!important;width:auto;height:auto}
section.slide{position:relative;display:flex!important;width:1280px;height:720px;break-after:page}.dock,.notes{display:none}.step{opacity:1!important;transform:none!important}}
"""

JS = r"""
const deck=document.getElementById('deck'),slides=[...deck.querySelectorAll('section.slide')],sel=document.getElementById('select'),status=document.getElementById('status'),motion=document.getElementById('motion'),notes=document.getElementById('notes');
const reduce=matchMedia('(prefers-reduced-motion: reduce)');let index=0;
motion.checked=!reduce.matches;function applyMotion(){document.body.classList.toggle('motion',motion.checked)}motion.onchange=applyMotion;applyMotion();
function fit(){const s=Math.min(innerWidth/1280,innerHeight/720);deck.style.transform='scale('+s+')'}addEventListener('resize',fit);fit();
function steps(sl){return [...sl.querySelectorAll('.step')]}
const audios={};document.querySelectorAll('audio[data-rec]').forEach(a=>audios[a.dataset.rec]=a);
function stopMedia(sl,nextSl){const keep=new Set([...(nextSl?nextSl.querySelectorAll('.player[data-rec]'):[])].map(p=>p.dataset.rec));[...sl.querySelectorAll('.player[data-rec]')].forEach(p=>{if(!keep.has(p.dataset.rec))audios[p.dataset.rec].pause()})}
// Safety net: if a slide's text would not fit (fonts differ between computers), shrink it a little, never below 16 pt.
function fitText(sl){sl.querySelectorAll('.col:not(.narrow)').forEach(c=>{let fs=parseFloat(getComputedStyle(c).fontSize);const was=fs;while(c.scrollHeight>c.clientHeight+1&&fs>21.5){fs-=1;c.style.fontSize=fs+'px';sl.dataset.shrunk=was+'>'+fs}});
 sl.querySelectorAll('.col.narrow').forEach(c=>{const pn=c.querySelector('.panel');if(!pn)return;let fs=parseFloat(getComputedStyle(pn).fontSize);while(c.scrollHeight>c.clientHeight+1&&fs>18.5){fs-=1;pn.style.fontSize=fs+'px'}})}
function show(n,allSteps){const prev=slides[index];const target=Math.max(0,Math.min(slides.length-1,n));if(prev)stopMedia(prev,slides[target]);index=target;
 slides.forEach((s,i)=>{s.hidden=i!==index;s.classList.remove('enter')});const cur=slides[index];
 steps(cur).forEach(e=>e.classList.toggle('on',!!allSteps));if(motion.checked)cur.classList.add('enter');fitText(cur);
 sel.value=index;status.textContent='Slide '+(index+1)+' of '+slides.length;notes.textContent=cur.dataset.notes||'';
 document.getElementById('previous').disabled=index===0;document.getElementById('next').disabled=index===slides.length-1&&!steps(cur).some(e=>!e.classList.contains('on'))}
function next(){const hidden=steps(slides[index]).filter(e=>!e.classList.contains('on'));if(hidden.length){hidden[0].classList.add('on');show2();return}if(index<slides.length-1)show(index+1,false)}
function show2(){document.getElementById('next').disabled=index===slides.length-1&&!steps(slides[index]).some(e=>!e.classList.contains('on'))}
function prev(){if(index>0)show(index-1,true)}
document.getElementById('previous').onclick=prev;document.getElementById('next').onclick=next;sel.onchange=()=>show(Number(sel.value),true);
document.getElementById('full').onclick=()=>{if(document.fullscreenElement)document.exitFullscreen();else document.documentElement.requestFullscreen&&document.documentElement.requestFullscreen()};
document.getElementById('notesbtn').onclick=()=>{notes.hidden=!notes.hidden};
deck.addEventListener('click',e=>{if(e.target.closest('button,a,input,select,.bar,audio'))return;next()});
function fmt(t){if(!isFinite(t))return'0:00';t=Math.max(0,Math.round(t));return Math.floor(t/60)+':'+String(t%60).padStart(2,'0')}
document.querySelectorAll('.player[data-has]').forEach(p=>{const a=audios[p.dataset.rec],b=p.querySelector('button.play'),bar=p.querySelector('.bar'),fill=bar.querySelector('i'),tm=p.querySelector('.tm');
 const upd=()=>{fill.style.width=(a.duration?100*a.currentTime/a.duration:0)+'%';tm.textContent=fmt(a.currentTime)+' / '+fmt(a.duration);b.textContent=a.paused?'▶':'❚❚';b.setAttribute('aria-label',a.paused?'Play recording':'Pause recording');bar.setAttribute('aria-valuenow',Math.round(a.currentTime))};
 ['timeupdate','loadedmetadata','play','pause','ended'].forEach(ev=>a.addEventListener(ev,upd));
 b.onclick=()=>{if(a.paused)a.play();else a.pause()};
 bar.onclick=e=>{if(!a.duration)return;const r=bar.getBoundingClientRect();a.currentTime=a.duration*Math.min(1,Math.max(0,(e.clientX-r.left)/r.width))};
 bar.onkeydown=e=>{if(e.key==='ArrowLeft'){a.currentTime=Math.max(0,a.currentTime-5);e.preventDefault();e.stopPropagation()}if(e.key==='ArrowRight'){a.currentTime=Math.min(a.duration||0,a.currentTime+5);e.preventDefault();e.stopPropagation()}};upd()});
document.querySelectorAll('.timer').forEach(t=>{const total=Number(t.dataset.seconds),c=t.querySelector('.clock'),go=t.querySelector('.go'),rs=t.querySelector('.reset');let left=total,end=0,run=false;
 const draw=()=>{c.textContent=fmt(left);c.classList.toggle('done',left<=0)};
 const tick=()=>{if(!run)return;left=Math.max(0,(end-Date.now())/1000);draw();if(left<=0){run=false;go.textContent='Start';return}requestAnimationFrame(tick)};
 go.onclick=()=>{if(run){run=false;go.textContent='Start'}else{if(left<=0)left=total;end=Date.now()+left*1000;run=true;go.textContent='Pause';requestAnimationFrame(tick)}};
 rs.onclick=()=>{run=false;left=total;go.textContent='Start';draw()};draw()});
document.addEventListener('keydown',e=>{if(e.target.closest('button,input,select,textarea,summary,a,[contenteditable],.bar'))return;let k=e.key;
 if(k==='ArrowRight'||k===' '||k==='PageDown'){next()}else if(k==='ArrowLeft'||k==='PageUp'){prev()}else if(k==='Home'){show(0,true)}else if(k==='End'){show(slides.length-1,true)}
 else if(k==='n'||k==='N'){notes.hidden=!notes.hidden}else if(k==='f'||k==='F'){document.getElementById('full').click()}
 else if(k==='p'||k==='P'){const b=slides[index].querySelector('.player[data-has] button.play');if(b)b.click()}else{return}e.preventDefault()});
document.querySelectorAll('img.slogo').forEach(i=>{const hide=()=>{if(i.naturalWidth<4){i.style.display='none';const w=i.closest('.slogo-wrap');if(w)w.style.display='none'}};if(i.complete)hide();else i.addEventListener('load',hide)});
show(0,false);
"""


def _logo_uri(path):
    if not path:
        return None
    mime = 'image/png' if path.suffix.lower() == '.png' else 'image/jpeg' if path.suffix.lower() in ('.jpg', '.jpeg') else 'image/webp'
    return f"data:{mime};base64,{base64.b64encode(path.read_bytes()).decode()}"


def _text(s):
    return E(s).replace('\n', '<br>')


def _item_html(m, step):
    prompt = E(m['prompt'])
    if m.get('gap') and '____' not in m['prompt']:
        prompt = prompt.replace('_______', '<span class="gap"></span>')
    opts = ''
    if m.get('options'):
        lis = []
        for o in m['options']:
            letter, _, rest = o.strip().partition('  ')
            lis.append(f'<li><span class="let">{E(letter)}</span><span>{E(rest.strip() or letter)}</span></li>')
        opts = f'<ul class="opts">{"".join(lis)}</ul>'
    return f'<div class="card{step}"><span class="num">{E(m["num"])}</span><div class="txt">{prompt}{opts}</div></div>'


def _element(m, text, step):
    t = m.get('t', 'text')
    if t == 'instr':
        return f'<p class="instr">{_text(text)}</p>'
    if t == 'options':
        lis = []
        for o in m['options']:
            letter, _, rest = o.strip().partition('  ')
            if not rest:
                letter, _, rest = o.strip().partition(' ')
            lis.append(f'<div><span class="let">{E(letter)}</span>{E(rest.strip())}</div>')
        return f'<div class="panel"><h3>{E(m["title"])}</h3><div class="grid">{"".join(lis)}</div></div>'
    if t == 'item':
        return _item_html(m, step)
    if t == 'answer':
        # Number, answer and proof only; the explanation is in the speaker notes so the key stays easy to scan.
        return (f'<div class="card answer{step}"><span class="num">{E(m["num"])}</span><div class="txt">'
                f'<span class="ans">{E(m["answer"])}</span><div class="ev">{E(m["evidence"])}</div></div></div>')
    if t == 'example':
        return f'<div class="card example{step}"><span class="num">{E(m["num"])}</span><div class="txt">{_text(m["text"])}</div></div>'
    if t == 'discussion':
        return f'<div class="card discussion{step}"><span class="num">{E(m["num"])}</span><div class="txt"><b>{E(m["label"])}</b><br>{_text(m["text"])}</div></div>'
    if t == 'goal':
        return f'<div class="goal{step}">{_text(text)}</div>'
    if t == 'card':
        return f'<div class="card{step}"><div class="txt">{_text(text)}</div></div>'
    if t == 'task':
        return f'<div class="task">{_text(text)}</div>'
    if t == 'conditions':
        return f'<div class="conditions">{_text(text)}</div>'
    if t == 'model':
        return f'<div class="model"><p>{_text(text)}</p></div>'
    if t == 'small':
        return f'<p class="small">{_text(text)}</p>'
    if t == 'kicker':
        return f'<p class="kicker">{_text(text)}</p>'
    if t in ('lead', 'time'):
        return f'<p class="lead">{_text(text)}</p>'
    return f'<p class="lead">{_text(text)}</p>'


def _player(audio):
    if not audio.get('src'):
        return (f'<div class="player none"><div class="meta"><div class="name">Recording {E(audio["id"])}</div>'
                f'<div class="st">Not included in this pack ({E(audio["status"])}). Do not read the transcript instead.</div></div></div>')
    part = f' · questions {audio["part"]} of {audio["parts"]} (keeps playing as you move on)' if audio.get('parts', 1) > 1 else ''
    return (f'<div class="player" data-has="1" data-rec="{E(audio["id"])}"><button type="button" class="play" aria-label="Play recording">\u25B6</button>'
            f'<div class="meta"><div class="name">Recording {E(audio["id"])}{E(part)}</div>'
            f'<div class="bar" tabindex="0" role="slider" aria-label="Recording position" aria-valuemin="0" aria-valuenow="0"><i></i></div></div>'
            f'<div class="tm">0:00 / 0:00</div></div>')


def _timer(minutes):
    if not minutes:
        return ''
    return (f'<div class="timer" data-seconds="{int(minutes) * 60}"><span class="clock">{int(minutes)}:00</span>'
            f'<button type="button" class="go">Start</button><button type="button" class="reset">Reset</button></div>')


def render(pack, body_size):
    d, slides, n = pack.d, pack.slides, pack.n
    logo = '../assets/school-logo.png' if getattr(pack, 'template', False) else _logo_uri(pack.logo)
    total = len(slides)
    parts = []
    for i, s in enumerate(slides):
        meta = s.get('meta') or [{'t': 'text'} for _ in s['body']]
        dark = s.get('dark')
        kind = s.get('kind')
        build = s.get('build')
        side = s.get('passage') or s.get('image') or s.get('panel')
        width = 4.9 if side else 12.1
        if s.get('size'):
            size = round(_px(s['size']))  # question sets and answer keys are sized by the builder to fit one slide
        else:
            size = round(_px(max(body_size('\n\n'.join(s['body']), width), 18)) * (0.7 if s.get('audio') and side else 0.8 if s.get('audio') else 0.86 if s.get('reveal') else 1))
        top = (f'<div class="top">' + (f'<img class="slogo" src="{logo}" alt="">' if logo else '') + f'<span class="school">{E(pack.school)}</span>'
               + (f'<span class="chip">Workbook · {E(s["workbook"])}</span>' if s.get('workbook') else '<span class="chip">Brains Heist IELTS</span>')
               + (' <span class="reveal-tag">Answer reveal</span>' if s.get('reveal') else '')
               + f'<span class="code">{E(pack.code)} · {i + 1}/{total}</span></div>')
        els = []
        for j, (txt, m) in enumerate(zip(s['body'], meta)):
            step = ' step' if build and m.get('t') not in ('instr', 'options') else ''
            els.append(_element(m, txt, step))
        cards = [j for j, m in enumerate(meta) if m.get('t') in ('item', 'answer', 'example', 'discussion')]
        if cards:
            # The whole set shows at once: two text columns when the slide has no side panel. On a reveal slide one
            # click shows every answer together.
            first = cards[0]
            if s.get('cols') == 2 and len(cards) >= 2:
                k = s.get('split', (len(cards) + 1) // 2)
                group = (f'<div class="items2"><div>{"".join(els[j] for j in cards[:k])}</div>'
                         f'<div>{"".join(els[j] for j in cards[k:])}</div></div>')
            else:
                group = f'<div class="cards1">{"".join(els[j] for j in cards)}</div>'
            if s.get('reveal_all'):
                group = f'<div class="step reveal-all">{group}</div>'
            els = els[:first] + [group] + [e for j, e in enumerate(els) if j > first and j not in cards]
        inner = ''.join(els)
        if kind == 'cover':
            main = (f'<div class="col" style="font-size:{_px(26)}px">{inner}</div>'
                    + (f'<div style="flex:0 0 260px;display:flex;align-items:center;justify-content:center"><span class="slogo-wrap" style="background:#fff;border-radius:22px;padding:18px;display:inline-flex"><img class="slogo" src="{logo}" alt="{E(pack.school)} logo" style="max-width:200px;max-height:240px"></span></div>' if logo else ''))
        elif kind == 'stage':
            wbl = ''.join(f'<span>{E(w)}</span>' for w in s.get('workbook_list', []))
            main = (f'<div class="col" style="font-size:{_px(26)}px"><div class="stagehead"><span class="stepbadge">{E(s.get("step", ""))}</span></div>'
                    f'{_element(meta[0], s["body"][0], "")}<p class="instr">{E(s["body"][1])}</p>'
                    + (f'<div class="wbl">{"In your workbook: " if not wbl else ""}{wbl}</div>' if wbl else '') + _timer(s.get('timer')) + '</div>')
        elif s.get('passage'):
            ps = s['passage']
            paras = ''.join(f'<p>' + (f'<span class="pl">{chr(65 + k)}</span>' if ps['labelled'] else '') + f'{E(x)}</p>' for k, x in enumerate(ps['paragraphs']))
            main = (f'<div class="col narrow"><div class="passage"><h3>{E(ps["title"])}</h3>{paras}</div></div>'
                    f'<div class="col" style="font-size:{size}px">{inner}</div>')
        elif s.get('panel'):
            pn = s['panel']
            lis = []
            for o in pn['options']:
                letter, _, rest = o.strip().partition('  ')
                if not rest:
                    letter, _, rest = o.strip().partition(' ')
                lis.append(f'<div><span class="let">{E(letter)}</span>{E(rest.strip())}</div>')
            main = (f'<div class="col narrow" style="flex-basis:40%"><div class="panel" style="font-size:{min(26, max(18, size - 2))}px"><h3>{E(pn["title"])}</h3><div class="list">{"".join(lis)}</div></div></div>'
                    f'<div class="col" style="font-size:{size}px">{inner}</div>')
        elif s.get('image'):
            main = (f'<div class="figure"><img src="../{E(s["image"])}" alt="{E(s.get("alt", ""))}"></div>'
                    f'<div class="col" style="font-size:{size}px">{inner}{_timer(s.get("timer"))}</div>')
        else:
            main = f'<div class="col" style="font-size:{size}px">{(_player(s["audio"]) if s.get("audio") else "")}{inner}{_timer(s.get("timer"))}</div>'
        if s.get('audio') and (s.get('passage') or s.get('image') or s.get('panel')):
            main = f'<div style="display:flex;flex-direction:column;flex:1;min-width:0">{_player(s["audio"]).replace('class="player"', 'class="player compact"', 1)}<div class="content">{main}</div></div>'
        progress = f'<div class="foot"><i style="width:{100 * (i + 1) / total:.2f}%"></i></div>'
        parts.append(f'<section class="slide{" dark" if dark else ""}" data-slide="{i}"{" hidden" if i else ""} aria-roledescription="slide" '
                     f'aria-label="Slide {i + 1} of {total}" data-notes="{E(s["notes"])}">{top}<h1>{E(s["title"])}</h1>'
                     f'<div class="content">{main}</div>{progress}</section>')
    recs = {}
    for s in slides:
        a = s.get('audio')
        if a and a.get('src'):
            recs[a['id']] = a['src']
    audio_tags = ''.join(f'<audio preload="metadata" data-rec="{E(k)}" src="{E(v)}"></audio>' for k, v in recs.items())
    options = ''.join(f'<option value="{i}">{i + 1}. {E(s["title"])}</option>' for i, s in enumerate(slides))
    dock = ('<nav class="dock" aria-label="Presenter controls"><button id="previous" type="button" aria-label="Previous">◀</button>'
            '<button id="next" type="button" aria-label="Next">▶</button><label for="select" class="visually">Slide</label>'
            f'<select id="select">{options}</select><button id="full" type="button">Full screen</button><button id="notesbtn" type="button">Teacher notes</button>'
            '<label><input id="motion" type="checkbox">Motion</label><span id="status" aria-live="polite"></span></nav>')
    return (f'<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
            f'<title>Lesson {n} classroom presentation</title><style>{CSS}</style><div id="viewport"><main id="deck">{"".join(parts)}</main></div>'
            f'{audio_tags}<aside id="notes" class="notes" hidden aria-label="Teacher notes"></aside><div id="hot"></div>{dock}<script>{JS}</script></html>')
