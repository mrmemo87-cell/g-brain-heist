import {
  buildOwnedPracticeBattle,
  type PracticeBattleState,
  type PracticeCombatant,
  type PracticeEvent,
  type PracticeEventCode,
  type PracticeMasterySchool,
  type PracticeMove,
  type PracticePower,
  type PracticeSchoolMastery,
  type PracticeSide,
  type PracticeTurnIntent,
} from "../commander_practice/engine.ts";

export type CommanderPvpBattleState = PracticeBattleState & {
  enemyTactics: { bolt: number; focus: number; guard: number; shieldCap: number };
  enemyPowers: PracticePower[];
  enemySchoolMastery?: PracticeSchoolMastery;
  enemyLoadoutLabel?: string;
  enemyLoadoutVersion?: number;
};

const POWER_ORDER: PracticePower[] = ["death_bolt", "chain_surge", "rot_miasma", "raise_dead"];
const POWER_MOVES = new Set<PracticeMove>(POWER_ORDER);
const MAX_EVENTS = 24;

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const hash32 = (input: string) => {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
};

const roll = (state: CommanderPvpBattleState, label: string, maxExclusive: number) => {
  if (maxExclusive <= 1) return 0;
  return hash32(`${state.seed}:${state.turn}:${label}`) % maxExclusive;
};

const pushEvent = (
  state: CommanderPvpBattleState,
  event: Omit<PracticeEvent, "id" | "turn"> & { idSuffix?: string },
) => {
  const { idSuffix = "event", ...payload } = event;
  state.events.push({
    id: `${state.turn}:${payload.code}:${idSuffix}:${state.events.length}`,
    turn: state.turn,
    ...payload,
  });
  if (state.events.length > MAX_EVENTS) {
    state.events.splice(0, state.events.length - MAX_EVENTS);
  }
};

const living = (state: CommanderPvpBattleState, side: PracticeSide) =>
  state.combatants.filter((combatant) => combatant.side === side && combatant.hp > 0);

const commander = (state: CommanderPvpBattleState, side: PracticeSide) =>
  state.combatants.find((combatant) => combatant.side === side && combatant.role === "commander") ?? null;

const findCombatant = (state: CommanderPvpBattleState, id: string | null | undefined) =>
  id ? state.combatants.find((combatant) => combatant.id === id) ?? null : null;

const tacticsFor = (state: CommanderPvpBattleState, side: PracticeSide) =>
  side === "player"
    ? state.playerTactics ?? { bolt: 26, focus: 7, guard: 18, shieldCap: 30 }
    : state.enemyTactics;

const powersFor = (state: CommanderPvpBattleState, side: PracticeSide): PracticePower[] => {
  const configured = side === "player" ? state.playerPowers : state.enemyPowers;
  const valid = configured?.filter((power): power is PracticePower => POWER_ORDER.includes(power));
  return valid?.length ? valid : ["death_bolt"];
};

const masteryFor = (
  state: CommanderPvpBattleState,
  side: PracticeSide,
  school: PracticeMasterySchool,
) => clamp(Math.trunc(
  side === "player"
    ? state.playerSchoolMastery?.[school] ?? 0
    : state.enemySchoolMastery?.[school] ?? 0,
), 0, 3);

const focusFor = (state: CommanderPvpBattleState, side: PracticeSide) =>
  side === "player" ? state.playerFocusTarget : state.enemyFocusTarget;

const setFocus = (state: CommanderPvpBattleState, side: PracticeSide, targetId: string | null) => {
  if (side === "player") state.playerFocusTarget = targetId;
  else state.enemyFocusTarget = targetId;
};

const cooldownFor = (state: CommanderPvpBattleState, side: PracticeSide) =>
  side === "player" ? state.playerDeathBoltCooldown : state.enemyDeathBoltCooldown;

const setCooldown = (state: CommanderPvpBattleState, side: PracticeSide, rounds: number) => {
  if (side === "player") state.playerDeathBoltCooldown = rounds;
  else state.enemyDeathBoltCooldown = rounds;
};

const enemySide = (side: PracticeSide): PracticeSide => side === "player" ? "enemy" : "player";

const isDefeated = (state: CommanderPvpBattleState, side: PracticeSide) => {
  const leader = commander(state, side);
  return !leader || leader.hp <= 0 || living(state, side).length === 0;
};

const applyDamage = (
  state: CommanderPvpBattleState,
  actor: PracticeCombatant,
  target: PracticeCombatant,
  amount: number,
  code: Extract<PracticeEventCode, "death_bolt" | "chain_surge" | "rot_miasma" | "unit_attack" | "focus_target">,
) => {
  const requested = Math.max(0, Math.round(amount));
  const absorbed = Math.min(target.shield, requested);
  if (absorbed > 0) {
    target.shield -= absorbed;
    pushEvent(state, {
      side: target.side,
      code: "shield_absorb",
      actorName: target.name,
      amount: absorbed,
      idSuffix: `${target.id}:${absorbed}`,
    });
  }

  const hpDamage = requested - absorbed;
  if (hpDamage > 0) target.hp = clamp(target.hp - hpDamage, 0, target.maxHp);

  pushEvent(state, {
    side: actor.side,
    code,
    actorName: actor.name,
    targetName: target.name,
    amount: requested,
    idSuffix: `${actor.id}:${target.id}:${requested}`,
  });

  if (target.hp <= 0) {
    pushEvent(state, {
      side: target.side,
      code: "combatant_defeated",
      actorName: target.name,
      idSuffix: target.id,
    });
  }
};

const resolveOutcome = (state: CommanderPvpBattleState) => {
  const playerDefeated = isDefeated(state, "player");
  const enemyDefeated = isDefeated(state, "enemy");
  if (playerDefeated && enemyDefeated) {
    state.status = "draw";
    pushEvent(state, { side: "system", code: "battle_draw", idSuffix: "simultaneous" });
    return true;
  }
  if (enemyDefeated) {
    state.status = "victory";
    pushEvent(state, { side: "system", code: "battle_victory", idSuffix: "enemy" });
    return true;
  }
  if (playerDefeated) {
    state.status = "defeat";
    pushEvent(state, { side: "system", code: "battle_defeat", idSuffix: "player" });
    return true;
  }
  return false;
};

const resolveTurnLimit = (state: CommanderPvpBattleState) => {
  if (state.turn < state.maxTurns) return false;
  const score = (side: PracticeSide) => state.combatants
    .filter((combatant) => combatant.side === side)
    .reduce((sum, combatant) => sum + combatant.hp + Math.floor(combatant.shield / 2), 0);
  const player = score("player");
  const enemy = score("enemy");
  state.status = player === enemy ? "draw" : player > enemy ? "victory" : "defeat";
  pushEvent(state, {
    side: "system",
    code: state.status === "draw" ? "battle_draw" : state.status === "victory" ? "battle_victory" : "battle_defeat",
    idSuffix: "turn-limit",
  });
  return true;
};

const requireTarget = (
  state: CommanderPvpBattleState,
  targetId: string | null | undefined,
  side: PracticeSide,
) => {
  const target = findCombatant(state, targetId);
  if (!target || target.side !== side || target.hp <= 0) throw new Error("invalid_target");
  return target;
};

const performFocus = (
  state: CommanderPvpBattleState,
  side: PracticeSide,
  actor: PracticeCombatant,
  target: PracticeCombatant,
) => {
  setFocus(state, side, target.id);
  pushEvent(state, {
    side,
    code: "focus_target",
    actorName: actor.name,
    targetName: target.name,
    idSuffix: target.id,
  });
  applyDamage(state, actor, target, tacticsFor(state, side).focus, "focus_target");
};

const performGuard = (
  state: CommanderPvpBattleState,
  side: PracticeSide,
  actor: PracticeCombatant,
) => {
  const tactics = tacticsFor(state, side);
  const gained = Math.max(0, Math.min(tactics.shieldCap - actor.shield, tactics.guard));
  actor.shield += gained;
  pushEvent(state, {
    side,
    code: "guard",
    actorName: actor.name,
    amount: gained,
    idSuffix: actor.id,
  });
};

const performDeathBolt = (
  state: CommanderPvpBattleState,
  side: PracticeSide,
  actor: PracticeCombatant,
  target: PracticeCombatant,
) => {
  const focused = focusFor(state, side) === target.id;
  applyDamage(
    state,
    actor,
    target,
    tacticsFor(state, side).bolt + (focused ? 8 : 0) + masteryFor(state, side, "void") * 3,
    "death_bolt",
  );
  setCooldown(state, side, 2);
  if (focused) setFocus(state, side, null);
};

const performChainSurge = (
  state: CommanderPvpBattleState,
  side: PracticeSide,
  actor: PracticeCombatant,
  target: PracticeCombatant,
) => {
  const focused = focusFor(state, side) === target.id;
  const stormRank = masteryFor(state, side, "storm");
  const primary = Math.max(12, Math.round(tacticsFor(state, side).bolt * 0.68)) + (focused ? 5 : 0) + stormRank * 2;
  applyDamage(state, actor, target, primary, "chain_surge");
  const remaining = living(state, enemySide(side)).filter((candidate) => candidate.id !== target.id);
  if (remaining.length > 0) {
    const secondary = remaining[roll(state, `${side}:chain:${target.id}`, remaining.length)];
    applyDamage(state, actor, secondary, Math.max(7, Math.round(primary * 0.55)) + stormRank, "chain_surge");
  }
  setCooldown(state, side, 3);
  if (focused) setFocus(state, side, null);
};

const performRotMiasma = (
  state: CommanderPvpBattleState,
  side: PracticeSide,
  actor: PracticeCombatant,
  target: PracticeCombatant,
) => {
  const tactics = tacticsFor(state, side);
  const pulse = Math.max(6, Math.round(tactics.focus * 0.75 + tactics.bolt * 0.12)) + masteryFor(state, side, "rot");
  const focused = focusFor(state, side) === target.id;
  for (const enemy of living(state, enemySide(side))) {
    const selectedBonus = enemy.id === target.id ? 4 : 0;
    const focusBonus = focused && enemy.id === target.id ? 3 : 0;
    applyDamage(state, actor, enemy, pulse + selectedBonus + focusBonus, "rot_miasma");
  }
  setCooldown(state, side, 3);
};

const performRaiseDead = (
  state: CommanderPvpBattleState,
  side: PracticeSide,
  actor: PracticeCombatant,
  failIfHealthy = true,
) => {
  const graveRank = masteryFor(state, side, "grave");
  const fallen = state.combatants.find(
    (combatant) => combatant.side === side && combatant.role === "unit" && combatant.hp <= 0,
  );
  if (fallen) {
    const restored = Math.max(1, Math.round(fallen.maxHp * (0.35 + graveRank * 0.03)));
    fallen.hp = Math.min(fallen.maxHp, restored);
    fallen.shield = 0;
    pushEvent(state, {
      side,
      code: "raise_dead",
      actorName: actor.name,
      targetName: fallen.name,
      amount: fallen.hp,
      idSuffix: `${fallen.id}:revive`,
    });
    setCooldown(state, side, 3);
    return true;
  }

  const wounded = state.combatants
    .filter((combatant) => combatant.side === side && combatant.role === "unit" && combatant.hp > 0 && combatant.hp < combatant.maxHp)
    .sort((a, b) => (a.hp / a.maxHp) - (b.hp / b.maxHp))[0];
  if (!wounded) {
    if (failIfHealthy) throw new Error("raise_dead_no_valid_target");
    return false;
  }

  const healCap = Math.max(12, Math.round(tacticsFor(state, side).guard * 0.75)) + graveRank * 2;
  const restored = Math.min(healCap, wounded.maxHp - wounded.hp);
  wounded.hp += restored;
  pushEvent(state, {
    side,
    code: "raise_dead",
    actorName: actor.name,
    targetName: wounded.name,
    amount: restored,
    idSuffix: `${wounded.id}:mend`,
  });
  setCooldown(state, side, 3);
  return true;
};

const performPower = (
  state: CommanderPvpBattleState,
  side: PracticeSide,
  actor: PracticeCombatant,
  power: PracticePower,
  target: PracticeCombatant | null,
  failIfHealthy = true,
) => {
  if (!powersFor(state, side).includes(power)) throw new Error("commander_power_locked");
  if (cooldownFor(state, side) > 0) throw new Error(power === "death_bolt" ? "death_bolt_on_cooldown" : "commander_power_on_cooldown");
  if (power === "raise_dead") return performRaiseDead(state, side, actor, failIfHealthy);
  if (!target) throw new Error("invalid_target");
  if (power === "death_bolt") performDeathBolt(state, side, actor, target);
  else if (power === "chain_surge") performChainSurge(state, side, actor, target);
  else performRotMiasma(state, side, actor, target);
  return true;
};

const performPlayerMove = (state: CommanderPvpBattleState, intent: PracticeTurnIntent) => {
  const actor = commander(state, "player");
  if (!actor || actor.hp <= 0) throw new Error("player_commander_unavailable");

  if (intent.move === "guard") {
    performGuard(state, "player", actor);
    return;
  }
  if (intent.move === "raise_dead") {
    performPower(state, "player", actor, intent.move, null);
    return;
  }

  const target = requireTarget(state, intent.targetId, "enemy");
  if (intent.move === "focus_target") {
    performFocus(state, "player", actor, target);
    return;
  }
  if (!POWER_MOVES.has(intent.move)) throw new Error("invalid_move");
  performPower(state, "player", actor, intent.move as PracticePower, target);
};

const performUnitAttacks = (
  state: CommanderPvpBattleState,
  side: PracticeSide,
  targetSide: PracticeSide,
  preferredTargetId: string | null,
) => {
  for (const unit of living(state, side).filter((combatant) => combatant.role === "unit")) {
    const targets = living(state, targetSide);
    if (!targets.length) break;
    const preferred = targets.find((target) => target.id === preferredTargetId);
    const target = preferred ?? targets[roll(state, `${side}:${unit.id}:target`, targets.length)];
    applyDamage(state, unit, target, unit.attack + roll(state, `${side}:${unit.id}:damage`, 4), "unit_attack");
    if (resolveOutcome(state)) break;
  }
};

const performEnemyCommanderMove = (state: CommanderPvpBattleState) => {
  const actor = commander(state, "enemy");
  const targets = living(state, "player");
  if (!actor || actor.hp <= 0 || !targets.length) return;

  const preferred = targets.find((target) => target.id === state.enemyFocusTarget);
  const target = preferred ?? targets[roll(state, "enemy:commander:target", targets.length)];
  const decision = roll(state, "enemy:commander:move", 100);
  const powers = powersFor(state, "enemy");

  if (cooldownFor(state, "enemy") === 0 && powers.includes("raise_dead") && decision < 20) {
    if (performRaiseDead(state, "enemy", actor, false)) return;
  }

  if (cooldownFor(state, "enemy") === 0 && decision < 48) {
    const offensive = powers.filter((power) => power !== "raise_dead");
    const power = offensive[roll(state, "enemy:commander:power", offensive.length)] ?? "death_bolt";
    performPower(state, "enemy", actor, power, target, false);
    return;
  }

  if (decision < 68) {
    performGuard(state, "enemy", actor);
    return;
  }

  performFocus(state, "enemy", actor, target);
};

export const applyCommanderPvpTurn = (
  currentState: CommanderPvpBattleState,
  intent: PracticeTurnIntent,
): CommanderPvpBattleState => {
  if (currentState.version !== 1) throw new Error("unsupported_battle_version");
  if (currentState.status !== "active") throw new Error("battle_finished");
  if (currentState.turn < 1 || currentState.turn > currentState.maxTurns) throw new Error("invalid_turn");
  if (POWER_MOVES.has(intent.move) && currentState.playerDeathBoltCooldown > 0) {
    throw new Error(intent.move === "death_bolt" ? "death_bolt_on_cooldown" : "commander_power_on_cooldown");
  }

  const state = clone(currentState);
  state.playerDeathBoltCooldown = Math.max(0, state.playerDeathBoltCooldown - 1);
  state.enemyDeathBoltCooldown = Math.max(0, state.enemyDeathBoltCooldown - 1);

  performPlayerMove(state, intent);
  if (resolveOutcome(state)) return state;

  const preferredEnemyTarget = intent.move === "guard" || intent.move === "raise_dead"
    ? state.playerFocusTarget
    : (intent.targetId ?? state.playerFocusTarget);
  performUnitAttacks(state, "player", "enemy", preferredEnemyTarget ?? null);
  if (state.status !== "active") return state;

  performEnemyCommanderMove(state);
  if (resolveOutcome(state)) return state;

  performUnitAttacks(state, "enemy", "player", state.enemyFocusTarget);
  if (state.status !== "active") return state;

  if (resolveTurnLimit(state)) return state;
  state.turn += 1;
  return state;
};

const renameDefenderCombatant = (combatant: PracticeCombatant, defenderUsername: string) => {
  if (combatant.role === "commander") return `${defenderUsername}'s Commander`;
  return `Rival ${combatant.name}`;
};

/**
 * Builds PvP from two trusted server loadouts. Both armies keep their real Commander
 * tactics, recruit stats, schools, School Mastery and unlocked powers; only the defender is AI-driven.
 */
export const buildCommanderPvpBattle = (
  seed: number,
  attackerLoadout: unknown,
  defenderLoadout: unknown,
  defenderUsername = "Rival",
): CommanderPvpBattleState => {
  const attacker = buildOwnedPracticeBattle(seed, attackerLoadout);
  const defender = buildOwnedPracticeBattle(seed ^ 0x9e3779b9, defenderLoadout);
  if (!attacker.playerTactics || !defender.playerTactics) throw new Error("invalid_owned_loadout");

  const state = clone(attacker) as CommanderPvpBattleState;
  const sourceById = new Map(defender.combatants.filter((unit) => unit.side === "player").map((unit) => [unit.id, unit]));
  const mapping: Record<string, string> = {
    enemy_commander: "player_commander",
    enemy_guard: "player_guard",
    enemy_archer: "player_archer",
  };

  for (const target of state.combatants.filter((unit) => unit.side === "enemy")) {
    const source = sourceById.get(mapping[target.id]);
    if (!source) throw new Error("invalid_owned_loadout");
    target.name = renameDefenderCombatant(source, defenderUsername);
    target.hp = source.hp;
    target.maxHp = source.maxHp;
    target.shield = source.shield;
    target.maxShield = source.maxShield;
    target.attack = source.attack;
    target.school = source.school;
    target.catalogId = source.catalogId;
  }

  state.enemyTactics = clone(defender.playerTactics);
  state.enemyPowers = [...(defender.playerPowers ?? ["death_bolt"])];
  state.enemySchoolMastery = defender.playerSchoolMastery ? clone(defender.playerSchoolMastery) : undefined;
  state.enemyLoadoutLabel = defender.loadoutLabel;
  state.enemyLoadoutVersion = defender.loadoutVersion;
  state.maxTurns = 12;
  return state;
};
