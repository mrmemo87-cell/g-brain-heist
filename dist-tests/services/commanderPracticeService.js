import { supabase } from './supabaseClient.js';
const extractFunctionError = async (error, data) => {
    if (data?.error)
        return data.error;
    if (error && typeof error === 'object' && 'context' in error) {
        const context = error.context;
        if (context instanceof Response) {
            try {
                const payload = await context.clone().json();
                if (typeof payload?.error === 'string' && payload.error)
                    return payload.error;
            }
            catch {
                // Fall through to the connector error below.
            }
        }
    }
    if (error instanceof Error && error.message)
        return error.message;
    return 'commander_preview_unavailable';
};
const requireSession = async (data, error) => {
    if (error || !data?.ok)
        throw new Error(await extractFunctionError(error, data));
    if (!data.transcript || !data.expiresAt || !data.battle) {
        throw new Error('invalid_commander_preview_response');
    }
    return {
        transcript: data.transcript,
        expiresAt: data.expiresAt,
        battle: data.battle,
    };
};
export async function startCommanderPractice(signal, ownedLoadout = false) {
    const { data, error } = await supabase.functions.invoke('commander_practice', {
        signal,
        body: { action: 'start', ...(ownedLoadout ? { loadout: 'owned' } : {}) },
    });
    return requireSession(data, error);
}
export async function submitCommanderPracticeTurn(transcript, move, targetId, signal) {
    const { data, error } = await supabase.functions.invoke('commander_practice', {
        signal,
        body: {
            action: 'turn',
            transcript,
            move,
            targetId: targetId ?? null,
        },
    });
    return requireSession(data, error);
}
