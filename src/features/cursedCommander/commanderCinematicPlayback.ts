import type {
  CommanderPracticeCombatant,
  CommanderPracticeEvent,
} from '../../../services/commanderPracticeService';

export type CommanderCinematicStepKind =
  | 'focus_lock'
  | 'attack'
  | 'guard'
  | 'defeat'
  | 'outcome'
  | 'status';

export type CommanderCinematicStep = {
  id: string;
  kind: CommanderCinematicStepKind;
  event: CommanderPracticeEvent;
  shieldDamage: number;
  hpDamage: number;
};

const isAttack = (event: CommanderPracticeEvent) =>
  (event.code === 'focus_target' && (event.amount ?? 0) > 0)
  || event.code === 'death_bolt'
  || event.code === 'unit_attack';

const isOutcome = (event: CommanderPracticeEvent) =>
  event.code === 'battle_victory'
  || event.code === 'battle_defeat'
  || event.code === 'battle_draw';

export const buildCommanderCinematicSteps = (
  events: CommanderPracticeEvent[],
): CommanderCinematicStep[] => {
  const pendingShieldByTarget = new Map<string, number>();
  const orphanShieldEvents: CommanderPracticeEvent[] = [];
  const steps: CommanderCinematicStep[] = [];

  for (const event of events) {
    if (event.code === 'battle_started') continue;

    if (event.code === 'shield_absorb') {
      if (event.actorName) {
        pendingShieldByTarget.set(
          event.actorName,
          (pendingShieldByTarget.get(event.actorName) ?? 0) + Math.max(0, event.amount ?? 0),
        );
      } else {
        orphanShieldEvents.push(event);
      }
      continue;
    }

    if (event.code === 'focus_target' && (event.amount ?? 0) === 0) {
      steps.push({ id: event.id, kind: 'focus_lock', event, shieldDamage: 0, hpDamage: 0 });
      continue;
    }

    if (isAttack(event)) {
      const requestedDamage = Math.max(0, event.amount ?? 0);
      const shieldDamage = event.targetName
        ? Math.min(requestedDamage, pendingShieldByTarget.get(event.targetName) ?? 0)
        : 0;
      if (event.targetName) pendingShieldByTarget.delete(event.targetName);
      steps.push({
        id: event.id,
        kind: 'attack',
        event,
        shieldDamage,
        hpDamage: Math.max(0, requestedDamage - shieldDamage),
      });
      continue;
    }

    if (event.code === 'guard') {
      steps.push({ id: event.id, kind: 'guard', event, shieldDamage: 0, hpDamage: 0 });
      continue;
    }

    if (event.code === 'combatant_defeated') {
      steps.push({ id: event.id, kind: 'defeat', event, shieldDamage: 0, hpDamage: 0 });
      continue;
    }

    if (isOutcome(event)) {
      steps.push({ id: event.id, kind: 'outcome', event, shieldDamage: 0, hpDamage: 0 });
      continue;
    }

    steps.push({ id: event.id, kind: 'status', event, shieldDamage: 0, hpDamage: 0 });
  }

  for (const event of orphanShieldEvents) {
    steps.push({ id: event.id, kind: 'status', event, shieldDamage: Math.max(0, event.amount ?? 0), hpDamage: 0 });
  }

  return steps;
};

const updateCombatant = (
  combatants: CommanderPracticeCombatant[],
  name: string | undefined,
  update: (combatant: CommanderPracticeCombatant) => CommanderPracticeCombatant,
) => combatants.map((combatant) => (
  name && combatant.name === name ? update(combatant) : combatant
));

export const applyCommanderCinematicStep = (
  combatants: CommanderPracticeCombatant[],
  step: CommanderCinematicStep,
): CommanderPracticeCombatant[] => {
  if (step.kind === 'attack') {
    return updateCombatant(combatants, step.event.targetName, (combatant) => ({
      ...combatant,
      shield: Math.max(0, combatant.shield - step.shieldDamage),
      hp: Math.max(0, combatant.hp - step.hpDamage),
    }));
  }

  if (step.kind === 'guard') {
    return updateCombatant(combatants, step.event.actorName, (combatant) => ({
      ...combatant,
      shield: Math.max(0, combatant.shield + Math.max(0, step.event.amount ?? 0)),
    }));
  }

  if (step.kind === 'defeat') {
    return updateCombatant(combatants, step.event.actorName, (combatant) => ({
      ...combatant,
      hp: 0,
    }));
  }

  if (step.shieldDamage > 0) {
    return updateCombatant(combatants, step.event.actorName, (combatant) => ({
      ...combatant,
      shield: Math.max(0, combatant.shield - step.shieldDamage),
    }));
  }

  return combatants;
};

export const cloneCommanderCombatants = (combatants: CommanderPracticeCombatant[]) =>
  combatants.map((combatant) => ({ ...combatant }));
