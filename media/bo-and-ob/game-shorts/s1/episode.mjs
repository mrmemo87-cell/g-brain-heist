export default {
  narr: 7, batches: [],
  seq: `g0.3 n01 g0.3 coff g0.5 n02 g0.9 n03 g0.6 n04 g0.7 n05 g1.4 n06 g1.0 n07 g0.8 cend g2.6`,
  amb: (C, V, total) => [['amb2', 0, total, 0.35]],
  sfx: (C, V, total) => [['CLICK', 0.3, 0.3, ''], ['impact', C.off, 0.6, ''], ['HISS', C.off, 0.35, ''],
    ...[0, 1, 2, 3, 4].map((i) => ['ring', V.n02.s + 0.3 + i * 0.32, 0.12, '']), ...[0, 1, 2, 3, 4].map((i) => ['CLICK', V.n05.s + 1 + i * 0.35, 0.35, ',lowpass=f=3000']),
    ['creak', V.n06.s, 0.4, ''], ['impact', V.n07.s, 0.7, ''], ['impact', C.end, 0.7, '']],
};
