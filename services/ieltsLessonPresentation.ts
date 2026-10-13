import type { TeacherLesson } from "./ieltsLessonService";

export const lessonProduction = {
  bibleVersion: "1.0.0",
  presentationVersion: "2.0.0",
  motionMs: 250,
} as const;
export type LessonSlide = {
  phase: string;
  title: string;
  body: string;
  layout: "hero" | "question" | "reveal" | "editorial";
  notes: string;
};

// Both presentation formats use this sequence. Reveals are separate, explicit
// teacher advances, so the teaching sequence also works without animation.
export function lessonPresentation(lesson: TeacherLesson): LessonSlide[] {
  const slides: LessonSlide[] = [
    {
      phase: "OPENING / 0–5 MIN",
      title: "Good English.\nWrong answer. How?",
      body: "Can you beat the IELTS trap?",
      layout: "hero",
      notes:
        "Ask for a prediction and a reason for joining. Collect goals. Do not suggest an IELTS band from today's guided practice.",
    },
    {
      phase: "TODAY'S CHALLENGE",
      title: "The final confirmed detail",
      body: "Your first answer can change.\nWhat does the speaker finally confirm?",
      layout: "editorial",
      notes:
        "Use an unrelated spoken example. Give students time to decide before discussing. This lesson is guided practice.",
    },
  ];
  for (const [round, m] of lesson.materials.entries()) {
    slides.push({
      phase: `ROUND ${round + 1} / ${m.display_code}`,
      title: m.title,
      body: m.instructions,
      layout: "hero",
      notes:
        "Everyone reads all six questions in the workbook before playback. Play the matching approved MP3 from the separate player. Pause and replay only under teacher control and record any help. Finish the recording before advancing through question/reveal pairs.",
    });
    m.questions.forEach((q, index) => {
      slides.push({
        phase: `${m.display_code} / QUESTION ${index + 1}`,
        title: q.prompt,
        body: "Your answer first.\nWhich detail supports it?",
        layout: "question",
        notes:
          "After playback, ask students to commit their own answer and give a reason. The next slide reveals the accepted answer. Keep the teacher deck private before practice.",
      });
      slides.push({
        phase: `${m.display_code} / ANSWER ${index + 1}`,
        title: q.accepted_answers.join(" / "),
        body: "What supports this answer?\nWhich competing detail did you reject?",
        layout: "reveal",
        notes:
          "Use the approved script in the teacher keys to locate the supporting detail. Do not invent a quotation or an item-specific explanation. Invite students to explain, then clarify with the source. This exposed item remains practice.",
      });
    });
    slides.push({
      phase: `ROUND ${round + 1} / REFLECTION`,
      title: "The answer can change",
      body: "Keep the first detail provisional.\nCheck corrections and conditions against the question.",
      layout: "editorial",
      notes:
        "Round 1 discussion fits 12–20 minutes. Round 2 playback and discussion fit 20–28 minutes. Prioritize difficult items rather than spending equal time on every reveal.",
    });
  }
  slides.push(
    {
      phase: "YOUR GOAL / 28–35 MIN",
      title: "Why IELTS?",
      body: "What would you like to do with your English?",
      layout: "hero",
      notes:
        "Collect goals without promising a score or improvement. Explain the course's practice and evidence pathways.",
    },
    {
      phase: "READING / 35–55 MIN",
      title: "Your reading starting point",
      body: "Brains Heist: Reading Screener\nYour own account. Independent work.\nFollow the screener's published instructions.",
      layout: "editorial",
      notes:
        "Use the actual governed Reading Screener, not a substitute passage. Check its published duration before class and adjust the lesson if needed. Do not project questions, answers or hints during the independent attempt.",
    },
    {
      phase: "EXIT / 55–60 MIN",
      title: "One trap I can now spot",
      body: "One question I still have…",
      layout: "question",
      notes:
        "Collect the workbook exit ticket. Guided listening and paper reflections do not automatically become saved assessment evidence.",
    },
    {
      phase: "BETWEEN LESSONS",
      title: "Your next step",
      body: "Review your saved screener result.\nFollow your teacher's next activity in IELTS Journey.",
      layout: "editorial",
      notes:
        "Inspect authorized submitted evidence in Student progress. Assign only eligible practice through existing source and exposure checks. Today's practice does not prove a band or improvement.",
    },
  );
  return slides;
}
