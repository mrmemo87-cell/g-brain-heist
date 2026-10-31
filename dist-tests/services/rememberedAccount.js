export const REMEMBERED_ACCOUNT_KEY = 'bh_remembered_account_v1';
const INTENT_KEY = 'bh_remember_account_intent_v1';
const ACCOUNT_LIFETIME = 90 * 24 * 60 * 60 * 1000;
const INTENT_LIFETIME = 30 * 60 * 1000;
const storage = (kind) => {
    try {
        return typeof window === 'undefined' ? null : window[kind];
    }
    catch {
        return null;
    }
};
const remove = (kind, key) => {
    try {
        storage(kind)?.removeItem(key);
    }
    catch { /* Storage is optional. */ }
};
const read = (kind, key) => {
    try {
        return JSON.parse(storage(kind)?.getItem(key) ?? 'null');
    }
    catch {
        return null;
    }
};
const isEmail = (value) => typeof value === 'string'
    && value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
export const readRememberedAccount = () => {
    const saved = read('localStorage', REMEMBERED_ACCOUNT_KEY);
    if (!saved || saved.version !== 1 || !isEmail(saved.email)
        || typeof saved.userId !== 'string' || !saved.userId || saved.userId.length > 128
        || typeof saved.name !== 'string' || !saved.name || saved.name.length > 100
        || !['google', 'password'].includes(saved.provider ?? '')
        || typeof saved.expiresAt !== 'number' || saved.expiresAt <= Date.now()
        || saved.expiresAt > Date.now() + ACCOUNT_LIFETIME) {
        remove('localStorage', REMEMBERED_ACCOUNT_KEY);
        return null;
    }
    // Select the allowlisted display fields; never propagate arbitrary cached data.
    return { version: 1, userId: saved.userId, email: saved.email, name: saved.name,
        provider: saved.provider, expiresAt: saved.expiresAt };
};
export const clearRememberAccountIntent = () => remove('sessionStorage', INTENT_KEY);
export const forgetRememberedAccount = () => {
    remove('localStorage', REMEMBERED_ACCOUNT_KEY);
    clearRememberAccountIntent();
};
/** Carry an explicit choice across the Google redirect, without storing credentials. */
export const prepareRememberAccount = (remember, provider) => {
    try {
        storage('sessionStorage')?.setItem(INTENT_KEY, JSON.stringify({
            remember, provider, expiresAt: Date.now() + INTENT_LIFETIME,
        }));
    }
    catch { /* Sign-in must still work when storage is blocked. */ }
};
export const rememberAuthenticatedAccount = (user) => {
    const intent = read('sessionStorage', INTENT_KEY);
    const validIntent = intent && typeof intent.remember === 'boolean'
        && (intent.provider === 'google' || intent.provider === 'password')
        && typeof intent.expiresAt === 'number' && intent.expiresAt > Date.now()
        && intent.expiresAt <= Date.now() + INTENT_LIFETIME;
    clearRememberAccountIntent();
    const previous = readRememberedAccount();
    if (validIntent && !intent.remember) {
        forgetRememberedAccount();
        return;
    }
    if (!validIntent && previous?.userId !== user.id)
        return;
    if (!isEmail(user.email))
        return;
    const displayName = user.user_metadata?.['full_name'] ?? user.user_metadata?.['name'];
    const name = (typeof displayName === 'string' ? displayName.trim() : '') || user.email.split('@')[0];
    const account = {
        version: 1, userId: user.id, email: user.email, name: name.slice(0, 100),
        provider: validIntent ? intent.provider : previous.provider,
        // Background refreshes don't extend consent indefinitely.
        expiresAt: validIntent ? Date.now() + ACCOUNT_LIFETIME : previous.expiresAt,
    };
    try {
        storage('localStorage')?.setItem(REMEMBERED_ACCOUNT_KEY, JSON.stringify(account));
    }
    catch { /* Optional. */ }
};
