// Types and enums for Lockdown Countdown mode
export var GamePhase;
(function (GamePhase) {
    GamePhase["LOBBY"] = "LOBBY";
    GamePhase["VOTING_RULES"] = "VOTING_RULES";
    GamePhase["ACTIVE_ROUNDS"] = "ACTIVE_ROUNDS";
    GamePhase["PAUSED"] = "PAUSED";
    GamePhase["FINISHED"] = "FINISHED";
})(GamePhase || (GamePhase = {}));
export var EntryRoute;
(function (EntryRoute) {
    EntryRoute["SAFE"] = "SAFE";
    EntryRoute["STEALTH"] = "STEALTH";
    EntryRoute["FORCE"] = "FORCE";
})(EntryRoute || (EntryRoute = {}));
export var QuestionRiskRoute;
(function (QuestionRiskRoute) {
    QuestionRiskRoute["SAFE"] = "SAFE";
    QuestionRiskRoute["RISKY"] = "RISKY";
    QuestionRiskRoute["ALL_IN"] = "ALL_IN";
})(QuestionRiskRoute || (QuestionRiskRoute = {}));
export var AlarmLevel;
(function (AlarmLevel) {
    AlarmLevel["LOW"] = "LOW";
    AlarmLevel["GUARDED"] = "GUARDED";
    AlarmLevel["HIGH"] = "HIGH";
    AlarmLevel["CRITICAL"] = "CRITICAL";
})(AlarmLevel || (AlarmLevel = {}));
export var FinishReason;
(function (FinishReason) {
    FinishReason["COIN_GOAL_REACHED"] = "COIN_GOAL_REACHED";
    FinishReason["ALARM_MAXED"] = "ALARM_MAXED";
    FinishReason["TIME_EXPIRED"] = "TIME_EXPIRED";
})(FinishReason || (FinishReason = {}));
export var HeistCondition;
(function (HeistCondition) {
    HeistCondition["SILENT_MODE"] = "SILENT_MODE";
    HeistCondition["PARANOID_SYSTEMS"] = "PARANOID_SYSTEMS";
    HeistCondition["CHAOS_BUTTON"] = "CHAOS_BUTTON";
    HeistCondition["DOUBLE_PAYOUTS"] = "DOUBLE_PAYOUTS";
})(HeistCondition || (HeistCondition = {}));
