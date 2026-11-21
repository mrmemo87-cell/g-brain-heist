// Episode 5: What If the Impostor Loved Her?
const MUF = ',lowpass=f=500';
export default {
  narr: 30,
  batches: [
    { file: 'xA.mp3', prefix: 'x', n: 6, vol: 1.9 },
    { file: 'xB.mp3', prefix: 'x', n: 6, start: 7, vol: 1.9 },
    { file: 'bo.mp3', prefix: 'b', n: 5, vol: 2.7 },
    { file: 'ob.mp3', prefix: 'o', n: 3, fx: 'ob', vol: 2.7 },
  ],
  seq: `g0.3 n01 g0.5 n02 g0.7 ctitle g0.4
    cact1 g1.2 n03 g0.8 n04 g1.0 x1 g1.0 n05 g1.0 x2 g0.7 b1 g0.6 x3 g1.0 n06 g1.0 x4 g1.6
    crun g2.6 n07 g0.6 cpull g1.6 n08 g1.0 n09 g1.0 n10 g1.0 n11 g1.2 clook g1.0 n12 g1.0 cwho g3.0 n13 g1.0 b2 g1.8
    ctable g1.8 n14 g1.0 b3 g0.8 x5 g0.8 x6 g0.8 x7 g0.7 x8 g1.0 n15 g1.0 b4 g0.7 x9 g2.0
    cob g1.4 o1 g0.6 b5 g0.6 o2 g1.0 n16 g0.9 o3 g1.8
    coffer g1.0 n17 g1.0 x10 g0.8 x11 g1.2 n18 g1.0 n19 g1.0 n20 g1.8
    cback g1.6 n21 g0.9 n22 g0.6 cw1 g2.8 n23 g0.8 cw2 g2.8 n24 g1.0 n25 g1.0 cw3 g3.0 n26 g1.0 n27 g1.0 n28 g1.4 cturn g1.2 n29 g1.0 x12 g1.6 csmile g1.4 n30 g1.4 cend g4.5`,
  post(C, V, { pauses }) { C.n01p = pauses('n01'); },
  amb: (C, V, total) => [['amb1', 0, total, 0.4], ['amb2', C.pull, C.table, 0.28], ['amb2', C.ob, C.offer, 0.3], ['amb2', C.back, total, 0.3]],
  sfx: (C, V, total) => [
    ['clock', 0.2, 0.2, ''], ['impact', C.title, 0.8, ''], ['ring', V.x2.s - 0.3, 0.22, ''], ['impact', V.x4.e, 0.4, ''],
    ['steps', C.run, 0.55, ',atempo=1.7'], ['steps', C.run + 1.6, 0.5, ',atempo=1.7'], ['RUSTLE', C.pull, 0.8, ',lowpass=f=1800'], ['impact', V.n08.s, 0.5, ''],
    ['ring', C.look, 0.3, ''], ['RUSTLE', C.who, 0.18, ',lowpass=f=3000'], ['RUSTLE', C.who + 1.1, 0.18, ',lowpass=f=3000'],
    ['steps', C.table + 0.4, 0.45, ''], ['creak', V.n14.s + 4, 0.3, ''], ['steps', V.x9.e + 0.3, 0.4, ''],
    ['ring', C.ob, 0.35, ''], ['knock', C.ob + 0.3, 0.4, MUF], ['creak', C.offer - 0.2, 0.5, ''], ['impact', V.x11.e, 0.5, ''], ['ring', V.n19.s + 3.5, 0.2, ''],
    ['steps', C.back + 0.2, 0.45, ''], ...['w1', 'w2', 'w3'].flatMap((w) => [['RUSTLE', C[w], 0.18, ',lowpass=f=3000'], ['RUSTLE', C[w] + 1.1, 0.18, ',lowpass=f=3000']]),
    ['impact', V.n24.s + 1, 0.4, ''], ['clock', V.n25.s + 0.3, 0.3, ''], ['impact', V.n26.s, 0.7, ''],
    ['creak', C.turn - 0.6, 0.7, ''], ['impact', C.turn, 0.5, ''], ['impact', C.smile, 0.6, ''], ['impact', C.end, 0.8, ''],
  ],
  short: {
    until: (C, V) => V.x3.e + 0.6, cropX: 250,
    title: ['WHAT IF THE IMPOSTOR', 'LOVED HER?'],
    caps: [
      ['n03', ['She did everything right.', 'That was the worst of it.'], ['The kettle, the cups,', 'the little song under her breath.'], ['Only the song ran backwards...', 'and she stirred with the wrong hand.']],
      ['n04', ['She buttered his toast', 'on the wrong side. Small things.'], ['The kind nobody notices, in a person', 'they have already decided to love.']],
      ['x1', ['\u201cEat up, Yasmine.\u201d', '']],
      ['n05', ['Bo did not eat. He watched her scarf.', 'She watched him watching.']],
      ['x2', ['\u201cYou can stop that. I know', 'what you\u2019re looking for.\u201d'], ['\u201cAnd I know', 'you\u2019re not her.\u201d']],
      ['b1', ['\u201cThen what am I?\u201d', '']],
      ['x3', ['\u201cThe same thing I am. Something', 'that came out of the glass,\u201d'], ['\u201cand sat down at a table', 'that wasn\u2019t laid for it.\u201d']],
    ],
  },
};
