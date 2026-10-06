// Browser recovery data only; never used for scoring, timing or authorization.
type AudioStorage = Pick<Storage, 'getItem' | 'setItem'>;
export const makeIeltsAudioCheckpointKey = (attemptId: string, source: string): string =>
  JSON.stringify(['ielts_audio_checkpoint_v1', attemptId, source]);

export function readIeltsAudioCheckpoint(key: string, storage?: AudioStorage): number {
  try {
    const value: unknown = JSON.parse((storage ?? window.localStorage).getItem(key) ?? 'null');
    return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0;
  } catch {
    return 0;
  }
}

export function saveIeltsAudioCheckpoint(key: string, seconds: number, storage?: AudioStorage): boolean {
  if (!Number.isFinite(seconds) || seconds < 0) return false;
  try {
    (storage ?? window.localStorage).setItem(key, JSON.stringify(seconds));
    return true;
  } catch {
    return false;
  }
}

export function restoreIeltsAudioCheckpoint(
  audio: Pick<HTMLAudioElement, 'duration' | 'currentTime'>,
  key: string,
  storage?: AudioStorage,
): boolean {
  if (!Number.isFinite(audio.duration) || audio.duration <= 0) return false;
  const position = Math.min(readIeltsAudioCheckpoint(key, storage), audio.duration);
  try {
    audio.currentTime = position;
    return Math.abs(audio.currentTime - position) < 0.5;
  } catch {
    // Some browsers cannot seek until canplay; retry there without autoplay.
    return false;
  }
}
