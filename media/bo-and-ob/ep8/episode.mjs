// Episode 8: What If Nobody Remembered You?
export default {
  narr: 34,
  batches: [
    { file: 'm.mp3', prefix: 'm', n: 5, vol: 1.9 },
    { file: 'bo.mp3', prefix: 'b', n: 4, vol: 2.7 },
    { file: 'obA.mp3', prefix: 'o', n: 3, fx: 'ob', vol: 2.7 },
    { file: 'obB.mp3', prefix: 'o', n: 3, start: 4, fx: 'ob', vol: 2.7 },
  ],
  seq: `g0.3 n01 g0.5 n02 g0.8 ctitle g0.4
    cact1 g1.2 n03 g0.6 n04 g0.9 m1 g1.0 n05 g0.8 b1 g0.7 m2 g1.2 n06 g1.6
    cstairs g1.8 n07 g0.9 n08 g1.0 n09 g0.8 cone n10 g1.8
    cmirror g1.6 n11 g0.5 cw1 g3.4 n12 g1.0 b2 g0.9 o1 g0.9 o2 g1.0 o3 g1.4 n13 g1.0 n14 g1.2 b3 g0.8 o4 g0.9 o5 g1.0 o6 g1.4 n15 g1.0 n16 g1.6
    cdown g1.0 n17 g1.4
    ctry g0.8 n18 g0.6 m3 g1.2 n19 g0.6 m4 g1.4 n20 g0.8 b4 g1.2 n21 g1.0 m5 g1.0 n22 g1.6
    cfive g2.6 n23 g1.4
    csit g1.4 n24 g1.0 n25 g1.2 n26 g1.4 csix g0.5 n27 g1.6 n28 g1.2
    cclose g1.4 n29 g1.2 n30 g1.0 n31 g1.4 n32 g1.2 n33 g1.6 n34 g2.0 cend g4.5`,
  amb: (C, V, total) => [['amb1', 0, total, 0.4], ['amb2', 0, C.act1, 0.25], ['amb2', C.mirror, C.down, 0.3], ['amb2', C.sit, total, 0.32]],
  sfx: (C, V, total) => [
    ['clock', 0.2, 0.25, ''], ...[0, 1, 2, 3, 4, 5, 6].map((i) => ['RUSTLE', V.n02.s + 0.2 + i * 0.32, 0.2, ',lowpass=f=2500']), ['impact', C.title, 0.8, ''],
    ['impact', V.n04.s, 0.4, ''], ['ring', V.m2.s - 0.2, 0.22, ''], ['steps', C.stairs - 1.1, 0.5, ',atempo=1.7'], ['steps', C.stairs + 0.1, 0.5, ',atempo=1.5'],
    ['portal', V.n07.e - 0.5, 0.5, ''], ['ring', V.n08.s + 0.4, 0.3, ''], ['impact', C.one, 0.7, ''],
    ['steps', C.mirror + 0.1, 0.45, ''], ['RUSTLE', C.w1, 0.18, ',lowpass=f=3000'], ['RUSTLE', C.w1 + 1.2, 0.18, ',lowpass=f=3000'],
    ['impact', V.o1.e, 0.3, ''], ['ring', V.o3.s, 0.2, ''], ['impact', V.o3.e + 0.2, 0.5, ''], ['ring', V.n15.s + 2.5, 0.3, ''], ['impact', V.n16.e, 0.4, ''],
    ['portal', V.n17.s + 0.3, 0.45, ''], ['portal', V.n17.s + 1.9, 0.45, ''], ['impact', V.n17.s + 3.2, 0.6, ''],
    ['steps', V.n19.s, 0.4, ''], ['steps', V.n20.s, 0.4, ''], ['clock', V.n20.s + 2, 0.25, ''], ['creak', V.n21.s, 0.35, ''], ['impact', V.n22.s + 1.3, 0.5, ''],
    ['portal', C.five, 0.45, ''], ['impact', C.five + 0.4, 0.5, ''], ['portal', C.five + 1.0, 0.45, ''], ['impact', C.five + 1.4, 0.6, ''],
    ['steps', C.five + 2.7, 0.4, ''], ['creak', C.sit + 1.2, 0.5, ''], ['portal', C.six - 0.3, 0.5, ''], ['impact', C.six + 0.6, 0.6, ''],
    ['creak', V.n28.e - 0.8, 0.4, ''], ['clock', C.close + 0.4, 0.3, ''], ['ring', V.n29.e - 1.9, 0.4, ''], ['impact', V.n29.e - 0.2, 0.6, ''],
    ['impact', V.n31.s, 0.6, ''], ['impact', V.n34.s, 0.9, ''], ['impact', C.end, 0.8, ''],
  ],
  short: {
    until: (C, V) => V.n09.e + 0.9, fullFrame: true,
    title: ['WHAT IF NOBODY', 'REMEMBERED YOU?'],
    caps: [
      ['n03', ['Her mother was back. The real one.', 'She remembered nothing.'], ['Not the glass. Not the dark.', ''], ['She hummed, and laid', 'the table for breakfast.']],
      ['n04', ['One plate.', '']],
      ['m1', ['“Eat up, sweetheart.”', '']],
      ['n05', ['She was talking to the boy who had', 'slept in her daughter’s bed...'], ['as if he had always', 'slept in it.']],
      ['b1', ['“Where’s Yasmine?”', '']],
      ['m2', ['“Who, darling?”', '']],
      ['n06', ['She said it the way you ask about', 'someone in a book you have not read.']],
      ['n07', ['He ran for the stairs.', ''], ['A girl on a beach. A girl', 'on a bicycle.'], ['A girl with no front teeth,', 'holding up a fish.']],
      ['n08', ['The first frame had changed.', 'The same beach. The same hat.'], ['But the child under the hat...', 'was him.']],
      ['n09', ['Bo had never been', 'to a beach in his life.']],
    ],
  },
};
