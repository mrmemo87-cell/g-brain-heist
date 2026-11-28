// What If You Could Control Everything? (standalone social What-If, 16:9)
// q1 (Greg's monotone slide intro) plays just before n17 so the narrator's "You press skip" lands after we have heard him.
export default {
  narr: 56,
  batches: [
    { file: 's.mp3', prefix: 's', n: 1, vol: 2.2 }, { file: 'q.mp3', prefix: 'q', n: 1, vol: 2.2 },
    { file: 'p.mp3', prefix: 'p', n: 2, vol: 2.2 },
  ],
  seq: `g0.8 n01 g0.4 n02 g0.4 n03 g0.6 n04 g0.4 n05 g0.3 ctitle g1.8
    n06 g0.5 n07 g0.4 n08 g0.5 n09 g1.0
    n10 g0.2 s1 g0.4 n11 g0.5 n12 g0.6 n13 g1.0
    n14 g0.5 n15 g0.5 n16 g1.0
    q1 g0.3 n17 g0.5 n18 g0.5 n19 g0.8
    n20 g0.8 n21 g0.5 n22 g0.5 n23 g0.8 n24 g0.6 n25 g1.0
    n26 g0.5 n27 g0.5 n28 g0.5 n29 g0.5 n30 g0.6 n31 g0.6 n32 g0.6 n33 g1.0
    n34 g0.5 n35 g0.6 n36 g0.6 n37 g0.6 n38 g0.6 n39 g1.0
    n40 g0.3 p1 g0.6 n41 g0.3 p2 g0.6 n42 g0.5 n43 g0.5 n44 g0.8 n45 g0.6 n46 g0.6 n47 g1.0
    n48 g0.5 n49 g0.5 n50 g0.6 n51 g0.8 n52 g0.5 n53 g0.6 n54 g1.0
    n55 g0.6 n56 g1.2 cend g3.5`,
  amb: (C, V, total) => [['amb1', 0, total, 0.14]],
  sfx: (C, V, total) => {
    const s = (id, f = 0) => V[id].s + f * (V[id].e - V[id].s);
    const BTN = (at) => [['CLICK', at, 0.45, ''], ['CLICK', at + 0.08, 0.25, ',highpass=f=2500']];
    const REW = (at) => [...BTN(at), ['HISS', at + 0.1, 0.35, ''], ['RUSTLE', at + 0.15, 0.3, '']];
    return [
      ['impact', s('n01', 0.12), 0.5, ''], ['RUSTLE', s('n01', 0.3), 0.3, ''], ['impact', s('n02', 0.5), 0.35, ''], ...[0.7, 0.78, 0.86, 0.94].map((f) => ['CLICK', s('n02', f), 0.25, '']),
      ...REW(s('n03', 0.08)), ['portal', s('n04', 0.1), 0.4, ''], ...[0.3, 0.4, 0.5, 0.6].map((f) => ['CLICK', s('n04', f), 0.3, '']),
      ...[0.2, 0.5, 0.8].map((f) => ['impact', s('n05', f), 0.4, '']), ['impact', C.title, 0.8, ''],
      ['clock', s('n06'), 0.25, ''], ['ring', s('n06', 0.12), 0.35, ''], ...BTN(s('n06', 0.3)), ['portal', s('n06', 0.32), 0.3, ''], ...BTN(s('n07', 0.25)), ['ring', s('n07', 0.4), 0.3, ''], ['impact', s('n08', 0.6), 0.35, ''],
      ['RUSTLE', s('n09', 0.3), 0.3, ''], ...BTN(s('n09', 0.72)),
      ['clock', s('n10'), 0.25, ''], ...BTN(s('n11', 0.05)), ['HISS', s('n11', 0.1), 0.25, ''], ['ring', s('n12', 0.7), 0.3, ''], ['RUSTLE', s('n13', 0.5), 0.25, ''],
      ['clock', s('n14'), 0.25, ''], ...REW(s('n14', 0.3)), ...REW(s('n14', 0.55)), ...[0.82, 0.88, 0.94].flatMap((f) => REW(s('n14', f))), ['ring', s('n15', 0.5), 0.3, ''], ['impact', s('n16', 0.6), 0.35, ''],
      ['clock', s('q1'), 0.25, ''], ...BTN(s('n17', 0.85)), ['portal', s('n17', 0.88), 0.4, ''], ['impact', s('n18', 0.45), 0.35, ''], ['impact', s('n19', 0.6), 0.45, ''],
      ['impact', s('n20', 0.4), 0.5, ''], ['clock', s('n21'), 0.25, ''], ...BTN(s('n21', 0.8)), ...BTN(s('n22', 0.8)), ...BTN(s('n23', 0.88)), ['portal', s('n23', 0.9), 0.35, ''],
      ['impact', s('n24', 0.75), 0.45, ''], ...[0.1, 0.3, 0.5, 0.65].map((f) => ['impact', s('n25', f), 0.3, '']),
      ['clock', s('n26'), 0.25, ''], ['portal', s('n26', 0.6), 0.35, ''], ...[0.1, 0.25, 0.4, 0.55].map((f) => ['CLICK', s('n27', f), 0.3, '']), ['impact', s('n28', 0.5), 0.35, ''], ...[0.3, 0.45, 0.6].map((f) => ['CLICK', s('n29', f), 0.3, '']),
      ['ring', s('n30', 0.5), 0.25, ''], ...BTN(s('n31', 0.42)), ...BTN(s('n31', 0.72)), ['impact', s('n31', 0.9), 0.4, ''], ['impact', s('n32', 0.6), 0.4, ''], ['RUSTLE', s('n33', 0.2), 0.3, ''],
      ['clock', s('n34'), 0.25, ''], ...[0.45, 0.55, 0.65, 0.8].map((f) => ['CLICK', s('n34', f), 0.3, '']), ['HISS', s('n35', 0.7), 0.2, ''], ['impact', s('n36', 0.6), 0.35, ''], ['ring', s('n38', 0.15), 0.35, ''], ['impact', s('n39', 0.6), 0.4, ''],
      ...REW(s('n40', 0.1)), ['portal', s('n40', 0.3), 0.45, ''], ['impact', s('n41', 0.6), 0.5, ''], ['RUSTLE', s('n43', 0.6), 0.3, ''], ['impact', s('n44', 0.4), 0.5, ''], ['ring', s('n46', 0.6), 0.3, ''], ['ring', s('n47', 0.4), 0.3, ''],
      ['clock', s('n48'), 0.25, ''], ['RUSTLE', s('n48', 0.6), 0.35, ''], ['ring', s('n49', 0.1), 0.3, ''], ['impact', s('n51', 0.75), 0.4, ''], ...BTN(s('n52', 0.45)), ...[0.55, 0.65, 0.75, 0.85].map((f) => ['CLICK', s('n52', f), 0.3, '']),
      ['ring', s('n53', 0.6), 0.35, ''], ['clock', s('n55'), 0.25, ''], ['impact', s('n56', 0.8), 0.35, ''], ['impact', C.end, 0.7, ''],
    ];
  },
};
