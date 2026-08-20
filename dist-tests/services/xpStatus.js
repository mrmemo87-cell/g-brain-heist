const parseXpStatus = (payload) => {
    if (!payload || typeof payload !== 'object') {
        return null;
    }
    const status = payload;
    if (typeof status.level !== 'number' || typeof status.xp !== 'number') {
        return null;
    }
    return {
        level: status.level,
        xp: status.xp,
        level_xp_start: status.level_xp_start ?? status.xp,
        level_xp_next: status.level_xp_next ?? status.xp,
        xp_into_level: status.xp_into_level ?? 0,
        xp_to_next: status.xp_to_next ?? 0,
        progress: status.progress ?? 0,
    };
};
export const fetchMyXpStatus = async (client, fallback) => {
    const { data, error } = await client.rpc('rpc_my_xp_status');
    const parsed = parseXpStatus(data);
    if (!error && parsed) {
        return parsed;
    }
    const xp = fallback?.xp ?? 0;
    const level = fallback?.level ?? 1;
    return {
        level,
        xp,
        level_xp_start: xp,
        level_xp_next: xp,
        xp_into_level: 0,
        xp_to_next: 0,
        progress: 0,
    };
};
