export default {
  narr: 12, batches: [],
  seq: `g0.2 n01 g0.2 cpoll g0.2 n02 g3.3 cgo n03 g0.4 n04 g0.4 n05 g0.4 n06 g0.6 cbrain n07 g0.3 n08 g0.6 crec g0.4 n09 g0.4 n10 g0.6 n11 g0.5 cask n12 g2.0 cend g2.2`,
  amb: (C, V, total) => [['amb1', 0, total, 0.25]],
  sfx: (C, V, total) => [['clock', 0.2, 0.35, ''], ...[0, 1, 2].map((i) => ['CLICK', C.poll + 0.2 + i * 0.15, 0.4, '']), ...[0, 1, 2].map((i) => ['ring', V.n02.e + i * 1.05, 0.3, '']),
    ['clock', C.go, 0.3, ',atempo=1.8'], ['impact', V.n04.s, 0.4, ''], ['HISS', V.n05.s + 0.5, 0.4, ''], ['impact', V.n06.s, 0.5, ''], ['portal', V.n06.s + 0.6, 0.4, ''],
    ['water', V.n07.s + 3, 0.4, ''], ['impact', V.n08.s, 0.6, ''], ['RUSTLE', C.rec, 0.6, ''], ['impact', V.n10.s, 0.8, ''], ['ring', V.n10.s + 0.6, 0.4, ''],
    ['creak', V.n11.s + 2, 0.3, ''], ['impact', C.ask, 0.5, ''], ...[0, 1, 2].map((i) => ['CLICK', C.ask + 0.3 + i * 0.15, 0.4, '']), ['impact', C.end, 0.6, '']],
};
