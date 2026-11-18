// Episode 6: What If She Came Back and Forgot?
const MUF = ',lowpass=f=500';
export default {
  narr: 27,
  batches: [
    { file: 'xA.mp3', prefix: 'x', n: 3, vol: 1.9 },
    { file: 'xB.mp3', prefix: 'x', n: 4, start: 4, vol: 1.9 },
    { file: 'bo.mp3', prefix: 'b', n: 4, vol: 2.7 },
    { file: 'ob.mp3', prefix: 'o', n: 3, fx: 'ob', vol: 2.7 },
  ],
  // "ugo+18" means: wait until 18 seconds after the "go" cue, so the on-screen minute is a real minute
  seq: `g0.3 n01 g0.5 n02 g0.8 ctitle g0.4
    cact1 g1.0 b1 g1.0 n03 g1.0 x1 g0.8 x2 g1.0 b2 g0.7 x3 g1.2 n04 g1.0 x4 g0.7 b3 g1.0 n05 g1.8
    cplan g1.8 n06 g0.4 cw1 g3.4 n07 g0.6 cw2 g3.0 n08 g0.8 cw3 g3.0
    cnight g2.0 n09 g1.0 n10 g0.8 x5 g0.8 n11 g0.3 cpull g1.6 n12 g1.2 n13 g1.4
    cgo g0.8 n14 g1.6 n15 ugo+18 n16 ugo+30.5 x6 ugo+36.5 n17 ugo+42 n18 ugo+55 n19 ugo+60 cdone g0.8 n20 g1.2 n21 g2.0
    cafter g0.4 b4 g1.0 x7 g1.4 n22 g1.0 n23 g1.2 n24 g2.2
    cback g1.6 n25 g1.0 cw4 g3.2 n26 g1.4 cobin g1.0 o1 g1.0 o2 g1.0 n27 g1.0 o3 g1.8 cend g4.5`,
  post(C, V, { pauses }) { C.n01p = pauses('n01'); },
  amb: (C, V, total) => [['amb1', 0, total, 0.4], ['amb2', 0, C.act1, 0.3], ['amb2', C.plan, C.night, 0.25], ['amb2', C.pull, C.after, 0.35], ['amb2', C.back, total, 0.3]],
  sfx: (C, V, total) => [
    ['clock', 0.2, 0.3, ''], ['impact', C.title, 0.8, ''], ['ring', V.x2.s, 0.2, ''], ['impact', V.n05.s, 0.3, ''],
    ['steps', C.plan + 0.1, 0.45, ''], ...['w1', 'w2', 'w3'].flatMap((w) => [['RUSTLE', C[w], 0.18, ',lowpass=f=3000'], ['RUSTLE', C[w] + 1.1, 0.18, ',lowpass=f=3000']]),
    ...Array.from({ length: 9 }, (_, i) => ['RUSTLE', C.night + 0.5 + i * 1.96, 0.16, ',lowpass=f=2500,atempo=1.6']),
    ['steps', V.n10.s + 3.2, 0.45, ''], ['RUSTLE', C.pull, 0.8, ',lowpass=f=1800'], ['impact', C.pull + 0.2, 0.6, ''], ['ring', V.n13.s + 1.6, 0.3, ''],
    // one tick per second for the whole minute
    ...Array.from({ length: 60 }, (_, i) => ['CLICK', C.go + i, i >= 50 ? 0.45 : 0.22, ',lowpass=f=4000']),
    ['creak', V.n14.s, 0.4, ''], ['ring', C.go + 36, 0.25, ''],
    ['portal', C.done - 1.0, 0.9, ''], ['impact', C.done, 0.9, ''], ['ring', C.done + 0.6, 0.4, ''],
    ['creak', V.x7.s - 0.4, 0.3, ''], ['impact', V.n23.s, 0.5, ''], ['impact', V.n24.s + 3, 0.4, ''],
    ['steps', C.back + 0.2, 0.45, ''], ['RUSTLE', C.w4, 0.18, ',lowpass=f=3000'], ['RUSTLE', C.w4 + 1.1, 0.18, ',lowpass=f=3000'],
    ['ring', C.obin, 0.3, ''], ['impact', V.o3.e + 0.2, 0.6, ''], ['impact', C.end, 0.8, ''],
  ],
  short: {
    until: (C, V) => V.x3.e + 0.6, cropX: 250,
    title: ['WHAT IF SHE CAME BACK', 'AND FORGOT?'],
    caps: [
      ['b1', ['“I’ve decided. Show me how', 'to take my place back.”']],
      ['n03', ['She smiled at him, a moment late,', 'and poured the tea with the wrong hand.'], ['She was not a careful creature.', 'She had never needed to be.'], ['For forty years, nobody had been', 'able to see her at all.']],
      ['x1', ['“A reflection that is seen by its', 'own person cannot help itself.”']],
      ['x2', ['“In the first second, it’s a twitch.', 'By ten seconds, it’s a habit.”'], ['“By sixty, the glass believes it.', 'And takes back what belongs to it.”']],
      ['b2', ['“That’s all? You just', 'make it copy you?”']],
      ['x3', ['“The person has to start. And the', 'reflection has to be looking.”'], ['“That’s why they never look, Bo.', 'Haven’t you noticed?”'], ['“The one in your house. He never', 'looks in the mirror at all.”']],
    ],
  },
};
