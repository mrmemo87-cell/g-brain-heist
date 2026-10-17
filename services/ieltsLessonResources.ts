import { smartLessonPrint } from "./ieltsSmartPrint";
import { lessonOneTitle } from "./ieltsCourseCatalog";
import {
  lessonPresentation,
  lessonProduction,
} from "./ieltsLessonPresentation";
import {
  lessonFiles,
  lessonGuideVersion,
  lessonPreparation,
  lessonSteps,
  lessonPlanBSteps,
} from "./ieltsLessonPlan";
import { type TeacherLesson, type LessonMaterial } from "./ieltsLessonService";
export type ResourceKind =
  | "start"
  | "plan"
  | "students"
  | "keys"
  | "slides"
  | "backup"
  | "reading-paper"
  | "reading-paper-keys";
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
      ? `<img class="logo pack-logo" src="${e(u.href)}" alt="School logo">`
      : "";
  } catch {
    return "";
  }
}
export function lessonResourceHtml(lesson: TeacherLesson, kind: ResourceKind) {
  const titles = {
    start: "Lesson 1: start here",
    backup: "Plan B: paper Reading practice",
    "reading-paper": "Plan B: student Reading sheet",
    "reading-paper-keys": "Plan B: private Reading key",
    plan: "Teacher lesson plan",
    students: "Student workbook",
    keys: "Teacher scripts and answer keys",
    slides: lessonOneTitle,
  };
  const header = `<header><h1>${e(lessonOneTitle)}</h1>${safeLogo(lesson.school.logo_url)}<p>${e(lesson.school.name)}</p><p>Brains Heist IELTS materials · ${e(lesson.lesson_code)} · ${kind === "start" || kind === "plan" ? `Teacher guide ${lessonGuideVersion}` : `Version ${e(lesson.version)}`}</p></header>`;
  let body = "";
  if (kind === "plan" || kind === "start") body = teacherGuide(lesson, kind);
  if (kind === "backup") body = planBGuide(lesson);
  if (kind === "reading-paper" || kind === "reading-paper-keys")
    body = readingPaper(lesson, kind === "reading-paper-keys");
  if (kind === "students")
    body = `<h1>My IELTS starting point</h1><p>Name: _____________________ Grade: ______ Date: __________</p><p>My reason for joining: __________________________________</p><p>My goal or target, if known: ______________________________</p><p>One difficulty: ________________________________________</p>${lesson.materials.map((m) => questions(m)).join('<div class="break"></div>')}<h2>Next: online Reading Screener</h2><p>This section gives directions only. The reading passages and questions are in Brains Heist, not in this workbook. After both listening rounds, wait for your teacher, then open <a href="https://www.brainsheist.com/ielts/reading-screener">Reading Screener</a> in your own account. Work independently and follow the instructions on screen. Reading uses no lesson audio. Check the saved submitted/result state after finishing.</p><h2>Exit ticket</h2><p>One trap I can now spot: _________________________________</p><p>One question I still have: _________________________________</p><h2>Between lessons</h2><p>Review your saved screener result. Follow the teacher-assigned next activity in your IELTS Journey. Write down one answer you want to discuss.</p>`;
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
  const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${e(titles[kind])}</title><style>body{font:16px/1.6 system-ui,sans-serif;color:#15243A;background:#F5F7FC;margin:0}main{max-width:850px;padding:clamp(16px,4vw,32px);margin:auto;background:white;overflow-wrap:anywhere}a{color:#1746B0}a:focus-visible{outline:3px solid #1746B0;outline-offset:3px}table{border-collapse:collapse;width:100%;table-layout:fixed}th,td{text-align:left;padding:10px;border:1px solid #CED6E2;vertical-align:top;overflow-wrap:anywhere}.guide-step{margin:28px 0;break-inside:avoid}.guide-check{border-left:4px solid #1746B0;padding-left:12px}.guide-route{background:#F5F7FC;padding:16px}.guide-step h2{font-size:24px}.reading-sheet{font-size:15px;line-height:1.45}.reading-sheet li{margin:10px 0;break-inside:avoid}.reading-sheet li p{margin:5px 0}h1{font-size:36px;line-height:1.2}h2{color:#1746B0}.logo{max-width:110px;max-height:65px}pre{white-space:pre-wrap;overflow-wrap:anywhere;font:inherit}li{margin:12px 0}.slide{min-height:65vh;padding:clamp(20px,4vw,48px);overflow-wrap:anywhere;animation:enter ${lessonProduction.motionMs}ms ease-out}.slide[hidden]{display:none}.slide h1{font-size:clamp(32px,5vw,64px);white-space:pre-line;margin:32px 0;line-height:1.15}.slide-body{font-size:clamp(22px,2.5vw,30px);white-space:pre-line}.phase{font-size:18px;font-weight:600;letter-spacing:.05em;color:#1746B0}.hero{background:#F5F8FC;color:#15243A}.hero .phase,.hero small{color:#1746B0}.reveal h1{color:#1746B0}.school{font-size:18px}.teacher-warning{font-size:14px}aside{margin-top:20px;border-top:1px solid #4C6076;font-size:18px}nav{display:flex;flex-wrap:wrap;gap:12px;margin-top:20px}button,select{min-height:44px;max-width:100%;padding:10px 14px;font:inherit}nav label{min-width:0;display:flex;flex-wrap:wrap;gap:8px;align-items:center}button:focus-visible,select:focus-visible{outline:3px solid #1746B0;outline-offset:3px}small{color:#4C6076}.reduced-motion .slide{animation:none}@keyframes enter{from{opacity:0}to{opacity:1}}@media(prefers-reduced-motion:reduce){.slide{animation:none}}@media print{body,main{background:white}main{padding:0}.break{break-before:page}.slide{display:block!important;break-after:page;height:auto;min-height:0;animation:none;color:#15243A;background:white}.hero .phase,.hero small{color:#1746B0}aside,nav,#status{display:none}@page{size:A4;margin:18mm}}</style><main>${kind === "slides" ? "" : header}${body}</main></html>`;
  return kind === "slides" ? html : smartLessonPrint(html, `${lesson.lesson_code} · ${lessonOneTitle} · ${titles[kind]}`);
}
function teacherGuide(lesson: TeacherLesson, kind: "start" | "plan") {
  const link = (file: string, label = file) =>
    `<a href="${e(file)}" target="_blank" rel="noopener">${e(label)}</a>`;
  return `<h1>${kind === "start" ? "Lesson 1: start here" : "Teacher lesson plan"}</h1><p>Teacher guide ${lessonGuideVersion} · 60-minute outline · ${e(lesson.school.name)}</p>
  <div class="guide-route"><h2>Today's route</h2><p><strong>1. Guided Listening:</strong> L-003, then L-004. Play them from ${link(lessonFiles.audio)}. That HTML file is a player for the same L-003.mp3 and L-004.mp3 in this folder. Choose the player or a normal MP3 player; do not play both.</p><p><strong>2. Independent Reading:</strong> students open the real <a href="https://www.brainsheist.com/ielts/reading-screener" target="_blank" rel="noopener">Reading Screener in Brains Heist</a> on their own accounts. The online screener passages and questions stay in Brains Heist. The separate Plan B paper task is guided practice. Reading uses no lesson audio.</p><p><strong>The Listening Screener is a separate assessment.</strong> Do not use its recordings for today's L-003/L-004 practice. It belongs in a separately planned screener session.</p></div>
  <h2>Which file do I open?</h2><p>These links work after extracting the complete ZIP into one folder. If you downloaded only this guide, download and extract the complete teaching pack first.</p><table><thead><tr><th scope="col">Open / give</th><th scope="col">Purpose and who uses it</th></tr></thead><tbody>
  <tr><td>${link(lessonFiles.start)}</td><td>Teacher starts here. This file and the teacher plan contain the same ordered steps.</td></tr>
  <tr><td>${link(lessonFiles.plan)}</td><td>Teacher's printable running order. Keep on your private screen.</td></tr>
  <tr><td>${link(lessonFiles.powerpoint)}<br>${link(lessonFiles.staticPowerpoint)}<br>${link(lessonFiles.slides)}</td><td>Choose ONE presentation. Project it and advance manually. Contains teacher answer reveals. HTML Teacher notes are for your private screen, not the projector. These files do not play the lesson audio.</td></tr>
  <tr><td>${link(lessonFiles.audio)}<br>${link("L-003.mp3")}<br>${link("L-004.mp3")}</td><td>Teacher plays Round 1 / L-003, then Round 2 / L-004. The HTML player and MP3 files use the same recordings.</td></tr>
  <tr><td>${link(lessonFiles.students)}</td><td>Print one student workbook per learner. Six questions per listening round, goals and exit ticket. Reading directions only.</td></tr>
  <tr><td>${link(lessonFiles.keys)}</td><td>Teacher only: matching L-003/L-004 answers and scripts. Never project or distribute before practice.</td></tr>
  </tbody></table>
  <h2>Plan B: prepare before class</h2><p>${link(lessonFiles.backup, "Open the Plan B teacher guide")} if Reading access or internet fails. ${lesson.reading_backup ? `${link(lessonFiles.readingPaper, "Print the R-001 student Reading sheet")} for each learner before class. Keep ${link(lessonFiles.readingPaperKeys, "the separate R-001 teacher key")} private.` : "The approved paper Reading task is unavailable in this pack. The Plan B guide explains a quiet practice fallback and arranging the screener later."} This paper task is practice and does not submit or score the online screener.</p>
  <h2>Before students arrive</h2><ol>${lessonPreparation.map((p) => `<li>${e(p)}</li>`).join("")}</ol>
  <h2>Follow these steps in order</h2>${lessonSteps.map((step, i) => `<section class="guide-step" id="step-${i + 1}"><h2>Step ${i + 1} · ${e(step.time)} · ${e(step.title)}</h2><p><strong>Open:</strong> ${e(step.open)}</p><ol>${step.actions.map((a) => `<li>${e(a)}</li>`).join("")}</ol><p><strong>Say:</strong> “${e(step.say)}”</p><p class="guide-check"><strong>Before moving on:</strong> ${e(step.check)}</p></section>`).join("")}
  <h2>If something goes wrong</h2><ul><li><strong>Audio will not play:</strong> check that the whole folder is extracted and both MP3s sit beside Audio-player.html. Open the matching MP3 directly if needed. If the approved recording remains unavailable, postpone that round. Do not replace it with screener audio.</li><li><strong>Reading access, devices or time unavailable:</strong> open IELTS-01-plan-b.html and use the approved R-001 paper practice sheet if included, then arrange a full online screener session with the required access and duration. Label the paper work as practice; do not mark the screener complete.</li><li><strong>Reading save/submission error:</strong> follow the platform's retry/recovery steps. Record the issue and unfinished state; preserve the existing attempt. A result must be confirmed before treating the work as submitted.</li><li><strong>Running late:</strong> shorten guided discussion or move Reading to its own full session before starting it. Never cut a required screener duration or rush an active assessment to fit the outline.</li></ul>
  <h2>After class</h2><p>Collect paper reflections. Use Student progress for confirmed Reading work and existing assignment checks for follow-up. Paper listening answers are practice and do not automatically enter saved assessment records. This lesson establishes no IELTS band or measured improvement.</p>`;
}
function planBGuide(lesson: TeacherLesson) {
  const available = !!lesson.reading_backup;
  return `<h1>Plan B: paper Reading practice</h1><p><strong>Use this when the online Reading Screener cannot start because access, internet, devices or the full time block are unavailable.</strong> Continue the lesson with clearly labeled paper practice. The online screener remains a separate session.</p><h2>First decide what failed</h2><ol><li><strong>Before an attempt starts:</strong> check each learner's own account and connection; use the normal availability/retry option once. If it still cannot open, move to Plan B. Never share accounts.</li><li><strong>Internet fails after an attempt starts:</strong> keep the existing screener page/attempt. Follow the platform's save/recovery messages and record the interruption. Do not reset, clear browser data, promise the timer has paused, or start a replacement attempt. Resolve the interrupted attempt through the normal teacher/exam recovery workflow before beginning guided Reading or discussing its key. Until then, use quiet exit reflections. Resume only when the normal platform rules allow, and record any help/practice received during the interruption; otherwise arrange follow-up.</li><li><strong>Only some learners are affected:</strong> give those learners the paper task quietly. Other students continue their independent screener. Do not play recordings or discuss answer keys while anyone is still being assessed.</li></ol>
  ${available ? `<h2>Open and print</h2><p>Teacher: <a href="${lessonFiles.readingPaperKeys}">R-001 teacher key</a> stays private. Students: <a href="${lessonFiles.readingPaper}">R-001 Reading sheet</a>, printed before class. Each sheet contains the approved passage, six questions and space for answers/evidence. No internet or audio is needed once printed. Blank the projector.</p><p><strong>Task:</strong> ${e(lesson.reading_backup!.display_code)} · ${e(lesson.reading_backup!.title)} · guided practice. This is a separate approved practice task, not a printed copy of Reading Screener A.</p>${lessonPlanBSteps.map(([time, title, action], i) => `<section class="guide-step"><h2>Step B${i + 1} · ${e(time)} · ${e(title)}</h2><p>${e(action)}</p></section>`).join("")}` : `<h2>Paper Reading task unavailable</h2><p>Do not invent or copy a replacement screener. Use the completed L-003/L-004 workbook: 35–40 minutes, select two uncertain answers; 40–50 minutes, write the detail supporting each corrected answer; 50–55 minutes, write one strategy to try next. Use the normal 55–60 minute exit. Keep this quiet if other learners are still being assessed. Arrange Reading separately.</p>`}
  <h2>What gets recorded?</h2><p>Collect names, date, responses and any support as <strong>paper guided practice</strong>. Keep a record of which learners used R-001 and any help given when planning their next assessment. There is no automatic scan/import or online screener completion in this pack. Do not enter a band, claim independent improvement, or treat the paper answers as a submitted online attempt.</p><p>After class, resolve access and arrange a full online screener session. Students with an existing saved completed result use their result; students with interrupted work follow normal recovery. <a href="${lessonFiles.start}">Back to the main teacher guide</a>.</p>`;
}
function readingPaper(lesson: TeacherLesson, keys: boolean) {
  const r = lesson.reading_backup;
  if (!r)
    throw new Error(
      "The approved paper Reading task is unavailable. Reopen the pack or use its Plan B guide.",
    );
  return `<div class="reading-sheet"><h1>${keys ? "Teacher only: R-001 paper Reading key" : "Plan B: paper Reading practice"}</h1><p>${e(r.display_code)} · ${e(r.title)} · version ${e(r.version)}</p><p><strong>Guided practice. This is not Reading Screener A and does not submit an online result.</strong></p>${keys ? "<p>Keep this file private. Reveal answers only after learners commit their own responses.</p>" : "<p>Name: _________________________ Class: __________ Date: __________</p>"}<h2>Instructions</h2><p>${e(r.instructions)}</p><h2>Passage</h2><div class="reading-passage">${r.passage
    .split(/\n\n+/)
    .map((p) => `<p>${e(p)}</p>`)
    .join(
      "",
    )}</div><div class="break"></div>${keys ? "" : "<p>Name: _________________________ Class: __________ Date: __________</p>"}<h2>${keys ? "Accepted answers and teacher notes" : "Questions and your evidence"}</h2><ol>${r.questions.map((q) => `<li>${e(q.prompt)}<p>${keys ? `Accepted answer: ${e(q.accepted_answers.join(" / "))}` : "Answer: ____________________<br>Evidence from the passage / information missing: ______________________________________________<br>_______________________________________________________________"}</p></li>`).join("")}</ol>${keys ? `<h2>Approved teacher notes</h2><pre>${e(r.teacher_notes || "Use the approved accepted answers and the passage. Do not invent missing information.")}</pre><p>Content hash: ${e(r.content_sha256)}.</p>` : "<p>One strategy I used: ___________________________________________________</p>"}<p>Teacher records paper work as guided practice, with any help given. Brains Heist does not automatically save these paper responses.</p></div>`;
}
export function lessonStartText() {
  return `LESSON 1 — TEACHER GUIDE ${lessonGuideVersion}
Open ${lessonFiles.start} first after extracting the complete ZIP.
LISTENING: Audio-player.html plays L-003.mp3 (Round 1), then L-004.mp3 (Round 2). They are the same recordings as the separate MP3 files. Do not use Listening Screener audio for these practice rounds.
READING PLAN A: students use https://www.brainsheist.com/ielts/reading-screener in their own accounts. The workbook contains Reading directions only. No lesson audio is used for Reading.
PLAN B: open IELTS-01-plan-b.html. If included, print IELTS-01-reading-paper.html before class and keep IELTS-01-reading-paper-keys.html private. This is R-001 guided Reading practice, not the online screener.
Choose one presentation. Print the student workbook. Keep scripts/keys private. Follow the guide's numbered steps, slide numbers, teacher cues and checkpoints.
If Reading access/time is unavailable, arrange a separate full session. Never shorten its published duration, substitute another passage or mark unfinished work complete.
Paper listening answers are guided practice, not automatically saved assessment evidence.
`;
}
export function lessonAudioPlayerHtml(lesson: TeacherLesson) {
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Lesson 1: guided Listening audio</title><style>body{font:18px/1.6 system-ui,sans-serif;color:#15243A;margin:auto;max-width:850px;padding:24px;overflow-wrap:anywhere}h1{font-size:32px}h2,a{color:#1746B0}audio{width:100%;min-height:44px}section{margin:32px 0}a:focus-visible{outline:3px solid #1746B0;outline-offset:3px}</style><main><p>${e(lesson.school.name)} · Brains Heist IELTS</p><h1>Lesson 1: guided Listening audio</h1><p>This page plays the same two MP3s included in your teaching folder. Use L-003 first, then L-004. These are practice recordings, not the Listening Screener. Reading is online and needs no lesson audio.</p><p><a href="${lessonFiles.start}">Back to the step-by-step teacher guide</a></p>${lesson.materials.map((m) => `<section><h2>${m.display_code === "L-003" ? "Round 1" : "Round 2"} · ${e(m.display_code)} · ${e(m.title)}</h2><p>Workbook section: ${e(m.display_code)}. Show slide ${m.display_code === "L-003" ? "3" : "17"}, read all six questions and keep that slide visible until the recording finishes. Reveal answers afterwards.</p><audio aria-label="Play ${e(m.display_code)} guided listening" data-code="${e(m.display_code)}" controls preload="none" src="${e(m.display_code)}.mp3"></audio><p>If needed, open <a href="${e(m.display_code)}.mp3">${e(m.display_code)}.mp3</a> in your normal audio player. Do not play both players together.</p></section>`).join("")}<p id="audio-status" role="status" aria-live="polite">Ready. Choose Round 1 / L-003 when the class is prepared.</p></main><script>const tracks=[...document.querySelectorAll('audio')],status=document.getElementById('audio-status');tracks.forEach(track=>{track.addEventListener('play',()=>{tracks.forEach(other=>{if(other!==track)other.pause()});status.textContent='Playing '+track.dataset.code+'. Keep the round introduction slide visible.'});track.addEventListener('ended',()=>{status.textContent=track.dataset.code+' finished. Students commit answers before the teacher reveals them.'});track.addEventListener('error',()=>{status.textContent='Recording unavailable. Extract the complete folder and check that both MP3 files are beside Audio-player.html, or open the matching MP3 directly.'})});</script></html>`;
}
export function downloadLessonFile(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
