export default {
  narr: 7, batches: [],
  seq: `g0.3 n01 g0.5 n02 g0.7 n03 g0.6 n04 g0.6 n05 g0.6 n06 g0.9 n07 g1.2 cend g2.6`,
  amb: (C, V, total) => [['amb2', 0, total, 0.25]],
  sfx: (C, V, total) => [['ring', 0.3, 0.2, ''], ...Array.from({ length: 8 }, (_, i) => ['crack', V.n03.s + i * ((V.n04.s - V.n03.s) / 8), 0.35, '']),
    ['brush', V.n04.s + 0.5, 0.4, ''], ['impact', V.n05.s, 0.7, ''], ['ring', V.n05.s + 0.3, 0.3, ''], ['creak', V.n06.s, 0.4, ''], ['impact', V.n07.s, 0.6, ''], ['impact', C.end, 0.7, '']],
};
