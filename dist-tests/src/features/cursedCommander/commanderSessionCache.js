const key = (userId, owned = false) => `bh:commander:practice:v1:${userId}${owned ? ':owned' : ''}`;
const object = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const finite = (n) => typeof n === 'number' && Number.isFinite(n);
const allowedMoves = ['guard', 'focus_target', 'death_bolt', 'chain_surge', 'rot_miasma', 'raise_dead'];
const allowedPowers = ['death_bolt', 'chain_surge', 'rot_miasma', 'raise_dead'];
const allowedSchools = ['neutral', 'void', 'storm', 'rot', 'grave'];
/** The cache is a display/recovery checkpoint, never combat authority. The existing
 * turn endpoint still verifies the HMAC, user binding and expiry on every action. */
export function readCommanderSession(storage, userId, now = Date.now(), owned = false) {
    try {
        const raw = storage.getItem(key(userId, owned));
        if (!raw || raw.length > 64000)
            return null;
        const cache = JSON.parse(raw);
        if (!object(cache) || cache['version'] !== 1 || typeof cache['transcript'] !== 'string' || cache['transcript'].length > 24000)
            return null;
        const parts = cache['transcript'].split('.');
        if (parts.length !== 2 || !parts[1])
            return null;
        const encoded = parts[0].replace(/-/g, '+').replace(/_/g, '/');
        const payload = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(encoded), c => c.charCodeAt(0))));
        if (!object(payload) || payload['v'] !== 1 || payload['sub'] !== userId || !finite(payload['exp']) || payload['exp'] <= now)
            return null;
        const state = payload['state'];
        if (!object(state) || state['version'] !== 1 || !Number.isInteger(state['turn']) || state['turn'] < 1 || !Number.isInteger(state['seed']) || !Number.isInteger(state['maxTurns'])
            || !['active', 'victory', 'defeat', 'draw'].includes(state['status']) || !Array.isArray(state['combatants']) || !state['combatants'].length || !Array.isArray(state['events'])
            || !finite(state['playerDeathBoltCooldown']) || !finite(state['enemyDeathBoltCooldown'])
            || ![null, 'string'].includes(state['playerFocusTarget'] === null ? null : typeof state['playerFocusTarget'])
            || ![null, 'string'].includes(state['enemyFocusTarget'] === null ? null : typeof state['enemyFocusTarget']))
            return null;
        if (state['playerPowers'] !== undefined && (!Array.isArray(state['playerPowers']) || !state['playerPowers'].every((power) => typeof power === 'string' && allowedPowers.includes(power))))
            return null;
        if (!state['combatants'].every((unit) => object(unit) && typeof unit['id'] === 'string' && typeof unit['name'] === 'string'
            && ['player', 'enemy'].includes(unit['side']) && ['commander', 'unit'].includes(unit['role'])
            && (unit['school'] === undefined || (typeof unit['school'] === 'string' && allowedSchools.includes(unit['school'])))
            && (unit['catalogId'] === undefined || typeof unit['catalogId'] === 'string')
            && finite(unit['hp']) && finite(unit['maxHp']) && unit['hp'] >= 0 && unit['maxHp'] > 0 && unit['hp'] <= unit['maxHp']
            && finite(unit['shield']) && unit['shield'] >= 0 && finite(unit['attack'])))
            return null;
        if (new Set(state['combatants'].map((unit) => unit['id'])).size !== state['combatants'].length)
            return null;
        if (!state['events'].every((event) => object(event) && typeof event['id'] === 'string' && typeof event['code'] === 'string' && Number.isInteger(event['turn'])))
            return null;
        const pending = cache['pending'];
        if (pending !== undefined && (!object(pending) || !allowedMoves.includes(pending['move']) || !(pending['targetId'] === null || typeof pending['targetId'] === 'string')))
            return null;
        return { session: { transcript: cache['transcript'], expiresAt: new Date(payload['exp']).toISOString(), battle: state }, pending };
    }
    catch {
        return null;
    }
}
export function saveCommanderSession(storage, userId, session, pending, owned = false) {
    try {
        storage.setItem(key(userId, owned), JSON.stringify({ version: 1, transcript: session.transcript, ...(pending ? { pending } : {}) }));
        return true;
    }
    catch {
        return false;
    }
}
