/** Presentation events only: never mutate combatants or formation coordinates. */
export type CommanderIntroEvent = { at: number; team?: string; unitId?: string; label?: string; cue?: 'team' | 'deploy' | 'countdown' | 'battleStart'; done?: boolean };
export function buildCommanderIntroTimeline(units: readonly { id: string; side: string }[], reducedMotion = false): CommanderIntroEvent[] {
  const events: CommanderIntroEvent[] = [];
  let at = reducedMotion ? 100 : 450;
  const teams = [...new Set(units.map(unit => unit.side))];
  for (const team of teams) {
    events.push({ at, team, cue: 'team' });
    at += reducedMotion ? 100 : 300;
    const members = units.filter(unit => unit.side === team);
    const stagger = reducedMotion ? 0 : Math.min(180, 900 / Math.max(1, members.length));
    for (const member of members) {
      events.push({ at, team, unitId: member.id, cue: 'deploy' });
      at += stagger;
    }
    at += reducedMotion ? 150 : 450;
  }
  events.push({ at, label: '', team: '' });
  at += reducedMotion ? 100 : 300;
  for (const label of ['3', '2', '1', 'BATTLE!']) {
    events.push({ at, label, cue: label === 'BATTLE!' ? 'battleStart' : 'countdown' });
    at += reducedMotion ? 150 : label === 'BATTLE!' ? 450 : 500;
  }
  events.push({ at, done: true });
  return events;
}
