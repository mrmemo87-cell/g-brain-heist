// Maps the game's existing sound cues to phone vibrations, so every correct answer, mistake, reward and
// battle hit is felt as well as heard in the app (IELTS Visual & UX Bible §14). No-op on the website.

import { haptic, type HapticCue } from './haptics';

const BY_CUE: Record<string, HapticCue> = {
  // Quest mode and general game sounds
  correct: 'correct', wrong: 'wrong', hack_fail: 'wrong',
  win: 'celebrate', chestOpen: 'reward', spin: 'select', riddleAppear: 'select', avatarMove: 'select',
  buy: 'reward', collect: 'reward', activate: 'heavy',
  hack_win: 'celebrate', level_up: 'celebrate', achievement: 'celebrate', tada: 'celebrate',
  // Commander battles
  hit: 'hit', shieldHit: 'hit', meleeWindup: 'select', rangedFire: 'hit', deathBoltImpact: 'heavy',
  ko: 'heavy', battleStart: 'heavy', victory: 'celebrate', defeat: 'wrong', draw: 'reward',
};

export function feelGameCue(cue: string): void {
  const kind = BY_CUE[cue];
  if (kind) void haptic(kind);
}
