export const canUnlockNextTopic = ({ missionsCompleted, accuracy, avgTimeRatio, }) => {
    if (missionsCompleted < 5)
        return false;
    if (accuracy < 0.75)
        return false;
    if (avgTimeRatio > 0.9)
        return false;
    return true;
};
const missionSort = (missions) => missions
    .slice()
    .sort((a, b) => new Date(a.completedAt).getTime() - new Date(b.completedAt).getTime());
const qualifiesForBossWindow = (missions) => {
    if (missions.length < 3)
        return false;
    const ordered = missionSort(missions);
    for (let index = 0; index <= ordered.length - 3; index += 1) {
        const window = ordered.slice(index, index + 3);
        const streakValid = window.every((mission) => {
            const isMediumOrHard = mission.difficulty === 'medium' || mission.difficulty === 'hard';
            const accuracyOk = mission.accuracy >= 0.8;
            return isMediumOrHard && accuracyOk;
        });
        if (streakValid) {
            return true;
        }
    }
    return false;
};
export const canUnlockBossNode = ({ recentMissions, crushedTopics, }) => {
    if (crushedTopics < 1)
        return false;
    return qualifiesForBossWindow(recentMissions);
};
export const buildBranchSummary = (branchId, topics, missionHistory) => {
    const crushedTopics = topics.filter((topic) => topic.status === 'CRUSHED').length;
    const canUnlockBoss = canUnlockBossNode({ recentMissions: missionHistory, crushedTopics });
    return {
        branchId,
        topics,
        crushedTopics,
        canUnlockBossNode: canUnlockBoss,
        recentMissionCount: missionHistory.length,
    };
};
