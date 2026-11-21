export default {
  narr: 7, batches: [],
  seq: `g0.3 n01 g0.4 n02 g0.8 n03 g0.6 n04 g0.6 n05 g0.6 n06 cstop g1.6 n07 g0.8 cend g2.6`,
  amb: (C, V, total) => [['amb2', 0, total, 0.3]],
  sfx: (C, V, total) => [['clock', 0.2, 0.3, ''], ['ring', V.n02.s, 0.2, ''], ['steps', 0.5, 0.25, ''], ['steps', V.n03.s, 0.25, ''],
    ['CLICK', V.n05.s + 2, 0.4, ''], ['impact', C.stop, 0.5, ''], ['ring', C.stop + 0.8, 0.35, ''], ['impact', V.n07.e - 0.3, 0.7, ''], ['impact', C.end, 0.7, '']],
};
