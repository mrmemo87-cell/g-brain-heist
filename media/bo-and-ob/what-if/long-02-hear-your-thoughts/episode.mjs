// What if everyone could hear your thoughts? (standalone explainer, 16:9)
export default {
  narr: 50,
  batches: [
    { file: 'a.mp3', prefix: 'a', n: 2, vol: 2.2 }, { file: 'y.mp3', prefix: 'y', n: 2, vol: 2.4 }, { file: 'w.mp3', prefix: 'w', n: 1, vol: 2.2 },
    { file: 'm.mp3', prefix: 'm', n: 1, vol: 2.2 }, { file: 'p.mp3', prefix: 'p', n: 1, vol: 2.2 }, { file: 't.mp3', prefix: 't', n: 1, vol: 2.2 },
    { file: 'd.mp3', prefix: 'd', n: 1, vol: 2.2 }, { file: 'g.mp3', prefix: 'h', n: 1, vol: 2.2 },
    { file: 'q1.mp3', prefix: 'q', n: 1, start: 1, vol: 2.2 }, { file: 'q2.mp3', prefix: 'q', n: 1, start: 2, vol: 2.2 }, { file: 'q3.mp3', prefix: 'q', n: 1, start: 3, vol: 2.2 },
  ],
  seq: `g0.5 n01 g0.5 n02 g0.3 a1 g0.4 n03 g0.2 y1 g0.4 n04 g0.6 n05 g0.6 n06 g0.3 ctitle g1.6
    n07 g0.3 n08 g0.4 n09 g1.0
    n10 g0.8 n11 g0.3 n12 g0.4 n13 g0.3 n14 g0.8 n15 g0.2 w1 g0.4 n16 g0.6 n48 g0.8 n17 g0.3 n18 g0.3 n19 g1.0
    n20 g0.8 n21 g0.2 m1 g0.5 n22 g0.6 n49 g0.6 n50 g1.0
    n23 g0.8 n24 g0.4 n25 g0.6 n26 g0.4 n27 g1.0
    n28 g0.2 p1 g0.5 n29 g0.6 n30 g0.5 n31 g0.3 t1 g0.4 d1 g0.6 n32 g1.0
    n33 g0.8 n34 g0.2 h1 g0.5 n35 g0.4 n36 g1.0
    n37 g0.8 n38 g0.4 n39 g0.6 q1 g0.3 q2 g0.2 q3 g0.6 n40 g0.4 n41 g1.0
    n42 g0.8 n43 g0.4 n44 g0.3 a2 g0.3 y2 g0.5 n45 g0.5 n46 g1.0 n47 g1.5 cend g3.5`,
  amb: (C, V, total) => [['amb1', 0, total, 0.16]],
  sfx: (C, V, total) => {
    const s = (id, f = 0) => V[id].s + f * (V[id].e - V[id].s);
    return [
      ['ring', 0.4, 0.3, ''], ['portal', s('a1'), 0.35, ''], ['portal', s('y1'), 0.35, ''], ['impact', s('n04'), 0.5, ''], ['portal', s('n05', 0.3), 0.5, ''],
      ...[0, 0.22, 0.44].map((f) => ['impact', s('n06', f), 0.45, '']), ['impact', C.title, 0.8, ''],
      ['ring', s('n07', 0.3), 0.3, ''], ...Array.from({ length: 10 }, (_, i) => ['CLICK', s('n08', 0.3) + i * 0.15, 0.25, ',highpass=f=2500']),
      ...Array.from({ length: 8 }, (_, i) => ['CLICK', s('n09') + i * 0.55, 0.3, '']),
      ['impact', s('n10'), 0.6, ''], ['steps', s('n11'), 0.25, ''], ...[0, 0.18, 0.34, 0.5, 0.7, 0.82].map((f) => ['CLICK', s('n12', f), 0.35, '']), ['ring', s('n13', 0.5), 0.35, ''],
      ['portal', s('w1'), 0.3, ''], ['impact', s('n16', 0.5), 0.35, ''], ['clock', s('n48', 0.5), 0.3, ''], ['portal', s('n17'), 0.3, ''],
      ['impact', s('n20'), 0.6, ''], ['RUSTLE', s('n21', 0.3), 0.4, ''], ['portal', s('m1', 0.4), 0.4, ''], ['impact', s('m1') + 3.5, 0.5, ''], ['ring', s('n49', 0.6), 0.3, ''], ['impact', s('n50', 0.55), 0.5, ''],
      ['impact', s('n23'), 0.6, ''], ['RUSTLE', s('n24', 0.3), 0.5, ''], ['ring', s('n24', 0.8), 0.4, ''], ...Array.from({ length: 10 }, (_, i) => ['CLICK', s('n25', 0.1) + i * 0.3, 0.3, '']),
      ['HISS', s('n26'), 0.35, ''], ['HISS', s('n26', 0.5), 0.35, ''], ['RUSTLE', s('n27', 0.3), 0.4, ''],
      ['impact', s('n28'), 0.6, ''], ['clock', s('n28', 0.4), 0.25, ''], ['portal', s('p1'), 0.3, ''], ['ring', s('n30', 0.2), 0.25, ''], ['steps', s('n31'), 0.15, ''], ['portal', s('t1'), 0.3, ''], ['portal', s('d1'), 0.3, ''],
      ['impact', s('n33'), 0.6, ''], ['portal', s('h1'), 0.35, ''], ['ring', s('n36', 0.3), 0.3, ''],
      ['impact', s('n37'), 0.6, ''], ...Array.from({ length: 5 }, (_, i) => ['CLICK', s('n38') + i * 0.5, 0.3, '']), ['impact', s('q1'), 0.7, ''], ['portal', s('q2'), 0.35, ''], ['ring', s('n40', 0.33), 0.3, ''], ['ring', s('n40', 0.66), 0.3, ''],
      ['impact', s('n42'), 0.6, ''], ['ring', s('n43'), 0.3, ''], ['impact', s('n46', 0.55), 0.5, ''], ['ring', s('n47', 0.6), 0.4, ''], ['impact', C.end, 0.7, ''],
    ];
  },
};
