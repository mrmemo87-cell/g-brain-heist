export default {
  narr: 7, batches: [],
  seq: `g0.3 n01 g0.5 n02 g0.7 n03 g0.6 n04 g0.8 n05 g0.8 n06 g0.8 n07 g1.0 cend g2.6`,
  amb: (C, V, total) => [['amb2', 0, total, 0.25]],
  sfx: (C, V, total) => [['steps', 0.3, 0.3, ''], ['steps', V.n02.s, 0.3, ''], ['clock', V.n03.s, 0.25, ''], ['HISS', V.n04.s + 1.6, 0.6, ''], ['impact', V.n04.s + 1.7, 0.4, ''],
    ['ring', V.n06.s + 0.4, 0.4, ''], ['impact', V.n07.s, 0.6, ''], ['impact', C.end, 0.7, '']],
};
