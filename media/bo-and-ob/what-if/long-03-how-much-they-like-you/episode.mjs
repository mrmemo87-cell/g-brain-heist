// What if you could see how much everyone actually liked you? (standalone social What-If, 16:9)
export default {
  narr: 51,
  batches: [
    { file: 'p.mp3', prefix: 'p', n: 3, vol: 2.2 }, { file: 'k.mp3', prefix: 'k', n: 1, vol: 2.2 }, { file: 'l.mp3', prefix: 'l', n: 1, vol: 2.2 },
    { file: 'i.mp3', prefix: 'i', n: 1, vol: 2.4 }, { file: 's.mp3', prefix: 's', n: 2, vol: 2.2 }, { file: 'r.mp3', prefix: 'r', n: 1, vol: 2.4 },
  ],
  seq: `g0.6 n01 g0.2 p1 g0.5 n02 g0.4 n03 g0.6 n04 g0.5 n05 g0.6 n06 g0.3 ctitle g1.8
    n07 g0.4 n08 g0.2 p2 g0.5 n09 g0.4 n10 g1.0
    n11 g0.4 n12 g0.4 n13 g0.4 n14 g1.0
    n15 g0.1 k1 g0.3 n16 g0.4 l1 g0.2 n17 g0.4 n18 g0.1 i1 g0.4 n19 g0.6 n20 g0.4 n21 g0.4 n22 g1.0
    n23 g0.4 n24 g0.2 s1 g0.4 n25 g0.5 n26 g0.5 n27 g0.4 s2 g0.4 n28 g1.0
    n29 g0.4 n30 g0.6 n31 g0.6 n32 g0.3 r1 g0.4 n33 g1.0
    n34 g0.4 n35 g0.6 n36 g0.8 n37 g0.4 n38 g1.0
    n39 g0.4 n40 g0.3 n41 g0.5 n42 g0.4 n43 g1.0
    n44 g0.4 n45 g0.5 n46 g0.3 p3 g0.6 n47 g0.8 n48 g0.4 n49 g1.2
    n50 g0.4 n51 g1.2 cend g3.5`,
  amb: (C, V, total) => [['amb1', 0, total, 0.14]],
  sfx: (C, V, total) => {
    const s = (id, f = 0) => V[id].s + f * (V[id].e - V[id].s);
    const tick = (a, k, gap = 0.08) => Array.from({ length: k }, (_, i) => ['CLICK', a + i * gap, 0.22, ',highpass=f=2500']);
    return [
      ['ring', 0.5, 0.25, ''], ['portal', s('n02', 0.3), 0.45, ''], ['impact', s('n03', 0.4), 0.35, ''], ['portal', s('n04', 0.2), 0.4, ''],
      ['impact', s('n05', 0.6), 0.5, ''], ...[0.25, 0.5, 0.8].map((f) => ['impact', s('n06', f), 0.4, '']), ['impact', C.title, 0.8, ''],
      ['clock', s('n07'), 0.25, ''], ['RUSTLE', s('n08', 0.6), 0.3, ''], ...tick(s('n09', 0.3), 3), ...tick(s('n09', 0.7), 5), ['ring', s('n10', 0.5), 0.3, ''],
      ['clock', s('n11'), 0.25, ''], ['steps', s('n11', 0.1), 0.2, ''], ['HISS', s('n12', 0.15), 0.3, ''], ['portal', s('n13', 0.3), 0.3, ''], ['ring', s('n14', 0.6), 0.3, ''],
      ['clock', s('n15'), 0.25, ''], ['HISS', s('n16'), 0.3, ''], ['HISS', s('n17', 0.25), 0.3, ''], ['portal', s('n19'), 0.4, ''], ...tick(s('n19'), 9, 0.05),
      ['RUSTLE', s('n20', 0.5), 0.35, ''], ...tick(s('n21', 0.75), 6), ['impact', s('n22', 0.7), 0.45, ''],
      ['clock', s('n23'), 0.25, ''], ['ring', s('n23', 0.3), 0.25, ''], ...[0.15, 0.45, 0.75].map((f) => ['HISS', s('n25', f), 0.3, '']), ['impact', s('n27', 0.55), 0.35, ''], ...tick(s('n28'), 6), ['ring', s('n28', 0.2), 0.3, ''],
      ['clock', s('n29'), 0.25, ''], ['knock', s('n29', 0.05), 0.4, ''], ['steps', s('n30'), 0.25, ''], ['impact', s('n31'), 0.55, ''], ['water', s('n32', 0.5), 0.2, ''], ['ring', s('n33', 0.7), 0.3, ''],
      ['clock', s('n34'), 0.25, ''], ['brush', s('n34', 0.1), 0.3, ''], ['portal', s('n34', 0.7), 0.35, ''], ['impact', s('n36'), 0.6, ''], ['ring', s('n38', 0.6), 0.3, ''],
      ['clock', s('n39'), 0.25, ''], ['crack', s('n40', 0.35), 0.4, ''], ['impact', s('n40', 0.4), 0.45, ''], ...tick(s('n41', 0.2), 10, 0.05), ['ring', s('n41', 0.3), 0.35, ''],
      ['ring', s('n42', 0.22), 0.25, ''], ['ring', s('n42', 0.45), 0.25, ''], ...[0.72, 0.82, 0.92].map((f) => ['HISS', s('n42', f), 0.25, '']), ['impact', s('n43', 0.6), 0.4, ''],
      ['clock', s('n44'), 0.25, ''], ['RUSTLE', s('n44', 0.2), 0.25, ''], ['portal', s('n47', 0.3), 0.5, ''], ['impact', s('n47', 0.5), 0.5, ''], ['steps', s('n48', 0.2), 0.2, ''], ['ring', s('n49', 0.4), 0.4, ''],
      ['ring', s('n50', 0.6), 0.3, ''], ['impact', C.end, 0.7, ''],
    ];
  },
};
