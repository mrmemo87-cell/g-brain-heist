// v4 beats: thought-lies (T1–T8) and more lies (M1–M8)
Object.assign(CAPS, {
  n39: 'AND IT’S NOT|JUST CATS.', n40: 'EVEN YOUR <tspan fill="#ffd54d">THOUGHTS</tspan>|CAN GET YOU.', n41: 'AT THE GYM.|HE THINKS:', n42: '“I’LL DEFINITELY COME|BACK TOMORROW.”', n43: '<tspan fill="#ffd54d">DUMBBELL</tspan> AND ALL.',
  n44: 'GROUP PHOTO. EVERYONE|SMILES AND THINKS:', n45: '“I LOOK GREAT|IN THIS ONE.”', n46: 'THE PHOTO IS|JUST <tspan fill="#ffd54d">FEET.</tspan>',
  n47: 'THE BABY THINKS:', n48: '“I’M NOT THE ONE WHO|MADE THAT SMELL.”', n49: '<tspan fill="#ffd54d">NAPPY</tspan> AND ALL.',
  n50: 'THE KID AT THE TABLE|THINKS:', n51: '“I’M NOT EVEN HUNGRY|FOR DESSERT.”', n52: 'FACE-FIRST|IN THE <tspan fill="#ffd54d">CAKE.</tspan>',
  n53: 'THE TEACHER THINKS:', n54: '“I LOVE MY JOB|ON MONDAYS.”', n55: 'THROUGH THE|<tspan fill="#ffd54d">SCHOOL ROOF.</tspan>',
  n56: 'THE DOG THINKS:', n57: '“I’M A GOOD BOY.”', n58: '…NO JUMP.|HE REALLY <tspan fill="#ffd54d">IS.</tspan>',
  n59: 'AND ME? I THOUGHT:', n60: '“THIS TOWN IS|TOTALLY <tspan fill="#ffd54d">NORMAL.</tspan>”',
  n61: 'THE SUPERMARKET.', n62: '“JUST LOOKING,|THANKS.”', n63: 'STRAIGHT INTO THE|<tspan fill="#ffd54d">CEREAL AISLE.</tspan>',
  n64: 'THE BARBER HOLDS|UP THE MIRROR.', n65: '“PERFECT,|THANK YOU!”', n66: '<tspan fill="#ffd54d">HAIR</tspan> AND ALL.',
  n67: 'ONLINE SHOPPING.', n68: '“THIS WILL|DEFINITELY FIT.”', n69: 'THE <tspan fill="#ffd54d">PARCEL</tspan>|JUMPS TOO.',
  n70: 'A FOOTBALL MATCH.|THE PLAYER FALLS OVER:', n71: '“HE TOUCHED ME!”', n72: 'THE <tspan fill="#ffd54d">REFEREE</tspan>|JUMPS TOO:', n73: '“I SAW EVERYTHING.”',
  n74: 'SLEEPOVER.', n75: '“I’M NOT SCARED|AT ALL.”', n76: 'CEILING. <tspan fill="#ffd54d">AGAIN.</tspan>',
  n77: 'THE ANNUAL|<tspan fill="#ffd54d">TRUTH DAY</tspan> PARADE…', n78: '…IS A|<tspan fill="#ffd54d">TRAMPOLINE SHOW.</tspan>',
  n79: 'THE SIGN SAYS:|“QUIET PLEASE.”', n80: 'THE LIBRARIAN THINKS:|“NOBODY BORROWS|THE FUN BOOKS.”', n81: 'NOTHING HAPPENS.', n82: 'THE KITTY THINKS:|“I’M NOT GOING TO|KNOCK THESE OFF.”', n83: '<tspan fill="#ffd54d">BOOKS</tspan> EVERYWHERE.',
  n84: 'GRANDAD AT|THE BARBECUE:', n85: '“IT’S NOT BURNT,|IT’S CRISPY.”', n86: '<tspan fill="#ffd54d">SAUSAGE</tspan> AND ALL.',
});
// thought bubble: puffy cloud + little bubbles down to the thinker's head
function THINK(cx, cy, txt, t, ta, hx, hy, size = 54) {
  if (t < ta) return '';
  const k = pop(t, ta, 0.2), lines = txt.split('|'), w = Math.max(...lines.map((l) => l.length)) * size * 0.3 + 70, h = lines.length * size * 0.62 + 50;
  let g = `<g transform="translate(${cx},${cy}) scale(${n(k)})">`;
  const P = []; for (let i = 0; i < 10; i++) { const a = (i / 10) * 2 * PI; P.push([Math.cos(a) * w, Math.sin(a) * h, Math.min(w, h) * 0.62]); }
  for (const [x, y, r] of P) g += `<circle cx="${n(x)}" cy="${n(y)}" r="${n(r)}" fill="#fff" stroke="${OUT}" stroke-width="${LW}"/>`;
  for (const [x, y, r] of P) g += `<circle cx="${n(x)}" cy="${n(y)}" r="${n(r - 4)}" fill="#fff"/>`;
  g += `<ellipse cx="0" cy="0" rx="${n(w + 10)}" ry="${n(h + 10)}" fill="#fff"/>`;
  lines.forEach((l, i) => { g += T(0, (i - (lines.length - 1) / 2) * size * 1.12 + size * 0.35, l, size, OUT, { flat: 1 }); });
  g += `</g>`;
  for (let i = 1; i <= 3; i++) { const u = i / 4, x = lerp(cx, hx, 0.35 + u * 0.6), y = lerp(cy + h * 0.9, hy, 0.35 + u * 0.6); g += `<circle cx="${n(x)}" cy="${n(y)}" r="${n((28 - i * 6) * k)}" fill="#fff" stroke="${OUT}" stroke-width="${LW}"/>`; }
  return g;
}
const inT = (t, a, b) => t > a && t < b;
const BOOK = (x, y, c, h = 70) => BLK(x, y - h, x + 24, y, c, 6);
Object.assign(SC, {
  thoughts(t) {
    let g = STREET(t);
    [200, 880].forEach((x, i) => { g += PERSON(x, GROUND + 20, 0.62, Object.assign({ mouth: 'worry', look: [0, -0.8], ph: i }, TOWN[i]), t); });
    g += CAT(540, GROUND + 200, 1.0, t, MEH({ c: 'orange' }));
    g += THINK(540, 640, '?!', t, s_('n40') + 0.3, 540, 1000, 120);
    return g;
  },
  gym(t) {
    let g = ROOM(t, '#e8ecf5', '#5a5a6a');
    g += BLK(100, 420, 600, 540, '#e94b5f', 10) + T(350, 500, 'GYM', 72, '#fff', { flat: 1 });
    g += BLK(700, 900, 1000, 960, '#3b3350', 10) + BLK(720, 960, 740, GROUND, '#888', 6) + BLK(960, 960, 980, GROUND, '#888', 6);
    const j = jumpState('gym', t);
    g += PERSON(450, GROUND + 70, 1.1, { j, shirt: '#ffd166', pants: '#3b82c4', hair: 'short', hairC: '#3a2a1a', skin: '#e8b48a', mouth: j.air ? 'o' : 'smile', wide: j.air, sweat: 1, look: [0.4, -0.3] }, t);
    // the dumbbell goes up with him
    const dy = j.dy * 1.1, x0 = 450 + (j.air ? 125 : 85), y0 = GROUND + 70 - dy - (j.air ? 330 : 120) * 1.1;
    g += BLK(x0 - 50, y0 - 10, x0 + 50, y0 + 10, '#888', 6) + BLK(x0 - 70, y0 - 34, x0 - 44, y0 + 34, '#3b3350', 8) + BLK(x0 + 44, y0 - 34, x0 + 70, y0 + 34, '#3b3350', 8);
    g += DUST(450, GROUND + 70, t, j.land, 1.1) + CAT(880, 900, 0.5, t, MEH({ c: 'grey', look: [-0.8, j.air ? -1 : 0] }));
    if (t < JJ('gym').t0 + 0.05) g += THINK(560, 560, 'I’ll definitely come|back tomorrow.', t, s_('n42') - 0.05, 470, 880);
    return g;
  },
  photo(t) {
    if (t > s_('n46') - 0.05) {
      // the photo: just feet at the top edge
      let g = ROOM(t, '#2b2540', '#2b2540');
      const k = pop(t, s_('n46') - 0.05, 0.2);
      g += `<g transform="translate(540,800) rotate(-4) scale(${n(k)})"><rect x="-380" y="-420" width="760" height="760" fill="#fff" stroke="${OUT}" stroke-width="5"/><rect x="-340" y="-380" width="680" height="560" fill="#bfe9ff"/>`;
      g += `<rect x="-340" y="80" width="680" height="100" fill="#8fd18b"/>`;
      for (const x of [-220, 0, 220]) g += BLK(x - 50, -380, x - 10, -330, '#3b3350', 6) + BLK(x + 10, -380, x + 50, -330, '#3b3350', 6);
      g += CAT(180, 170, 0.5, t, MEH({ c: 'orange' })) + T(0, 300, 'Family 2026', 54, OUT, { flat: 1 }) + `</g>`;
      return g;
    }
    let g = STREET(t);
    g += BLK(520, 1300, 560, 1500, '#555', 6) + BLK(470, 1220, 610, 1300, '#3b3350', 10) + `<circle cx="540" cy="1260" r="26" fill="#7fb8ff" stroke="${OUT}" stroke-width="3"/>`;
    ['p0', 'p1', 'p2'].forEach((k, i) => { g += JP(k, 300 + i * 240, GROUND + 20, 0.8, Object.assign({ mouth: 'grin', airMouth: 'o' }, TOWN[i + 1]), t); });
    g += CAT(160, GROUND + 30, 0.5, t, MEH({ c: 'black' })) + CAT(930, GROUND + 30, 0.5, t, MEH({ c: 'grey' }));
    if (t < JJ('p0').t0 + 0.05) g += THINK(540, 520, 'I look great|in this one.', t, s_('n45') - 0.05, 540, 820);
    return g;
  },
  baby(t) {
    let g = ROOM(t, '#fff1f8', '#c7a07a');
    const j = jumpState('baby', t);
    g += PERSON(540, 1180, 0.72, { j, shirt: '#ffffff', pants: '#ffffff', sleeve: '#f6c9a0', hair: 'bald', hairC: '#f6c9a0', mouth: j.air ? 'o' : 'smile', wide: j.air, look: [0, 0] }, t);
    // crib bars in front
    g += BLK(260, 1180, 820, 1220, '#ffd166', 12);
    for (let x = 280; x <= 800; x += 74) g += BLK(x, 1040, x + 14, 1180, '#ffd166', 4);
    g += BLK(260, 1020, 820, 1044, '#ffd166', 8) + BLK(260, 1220, 290, GROUND, '#ffd166', 6) + BLK(790, 1220, 820, GROUND, '#ffd166', 6);
    for (let k = 0; k < 3; k++) { const a = (t * 0.8 + k / 3) % 1; g += `<path d="M ${n(640 + k * 30)} ${n(1150 - a * 200)} q 12 -20 0 -40 q -12 -20 0 -40" stroke="#9bc53d" stroke-width="5" fill="none" opacity="${n(1 - a)}"/>`; }
    g += CAT(150, GROUND + 70, 0.55, t, MEH({ c: 'calico', look: [0.8, 0] })) + CAT(940, GROUND + 70, 0.55, t, MEH({ c: 'white', look: [-0.8, j.air ? -1 : 0] }));
    if (t < JJ('baby').t0 + 0.05) g += THINK(540, 560, 'I’m not the one who|made that smell.', t, s_('n48') - 0.05, 540, 880, 50);
    return g;
  },
  dessert(t) {
    const jd = JJ('dessert'), landed = t > jd.t0 + jd.dur;
    let g = ROOM(t, '#ffe9c7', '#c7a07a');
    g += TABLE(380, 1040, 1100, '#fff');
    // the cake
    g += BLK(660, 980, 900, 1100, '#ffb5a7', 12) + BLK(660, 960, 900, 990, '#fff', 12);
    const j = jumpState('dessert', t), u = j.air ? cl((t - jd.t0) / jd.dur) : landed ? 1 : 0;
    if (!landed) g += PERSON(lerp(330, 760, u), GROUND + 70 - u * 230, 1.0, { j, shirt: '#7fb8ff', hair: 'bowl', hairC: '#4a2f1c', mouth: j.air ? 'o' : 'smile', wide: j.air, look: [0.6, 0] }, t);
    else {
      // upside down, face in the cake, legs kicking
      const kick = Math.sin(t * 14) * 6;
      g += `<g transform="translate(780,${n(1000 + kick * 0.3)}) rotate(180)">` + PERSON(0, 400, 0.9, { shirt: '#7fb8ff', hair: 'bowl', hairC: '#4a2f1c' }, t) + `</g>`;
      g += BLK(640, 960, 920, 1000, '#fff', 8);
      for (let k = 0; k < 6; k++) { const a = t - jd.t0 - jd.dur; g += `<circle cx="${n(780 + Math.cos(k) * (60 + a * 200))}" cy="${n(960 - Math.sin(k + 1) * 40 - a * 80 + a * a * 300)}" r="12" fill="#fff" stroke="${OUT}" stroke-width="2"/>`; }
    }
    g += CAT(200, 1100, 0.5, t, MEH({ c: 'orange', look: [0.8, 0] }));
    if (t < jd.t0 + 0.05) g += THINK(500, 560, 'I’m not even hungry|for dessert.', t, s_('n51') - 0.05, 380, 860, 50);
    return g;
  },
  teacher2(t) {
    const CEIL = 300, jt = JJ('teacher2'), gone = t > jt.t0 + 0.3;
    let g = ROOM(t, '#fff1c9', '#d8a36f', { ceil: CEIL });
    g += BLK(110, 500, 970, 820, '#2f5d50', 10) + T(540, 640, 'MONDAY', 90, '#fff', { flat: 1 }) + T(540, 740, '8:00 AM', 56, '#fff', { flat: 1 });
    const j = jumpState('teacher2', t);
    g += PERSON(540, GROUND + 60, 1.05, { j, shirt: '#e94b5f', dress: 1, hair: 'bun', hairC: '#5a3a22', glasses: 1, mouth: j.air ? 'o' : 'smile', wide: j.air, sweat: 1 }, t);
    g += `<rect x="0" y="0" width="1080" height="${CEIL}" fill="#f4efe6" stroke="${OUT}" stroke-width="${LW}"/>`;
    if (gone) g += `<path d="M 460 ${CEIL} L 480 ${CEIL - 70} L 520 ${CEIL - 40} L 560 ${CEIL - 90} L 600 ${CEIL - 50} L 630 ${CEIL} Z" fill="#7cc8ff"/>`;
    g += CAT(200, GROUND + 60, 0.5, t, MEH({ c: 'black', look: [0.6, gone ? -1 : 0] }));
    if (t < jt.t0 + 0.05) g += THINK(540, 560, 'I love my job|on Mondays.', t, s_('n54') - 0.05, 540, 870);
    return g;
  },
  gooddog(t) {
    let g = STREET(t);
    g += DOG(540, GROUND + 160, 1.4, t, {});
    const ann = t > s_('n58') - 0.1;
    g += CAT(180, GROUND + 160, 0.6, t, { c: 'orange', meh: 1, brow: ann, look: [0.8, 0] }) + CAT(900, GROUND + 160, 0.6, t, { c: 'grey', meh: 1, look: [-0.8, 0] });
    if (ann) for (let k = 0; k < 4; k++) { const a = (t * 0.7 + k / 4) % 1; g += `<g transform="translate(${n(560 + Math.sin(k * 2) * 120)},${n(1080 - a * 300)}) scale(${n(0.8 + a * 0.4)})" opacity="${n(1 - a)}">` + BLK(-14, -10, 0, 4, '#ff5f8f', 4) + BLK(0, -10, 14, 4, '#ff5f8f', 4) + BLK(-8, 4, 8, 14, '#ff5f8f', 4) + `</g>`; }
    if (t < s_('n58') + 0.4) g += THINK(560, 640, 'I’m a good boy.', t, s_('n57') - 0.05, 640, 1000, 60);
    if (ann) g += T(540, 640, 'NO BOING.', 90, '#7bd389', { sw: 12 });
    return g;
  },
  me(t) {
    // the narrator launches; the camera follows him up
    const jm = JJ('me'), j = jumpState('me', t), cam = Math.min(j.dy * 1.0, 2600);
    let g = `<rect x="0" y="-4000" width="1080" height="6000" fill="#7cc8ff"/>`;
    g += `<g transform="translate(0,${n(cam)})">` + STREET(t);
    g += CAT(250, GROUND + 140, 0.55, t, MEH({ c: 'orange', look: [0.3, -1] })) + CAT(820, GROUND + 140, 0.55, t, MEH({ c: 'black', look: [-0.3, -1] }));
    for (const [x, y] of [[200, -300], [800, -900], [350, -1600], [850, -2200]]) g += `<g transform="translate(${x},${y})">` + BLK(-120, -40, 120, 30, '#ffffff', 16) + `</g>`;
    g += PERSON(540, GROUND + 80, 1.1, Object.assign({}, ME, { j, mouth: j.air ? 'o' : 'smile', wide: j.air, look: [0, -0.2] }), t);
    g += `</g>`;
    if (t < jm.t0 + 0.05) g += THINK(540, 560, 'This town is|totally normal.', t, s_('n60') - 0.05, 540, 880);
    return g;
  },
  market(t) {
    const jk = JJ('market');
    let g = ROOM(t, '#f2f7ff', '#d9d4e3');
    g += BLK(120, 380, 520, 480, '#4cc38a', 10) + T(320, 450, 'CEREAL', 56, '#fff', { flat: 1 });
    // shelves of cereal boxes
    for (let r = 0; r < 3; r++) { g += BLK(600, 640 + r * 220, 1040, 660 + r * 220, '#9aa3b8', 8); for (let x = 610; x < 1020; x += 64) g += BLK(x, 520 + r * 220, x + 52, 640 + r * 220, ['#e94b5f', '#ffd166', '#3b82c4', '#7bd389'][(x / 64 + r) % 4 | 0], 6); }
    const j = jumpState('market', t, 520);
    const u = j.air ? cl((t - jk.t0) / 0.5) : 0, stuck = j.flat;
    g += PERSON(lerp(380, 800, u), GROUND + 70, 1.05, { j, shirt: '#ff8c69', hair: 'curly', hairC: '#2f2a24', skin: '#c98d62', mouth: j.air ? 'o' : 'smile', wide: j.air, look: [-0.6, 0] }, t);
    if (stuck) for (let k = 0; k < 5; k++) { const a = t - jk.t0 - 0.5; if (a > 0) g += `<g transform="translate(${n(700 + k * 60 + a * (k - 2) * 60)},${n(560 + a * a * 900 + a * 300)}) rotate(${n(a * 200 * (k - 2))})">` + BLK(-22, -30, 22, 30, ['#e94b5f', '#ffd166', '#3b82c4'][k % 3], 5) + `</g>`; }
    g += PERSON(160, GROUND + 70, 0.95, { shirt: '#4cc38a', hair: 'short', hairC: '#7a4a2a', mouth: 'smile', look: [0.8, 0] }, t);
    g += CAT(500, GROUND + 80, 0.5, t, MEH({ c: 'grey', look: [0.6, stuck ? -1 : 0] }));
    if (t > s_('n62') - 0.05 && t < jk.t0 + 0.05) g += BUB(380, 600, 'Just looking,|thanks.', t, s_('n62') - 0.05, 0, 64);
    return g;
  },
  barber(t) {
    const jb = JJ('barber');
    let g = ROOM(t, '#e8f7ff', '#ffffff');
    for (let x = 0; x < 1080; x += 90) g += `<rect x="${x}" y="${GROUND - 20}" width="45" height="600" fill="#2b2540" opacity=".85"/>`;
    g += BLK(560, 400, 960, 820, '#cfd6e6', 12) + `<rect x="580" y="420" width="360" height="380" fill="#dff4ff"/>`;
    g += BLK(260, 1080, 600, 1140, '#e94b5f', 12) + BLK(260, 880, 300, 1080, '#e94b5f', 8) + BLK(400, 1140, 450, GROUND, '#888', 6);
    const j = jumpState('barber', t);
    g += PERSON(430, 1130, 0.9, { j, shirt: '#ffffff', hair: 'bald', hairC: '#f6c9a0', mouth: j.air ? 'o' : 'grin', wide: j.air, look: [0.4, 0] }, t);
    // the haircut flies higher than him and lands late
    const hy = 1130 - 0.9 * 380 - (j.air ? j.dy * 1.5 * 0.9 : 0);
    g += BLK(380, hy - 30, 480, hy, '#ff5f8f', 8) + BLK(400, hy - 60, 420, hy - 30, '#ff5f8f', 5) + BLK(440, hy - 56, 460, hy - 30, '#ff5f8f', 5);
    g += PERSON(760, GROUND + 80, 1.0, { shirt: '#3b3350', hair: 'spiky', hairC: '#2b2b2b', mouth: 'flat', look: [-0.6, 0] }, t);
    g += BLK(820, 900, 900, 1000, '#cfd6e6', 6);
    g += CAT(980, GROUND + 70, 0.5, t, MEH({ c: 'orange', look: [-0.6, j.air ? -1 : 0] }));
    if (t > s_('n65') - 0.05 && t < jb.t0 + 0.05) g += BUB(420, 600, 'Perfect,|thank you!', t, s_('n65') - 0.05, 0, 64);
    return g;
  },
  parcel(t) {
    let g = ROOM(t, '#f5ecff', '#c7a07a');
    const j = jumpState('online', t), jp = jumpState('box', t);
    g += PERSON(380, GROUND + 70, 1.05, { j, shirt: '#7bd389', hair: 'short', hairC: '#3a2a1a', mouth: j.air ? 'o' : 'smile', wide: j.air, look: [0.8, 0.4] }, t);
    // a tiny shirt in front of him
    g += `<g transform="translate(380,${n(GROUND + 70 - j.dy * 1.05 - 200)})">` + BLK(-26, -20, 26, 30, '#ff5f8f', 5) + BLK(-40, -20, -26, 0, '#ff5f8f', 4) + BLK(26, -20, 40, 0, '#ff5f8f', 4) + `</g>`;
    g += SHADOW(760, GROUND + 70, 0.9, jp.dy) + `<g transform="translate(760,${n(GROUND + 70 - jp.dy)}) scale(${n(jp.sx)},${n(jp.sy)})">` + BLK(-110, -150, 110, 0, '#c99a5b', 16) + `<rect x="-110" y="-90" width="220" height="24" fill="#e0c08a"/>` + T(0, -30, 'SIZE XS', 30, OUT, { flat: 1 }) + `</g>` + DUST(760, GROUND + 70, t, jp.land, 0.9);
    g += CAT(960, GROUND + 70, 0.5, t, MEH({ c: 'black', look: [-0.8, jp.air ? -1 : 0] }));
    if (t < JJ('online').t0 + 0.05) g += THINK(540, 560, 'This will|definitely fit.', t, s_('n68') - 0.05, 400, 870);
    return g;
  },
  football(t) {
    let g = SKY(t, '#9fd8ff', '#e9f8ff');
    g += `<rect x="0" y="760" width="1080" height="1200" fill="#5fbf5f"/>`; for (let k = 0; k < 6; k++) g += `<rect x="0" y="${760 + k * 160}" width="1080" height="80" fill="#6fcf6f"/>`;
    g += `<rect x="0" y="560" width="1080" height="200" fill="#d9d4e3"/>` + Array.from({ length: 12 }, (_, i) => `<rect x="${i * 92 + 10}" y="600" width="60" height="60" fill="${['#e94b5f', '#3b82c4', '#ffd166'][i % 3]}"/>`).join('');
    // the player: lying down, then springs up
    const jp = jumpState('player', t), down = t > s_('n70') + 0.6 && !jp.air && t < JJ('player').t0;
    if (down) g += `<g transform="translate(440,${GROUND + 40}) rotate(-90)">` + PERSON(0, 0, 0.9, { shirt: '#e94b5f', hair: 'spiky', hairC: '#3a2a1a', mouth: 'worry', look: [0, -1] }, t) + `</g>`;
    else g += PERSON(360, GROUND + 70, 0.95, { j: jp, shirt: '#e94b5f', hair: 'spiky', hairC: '#3a2a1a', mouth: jp.air ? 'o' : 'smile', wide: jp.air, look: [0.6, 0] }, t);
    g += DUST(360, GROUND + 70, t, jp.land, 0.95);
    const jr = jumpState('ref', t);
    g += PERSON(780, GROUND + 70, 0.95, { j: jr, shirt: '#2b2540', stripes: '#ffffff', hair: 'short', hairC: '#888', mouth: jr.air ? 'o' : 'flat', wide: jr.air, look: [-0.6, 0] }, t) + DUST(780, GROUND + 70, t, jr.land, 0.95);
    g += BLK(560, GROUND + 60, 620, GROUND + 120, '#ffffff', 8);
    g += CAT(120, GROUND + 230, 0.55, t, MEH({ c: 'orange', look: [0.5, 0] })) + CAT(980, GROUND + 230, 0.55, t, MEH({ c: 'grey', look: [-0.5, 0] }));
    if (t > s_('n71') - 0.05 && t < JJ('player').t0 + 0.05) g += BUB(380, 700, 'He touched me!', t, s_('n71') - 0.05, 0, 62);
    if (t > s_('n73') - 0.05 && t < JJ('ref').t0 + 0.05) g += BUB(700, 700, 'I saw everything.', t, s_('n73') - 0.05, 80, 60);
    return g;
  },
  sleepover(t) {
    const CEIL = 300;
    let g = ROOM(t, '#2f3a6a', '#4a3a6a', { ceil: CEIL });
    g += `<rect x="0" y="0" width="1080" height="${CEIL}" fill="#3b4570" stroke="${OUT}" stroke-width="${LW}"/>`;
    for (const x of [200, 380, 760, 880]) g += `<path d="M ${x} ${CEIL} l 20 -40 l 20 30 l 20 -40" stroke="#bbb" stroke-width="4" fill="none"/>`;
    const j = jumpState('sleep', t, 560);
    g += `<path d="M 540 ${GROUND - 40} L 900 520 L 1000 560 Z" fill="#fff6a8" opacity=".25"/>`;
    g += PERSON(540, GROUND + 60, 1.0, { j, shirt: '#9ad0ff', stripes: '#fff', hair: 'bowl', hairC: '#4a2f1c', mouth: j.air ? 'o' : 'smile', wide: 1, sweat: 1, stars: j.flat }, t);
    g += BLK(380, 1220, 700, GROUND + 60, '#7a62d6', 12);
    g += CAT(220, GROUND + 60, 0.55, t, { c: 'black', meh: 1, look: [0.6, 0] }) + CAT(880, GROUND + 60, 0.55, t, { c: 'white', sleep: 1 });
    if (t < JJ('sleep').t0 + 0.05) g += THINK(540, 600, 'I’m not scared|at all.', t, s_('n75') - 0.05, 540, 900);
    return g;
  },
  parade(t) {
    let g = STREET(t, { noWinCats: 0 });
    g += `<path d="M 60 560 Q 540 640 1020 560" stroke="${OUT}" stroke-width="3" fill="none"/>` + BLK(240, 470, 840, 570, '#ff5f8f', 12) + T(540, 545, 'TRUTH DAY', 76, '#fff', { flat: 1 });
    for (const [x, y, c] of [[110, 700, 'grey'], [760, 700, 'orange'], [980, 720, 'black']]) g += CAT(x, y, 0.45, t, MEH({ c, look: [0, 1] }));
    for (let i = 0; i < 5; i++) {
      const x = 110 + i * 215, ph = i * 0.37, c = (t * 1.6 + ph) % 1, dy = 4 * 380 * c * (1 - c);
      g += BLK(x - 80, GROUND + 50, x + 80, GROUND + 70, '#3b82c4', 10);
      g += PERSON(x, GROUND + 40, 0.58, Object.assign({ j: { dy, sx: 1, sy: 1 + 0.15 * Math.abs(1 - 2 * c), air: c > 0.08 && c < 0.92 }, mouth: 'grin', airMouth: 'grin' }, TOWN[i % 4]), t);
    }
    return g;
  },
  library(t) {
    const jk = JJ('libcat'), fall = t > jk.t0;
    let g = ROOM(t, '#f3e7d3', '#a5784f');
    g += BLK(120, 400, 520, 500, '#2b2540', 10) + T(320, 468, 'QUIET PLEASE', 44, '#fff', { flat: 1 });
    // bookshelf
    g += BLK(620, 520, 1040, GROUND, '#8a5a3c', 14);
    const cols = ['#e94b5f', '#3b82c4', '#ffd166', '#7bd389', '#c9b8ff'];
    for (let r = 0; r < 3; r++) for (let x = 640; x < 1010; x += 30) { const c = cols[(x / 30 + r) % 5 | 0]; if (r === 0 && fall) continue; g += BOOK(x, 760 + r * 190, c); }
    if (fall) for (let k = 0; k < 10; k++) { const a = t - jk.t0; g += `<g transform="translate(${n(660 + k * 36 + a * (k - 5) * 50)},${n(Math.min(GROUND + 40, 720 + a * a * 1400))}) rotate(${n(a * (k - 5) * 120)})">` + BOOK(-12, 35, cols[k % 5]) + `</g>`; }
    // the kitty on the top shelf
    const j = jumpState('libcat', t);
    g += `<g transform="translate(830,${n(520 - j.dy)}) scale(${n(j.sx)},${n(j.sy)})">` + CAT(0, 0, 0.55, t, { c: 'orange', look: j.air ? [0, -1] : [-0.6, -0.4] }) + `</g>` + DUST(830, 520, t, j.land, 0.55);
    g += PERSON(330, GROUND + 70, 1.05, { shirt: '#9b6a45', hair: 'bun', hairC: '#888', glasses: 1, mouth: 'flat', look: [0.6, -0.3] }, t);
    g += CAT(130, GROUND + 70, 0.5, t, MEH({ c: 'grey', look: [0.8, fall ? -1 : 0] }));
    if (inT(t, s_('n80') + 0.6, s_('n81') + 0.6)) g += THINK(450, 620, 'Nobody ever borrows|the fun books.', t, s_('n80') + 0.6, 330, 880, 48);
    if (inT(t, s_('n81'), e_('n81') + 0.3)) g += T(330, 820, '…', 110, OUT, { flat: 1 });
    if (inT(t, s_('n82') + 0.9, jk.t0 + 0.05)) g += THINK(560, 440, 'I’m not going to|knock these off.', t, s_('n82') + 0.9, 820, 300, 48);
    return g;
  },
  bbq(t) {
    let g = SKY(t);
    g += `<rect x="0" y="${GROUND - 40}" width="1080" height="1920" fill="#8fd18b"/>`;
    for (let x = 0; x < 1080; x += 60) g += BLK(x, 800, x + 40, GROUND - 40, '#c99a5b', 6);
    // grill + burnt sausages
    g += BLK(560, 1000, 940, 1060, '#3b3350', 12) + BLK(600, 1060, 630, GROUND, '#555', 6) + BLK(870, 1060, 900, GROUND, '#555', 6);
    for (let k = 0; k < 3; k++) { const a = (t * 0.6 + k / 3) % 1; g += `<circle cx="${n(720 + k * 40 + Math.sin(a * 6) * 14)}" cy="${n(980 - a * 260)}" r="${n(18 + a * 30)}" fill="#6a6a7a" opacity="${n(0.5 * (1 - a))}"/>`; }
    const j = jumpState('bbq', t);
    for (let k = 0; k < 3; k++) g += BLK(620 + k * 100, 976, 700 + k * 100, 998, '#2a2222', 6);
    // the sausage he is holding up flies even higher
    const sy = 760 - (j.air ? j.dy * 1.7 : 0);
    g += `<g transform="translate(480,${n(sy)}) rotate(${j.air ? n(t * 600) : 0})">` + BLK(-40, -11, 40, 11, '#2a2222', 6) + `</g>`;
    g += PERSON(380, GROUND + 60, 1.05, { j, shirt: '#8a9a5b', apron: 1, chef: 1, hair: 'bald', hairC: '#cfcfcf', glasses: 1, mouth: j.air ? 'o' : 'grin', wide: j.air, look: [0.6, 0] }, t);
    g += DUST(380, GROUND + 60, t, j.land, 1.05) + CAT(960, GROUND + 70, 0.55, t, MEH({ c: 'orange', look: [-0.6, j.air ? -1 : 0] }));
    if (t > s_('n85') - 0.05 && t < JJ('bbq').t0 + 0.05) g += BUB(420, 600, 'It’s not burnt,|it’s crispy.', t, s_('n85') - 0.05, 0, 64);
    return g;
  },
});
// shots and cameras for the new beats
CUTS.push(['thoughts', s_('n39') - 0.05], ['gym', s_('n41') - 0.05], ['photo', s_('n44') - 0.05], ['baby', s_('n47') - 0.05], ['dessert', s_('n50') - 0.05], ['teacher2', s_('n53') - 0.05],
  ['gooddog', s_('n56') - 0.05], ['me', s_('n59') - 0.05], ['market', s_('n61') - 0.05], ['barber', s_('n64') - 0.05], ['parcel', s_('n67') - 0.05], ['football', s_('n70') - 0.05],
  ['sleepover', s_('n74') - 0.05], ['parade', s_('n77') - 0.05], ['library', s_('n79') - 0.05], ['bbq', s_('n84') - 0.05]);
CUTS.sort((a, b) => a[1] - b[1]);
Object.assign(CAM, { thoughts: [1.2, 540, 1080], gym: [1.3, 540, 1000], photo: [1.25, 540, 1080], baby: [1.3, 540, 1000], dessert: [1.3, 560, 1000], teacher2: [1.3, 540, 1000], gooddog: [1.2, 540, 1100], me: [1.2, 540, 1040], market: [1.3, 560, 1000], barber: [1.3, 560, 1000], parcel: [1.3, 560, 1000], football: [1.25, 560, 1060], sleepover: [1.3, 540, 1000], parade: [1.15, 540, 1060], library: [1.25, 560, 980], bbq: [1.25, 560, 1000] });
