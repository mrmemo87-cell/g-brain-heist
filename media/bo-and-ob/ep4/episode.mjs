// Episode 4: What If Every Mirror Was a Door?
const MUF = ',lowpass=f=500';
export default {
  narr: 45,
  batches: [
    { file: 'mo.mp3', prefix: 'm', n: 6, vol: 1.9 },
    { file: 'bo.mp3', prefix: 'b', n: 10, vol: 2.7 },
    { file: 'obA.mp3', prefix: 'o', n: 3, fx: 'ob', vol: 2.7 },
    { file: 'obB.mp3', prefix: 'o', n: 4, start: 4, fx: 'ob', vol: 2.7 },
  ],
  seq: `g0.3 n01 g0.5 n02 g0.7 ctitle g0.4
    cact1 g1.5 n03 g0.8 n04 g0.8 n05 g1.0 cmomin g1.4 m1 g0.6 b1 g0.6 m2 g1.0 cpull g1.4 n06 g0.9 n07 g1.8
    ckitchen g1.8 m3 g0.8 b2 g0.6 m4 g1.2 n08 g0.9 n09 g1.2 n10 g0.6 ckettle g1.4 n11 g0.8 n12 g1.0 ctap g1.2 n13 g1.2 cspoon g0.5 n14 g0.8 n15 g1.6
    cact3 g1.8 b3 g0.8 cfog g1.0 n16 g0.4 cw1 g3.0 n17 g0.8 b4 g0.6 cw2 g3.0 b5 g0.6 cw3 g3.0 n18 g1.0 n19 g0.4 cw4 g3.0 n20 g0.9 n21 g1.6
    chall g1.4 n22 g0.8 n23 g1.0 n24 g0.5 ccrash g1.6 m5 g0.6 b6 g1.2 n25 g0.9 n26 g1.8
    ccover g1.0 n27 g0.6 n28 g0.6 n29 g0.8 n30 g1.4
    cwindow g1.2 n31 g1.0 n32 g1.4 cobin g1.0 o1 g0.6 b7 g0.6 o2 g0.7 b8 g0.6 o3 g0.8 o4 g1.0 o5 g1.0 n33 g0.9 b9 g0.6 o6 g0.8 b10 g0.6 o7 g1.2 ccurtain g1.8 n34 g1.8
    cwalk g1.4 n35 g1.0 n36 g0.8 ctable g1.6 n37 g1.2 creveal g1.2 n38 g1.4 n39 g1.0 n40 g0.9 n41 g1.6 n42 g1.4 cmom g1.2 m6 g1.2 n43 g1.0 n44 g1.6 csmile g1.4 n45 g1.4 cend g4.5`,
  post(C, V, { pauses }) { C.n01p = pauses('n01'); },
  amb: (C, V, total) => [['amb1', 0, total, 0.4], ['amb2', 0, C.act1, 0.3], ['amb2', C.kettle, C.act3, 0.3], ['amb2', C.cover, total, 0.3]],
  sfx: (C, V, total) => [
    ...Array.from({ length: 11 }, (_, i) => ['CLICK', V.n01.s + 0.2 + i * (V.n01.e - V.n01.s - 0.6) / 11, 0.35, '']),
    ['impact', V.n02.s + 0.3, 0.7, ''], ['impact', C.title, 0.8, ''],
    ['creak', C.momin - 0.6, 0.5, ''], ['steps', C.momin, 0.45, ''], ['RUSTLE', C.pull, 0.7, ',lowpass=f=1800'],
    ...[0.6, 1.2, 1.9].map((d) => ['knock', C.pull + d, 0.4, MUF]), ['steps', V.n07.s + 2.4, 0.4, ''],
    ['ring', C.kettle, 0.3, ''], ['knock', C.tap, 0.6, ',highpass=f=900'], ['knock', C.tap + 1.5, 0.5, ',highpass=f=900,aecho=0.8:0.6:60:0.4'], ['impact', V.n12.s, 0.4, ''],
    ['ring', C.spoon, 0.25, ''], ['impact', V.n15.s, 0.35, ''],
    ['steps', C.act3 + 0.2, 0.45, ''], ['ring', C.fog, 0.22, ''],
    ...['w1', 'w2', 'w3', 'w4'].flatMap((w) => [['RUSTLE', C[w], 0.18, ',lowpass=f=3000'], ['RUSTLE', C[w] + 1.1, 0.18, ',lowpass=f=3000']]),
    ['steps', V.n21.s + 1.2, 0.5, ',atempo=1.7'],
    ['creak', V.n23.s, 0.35, ''], ['steps', C.crash - 1.2, 0.45, ',atempo=1.7'], ['crack', C.crash - 0.05, 0.9, ',atempo=1.8'], ['impact', C.crash, 0.6, ''], ['creak', V.n25.s + 5, 0.4, ''],
    ...Array.from({ length: 6 }, (_, i) => ['RUSTLE', V.n27.e + 0.2 + i * (V.n29.e - V.n27.e - 0.2) / 6, 0.5, ',lowpass=f=1800']),
    ...Array.from({ length: 4 }, (_, i) => ['RUSTLE', V.n30.s + 0.05 + i * (V.n30.e - V.n30.s) / 4, 0.6, ',lowpass=f=1800']),
    ['impact', V.n31.s + 1, 0.4, ''], ['steps', C.window, 0.4, ''], ['ring', C.obin, 0.3, ''],
    ['RUSTLE', C.curtain, 0.8, ',lowpass=f=1500'], ['impact', C.curtain + 0.9, 0.4, ''],
    ['RUSTLE', C.table, 0.6, ',lowpass=f=1800'], ['impact', C.reveal, 0.5, ''], ['ring', V.n38.s, 0.3, ''],
    ['creak', V.n42.s + 0.4, 0.7, ''], ['steps', C.mom - 0.8, 0.4, MUF], ['impact', C.smile, 0.6, ''], ['impact', C.end, 0.8, ''],
  ],
  short: {
    until: (C, V) => V.n05.e + 0.7, cropX: 480,
    title: ['WHAT IF EVERY MIRROR', 'WAS A DOOR?'],
    caps: [
      ['n03', ['The note was still in his fist', 'when the sun came up.'], ['Don\u2019t trust him.', 'He needs you back inside.']],
      ['n04', ['Bo had read it forty times.', 'It had not once changed its mind.']],
      ['n05', ['So he made himself a rule.', ''], ['Whatever Ob wanted,', 'Bo would do the opposite.'], ['It felt like a plan.', 'It was only a direction.']],
    ],
  },
};
