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
    const slides = [
      ["Good English. Wrong answer. How?", "Can you beat the IELTS trap?"],
      [
        "Our challenge",
        "Listen for the final confirmed detail. Choose your own answer, then compare.",
      ],
      ...lesson.materials.flatMap((m) => [
        [`${m.display_code}: ${m.title}`, m.instructions],
        ...m.questions.map((q) => [
          q.prompt,
          "Write your answer. Which detail matters?",
        ]),
        [
          "The listening strategy",
          "Identify the exact question. Keep the first answer provisional. Check corrections and conditions.",
        ],
      ]),
      [
        "Your course goal",
        "Why are you here? What would you like to do with your English?",
      ],
      [
        "Reading starting point",
        "Open the Reading Screener in Brains Heist. Work independently and follow its instructions.",
      ],
      [
        "One thing you learned",
        "One trap I can now spot… One question I still have…",
      ],
      [
        "Your next step",
        "Review your saved screener result. Follow your teacher’s next activity in IELTS Journey.",
      ],
    ];
    body =
      slides
        .map(
          ([title, text], i) =>
            `<section class="slide" ${i ? "hidden" : ""}><p>${e(lesson.school.name)} · Brains Heist IELTS</p><h1>${e(title)}</h1><p>${e(text)}</p><small>${i + 1} / ${slides.length}</small></section>`,
        )
        .join("") +
      `<nav><button id="prev">Previous</button><button id="next">Next</button></nav><script>let i=0;const s=[...document.querySelectorAll('.slide')];function show(n){i=Math.max(0,Math.min(s.length-1,n));s.forEach((x,j)=>x.hidden=j!==i)}document.getElementById('prev').onclick=()=>show(i-1);document.getElementById('next').onclick=()=>show(i+1);document.onkeydown=x=>{if(x.key==='ArrowRight')show(i+1);if(x.key==='ArrowLeft')show(i-1)}</script>`;
  }
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${e(titles[kind])}</title><style>body{font:16px/1.6 system-ui,sans-serif;color:#15243A;background:#F5F7FC;margin:0}main{max-width:850px;padding:32px;margin:auto;background:white}h1{font-size:36px;line-height:1.2}h2{color:#1746B0}.logo{max-width:110px;max-height:65px}pre{white-space:pre-wrap;overflow-wrap:anywhere;font:inherit}li{margin:12px 0}.slide{min-height:65vh;padding:20px}.slide h1{font-size:clamp(32px,5vw,64px)}nav{display:flex;gap:16px}button{padding:12px 24px;font:inherit}small{color:#4C6076}@media print{body,main{background:white}main{padding:0}.break{break-before:page}.slide{display:block!important;break-after:page;height:auto;min-height:0}nav{display:none}@page{size:A4;margin:18mm}}</style><main>${kind === "slides" ? "" : header}${body}</main></html>`;
}
export function downloadLessonFile(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
