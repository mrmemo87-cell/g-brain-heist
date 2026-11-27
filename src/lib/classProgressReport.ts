// Class Progress Report: turns one teaching group's live results (rpc_class_progress_report) into the report that
// school leadership reads. Pure functions only, so the same numbers appear on screen, in print and in tests.
//
// Rules the report follows:
//   * "Start" and "now" are two tests the teacher picks (the app suggests them). Averages and "improving" only count
//     students who sat both, so a student who missed one test never moves the class figure.
//   * With no two usable tests, the report compares each student's earlier and later marked work instead, and says so.
//   * The expected level is the school's setting (default 70%). Bands sit 15 points either side of it.
//   * Skill areas come from the questions' diagnostic skill tags. An area is shown as reliable only when both tests have
//     at least MIN_SKILL_ANSWERS tagged answers in it; otherwise it is shown greyed as "low evidence".
//   * Nothing is invented: when the data cannot support a section, the section says so.

export interface CprSchool { id: string; name: string; logo_url: string | null; expected_level: number; expected_level_set: boolean }
export interface CprGroup { id: string; name: string; subject: string | null; archived: boolean; teachers: string[] }
export interface CprStudent { id: string; name: string; class_code: string | null }
export interface CprAssignment {
  id: string; title: string; topic: string | null; category: string | null; delivery_mode: string | null;
  assigned_at: string; due_at: string | null; from_archived_group: boolean;
}
export interface CprResult { assignment_id: string; student_id: string; accuracy: number | null; completed_at: string | null; late: boolean }
export interface CprSkillCount { assignment_id: string; skill: string | null; total: number; correct: number }
export interface CprIntervention {
  id: string; student_id: string; status: string | null; skill: string | null; action: string | null;
  created_at: string; target_date: string | null;
}
export interface CprData {
  generated_at: string;
  school: CprSchool;
  group: CprGroup;
  viewer: { is_school_admin: boolean; is_teacher: boolean };
  students: CprStudent[];
  assignments: CprAssignment[];
  results: CprResult[];
  skills: CprSkillCount[];
  interventions: CprIntervention[];
}

export const DEFAULT_EXPECTED_LEVEL = 70;
export const BAND_WIDTH = 15;
export const MIN_SKILL_ANSWERS = 30;
export const MIN_TEST_PARTICIPATION = 0.6;
export const CHANGE_THRESHOLD = 3;

export type CprTone = "good" | "working" | "watch" | "below";
export interface CprStatus { tone: CprTone; label: string }
export type CprBand = "below" | "working" | "at" | "above";
export const BAND_LABELS: Record<CprBand, string> = {
  below: "Below expected", working: "Working towards", at: "At expected", above: "Above expected",
};
export const BAND_ORDER: CprBand[] = ["below", "working", "at", "above"];

export interface CprStudentRow {
  id: string; name: string; start: number | null; now: number | null; change: number | null;
  assigned: number; done: number; completion: number | null; plans: CprIntervention[];
}
export interface CprSkillArea {
  name: string; start: number | null; now: number | null; startAnswers: number; nowAnswers: number;
  termAnswers: number; reliable: boolean;
}
export interface CprWeakSkill { name: string; pct: number; answers: number }
export interface CprWeek { start: string; label: string; active: number }
export interface CprSupportRow { student: CprStudentRow; concern: string; plan: string; status: "plan_active" | "plan_planned" | "needs_plan" }
export interface CprTestOption { id: string; title: string; assigned_at: string; sat: number; diagnostic: boolean }

export interface CprModel {
  mode: "tests" | "work";
  schoolName: string;
  schoolLogoUrl: string | null;
  groupName: string;
  subject: string | null;
  teachers: string[];
  expectedLevel: number;
  expectedLevelSet: boolean;
  periodFrom: string | null;
  periodTo: string;
  generatedAt: string;
  rosterSize: number;
  baseline: CprTestOption | null;
  latest: CprTestOption | null;
  startLabel: string;
  nowLabel: string;
  matched: number;
  averageStart: number | null;
  averageNow: number | null;
  averageChange: number | null;
  improving: number;
  dropped: number;
  steady: number;
  assignedTotal: number;
  doneTotal: number;
  completion: number | null;
  homeworkAssigned: number;
  homeworkDone: number;
  classworkAssigned: number;
  classworkDone: number;
  activeThisWeek: number;
  activePlans: number;
  status: CprStatus;
  summary: string;
  skills: CprSkillArea[];
  taggedShare: number | null;
  weakSkills: CprWeakSkill[];
  weeks: CprWeek[];
  bandsStart: Record<CprBand, number>;
  bandsNow: Record<CprBand, number>;
  bandsStartTotal: number;
  bandsNowTotal: number;
  students: CprStudentRow[];
  support: CprSupportRow[];
  improved: CprStudentRow[];
  highlights: string[];
  teacherNote: string;
  focus: string[];
}

export interface CprOptions { baselineId?: string | null; latestId?: string | null; expectedLevel?: number | null; now?: number }

const READING = /explicit information|inference|implied meaning|vocabulary in context|writer'?s craft|multimodal|source evaluation|reading/i;
const WRITING = /purpose, audience|register|writing mechanics|organisation and cohesion|grammar control in writing|argument and persuasion|text cohesion|writing/i;
const LISTENING = /listening/i;
const SPEAKING = /speaking|pronunciation|fluency/i;
const AREA_ORDER = ["Grammar & vocabulary", "Reading", "Writing", "Listening", "Speaking"];

export function skillArea(tag: string): string {
  if (LISTENING.test(tag)) return "Listening";
  if (SPEAKING.test(tag)) return "Speaking";
  if (WRITING.test(tag)) return "Writing";
  if (READING.test(tag)) return "Reading";
  return "Grammar & vocabulary";
}

const round = (value: number) => Math.round(value);
const pct = (num: number, den: number) => (den > 0 ? round((num / den) * 100) : null);
const avg = (values: number[]) => (values.length ? values.reduce((sum, v) => sum + v, 0) / values.length : null);
const clampLevel = (value: number | null | undefined) =>
  Number.isFinite(value) ? Math.min(95, Math.max(40, Math.round(Number(value)))) : DEFAULT_EXPECTED_LEVEL;

export function isDiagnosticAssignment(a: Pick<CprAssignment, "title" | "topic" | "category">) {
  const text = `${a.title ?? ""} ${a.topic ?? ""}`;
  return /diagnostic|baseline|placement|end[- ]of[- ](term|unit)|progress test|mock/i.test(text);
}
/** A practice run of a diagnostic ("TEST Diagnostic …") is never suggested as a start or end point. */
const isTrialRun = (a: CprAssignment) => /^\s*test\b/i.test(a.title);

export function bandFor(value: number, level: number): CprBand {
  if (value < level - BAND_WIDTH) return "below";
  if (value < level) return "working";
  if (value < level + BAND_WIDTH) return "at";
  return "above";
}

/** Every assignment a teacher could pick as a start or end point, with how many roster students sat it. */
export function testOptions(data: CprData): CprTestOption[] {
  const roster = new Set(data.students.map((s) => s.id));
  const sat = new Map<string, number>();
  for (const r of data.results) {
    if (r.accuracy === null || r.accuracy === undefined || !roster.has(r.student_id)) continue;
    sat.set(r.assignment_id, (sat.get(r.assignment_id) ?? 0) + 1);
  }
  return [...data.assignments]
    .sort((a, b) => a.assigned_at.localeCompare(b.assigned_at))
    .map((a) => ({ id: a.id, title: a.title, assigned_at: a.assigned_at, sat: sat.get(a.id) ?? 0, diagnostic: isDiagnosticAssignment(a) }));
}

/** The app's suggestion: the earliest and the latest diagnostic that most of the class sat. */
export function suggestTests(data: CprData): { baselineId: string | null; latestId: string | null } {
  const rosterSize = Math.max(1, data.students.length);
  const byId = new Map(data.assignments.map((a) => [a.id, a]));
  const usable = testOptions(data).filter((t) => t.diagnostic && t.sat / rosterSize >= MIN_TEST_PARTICIPATION && !isTrialRun(byId.get(t.id)!));
  if (usable.length < 2) return { baselineId: null, latestId: null };
  return { baselineId: usable[0].id, latestId: usable[usable.length - 1].id };
}

const mondayOf = (time: number) => {
  const d = new Date(time);
  const day = (d.getUTCDay() + 6) % 7;
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day);
};
const shortDate = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
export const longDate = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const listJoin = (items: string[]) => (items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`);
const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

export function analyseClassProgress(data: CprData, options: CprOptions = {}): CprModel {
  const now = options.now ?? Date.now();
  const level = clampLevel(options.expectedLevel ?? data.school.expected_level);
  const roster = data.students;
  const rosterIds = new Set(roster.map((s) => s.id));
  const assignments = [...data.assignments].sort((a, b) => a.assigned_at.localeCompare(b.assigned_at));
  const assignmentById = new Map(assignments.map((a) => [a.id, a]));
  const results = data.results.filter((r) => rosterIds.has(r.student_id) && assignmentById.has(r.assignment_id));
  const options_ = testOptions(data);
  const suggested = suggestTests(data);
  const baselineId = options.baselineId === undefined ? suggested.baselineId : options.baselineId;
  const latestId = options.latestId === undefined ? suggested.latestId : options.latestId;
  const baseline = options_.find((t) => t.id === baselineId) ?? null;
  const latest = options_.find((t) => t.id === latestId && t.id !== baselineId) ?? null;
  const mode: CprModel["mode"] = baseline && latest ? "tests" : "work";

  const resultMap = new Map<string, CprResult>();
  for (const r of results) resultMap.set(`${r.assignment_id}:${r.student_id}`, r);
  const scoreOf = (assignmentId: string, studentId: string) => {
    const r = resultMap.get(`${assignmentId}:${studentId}`);
    return r && r.accuracy !== null && r.accuracy !== undefined ? Number(r.accuracy) : null;
  };

  // Per student: start, now, completion, plans.
  const plansByStudent = new Map<string, CprIntervention[]>();
  for (const plan of data.interventions) {
    if (!rosterIds.has(plan.student_id) || !["active", "planned"].includes(String(plan.status ?? ""))) continue;
    plansByStudent.set(plan.student_id, [...(plansByStudent.get(plan.student_id) ?? []), plan]);
  }
  const students: CprStudentRow[] = roster.map((s) => {
    const mine = results.filter((r) => r.student_id === s.id).sort((a, b) =>
      assignmentById.get(a.assignment_id)!.assigned_at.localeCompare(assignmentById.get(b.assignment_id)!.assigned_at));
    const done = mine.filter((r) => r.accuracy !== null && r.accuracy !== undefined);
    let start: number | null; let latestScore: number | null;
    if (mode === "tests") {
      start = scoreOf(baseline!.id, s.id);
      latestScore = scoreOf(latest!.id, s.id);
    } else {
      const half = Math.floor(done.length / 2);
      start = done.length >= 2 ? avg(done.slice(0, half).map((r) => Number(r.accuracy))) : null;
      latestScore = done.length >= 2 ? avg(done.slice(half).map((r) => Number(r.accuracy))) : null;
    }
    start = start === null ? null : round(start);
    latestScore = latestScore === null ? null : round(latestScore);
    return {
      id: s.id, name: s.name, start, now: latestScore,
      change: start !== null && latestScore !== null ? latestScore - start : null,
      assigned: mine.length, done: done.length, completion: pct(done.length, mine.length),
      plans: plansByStudent.get(s.id) ?? [],
    };
  });

  const matched = students.filter((s) => s.change !== null);
  const averageStart = avg(matched.map((s) => s.start!));
  const averageNow = avg(matched.map((s) => s.now!));
  const averageChange = averageStart !== null && averageNow !== null ? round(averageNow) - round(averageStart) : null;
  const improving = matched.filter((s) => s.change! >= CHANGE_THRESHOLD).length;
  const dropped = matched.filter((s) => s.change! <= -CHANGE_THRESHOLD).length;

  // Completion.
  const isHomework = (id: string) => /homework/i.test(assignmentById.get(id)?.category ?? "");
  const assignedTotal = results.length;
  const doneTotal = results.filter((r) => r.accuracy !== null && r.accuracy !== undefined).length;
  const homework = results.filter((r) => isHomework(r.assignment_id));
  const homeworkDone = homework.filter((r) => r.accuracy !== null && r.accuracy !== undefined).length;
  const completion = pct(doneTotal, assignedTotal);
  const weekAgo = now - 7 * 86_400_000;
  const activeThisWeek = new Set(results.filter((r) => r.completed_at && Date.parse(r.completed_at) >= weekAgo).map((r) => r.student_id)).size;
  const activePlans = data.interventions.filter((p) => rosterIds.has(p.student_id) && ["active", "planned"].includes(String(p.status ?? ""))).length;

  // Status.
  const nowAvg = averageNow === null ? null : round(averageNow);
  let status: CprStatus;
  if (nowAvg === null) status = { tone: "watch", label: "Not enough results yet" };
  else if (completion !== null && completion < 60) status = { tone: "watch", label: "Watch · low completion" };
  else if (nowAvg >= level) status = completion !== null && completion < 80 ? { tone: "good", label: "On track · completion to watch" } : { tone: "good", label: "On track" };
  else if (nowAvg >= level - BAND_WIDTH) status = (averageChange ?? 0) >= CHANGE_THRESHOLD
    ? { tone: "working", label: "Working towards · improving" } : { tone: "working", label: "Working towards" };
  else status = (averageChange ?? 0) >= CHANGE_THRESHOLD
    ? { tone: "below", label: "Below expected · improving" } : { tone: "below", label: "Below expected" };

  // Skill areas from tagged answers.
  const areaTotals = new Map<string, { s: [number, number]; n: [number, number]; t: [number, number] }>();
  const tagTotals = new Map<string, [number, number]>();
  let tagged = 0; let allAnswers = 0;
  for (const k of data.skills) {
    allAnswers += k.total;
    if (!k.skill) continue;
    tagged += k.total;
    const area = skillArea(k.skill);
    const entry = areaTotals.get(area) ?? { s: [0, 0], n: [0, 0], t: [0, 0] };
    entry.t[0] += k.correct; entry.t[1] += k.total;
    if (mode === "tests" && k.assignment_id === baseline!.id) { entry.s[0] += k.correct; entry.s[1] += k.total; }
    if (mode === "tests" && k.assignment_id === latest!.id) { entry.n[0] += k.correct; entry.n[1] += k.total; }
    areaTotals.set(area, entry);
    const tag = tagTotals.get(k.skill) ?? [0, 0];
    tag[0] += k.correct; tag[1] += k.total;
    tagTotals.set(k.skill, tag);
  }
  if (mode === "work") {
    // Without two tests, compare each area's first and second half of tagged work by date.
    const ordered = [...data.skills].filter((k) => k.skill && assignmentById.has(k.assignment_id))
      .sort((a, b) => assignmentById.get(a.assignment_id)!.assigned_at.localeCompare(assignmentById.get(b.assignment_id)!.assigned_at));
    const mid = assignments[Math.floor(assignments.length / 2)]?.assigned_at ?? "";
    for (const k of ordered) {
      const entry = areaTotals.get(skillArea(k.skill!))!;
      const early = assignmentById.get(k.assignment_id)!.assigned_at < mid;
      const slot = early ? entry.s : entry.n;
      slot[0] += k.correct; slot[1] += k.total;
    }
  }
  const skills: CprSkillArea[] = [...areaTotals.entries()]
    .map(([name, e]) => ({
      name, start: pct(e.s[0], e.s[1]), now: pct(e.n[0], e.n[1]), startAnswers: e.s[1], nowAnswers: e.n[1], termAnswers: e.t[1],
      reliable: e.s[1] >= MIN_SKILL_ANSWERS && e.n[1] >= MIN_SKILL_ANSWERS,
    }))
    .filter((a) => a.start !== null || a.now !== null)
    .sort((a, b) => AREA_ORDER.indexOf(a.name) - AREA_ORDER.indexOf(b.name));
  const weakSkills: CprWeakSkill[] = [...tagTotals.entries()]
    .filter(([, [, total]]) => total >= MIN_SKILL_ANSWERS)
    .map(([name, [correct, total]]) => ({ name, pct: pct(correct, total)!, answers: total }))
    .sort((a, b) => a.pct - b.pct || b.answers - a.answers)
    .slice(0, 4);

  // Weekly activity, Monday weeks from the first piece of work to this week (last 12 shown).
  const firstAssigned = assignments[0]?.assigned_at ?? null;
  const weekCounts = new Map<number, Set<string>>();
  for (const r of results) {
    if (!r.completed_at || r.accuracy === null || r.accuracy === undefined) continue;
    const key = mondayOf(Date.parse(r.completed_at));
    weekCounts.set(key, (weekCounts.get(key) ?? new Set()).add(r.student_id));
  }
  const weeks: CprWeek[] = [];
  if (firstAssigned) {
    let previousMonth = -1;
    for (let w = mondayOf(Date.parse(firstAssigned)); w <= mondayOf(now); w += 7 * 86_400_000) {
      const d = new Date(w);
      const label = d.getUTCMonth() !== previousMonth ? shortDate(d.toISOString()) : String(d.getUTCDate());
      previousMonth = d.getUTCMonth();
      weeks.push({ start: d.toISOString(), label, active: weekCounts.get(w)?.size ?? 0 });
    }
  }
  const shownWeeks = weeks.slice(-12);
  if (shownWeeks.length && weeks.length > 12) shownWeeks[0] = { ...shownWeeks[0], label: shortDate(shownWeeks[0].start) };

  // Bands.
  const emptyBands = (): Record<CprBand, number> => ({ below: 0, working: 0, at: 0, above: 0 });
  const bandsStart = emptyBands(); const bandsNow = emptyBands();
  for (const s of students) {
    if (s.start !== null) bandsStart[bandFor(s.start, level)] += 1;
    if (s.now !== null) bandsNow[bandFor(s.now, level)] += 1;
  }

  // Students who need support.
  const support: CprSupportRow[] = [];
  for (const s of students) {
    const reasons: string[] = [];
    const scoreText = s.start !== null && s.now !== null ? `${s.start}% → ${s.now}%` : s.now !== null ? `${s.now}% now` : s.start !== null ? `${s.start}% at the start` : "";
    if (s.now !== null && s.now < level - BAND_WIDTH) reasons.push("well below the expected level");
    if (s.change !== null && s.change <= -5) reasons.push(`down ${-s.change} points`);
    if (mode === "tests" && s.now === null && s.start !== null && s.start < level - BAND_WIDTH) reasons.push(`missed the ${latest ? shortDate(latest.assigned_at) : "latest"} test`);
    // Low completion only flags a student whose results are not already rising.
    if (s.completion !== null && s.assigned >= 3 && s.completion < 60 && (s.change === null || s.change < CHANGE_THRESHOLD)) reasons.push(`${s.done} of ${s.assigned} tasks done`);
    if (!reasons.length) continue;
    const active = s.plans.filter((p) => p.status === "active");
    const planSkills = [...new Set(s.plans.map((p) => (p.skill ?? "").trim()).filter(Boolean))];
    const plan = s.plans.length
      ? `${plural(s.plans.length, "plan")}${planSkills.length ? `: ${listJoin(planSkills.slice(0, 3).map(lowerFirst))}` : ""}`
      : "No plan yet";
    support.push({
      student: s,
      concern: [scoreText, ...reasons].filter(Boolean).join(", "),
      plan,
      status: !s.plans.length ? "needs_plan" : active.length ? "plan_active" : "plan_planned",
    });
  }
  support.sort((a, b) => (a.status === "needs_plan" ? 0 : 1) - (b.status === "needs_plan" ? 0 : 1)
    || (a.student.now ?? a.student.start ?? 0) - (b.student.now ?? b.student.start ?? 0));

  const improved = matched.filter((s) => s.change! > 0).sort((a, b) => b.change! - a.change!).slice(0, 3);

  // Highlights: only facts the data shows.
  const highlights: string[] = [];
  if (roster.length) highlights.push(`${activeThisWeek} of ${roster.length} students completed work this week`);
  const atOrAboveNow = bandsNow.at + bandsNow.above; const atOrAboveStart = bandsStart.at + bandsStart.above;
  if (atOrAboveNow > 0) highlights.push(`${plural(atOrAboveNow, "student")} at or above expected${mode === "tests" ? `, up from ${atOrAboveStart}` : ""}`);
  const top = students.map((s) => s.now).filter((v): v is number => v !== null).sort((a, b) => b - a)[0];
  if (top !== undefined) highlights.push(`Top ${mode === "tests" ? "result on the latest test" : "recent average"}: ${top}%`);
  const bestArea = skills.filter((a) => a.reliable && a.start !== null && a.now !== null).sort((a, b) => (b.now! - b.start!) - (a.now! - a.start!))[0];
  if (bestArea && bestArea.now! > bestArea.start!) highlights.push(`${bestArea.name} up ${bestArea.now! - bestArea.start!} points`);

  const startLabel = mode === "tests" ? `${baseline!.title} (${shortDate(baseline!.assigned_at)})` : "Earlier work";
  const nowLabel = mode === "tests" ? `${latest!.title} (${shortDate(latest!.assigned_at)})` : "Recent work";
  const needsPlan = support.filter((r) => r.status === "needs_plan");
  const homeworkRate = pct(homeworkDone, homework.length);
  const classworkAssigned = assignedTotal - homework.length;
  const classworkDone = doneTotal - homeworkDone;
  const classworkRate = pct(classworkDone, classworkAssigned);

  // Summary and teacher's note: a first draft from the data, which the teacher edits before printing.
  const parts: string[] = [];
  if (averageStart !== null && averageNow !== null) {
    const who = mode === "tests" ? `the ${plural(matched.length, "student")} who sat both tests` : "students' recent work";
    const verb = averageChange! > 0 ? "rose" : averageChange! < 0 ? "fell" : "stayed";
    parts.push(`${who.charAt(0).toUpperCase() + who.slice(1)} ${verb} from ${round(averageStart)}% to ${round(averageNow)}%, ${nowAvg! >= level ? "at or above" : "below"} the ${level}% expected level.`);
  } else parts.push("There are not yet enough marked results to compare the start and the end of the period.");
  if (weakSkills.length) parts.push(`The weakest area is ${lowerFirst(weakSkills[0].name)}.`);
  if (homeworkRate !== null && classworkRate !== null && homework.length >= 5 && classworkRate - homeworkRate >= 10) parts.push("Classwork completion is good, but homework lags.");
  else if (completion !== null && completion < 60) parts.push(`Only ${completion}% of tasks were completed.`);
  const summary = parts.join(" ");

  const note: string[] = [];
  if (averageChange !== null && averageChange > 0) {
    const bigGains = improved.filter((s) => s.change! >= 20).length;
    note.push(`Most of the group has made progress this period${bigGains ? `, and ${plural(bigGains, "student")} gained 20 points or more` : ""}.`);
  } else if (averageChange !== null) note.push("Results have not yet improved across the group this period.");
  if (weakSkills.length) note.push(`The main gaps are ${listJoin(weakSkills.slice(0, 3).map((w) => lowerFirst(w.name)))}.`);
  if (homeworkRate !== null && homework.length >= 5 && homeworkRate < 80) note.push(`Homework completion is ${homeworkRate}%, lower than classwork.`);
  if (needsPlan.length) note.push(`${plural(needsPlan.length, "student")} ${needsPlan.length === 1 ? "needs" : "need"} support without a plan yet; I will set up plans for them next.`);
  const teacherNote = note.join(" ");

  const focus: string[] = [];
  if (weakSkills.length) focus.push(`Weekly targeted practice on ${listJoin(weakSkills.slice(0, 3).map((w) => lowerFirst(w.name)))}`);
  if (homeworkRate !== null && homework.length >= 5 && homeworkRate < 80) focus.push(`Raise homework completion from ${homeworkRate}% to 80% or more`);
  else if (completion !== null && completion < 80) focus.push(`Raise task completion from ${completion}% to 80% or more`);
  if (needsPlan.length) focus.push(`Support plans for ${listJoin(needsPlan.slice(0, 4).map((r) => r.student.name.split(/\s+/)[0]))}, then review all plans`);
  if (skills.some((a) => !a.reliable)) focus.push(`Add ${listJoin(skills.filter((a) => !a.reliable).map((a) => a.name.toLowerCase()))} questions so these skills can be reported reliably`);
  if (mode === "work") focus.push("Set an end-of-term test so the next report can compare start and end results");

  return {
    mode, schoolName: data.school.name, schoolLogoUrl: data.school.logo_url, groupName: data.group.name, subject: data.group.subject,
    teachers: data.group.teachers, expectedLevel: level, expectedLevelSet: data.school.expected_level_set,
    periodFrom: firstAssigned, periodTo: data.generated_at, generatedAt: data.generated_at, rosterSize: roster.length,
    baseline: mode === "tests" ? baseline : null, latest: mode === "tests" ? latest : null, startLabel, nowLabel,
    matched: matched.length, averageStart: averageStart === null ? null : round(averageStart), averageNow: nowAvg, averageChange,
    improving, dropped, steady: matched.length - improving - dropped,
    assignedTotal, doneTotal, completion,
    homeworkAssigned: homework.length, homeworkDone, classworkAssigned, classworkDone,
    activeThisWeek, activePlans, status, summary, skills, taggedShare: pct(tagged, allAnswers), weakSkills, weeks: shownWeeks,
    bandsStart, bandsNow,
    bandsStartTotal: Object.values(bandsStart).reduce((a, b) => a + b, 0),
    bandsNowTotal: Object.values(bandsNow).reduce((a, b) => a + b, 0),
    students, support, improved, highlights: highlights.slice(0, 3), teacherNote, focus: focus.slice(0, 4),
  };
}
