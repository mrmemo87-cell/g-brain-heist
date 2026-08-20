export const parseAdminDrilldownFilters = (query) => {
    const normalized = query.startsWith('?') ? query.slice(1) : query;
    const params = new URLSearchParams(normalized);
    const grade = Number(params.get('grade'));
    return {
        grade: Number.isFinite(grade) && grade > 0 ? grade : undefined,
        genre: params.get('genre') ?? undefined,
        status: params.get('status') ?? undefined,
        weakness_tag: params.get('weakness_tag') ?? undefined,
        prompt_id: params.get('prompt_id') ?? undefined,
        difficulty: params.get('difficulty') ?? undefined,
        active: params.get('active') ?? undefined,
    };
};
export const serializeAdminDrilldownFilters = (filters) => {
    const params = new URLSearchParams();
    const entries = Object.entries(filters).sort(([a], [b]) => a.localeCompare(b));
    entries.forEach(([key, value]) => {
        if (value !== undefined && `${value}`.length > 0)
            params.set(key, `${value}`);
    });
    const query = params.toString();
    return query ? `?${query}` : '';
};
