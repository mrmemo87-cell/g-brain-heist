/**
 * Unified Clan Color System
 * ─────────────────────────
 * Single source of truth for clan color assignment across all game modes
 * (Clan Territory, Lockdown, etc.).
 *
 * Design:
 *  - 24-color curated palette of high-contrast, colorblind-friendly(ish) hex values.
 *  - `assignSessionClanColor()` picks the next unused color from the palette,
 *    guaranteeing no two clans in the same session share a color.
 *  - `getClanColor()` is the fallback hash-to-palette function (deterministic,
 *    but collision-prone for small palettes). Consumers should prefer the
 *    session-aware function when a session context is available.
 */

// ── 24 high-contrast hex colors ────────────────────────────────────────────
// Chosen for maximum visual distinctiveness on dark backgrounds.
export const SESSION_COLOR_PALETTE: readonly string[] = [
  "#e11d48", // rose-600
  "#2563eb", // blue-600
  "#16a34a", // green-600
  "#f59e0b", // amber-500
  "#9333ea", // purple-600
  "#0d9488", // teal-600
  "#db2777", // pink-600
  "#06b6d4", // cyan-500
  "#f97316", // orange-500
  "#6366f1", // indigo-500
  "#84cc16", // lime-500
  "#ec4899", // pink-500
  "#0ea5e9", // sky-500
  "#ef4444", // red-500
  "#14b8a6", // teal-500
  "#8b5cf6", // violet-500
  "#eab308", // yellow-500
  "#d946ef", // fuchsia-500
  "#22c55e", // green-500
  "#3b82f6", // blue-500
  "#f43f5e", // rose-500
  "#a855f7", // purple-500
  "#10b981", // emerald-500
  "#64748b", // slate-500
] as const;

// ── Deterministic hash → palette (fallback, NOT session-aware) ─────────────
const hashString = (str: string): number => {
  let hash = 0;
  for (let i = 0; i < str.length; i += 1) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
};

/**
 * Deterministic fallback: hash a clan ID to a palette color.
 * Use only when no session context is available.
 */
export const getClanColor = (clanId: string): string => {
  return SESSION_COLOR_PALETTE[hashString(clanId) % SESSION_COLOR_PALETTE.length];
};

// ── Session-aware unique assignment ────────────────────────────────────────

/**
 * Given the set of colors already assigned in the current session,
 * pick the next available palette color for a new clan.
 *
 * Priority:
 *  1. `preferredColor` (e.g. from the DB) — used if not already taken.
 *  2. Deterministic hash pick — used if not already taken.
 *  3. First unused palette slot.
 *  4. HSL hue-rotation fallback (for >24 clans).
 */
export const assignSessionClanColor = (
  clanId: string,
  usedColors: Set<string>,
  preferredColor?: string | null,
): string => {
  // 1. Try the preferred / DB color first
  if (preferredColor && !usedColors.has(preferredColor)) {
    return preferredColor;
  }

  // 2. Try the deterministic hash pick
  const hashPick = SESSION_COLOR_PALETTE[hashString(clanId) % SESSION_COLOR_PALETTE.length];
  if (!usedColors.has(hashPick)) {
    return hashPick;
  }

  // 3. First unused palette slot
  for (const color of SESSION_COLOR_PALETTE) {
    if (!usedColors.has(color)) {
      return color;
    }
  }

  // 4. All 24 taken — generate a unique HSL color via hue rotation
  const baseHue = hashString(clanId) % 360;
  let hue = baseHue;
  let attempts = 0;
  let color = `hsl(${hue}, 70%, 55%)`;
  while (usedColors.has(color) && attempts < 36) {
    hue = (hue + 37) % 360; // golden-angle-ish step
    color = `hsl(${hue}, 70%, 55%)`;
    attempts += 1;
  }
  return color;
};

/**
 * Build the set of colors already used by clans in a session.
 * Works for both Clan Territory (`ClanMetadata`) and Lockdown (`PlayerState`)
 * state shapes.
 */
export const getUsedSessionColors = (
  clans: Record<string, { color?: string }>,
): Set<string> => {
  return new Set(
    Object.values(clans)
      .map((c) => c.color)
      .filter((c): c is string => Boolean(c)),
  );
};

/** Default / neutral color when no clan is assigned */
export const NEUTRAL_COLOR = "#10b981"; // emerald-500
