// Shared arena rules: fighters, unlocks and rewards. Pure data so tests and the UI agree with the server.

export type FighterId = 'rivet' | 'fizz' | 'vex' | 'boulder';

export interface FighterSpec {
  id: FighterId;
  name: string;
  role: string;
  subject: string;
  hp: number;
  speed: number;
  attack: 'spread' | 'bolt' | 'lob';
  pellets?: number;
  spread?: number;
  range: number;
  bulletSpeed?: number;
  dmg: number;
  splash?: number;
  reload: number;
  fireGap: number;
  superCost: number;
  sup: 'dash' | 'cloud' | 'rail' | 'fortify';
  superName: string;
  prefDist: number;
  color: string;
  dark: string;
  unlock: number;
}

export const FIGHTERS: Record<FighterId, FighterSpec> = {
  rivet: { id: 'rivet', name: 'Rivet', role: 'Brawler', subject: 'English', hp: 3800, speed: 180, attack: 'spread', pellets: 5, spread: 0.55, range: 310, bulletSpeed: 720, dmg: 290, reload: 1.35, fireGap: 0.38, superCost: 3000, sup: 'dash', superName: 'Turbo Ram', prefDist: 170, color: '#e8833a', dark: '#9c4f1c', unlock: 0 },
  fizz: { id: 'fizz', name: 'Fizz', role: 'Thrower', subject: 'Chemistry', hp: 2900, speed: 172, attack: 'lob', range: 340, dmg: 1000, splash: 74, reload: 1.6, fireGap: 0.5, superCost: 2800, sup: 'cloud', superName: 'Soda Storm', prefDist: 280, color: '#7fd34e', dark: '#3f8a22', unlock: 0 },
  vex: { id: 'vex', name: 'Vex', role: 'Sharpshooter', subject: 'Maths & Physics', hp: 2500, speed: 172, attack: 'bolt', range: 540, bulletSpeed: 1150, dmg: 1250, reload: 1.55, fireGap: 0.5, superCost: 3300, sup: 'rail', superName: 'Overcharge', prefDist: 400, color: '#b38cff', dark: '#6a46c2', unlock: 40 },
  boulder: { id: 'boulder', name: 'Boulder', role: 'Tank', subject: 'Biology', hp: 5600, speed: 162, attack: 'spread', pellets: 3, spread: 0.8, range: 195, bulletSpeed: 620, dmg: 540, reload: 1.15, fireGap: 0.4, superCost: 3000, sup: 'fortify', superName: 'Iron Shell', prefDist: 110, color: '#c9b38a', dark: '#7d6a47', unlock: 100 },
};

export const FIGHTER_IDS: FighterId[] = ['rivet', 'fizz', 'vex', 'boulder'];

export const TROPHY_ROAD = [
  { trophies: 0, label: 'Rivet + Fizz' },
  { trophies: 40, label: 'Vex' },
  { trophies: 100, label: 'Boulder' },
  { trophies: 200, label: 'Gold name' },
  { trophies: 300, label: 'Legend' },
];

/** Each power level adds 8% health and damage. Level 5 is 32% stronger than level 1. */
export const powerMultiplier = (power: number) => 1 + 0.08 * (Math.max(1, Math.min(5, power)) - 1);

export const WIN_SCORE = 100;
export const MATCH_SECONDS = 150;

export interface ArenaFighterStatus { id: FighterId; power: number; attempts: number; correct: number; unlocked: boolean }

export interface ArenaStatus {
  available: boolean;
  reason: string | null;
  open_now?: boolean;
  assignment_blocked?: boolean;
  window_start?: string;
  window_end?: string;
  weekend_all_day?: boolean;
  daily_cap?: number;
  played_today?: number;
  tickets?: number;
  trophies?: number;
  fighters?: ArenaFighterStatus[];
  today?: string;
}

export interface ArenaMatchTicket { match_id: string; fighter: FighterId; power: number; bot_power: number; tickets: number }

export interface ArenaRespawnQuestion {
  available: boolean;
  prompt_id?: string;
  question_id?: string;
  text?: string;
  options?: string[];
  fighter?: FighterId;
}

export interface ArenaMatchResult {
  result: 'win' | 'loss' | 'draw';
  paid: boolean;
  trophies_delta: number;
  trophies: number;
  xp: number;
  gems: number;
  unlocked: FighterId[];
  played_today: number;
  daily_cap: number;
  repeated?: boolean;
}

export interface ArenaMatchOutcome { scoreMine: number; scoreTheirs: number; mvp: boolean; kills: number; deaths: number; damage: number }

/** Why a student cannot start right now, in a form the UI can translate. */
export type ArenaBlock = 'school_off' | 'class_off' | 'window' | 'assignment' | 'cap' | 'tickets' | null;

export function arenaBlock(status: ArenaStatus | null): ArenaBlock {
  if (!status || !status.available) return status?.reason === 'class_off' ? 'class_off' : 'school_off';
  if (status.open_now === false) return 'window';
  if (status.assignment_blocked) return 'assignment';
  if ((status.played_today ?? 0) >= (status.daily_cap ?? 0)) return 'cap';
  if ((status.tickets ?? 0) < 1) return 'tickets';
  return null;
}
