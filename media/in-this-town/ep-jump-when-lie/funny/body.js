// ---------- funny cut: captions, shots, scenes ----------
const CAPS = {
  n02: 'WHICH MEANS… NOBODY|HERE CAN LIE. <tspan fill="#ffd54d">AT ALL.</tspan>', n03: '“I’M ON MY WAY.”', n04: 'HE’S STILL <tspan fill="#ffd54d">IN BED.</tspan>',
  n05: '“NICE HAIRCUT!”', n06: 'STRAIGHT INTO THE|<tspan fill="#ffd54d">CEILING FAN.</tspan>', n07: '“I’VE READ THE TERMS|AND CONDITIONS.”', n08: 'HE’S <tspan fill="#ffd54d">STILL FLYING.</tspan>',
  n09: 'JOB INTERVIEWS TAKE|<tspan fill="#ffd54d">3 SECONDS.</tspan>', n10: '“WHERE DO YOU SEE YOURSELF|IN FIVE YEARS?”', n11: '<tspan fill="#ff5f8f">NEXT.</tspan>',
  n12: 'FIRST DATES ARE|A <tspan fill="#ffd54d">DISASTER.</tspan>', n13: '“I LOVE HIKING.”', n14: '“I’M NOT LIKE|OTHER GIRLS.”', n15: 'THE WEATHERMAN:|“SUNNY ALL DAY!”…', n16: '…AND LAUNCHES|INTO A <tspan fill="#ffd54d">CLOUD.</tspan>',
  n17: 'THE CATS NEVER JUMP.', n18: 'CATS <tspan fill="#ffd54d">DON’T LIE.</tspan>', n19: 'THEY JUST|<tspan fill="#ffd54d">DON’T CARE.</tspan>', n20: 'MY MUM LOOKED AT|MY DRAWING AND SAID…', n21: '“IT’S BEAUTIFUL,|SWEETIE.”',
  n22: '…SHE’S STILL|ON THE <tspan fill="#ffd54d">ROOF.</tspan>', n23: 'WHAT LIE WOULD MAKE|<tspan fill="#ff5f8f">YOU</tspan> JUMP THE HIGHEST?', n24: 'FOLLOW FOR MORE|OF THIS TOWN.',
};
const JJ = (k) => J.find((q) => q.k === k);
const CUTS = [
  ['hook', -1], ['nolie', s_('n02') - 0.05], ['bed', s_('n03') - 0.05], ['fan', s_('n05') - 0.05], ['terms', s_('n07') - 0.05], ['flying', s_('n08') - 0.1],
  ['job', s_('n09') - 0.05], ['date', s_('n12') - 0.05], ['weather', s_('n15') - 0.05], ['cats', s_('n17') - 0.05], ['catclose', s_('n18') - 0.05], ['catback', s_('n19') - 0.05],
  ['mum', s_('n20') - 0.05], ['roof', s_('n22') - 0.15], ['end', s_('n23') - 0.05],
];
const shotAt = (t) => { let c = CUTS[0]; for (const q of CUTS) if (t >= q[1]) c = q; return c; };
const ME = { skin: '#f6c9a0', shirt: '#ff8c69', pants: '#3d4a7a', hair: 'bowl', hairC: '#4a2f1c' };
const TOWN = [{ shirt: '#7bd389', hair: 'curly', hairC: '#2f2a24', skin: '#c98d62' }, { shirt: '#ff6f91', hair: 'short' }, { shirt: '#c9b8ff', dress: 1, hair: 'long', hairC: '#e0a33a' }, { shirt: '#ffd166', hair: 'spiky', skin: '#e8b48a' }];
const MEH = (o) => Object.assign({ meh: 1 }, o);
const TABLE = (x0, x1, y, c = '#b77b4e') => BLK(x0, y, x1, y + 30, c, 14) + BLK(x0 + 20, y + 30, x0 + 44, GROUND, c, 8) + BLK(x1 - 44, y + 30, x1 - 20, GROUND, c, 8);

const SC = {
  hook(t) {
    let g = STREET(t);
    g += CAT(130, GROUND + 6, 0.55, t, MEH({ c: 'orange', look: [0.6, -0.6] })) + CAT(980, GROUND + 6, 0.5, t, MEH({ c: 'grey', look: [-0.6, -0.6] }));
    g += JP('hA', 250, GROUND, 0.8, TOWN[0], t) + JP('hB', 830, GROUND, 0.78, TOWN[2], t);
    g += JP('hero', 540, GROUND + 70, 1.05, { shirt: '#ff6f91', hair: 'short', hairC: '#4a2f1c' }, t);
    return g;
  },
  nolie(t) {
    let g = STREET(t);
    [150, 400, 660, 920].forEach((x, i) => { g += PERSON(x + Math.sin(t * 30 + i) * 2, GROUND + (i % 2) * 40, 0.66, Object.assign({ mouth: 'zip', sweat: 1, wide: 1, look: [Math.sin(t * 1.5 + i), 0] }, TOWN[i]), t); });
    g += CAT(280, GROUND + 140, 0.5, t, MEH({ c: 'orange' })) + CAT(800, GROUND + 140, 0.5, t, MEH({ c: 'black' }));
    return g;
  },
  bed(t) {
    let g = ROOM(t, '#d9e8ff', '#c7a07a');
    g += `<circle cx="820" cy="640" r="90" fill="#fff" stroke="${OUT}" stroke-width="${LW}"/>` + T(820, 668, '10:47', 54, '#e94b5f', { flat: 1 });
    const j = jumpState('way', t), snug = t > JJ('way').t0 + JJ('way').dur + 0.2;
    g += BLK(170, 980, 210, 1300, '#9b6a45', 10);
    g += PERSON(500, 1240, 1.15, { j, shirt: '#9ad0ff', stripes: '#fff', pants: '#9ad0ff', nightcap: 1, hair: 'short', hairC: '#3a2a1a', skin: '#e8b48a', mouth: j.air ? 'o' : snug ? 'smile' : 'talk', wide: j.air, look: [0.4, 0], ph: snug ? 9.9 : 1 }, t);
    g += BLK(190, 1060, 900, 1300, '#ffb5a7', 18) + `<rect x="190" y="1060" width="710" height="40" fill="#fff" opacity=".5"/>`;
    g += CAT(760, 1060, 0.5, t, { sleep: 1, c: 'orange' });
    if (snug) g += [0, 1, 2].map((i) => { const u = ((t * 0.5 + i / 3) % 1); return T(620 + u * 60, 700 - u * 140, 'z', 50 + i * 10, '#fff', { op: n(1 - u) }); }).join('');
    if (t < JJ('way').t0 + 0.1) g += BUB(560, 520, 'I’m on|my way!', t, s_('n03') + 0.05, -40, 74);
    return g;
  },
  fan(t) {
    const CEIL = 300, jf = JJ('fan');
    let g = ROOM(t, '#fde2ff', '#c7a07a', { ceil: CEIL });
    // ceiling fan: spinning blades
    const ang = t * (t > jf.t0 + 0.2 ? 14 : 5);
    g += BLK(690, CEIL, 710, 360, '#7a7a8c', 6);
    const blades = [0, 1, 2, 3].map((i) => { const a = ang + (i * PI) / 2, c = Math.cos(a); return { z: Math.sin(a), d: `<g transform="translate(700,370) scale(${n(c)},1)">` + BLK(0, -10, 200, 10, '#b77b4e', 6) + `</g>` }; });
    const hub = BLK(670, 356, 730, 384, '#ffd166', 8);
    // the friend: jumps, sticks to the fan and spins round with it
    const j = jumpState('fan', t, 470), stuck = j.flat;
    let fx = 720, flip = 0;
    if (stuck) { const tc = jf.t0 + 0.32, a = (t - tc) * 14; fx = 700 + Math.cos(a) * 110; flip = Math.sin(a) < 0; }
    g += blades.filter((b) => b.z < 0).map((b) => b.d).join('');
    g += PERSON(fx, GROUND + 70, 1.1, { j, flip, shirt: '#7bd389', hair: 'short', hairC: '#c46a2a', skin: '#e8b48a', mouth: j.air ? 'o' : 'grin', wide: j.air, look: [-0.7, 0], stars: stuck }, t);
    g += hub + blades.filter((b) => b.z >= 0).map((b) => b.d).join('');
    g += PERSON(300, GROUND + 70, 1.15, Object.assign({}, ME, { mouth: stuck ? 'grin' : 'smile', look: [0.8, stuck ? -1 : 0] }), t);
    g += CAT(930, GROUND + 70, 0.6, t, MEH({ c: 'calico', look: [-0.5, -0.8] }));
    if (t < jf.t0 + 0.1) g += BUB(560, 560, 'Nice|haircut!', t, s_('n05') + 0.05, 160, 74);
    return g;
  },
  terms(t) {
    const j = jumpState('terms', t);
    let g = ROOM(t, '#e8ffe0', '#b9c2d6');
    g += TABLE(600, 1020, 1050) + BLK(720, 900, 930, 1050, '#cfd6e6', 10) + `<rect x="734" y="914" width="182" height="120" fill="#fff" stroke="${OUT}" stroke-width="2"/>` + T(825, 945, 'TERMS', 24, OUT, { flat: 1 }) + T(825, 975, 'page 1 of 4,812', 18, '#889', { flat: 1 }) + `<rect x="780" y="1000" width="90" height="24" fill="#4cc38a"/>` + T(825, 1018, 'I AGREE', 16, '#fff', { flat: 1 });
    g += CAT(960, 1050, 0.45, t, MEH({ c: 'white', look: [0, j.dy > 200 ? -1 : -0.3] })) + CAT(140, GROUND + 6, 0.55, t, MEH({ c: 'black', look: [0.4, j.dy > 200 ? -1 : 0] }));
    g += JP('terms', 420, GROUND + 60, 1.2, { shirt: '#ffd166', hair: 'spiky', hairC: '#2b2b2b', mouth: 'smile', look: [0.5, 0], glasses: 1 }, t);
    if (t < JJ('terms').t0 + 0.1) g += BUB(470, 560, 'I’ve read the terms|and conditions.', t, s_('n07') + 0.05, -60, 62);
    return g;
  },
  flying(t) {
    // still going up: clouds rush downward past him
    let g = SKY(0, '#7cc8ff', '#d6f0ff');
    const u = t - s_('n08');
    for (const [x, y0, sc] of [[200, 0, 1.2], [820, 700, 1], [420, 1300, 1.4], [900, 1800, 0.9], [120, 2300, 1.1]]) { const y = ((y0 + u * 1100) % 2500) - 300; g += `<g transform="translate(${x},${n(y)}) scale(${sc})">` + BLK(-120, -40, 120, 30, '#ffffff', 16) + BLK(-60, -80, 70, -40, '#ffffff', 12) + `</g>`; }
    // a kitty passing by on its own cloud, unbothered
    const cy = ((900 + u * 1100) % 2500) - 300;
    g += `<g transform="translate(260,${n(cy)})">` + BLK(-140, 0, 140, 60, '#ffffff', 16) + CAT(0, 0, 0.55, t, MEH({ c: 'grey', look: [1, 0] })) + `</g>`;
    for (let k = 0; k < 5; k++) g += `<rect x="${430 + k * 50}" y="${n(1180 + ((u * 1600 + k * 90) % 300))}" width="6" height="90" fill="#fff" opacity=".8"/>`;
    g += PERSON(540, 1150 + Math.sin(t * 9) * 10, 1.0, { j: { dy: 0, sx: 0.9, sy: 1.12, air: 1 }, shirt: '#ffd166', hair: 'spiky', hairC: '#2b2b2b', glasses: 1, mouth: 'o', wide: 1 }, t);
    // birds
    for (let k = 0; k < 3; k++) { const by = ((300 + k * 500 + u * 1300) % 2200) - 200; g += `<path d="M ${700 + k * 60} ${n(by)} l 20 12 l 20 -12" stroke="${OUT}" stroke-width="5" fill="none"/>`; }
    return g;
  },
  job(t) {
    const CEIL = 300, jj = JJ('job'), gone = t > jj.t0 + 0.3, nxt = t > s_('n11') - 0.05;
    let g = ROOM(t, '#eef0f5', '#9aa3b8', { ceil: CEIL });
    g += BLK(300, 380, 780, 470, '#3b4a7a', 10) + T(540, 440, 'JOB INTERVIEW', 50, '#fff', { flat: 1 });
    g += `<g transform="translate(270,620)"><circle r="80" fill="#fff" stroke="${OUT}" stroke-width="${LW}"/>` + T(0, 18, '0:03', 50, '#e94b5f', { flat: 1 }) + `</g>`;
    // interviewer behind the desk
    g += PERSON(780, GROUND + 10, 1.0, { shirt: '#3b4a7a', tie: '#e94b5f', hair: 'bald', hairC: '#888', glasses: 1, mouth: t > s_('n10') && t < e_('n10') ? 'talk' : 'flat', look: [-0.7, 0] }, t);
    g += BLK(600, 1060, 1060, 1110, '#8a5a3c', 14) + BLK(620, 1110, 1040, GROUND, '#9b6a45', 10);
    g += CAT(950, 1060, 0.45, t, MEH({ c: 'black', look: [-0.6, gone ? -1 : 0] }));
    // candidate: answers, then rockets through the ceiling
    if (!nxt) {
      const j = jumpState('job', t);
      g += PERSON(330, GROUND + 70, 1.1, { j, shirt: '#ff6f91', hair: 'short', hairC: '#5a3a22', tie: '#3b82c4', mouth: j.air ? 'o' : 'grin', wide: j.air, look: [0.7, 0] }, t);
    } else {
      const u = es(t, s_('n11'), s_('n11') + 0.5);
      g += PERSON(lerp(-150, 330, u), GROUND + 70, 1.1, { shirt: '#7bd389', hair: 'curly', hairC: '#2f2a24', skin: '#c98d62', mouth: 'worry', sweat: 1, look: [0.7, 0] }, t);
    }
    // the ceiling is drawn over him, with the hole he made
    g += `<rect x="0" y="0" width="1080" height="${CEIL}" fill="#f4efe6" stroke="${OUT}" stroke-width="${LW}"/>`;
    if (gone) g += `<path d="M 250 ${CEIL} L 270 ${CEIL - 60} L 300 ${CEIL - 30} L 330 ${CEIL - 80} L 370 ${CEIL - 40} L 410 ${CEIL} Z" fill="#2b2540"/>`;
    if (t > s_('n10') && t < e_('n10') + 0.2) g += BUB(620, 610, 'Where do you see|yourself in|five years?', t, s_('n10') + 0.05, 160, 54);
    if (t > e_('n10') && t < jj.t0 + 0.1) g += BUB(330, 600, 'Working HERE!', t, e_('n10') + 0.02, 0, 62);
    if (nxt) { const k = pop(t, s_('n11') - 0.05, 0.15); g += `<g transform="translate(540,760) rotate(-12) scale(${n(k * 1.1)})">` + `<rect x="-230" y="-90" width="460" height="180" rx="14" fill="none" stroke="#e94b5f" stroke-width="16"/>` + T(0, 50, 'NEXT!', 140, '#e94b5f', { flat: 1 }) + `</g>`; }
    return g;
  },
  date(t) {
    let g = ROOM(t, '#ffd6dc', '#8a5a3c');
    for (const [x, y] of [[180, 520], [540, 440], [900, 520]]) g += `<g transform="translate(${x},${y})">` + BLK(-34, -20, 0, 14, '#ff5f8f', 6) + BLK(0, -20, 34, 14, '#ff5f8f', 6) + BLK(-20, 14, 20, 40, '#ff5f8f', 6) + `</g>`;
    g += JP('hike', 290, GROUND + 70, 1.05, { shirt: '#3b82c4', hair: 'spiky', hairC: '#3a2a1a', mouth: 'smile', look: [0.7, 0], tie: '#e94b5f' }, t);
    g += JP('girl', 790, GROUND + 70, 1.05, { shirt: '#c9b8ff', dress: 1, hair: 'long', hairC: '#7a4a2a', mouth: 'smile', look: [-0.7, 0], ph: 2 }, t);
    g += TABLE(380, 700, 1110, '#fff') + BLK(525, 1040, 555, 1110, '#fff4d6', 6) + `<path d="M 540 1040 q -10 -20 0 -34 q 10 14 0 34 Z" fill="#ffd166" stroke="${OUT}" stroke-width="2"/>`;
    g += CAT(540, GROUND + 90, 0.55, t, MEH({ c: 'orange', look: [0, -1] }));
    if (t > s_('n13') && t < JJ('hike').t0 + 0.1) g += BUB(430, 600, 'I love hiking.', t, s_('n13') + 0.05, -40, 64);
    if (t > s_('n14') && t < J.filter((q) => q.k === 'girl')[0].t0 + 0.1) g += BUB(640, 600, 'I’m not like|other girls.', t, s_('n14') + 0.05, 150, 64);
    return g;
  },
  weather(t) {
    const jw = JJ('weather');
    let g = ROOM(t, '#2f4f7a', '#3b3350');
    g += BLK(110, 520, 980, 1100, '#7ed1a6', 16);
    for (const [x, y] of [[300, 700], [560, 820], [800, 680]]) g += `<g transform="translate(${x},${y})">` + BLK(-40, -40, 40, 40, '#ffd166', 10) + [0, 1, 2, 3].map((i) => `<rect x="-8" y="-80" width="16" height="26" fill="#ffd166" transform="rotate(${i * 90})"/>`).join('') + `</g>`;
    g += T(540, 1040, 'SUNNY ALL DAY', 60, '#fff', { sw: 8 });
    const j = jumpState('weather', t, 760), stuck = j.flat;
    // rain cloud he gets stuck in
    const cl0 = es(t, jw.t0 - 0.2, jw.t0 + 0.3);
    g += PERSON(560, GROUND + 60, 1.05, { j, shirt: '#ffffff', tie: '#e94b5f', hair: 'short', hairC: '#3a2a1a', mouth: j.air ? 'o' : 'grin', wide: j.air, look: [-0.3, 0] }, t);
    g += `<g transform="translate(560,${n(lerp(-200, 330, cl0))})">` + BLK(-260, -80, 260, 60, '#8a8fa8', 18) + BLK(-150, -150, 140, -80, '#8a8fa8', 14) + `</g>`;
    if (stuck) for (let k = 0; k < 14; k++) { const y = 400 + ((t * 900 + k * 97) % 700); g += `<rect x="${330 + k * 34}" y="${n(y)}" width="6" height="34" fill="#8fd3ff"/>`; }
    g += `<rect x="40" y="440" width="120" height="50" fill="#e94b5f"/>` + T(100, 478, 'LIVE', 36, '#fff', { flat: 1 });
    g += CAT(950, GROUND + 70, 0.55, t, MEH({ c: 'grey', look: [-0.5, -1] }));
    if (t < jw.t0 + 0.1) g += BUB(560, 580, 'Sunny all day!', t, s_('n15') + 0.8, 0, 64);
    return g;
  },
  cats(t) {
    let g = STREET(t);
    [120, 380, 700, 960].forEach((x, i) => { g += JP('c' + i, x, GROUND - 20 + (i % 2) * 30, 0.6, Object.assign({ mouth: 'grin', airMouth: 'grin' }, TOWN[i]), t); });
    g += CAT(250, GROUND + 160, 0.6, t, MEH({ c: 'orange' })) + CAT(540, GROUND + 170, 0.6, t, MEH({ c: 'black' })) + CAT(830, GROUND + 160, 0.6, t, MEH({ c: 'grey' }));
    return g;
  },
  catclose(t) {
    let g = STREET(t);
    [200, 880].forEach((x, i) => { g += JP('c' + i, x, GROUND - 20, 0.55, TOWN[i], t + 0.0); });
    g += CAT(540, GROUND + 260, 1.5, t, MEH({ c: 'orange', look: [0, 0] }));
    return g;
  },
  catback(t) {
    let g = STREET(t);
    g += CAT(540, GROUND + 260, 1.5, t, { c: 'orange', back: 1 });
    g += CAT(250, GROUND + 160, 0.6, t, { c: 'black', sleep: 1 }) + CAT(860, GROUND + 160, 0.6, t, MEH({ c: 'grey', lick: 1 }));
    return g;
  },
  mum(t) {
    const jm = JJ('mum');
    let g = ROOM(t, '#ffe1d1', '#b9c2d6');
    g += BLK(820, 620, 1020, 1300, '#e6ecf7', 14) + `<line x1="820" y1="900" x2="1020" y2="900" stroke="${OUT}" stroke-width="3"/>`;
    // my drawing on an easel: a very wobbly house and a sun with a face
    g += BLK(120, 640, 160, 1300, '#9b6a45', 8) + BLK(420, 640, 460, 1300, '#9b6a45', 8);
    g += `<g transform="rotate(-3,290,820)"><rect x="110" y="620" width="360" height="320" fill="#fff" stroke="${OUT}" stroke-width="${LW}"/>`;
    g += `<path d="M 170 880 L 180 780 L 240 720 L 330 770 L 320 890 Z M 230 890 L 235 840 L 265 842 L 262 890" fill="none" stroke="#e94b5f" stroke-width="7" stroke-linejoin="round"/><circle cx="410" cy="690" r="34" fill="none" stroke="#ffb703" stroke-width="7"/><path d="M 398 686 l 4 0 M 418 686 l 4 0 M 400 704 q 10 -8 20 0" stroke="${OUT}" stroke-width="4"/><path d="M 140 905 q 40 -16 80 0 q 60 18 110 -4 q 50 -14 120 4" stroke="#4cc38a" stroke-width="8" fill="none"/>`;
    for (let k = 0; k < 6; k++) g += `<path d="M ${360 + k * 12} ${800 + k * 10} l 40 -20" stroke="#3b82c4" stroke-width="5"/>`;
    g += `</g>`;
    g += PERSON(560, GROUND + 70, 1.0, Object.assign({}, ME, { mouth: 'grin', look: [0.6, -0.4] }), t);
    g += JP('mum', 800, GROUND + 70, 1.15, { shirt: '#e94b5f', apron: 1, hair: 'bun', hairC: '#5a3a22', mouth: 'smile', look: [-0.8, 0] }, t);
    g += CAT(950, 620, 0.45, t, MEH({ c: 'calico', look: [-0.8, 0.4] }));
    if (t > s_('n21') && t < jm.t0 + 0.1) g += BUB(720, 560, 'It’s beautiful,|sweetie.', t, s_('n21') + 0.05, 80, 64);
    return g;
  },
  roof(t) {
    let g = SKY(t);
    g += `<rect x="0" y="${GROUND - 40}" width="1080" height="1920" fill="#8fd18b"/>`;
    g += HOUSE(240, 600, 520, 0, t, '');
    const roofTop = GROUND - 40 - 520 - 3 * 34, land = es(t, s_('n22') - 0.15, s_('n22') + 0.1);
    g += PERSON(560, lerp(roofTop - 900, roofTop, land), 0.85, { shirt: '#e94b5f', apron: 1, hair: 'bun', hairC: '#5a3a22', mouth: land < 1 ? 'o' : 'worry', wide: land < 1, sweat: land >= 1, look: [0, 0.6], j: { dy: 0, sx: land < 1 ? 0.9 : 1, sy: land < 1 ? 1.12 : 1, air: land < 1 } }, t);
    g += DUST(560, roofTop, t, s_('n22') + 0.1, 0.8);
    g += CAT(745, roofTop + 32, 0.45, t, MEH({ c: 'orange', look: [-1, 0] }));
    g += PERSON(160, GROUND + 60, 0.8, Object.assign({}, ME, { mouth: 'worry', look: [0.6, -1] }), t);
    return g;
  },
  end(t) {
    let g = STREET(t);
    g += `<rect width="1080" height="1920" fill="#fff8e7" opacity=".5"/>`;
    g += JP('end', 540, GROUND + 40, 0.9, { shirt: '#ff6f91', hair: 'short', mouth: 'grin', airMouth: 'grin' }, t);
    g += CAT(230, GROUND + 40, 0.65, t, MEH({ c: 'orange', look: [0.6, -0.6] })) + CAT(850, GROUND + 40, 0.65, t, MEH({ c: 'grey', look: [-0.6, -0.6] })) + CAT(380, GROUND + 160, 0.45, t, MEH({ c: 'black' })) + CAT(700, GROUND + 160, 0.45, t, MEH({ c: 'calico' }));
    return g;
  },
};
const OV = {
  hook(t) {
    const k = 1 + Math.sin(t * 3) * 0.015;
    return `<g transform="translate(540,320) scale(${n(k)})"><rect x="-505" y="-215" width="1010" height="360" rx="28" fill="#fff8e7" stroke="${OUT}" stroke-width="5"/>`
      + T(0, -125, 'IN THIS TOWN,', 80, '#2b2540', { flat: 1 }) + T(0, -20, 'PEOPLE JUMP', 112, '#ff5f8f', { sw: 8 }) + T(0, 95, 'WHEN PEOPLE LIE.', 88, '#3b82c4', { sw: 7 }) + `</g>`;
  },
  end(t) {
    const k = pop(t, s_('n23') - 0.05);
    return `<g transform="translate(540,420) scale(${n(k)})"><rect x="-480" y="-250" width="960" height="460" rx="28" fill="#fff" stroke="${OUT}" stroke-width="5"/>`
      + T(0, -150, 'What lie would', 80, OUT, { flat: 1 }) + T(0, -50, 'make YOU jump', 86, '#ff5f8f', { sw: 7 }) + T(0, 50, 'the highest?', 80, OUT, { flat: 1 })
      + `<text x="0" y="170" font-size="96" text-anchor="middle" font-family="Noto Color Emoji">👇</text></g>`;
  },
};
const CAM = { hook: [1.2, 540, 1010], nolie: [1.3, 540, 1080], bed: [1.35, 540, 1000], fan: [1.3, 540, 1000], terms: [1.4, 540, 1000], flying: [1.0, 540, 960], job: [1.3, 540, 1000], date: [1.3, 540, 1000], weather: [1.2, 540, 900], cats: [1.25, 540, 1100], catclose: [1.15, 540, 1100], catback: [1.15, 540, 1100], mum: [1.25, 480, 1000], roof: [1.1, 540, 940], end: [1.15, 540, 1080] };
// big comic "BOING!" pop on each real jump
function BOINGS(t) {
  let g = '', i = 0;
  for (const j of J) { if (!j.sfx) continue; i++; const a = t - j.t0; if (a < 0 || a > 0.55) continue; const k = pop(t, j.t0, 0.14) * (1 - seg(a, 0.42, 0.55)); const x = i % 2 ? 760 : 320, r = i % 2 ? 10 : -10; g += `<g transform="translate(${x},${i % 3 ? 900 : 760}) rotate(${r}) scale(${n(k)})">` + T(0, 0, 'BOING!', 120, '#ffd54d', { sw: 18 }) + `</g>`; }
  return g;
}
function renderAt(t) {
  const [name, t0] = shotAt(t);
  const u = t - t0, z = 1 + Math.min(u, 4) * 0.01;
  let sx = 0, sy = 0;
  for (const j of J) if (j.sfx && j.dur < 50) { const a = t - (j.t0 + j.dur); if (a > 0 && a < 0.3) { const m = 12 * (1 - a / 0.3); sx += Math.sin(a * 90) * m; sy += Math.cos(a * 70) * m; } }
  for (const j of J) if (j.sfx) { const a = t - j.t0; if (a > 0 && a < 0.2) { const m = 8 * (1 - a / 0.2); sy += Math.sin(a * 80) * m; } }
  const [cz, cx, cy] = CAM[name] || [1, 540, 960];
  let g = `<g transform="translate(${n(540 + sx)},${n(960 + sy)}) scale(${(z * cz).toFixed(4)}) translate(${-cx},${-cy})">` + SC[name](t) + `</g>`;
  if (OV[name]) g += OV[name](t);
  const f = 1 - seg(u, 0, 0.1);
  if (f > 0 && t0 > 0) g += `<rect width="1080" height="1920" fill="#fff" opacity="${n(f * 0.6)}"/>`;
  g += BOINGS(t) + CAPTION(t);
  document.getElementById('s').innerHTML = g;
}
window.renderAt = renderAt;
window.DATA = { fps: D.fps, total: D.total };
window.ready = document.fonts.ready;
