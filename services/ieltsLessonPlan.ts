export const lessonGuideVersion = "1.1.0";
export const lessonFiles = {
  start: "01-START-HERE.html",
  plan: "IELTS-01-plan.html",
  students: "IELTS-01-students.html",
  keys: "IELTS-01-keys.html",
  slides: "IELTS-01-slides.html",
  powerpoint: "IELTS-01-presentation.pptx",
  staticPowerpoint: "IELTS-01-presentation-static.pptx",
  audio: "Audio-player.html",
  backup: "IELTS-01-plan-b.html",
  readingPaper: "IELTS-01-reading-paper.html",
  readingPaperKeys: "IELTS-01-reading-paper-keys.html",
} as const;
export const lessonPreparation = [
  "Extract the entire teaching ZIP into one folder. Keep both MP3 files beside Audio-player.html. Open 01-START-HERE.html first.",
  "Choose one presentation: PowerPoint, motion-free PowerPoint, or the HTML slides. These are alternatives. The presentations contain teacher answer reveals; keep them private before practice.",
  "Print IELTS-01-students.html: one workbook per learner. Keep IELTS-01-keys.html on your own device, away from the projected screen.",
  "Open Audio-player.html in a second tab. Check L-003.mp3 and L-004.mp3 through the classroom speakers before students arrive, then pause and return each track to the beginning. These are the two guided-practice recordings for today. Do not open the Listening Screener for these rounds.",
  "If the approved Reading fallback is available in your pack, print IELTS-01-reading-paper.html for each learner before class. Keep IELTS-01-reading-paper-keys.html private and keep IELTS-01-plan-b.html ready. The paper task is guided practice, not the online screener.",
  "Check that each student has their own Brains Heist account, permission to open the Reading Screener, a device and a working connection. Check the screener's displayed instructions and duration before class, without exposing its questions or keys.",
  "Reserve 35–55 minutes for Reading only if its published duration fits. Use the goals block for sign-in and instructions. If setup or the required duration cannot fit, arrange a separate full Reading session; do not shorten the assessment to fit the lesson.",
] as const;
export const lessonSteps = [
  {
    time: "0–5 min",
    title: "Welcome and purpose",
    slides: "1–2",
    open: "Your chosen presentation, slides 1–2; students use the opening section of their workbook.",
    actions: [
      "Ask the opening question and invite two predictions.",
      "Ask students to write their reason for joining and one difficulty. Explain today's sequence: guided listening first, then an independent online Reading Screener.",
    ],
    say: "Today we will practise spotting a speaker's final answer. Later, you will complete Reading independently in your own Brains Heist account.",
    check:
      "Everyone has a workbook and understands that the listening rounds are practice.",
  },
  {
    time: "5–12 min",
    title: "Round 1: L-003 listening",
    slides: "3",
    open: "Slide 3; Audio-player.html → Round 1 / L-003; workbook → L-003.",
    actions: [
      "Point to L-003 in the workbook and make sure all six questions are visible. Follow the activity's exact word-limit instructions.",
      "Click Play on L-003 only. Leave slide 3 on screen throughout the recording. Use the recording's reading and finishing pauses; pause manually if more preparation is needed.",
      "Wait until the recording ends and students finish all six answers. Ask them to commit their own answers before comparing. Record any help or replay.",
    ],
    say: "Find L-003 in your workbook. Read all six questions. Write your own answers while listening. We will discuss them after the recording finishes.",
    check:
      "L-003 has finished, playback is paused, and students have committed their answers. Only now advance to slide 4.",
  },
  {
    time: "12–20 min",
    title: "Round 1: answers and evidence",
    slides: "4–16",
    open: "Slides 4–16; IELTS-01-keys.html → L-003 stays on your private screen.",
    actions: [
      "For each question slide, ask for an answer and supporting detail before advancing to its answer slide. The pairs are 4/5, 6/7, 8/9, 10/11, 12/13 and 14/15.",
      "Use the approved L-003 script to explain the evidence. Replay a relevant part of L-003 if useful, recording the support given. Focus discussion on difficult items.",
      "Finish with the strategy on slide 16. Students correct their own workbook answers.",
    ],
    say: "Which detail supports your answer? Did the speaker correct or qualify an earlier detail?",
    check:
      "The recording is paused. Students can explain one correction or distractor. Workbook corrections remain practice, not a saved diagnostic score.",
  },
  {
    time: "20–28 min",
    title: "Round 2: L-004 listening and review",
    slides: "17–30",
    open: "Slide 17; Audio-player.html → Round 2 / L-004; workbook → L-004.",
    actions: [
      "Pause L-003. Show slide 17 and have everyone locate all six L-004 questions. Follow L-004's instructions.",
      "Click Play on L-004 only. Keep slide 17 on screen until the full recording and finishing interval end. Students commit their own answers before discussion.",
      "Review question/answer pairs 18/19, 20/21, 22/23, 24/25, 26/27 and 28/29 using the private L-004 script. Prioritize difficult items, then use slide 30 to reflect. Record any support/replay.",
    ],
    say: "Now use L-004. Apply the same strategy, then explain the evidence for your answer.",
    check:
      "L-004 is paused. Both guided rounds are complete. Do not interpret a higher practice score as measured improvement or an IELTS band.",
  },
  {
    time: "28–35 min",
    title: "Goals and the switch to online Reading",
    slides: "31, then 32",
    open: "Slide 31 for goals, then slide 32. Students open https://www.brainsheist.com/ielts/reading-screener on their own devices.",
    actions: [
      "Briefly discuss goals and explain the four-skill programme. Stop both listening recordings and put away the guided-listening workbook section.",
      "Show slide 32. Explain that the Reading passages and questions are inside Brains Heist; the workbook's Reading section is directions only. Reading needs no lesson audio.",
      "Have students sign in to their own accounts and open the Reading Screener. Check the displayed title, instructions and duration before starting. Leave a ready screener on its entry page until Step 6. For a completed screener, choose View saved result. Do not require a retake from students with a saved completed result; use the existing result unless a separately planned repeat is appropriate.",
    ],
    say: "The listening practice is finished. Reading is now online and independent. Open the Reading Screener in your own account; there is no reading passage in this workbook.",
    check:
      "Students are signed in and ready for the actual Reading Screener. If the full duration cannot fit, switch to IELTS-01-plan-b.html before anyone starts and arrange a full screener session later.",
  },
  {
    time: "35–55 min",
    title: "Independent Reading Screener",
    slides: "32, then blank the projector",
    open: "Students: their own Reading Screener screen. Teacher: blank projector; no audio player or answer keys on display.",
    actions: [
      "At this step, ready students click Start Reading screener. Students with an unfinished active attempt click Resume screener; other saved/expired states follow the platform's recovery guidance. Students then follow the published screener instructions, timing and submission workflow. Help with access or technical problems only; do not explain passage vocabulary, suggest answers, or run partner discussion.",
      "Check that students reach the normal submitted/result state. A locally pending answer or an unfinished attempt is not completed. If saving fails, follow the platform's retry/recovery message and preserve the attempt.",
      "Students who finish early quietly record one difficulty for later discussion without sharing screener items. Students with an existing completed result quietly review their own result and write a question for the teacher.",
    ],
    say: "Work independently. Follow the instructions on your screen. Tell me if you have a technical problem. After submitting, check that Brains Heist confirms your work.",
    check:
      "Each learner has a confirmed submitted/result state or a recorded unfinished/technical follow-up. Do not force submission or restart to meet the timetable; continue only as the platform and full-session arrangement allow.",
  },
  {
    time: "55–60 min",
    title: "Exit ticket and the next lesson",
    slides: "33–34",
    open: "Slides 33–34; workbook → Exit ticket. Teacher uses Student progress after class.",
    actions: [
      "Collect one listening trap learned and one remaining question. If any learner is still completing an authorized Reading session, collect exit reflections quietly and do not discuss screener items.",
      "Explain the between-lessons action: review the saved Reading result and follow only the next activity actually assigned in IELTS Journey.",
      "After class, inspect confirmed Reading evidence in Student progress and follow up unfinished access/save issues. Plan the next screener or reviewed practice through the normal eligibility and assignment checks.",
    ],
    say: "Write one trap you can now spot and one question you still have. Your next activity will appear in your IELTS Journey when I assign it.",
    check:
      "Exit tickets are collected and any unfinished Reading work has a clear follow-up. Paper listening answers are not automatically saved assessment evidence.",
  },
] as const;
// The online overview and the downloadable teacher guide use the same steps.
export const lessonStages = lessonSteps.map(
  (step) =>
    [
      step.time,
      step.title,
      `Open: ${step.open} ${step.actions.join(" ")} Before moving on: ${step.check}`,
    ] as const,
);

export const lessonPlanBSteps = [
  [
    "35–38 min",
    "Switch to paper",
    "Tell students that today's Reading Screener is postponed. Hand out the R-001 paper practice sheet, ask for names/date, and read its printed instructions. Keep the teacher key private.",
  ],
  [
    "38–48 min",
    "Read and answer",
    "Students read the approved passage and answer all six TRUE/FALSE/NOT GIVEN statements on paper. They add a short quote or identify missing information for each answer. No lesson audio is needed.",
  ],
  [
    "48–55 min",
    "Check the evidence",
    "After students commit answers, compare with the separate R-001 teacher key. Ask where the passage supports or contradicts each statement, or what it never tells us. Record any help and collect the sheets as paper guided practice.",
  ],
  [
    "55–60 min",
    "Exit and catch-up",
    "Use slides 33–34 and the workbook exit ticket. Give students the next full Reading Screener session arrangement. Reading remains not started or unfinished in Brains Heist until the normal online workflow confirms submission.",
  ],
] as const;
