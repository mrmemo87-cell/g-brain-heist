export default {
  narr: 7, batches: [],
  seq: `g0.3 n01 g0.6 n02 g0.6 n03 g0.8 n04 g0.8 n05 g1.2 n06 g0.8 n07 g1.4 cend g2.6`,
  amb: (C, V, total) => [['amb1', 0, total, 0.3]],
  sfx: (C, V, total) => [...Array.from({ length: 12 }, (_, i) => ['CLICK', V.n01.s + i * ((V.n03.e - V.n01.s) / 12), 0.25, ',lowpass=f=3500']),
    ['ring', V.n04.s + 2.5, 0.3, ''], ['clock', V.n05.s, 0.35, ',atempo=2'], ['portal', V.n06.s + 0.4, 0.5, ''], ['impact', V.n07.s, 0.6, ''], ['HISS', V.n07.s + 0.3, 0.4, ''], ['impact', C.end, 0.7, '']],
};
