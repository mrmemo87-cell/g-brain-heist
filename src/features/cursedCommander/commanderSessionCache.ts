import type { CommanderPracticeBattle, CommanderPracticeMove, CommanderPracticeSession } from '../../../services/commanderPracticeService';

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
export type PendingCommanderMove = { move: CommanderPracticeMove; targetId: string | null };
export type CachedCommanderSession = { session: CommanderPracticeSession; pending?: PendingCommanderMove };
const key = (userId: string, owned = false) => `bh:commander:practice:v1:${userId}${owned ? ':owned' : ''}`;
const object = (value: unknown): value is Record<string, any> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);

/** The cache is a display/recovery checkpoint, never combat authority. The existing
 * turn endpoint still verifies the HMAC, user binding and expiry on every action. */
export function readCommanderSession(storage: StorageLike, userId: string, now = Date.now(), owned = false): CachedCommanderSession | null {
  try {
    const raw = storage.getItem(key(userId, owned));
    if (!raw || raw.length > 64000) return null;
    const cache: unknown = JSON.parse(raw);
    if (!object(cache) || cache['version'] !== 1 || typeof cache['transcript'] !== 'string' || cache['transcript'].length > 24000) return null;
    const parts = cache['transcript'].split('.');
    if (parts.length !== 2 || !parts[1]) return null;
    const encoded = parts[0].replace(/-/g, '+').replace(/_/g, '/');
    const payload: unknown = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(encoded), c => c.charCodeAt(0))));
    if (!object(payload) || payload['v'] !== 1 || payload['sub'] !== userId || !finite(payload['exp']) || payload['exp'] <= now) return null;
    const state = payload['state'];
    if (!object(state) || state['version'] !== 1 || !Number.isInteger(state['turn']) || state['turn'] < 1 || !Number.isInteger(state['seed']) || !Number.isInteger(state['maxTurns'])
      || !['active', 'victory', 'defeat', 'draw'].includes(state['status']) || !Array.isArray(state['combatants']) || !state['combatants'].length || !Array.isArray(state['events'])
      || !finite(state['playerDeathBoltCooldown']) || !finite(state['enemyDeathBoltCooldown'])
      || ![null, 'string'].includes(state['playerFocusTarget'] === null ? null : typeof state['playerFocusTarget'])
      || ![null, 'string'].includes(state['enemyFocusTarget'] === null ? null : typeof state['enemyFocusTarget'])) return null;
    if (!state['combatants'].every((unit: unknown) => object(unit) && typeof unit['id'] === 'string' && typeof unit['name'] === 'string'
      && ['player','enemy'].includes(unit['side']) && ['commander','unit'].includes(unit['role'])
      && finite(unit['hp']) && finite(unit['maxHp']) && unit['hp'] >= 0 && unit['maxHp'] > 0 && unit['hp'] <= unit['maxHp']
      && finite(unit['shield']) && unit['shield'] >= 0 && finite(unit['attack']))) return null;
    if (new Set(state['combatants'].map((unit: { id: string }) => unit['id'])).size !== state['combatants'].length) return null;
    if (!state['events'].every((event: unknown) => object(event) && typeof event['id'] === 'string' && typeof event['code'] === 'string' && Number.isInteger(event['turn']))) return null;
    const pending = cache['pending'];
    if (pending !== undefined && (!object(pending) || !['guard','focus_target','death_bolt'].includes(pending['move']) || !(pending['targetId'] === null || typeof pending['targetId'] === 'string'))) return null;
    return { session: { transcript: cache['transcript'], expiresAt: new Date(payload['exp']).toISOString(), battle: state as CommanderPracticeBattle }, pending };
  } catch { return null; }
}
export function saveCommanderSession(storage: StorageLike, userId: string, session: CommanderPracticeSession, pending?: PendingCommanderMove, owned = false): boolean {
  try { storage.setItem(key(userId, owned), JSON.stringify({ version: 1, transcript: session.transcript, ...(pending ? { pending } : {}) })); return true; }
  catch { return false; }
}
