// Episode 9: What If the Mirror Was Watching Back?
export default {
  narr: 40,
  batches: [
    { file: 'bo.mp3', prefix: 'b', n: 7, vol: 2.7 },
    { file: 'm.mp3', prefix: 'm', n: 2, vol: 1.9 },
  ],
  seq: `g0.3 n01 g0.5 n02 g0.8 ctitle g0.4
    cact1 g1.2 n03 g0.8 n04 g0.9 n05 g0.5 b1 g1.0 n06 g1.0 n07 g2.0
    croom g2.4 n08 g1.2 b2 g0.9 n09 g1.0 n38 g1.2 b3 g0.8 n10 g1.2 b4 g0.9 n11 g1.0 n31 g1.4 b5 g0.9 n12 g1.0 n39 g1.0 cnote n13 g0.8 cnote2 n14 g0.8 cnoteoff g0.6 n32 g1.2 n15 g0.9 n16 g1.0 n33 g1.4
    cmom g0.8 m1 g1.0 n17 g1.6 cyou g0.6 n18 g1.2 n34 g1.6 cback g0.6
    b6 g1.0 n19 g1.0 n20 g1.0 n21 g1.0 n35 g1.2 n40 g1.2 n22 g1.0 b7 g1.4 n23 g1.6 n24 g1.2 n36 g1.4 n25 g1.2
    cphoto g1.2 n26 g1.0 n27 g1.0 n37 g1.2 n28 g1.8 clast g0.8 n29 g1.2 n30 g2.2 cend g4.5`,
  amb: (C, V, total) => [['amb1', 0, total, 0.36], ['amb2', 0, total, 0.3]],
  sfx: (C, V, total) => [
    ['ring', 0.2, 0.25, ''], ['impact', V.n02.e - 0.4, 0.5, ''], ['impact', C.title, 0.8, ''],
    ['clock', C.act1 + 0.3, 0.25, ''], ['impact', V.n04.s, 0.5, ''], ['creak', V.n05.s + 0.2, 0.4, ''], ['ring', V.n06.s, 0.2, ''],
    ['steps', C.room - 1.6, 0.45, ',atempo=1.3'], ['steps', C.room + 0.3, 0.4, ''], ['creak', V.n08.s + 2, 0.3, ''], ['impact', V.n08.e - 3.5, 0.5, ''],
    ['impact', V.n09.e, 0.4, ''], ['ring', V.n11.s, 0.2, ''], ['RUSTLE', C.note, 0.5, ',lowpass=f=2500'], ['RUSTLE', C.note2, 0.5, ',lowpass=f=2500'],
    ['impact', V.n15.s, 0.6, ''], ['creak', C.mom - 0.2, 0.6, ''], ['steps', V.n17.e, 0.35, ''],
    ['ring', C.you, 0.35, ''], ['impact', V.n18.e - 1.2, 0.5, ''], ['impact', V.n19.e, 0.4, ''], ['impact', V.n21.e, 0.3, ''],
    ['ring', V.n23.s - 0.6, 0.3, ''], ['impact', V.n23.e, 0.6, ''], ['clock', C.photo + 0.2, 0.35, ''], ['portal', V.n26.s + 5, 0.35, ''],
    ['impact', V.n28.s, 0.6, ''], ['ring', C.last, 0.25, ''], ['impact', V.n30.e, 0.9, ''], ['impact', C.end, 0.8, ''],
  ],
  short: {
    until: (C, V) => V.n07.e + 0.9, fullFrame: true,
    title: ['WHAT IF THE MIRROR', 'WAS WATCHING BACK?'],
    caps: [
      ['n03', ['He was sitting on the stairs,', 'with the photograph in both hands.'], ['I had told this story so carefully.', 'I had said he, and him, and the boy.'], ['I had kept myself', 'out of every sentence.'], ['And then, with one frame left', 'on the wall... I slipped.']],
      ['n04', ['I said, I was there.', '']],
      ['n05', ['And Bo lifted his head,', 'and looked down the empty hall.']],
      ['b1', ['“Who said that?”', '']],
      ['n06', ['You have heard my voice since', 'the first morning. He never had.']],
      ['n07', ['The little round mirror, Bo.', 'I cannot hurt you.'], ['I have spent forty years', 'finding that out.']],
    ],
  },
};
