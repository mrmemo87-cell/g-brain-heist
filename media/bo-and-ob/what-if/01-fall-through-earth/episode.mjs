export default {
  narr: 12, batches: [],
  seq: `g0.2 n01 g0.2 cpoll g0.2 n02 g3.3 cfall n03 g0.3 n04 g0.4 n05 g0.4 n06 g0.6 n07 g0.3 n08 g0.2 cout g0.8 n09 g0.8 n10 g0.5 n11 g0.6 n12 g2.2 cend g2.2`,
  amb: (C, V, total) => [['amb2', C.fall, C.out, 0.35]],
  sfx: (C, V, total) => [['portal', 0.6, 0.35, ''], ...[0, 1, 2].map((i) => ['CLICK', C.poll + 0.2 + i * 0.15, 0.4, '']),
    ...[0, 1, 2].map((i) => ['ring', V.n02.e + i * 1.05, 0.3, '']), ['impact', C.fall, 0.6, ''], ['HISS', C.fall + 0.2, 0.5, ''],
    ['HISS', V.n04.s + 0.5, 0.45, ''], ['impact', V.n05.s + 0.7, 0.6, ''], ['portal', V.n06.s + 1, 0.5, ''], ['ring', V.n06.s + 2.4, 0.4, ''],
    ['land', C.out, 0.6, ''], ['impact', V.n09.s, 0.8, ''], ['ring', V.n09.s + 0.5, 0.4, ''], ['creak', V.n10.s + 1.2, 0.4, ''], ['portal', V.n10.s + 1.6, 0.4, ''],
    ['HISS', V.n11.s + 0.6, 0.5, ''], ['impact', V.n12.s, 0.5, ''], ...[0, 1].map((i) => ['CLICK', V.n12.s + 0.3 + i * 0.15, 0.4, '']), ['impact', C.end, 0.6, '']],
};
