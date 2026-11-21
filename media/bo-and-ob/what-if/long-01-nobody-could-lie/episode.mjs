// What if nobody could lie for 24 hours? (standalone explainer, 16:9)
export default {
  narr: 57,
  batches: [
    { file: 'p.mp3', prefix: 'p', n: 3, vol: 2.2 }, { file: 'y.mp3', prefix: 'y', n: 4, vol: 2.4 }, { file: 'b.mp3', prefix: 'b', n: 2, vol: 2.2 },
    { file: 'k.mp3', prefix: 'k', n: 1, vol: 2.0 }, { file: 'c.mp3', prefix: 'c', n: 1, vol: 2.2 }, { file: 'i.mp3', prefix: 'i', n: 1, vol: 2.2 },
    { file: 'j.mp3', prefix: 'j', n: 1, vol: 2.2 }, { file: 's.mp3', prefix: 's', n: 1, vol: 2.2 }, { file: 'z.mp3', prefix: 'z', n: 1, vol: 2.2 },
    { file: 'e.mp3', prefix: 'e', n: 1, vol: 2.2 }, { file: 'd.mp3', prefix: 'd', n: 1, vol: 2.2 },
  ],
  seq: `g0.5 n01 g0.3 p1 g0.6 n02 g0.4 n03 g0.2 y1 g0.5 n04 g0.6 n05 g0.6 n06 g0.3 ctitle g1.6
    n07 g0.3 n08 g0.4 n09 g0.4 n10 g0.4 n11 g1.0
    n12 g0.3 k1 g0.4 n13 g0.4 n14 g0.2 y2 g0.3 p2 g0.4 n15 g1.0
    n16 g0.3 n17 g0.7 n18 g0.3 b1 g0.4 n19 g0.2 y3 g0.5 n20 g0.2 b2 g0.7 n21 g0.3 c1 g0.7 n22 g0.7 n23 g0.3 i1 g0.3 j1 g0.5 n24 g1.0
    n25 g0.3 n26 g0.5 n27 g0.3 s1 g0.5 n28 g1.0
    n29 g0.3 z1 g0.5 n30 g0.7 n31 g0.3 e1 g0.5 n32 g1.0
    n33 g0.3 n34 g0.5 n35 g0.5 n36 g1.0
    n37 g0.3 n38 g0.3 n39 g0.4 n40 g0.6 n41 g0.5 n42 g0.2 d1 g0.5 n43 g0.7 n44 g0.7 n45 g1.0
    n46 g0.4 n47 g0.7 n48 g0.4 n49 g0.3 n50 g0.2 y4 g0.5 n51 g0.5 n52 g1.0
    n53 g0.5 n54 g0.7 n55 g0.3 p3 g0.7 n56 g1.0 n57 g1.5 cend g3.5`,
  amb: (C, V, total) => [['amb1', 0, total, 0.18]],
  sfx: (C, V, total) => {
    const s = (id, f = 0) => V[id].s + f * (V[id].e - V[id].s);
    return [
      ...[0, 0.4, 0.8, 1.2].map((d) => ['CLICK', s('n01') + d, 0.5, ',highpass=f=1200']), ['portal', s('n05', 0.45), 0.55, ''], ['impact', s('n05', 0.62), 0.6, ''],
      ['ring', s('n06', 0.15), 0.3, ''], ['ring', s('n06', 0.6), 0.35, ''], ['impact', C.title, 0.8, ''],
      ...[.25, .45, .62, .8].map((f) => ['CLICK', s('n09', f), 0.4, '']), ...[.08, .36, .66].map((f) => ['CLICK', s('n10', f), 0.4, '']), ['crack', s('n11', 0.58), 0.4, ''],
      ['clock', s('n12'), 0.25, ''], ...[.05, .35, .65].map((f) => ['CLICK', s('k1', f), 0.4, '']), ['water', s('n14', 0.35), 0.25, ''],
      ['ring', s('n16', 0.5), 0.3, ''], ...Array.from({ length: 8 }, (_, i) => ['CLICK', s('n17', 0.1) + i * 0.17, 0.2, ',highpass=f=2500']), ['HISS', s('n17', 0.45), 0.4, ''], ['impact', s('n17', 0.72), 0.4, ''],
      ['steps', s('n18'), 0.35, ''], ['impact', s('n18', 0.55), 0.5, ''], ['crack', s('n19', 0.55), 0.5, ''], ['clock', s('n21'), 0.3, ',atempo=1.6'], ['impact', s('n22', 0.55), 0.5, ''],
      ['impact', s('n24', 0.25), 0.7, ''], ['RUSTLE', s('n26', 0.25), 0.6, ''], ['impact', s('s1', 0.35), 0.5, ''], ['CLICK', s('n28'), 0.3, ''],
      ['steps', s('n29'), 0.35, ''], ...[0.1, 0.5, 0.9].map((f) => ['CLICK', s('n29', f), 0.5, '']), ['ring', s('e1', 0.5), 0.3, ''], ['impact', s('n32', 0.55), 0.9, ''], ['crack', s('n32', 0.6), 0.6, ''],
      ['CLICK', s('n33', 0.45), 0.6, ''], ['impact', s('n34', 0.85), 0.4, ''], ...Array.from({ length: 6 }, (_, i) => ['knock', s('n35') + i * 0.4, 0.35, '']), ['impact', s('n36', 0.7), 0.4, ''],
      ['ring', s('n37', 0.5), 0.3, ''], ['HISS', s('n38', 0.35), 0.4, ''], ['ring', s('n39', 0.35), 0.3, ''], ...[0.1, 0.32, 0.54].map((f) => ['HISS', s('n41', f) + 0.6, 0.3, '']),
      ['steps', s('n43'), 0.3, ''], ['crack', s('n43', 0.4), 0.4, ''], ['impact', s('n43', 0.72), 0.9, ''], ['portal', s('n44'), 0.35, ''], ['impact', s('n45', 0.68), 0.9, ''],
      ['crack', s('n46', 0.55), 0.5, ''], ['portal', s('n47'), 0.5, ''], ['ring', s('n47', 0.25), 0.5, ''], ['crack', s('n48', 0.55), 0.3, ''], ['ring', s('n48', 0.75), 0.3, ''],
      ['RUSTLE', s('n49', 0.45), 0.4, ''], ['crack', s('n50', 0.55), 0.25, ''], ['portal', s('n51'), 0.35, ''], ['clock', s('n53'), 0.3, ''], ['portal', s('n54', 0.45), 0.5, ''],
      ['RUSTLE', s('n55', 0.25), 0.3, ''], ['impact', s('n56', 0.5), 0.4, ''], ['impact', C.end, 0.7, ''],
    ];
  },
};
