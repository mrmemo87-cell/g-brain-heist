import type { Profile } from '../types';

// Realtime JSON objects are newly decoded on every event. Compare their values,
// including nested fields, without depending on the order of object keys.
function sameJson(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const left = a as Record<string, unknown>, right = b as Record<string, unknown>;
  const keys = Object.keys(left);
  return keys.length === Object.keys(right).length
    && keys.every(key => Object.hasOwn(right, key) && sameJson(left[key], right[key]));
}

const fields = [
  'xp', 'coins', 'level', 'gemstones', 'ap_now', 'ap_max', 'is_banned', 'banned_until', 'streak',
  'profile_locked', 'role', 'school_id', 'grade', 'batch', 'username', 'avatar_url',
  'attack_power', 'defense_power', 'active_cosmetic_frame', 'active_cosmetic_theme', 'active_cosmetic_effect',
] as const;
export function hasSignificantProfileChange(current: Partial<Profile> | null, next: Partial<Profile>): boolean {
  return fields.some(field => Object.hasOwn(next, field) && next[field] !== current?.[field])
    || (Object.hasOwn(next, 'required_changes')
      && !sameJson(next.required_changes ?? null, current?.required_changes ?? null));
}
