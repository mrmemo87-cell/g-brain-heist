export type PracticeSide = "player" | "enemy";
export type PracticeStatus = "active" | "victory" | "defeat" | "draw";
export type PracticeMove = "focus_target" | "death_bolt" | "guard";
export type PracticeRole = "commander" | "unit";

export type PracticeCombatant = {
  id: string;
  side: PracticeSide;
  role: PracticeRole;
  name: string;
  hp: number;
  maxHp: number;
  shield: number;
  attack: number;
};

export type PracticeEventCode =
  | "battle_started"
  | "focus_target"
  | "death_bolt"
  | "guard"
  | "unit_attack"
  | "shield_absorb"
  | "combatant_defeated"
  | "battle_victory"
  | "battle_defeat"
  | "battle_draw";

export type PracticeEvent = {
  id: string;
  turn: number;
  side: PracticeSide | "system";
  code: PracticeEventCode;
  actorName?: string;
  targetName?: string;
  amount?: number;
};

export type PracticeBattleState = {
  version: 1;
  seed: number;
  turn: number;
  maxTurns: number;
  status: PracticeStatus;
  playerFocusTarget: string | null;
  enemyFocusTarget: string | null;
  playerDeathBoltCooldown: number;
  enemyDeathBoltCooldown: number;
  combatants: PracticeCombatant[];
  events: PracticeEvent[];
};

export type PracticeTurnIntent = {
  move: PracticeMove;
  targetId?: string | null;
};

const MAX_EVENTS = 24;

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

const hash32 = (input: string) => {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
};

const roll = (state: PracticeBattleState, label: string, maxExclusive: number) => {
  if (maxExclusive <= 1) return 0;
  return hash32(`${state.seed}:${state.turn}:${label}`) % maxExclusive;
};

const eventId = (state: PracticeBattleState, code: PracticeEventCode, suffix: string) =>
  `${state.turn}:${code}:${suffix}:${state.events.length}`;

const pushEvent = (
  state: PracticeBattleState,
  event: Omit<PracticeEvent, "id" | "turn"> & { idSuffix?: string },
) => {
  const { idSuffix = "event", ...payload } = event;
  state.events.push({
    id: eventId(state, payload.code, idSuffix),
    turn: state.turn,
    ...payload,
  });
  if (state.events.length > MAX_EVENTS) {
    state.events.splice(0, state.events.length - MAX_EVENTS);
  }
};

const living = (state: PracticeBattleState, side: PracticeSide) =>
  state.combatants.filter((combatant) => combatant.side === side && combatant.hp > 0);

const findCombatant = (state: PracticeBattleState, id: string | null | undefined) =>
  id ? state.combatants.find((combatant) => combatant.id === id) ?? null : null;

const commander = (state: PracticeBattleState, side: PracticeSide) =>
  state.combatants.find(
    (combatant) => combatant.side === side && combatant.role === "commander",
  ) ?? null;

const isBattleSideDefeated = (state: PracticeBattleState, side: PracticeSide) => {
  const sideCommander = commander(state, side);
  return !sideCommander || sideCommander.hp <= 0 || living(state, side).length === 0;
};

const applyDamage = (
  state: PracticeBattleState,
  actor: PracticeCombatant,
  target: PracticeCombatant,
  amount: number,
  attackCode: "death_bolt" | "unit_attack" | "focus_target",
) => {
  const requestedDamage = Math.max(0, Math.round(amount));
  const absorbed = Math.min(target.shield, requestedDamage);
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

  const hpDamage = requestedDamage - absorbed;
  if (hpDamage > 0) {
    target.hp = clamp(target.hp - hpDamage, 0, target.maxHp);
  }

  pushEvent(state, {
    side: actor.side,
    code: attackCode,
    actorName: actor.name,
    targetName: target.name,
    amount: requestedDamage,
    idSuffix: `${actor.id}:${target.id}:${requestedDamage}`,
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

const resolveOutcome = (state: PracticeBattleState) => {
  const playerDefeated = isBattleSideDefeated(state, "player");
  const enemyDefeated = isBattleSideDefeated(state, "enemy");

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

const sideScore = (state: PracticeBattleState, side: PracticeSide) =>
  state.combatants
    .filter((combatant) => combatant.side === side)
    .reduce((sum, combatant) => sum + combatant.hp + Math.floor(combatant.shield / 2), 0);

const resolveTurnLimit = (state: PracticeBattleState) => {
  if (state.turn < state.maxTurns) return false;

  const playerScore = sideScore(state, "player");
  const enemyScore = sideScore(state, "enemy");
  if (playerScore === enemyScore) {
    state.status = "draw";
    pushEvent(state, { side: "system", code: "battle_draw", idSuffix: "turn-limit" });
  } else if (playerScore > enemyScore) {
    state.status = "victory";
    pushEvent(state, { side: "system", code: "battle_victory", idSuffix: "turn-limit" });
  } else {
    state.status = "defeat";
    pushEvent(state, { side: "system", code: "battle_defeat", idSuffix: "turn-limit" });
  }
  return true;
};

const requireTarget = (
  state: PracticeBattleState,
  targetId: string | null | undefined,
  expectedSide: PracticeSide,
) => {
  const target = findCombatant(state, targetId);
  if (!target || target.side !== expectedSide || target.hp <= 0) {
    throw new Error("invalid_target");
  }
  return target;
};

const performPlayerMove = (state: PracticeBattleState, intent: PracticeTurnIntent) => {
  const playerCommander = commander(state, "player");
  if (!playerCommander || playerCommander.hp <= 0) throw new Error("player_commander_unavailable");

  if (intent.move === "guard") {
    const gained = Math.min(30 - playerCommander.shield, 18);
    playerCommander.shield += Math.max(0, gained);
    pushEvent(state, {
      side: "player",
      code: "guard",
      actorName: playerCommander.name,
      amount: Math.max(0, gained),
      idSuffix: playerCommander.id,
    });
    return;
  }

  const target = requireTarget(state, intent.targetId, "enemy");

  if (intent.move === "focus_target") {
    state.playerFocusTarget = target.id;
    pushEvent(state, {
      side: "player",
      code: "focus_target",
      actorName: playerCommander.name,
      targetName: target.name,
      idSuffix: target.id,
    });
    applyDamage(state, playerCommander, target, 7, "focus_target");
    return;
  }

  if (intent.move === "death_bolt") {
    if (state.playerDeathBoltCooldown > 0) throw new Error("death_bolt_on_cooldown");
    const focused = state.playerFocusTarget === target.id;
    applyDamage(state, playerCommander, target, 26 + (focused ? 8 : 0), "death_bolt");
    state.playerDeathBoltCooldown = 2;
    if (focused) state.playerFocusTarget = null;
    return;
  }

  throw new Error("invalid_move");
};

const performAutomaticUnitAttacks = (
  state: PracticeBattleState,
  side: PracticeSide,
  targetSide: PracticeSide,
  preferredTargetId: string | null,
) => {
  const units = living(state, side).filter((combatant) => combatant.role === "unit");

  for (const unit of units) {
    const targets = living(state, targetSide);
    if (!targets.length) break;

    const preferred = targets.find((target) => target.id === preferredTargetId);
    const target = preferred ?? targets[roll(state, `${side}:${unit.id}:target`, targets.length)];
    const variance = roll(state, `${side}:${unit.id}:damage`, 4);
    applyDamage(state, unit, target, unit.attack + variance, "unit_attack");
    if (resolveOutcome(state)) break;
  }
};

const performEnemyCommanderMove = (state: PracticeBattleState) => {
  const enemyCommander = commander(state, "enemy");
  const targets = living(state, "player");
  if (!enemyCommander || enemyCommander.hp <= 0 || !targets.length) return;

  const preferred = targets.find((target) => target.id === state.enemyFocusTarget);
  const target = preferred ?? targets[roll(state, "enemy:commander:target", targets.length)];
  const decision = roll(state, "enemy:commander:move", 100);

  if (state.enemyDeathBoltCooldown === 0 && decision < 34) {
    const focused = state.enemyFocusTarget === target.id;
    applyDamage(state, enemyCommander, target, 22 + (focused ? 6 : 0), "death_bolt");
    state.enemyDeathBoltCooldown = 2;
    if (focused) state.enemyFocusTarget = null;
    return;
  }

  if (decision < 55) {
    const gained = Math.min(28 - enemyCommander.shield, 15);
    enemyCommander.shield += Math.max(0, gained);
    pushEvent(state, {
      side: "enemy",
      code: "guard",
      actorName: enemyCommander.name,
      amount: Math.max(0, gained),
      idSuffix: enemyCommander.id,
    });
    return;
  }

  state.enemyFocusTarget = target.id;
  pushEvent(state, {
    side: "enemy",
    code: "focus_target",
    actorName: enemyCommander.name,
    targetName: target.name,
    idSuffix: target.id,
  });
  applyDamage(state, enemyCommander, target, 6, "focus_target");
};

export const startPracticeBattle = (seed: number): PracticeBattleState => {
  const state: PracticeBattleState = {
    version: 1,
    seed: seed >>> 0,
    turn: 1,
    maxTurns: 12,
    status: "active",
    playerFocusTarget: null,
    enemyFocusTarget: null,
    playerDeathBoltCooldown: 0,
    enemyDeathBoltCooldown: 0,
    combatants: [
      { id: "player_commander", side: "player", role: "commander", name: "Cipher Commander", hp: 100, maxHp: 100, shield: 12, attack: 0 },
      { id: "player_guard", side: "player", role: "unit", name: "Neon Guard", hp: 66, maxHp: 66, shield: 6, attack: 8 },
      { id: "player_archer", side: "player", role: "unit", name: "Shade Archer", hp: 54, maxHp: 54, shield: 0, attack: 10 },
      { id: "enemy_commander", side: "enemy", role: "commander", name: "Warden Null", hp: 98, maxHp: 98, shield: 10, attack: 0 },
      { id: "enemy_guard", side: "enemy", role: "unit", name: "Iron Revenant", hp: 68, maxHp: 68, shield: 5, attack: 8 },
      { id: "enemy_archer", side: "enemy", role: "unit", name: "Hollow Ranger", hp: 52, maxHp: 52, shield: 0, attack: 10 },
    ],
    events: [],
  };

  pushEvent(state, { side: "system", code: "battle_started", idSuffix: "start" });
  return state;
};

export const applyPracticeTurn = (
  currentState: PracticeBattleState,
  intent: PracticeTurnIntent,
): PracticeBattleState => {
  if (currentState.version !== 1) throw new Error("unsupported_battle_version");
  if (currentState.status !== "active") throw new Error("battle_finished");
  if (currentState.turn < 1 || currentState.turn > currentState.maxTurns) throw new Error("invalid_turn");

  // The cooldown returned to the client governs the next submitted move.
  if (intent.move === "death_bolt" && currentState.playerDeathBoltCooldown > 0) {
    throw new Error("death_bolt_on_cooldown");
  }

  const state = JSON.parse(JSON.stringify(currentState)) as PracticeBattleState;
  state.playerDeathBoltCooldown = Math.max(0, state.playerDeathBoltCooldown - 1);
  state.enemyDeathBoltCooldown = Math.max(0, state.enemyDeathBoltCooldown - 1);

  performPlayerMove(state, intent);
  if (resolveOutcome(state)) return state;

  const preferredEnemyTarget = intent.move === "guard"
    ? state.playerFocusTarget
    : (intent.targetId ?? state.playerFocusTarget);
  performAutomaticUnitAttacks(state, "player", "enemy", preferredEnemyTarget ?? null);
  if (state.status !== "active") return state;

  performEnemyCommanderMove(state);
  if (resolveOutcome(state)) return state;

  performAutomaticUnitAttacks(state, "enemy", "player", state.enemyFocusTarget);
  if (state.status !== "active") return state;

  if (resolveTurnLimit(state)) return state;

  state.turn += 1;
  return state;
};
