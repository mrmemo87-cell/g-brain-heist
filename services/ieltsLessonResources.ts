import {
  lessonPresentation,
  lessonProduction,
} from "./ieltsLessonPresentation";
import { lessonStages } from "./ieltsLessonPlan";
import { type TeacherLesson, type LessonMaterial } from "./ieltsLessonService";
export type ResourceKind = "plan" | "students" | "keys" | "slides";
export const escapeLessonHtml = (v: unknown) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
const e = escapeLessonHtml;
function questions(m: LessonMaterial, keys = false) {
  return `<h2>${e(m.display_code)}: ${e(m.title)}</h2><p>${e(m.instructions)}</p><ol>${m.questions.map((q) => `<li>${e(q.prompt)}<p>${keys ? e(q.accepted_answers.join(" / ")) : "Answer: __________________________________"}</p></li>`).join("")}</ol>`;
}
function safeLogo(url: string | null) {
  if (!url) return "";
  try {
    const u = new URL(url);
    return u.protocol === "https:"
      ? `<img class="logo" src="${e(u.href)}" alt="School logo">`
      : "";
  } catch {
    return "";
  }
}
export function lessonResourceHtml(lesson: TeacherLesson, kind: ResourceKind) {
  const titles = {
    plan: "Teacher lesson plan",
    students: "Student workbook",
    keys: "Teacher scripts and answer keys",
    slides: "Can you beat the IELTS trap?",
  };
  const header = `${safeLogo(lesson.school.logo_url)}<p>${e(lesson.school.name)}</p><p>Brains Heist IELTS materials · ${e(lesson.lesson_code)} · Version ${e(lesson.version)}</p>`;
  let body = "";
  if (kind === "plan")
    body = `<h1>${titles.plan}</h1><p>60 minutes. Students identify listening traps and complete the real Reading Screener.</p><h2>Preparation</h2><p>Check student access, the published screener duration, devices and audio. Download both recordings, print the workbook and keep teacher keys private. Reading source content stays in the governed platform.</p>${lessonStages.map(([time, title, how]) => `<h2>${e(time)}: ${e(title)}</h2><p>${e(how)}</p>`).join("")}<h2>Adaptations and follow-up</h2><p>Explain instructions with an unrelated example. Record help or replays. Early finishers explain distractors. Use Student progress to inspect submitted screener evidence. Targeted practice requires an eligible source assessment and the normal assignment checks.</p>`;
  if (kind === "students")
    body = `<h1>My IELTS starting point</h1><p>Name: _____________________ Grade: ______ Date: __________</p><p>My reason for joining: __________________________________</p><p>My goal or target, if known: ______________________________</p><p>One difficulty: ________________________________________</p>${lesson.materials.map((m) => questions(m)).join('<div class="break"></div>')}<h2>Reading Screener A</h2><p>Open Brains Heist → IELTS → Reading Screener on your own account. Your online responses and results use the existing saved assessment workflow.</p><h2>Exit ticket</h2><p>One trap I can now spot: _________________________________</p><p>One question I still have: _________________________________</p><h2>Between lessons</h2><p>Review your saved screener result. Follow the teacher-assigned next activity in your IELTS Journey. Write down one answer you want to discuss.</p>`;
  if (kind === "keys")
    body = `<h1>${titles.keys}</h1><p>Teacher only. Keep scripts and keys out of students’ hands before listening.</p>${lesson.materials.map((m) => `${questions(m, true)}<h3>Teaching notes and script</h3><pre>${e(m.teacher_notes || "No version-bound script is available in this pack. Use the approved recording.")}</pre><p>Material version ${e(m.version)}. Content ${e(m.content_sha256)}. Audio ${e(m.audio_sha256)}.</p>`).join('<div class="break"></div>')}<p>Guided listening responses are rehearsal, not independent diagnostic evidence. Different tasks and replay do not prove band improvement.</p>`;
  if (kind === "slides") {
    const slides = lessonPresentation(lesson);
    body =
      `<p class="teacher-warning">Teacher presentation: contains guided-practice answers. Keep private before listening.</p>` +
      slides
        .map(
          (slide, i) =>
            `<section class="slide ${slide.layout}" aria-label="Slide ${i + 1}" ${i ? "hidden" : ""}><p class="school">${e(lesson.school.name)} · Brains Heist IELTS</p><p class="phase">${e(slide.phase)}</p><h1>${e(slide.title)}</h1><p class="slide-body">${e(slide.body)}</p><small>${e(lesson.lesson_code)} · Presentation ${lessonProduction.presentationVersion} · ${i + 1} / ${slides.length}</small><aside hidden>${e(slide.notes)}</aside></section>`,
        )
        .join("") +
      `<nav aria-label="Presentation controls"><button id="prev" type="button">Previous</button><button id="next" type="button">Next</button><button id="motion" type="button" aria-pressed="false">Reduce motion</button><button id="notes" type="button" aria-pressed="false">Teacher notes</button><label>Go to slide <select id="jump">${slides.map((s, i) => `<option value="${i}">${i + 1}: ${e(s.phase)}</option>`).join("")}</select></label></nav><p id="status" role="status" aria-live="polite"></p><script>
    let i=0;const slides=[...document.querySelectorAll('.slide')],prev=document.getElementById('prev'),next=document.getElementById('next'),jump=document.getElementById('jump'),motion=document.getElementById('motion'),notes=document.getElementById('notes');
    const systemReduced=window.matchMedia?window.matchMedia('(prefers-reduced-motion: reduce)').matches:false;
    function reduce(on){document.body.classList.toggle('reduced-motion',on);motion.setAttribute('aria-pressed',String(on));motion.textContent=on?'Motion off':'Reduce motion'}
    function show(n){i=Math.max(0,Math.min(slides.length-1,n));slides.forEach((s,j)=>s.hidden=j!==i);prev.disabled=i===0;next.disabled=i===slides.length-1;jump.value=String(i);document.getElementById('status').textContent='Slide '+(i+1)+' of '+slides.length+'. '+slides[i].querySelector('.phase').textContent}
    prev.onclick=()=>show(i-1);next.onclick=()=>show(i+1);jump.onchange=()=>show(Number(jump.value));motion.onclick=()=>reduce(motion.getAttribute('aria-pressed')!=='true');notes.onclick=()=>{const on=notes.getAttribute('aria-pressed')!=='true';notes.setAttribute('aria-pressed',String(on));slides.forEach(s=>s.querySelector('aside').hidden=!on)};
    document.addEventListener('keydown',event=>{if(event.target instanceof Element && event.target.closest('button,input,select,textarea,a')||event.altKey||event.ctrlKey||event.metaKey)return;if(event.key==='ArrowRight'||event.key===' '){event.preventDefault();show(i+1)}if(event.key==='ArrowLeft'){event.preventDefault();show(i-1)}if(event.key==='Home'){event.preventDefault();show(0)}if(event.key==='End'){event.preventDefault();show(slides.length-1)}});reduce(systemReduced);show(0);
    </script>`;
  }
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${e(titles[kind])}</title><style>body{font:16px/1.6 system-ui,sans-serif;color:#15243A;background:#F5F7FC;margin:0}main{max-width:850px;padding:32px;margin:auto;background:white}h1{font-size:36px;line-height:1.2}h2{color:#1746B0}.logo{max-width:110px;max-height:65px}pre{white-space:pre-wrap;overflow-wrap:anywhere;font:inherit}li{margin:12px 0}.slide{min-height:65vh;padding:clamp(20px,4vw,48px);overflow-wrap:anywhere;animation:enter ${lessonProduction.motionMs}ms ease-out}.slide[hidden]{display:none}.slide h1{font-size:clamp(32px,5vw,64px);white-space:pre-line;margin:32px 0;line-height:1.15}.slide-body{font-size:clamp(22px,2.5vw,30px);white-space:pre-line}.phase{font-size:18px;font-weight:600;letter-spacing:.05em;color:#1746B0}.hero{background:#15243A;color:white}.hero .phase,.hero small{color:#B6CEFF}.reveal h1{color:#1746B0}.school{font-size:18px}.teacher-warning{font-size:14px}aside{margin-top:20px;border-top:1px solid #4C6076;font-size:18px}nav{display:flex;flex-wrap:wrap;gap:12px;margin-top:20px}button,select{min-height:44px;max-width:100%;padding:10px 14px;font:inherit}nav label{min-width:0;display:flex;flex-wrap:wrap;gap:8px;align-items:center}button:focus-visible,select:focus-visible{outline:3px solid #1746B0;outline-offset:3px}small{color:#4C6076}.reduced-motion .slide{animation:none}@keyframes enter{from{opacity:0}to{opacity:1}}@media(prefers-reduced-motion:reduce){.slide{animation:none}}@media print{body,main{background:white}main{padding:0}.break{break-before:page}.slide{display:block!important;break-after:page;height:auto;min-height:0;animation:none;color:#15243A;background:white}.hero .phase,.hero small{color:#1746B0}aside,nav,#status{display:none}@page{size:A4;margin:18mm}}</style><main>${kind === "slides" ? "" : header}${body}</main></html>`;
}
export function downloadLessonFile(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
