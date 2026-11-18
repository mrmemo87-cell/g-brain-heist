// Episode 10: What If You Had to Choose Which One of You Is Real?
export default {
  narr: 38,
  batches: [
    { file: 'bo.mp3', prefix: 'b', n: 6, vol: 2.7 },
    { file: 'ob.mp3', prefix: 'o', n: 4, fx: 'ob', vol: 2.7 },
    { file: 'm.mp3', prefix: 'm', n: 2, vol: 1.9 },
  ],
  // "ugo+20" waits until 20 seconds after the "go" cue, so the minute on screen is a real minute
  seq: `g0.3 n01 g0.5 n02 g0.8 ctitle g0.4
    cact1 g1.2 n03 g1.0 n04 g1.0 o1 g0.9 b1 g1.2 n05 g1.2 b2 g1.8 n06 g1.2 b3 g1.4 o2 g1.4 n07 g1.0 n34 g1.2 b4 g1.0 o3 g0.9 b5 g1.2 n08 g1.2 n09 g1.0 n10 g0.6
    cgo g1.0 n11 ugo+7 n12 ugo+20 n13 ugo+26 n14 ugo+40.2 n15 ugo+46.2 o4 ugo+52 b6 ugo+54.6 n16 ugo+60 cstop g1.4 n17 g1.0 n18 g1.0 n35 g1.2
    cstep n19 g1.2 n20 g1.2 n21 g1.4 n22 g1.4 n23 g1.0 chand n24 g1.2 n36 g1.8
    cout n25 g1.0 n37 g1.0 cdoor g0.6 m2 g1.6
    cphotos g1.0 n26 g1.4
    cfade g1.0 n27 g1.2 n28 g1.2 n38 g1.8
    chome g1.2 n29 g1.0 n30 g1.6
    cbath g1.4 n31 g1.2 n32 g0.8 cwave g1.6 n33 g3.0 cend g5.5`,
  amb: (C, V, total) => [['amb1', 0, total, 0.38], ['amb2', 0, C.out, 0.32], ['amb2', C.fade, C.home, 0.3]],
  sfx: (C, V, total) => [
    ...Array.from({ length: 6 }, (_, i) => ['CLICK', 0.5 + i * 1.0, 0.3, ',lowpass=f=4000']), ['impact', C.title, 0.8, ''],
    ['clock', C.act1 + 0.3, 0.25, ''], ['ring', V.b2.s - 0.5, 0.25, ''], ['impact', V.b2.e + 0.2, 0.5, ''], ['impact', V.o2.s + 0.9, 0.4, ''], ['ring', V.n07.s, 0.2, ''],
    ['creak', V.n08.s + 0.4, 0.35, ''], ['ring', V.n09.s, 0.2, ''], ['impact', C.go, 0.7, ''],
    ...Array.from({ length: 60 }, (_, i) => ['CLICK', C.go + i, i >= 50 ? 0.45 : 0.22, ',lowpass=f=4000']),
    ['ring', C.go + 41, 0.3, ''], ['portal', C.stop - 1.0, 0.9, ''], ['impact', C.stop, 0.9, ''], ['ring', C.stop + 0.6, 0.4, ''],
    ['steps', C.step + 1.2, 0.4, ''], ['HISS', V.n19.s + 4, 0.4, ''], ['impact', V.n22.s, 0.6, ''], ['creak', C.hand, 0.5, ''], ['impact', V.n24.e - 0.6, 0.7, ''],
    ['steps', C.out + 0.2, 0.45, ''], ['steps', C.out + 2.5, 0.45, ''], ['creak', C.door - 0.3, 0.6, ''],
    ...[0, 1, 2, 3, 4, 5, 6].map((i) => ['RUSTLE', C.photos + 0.9 + i * 0.06, 0.3, ',lowpass=f=3000']), ['impact', C.photos + 1.3, 0.5, ''],
    ['ring', V.n27.s + 6, 0.25, ''], ['clock', C.home + 0.2, 0.3, ''], ['creak', V.n30.s + 3, 0.3, ''],
    ['water', C.bath + 0.2, 0.3, ''], ['ring', C.wave + 0.9, 0.3, ''], ['impact', V.n33.s, 0.6, ''], ['impact', C.end, 0.8, ''],
  ],
  short: {
    until: (C, V) => V.b2.e + 1.6, fullFrame: true,
    title: ['WHAT IF YOU HAD TO CHOOSE', 'WHICH ONE OF YOU IS REAL?'],
    caps: [
      ['n03', ['The last photograph was propped', 'against the bedroom wall.'], ['A baby in a high chair,', 'fading from the chin up.'], ['Behind the glass, Yasmine', 'had stopped writing.'], ['It is hard to write, with', 'a finger you can see through.']],
      ['n04', ['Ob was waiting beside her.', 'He was not smiling.'], ['I had never noticed, in forty years,', 'that he did not always smile.']],
      ['o1', ['“You’ve come to let', 'the minute run.”']],
      ['b1', ['“No. I’ve come to', 'ask you something.”']],
      ['n05', ['Here it was. The question', 'I never asked.'], ['I had carried it backwards', 'through a hundred mirrors.']],
      ['b2', ['“What’s your name?”', '']],
    ],
  },
};
