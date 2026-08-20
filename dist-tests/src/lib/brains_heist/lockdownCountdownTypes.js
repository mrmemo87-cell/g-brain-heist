export var EntryRoute;
(function (EntryRoute) {
    EntryRoute["VentCrawlers"] = "VENT_CRAWLERS";
    EntryRoute["FrontGateFakes"] = "FRONT_GATE_FAKES";
    EntryRoute["BackdoorGhosts"] = "BACKDOOR_GHOSTS";
})(EntryRoute || (EntryRoute = {}));
export var QuestionRiskRoute;
(function (QuestionRiskRoute) {
    QuestionRiskRoute["Safe"] = "SAFE";
    QuestionRiskRoute["Risky"] = "RISKY";
    QuestionRiskRoute["Insane"] = "INSANE";
})(QuestionRiskRoute || (QuestionRiskRoute = {}));
export var AlarmLevel;
(function (AlarmLevel) {
    AlarmLevel["Normal"] = "NORMAL";
    AlarmLevel["Yellow"] = "YELLOW";
    AlarmLevel["Orange"] = "ORANGE";
    AlarmLevel["Red"] = "RED";
})(AlarmLevel || (AlarmLevel = {}));
export var HeistCondition;
(function (HeistCondition) {
    HeistCondition["DoublePayouts"] = "DOUBLE_PAYOUTS";
    HeistCondition["SilentMode"] = "SILENT_MODE";
    HeistCondition["ParanoidSystems"] = "PARANOID_SYSTEMS";
    HeistCondition["ShortTimers"] = "SHORT_TIMERS";
})(HeistCondition || (HeistCondition = {}));
export var PlayerRoleStatus;
(function (PlayerRoleStatus) {
    PlayerRoleStatus["Normal"] = "NORMAL";
    PlayerRoleStatus["MostWanted"] = "MOST_WANTED";
    PlayerRoleStatus["Frozen"] = "FROZEN";
    PlayerRoleStatus["LockedOut"] = "LOCKED_OUT";
    PlayerRoleStatus["Shielded"] = "SHIELDED";
})(PlayerRoleStatus || (PlayerRoleStatus = {}));
export var GamePhase;
(function (GamePhase) {
    GamePhase["Lobby"] = "LOBBY";
    GamePhase["VotingRules"] = "VOTING_RULES";
    GamePhase["ActiveRounds"] = "ACTIVE_ROUNDS";
    GamePhase["PanicMode"] = "PANIC_MODE";
    GamePhase["Finished"] = "FINISHED";
})(GamePhase || (GamePhase = {}));
export var FinishReason;
(function (FinishReason) {
    FinishReason["SuccessGoalReached"] = "SUCCESS_GOAL_REACHED";
    FinishReason["FailureAlarmMaxed"] = "FAILURE_ALARM_MAXED";
    FinishReason["FailureTimeExpired"] = "FAILURE_TIME_EXPIRED";
})(FinishReason || (FinishReason = {}));
export const ALARM_THRESHOLDS = {
    yellow: 30,
    orange: 60,
    red: 90,
    failure: 100,
};
export const QUESTION_RISK_CONFIG = {
    [QuestionRiskRoute.Safe]: {
        baseRewardCoins: 5,
        alarmImpactOnWrong: 0,
        heatGainOnCorrect: 0,
        description: "Easy path with minimal reward and no alarm risk.",
    },
    [QuestionRiskRoute.Risky]: {
        baseRewardCoins: 10,
        alarmImpactOnWrong: 8,
        heatGainOnCorrect: 2,
        description: "Balanced challenge with better coins and moderate alarm risk.",
    },
    [QuestionRiskRoute.Insane]: {
        baseRewardCoins: 18,
        alarmImpactOnWrong: 15,
        heatGainOnCorrect: 5,
        description: "High stakes, highest rewards, and significant alarm and heat impact.",
    },
};
export const ENTRY_ROUTE_MODIFIERS = {
    [EntryRoute.VentCrawlers]: {
        hackDefenseModifier: 1.25,
        coinGainModifier: 0.95,
        heatGainModifier: 0.85,
        alarmPressureModifier: 1.15,
        description: "Expert at dodging hacks; struggle when global alarm surges.",
    },
    [EntryRoute.FrontGateFakes]: {
        hackDefenseModifier: 0.9,
        coinGainModifier: 1.15,
        heatGainModifier: 1,
        alarmPressureModifier: 1,
        description: "Flashy entrance yields early coins but invites more hack attempts.",
    },
    [EntryRoute.BackdoorGhosts]: {
        hackDefenseModifier: 1,
        coinGainModifier: 1,
        heatGainModifier: 1.25,
        alarmPressureModifier: 0.9,
        description: "Stealth specialists with better hack success yet higher personal heat.",
    },
};
export const DEFAULT_ROOM_SETTINGS = {
    roomId: "",
    coinGoal: 200,
    timeLimitSeconds: 1200,
    maxPlayers: 24,
    teacherId: undefined,
    allowChaosButton: true,
    startingCoins: 0,
};
export const DEFAULT_HEIST_RULE_SET = {
    selectedConditions: [],
    chaosButtonUsed: false,
    panicModeAlarmThreshold: ALARM_THRESHOLDS.red,
    panicModeTimeBufferSeconds: 120,
};
