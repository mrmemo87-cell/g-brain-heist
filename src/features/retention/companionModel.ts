export type CompanionPalette = 'cyan' | 'pink' | 'violet';
export interface CompanionProfile { name: string; palette: CompanionPalette; }
export const CREW_MESSAGES = {
  cheer: 'You’ve got this!', together: 'We’re in this together', nice_work: 'Nice work, crew!',
  keep_going: 'Every small step counts. Keep exploring.', proud: 'I’m proud of the effort you’re putting in.', curiosity: 'Your questions and curiosity matter here.',
} as const;
export type CrewSignal = keyof typeof CREW_MESSAGES;
export interface CrewMemory { title?: string; kind: CrewSignal; teacher_name: string; created_at: string; }
export interface CrewRoom {
  id: string; title: string; total: number; completed: number; sent_today: boolean;
  cheers: { kind: CrewSignal; count: number }[]; encouragement: CrewMemory | null;
}
export interface CompanionSnapshot { enabled: boolean; companion?: CompanionProfile; crews: CrewRoom[]; memories: CrewMemory[]; }
export const MYSTERY_CHAPTERS = [
  { title: 'The missing signal', line: 'Echo picks up a strange pulse beneath the city. Someone left a key-shaped clue.', clue: 'The key does not open a door. It wakes something up.' },
  { title: 'A room full of echoes', line: 'Inside the hideout, every clue lights a different window. Echo spots a pattern.', clue: 'The pattern is a map made from everyone’s small steps.' },
  { title: 'The silent rooftop', line: 'The map leads to a rooftop antenna. Echo needs one more connection to power it.', clue: 'A message arrives: “You never had to solve this alone.”' },
  { title: 'The crew connection', line: 'The antenna lights up. Across the skyline, other crews answer the signal.', clue: 'Case closed: curiosity brought you here. Teamwork carried you further.' },
] as const;
export function hideoutStage(room?: Pick<CrewRoom, 'total' | 'completed'>) {
  if (!room || room.total < 1) return 0;
  const ratio = Math.max(0, Math.min(1, room.completed / room.total));
  return ratio >= 1 ? 3 : ratio >= .5 ? 2 : ratio > 0 ? 1 : 0;
}
export function companionError(error: unknown) {
  const text = error && typeof error === 'object' && 'message' in error ? String(error.message) : '';
  if (text.includes('TRIAL_PAUSED')) return 'The trial is paused. Your usual tools are still available.';
  if (text.includes('SAVE_COOLDOWN')) return 'Give your last change a few seconds, then save again.';
  if (text.includes('NOT_AUTHORIZED')) return 'This crew room is not available to your account.';
  return 'Could not save just now. Your choices are still here—try again.';
}
