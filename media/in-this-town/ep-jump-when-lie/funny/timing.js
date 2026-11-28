// Funny cut: every jump and sound cue, from the narration timeline. Comic beat: ~0.3 s pause after each lie, then BOING.
function TIMING(V) {
  const s = (id) => V[id].s, e = (id) => V[id].e;
  const J = [];
  const add = (k, t0, dur, H, sfx = 1) => J.push({ k, t0: +t0.toFixed(3), dur, H, sfx });
  // hook: hero already airborne on frame 0
  for (let t = -0.4; t < e('n01') - 0.6; t += 1.15) add('hero', t, 0.9, 320, t > 0 ? 1 : 0);
  add('hA', s('n01') + 0.5, 0.8, 300, 0); add('hB', s('n01') + 1.1, 0.8, 330, 0);
  add('way', e('n03') + 0.3, 0.8, 320);
  add('fan', e('n05') + 0.3, 99, 900);
  add('terms', e('n07') + 0.3, 99, 0);
  add('job', e('n10') + 0.3, 99, 0);
  add('hike', e('n13') + 0.3, 0.8, 420);
  add('girl', e('n14') + 0.3, 0.6, 330); add('girl', e('n14') + 0.95, 0.75, 520);
  add('weather', e('n15') + 0.3, 99, 0);
  ['c0', 'c1', 'c2', 'c3'].forEach((k, i) => { for (let t = s('n17') - 0.1 + i * 0.2; t < e('n17') + 0.3; t += 0.85 + i * 0.05) add(k, t, 0.65, 260 + i * 30, 0); });
  add('mum', e('n21') + 0.3, 99, 0);
  for (let t = s('n23') - 0.3; t < e('n24') + 2.4; t += 1.2) add('end', t, 0.8, 220, 0);
  const S = [];
  for (const j of J) if (j.sfx) { S.push(['boing', j.t0 - 0.03, j.H > 600 || j.dur > 50 ? 0.85 : 0.65]); if (j.dur < 50) S.push(['thud', j.t0 + j.dur, 0.55]); }
  for (let t = s('n17'); t < e('n17') + 0.2; t += 0.4) S.push(['boing', t, 0.22]);
  const sfxAt = (name, t, v) => S.push([name, t, v]);
  sfxAt('bonk', J.find((j) => j.k === 'fan').t0 + 0.22, 0.8);
  sfxAt('whoosh', J.find((j) => j.k === 'terms').t0 + 0.05, 0.7);
  sfxAt('whoosh', s('n08'), 0.5);
  sfxAt('bonk', J.find((j) => j.k === 'job').t0 + 0.3, 0.6);
  sfxAt('stamp', s('n11') + 0.05, 0.9);
  sfxAt('bonk', J.find((j) => j.k === 'weather').t0 + 0.55, 0.6);
  sfxAt('whoosh', J.find((j) => j.k === 'mum').t0 + 0.05, 0.6);
  sfxAt('thud', s('n22') + 0.1, 0.6);
  return { J, S };
}
if (typeof module !== 'undefined') module.exports = TIMING;
