-- Seed the self-paced IELTS course: 20 ordered units built from the
-- originality-reviewed practice bank. Lesson text is short (one or two
-- phone screens) and precedes the practice in every unit.
--
-- Re-runnable: units are upserted by slug; task links are replaced per unit.

create temp table _course_seed (
  position int, slug text, title text, subtitle text, focus_skills text[],
  minutes int, free boolean, lesson jsonb, tasks jsonb
) on commit drop;

insert into _course_seed values
(1, 'welcome-reading-basics', 'Welcome: how IELTS works', 'Reading basics and your first listening', array['reading','listening'], 30, true, $j${
  "intro": "IELTS has four papers: Listening (30 min), Reading (60 min), Writing (60 min) and Speaking (11-14 min). Each is scored from 1 to 9, and your overall band is the average. This course takes you through all four, one short unit at a time.",
  "sections": [
    {"title": "Skim first, then scan", "body": "Before you answer any reading question, spend 60 seconds skimming the passage: read the title, the first sentence of each paragraph and the last sentence. You are building a map of where each idea lives.\nThen read the questions and scan for the key words (names, numbers, dates, unusual nouns). Go to that part of the map and read carefully only there. Never read the whole passage word by word first; you will run out of time."},
    {"title": "The answer is always in the text", "body": "IELTS reading never asks what you think or what you know. If an answer feels right but you cannot point to the words in the passage that prove it, it is a guess. Find the sentence, underline it, and only then answer."},
    {"title": "Listening: read ahead", "body": "In the listening paper the recording plays once. Use the short pause before each part to read the questions and predict the type of answer: a name, a price, a date, a place. When you know you are listening for a number, you will hear it."}
  ],
  "example": {"label": "Predicting in Listening Part 1", "text": "Question: 'Course starts on ____.'  Before the audio plays, note: this needs a day or date. Listen for days of the week and numbers, and be ready for a correction such as 'not Monday, actually Tuesday'. The final word the speaker gives is the answer."},
  "tips": ["Read every instruction word: 'ONE WORD AND/OR A NUMBER' means 'two words' is wrong.", "Spelling counts. 'Wendesday' scores zero.", "Leave nothing blank. There is no penalty for a wrong answer."]
}$j$, '[{"skill":"reading","task_id":30},{"skill":"listening","task_id":31}]'),

(2, 'listening-part-1', 'Listening Part 1: names, numbers, spelling', 'Everyday conversations and form completion', array['listening','speaking'], 20, false, $j${
  "intro": "Part 1 is a conversation between two people about something practical: booking a course, reporting a lost bag, joining a club. The questions are usually a form to complete. It is the easiest part, so aim to get all of it right.",
  "sections": [
    {"title": "Letters and numbers", "body": "Names, postcodes and reference numbers are spelled out letter by letter. Practise hearing the letters that sound alike: B/P/V, M/N, A/E/I, and 'double' for repeated letters (double T). For numbers, listen for the stress: thirTEEN versus THIRty, fifTEEN versus FIFty.\nWrite exactly what you hear; do not 'improve' a spelling you think is wrong."},
    {"title": "Expect a correction", "body": "Speakers in Part 1 often change their mind: 'Shall we say Friday? Actually, Saturday is better.' The answer is the final version. Also listen for the second speaker confirming: 'So that is 24 Park Road?' 'Yes, that is right.'"},
    {"title": "Speaking Part 1 pairs well here", "body": "Speaking Part 1 is also about everyday life: your routine, your home, your hobbies. The examiner wants two or three sentences, not one word. Answer, give a reason, add a small detail: 'I usually get up at seven because my classes start early, although at weekends I sleep until nine.'"}
  ],
  "example": {"label": "Form completion", "text": "Audio: 'My surname is Okafor, that is O-K-A-F-O-R, and the phone number is oh-seven-seven-oh, double six, three one nine.'  Form: Surname: Okafor   Phone: 0770 66319."},
  "tips": ["Write numbers as digits (14), not words (fourteen); it is quicker and safer.", "If you miss an answer, let it go immediately and follow the next question.", "In Speaking Part 1, keep answers to about 15-20 seconds each."]
}$j$, '[{"skill":"listening","task_id":36},{"skill":"speaking","task_id":24}]'),

(3, 'reading-true-false-not-given', 'Reading: True / False / Not Given', 'The question type everyone finds hard', array['reading'], 35, false, $j${
  "intro": "TRUE / FALSE / NOT GIVEN tests whether you can tell the difference between what a text says, what it contradicts, and what it simply never mentions. Most lost marks come from mixing up FALSE and NOT GIVEN.",
  "sections": [
    {"title": "The three answers", "body": "TRUE: the statement says the same thing as the text, usually in different words.\nFALSE: the text says the opposite. You can point to a sentence that contradicts the statement.\nNOT GIVEN: the text does not say enough to decide. It might mention the topic, but not the specific claim.\nThe test: can you find a sentence that proves or disproves the statement? No sentence, no decision, so NOT GIVEN."},
    {"title": "Watch the small words", "body": "Statements are made FALSE by qualifiers: all / some, always / usually, only, first, most. 'Most customers preferred the new blend' versus the text 'around half of customers preferred the new blend' is FALSE. Comparisons ('more than', 'the largest') and causes ('because') are also common traps."},
    {"title": "Keep the order", "body": "The answers appear in the passage in the same order as the questions. If you found question 3 in paragraph B, question 4 is in paragraph B or later. Use this to limit where you scan."}
  ],
  "example": {"label": "Spot the difference", "text": "Text: 'The cafe introduced the new routine in March and most staff adjusted within a week.'\nStatement: 'All staff adjusted to the routine within a week.'  FALSE (most, not all).\nStatement: 'Customers complained about the change.'  NOT GIVEN (customers are not mentioned here)."},
  "tips": ["Your own opinion or general knowledge is never evidence. Only the passage is.", "If you cannot decide between FALSE and NOT GIVEN, ask: does the text say the opposite? If not, NOT GIVEN.", "Do not spend more than 90 seconds on one statement."]
}$j$, '[{"skill":"reading","task_id":32},{"skill":"reading","task_id":31}]'),

(4, 'speaking-part-1-full-answers', 'Speaking Part 1: give full answers', 'Extend, explain, add an example', array['speaking'], 15, false, $j${
  "intro": "Part 1 lasts four to five minutes. The examiner asks about familiar topics: music, weather, your town, your studies. Short answers are the main reason candidates stay at band 5. Use a simple pattern to make every answer complete.",
  "sections": [
    {"title": "The A-R-E pattern", "body": "Answer the question directly. Give a Reason. Add an Example or detail.\n'Do you like music?'  'Yes, very much (answer). It helps me relax after studying (reason). For instance, I usually listen to acoustic playlists on the bus home (example).'\nThree sentences, about 15-20 seconds, every time."},
    {"title": "Use the tense in the question", "body": "'What did you do last weekend?' needs past tense. 'What will you do after this course?' needs future. Examiners listen for a range of grammar, so switching tenses correctly is an easy way to show control."},
    {"title": "Don't memorise, prepare", "body": "Memorised speeches sound flat and examiners are trained to notice them. Instead, prepare ideas: three things about your hometown, two kinds of weather you like and why, your favourite kind of music and a singer. Then build sentences live."}
  ],
  "example": {"label": "Before and after", "text": "Weak: 'What is the weather like in your city?'  'It is hot.'\nBetter: 'It is hot for most of the year, especially in July when it can reach forty degrees. Because of that, people tend to go out in the evening rather than in the afternoon.'"},
  "tips": ["If you don't understand, say 'Sorry, could you repeat that?' It is not penalised.", "Fillers like 'well' and 'actually' are fine; long silences are not.", "Record yourself answering the practice prompts, then listen back for length and tense."]
}$j$, '[{"skill":"speaking","task_id":25},{"skill":"speaking","task_id":26}]'),

(5, 'listening-part-2-talks', 'Listening Part 2: follow a talk', 'One speaker, multiple choice and maps', array['listening'], 25, false, $j${
  "intro": "Part 2 is one person speaking: a welcome talk, a tour guide, an announcement. You will see multiple-choice questions and sometimes a map or plan. The speaker is organised, so follow their signposts.",
  "sections": [
    {"title": "Listen for signposts", "body": "Speakers in Part 2 announce their structure: 'First I'll explain how to register, then I'll talk about the facilities, and finally the timetable.' Each signpost tells you which question is coming next. When you hear 'moving on to', the previous question is finished; stop thinking about it."},
    {"title": "Multiple choice: all options are mentioned", "body": "Expect to hear words from every option. The trap is choosing the first option you hear. Keep listening: the speaker often mentions two options and rejects one ('the cafe used to be by the entrance, but it has moved next to the lake'). The answer is what is true now."},
    {"title": "Paraphrase, not matching", "body": "The question says 'free of charge'; the audio says 'you won't need to pay anything'. Train yourself to hear meaning rather than wait for the exact words on the page. Before the audio starts, underline the key idea in each option and think of one way it could be said differently."}
  ],
  "example": {"label": "A rejected option", "text": "Question: Where is the information desk? A) by the main gate  B) next to the stage  C) in the car park.\nAudio: 'Last year the information desk was by the main gate, but this year you'll find it right beside the stage.'  Answer: B."},
  "tips": ["Use the preparation time to read the options, not the question stems only.", "Numbers in Part 2 are often rounded in speech: 'nearly two hundred' can match '195'.", "If a map is shown, orient yourself: find the entrance and the compass first."]
}$j$, '[{"skill":"listening","task_id":33},{"skill":"listening","task_id":32}]'),

(6, 'writing-task-2-understand-and-plan', 'Writing Task 2: understand the question', 'Five minutes of planning saves a band', array['writing'], 45, false, $j${
  "intro": "Task 2 is an essay of at least 250 words and is worth two-thirds of your writing score. The most common failure is answering a slightly different question from the one on the page. This unit is about reading the task properly and planning before you write.",
  "sections": [
    {"title": "Three things to find in the question", "body": "1. The topic (homework in primary schools).\n2. The instruction: Do you agree or disagree? Discuss both views? What are the causes and solutions? Each instruction needs a different essay shape.\n3. The limits: 'primary schools' is not 'all schools'; 'young children' is not 'teenagers'. Stay inside the limits in every paragraph."},
    {"title": "A four-paragraph plan", "body": "Introduction: paraphrase the question in one sentence and state your position in another.\nBody 1: one main idea, explained, with an example.\nBody 2: a second main idea, explained, with an example.\nConclusion: restate your position in different words. No new ideas.\nWrite the plan as six short lines before you begin. It takes five minutes and stops you drifting off topic."},
    {"title": "Ideas that are easy to develop", "body": "Choose ideas you can explain, not the cleverest ones. 'Homework teaches responsibility' is easy: say why, say how, give an example from a school day. An idea you cannot explain in three sentences will produce a thin paragraph."}
  ],
  "example": {"label": "Plan for 'Primary schools should not give homework. Do you agree?'", "text": "Position: partly disagree.\nBody 1: short homework builds routine and responsibility (example: ten minutes of reading).\nBody 2: too much homework harms play and sleep, so quantity matters (example: an hour a night at age seven).\nConclusion: a little, not none."},
  "tips": ["Count words once at the end; aim for 260-290. Under 250 loses marks.", "One idea per body paragraph. Two half-ideas score lower than one full one.", "Your opinion must be clear in the introduction AND the conclusion."]
}$j$, '[{"skill":"writing","task_id":23}]'),

(7, 'reading-completion', 'Reading: completing sentences and notes', 'Gap fills, word limits and grammar clues', array['reading'], 40, false, $j${
  "intro": "Sentence completion, note completion and summary completion all ask you to copy words from the passage into gaps. The words must be exact and must fit the grammar of the sentence. These questions are the fastest to answer if you work systematically.",
  "sections": [
    {"title": "Read the gap before you scan", "body": "Look at the words either side of the gap and decide what is missing: a noun? a verb? a number? a plural? 'The garden collects water from the ____' needs a noun, probably a place or object. Now scan for that part of the passage and look for a noun that fits. Knowing the word type halves your search."},
    {"title": "Copy, don't change", "body": "Use the exact words from the passage. If the text says 'rainwater tanks', do not write 'tank for rain'. Do not change singular to plural. The only thing you decide is which words; the passage supplies them."},
    {"title": "Respect the word limit", "body": "'NO MORE THAN TWO WORDS AND/OR A NUMBER' means 'three words' is wrong even if the meaning is right. Hyphenated words count as one. Numbers written as digits count as a number, not a word."}
  ],
  "example": {"label": "Working a gap", "text": "Sentence: 'Sensors send readings to a ____ every hour.'\nPassage: 'Each bed has a moisture sensor that reports to a small weather station on the roof every hour.'\nMissing: a noun, a place. Answer: 'weather station' (two words, copied exactly)."},
  "tips": ["Answers come in passage order, so each gap is after the last one you found.", "Check the completed sentence reads grammatically. If it doesn't, you have the wrong word.", "Watch for articles: if the sentence already has 'a', don't copy 'a' into the gap."]
}$j$, '[{"skill":"reading","task_id":35},{"skill":"reading","task_id":36}]'),

(8, 'speaking-part-2-long-turn', 'Speaking Part 2: the long turn', 'One minute to prepare, two minutes to talk', array['speaking'], 20, false, $j${
  "intro": "In Part 2 you get a card with a topic and four prompts, one minute to make notes, and then you speak for up to two minutes without the examiner interrupting. The challenge is not grammar; it is keeping going. A simple structure solves that.",
  "sections": [
    {"title": "Use the four prompts as your plan", "body": "The card already gives you a structure: where, when, who, why. Spend your minute writing one or two words next to each prompt. Then speak through them in order, about 25-30 seconds each. Cover the last prompt ('explain why it was memorable') in the most detail; it is where you show opinion and feelings."},
    {"title": "Tell it like a story", "body": "Past-tense narration is natural for most Part 2 topics: set the scene, say what happened, say how you felt, say what it means to you now. Use sequencing words: 'at first', 'after that', 'in the end'. Stories are easier to extend than descriptions because something always happens next."},
    {"title": "If you run out", "body": "Add a comparison ('unlike my usual trips, this one...'), a feeling ('what I remember most is how nervous I was'), or a reflection ('looking back, I think it changed how I...'). Any of these buys 20 seconds and sounds natural."}
  ],
  "example": {"label": "Notes for 'Describe a memorable journey'", "text": "where: the lake, by bus / when: last summer, cousins / what happened: bus broke down, night in village / why memorable: strangers helped, saw the lake at sunrise, learned to be patient."},
  "tips": ["Keep talking until the examiner stops you; stopping early at 60 seconds costs marks.", "You may glance at your notes, but keep your eyes up most of the time.", "Practise with a timer: one minute notes, two minutes speaking, then listen back."]
}$j$, '[{"skill":"speaking","task_id":14},{"skill":"speaking","task_id":28}]'),

(9, 'writing-task-2-opinion', 'Writing Task 2: opinion essays', 'Agree, disagree, or partly agree, and prove it', array['writing'], 60, false, $j${
  "intro": "'To what extent do you agree or disagree?' is the most common Task 2 instruction. You can agree fully, disagree fully, or take a position in between, but your position must be stated clearly and defended in every paragraph.",
  "sections": [
    {"title": "A clear thesis", "body": "End your introduction with one sentence that any reader could repeat back: 'I largely agree, although the benefits depend on the kind of work involved.' Avoid 'this essay will discuss both sides', which is not a position. The examiner marks Task Response partly on whether your view is clear throughout."},
    {"title": "Explain, then illustrate", "body": "Each body paragraph needs a chain: claim, explanation, example, link back. 'Working abroad builds adaptability (claim). People must solve daily problems in a new language and culture, which develops confidence (explanation). A friend who moved to Prague for two years returned far more independent (example). This is a lasting benefit that outweighs the initial difficulty (link).'"},
    {"title": "Hedge like an academic", "body": "Strong claims need softening: 'tends to', 'in many cases', 'is likely to'. Absolute statements ('everyone', 'always', 'never') invite the examiner to disagree and read as band-6 thinking. Precision in how far you agree is itself evidence of a higher band."}
  ],
  "example": {"label": "Introduction model", "text": "Question: 'Traffic in city centres should be reduced by banning private cars. To what extent do you agree?'\nIntro: 'Congestion in urban centres has become a serious problem, and some argue that private vehicles should be banned from them altogether. While I agree that car use must fall sharply, I believe a complete ban is less effective than pricing and better public transport.'"},
  "tips": ["Make sure both body paragraphs support the same position, or clearly show the 'partly' in 'partly agree'.", "Use 'In conclusion' once, and never introduce a new reason there.", "Leave three minutes to check articles (a/the), subject-verb agreement and plurals; these are the most common errors."]
}$j$, '[{"skill":"writing","task_id":24},{"skill":"writing","task_id":25}]'),

(10, 'listening-part-3-discussions', 'Listening Part 3: discussions and distractors', 'Two or three speakers, academic context', array['listening','speaking'], 25, false, $j${
  "intro": "Part 3 is a conversation between students, or a student and a tutor, about a project or assignment. Speakers agree, disagree and change their minds, which is exactly how the test hides the answer. This unit is about tracking who says what.",
  "sections": [
    {"title": "Track opinions, not facts", "body": "Questions often ask what a speaker thinks, feels or decides: 'What does Maria say about the survey?' Listen for opinion language: 'I'm not convinced', 'that would work', 'I'd rather'. Note which voice says it. Male/female or tutor/student differences help you keep track."},
    {"title": "The three-step distractor", "body": "A speaker suggests something; the other objects; they settle on a third thing. Only the final decision answers a 'what do they decide' question. Keep a mental 'current answer' and let it be replaced until the topic closes."},
    {"title": "Speaking Part 1: your hometown", "body": "This unit's speaking task is a Part 1 favourite. Prepare: location (north, by the mountains), size, what it is known for, one thing you like and one you would change. Use comparison words: 'quieter than the capital', 'much greener than it used to be'."}
  ],
  "example": {"label": "Following a decision", "text": "A: 'We could present with slides.' B: 'Everyone does that. What about a short video?' A: 'Filming takes ages. A poster with a live demo?' B: 'Yes, let's do that.'\nQ: How will they present?  Answer: a poster with a demonstration."},
  "tips": ["Underline the name in each question so you know whose view you need.", "Agreement words ('exactly', 'that's what I thought') confirm an answer; 'but' usually cancels one.", "Part 3 answers rarely repeat the words in the options; expect paraphrase."]
}$j$, '[{"skill":"listening","task_id":34},{"skill":"speaking","task_id":13}]'),

(11, 'reading-multiple-choice-paraphrase', 'Reading: multiple choice and paraphrase', 'Finding the sentence that says the same thing differently', array['reading'], 40, false, $j${
  "intro": "Multiple-choice questions in Reading look easy because the answer is on the page. They are hard because three of the four options are built from real words in the passage, arranged into something the text never said.",
  "sections": [
    {"title": "Locate, then eliminate", "body": "Use the question stem to find the paragraph (names, numbers, unusual words). Read that paragraph closely. Now go through the options and reject any that contradict the paragraph or add something it does not say. Usually two go immediately. Between the last two, look for the one that is a true paraphrase of a specific sentence."},
    {"title": "What paraphrase looks like", "body": "Synonyms: 'visitors' becomes 'members of the public'. Word class changes: 'automate' becomes 'automation'. Structure flips: 'The library cut staff after installing machines' becomes 'Staff numbers fell once the machines arrived'. The correct option keeps the meaning and changes the form. Wrong options keep the form and change the meaning."},
    {"title": "Beware of 'too true' options", "body": "An option can be true in the real world and still be wrong because the passage does not say it. Also beware options that are only half right: the first part matches, the second part adds a reason or result the text never gives."}
  ],
  "example": {"label": "Eliminate in action", "text": "Passage: 'Allowing visitors to handle objects increased the time they spent in each gallery, though curators worried about wear.'\nA) Handling objects made visits shorter (contradicts).  B) Curators welcomed handling (contradicts).  C) Visitors stayed longer when they could touch exhibits (paraphrase).  D) Objects were damaged (not stated)."},
  "tips": ["Read all four options before choosing; the 'best' one may be D.", "If two options seem right, one of them contains an extra claim. Find it.", "Spend no more than two minutes per multiple-choice question."]
}$j$, '[{"skill":"reading","task_id":34},{"skill":"reading","task_id":37}]'),

(12, 'writing-task-1-academic-data', 'Writing Task 1 (Academic): describe the data', 'Overview first, then grouped detail', array['writing'], 45, false, $j${
  "intro": "Task 1 Academic gives you a chart, graph, table or diagram and asks for a 150-word report. You are not asked to explain causes or give opinions. You are asked to select the main features and compare them accurately.",
  "sections": [
    {"title": "The overview is the key paragraph", "body": "After a one-sentence introduction that paraphrases the title, write an overview: two or three sentences giving the biggest patterns without numbers. 'Overall, all three cities grew, but City A expanded far faster than the others, and only City C declined towards the end of the period.' Examiners look for this paragraph specifically; without it you cannot score above band 5 for Task Achievement."},
    {"title": "Group, don't list", "body": "Do not walk through the data point by point. Put similar things together: the two cities that rose steadily in one paragraph, the one that fell in another. Within each group, give a few key figures: the start, the end, the peak. Three or four numbers per paragraph is enough."},
    {"title": "The language of change and comparison", "body": "Rise / increase / grow / climb; fall / drop / decline / decrease; remain stable / level off; peak at / bottom out. Add degree: sharply, gradually, slightly. Compare: 'twice as many', 'the highest proportion', 'in contrast'. Keep tenses consistent with the dates: past for past years, future ('is expected to') for projections."}
  ],
  "example": {"label": "Overview + detail", "text": "'Overall, internet use rose in every age group, with the youngest users remaining the most connected throughout. The sharpest growth, however, came among people over 65.'\nDetail: 'Among 16-24-year-olds, usage climbed from 85% in 2010 to 98% in 2020, while the over-65 group tripled from 12% to 36% over the same period.'"},
  "tips": ["Never give your opinion or reasons for the data in Task 1.", "150 words minimum; 170-190 is the sweet spot. Do not spend more than 20 minutes.", "Check that every number you quote is actually on the chart."]
}$j$, '[{"skill":"writing","task_id":17},{"skill":"writing","task_id":13}]'),

(13, 'speaking-part-2-describing', 'Speaking Part 2: describing things and skills', 'Vocabulary range and detail', array['speaking'], 20, false, $j${
  "intro": "Not every Part 2 card is a story. Some ask you to describe an object, a skill or a habit. These need descriptive vocabulary and the ability to explain how something works or why it matters, so the focus shifts from narrative to detail.",
  "sections": [
    {"title": "Describe from several angles", "body": "For an object: what it is, what it looks like, how you use it, how often, what life would be like without it. For a skill: what it is, how you learned it, what was hard, how you use it now. Each angle is a mini-paragraph of three or four sentences, which fills two minutes easily."},
    {"title": "Precise words beat general ones", "body": "'Useful' and 'good' are band-5 words. Aim for 'indispensable', 'handy', 'time-saving', 'reliable'. For skills: 'I struggled with', 'it took persistence', 'I gradually got the hang of it', 'it became second nature'. Prepare five or six of these phrases and they will come out naturally."},
    {"title": "Explain the why with cause language", "body": "'The reason I rely on it is that', 'what makes it so useful is', 'thanks to this, I can'. Cause and result language shows the examiner you can build complex sentences, which lifts the Grammatical Range score."}
  ],
  "example": {"label": "Describing a skill", "text": "'The skill I'd like to talk about is touch typing. I started in my first year at university because my essays were taking forever. At first I was slower than before, which was frustrating, but after about three months it became second nature. Nowadays I hardly look at the keyboard, which means I can take notes while listening.'"},
  "tips": ["If the card says 'describe', spend at least half your time describing before you explain.", "Use 'which means', 'so that' and 'because' to link detail to importance.", "Practise with a random object on your desk: can you talk about it for two minutes?"]
}$j$, '[{"skill":"speaking","task_id":16},{"skill":"speaking","task_id":27}]'),

(14, 'listening-part-4-lectures', 'Listening Part 4: lectures', 'One speaker, academic content, no breaks', array['listening','writing'], 50, false, $j${
  "intro": "Part 4 is a short lecture on an academic topic, usually with note-completion questions, and there is no pause in the middle. The topic will be unfamiliar; that is deliberate. You do not need to understand everything, only to follow the structure and catch the gaps.",
  "sections": [
    {"title": "Follow the notes, not the lecture", "body": "The notes on the page are a summary of the lecture in order. Keep your eyes on the notes and your finger on the current gap. The lecturer's words will match the headings, so when you hear the heading of the next section, move your finger. If you get lost, find the next heading you hear and rejoin there."},
    {"title": "Predict the word type", "body": "As with reading completion, each gap needs a particular word class. 'Bees communicate distance through the ____ of the dance' needs a noun (duration, speed, angle). Prepare for it before the audio starts. The answer is almost always a single noun or a number in Part 4."},
    {"title": "Writing Task 2 on technology in education", "body": "This unit also includes a Task 2 essay. Technology questions reward balanced thinking: benefits (access, personalisation, motivation) against costs (distraction, inequality, less human contact). Decide your position in the plan, then give the opposing view one honest sentence before answering it."}
  ],
  "example": {"label": "Note completion", "text": "Notes: 'Waggle dance: duration shows ____ from hive.'\nAudio: 'The length of time the bee waggles tells the others how far the food source is from the hive.'  Answer: distance."},
  "tips": ["Technical words you don't know are rarely the answer; the answer is usually an ordinary word.", "Lecturers signal gaps with stress and pauses: 'the key factor here is... temperature.'", "Transfer answers carefully: Part 4 is at the end, when you are tired."]
}$j$, '[{"skill":"listening","task_id":35},{"skill":"writing","task_id":2}]'),

(15, 'reading-longer-passages', 'Reading: longer passages, mixed questions', 'Managing time across question types', array['reading'], 45, false, $j${
  "intro": "In the real test each passage has 13-14 questions of two or three different types, and you have about 20 minutes per passage. Here you practise handling a passage with mixed question types without losing time switching between them.",
  "sections": [
    {"title": "Order of attack", "body": "Do the question types that follow passage order first (completion, True/False/Not Given), because each answer tells you where the next one is. Leave 'which paragraph contains' or heading-matching questions until last; by then you know the passage well and can answer from memory of the map you built."},
    {"title": "Time boxes", "body": "Skim: 2 minutes. First question block: 7 minutes. Second block: 7 minutes. Check and transfer: 2 minutes. If a question is eating time, write your best guess, mark it, and move on. One hard question is worth the same as one easy question."},
    {"title": "Paragraph purpose", "body": "Longer academic passages have a purpose per paragraph: background, problem, method, results, objection, response. Writing a two-word label next to each paragraph while you skim ('old method', 'first trial') makes every later question faster."}
  ],
  "example": {"label": "Labelled skim", "text": "A: reserve's history   B: climate changes observed   C: how rangers respond   D: results after five years   E: critics' concerns\nQ: 'Some experts doubt the approach.' Scan paragraph E first."},
  "tips": ["Transfer answers as you go rather than all at the end; there is no extra time for transferring in Reading.", "Do not leave blanks. A guess on multiple choice has a 25% chance.", "Practise with a visible timer until 20 minutes per passage feels normal."]
}$j$, '[{"skill":"reading","task_id":33},{"skill":"reading","task_id":38}]'),

(16, 'writing-task-2-both-views', 'Writing Task 2: discuss both views', 'Balance, then commit', array['writing'], 70, false, $j${
  "intro": "'Discuss both views and give your own opinion' is the second most common Task 2 instruction. Candidates lose marks by presenting only one side, or by presenting both and never saying what they think. You must do all three: view one, view two, your position.",
  "sections": [
    {"title": "Structure", "body": "Introduction: paraphrase, then say what you will do and where you stand ('While both approaches have merit, I believe...').\nBody 1: the first view, explained fairly, with an example.\nBody 2: the second view, the same way.\nConclusion: your opinion, with the main reason. Your opinion can also appear briefly in the introduction; it must appear in the conclusion."},
    {"title": "Presenting a view you don't hold", "body": "Use reporting language: 'Supporters of online learning argue that', 'It is often claimed that', 'From this perspective'. This keeps the view separate from your own voice. Then explain it properly; a weak straw-man paragraph scores badly for Task Response."},
    {"title": "Committing", "body": "In the conclusion, choose. 'In my view, classroom learning remains more effective for most school-age students, mainly because of the social element, although online tools are a valuable supplement.' One clear sentence of position plus the main reason is enough."}
  ],
  "example": {"label": "Introduction model", "text": "Question: 'Some believe older people should be taught to use new technology; others think this is unnecessary. Discuss both views and give your opinion.'\n'As digital services replace traditional ones, there is debate over whether older adults should receive training in using them or be left to choose for themselves. This essay examines both positions and argues that structured support is essential.'"},
  "tips": ["Give both views roughly equal length; a two-sentence second view looks like an afterthought.", "Avoid 'I think' more than twice; vary with 'in my view', 'I would argue'.", "Target 270-300 words; this essay type runs long, so plan tightly."]
}$j$, '[{"skill":"writing","task_id":26},{"skill":"writing","task_id":27}]'),

(17, 'speaking-part-3-discussion', 'Speaking Part 3: discuss ideas', 'Abstract questions, structured answers', array['speaking'], 25, false, $j${
  "intro": "Part 3 follows the Part 2 topic but asks about society rather than you: 'Why do some cities have more public spaces than others?' 'Should schools teach practical skills?' The examiner wants reasoning, comparison and speculation, not personal stories.",
  "sections": [
    {"title": "The two-reason answer", "body": "Give your view, then two reasons, each with a short explanation: 'I think there are two main factors. Firstly, money: wealthier cities can afford to maintain parks. Secondly, planning history: cities designed in the last century often set aside green space, whereas older ones grew without it.' This takes 30-40 seconds and shows organisation."},
    {"title": "Speculate and compare", "body": "Part 3 questions often ask about the future or about differences between groups. Use 'it is likely that', 'I imagine', 'in the coming years', 'compared with', 'whereas', 'on the other hand'. Hedged, comparative language is exactly what the band descriptors reward at 7 and above."},
    {"title": "When you have no idea", "body": "Say so, then reason anyway: 'I haven't thought about that before, but I suppose it could be because...'. Thinking aloud is acceptable and shows fluency. Silence or 'I don't know' ends the exchange."}
  ],
  "example": {"label": "Model answer", "text": "'Why do some people volunteer?'  'I'd say it's partly about values and partly about benefits. Many people genuinely want to contribute to their community, especially after seeing a problem up close. At the same time, volunteering builds skills and contacts, so for younger people it can also be a route into work.'"},
  "tips": ["Keep answers to 30-45 seconds; the examiner will ask a follow-up if they want more.", "Use general subjects ('people', 'governments', 'schools'), not 'I' or 'my friend'.", "Prepare opinions on common themes: education, cities, technology, environment, work."]
}$j$, '[{"skill":"speaking","task_id":30},{"skill":"speaking","task_id":31},{"skill":"speaking","task_id":15}]'),

(18, 'writing-task-1-general-letters', 'Writing Task 1 (General): letters', 'Purpose, tone and the three bullet points', array['writing','reading'], 50, false, $j$ {
  "intro": "If you take IELTS General Training, Task 1 is a letter of at least 150 words. The question gives a situation and three bullet points you must cover. Marks are lost for the wrong tone and for missing a bullet, not for lack of imagination.",
  "sections": [
    {"title": "Match the tone to the reader", "body": "Formal (to a manager or company you do not know): 'Dear Sir or Madam', full forms ('I am writing'), no contractions, 'Yours faithfully'. Semi-formal (to someone you know by name professionally): 'Dear Mr Khan', 'Yours sincerely'. Informal (a friend): 'Hi Sara', contractions, 'Best wishes'. Decide the tone before you write a word and keep it throughout."},
    {"title": "One paragraph per bullet", "body": "Opening line: say why you are writing. Then one short paragraph for each bullet point, in order. Closing line: say what you want to happen next. This structure guarantees you cover everything and makes the letter easy for the examiner to follow."},
    {"title": "A complaint without anger", "body": "A complaint letter should be firm and specific: dates, what went wrong, the effect on you, what you expect. 'I was disappointed to find', 'I would appreciate it if', 'I look forward to your response'. Rudeness lowers your tone score; precision raises it."}
  ],
  "example": {"label": "Opening and closing", "text": "'Dear Sir or Madam,\nI am writing to express my dissatisfaction with the service I received at your restaurant on 14 March.'\n...\n'I would be grateful if you could refund the cost of the meal. I look forward to hearing from you.\nYours faithfully,'"},
  "tips": ["Underline the three bullets in the question and tick each one as you write.", "Invent details freely (dates, names, amounts); they are expected.", "Spend 20 minutes maximum; Task 2 is worth twice as much."]
}$j$, '[{"skill":"writing","task_id":15},{"skill":"reading","task_id":39}]'),

(19, 'reading-writing-consolidation', 'Reading and Writing: putting it together', 'A full reading set and two essays under time', array['reading','writing'], 90, false, $j${
  "intro": "This unit is practice under exam conditions. You have learned the techniques; now the goal is doing them automatically with a clock running. Set a timer for each task and do not pause it.",
  "sections": [
    {"title": "Before you start", "body": "Reading: 20 minutes, one pass, transfer answers as you go. Writing: plan for five minutes, write for thirty, check for five. Have paper for your plan. Close other tabs. The point is to find out what breaks under pressure, so you can fix it before the real test."},
    {"title": "The checking routine", "body": "Writing: read your essay once for ideas (does each paragraph have one clear point?), once for grammar (articles, plurals, subject-verb agreement, tenses), once for words (repeated words, vague words like 'thing' and 'good'). Three fast passes catch more than one slow one."},
    {"title": "Reviewing your result", "body": "After each task, look at what you got wrong and name the cause: misread the question, wrong word limit, ran out of time, vocabulary gap. Write the cause down. Two or three causes will explain most of your errors, and those are what the remaining units should fix."}
  ],
  "example": {"label": "Error log", "text": "R-018 Q4: chose FALSE, answer NOT GIVEN; I assumed instead of finding the sentence.\nEssay: 238 words; ran out of time because the plan took 9 minutes. Next time: 5-minute plan, shorter intro."},
  "tips": ["Do not look at answers until the timer ends.", "If an essay is under 250 words, note why; a thin second body paragraph is the usual reason.", "Keep your error log; it is the most useful page you own before the exam."]
}$j$, '[{"skill":"reading","task_id":40},{"skill":"writing","task_id":28},{"skill":"writing","task_id":14}]'),

(20, 'final-speaking-writing', 'Final unit: the full speaking test and a last essay', 'Parts 2 and 3 together, then a band-7 essay', array['speaking','writing'], 60, false, $j${
  "intro": "You have completed every question type in the course. This last unit runs Speaking Parts 2 and 3 on one connected topic, as in the real test, and finishes with an essay on a demanding question. Treat it as a mock exam.",
  "sections": [
    {"title": "Speaking: carry the topic forward", "body": "Part 2 asks about a time you helped someone; Part 3 asks about helping and volunteering in society. Notice how your Part 2 story gives you material for Part 3: you can refer back to it once ('as in the situation I described'), then move to general reasoning. Examiners like this continuity but want most of Part 3 to be about people in general."},
    {"title": "Writing: an essay with a strong line", "body": "Environmental questions tempt candidates into vague agreement ('everyone should protect the planet'). A band-7 answer is specific: who should act (governments, companies, individuals), what exactly they should do, and why that will work better than the alternatives. Pick a precise position and defend it with concrete mechanisms, not slogans."},
    {"title": "What to do after this course", "body": "Return to your error log. Repeat the units whose techniques still cause mistakes; practice material remains open. Book your test only when timed practice gives you the band you need consistently, not once."}
  ],
  "example": {"label": "Precise position", "text": "Vague: 'Individuals and governments should both protect the environment.'\nPrecise: 'Although individual choices matter, the fastest reductions in emissions come from regulation such as fuel standards and carbon pricing, so governments should lead and individuals should follow.'"},
  "tips": ["Record the full speaking practice without stopping, Part 2 straight into Part 3.", "Write the essay in 40 minutes exactly; stop when the timer ends.", "Celebrate finishing. Then do the timed units again next week."]
}$j$, '[{"skill":"speaking","task_id":29},{"skill":"speaking","task_id":32},{"skill":"writing","task_id":3}]');

-- Upsert units by slug.
insert into public.ielts_course_units (position, slug, title, subtitle, focus_skills, estimated_minutes, is_free_preview, lesson)
select position, slug, title, subtitle, focus_skills, minutes, free, lesson from _course_seed
on conflict (slug) do update set
  position = excluded.position,
  title = excluded.title,
  subtitle = excluded.subtitle,
  focus_skills = excluded.focus_skills,
  estimated_minutes = excluded.estimated_minutes,
  is_free_preview = excluded.is_free_preview,
  lesson = excluded.lesson,
  updated_at = now();

-- Replace task links for the seeded units.
delete from public.ielts_course_unit_tasks t
using public.ielts_course_units u
where t.unit_id = u.id and u.slug in (select slug from _course_seed);

insert into public.ielts_course_unit_tasks (unit_id, position, skill, task_id)
select u.id, (task.ordinality)::int, task.value->>'skill', (task.value->>'task_id')::bigint
from _course_seed s
join public.ielts_course_units u on u.slug = s.slug
cross join lateral jsonb_array_elements(s.tasks) with ordinality as task(value, ordinality);
