// Per-browser jitter spreads periodic traffic and reconnects. Retry growth is bounded.
export const ieltsRequestDelay = (
  operation: 'save' | 'status' | 'recovery', failures = 0, random = Math.random,
): number => {
  const base = operation === 'save' ? 8000 : operation === 'status' ? 10000 : 500;
  const ceiling = operation === 'recovery' ? 2000 : 60000;
  const exponent = Math.min(4, Math.max(0, failures));
  return Math.round(Math.min(ceiling, base * 2 ** exponent) * (1 + Math.max(0, Math.min(1, random())) * 0.25));
};
