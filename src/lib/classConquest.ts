/**
 * Class Conquest rules, shared by the student card and the teacher projector view.
 * Pure functions only, so they can be unit tested.
 *
 * Each day a class earns power = round(100 * finished missions / class size).
 * The map's territories are shared out in proportion to weekly power (largest
 * remainder); the strongest class holds the most valuable territories.
 *
 * Every week is fought on a different map (see CONQUEST_SEASON). The rotation is
 * deterministic from the week's Monday, so the server, the client and the
 * certificates all agree without a lookup table.
 */

export interface ConquestDay { date: string; done: number }
export interface ConquestClass { class_id: string; label: string; size: number; is_mine: boolean; days: ConquestDay[] }

export interface Territory { zoneId: string; name: string; value: number }
/** @deprecated name kept for older call sites; a territory is an oblast only on the Kyrgyzstan map. */
export type Oblast = Territory;

/** What one territory is called on this map (English message id, translated through t()). */
export type TerritoryUnit = 'oblasts' | 'regions' | 'prefectures' | 'governorates' | 'states';

export interface ConquestMap {
  /** Matches the Clan Wars map catalog (public/maps/<id>.svg). */
  mapId: 'kyrgyzstan' | 'unitedkingdom' | 'kazakhstan' | 'japan' | 'egypt' | 'usa';
  name: string;
  flag: string;
  unit: TerritoryUnit;
  /** Most valuable first. Zone ids match the Clan Wars zone tables for the same map. */
  territories: readonly Territory[];
}

export const KYRGYZSTAN: ConquestMap = {
  mapId: 'kyrgyzstan', name: 'Kyrgyzstan', flag: '🇰🇬', unit: 'oblasts',
  territories: [
    { zoneId: 'zone-2', name: 'Chüy', value: 200 },
    { zoneId: 'zone-5', name: 'Osh', value: 190 },
    { zoneId: 'zone-3', name: 'Jalal-Abad', value: 180 },
    { zoneId: 'zone-7', name: 'Ysyk-Köl', value: 160 },
    { zoneId: 'zone-4', name: 'Naryn', value: 150 },
    { zoneId: 'zone-6', name: 'Talas', value: 130 },
    { zoneId: 'zone-1', name: 'Batken', value: 120 },
  ],
};

export const UNITED_KINGDOM: ConquestMap = {
  mapId: 'unitedkingdom', name: 'United Kingdom', flag: '🇬🇧', unit: 'regions',
  territories: [
    { zoneId: 'zone-10', name: 'Greater London', value: 200 },
    { zoneId: 'zone-9', name: 'South East', value: 190 },
    { zoneId: 'zone-6', name: 'Scotland', value: 180 },
    { zoneId: 'zone-15', name: 'North West', value: 170 },
    { zoneId: 'zone-14', name: 'Yorkshire and the Humber', value: 160 },
    { zoneId: 'zone-12', name: 'West Midlands', value: 150 },
    { zoneId: 'zone-11', name: 'East of England', value: 140 },
    { zoneId: 'zone-8', name: 'South West', value: 130 },
    { zoneId: 'zone-13', name: 'East Midlands', value: 120 },
    { zoneId: 'zone-7', name: 'Wales', value: 120 },
    { zoneId: 'zone-16', name: 'North East', value: 110 },
    { zoneId: 'zone-5', name: 'Northern Ireland', value: 110 },
  ],
};

export const KAZAKHSTAN: ConquestMap = {
  mapId: 'kazakhstan', name: 'Kazakhstan', flag: '🇰🇿', unit: 'oblasts',
  territories: [
    { zoneId: 'zone-3', name: 'Almaty', value: 200 },
    { zoneId: 'zone-5', name: 'Qaraghandy', value: 190 },
    { zoneId: 'zone-11', name: 'East Kazakhstan', value: 180 },
    { zoneId: 'zone-12', name: 'South Kazakhstan', value: 170 },
    { zoneId: 'zone-1', name: 'Aqmola', value: 160 },
    { zoneId: 'zone-4', name: 'Atyrau', value: 150 },
    { zoneId: 'zone-8', name: 'Mangystau', value: 140 },
    { zoneId: 'zone-9', name: 'Pavlodar', value: 130 },
  ],
};

export const JAPAN: ConquestMap = {
  mapId: 'japan', name: 'Japan', flag: '🇯🇵', unit: 'prefectures',
  territories: [
    { zoneId: 'zone-40', name: 'Tokyo', value: 200 },
    { zoneId: 'zone-31', name: 'Osaka', value: 190 },
    { zoneId: 'zone-22', name: 'Kyoto', value: 180 },
    { zoneId: 'zone-12', name: 'Hokkaido', value: 170 },
    { zoneId: 'zone-20', name: 'Kanagawa', value: 160 },
    { zoneId: 'zone-13', name: 'Hiroshima', value: 150 },
    { zoneId: 'zone-30', name: 'Okinawa', value: 140 },
    { zoneId: 'zone-27', name: 'Nagano', value: 130 },
  ],
};

export const EGYPT: ConquestMap = {
  mapId: 'egypt', name: 'Egypt', flag: '🇪🇬', unit: 'governorates',
  territories: [
    { zoneId: 'zone-7', name: 'Cairo', value: 200 },
    { zoneId: 'zone-12', name: 'Giza', value: 190 },
    { zoneId: 'zone-1', name: 'Alexandria', value: 180 },
    { zoneId: 'zone-18', name: 'Luxor', value: 170 },
    { zoneId: 'zone-2', name: 'Aswan', value: 160 },
    { zoneId: 'zone-4', name: 'Red Sea', value: 150 },
    { zoneId: 'zone-14', name: 'South Sinai', value: 140 },
    { zoneId: 'zone-22', name: 'Port Said', value: 130 },
  ],
};

export const USA: ConquestMap = {
  mapId: 'usa', name: 'United States', flag: '🇺🇸', unit: 'states',
  territories: [
    { zoneId: 'zone-5', name: 'California', value: 200 },
    { zoneId: 'zone-44', name: 'Texas', value: 190 },
    { zoneId: 'zone-33', name: 'New York', value: 180 },
    { zoneId: 'zone-10', name: 'Florida', value: 170 },
    { zoneId: 'zone-14', name: 'Illinois', value: 160 },
    { zoneId: 'zone-48', name: 'Washington', value: 150 },
    { zoneId: 'zone-6', name: 'Colorado', value: 140 },
    { zoneId: 'zone-11', name: 'Georgia', value: 130 },
    { zoneId: 'zone-3', name: 'Arizona', value: 120 },
    { zoneId: 'zone-2', name: 'Alaska', value: 110 },
  ],
};

/**
 * The season: one map per week, in this order, repeating.
 * Mirrored in SQL (class_conquest_map_for_week) — keep both lists identical.
 */
export const CONQUEST_SEASON: readonly ConquestMap[] = [KYRGYZSTAN, UNITED_KINGDOM, KAZAKHSTAN, JAPAN, EGYPT, USA];
/** Monday of the first Kyrgyzstan week; the rotation counts from here. */
export const SEASON_ANCHOR = '2026-10-26';

const DAY_MS = 86_400_000;
const utcDate = (iso: string) => Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));
const isoDate = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** Monday (ISO week start) of the week containing `iso`. */
export function weekStartOf(iso: string): string {
  const ms = utcDate(iso);
  const dow = (new Date(ms).getUTCDay() + 6) % 7; // Mon = 0
  return isoDate(ms - dow * DAY_MS);
}

export const addDays = (iso: string, days: number) => isoDate(utcDate(iso) + days * DAY_MS);

/** Days that score: Monday to Friday. The vault seals Friday night; the weekend is for suspense. */
export const SCORING_DAYS = 5;

export type ConquestPhase = 'battle' | 'sealed';

/** Mon–Fri the battle is on; Sat–Sun the result is sealed in the vault until Monday. */
export function phaseFor(iso: string): ConquestPhase {
  const dow = (new Date(utcDate(iso)).getUTCDay() + 6) % 7; // Mon = 0
  return dow >= SCORING_DAYS ? 'sealed' : 'battle';
}

/** Monday 07:00 Bishkek after the given week — when students learn who won. */
export const revealAtIso = (weekStart: string) => `${addDays(weekStart, 7)}T07:00:00+06:00`;
/** Friday 23:59:59 Bishkek — when the vault seals. */
export const sealsAtIso = (weekStart: string) => `${addDays(weekStart, SCORING_DAYS - 1)}T23:59:59+06:00`;

/** "1d 14h 02m" / "03:12:44" until the vault opens. */
export function countdownLabel(ms: number): string {
  if (ms <= 0) return '00:00:00';
  const total = Math.floor(ms / 1000);
  const days = Math.floor(total / 86_400);
  const h = Math.floor((total % 86_400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const two = (n: number) => String(n).padStart(2, '0');
  return days > 0 ? `${days}d ${two(h)}h ${two(m)}m` : `${two(h)}:${two(m)}:${two(s)}`;
}

/** Preset chants for the weekend Hype Wall: no free text, so it stays safe for a grade-7 crowd. */
export const CHEER_CODES = ['all_the_way', 'unstoppable', 'gg', 'next_map', 'respect', 'comeback', 'mastermind', 'sweating'] as const;
export type CheerCode = (typeof CHEER_CODES)[number];
/** English message ids for each chant; {class} is the class the chant is aimed at. */
export const CHEER_TEXT = {
  all_the_way: '{class} all the way! 🔥',
  unstoppable: 'Nobody stops {class} 💪',
  gg: 'GG {class}, good fight 🤝',
  next_map: 'See you on the next map, {class} 🗺️',
  respect: 'Respect to {class} 🫡',
  comeback: 'The {class} comeback is coming 🚀',
  mastermind: '{class} has the real Mastermind 🧠',
  sweating: 'Vault is sealed… {class} is sweating 😅',
} as const satisfies Record<CheerCode, string>;

/** Which map a given week is fought on. Accepts any date in the week. */
export function mapForWeek(iso: string): ConquestMap {
  const weeks = Math.round((utcDate(weekStartOf(iso)) - utcDate(SEASON_ANCHOR)) / (7 * DAY_MS));
  if (weeks < 0) return CONQUEST_SEASON[0]; // weeks before the season started were all Kyrgyzstan
  return CONQUEST_SEASON[weeks % CONQUEST_SEASON.length];
}

export const mapById = (mapId: string): ConquestMap => CONQUEST_SEASON.find((m) => m.mapId === mapId) ?? KYRGYZSTAN;

/** Oblasts of the Kyrgyzstan map, most valuable first (kept for older call sites). */
export const OBLASTS: readonly Territory[] = KYRGYZSTAN.territories;

/** Heist roles for the top five of the winning class, best first. */
export const WINNER_ROLES = ['Mastermind', 'Strategist', 'Safecracker', 'Lookout', 'Getaway Driver'] as const;
export type WinnerRole = (typeof WINNER_ROLES)[number];
export const roleForRank = (rank: number): WinnerRole => WINNER_ROLES[Math.min(Math.max(rank, 1), WINNER_ROLES.length) - 1];

export const dayPower = (done: number, size: number) => (size > 0 ? Math.round((100 * Math.min(done, size)) / size) : 0);

/** Weekly power; pass `today` to leave today's results out ("before today"). */
export function weekPower(team: ConquestClass, excludeDate?: string): number {
  return team.days.reduce((sum, day) => (day.date === excludeDate ? sum : sum + dayPower(day.done, team.size)), 0);
}

/** How many territories each class holds, by largest remainder. Ties go to the earlier label. */
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

/** Which class owns each territory: strongest class takes the most valuable ones. Unowned = null. */
export function assignOblasts(powers: Record<string, number>, labels: Record<string, string> = {}, map: ConquestMap = KYRGYZSTAN): Record<string, string | null> {
  const seats = apportion(powers, map.territories.length);
  const order = Object.keys(powers)
    .filter((id) => seats[id] > 0)
    .sort((a, b) => powers[b] - powers[a] || (labels[a] || a).localeCompare(labels[b] || b));
  const owners: Record<string, string | null> = Object.fromEntries(map.territories.map((o) => [o.zoneId, null]));
  let i = 0;
  for (const id of order) for (let k = 0; k < seats[id]; k++) owners[map.territories[i++].zoneId] = id;
  return owners;
}

/**
 * Move from yesterday's map to today's with as few changes as possible:
 * a class over its share gives up its least valuable territories; classes under
 * their share take the freed ones, strongest class first, most valuable first.
 */
export function transition(previous: Record<string, string | null>, seats: Record<string, number>, powers: Record<string, number>, labels: Record<string, string> = {}, map: ConquestMap = KYRGYZSTAN): Record<string, string | null> {
  const valueRank = Object.fromEntries(map.territories.map((o, i) => [o.zoneId, i]));
  const owners: Record<string, string | null> = { ...previous };
  const held = (id: string) => map.territories.filter((o) => owners[o.zoneId] === id);
  for (const id of Object.keys(seats)) {
    const mine = held(id).sort((a, b) => valueRank[b.zoneId] - valueRank[a.zoneId]); // least valuable first
    for (let i = 0; i < mine.length - seats[id]; i++) owners[mine[i].zoneId] = null;
  }
  // Territories owned by classes no longer in the game are freed too.
  for (const o of map.territories) if (owners[o.zoneId] && !(owners[o.zoneId]! in seats)) owners[o.zoneId] = null;
  const free = map.territories.filter((o) => owners[o.zoneId] === null);
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
export function ownersAfter(classes: ConquestClass[], dayIndex: number, map: ConquestMap = KYRGYZSTAN): Record<string, string | null> {
  const labels = Object.fromEntries(classes.map((c) => [c.class_id, c.label]));
  let owners: Record<string, string | null> = Object.fromEntries(map.territories.map((o) => [o.zoneId, null]));
  for (let i = 0; i <= dayIndex; i++) {
    const powers = Object.fromEntries(classes.map((c) => [c.class_id, c.days.slice(0, i + 1).reduce((sum, d) => sum + dayPower(d.done, c.size), 0)]));
    owners = transition(owners, apportion(powers, map.territories.length), powers, labels, map);
  }
  return owners;
}

export interface Capture { zoneId: string; name: string; by: string; from: string | null }

/** Territories that changed hands today. */
export function capturesToday(before: Record<string, string | null>, now: Record<string, string | null>, map: ConquestMap = KYRGYZSTAN): Capture[] {
  return map.territories.filter((o) => now[o.zoneId] && now[o.zoneId] !== before[o.zoneId])
    .map((o) => ({ zoneId: o.zoneId, name: o.name, by: now[o.zoneId] as string, from: before[o.zoneId] }));
}

export interface ConquestView {
  map: ConquestMap;
  powers: Record<string, number>;
  owners: Record<string, string | null>;
  held: Record<string, number>;
  captures: Capture[];
  ranking: string[];
  /** Missions still needed today from my class to hold one more territory (null = not possible today). */
  missionsToNext: number | null;
  /** Power one more mission adds for my class today. */
  powerPerMission: number;
  mine: ConquestClass | null;
  myDoneToday: number;
}

export function buildConquest(classes: ConquestClass[], today: string, map: ConquestMap = mapForWeek(today)): ConquestView {
  const seats = map.territories.length;
  const labels = Object.fromEntries(classes.map((c) => [c.class_id, c.label]));
  const powers = Object.fromEntries(classes.map((c) => [c.class_id, weekPower(c)]));
  const todayIndex = Math.max(0, (classes[0]?.days.findIndex((d) => d.date === today) ?? 0));
  const owners = ownersAfter(classes, todayIndex, map);
  const ownersBefore = todayIndex > 0 ? ownersAfter(classes, todayIndex - 1, map) : Object.fromEntries(map.territories.map((o) => [o.zoneId, null]));
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
      if (apportion(trial, seats)[mine.class_id] > held[mine.class_id]) { missionsToNext = extra; break; }
    }
  }

  return { map, powers, owners, held, captures: capturesToday(ownersBefore, owners, map), ranking, missionsToNext, powerPerMission, mine, myDoneToday };
}

/** Stable, distinct colours per class (alphabetical by label). */
export const CONQUEST_COLORS = ['#22d3ee', '#f97316', '#a855f7', '#22c55e', '#f43f5e', '#eab308', '#3b82f6', '#ec4899'];
export function classColors(classes: ConquestClass[]): Record<string, string> {
  return Object.fromEntries([...classes].sort((a, b) => a.label.localeCompare(b.label)).map((c, i) => [c.class_id, CONQUEST_COLORS[i % CONQUEST_COLORS.length]]));
}

// ───────────────────────────── finished weeks ─────────────────────────────

export interface ConquestStanding { class_id: string; label: string; size: number; power: number; missions: number; rank: number }
export interface ConquestWinner { student_id: string; name: string; avatar_url: string | null; missions: number; correct: number; rank: number }
export interface RaidStanding { class_id: string; label: string; wins: number; raids: number }
export interface ClassTally { class_id: string; label: string; count: number }
/** What happened in the sealed weekend between Friday night and the Monday reveal. */
export interface WeekendSnapshot {
  raids: RaidStanding[];
  raid_champion_class_id: string | null;
  raid_champion_label: string | null;
  predictions: ClassTally[];
  cheers: ClassTally[];
  /** Students who predicted the winner correctly. */
  oracles: number;
}
export interface ConquestResult {
  week_start: string;
  map_id: string;
  grade: string;
  winner_class_id: string | null;
  winner_label: string | null;
  standings: ConquestStanding[];
  top_students: ConquestWinner[];
  weekend?: WeekendSnapshot | null;
}

/** Consecutive wins by the current champion, counting back from the latest week. */
export function winStreak(results: ConquestResult[]): { class_id: string; label: string; weeks: number } | null {
  const sorted = [...results].sort((a, b) => b.week_start.localeCompare(a.week_start));
  const first = sorted[0];
  if (!first?.winner_class_id) return null;
  let weeks = 0;
  for (const r of sorted) { if (r.winner_class_id === first.winner_class_id) weeks++; else break; }
  return { class_id: first.winner_class_id, label: first.winner_label ?? '', weeks };
}

/** Students ranked by how often they finished in the winning top five; Mastermind (#1) finishes break ties. */
export function allTimeMasterminds(results: ConquestResult[]): Array<{ student_id: string; name: string; avatar_url: string | null; podiums: number; firsts: number }> {
  const totals = new Map<string, { student_id: string; name: string; avatar_url: string | null; podiums: number; firsts: number }>();
  for (const r of results) for (const s of r.top_students) {
    const entry = totals.get(s.student_id) ?? { student_id: s.student_id, name: s.name, avatar_url: s.avatar_url, podiums: 0, firsts: 0 };
    entry.podiums += 1;
    if (s.rank === 1) entry.firsts += 1;
    totals.set(s.student_id, entry);
  }
  return [...totals.values()].sort((a, b) => b.podiums - a.podiums || b.firsts - a.firsts || a.name.localeCompare(b.name));
}
