/**
 * Groups targeted-practice tasks the way teachers think about them: by skill, then by lesson (or task series),
 * then step by step in teaching order. Grouping is read from the published task titles
 * ("Listening Lesson 10 step 3 of 6: …", "Vocabulary V2 step 1 of 6: …", "Green roofs, step 4: …"),
 * so it needs no extra database fields. Single tasks that practise the same question type ("…: find the detail")
 * are grouped together; anything else is listed under "More practice tasks".
 */
export type TargetedSkill = "listening" | "reading" | "writing" | "speaking";

export interface TargetedTaskLike {
  code: string;
  title: string;
  skill?: TargetedSkill | null;
  purpose: string;
  display_code?: string | null;
}

export interface TargetedPlace {
  /** Stable key of the lesson or series, e.g. "reading:lesson:6". */
  family: string;
  /** Name shown to teachers, e.g. "Lesson 6", "Vocabulary V2", "Green roofs". */
  familyName: string;
  /** Sort key: lessons first by number, then vocabulary, then named series, then single tasks. */
  familyOrder: [number, number, string];
  /** 1-based position in the lesson, or null for a single task. */
  step: number | null;
  steps: number | null;
  /** Title without the "Lesson 6 step 2 of 6:" prefix. */
  shortTitle: string;
  stepLabel: string;
}

export const SKILLS: TargetedSkill[] = ["listening", "reading", "writing", "speaking"];
export const skillName = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const LESSON = /^(?:(?:Listening|Reading|Writing|Speaking)\s+)?Lesson\s+(\d+)\s+step\s+(\d+)\s+of\s+(\d+):\s*(.+)$/i;
const VOCAB = /^Vocabulary\s+(V\d+)\s+step\s+(\d+)\s+of\s+(\d+):\s*(.+)$/i;
const SERIES = /^(.+?),\s*step\s+(\d+):\s*(.+)$/i;

const topicOf = (title: string) => {
  const i = title.indexOf(":");
  return i > 0 ? title.slice(i + 1).trim().replace(/[’']/g, "'").toLowerCase() : "";
};

export function placeTargetedTask(t: TargetedTaskLike, seriesNames: Set<string> = new Set(), sharedTopics: Set<string> = new Set()): TargetedPlace {
  const skill = t.skill ?? "listening";
  const check = t.purpose === "independent_check";
  let m = LESSON.exec(t.title);
  if (m) {
    const n = Number(m[1]), step = Number(m[2]), steps = Number(m[3]);
    return { family: `${skill}:lesson:${n}`, familyName: `Lesson ${n}`, familyOrder: [0, n, ""], step, steps, shortTitle: m[4],
      stepLabel: `Step ${step} of ${steps}` };
  }
  m = VOCAB.exec(t.title);
  if (m) {
    const step = Number(m[2]), steps = Number(m[3]);
    return { family: `${skill}:vocab:${m[1].toUpperCase()}`, familyName: `Vocabulary ${m[1].toUpperCase()}`, familyOrder: [1, Number(m[1].slice(1)), ""], step, steps,
      shortTitle: m[4], stepLabel: `Step ${step} of ${steps}` };
  }
  m = SERIES.exec(t.title);
  if (m) {
    const name = m[1].trim(), step = Number(m[2]);
    return { family: `${skill}:series:${name.toLowerCase()}`, familyName: name, familyOrder: [2, 0, name.toLowerCase()], step, steps: null, shortTitle: m[3],
      stepLabel: `Step ${step}` };
  }
  // "Green roofs: mixed trap check" closes the "Green roofs, step n" series.
  const head = t.title.split(":")[0].trim();
  if (t.title.includes(":") && seriesNames.has(head.toLowerCase())) {
    return { family: `${skill}:series:${head.toLowerCase()}`, familyName: head, familyOrder: [2, 0, head.toLowerCase()], step: 99, steps: null,
      shortTitle: t.title.slice(head.length + 1).trim(), stepLabel: "Final check" };
  }
  // Practice pairs on the same question type ("Noisy classrooms: what does each paragraph do?" and its fresh check).
  const topic = topicOf(t.title);
  if (topic && sharedTopics.has(`${skill}:${topic}`)) {
    const name = topic.charAt(0).toUpperCase() + topic.slice(1);
    return { family: `${skill}:topic:${topic}`, familyName: name, familyOrder: [3, 0, topic], step: check ? 2 : 1, steps: null, shortTitle: t.title,
      stepLabel: "" };
  }
  return { family: `${skill}:single`, familyName: "More practice tasks", familyOrder: [4, 0, ""], step: null, steps: null, shortTitle: t.title,
    stepLabel: "" };
}

export interface TargetedFamily<T extends TargetedTaskLike> {
  family: string;
  familyName: string;
  skill: TargetedSkill;
  tasks: { task: T; place: TargetedPlace }[];
  order: [number, number, string];
}

/** Skill → lessons and series in teaching order → steps in order. */
export function targetedCatalogue<T extends TargetedTaskLike>(tasks: T[]): Record<TargetedSkill, TargetedFamily<T>[]> {
  const seriesNames = new Set<string>(), topicCount = new Map<string, number>();
  for (const t of tasks) {
    const m = SERIES.exec(t.title);
    if (m) seriesNames.add(m[1].trim().toLowerCase());
    const topic = topicOf(t.title), key = `${t.skill ?? "listening"}:${topic}`;
    if (topic && !LESSON.test(t.title) && !VOCAB.test(t.title) && !m) topicCount.set(key, (topicCount.get(key) ?? 0) + 1);
  }
  const sharedTopics = new Set([...topicCount].filter(([, n]) => n > 1).map(([k]) => k));
  const families = new Map<string, TargetedFamily<T>>();
  for (const task of tasks) {
    const place = placeTargetedTask(task, seriesNames, sharedTopics);
    const skill = (task.skill ?? "listening") as TargetedSkill;
    const f = families.get(place.family) ?? { family: place.family, familyName: place.familyName, skill, tasks: [], order: place.familyOrder };
    f.tasks.push({ task, place });
    families.set(place.family, f);
  }
  const out = { listening: [], reading: [], writing: [], speaking: [] } as Record<TargetedSkill, TargetedFamily<T>[]>;
  for (const f of families.values()) {
    f.tasks.sort((a, b) => (a.place.step ?? 0) - (b.place.step ?? 0) || (a.task.display_code ?? a.task.title).localeCompare(b.task.display_code ?? b.task.title));
    (out[f.skill] ?? out.listening).push(f);
  }
  for (const s of SKILLS)
    out[s].sort((a, b) => a.order[0] - b.order[0] || a.order[1] - b.order[1] || a.order[2].localeCompare(b.order[2]));
  return out;
}
