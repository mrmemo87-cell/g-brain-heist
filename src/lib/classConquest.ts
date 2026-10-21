/**
 * Class Conquest rules, shared by the student card and the teacher projector view.
 * Pure functions only, so they can be unit tested.
 *
 * Each day a class earns power = round(100 * finished missions / class size).
 * The 7 oblasts are shared out in proportion to weekly power (largest remainder);
 * the strongest class holds the most valuable oblasts.
 */

export interface ConquestDay { date: string; done: number }
export interface ConquestClass { class_id: string; label: string; size: number; is_mine: boolean; days: ConquestDay[] }

export interface Oblast { zoneId: string; name: string; value: number }

/** Oblasts of the Kyrgyzstan map, most valuable first (ids match the Clan Wars map). */
export const OBLASTS: readonly Oblast[] = [
  { zoneId: 'zone-2', name: 'Chüy', value: 200 },
  { zoneId: 'zone-5', name: 'Osh', value: 190 },
  { zoneId: 'zone-3', name: 'Jalal-Abad', value: 180 },
  { zoneId: 'zone-7', name: 'Ysyk-Köl', value: 160 },
  { zoneId: 'zone-4', name: 'Naryn', value: 150 },
  { zoneId: 'zone-6', name: 'Talas', value: 130 },
  { zoneId: 'zone-1', name: 'Batken', value: 120 },
];

export const dayPower = (done: number, size: number) => (size > 0 ? Math.round((100 * Math.min(done, size)) / size) : 0);

/** Weekly power; pass `today` to leave today's results out ("before today"). */
export function weekPower(team: ConquestClass, excludeDate?: string): number {
  return team.days.reduce((sum, day) => (day.date === excludeDate ? sum : sum + dayPower(day.done, team.size)), 0);
}

/** How many oblasts each class holds, by largest remainder. Ties go to the earlier label. */
export function apportion(powers: Record<string, number>, seats = OBLASTS.length): Record<string, number> {
  const ids = Object.keys(powers).sort();
  const total = ids.reduce((s, id) => s + Math.max(0, powers[id]), 0);
  const result: Record<string, number> = Object.fromEntries(ids.map((id) => [id, 0]));
  if (total <= 0) return result;
  const quotas = ids.map((id) => ({ id, quota: (Math.max(0, powers[id]) * seats) / total }));
  let given = 0;
  for (const q of quotas) { result[q.id] = Math.floor(q.quota); given += result[q.id]; }
  quotas
    .map((q) => ({ ...q, rest: q.quota - Math.floor(q.quota) }))
    .sort((a, b) => b.rest - a.rest || powers[b.id] - powers[a.id] || a.id.localeCompare(b.id))
    .slice(0, seats - given)
    .forEach((q) => { result[q.id] += 1; });
  return result;
}

/** Which class owns each oblast: strongest class takes the most valuable ones. Unowned = null. */
export function assignOblasts(powers: Record<string, number>, labels: Record<string, string> = {}): Record<string, string | null> {
  const seats = apportion(powers);
  const order = Object.keys(powers)
    .filter((id) => seats[id] > 0)
    .sort((a, b) => powers[b] - powers[a] || (labels[a] || a).localeCompare(labels[b] || b));
  const owners: Record<string, string | null> = Object.fromEntries(OBLASTS.map((o) => [o.zoneId, null]));
  let i = 0;
  for (const id of order) for (let k = 0; k < seats[id]; k++) owners[OBLASTS[i++].zoneId] = id;
  return owners;
}

const valueRank = Object.fromEntries(OBLASTS.map((o, i) => [o.zoneId, i]));

/**
 * Move from yesterday's map to today's with as few changes as possible:
 * a class over its share gives up its least valuable oblasts; classes under
 * their share take the freed ones, strongest class first, most valuable first.
 */
export function transition(previous: Record<string, string | null>, seats: Record<string, number>, powers: Record<string, number>, labels: Record<string, string> = {}): Record<string, string | null> {
  const owners: Record<string, string | null> = { ...previous };
  const held = (id: string) => OBLASTS.filter((o) => owners[o.zoneId] === id);
  for (const id of Object.keys(seats)) {
    const mine = held(id).sort((a, b) => valueRank[b.zoneId] - valueRank[a.zoneId]); // least valuable first
    for (let i = 0; i < mine.length - seats[id]; i++) owners[mine[i].zoneId] = null;
  }
  // Oblasts owned by classes no longer in the game are freed too.
  for (const o of OBLASTS) if (owners[o.zoneId] && !(owners[o.zoneId]! in seats)) owners[o.zoneId] = null;
  const free = OBLASTS.filter((o) => owners[o.zoneId] === null);
  const gainers = Object.keys(seats)
    .sort((a, b) => powers[b] - powers[a] || (labels[a] || a).localeCompare(labels[b] || b));
  for (const o of free) {
    const taker = gainers.find((id) => held(id).length < seats[id]);
    if (!taker) break;
    owners[o.zoneId] = taker;
  }
  return owners;
}

/** The map after each day of the week, replayed from Monday. */
export function ownersAfter(classes: ConquestClass[], dayIndex: number): Record<string, string | null> {
  const labels = Object.fromEntries(classes.map((c) => [c.class_id, c.label]));
  let owners: Record<string, string | null> = Object.fromEntries(OBLASTS.map((o) => [o.zoneId, null]));
  for (let i = 0; i <= dayIndex; i++) {
    const powers = Object.fromEntries(classes.map((c) => [c.class_id, c.days.slice(0, i + 1).reduce((sum, d) => sum + dayPower(d.done, c.size), 0)]));
    owners = transition(owners, apportion(powers), powers, labels);
  }
  return owners;
}

export interface Capture { zoneId: string; name: string; by: string; from: string | null }

/** Oblasts that changed hands today. */
export function capturesToday(before: Record<string, string | null>, now: Record<string, string | null>): Capture[] {
  return OBLASTS.filter((o) => now[o.zoneId] && now[o.zoneId] !== before[o.zoneId])
    .map((o) => ({ zoneId: o.zoneId, name: o.name, by: now[o.zoneId] as string, from: before[o.zoneId] }));
}

export interface ConquestView {
  powers: Record<string, number>;
  owners: Record<string, string | null>;
  held: Record<string, number>;
  captures: Capture[];
  ranking: string[];
  /** Missions still needed today from my class to hold one more oblast (null = not possible today). */
  missionsToNext: number | null;
  /** Power one more mission adds for my class today. */
  powerPerMission: number;
  mine: ConquestClass | null;
  myDoneToday: number;
}

export function buildConquest(classes: ConquestClass[], today: string): ConquestView {
  const labels = Object.fromEntries(classes.map((c) => [c.class_id, c.label]));
  const powers = Object.fromEntries(classes.map((c) => [c.class_id, weekPower(c)]));
  const todayIndex = Math.max(0, (classes[0]?.days.findIndex((d) => d.date === today) ?? 0));
  const owners = ownersAfter(classes, todayIndex);
  const ownersBefore = todayIndex > 0 ? ownersAfter(classes, todayIndex - 1) : Object.fromEntries(OBLASTS.map((o) => [o.zoneId, null]));
  const held = Object.fromEntries(classes.map((c) => [c.class_id, Object.values(owners).filter((o) => o === c.class_id).length]));
  const ranking = classes.map((c) => c.class_id).sort((a, b) => powers[b] - powers[a] || labels[a].localeCompare(labels[b]));

  const mine = classes.find((c) => c.is_mine) || null;
  let missionsToNext: number | null = null;
  let powerPerMission = 0;
  let myDoneToday = 0;
  if (mine) {
    const todayEntry = mine.days.find((d) => d.date === today);
    myDoneToday = todayEntry?.done ?? 0;
    powerPerMission = dayPower(myDoneToday + 1, mine.size) - dayPower(myDoneToday, mine.size);
    const base = weekPower(mine, today);
    for (let extra = 1; myDoneToday + extra <= mine.size; extra++) {
      const trial = { ...powers, [mine.class_id]: base + dayPower(myDoneToday + extra, mine.size) };
      if (apportion(trial)[mine.class_id] > held[mine.class_id]) { missionsToNext = extra; break; }
    }
  }

  return { powers, owners, held, captures: capturesToday(ownersBefore, owners), ranking, missionsToNext, powerPerMission, mine, myDoneToday };
}

/** Stable, distinct colours per class (alphabetical by label). */
export const CONQUEST_COLORS = ['#22d3ee', '#f97316', '#a855f7', '#22c55e', '#f43f5e', '#eab308', '#3b82f6', '#ec4899'];
export function classColors(classes: ConquestClass[]): Record<string, string> {
  return Object.fromEntries([...classes].sort((a, b) => a.label.localeCompare(b.label)).map((c, i) => [c.class_id, CONQUEST_COLORS[i % CONQUEST_COLORS.length]]));
}
