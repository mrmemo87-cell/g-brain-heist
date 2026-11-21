// Episode 7: What If You Were the Reflection?
const MUF = ',lowpass=f=500';
export default {
  narr: 26,
  batches: [
    { file: 'obA.mp3', prefix: 'o', n: 3, fx: 'ob', vol: 2.7 },
    { file: 'obB.mp3', prefix: 'o', n: 3, start: 4, fx: 'ob', vol: 2.7 },
    { file: 'obC.mp3', prefix: 'o', n: 4, start: 7, fx: 'ob', vol: 2.7 },
    { file: 'bo.mp3', prefix: 'b', n: 3, vol: 2.7 },
    { file: 'obD.mp3', prefix: 'o', n: 3, start: 11, fx: 'ob', vol: 2.7 },
    { file: 'bo2.mp3', prefix: 'b', n: 2, start: 4, vol: 2.7 },
  ],
  seq: `g0.3 n01 g0.5 n02 g0.8 ctitle g0.4
    cact1 g1.2 o1 g0.9 b1 g0.8 o2 g1.2 n03 g1.0 n04 g1.6
    cflash g0.8 o3 g0.4 cswap g2.0 n05 g1.0 o4 g1.2 n06 g1.6 cgrow g0.4 o5 g1.2 n20 g1.0 o11 g1.2 n21 g1.6
    cask g1.0 b2 g0.8 o6 g0.9 o7 g1.2 n07 g1.0 n08 g1.4 b4 g0.9 o12 g1.2 n22 g1.0 n23 g1.4 b5 g0.8 o13 g1.4 n24 g1.6 b3 g0.9 o8 g1.2 n09 g1.0 n10 g0.6
    cgo g1.0 o9 ugo+8 n11 ugo+22.5 n12 ugo+33 n13 ugo+39.8 cfog ugo+41 cstop g1.2 n14 g1.0 n15 g1.2 n16 g1.2 o10 g1.4 n25 g1.6 n17 g1.2 n18 g0.4 cw1 g3.4 n19 g1.6 n26 g2.0 cend g4.5`,
  amb: (C, V, total) => [['amb1', C.act1, total, 0.38], ['amb2', 0, total, 0.3]],
  sfx: (C, V, total) => [
    ...[0.6, 1.3, 2.1, 3.0, 4.2, 5.4, 6.6].map((d) => ['knock', d, 0.4, MUF]), ['impact', C.title, 0.8, ''],
    ['ring', V.o1.s - 0.4, 0.25, ''], ['impact', V.n04.s, 0.4, ''],
    ['clock', C.flash, 0.25, ''], ['portal', C.swap - 0.6, 0.7, ''], ['impact', C.swap, 0.7, ''],
    ...[1.0, 1.7, 2.5, 3.4, 4.6].map((d) => ['knock', C.swap + d, 0.4, MUF]), ['steps', V.n05.s + 2, 0.3, ',atempo=1.4'],
    ['impact', V.n06.e, 0.4, ''], ['clock', C.grow, 0.3, ',atempo=1.5'],
    ['ring', V.o8.e, 0.25, ''], ['creak', V.n09.s, 0.4, ''], ['impact', C.go, 0.6, ''],
    ...Array.from({ length: 41 }, (_, i) => ['CLICK', C.go + i, i >= 34 ? 0.45 : 0.22, ',lowpass=f=4000']),
    ['ring', V.n10.s, 0.3, ''], ['portal', V.n10.s - 0.3, 0.4, ''], ['RUSTLE', C.fog, 0.6, ',lowpass=f=1200'], ['impact', C.stop, 0.8, ''],
    ['creak', V.n17.s + 0.5, 0.4, ''], ['RUSTLE', C.w1, 0.18, ',lowpass=f=3000'], ['RUSTLE', C.w1 + 1.1, 0.18, ',lowpass=f=3000'],
    ['impact', V.n19.s, 0.6, ''], ['ring', V.o12.s + 2, 0.2, ''], ['impact', V.o13.e + 0.2, 0.5, ''], ['clock', V.n20.s, 0.25, ''], ['impact', V.n26.e - 0.5, 0.5, ''], ['impact', C.end, 0.8, ''],
  ],
  short: {
    until: (C, V) => V.n04.e + 0.8, fullFrame: true,
    title: ['WHAT IF YOU WERE', 'THE REFLECTION?'],
    caps: [
      ['o1', ['“Somebody walked out of your mirror', 'eleven years ago, and forgot.”'], ['“You’ve been wondering', 'which of us it was.”'], ['“I have never', 'had to wonder.”']],
      ['b1', ['“You’re lying. I remember', 'my mother’s kitchen.”']],
      ['o2', ['“You remember photographs, Bo.', 'Stories they told you at dinner.”'], ['“Tell me one thing', 'from before you were four”'], ['“that nobody ever showed', 'you a picture of.”']],
      ['n03', ['He had a hundred memories.', ''], ['Every one of them', 'had a frame around it.']],
      ['n04', ['Except the first.', 'The tiles. The crying.']],
    ],
  },
};
