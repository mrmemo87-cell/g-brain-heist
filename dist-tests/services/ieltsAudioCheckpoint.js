export const makeIeltsAudioCheckpointKey = (attemptId, source) => JSON.stringify(['ielts_audio_checkpoint_v1', attemptId, source]);
export function readIeltsAudioCheckpoint(key, storage) {
    try {
        const value = JSON.parse((storage ?? window.localStorage).getItem(key) ?? 'null');
        return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0;
    }
    catch {
        return 0;
    }
}
export function saveIeltsAudioCheckpoint(key, seconds, storage) {
    if (!Number.isFinite(seconds) || seconds < 0)
        return false;
    try {
        (storage ?? window.localStorage).setItem(key, JSON.stringify(seconds));
        return true;
    }
    catch {
        return false;
    }
}
export function restoreIeltsAudioCheckpoint(audio, key, storage) {
    if (!Number.isFinite(audio.duration) || audio.duration <= 0)
        return false;
    const position = Math.min(readIeltsAudioCheckpoint(key, storage), audio.duration);
    try {
        audio.currentTime = position;
        return Math.abs(audio.currentTime - position) < 0.5;
    }
    catch {
        // Some browsers cannot seek until canplay; retry there without autoplay.
        return false;
    }
}
