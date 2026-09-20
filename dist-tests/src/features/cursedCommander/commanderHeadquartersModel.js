export const commanderLevelXp = (level) => (level - 1) * (10 * level + 80);
export const commanderTrainingCost = (rank, rules) => Math.round(rules["trainingBase"] * rules["trainingGrowth"] ** (rank - 1));
export const commanderItemEquipped = (hq, item) => hq.profile?.[item.slot] === item.id;
export const commanderStatRank = (hq, stat) => hq.profile?.[`${stat}_rank`] ?? 1;
export const commanderMissingCoins = (price, balance) => Math.max(0, price - balance);
export const commanderUnitTrainingUnlockLevel = (rules) => rules["unitTrainingUnlockLevel"] ?? 11;
export const commanderUnitTrainingMaxRank = (rules) => rules["unitTrainingMaxRank"] ?? 10;
export const commanderUnitEvolutionUnlockLevel = (rules) => rules["unitEvolutionUnlockLevel"] ?? 21;
export const commanderUnitEvolutionMaxTier = (rules) => rules["unitEvolutionMaxTier"] ?? 3;
export const commanderSchoolMasteryUnlockLevel = (rules) => rules["schoolMasteryUnlockLevel"] ?? 31;
export const commanderSchoolMasteryMaxRank = (rules) => rules["schoolMasteryMaxRank"] ?? 3;
export const commanderSchoolMasteryRankCap = (level, rules) => {
    const rank1 = commanderSchoolMasteryUnlockLevel(rules);
    const rank2 = rules["schoolMasteryRank2Level"] ?? 35;
    const rank3 = rules["schoolMasteryRank3Level"] ?? 40;
    if (level < rank1)
        return 0;
    if (level < rank2)
        return 1;
    if (level < rank3)
        return 2;
    return commanderSchoolMasteryMaxRank(rules);
};
export const commanderSchoolMasteryNextLevel = (currentRank, rules) => {
    if (currentRank <= 0)
        return commanderSchoolMasteryUnlockLevel(rules);
    if (currentRank === 1)
        return rules["schoolMasteryRank2Level"] ?? 35;
    if (currentRank === 2)
        return rules["schoolMasteryRank3Level"] ?? 40;
    return null;
};
export const commanderSchoolMasteryCost = (currentRank, rules) => Math.round((rules["schoolMasteryBase"] ?? 450)
    * (rules["schoolMasteryGrowth"] ?? 1.55) ** Math.max(0, currentRank));
export const commanderSchoolMasteryRank = (hq, school) => Math.max(0, Math.min(commanderSchoolMasteryMaxRank(hq.campaign.rules), hq.loadout?.schoolMastery?.[school] ?? 0));
export const commanderSchoolMasteryDoctrine = (school) => {
    const doctrines = {
        void: {
            name: "Null Vector",
            power: "Death Bolt",
            summary: "Condense the Void strike into a cleaner execution vector.",
            effect: "+3 Death Bolt damage per Mastery rank",
        },
        storm: {
            name: "Overcharge Lattice",
            power: "Chain Surge",
            summary: "Stabilize the first discharge and strengthen the returning arc.",
            effect: "+2 primary and +1 arc damage per Mastery rank",
        },
        rot: {
            name: "Blight Protocol",
            power: "Rot Miasma",
            summary: "Increase the pressure carried by every Miasma pulse on the field.",
            effect: "+1 damage to every Miasma target per Mastery rank",
        },
        grave: {
            name: "Revenant Covenant",
            power: "Raise Dead",
            summary: "Return fallen units with more strength and reinforce emergency mending.",
            effect: "+3% revive health and +2 mend HP per Mastery rank",
        },
    };
    return doctrines[school];
};
export const commanderFormationMaxRank = (rules) => rules["formationMaxRank"] ?? 7;
export const commanderFormationUnlockLevel = (id, rules) => {
    if (id === "bastion_wedge")
        return rules["formationBastionUnlockLevel"] ?? 45;
    if (id === "spearhead")
        return rules["formationSpearheadUnlockLevel"] ?? 50;
    if (id === "arc_lattice")
        return rules["formationArcUnlockLevel"] ?? 55;
    return rules["formationUnlockLevel"] ?? 41;
};
export const commanderFormationRankCap = (level, rules) => {
    const milestones = [
        rules["formationUnlockLevel"] ?? 41,
        rules["formationRank2Level"] ?? 50,
        rules["formationRank3Level"] ?? 60,
        rules["formationRank4Level"] ?? 70,
        rules["formationRank5Level"] ?? 80,
        rules["formationRank6Level"] ?? 90,
        rules["formationRank7Level"] ?? 100,
    ];
    return Math.min(commanderFormationMaxRank(rules), milestones.reduce((rank, milestone) => rank + (level >= milestone ? 1 : 0), 0));
};
export const commanderFormationNextLevel = (id, currentRank, rules) => {
    if (currentRank <= 0)
        return commanderFormationUnlockLevel(id, rules);
    const levels = [
        rules["formationRank2Level"] ?? 50,
        rules["formationRank3Level"] ?? 60,
        rules["formationRank4Level"] ?? 70,
        rules["formationRank5Level"] ?? 80,
        rules["formationRank6Level"] ?? 90,
        rules["formationRank7Level"] ?? 100,
    ];
    return levels[currentRank - 1] ?? null;
};
export const commanderFormationTrainingCost = (currentRank, rules) => Math.round((rules["formationTrainingBase"] ?? 600)
    * (rules["formationTrainingGrowth"] ?? 1.35) ** Math.max(0, currentRank));
export const commanderFormationRank = (hq, id) => Math.max(0, Math.min(commanderFormationMaxRank(hq.campaign.rules), hq.loadout?.formation?.ranks?.[id] ?? 0));
export const commanderActiveFormation = (hq) => hq.loadout?.formation?.activeId ?? "command_line";
export const COMMANDER_FORMATIONS = [
    {
        id: "command_line",
        name: "Command Line",
        role: "BALANCED",
        icon: "◇",
        summary: "A disciplined three-point line that reinforces every role without overcommitting.",
        doctrine: "Small all-round gains to Commander control, squad endurance, and measured pressure.",
        tradeoff: "No extreme advantage; specialists can outperform it in their preferred battle state.",
    },
    {
        id: "bastion_wedge",
        name: "Bastion Wedge",
        role: "DEFENSE",
        icon: "⬡",
        summary: "Collapse around the frontline and force the enemy to break reinforced layers first.",
        doctrine: "Major shield, Guard, Commander durability, and frontline endurance gains.",
        tradeoff: "Reduces Death Bolt pressure and trims ranged damage as doctrine rank rises.",
    },
    {
        id: "spearhead",
        name: "Spearhead",
        role: "ASSAULT",
        icon: "▲",
        summary: "Push the formation forward and convert defensive reserve into decisive pressure.",
        doctrine: "Improves Death Bolt, Focus, and both unit attacks for aggressive turns.",
        tradeoff: "Sacrifices Commander HP, starting shield, Guard strength, and shield capacity.",
    },
    {
        id: "arc_lattice",
        name: "Arc Lattice",
        role: "POWER",
        icon: "✦",
        summary: "Spread the squad into a casting lattice that amplifies Commander tactical channels.",
        doctrine: "Strong Focus growth plus Bolt and Guard gains for School-power-oriented play.",
        tradeoff: "Reduces deployed unit HP and a small amount of starting Commander shield.",
    },
];
export const commanderFormationModifiers = (id, rank) => {
    const r = Math.max(0, Math.min(7, Math.trunc(rank)));
    if (id === "bastion_wedge") {
        return {
            commanderHp: 2 * r,
            commanderShield: 3 * r,
            bolt: -r,
            focus: 0,
            guard: 2 * r,
            shieldCap: 3 * r,
            guardHp: 3 * r,
            guardShield: 2 * r,
            guardAttack: 0,
            archerHp: r,
            archerShield: 0,
            archerAttack: -Math.floor(r / 2),
        };
    }
    if (id === "spearhead") {
        return {
            commanderHp: -2 * r,
            commanderShield: -r,
            bolt: 2 * r,
            focus: r,
            guard: -r,
            shieldCap: -r,
            guardHp: 0,
            guardShield: 0,
            guardAttack: Math.floor((r + 1) / 2),
            archerHp: 0,
            archerShield: 0,
            archerAttack: Math.floor((r + 1) / 2),
        };
    }
    if (id === "arc_lattice") {
        return {
            commanderHp: 0,
            commanderShield: -Math.floor(r / 2),
            bolt: r,
            focus: 2 * r,
            guard: r,
            shieldCap: 0,
            guardHp: -r,
            guardShield: 0,
            guardAttack: 0,
            archerHp: -r,
            archerShield: 0,
            archerAttack: 0,
        };
    }
    return {
        commanderHp: r,
        commanderShield: r,
        bolt: Math.floor(r / 2),
        focus: Math.floor(r / 2),
        guard: r,
        shieldCap: r,
        guardHp: r,
        guardShield: 0,
        guardAttack: Math.floor(r / 3),
        archerHp: r,
        archerShield: 0,
        archerAttack: Math.floor(r / 3),
    };
};
export const commanderFormationNextGain = (id, currentRank) => {
    const current = commanderFormationModifiers(id, currentRank);
    const next = commanderFormationModifiers(id, currentRank + 1);
    return Object.fromEntries(Object.entries(next).map(([key, value]) => [
        key,
        value - current[key],
    ]));
};
export const commanderUnitEvolutionTierCap = (level, rules) => {
    const tier1 = commanderUnitEvolutionUnlockLevel(rules);
    const tier2 = rules["unitEvolutionTier2Level"] ?? 25;
    const tier3 = rules["unitEvolutionTier3Level"] ?? 30;
    if (level < tier1)
        return 0;
    if (level < tier2)
        return 1;
    if (level < tier3)
        return 2;
    return commanderUnitEvolutionMaxTier(rules);
};
export const commanderUnitEvolutionNextLevel = (currentTier, rules) => {
    if (currentTier <= 0)
        return commanderUnitEvolutionUnlockLevel(rules);
    if (currentTier === 1)
        return rules["unitEvolutionTier2Level"] ?? 25;
    if (currentTier === 2)
        return rules["unitEvolutionTier3Level"] ?? 30;
    return null;
};
export const commanderUnitEvolutionCost = (currentTier, rules) => Math.round((rules["unitEvolutionBase"] ?? 250)
    * (rules["unitEvolutionGrowth"] ?? 1.6) ** Math.max(0, currentTier));
export const commanderUnitRankCap = (level, rules) => {
    const unlock = commanderUnitTrainingUnlockLevel(rules);
    if (level < unlock)
        return 1;
    return Math.min(commanderUnitTrainingMaxRank(rules), 2 + level - unlock);
};
export const commanderUnitTrainingCost = (currentRank, rules) => Math.round((rules["unitTrainingBase"] ?? 50)
    * (rules["unitTrainingGrowth"] ?? 1.2) ** Math.max(0, currentRank - 1));
export const commanderUnitProgressFor = (hq, itemId) => {
    const existing = hq.unitProgress?.find((progress) => progress.itemId === itemId);
    const level = hq.profile?.level ?? 1;
    const rankCap = hq.profile?.unitRankCap
        ?? commanderUnitRankCap(level, hq.campaign.rules);
    const maxRank = commanderUnitTrainingMaxRank(hq.campaign.rules);
    if (existing)
        return existing;
    return {
        itemId,
        unitRank: 1,
        evolutionTier: 0,
        trainingPoints: 0,
        version: 1,
        rankCap,
        maxRank,
        nextCost: commanderUnitTrainingCost(1, hq.campaign.rules),
        veteran: false,
    };
};
export const commanderUnitRankBonus = (item, rank, rules) => {
    if (item.kind !== "unit")
        return { hp: 0, shield: 0, attack: 0 };
    const steps = Math.max(0, rank - 1);
    if (item.slot === "guard") {
        const shieldEvery = Math.max(1, rules["unitGuardShieldEvery"] ?? 3);
        const attackEvery = Math.max(1, rules["unitGuardAttackEvery"] ?? 3);
        return {
            hp: steps * (rules["unitGuardHpPerRank"] ?? 2),
            shield: Math.floor(steps / shieldEvery),
            attack: Math.floor(steps / attackEvery),
        };
    }
    if (item.slot === "archer") {
        const attackEvery = Math.max(1, rules["unitArcherAttackEvery"] ?? 2);
        return {
            hp: steps * (rules["unitArcherHpPerRank"] ?? 1),
            shield: 0,
            attack: Math.floor(steps / attackEvery),
        };
    }
    return { hp: 0, shield: 0, attack: 0 };
};
export const commanderUnitEvolutionBonus = (item, tier, rules) => {
    const steps = Math.max(0, Math.min(commanderUnitEvolutionMaxTier(rules), tier));
    if (item.kind !== "unit" || steps === 0)
        return { hp: 0, shield: 0, attack: 0 };
    if (item.slot === "guard") {
        return {
            hp: steps * (rules["unitEvolutionGuardHpPerTier"] ?? 8),
            shield: steps * (rules["unitEvolutionGuardShieldPerTier"] ?? 2),
            attack: steps * (rules["unitEvolutionGuardAttackPerTier"] ?? 1),
        };
    }
    if (item.slot === "archer") {
        return {
            hp: steps * (rules["unitEvolutionArcherHpPerTier"] ?? 4),
            shield: 0,
            attack: steps * (rules["unitEvolutionArcherAttackPerTier"] ?? 2),
        };
    }
    return { hp: 0, shield: 0, attack: 0 };
};
export const commanderUnitEvolutionDoctrine = (item) => item.slot === "guard"
    ? {
        id: "bulwark_matrix",
        name: "Bulwark Matrix",
        detail: "Permanent reinforced-frame evolution: more HP, shield reserve, and measured attack pressure.",
    }
    : {
        id: "predator_matrix",
        name: "Predator Matrix",
        detail: "Permanent precision-frame evolution: more HP and stronger ranged attack pressure.",
    };
export const commanderUnitNextRankGain = (item, currentRank, rules) => {
    const current = commanderUnitRankBonus(item, currentRank, rules);
    const next = commanderUnitRankBonus(item, currentRank + 1, rules);
    return {
        hp: next.hp - current.hp,
        shield: next.shield - current.shield,
        attack: next.attack - current.attack,
    };
};
export const commanderUnitNextEvolutionGain = (item, currentTier, rules) => {
    const current = commanderUnitEvolutionBonus(item, currentTier, rules);
    const next = commanderUnitEvolutionBonus(item, currentTier + 1, rules);
    return {
        hp: next.hp - current.hp,
        shield: next.shield - current.shield,
        attack: next.attack - current.attack,
    };
};
