// Shared by the scene (browser) and the audio mix (node): every jump and sound cue, derived from the narration timeline.
// Jump: {k: who, t0: take-off, dur: airtime, H: height px, sfx: play boing/thud}
function TIMING(V) {
  const s = (id) => V[id].s, e = (id) => V[id].e;
  const J = [];
  const add = (k, t0, dur, H, sfx = 1) => J.push({ k, t0: +t0.toFixed(3), dur, H, sfx });
  // hook street: the hero is already in the air on frame 0, then everybody hops
  const hookEnd = s('n03');
  for (let t = -0.42; t < hookEnd - 0.9; t += 1.25) add('hero', t, 0.9, 300, t > 0 ? 1 : 0);
  for (let t = s('n02') + 0.05; t < hookEnd - 0.8; t += 1.1) add('hA', t, 0.8, 330, 0);
  for (let t = s('n02') + 0.35; t < hookEnd - 0.8; t += 1.0) add('hB', t, 0.75, 300, 0);
  for (let t = s('n02') + 0.6; t < hookEnd - 0.8; t += 1.2) add('hC', t, 0.85, 380, 0);
  add('fine', e('n03') + 0.05, 0.8, 380);
  add('five', e('n04') + 0.05, 0.8, 400);
  add('terms', e('n05') + 0.05, 1.7, 2300);
  // whole street bounces (n06) and the tall-ceiling house (n07a)
  const st = s('n06'), mid7 = s('n07') + 0.45 * (e('n07') - s('n07'));
  ['b0', 'b1', 'b2', 'b3', 'b4'].forEach((k, i) => { for (let t = st - 0.1 + i * 0.22; t < mid7 - 0.6; t += 0.95 + i * 0.05) add(k, t, 0.7, 260 + i * 25, 0); });
  add('leo', e('n08') + 0.05, 1.0, 470);
  add('teach', e('n10') + 0.05, 1.0, 900);
  add('mayor', e('n12') + 0.05, 99, 0);
  add('dad', e('n18') + 0.05, 0.85, 420);
  const st2 = s('n19') - 0.15;
  ['b0', 'b1', 'b2', 'b3', 'b4'].forEach((k, i) => { for (let t = st2 + i * 0.18; t < e('n19') + 1.4; t += 0.9 + i * 0.05) add('r' + k, t, 0.7, 260 + i * 25, 0); });
  for (let t = s('n20') - 1.2; t < e('n20') + 2.6; t += 1.3) add('end', t, 0.8, 200, 0);
  // sound cues: [name, time, volume]
  const S = [];
  for (const j of J) if (j.sfx) { S.push(['boing', j.t0 - 0.03, j.H > 1000 ? 0.85 : 0.6]); if (j.dur < 50) S.push(['thud', j.t0 + j.dur, j.H > 1000 ? 0.9 : 0.55]); }
  // soft bouncing street beds
  for (const [a, b] of [[st, mid7], [st2, e('n19') + 1.2]]) for (let t = a; t < b; t += 0.42) S.push(['boing', t, 0.22]);
  const teach = J.find((j) => j.k === 'teach');
  S.push(['bonk', teach.t0 + 0.23, 0.8]);
  const leo = J.find((j) => j.k === 'leo');
  S.push(['bonk', leo.t0 + 0.45, 0.6]);
  S.push(['whoosh', e('n12') + 0.1, 0.7]);
  S.push(['tick', s('n14') + 0.2, 0.3], ['tick', s('n17'), 0.4]);
  return { J, S };
}
if (typeof module !== 'undefined') module.exports = TIMING;
