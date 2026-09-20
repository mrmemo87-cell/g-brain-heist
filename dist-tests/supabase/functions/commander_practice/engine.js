const MAX_EVENTS = 24;
const PLAYER_POWER_ORDER = ["death_bolt", "chain_surge", "rot_miasma", "raise_dead"];
const SCHOOL_POWER = {
    void: "death_bolt",
    storm: "chain_surge",
    rot: "rot_miasma",
    grave: "raise_dead",
};
const MASTERY_SCHOOLS = ["void", "storm", "rot", "grave"];
const POWER_MOVES = new Set(PLAYER_POWER_ORDER);
const VALID_SCHOOLS = new Set(["neutral", "void", "storm", "rot", "grave"]);
const powerCooldownError = (move) => move === "death_bolt" ? "death_bolt_on_cooldown" : "commander_power_on_cooldown";
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const hash32 = (input) => {
    let hash = 0x811c9dc5;
    for (let i = 0; i < input.length; i += 1) {
        hash ^= input.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193);
    }
    return hash >>> 0;
};
const masteryRank = (state, school) => clamp(Math.trunc(state.playerSchoolMastery?.[school] ?? 0), 0, 3);
const roll = (state, label, maxExclusive) => {
    if (maxExclusive <= 1)
        return 0;
    return hash32(`${state.seed}:${state.turn}:${label}`) % maxExclusive;
};
const eventId = (state, code, suffix) => `${state.turn}:${code}:${suffix}:${state.events.length}`;
const pushEvent = (state, event) => {
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
const living = (state, side) => state.combatants.filter((combatant) => combatant.side === side && combatant.hp > 0);
const findCombatant = (state, id) => id ? state.combatants.find((combatant) => combatant.id === id) ?? null : null;
const commander = (state, side) => state.combatants.find((combatant) => combatant.side === side && combatant.role === "commander") ?? null;
const isBattleSideDefeated = (state, side) => {
    const sideCommander = commander(state, side);
    return !sideCommander || sideCommander.hp <= 0 || living(state, side).length === 0;
};
const applyDamage = (state, actor, target, amount, attackCode) => {
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
const resolveOutcome = (state) => {
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
const sideScore = (state, side) => state.combatants
    .filter((combatant) => combatant.side === side)
    .reduce((sum, combatant) => sum + combatant.hp + Math.floor(combatant.shield / 2), 0);
const resolveTurnLimit = (state) => {
    if (state.turn < state.maxTurns)
        return false;
    const playerScore = sideScore(state, "player");
    const enemyScore = sideScore(state, "enemy");
    if (playerScore === enemyScore) {
        state.status = "draw";
        pushEvent(state, { side: "system", code: "battle_draw", idSuffix: "turn-limit" });
    }
    else if (playerScore > enemyScore) {
        state.status = "victory";
        pushEvent(state, { side: "system", code: "battle_victory", idSuffix: "turn-limit" });
    }
    else {
        state.status = "defeat";
        pushEvent(state, { side: "system", code: "battle_defeat", idSuffix: "turn-limit" });
    }
    return true;
};
const requireTarget = (state, targetId, expectedSide) => {
    const target = findCombatant(state, targetId);
    if (!target || target.side !== expectedSide || target.hp <= 0) {
        throw new Error("invalid_target");
    }
    return target;
};
const playerPowers = (state) => {
    const configured = state.playerPowers?.filter((power) => PLAYER_POWER_ORDER.includes(power));
    return configured?.length ? configured : ["death_bolt"];
};
const requirePlayerPower = (state, move) => {
    if (!POWER_MOVES.has(move))
        return;
    if (!playerPowers(state).includes(move))
        throw new Error("commander_power_locked");
    if (state.playerDeathBoltCooldown > 0)
        throw new Error(powerCooldownError(move));
};
const performDeathBolt = (state, playerCommander, target) => {
    const focused = state.playerFocusTarget === target.id;
    applyDamage(state, playerCommander, target, (state.playerTactics?.bolt ?? 26) + (focused ? 8 : 0) + masteryRank(state, "void") * 3, "death_bolt");
    state.playerDeathBoltCooldown = 2;
    if (focused)
        state.playerFocusTarget = null;
};
const performChainSurge = (state, playerCommander, target) => {
    const focused = state.playerFocusTarget === target.id;
    const bolt = state.playerTactics?.bolt ?? 26;
    const stormRank = masteryRank(state, "storm");
    const primaryDamage = Math.max(12, Math.round(bolt * 0.68)) + (focused ? 5 : 0) + stormRank * 2;
    applyDamage(state, playerCommander, target, primaryDamage, "chain_surge");
    const secondaryTargets = living(state, "enemy").filter((candidate) => candidate.id !== target.id);
    if (secondaryTargets.length > 0) {
        const secondary = secondaryTargets[roll(state, `player:chain:${target.id}`, secondaryTargets.length)];
        applyDamage(state, playerCommander, secondary, Math.max(7, Math.round(primaryDamage * 0.55)) + stormRank, "chain_surge");
    }
    state.playerDeathBoltCooldown = 3;
    if (focused)
        state.playerFocusTarget = null;
};
const performRotMiasma = (state, playerCommander, target) => {
    const focus = state.playerTactics?.focus ?? 7;
    const bolt = state.playerTactics?.bolt ?? 26;
    const pulse = Math.max(6, Math.round(focus * 0.75 + bolt * 0.12)) + masteryRank(state, "rot");
    const focused = state.playerFocusTarget === target.id;
    const targets = living(state, "enemy");
    for (const enemy of targets) {
        const selectedBonus = enemy.id === target.id ? 4 : 0;
        const focusBonus = focused && enemy.id === target.id ? 3 : 0;
        applyDamage(state, playerCommander, enemy, pulse + selectedBonus + focusBonus, "rot_miasma");
    }
    state.playerDeathBoltCooldown = 3;
};
const performRaiseDead = (state, playerCommander) => {
    const graveRank = masteryRank(state, "grave");
    const fallen = state.combatants.find((combatant) => combatant.side === "player" && combatant.role === "unit" && combatant.hp <= 0);
    if (fallen) {
        const restored = Math.max(1, Math.round(fallen.maxHp * (0.35 + graveRank * 0.03)));
        fallen.hp = Math.min(fallen.maxHp, restored);
        fallen.shield = 0;
        pushEvent(state, {
            side: "player",
            code: "raise_dead",
            actorName: playerCommander.name,
            targetName: fallen.name,
            amount: fallen.hp,
            idSuffix: `${fallen.id}:revive`,
        });
        state.playerDeathBoltCooldown = 3;
        return;
    }
    const wounded = state.combatants
        .filter((combatant) => combatant.side === "player" && combatant.role === "unit" && combatant.hp > 0 && combatant.hp < combatant.maxHp)
        .sort((a, b) => (a.hp / a.maxHp) - (b.hp / b.maxHp))[0];
    if (!wounded)
        throw new Error("raise_dead_no_valid_target");
    const healCap = Math.max(12, Math.round((state.playerTactics?.guard ?? 18) * 0.75)) + graveRank * 2;
    const restored = Math.min(healCap, wounded.maxHp - wounded.hp);
    wounded.hp += restored;
    pushEvent(state, {
        side: "player",
        code: "raise_dead",
        actorName: playerCommander.name,
        targetName: wounded.name,
        amount: restored,
        idSuffix: `${wounded.id}:mend`,
    });
    state.playerDeathBoltCooldown = 3;
};
const performPlayerMove = (state, intent) => {
    const playerCommander = commander(state, "player");
    if (!playerCommander || playerCommander.hp <= 0)
        throw new Error("player_commander_unavailable");
    if (intent.move === "guard") {
        const gained = Math.min((state.playerTactics?.shieldCap ?? 30) - playerCommander.shield, state.playerTactics?.guard ?? 18);
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
    if (intent.move === "raise_dead") {
        requirePlayerPower(state, intent.move);
        performRaiseDead(state, playerCommander);
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
        applyDamage(state, playerCommander, target, state.playerTactics?.focus ?? 7, "focus_target");
        return;
    }
    requirePlayerPower(state, intent.move);
    if (intent.move === "death_bolt") {
        performDeathBolt(state, playerCommander, target);
        return;
    }
    if (intent.move === "chain_surge") {
        performChainSurge(state, playerCommander, target);
        return;
    }
    if (intent.move === "rot_miasma") {
        performRotMiasma(state, playerCommander, target);
        return;
    }
    throw new Error("invalid_move");
};
const performAutomaticUnitAttacks = (state, side, targetSide, preferredTargetId) => {
    const units = living(state, side).filter((combatant) => combatant.role === "unit");
    for (const unit of units) {
        const targets = living(state, targetSide);
        if (!targets.length)
            break;
        const preferred = targets.find((target) => target.id === preferredTargetId);
        const target = preferred ?? targets[roll(state, `${side}:${unit.id}:target`, targets.length)];
        const variance = roll(state, `${side}:${unit.id}:damage`, 4);
        applyDamage(state, unit, target, unit.attack + variance, "unit_attack");
        if (resolveOutcome(state))
            break;
    }
};
const performEnemyCommanderMove = (state) => {
    const enemyCommander = commander(state, "enemy");
    const targets = living(state, "player");
    if (!enemyCommander || enemyCommander.hp <= 0 || !targets.length)
        return;
    const preferred = targets.find((target) => target.id === state.enemyFocusTarget);
    const target = preferred ?? targets[roll(state, "enemy:commander:target", targets.length)];
    const decision = roll(state, "enemy:commander:move", 100);
    if (state.enemyDeathBoltCooldown === 0 && decision < 34) {
        const focused = state.enemyFocusTarget === target.id;
        applyDamage(state, enemyCommander, target, 22 + (focused ? 6 : 0), "death_bolt");
        state.enemyDeathBoltCooldown = 2;
        if (focused)
            state.enemyFocusTarget = null;
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
export const startPracticeBattle = (seed) => {
    const state = {
        version: 1,
        seed: seed >>> 0,
        turn: 1,
        maxTurns: 12,
        status: "active",
        playerFocusTarget: null,
        enemyFocusTarget: null,
        playerDeathBoltCooldown: 0,
        enemyDeathBoltCooldown: 0,
        playerPowers: ["death_bolt"],
        combatants: [
            { id: "player_commander", side: "player", role: "commander", name: "Cipher Commander", hp: 100, maxHp: 100, shield: 12, attack: 0, school: "void" },
            { id: "player_guard", side: "player", role: "unit", name: "Neon Guard", hp: 66, maxHp: 66, shield: 6, attack: 8, school: "neutral" },
            { id: "player_archer", side: "player", role: "unit", name: "Shade Archer", hp: 54, maxHp: 54, shield: 0, attack: 10, school: "neutral" },
            { id: "enemy_commander", side: "enemy", role: "commander", name: "Warden Null", hp: 98, maxHp: 98, shield: 10, attack: 0 },
            { id: "enemy_guard", side: "enemy", role: "unit", name: "Iron Revenant", hp: 68, maxHp: 68, shield: 5, attack: 8 },
            { id: "enemy_archer", side: "enemy", role: "unit", name: "Hollow Ranger", hp: 52, maxHp: 52, shield: 0, attack: 10 },
        ],
        events: [],
    };
    pushEvent(state, { side: "system", code: "battle_started", idSuffix: "start" });
    return state;
};
export const applyPracticeTurn = (currentState, intent) => {
    if (currentState.version !== 1)
        throw new Error("unsupported_battle_version");
    if (currentState.status !== "active")
        throw new Error("battle_finished");
    if (currentState.turn < 1 || currentState.turn > currentState.maxTurns)
        throw new Error("invalid_turn");
    // The cooldown returned to the client governs the next submitted power move.
    if (POWER_MOVES.has(intent.move) && currentState.playerDeathBoltCooldown > 0) {
        throw new Error(powerCooldownError(intent.move));
    }
    const state = JSON.parse(JSON.stringify(currentState));
    state.playerDeathBoltCooldown = Math.max(0, state.playerDeathBoltCooldown - 1);
    state.enemyDeathBoltCooldown = Math.max(0, state.enemyDeathBoltCooldown - 1);
    performPlayerMove(state, intent);
    if (resolveOutcome(state))
        return state;
    const preferredEnemyTarget = intent.move === "guard" || intent.move === "raise_dead"
        ? state.playerFocusTarget
        : (intent.targetId ?? state.playerFocusTarget);
    performAutomaticUnitAttacks(state, "player", "enemy", preferredEnemyTarget ?? null);
    if (state.status !== "active")
        return state;
    performEnemyCommanderMove(state);
    if (resolveOutcome(state))
        return state;
    performAutomaticUnitAttacks(state, "enemy", "player", state.enemyFocusTarget);
    if (state.status !== "active")
        return state;
    if (resolveTurnLimit(state))
        return state;
    state.turn += 1;
    return state;
};
/** Accept only the server RPC's bounded schema; never a browser-supplied army. */
export function buildOwnedPracticeBattle(seed, input) {
    if (!input || typeof input !== 'object')
        throw new Error('invalid_owned_loadout');
    const x = input;
    const integer = (value, min, max) => {
        if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max)
            throw new Error('invalid_owned_loadout');
        return value;
    };
    if (x['version'] !== 1 || !Array.isArray(x['units']) || x['units'].length !== 2)
        throw new Error('invalid_owned_loadout');
    const state = startPracticeBattle(seed);
    const player = state.combatants.find(u => u.id === 'player_commander');
    player.hp = player.maxHp = integer(x['hp'], 50, 500);
    player.shield = integer(x['shield'], 0, 150);
    state.playerTactics = {
        bolt: integer(x['bolt'], 1, 150), focus: integer(x['focus'], 1, 100),
        guard: integer(x['guard'], 1, 150), shieldCap: integer(x['shieldCap'], player.shield, 200),
    };
    player.maxShield = state.playerTactics.shieldCap;
    const masteryInput = x['schoolMastery'];
    if (masteryInput !== undefined) {
        if (!masteryInput || typeof masteryInput !== 'object' || Array.isArray(masteryInput))
            throw new Error('invalid_owned_loadout');
        const masteryRecord = masteryInput;
        if (Object.keys(masteryRecord).some(key => !MASTERY_SCHOOLS.includes(key)))
            throw new Error('invalid_owned_loadout');
        const mastery = {};
        for (const school of MASTERY_SCHOOLS) {
            const value = masteryRecord[school];
            if (value !== undefined)
                mastery[school] = integer(value, 0, 3);
        }
        state.playerSchoolMastery = mastery;
    }
    const expected = new Set(['player_guard', 'player_archer']);
    const names = new Set(state.combatants.filter(u => !expected.has(u.id)).map(u => u.name));
    const unlocked = new Set(['death_bolt']);
    for (const value of x['units']) {
        if (!value || typeof value !== 'object')
            throw new Error('invalid_owned_loadout');
        const unit = value;
        if (typeof unit['id'] !== 'string' || !expected.delete(unit['id']) || typeof unit['name'] !== 'string' || !unit['name'].trim() || unit['name'].length > 60)
            throw new Error('invalid_owned_loadout');
        if (names.has(unit['name']))
            throw new Error('invalid_owned_loadout');
        names.add(unit['name']);
        const target = state.combatants.find(u => u.id === unit['id']);
        target.name = unit['name'];
        target.hp = target.maxHp = integer(unit['hp'], 1, 300);
        target.shield = integer(unit['shield'], 0, 150);
        target.attack = integer(unit['attack'], 1, 100);
        const schoolValue = unit['school'];
        if (schoolValue !== undefined) {
            if (typeof schoolValue !== 'string' || !VALID_SCHOOLS.has(schoolValue))
                throw new Error('invalid_owned_loadout');
            target.school = schoolValue;
            const power = SCHOOL_POWER[target.school];
            if (power)
                unlocked.add(power);
        }
        const catalogId = unit['catalogId'];
        if (catalogId !== undefined) {
            if (typeof catalogId !== 'string' || !catalogId.trim() || catalogId.length > 80)
                throw new Error('invalid_owned_loadout');
            target.catalogId = catalogId;
        }
    }
    state.playerPowers = PLAYER_POWER_ORDER.filter((power) => unlocked.has(power));
    state.loadoutLabel = `${String(x['weaponName'] ?? 'Weapon')} · ${String(x['shieldName'] ?? 'Shield')}`;
    state.loadoutVersion = integer(x['profileVersion'], 1, 2_000_000_000);
    return state;
}
