export const ECHO_POSES = ['greeting', 'curious', 'thinking', 'celebrate', 'cheer', 'keepsake'] as const;
export type EchoPose = typeof ECHO_POSES[number];
export const ECHO_POSE_LABELS: Record<EchoPose, string> = {
 greeting: 'Hello, partner!', curious: 'A clue worth following.', thinking: 'One question at a time.',
 celebrate: 'A saved step forward!', cheer: 'The crew has your back.', keepsake: 'Good encouragement stays with you.',
};
export const echoAsset = (pose: EchoPose) => pose === 'greeting' ? '/retention/heist-companion-v1.webp' : `/retention/echo-${pose}-v1.webp`;
export interface EchoPosition { x: number; y: number; }
export function clampEchoPosition(position: EchoPosition, width: number, height: number, size = 152): EchoPosition {
 const maxX = Math.max(8, width - size - 8); const maxY = Math.max(8, height - 220 - 100);
 return { x: Math.min(maxX, Math.max(8, position.x)), y: Math.min(maxY, Math.max(8, position.y)) };
}
export function dockEchoPosition(position: EchoPosition, width: number, height: number): EchoPosition {
 const bounded = clampEchoPosition(position, width, height);
 return { ...bounded, x: bounded.x + 76 < width / 2 ? 8 : Math.max(8, width - 160) };
}
const preferenceKey = (id: string) => `bh:echo-float:v1:${id}`;
export function readEchoPreference(id: string): { enabled: boolean; tucked: boolean; position: EchoPosition | null } {
 try {
  const saved = JSON.parse(localStorage.getItem(preferenceKey(id)) ?? '{}');
  const position = saved.position && Number.isFinite(saved.position.x) && Number.isFinite(saved.position.y) ? { x: saved.position.x, y: saved.position.y } : null;
  return { enabled: saved.enabled === true, tucked: saved.tucked === true, position };
 } catch { return { enabled: false, tucked: false, position: null }; }
}
export function saveEchoPreference(id: string, value: ReturnType<typeof readEchoPreference>) {
 try { localStorage.setItem(preferenceKey(id), JSON.stringify(value)); } catch { /* Optional device preference. */ }
}
export const ECHO_ACTIVITY_EVENT = 'bh:echo-activity';
export function announceEchoActivity(userId: string, pose: EchoPose, practicing?: boolean) {
 if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(ECHO_ACTIVITY_EVENT, { detail: { userId, pose, practicing } }));
}
