import { supabase } from '../../services/supabaseClient.js';
/**
 * Calls `onChange` only when the signed-in account changes (sign-in as someone else, or sign-out).
 * Supabase also emits SIGNED_IN / TOKEN_REFRESHED for the same user when a browser or phone tab
 * regains focus; reacting to those used to unmount whole workspaces behind a loader, which looked
 * like a page reload every time the user came back to the tab.
 */
export function isAccountChange(previousUserId, session) {
    const next = session?.user?.id ?? null;
    return previousUserId === undefined ? false : previousUserId !== next;
}
export function subscribeToAccountChanges(onChange) {
    let current;
    let alive = true;
    void supabase.auth.getSession().then(({ data }) => {
        if (alive && current === undefined)
            current = data.session?.user?.id ?? null;
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
        if (event === 'INITIAL_SESSION') {
            if (current === undefined)
                current = session?.user?.id ?? null;
            return;
        }
        if (current === undefined) {
            current = session?.user?.id ?? null;
            return;
        }
        if (!isAccountChange(current, session))
            return;
        current = session?.user?.id ?? null;
        onChange(session);
    });
    return () => { alive = false; subscription.unsubscribe(); };
}
