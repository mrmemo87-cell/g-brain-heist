/**
 * Converts a practice recording (webm/opus, mp4/aac, ogg...) into the exact 16 kHz, mono, 16-bit PCM WAV that the
 * audio-grounded Speaking feedback accepts (see supabase/functions/_shared/ieltsSpeakingAudio.ts). Browser-only.
 */
export const SPEAKING_WAV_RATE = 16000;
export const SPEAKING_WAV_MAX_SECONDS = 355;

type AudioContextCtor = typeof AudioContext;

export async function toSpeakingWav(source: Blob): Promise<Blob> {
  const w = window as unknown as { AudioContext?: AudioContextCtor; webkitAudioContext?: AudioContextCtor };
  const Ctor = w.AudioContext ?? w.webkitAudioContext;
  if (!Ctor || typeof OfflineAudioContext === 'undefined') throw new Error('audio_unsupported');
  const decoder = new Ctor();
  let decoded: AudioBuffer;
  try {
    decoded = await decoder.decodeAudioData(await source.arrayBuffer());
  } finally {
    void decoder.close?.();
  }
  const seconds = Math.min(decoded.duration, SPEAKING_WAV_MAX_SECONDS);
  const frames = Math.max(1, Math.floor(seconds * SPEAKING_WAV_RATE));
  const offline = new OfflineAudioContext(1, frames, SPEAKING_WAV_RATE);
  const node = offline.createBufferSource();
  node.buffer = decoded;
  node.connect(offline.destination);
  node.start(0);
  const rendered = await offline.startRendering();
  return encodeWav(rendered.getChannelData(0));
}

export function encodeWav(samples: Float32Array): Blob {
  const data = samples.length * 2;
  const buffer = new ArrayBuffer(44 + data);
  const v = new DataView(buffer);
  const ascii = (offset: number, text: string) => { for (let i = 0; i < text.length; i++) v.setUint8(offset + i, text.charCodeAt(i)); };
  ascii(0, 'RIFF'); v.setUint32(4, 36 + data, true); ascii(8, 'WAVE');
  ascii(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, SPEAKING_WAV_RATE, true); v.setUint32(28, SPEAKING_WAV_RATE * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  ascii(36, 'data'); v.setUint32(40, data, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i] ?? 0));
    v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([buffer], { type: 'audio/wav' });
}
