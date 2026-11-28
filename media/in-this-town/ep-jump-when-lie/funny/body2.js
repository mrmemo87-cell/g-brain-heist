// v3 beats: restaurant, school + dog, birthday socks, dentist
function DOG(x, y, s, t, o = {}) {
  const C = '#c98d62', D2 = '#8a5a3c', sw = Math.sin(t * 9) * (o.guilty ? 2 : 10);
  let g = `<g transform="translate(${n(x)},${n(y)}) scale(${s * (o.flip ? -1 : 1)},${s})">`;
  g += `<g transform="rotate(${n(-30 + sw)},-90,-120)">` + BLK(-104, -170, -86, -110, C, 6) + `</g>`;
  g += BLK(-110, -140, 70, -60, C, 14) + BLK(-100, -60, -70, 0, C, 8) + BLK(-30, -60, 0, 0, C, 8) + BLK(10, -60, 40, 0, C, 8) + BLK(44, -60, 70, 0, C, 8);
  g += `<rect x="-40" y="-130" width="60" height="30" fill="${D2}" opacity=".5"/>`;
  g += BLK(40, -230, 150, -130, C, 14) + BLK(130, -175, 180, -135, '#e8b48a', 8) + `<rect x="165" y="-172" width="14" height="12" fill="${OUT}"/>`;
  const ear = o.guilty ? 30 : 0;
  g += `<g transform="rotate(${ear},50,-228)">` + BLK(40, -236, 64, -170, D2, 6) + `</g>` + `<g transform="rotate(${-ear},128,-228)">` + BLK(118, -236, 142, -180, D2, 6) + `</g>`;
  const ly = o.guilty ? 6 : 0;
  g += `<rect x="78" y="${-200 + ly}" width="12" height="16" fill="${OUT}"/><rect x="110" y="${-200 + ly}" width="12" height="16" fill="${OUT}"/>`;
  if (o.guilty) g += `<rect x="72" y="-210" width="24" height="5" fill="${OUT}" transform="rotate(12,84,-208)"/><rect x="104" y="-210" width="24" height="5" fill="${OUT}" transform="rotate(-12,116,-208)"/>`;
  if (o.paper) g += `<g transform="translate(160,-130) rotate(18)"><rect x="-22" y="-14" width="44" height="30" fill="#fff" stroke="${OUT}" stroke-width="2.5"/><line x1="-14" y1="-4" x2="14" y2="-4" stroke="#8fa" stroke-width="2"/><line x1="-14" y1="4" x2="10" y2="4" stroke="#8fa" stroke-width="2"/></g>`;
  return g + `</g>`;
}
function LADDER(x, y0, y1, ang) {
  let g = `<g transform="rotate(${ang},${x},${y1})">` + BLK(x - 50, y0, x - 36, y1, '#e0a33a', 6) + BLK(x + 36, y0, x + 50, y1, '#e0a33a', 6);
  for (let y = y0 + 40; y < y1; y += 70) g += BLK(x - 40, y, x + 40, y + 12, '#e0a33a', 4);
  return g + `</g>`;
}
function BALLOON(x, y, c, t, ph) {
  const bx = x + Math.sin(t * 1.4 + ph) * 8;
  return `<path d="M ${n(bx)} ${n(y + 46)} q 10 40 -4 80" stroke="${OUT}" stroke-width="2" fill="none"/><ellipse cx="${n(bx)}" cy="${y}" rx="38" ry="46" fill="${c}" stroke="${OUT}" stroke-width="3"/><ellipse cx="${n(bx - 12)}" cy="${y - 16}" rx="8" ry="12" fill="#fff" opacity=".5"/>`;
}
Object.assign(SC, {
  diner(t) {
    const CEIL = 260, jd = JJ('diner');
    let g = ROOM(t, '#ffe9c7', '#7a5a4a', { ceil: CEIL });
    g += BLK(330, 400, 650, 540, '#3b4a7a', 10) + T(490, 485, 'DINER', 64, '#ffd166', { flat: 1 });
    g += BLK(740, 760, 1060, 1300, '#e94b5f', 14) + CAT(900, 760, 0.5, t, MEH({ c: 'black', look: [-0.8, jd && t > jd.t0 ? -1 : 0] }));
    // family + table rise together and stick under the ceiling
    const j = jumpState('diner', t, 500);
    g += `<g transform="translate(0,${n(-j.dy)})">`;
    g += PERSON(230, GROUND + 60, 0.95, { j: { dy: 0, sx: j.sx, sy: j.sy, air: j.air }, shirt: '#7bd389', hair: 'curly', hairC: '#2f2a24', skin: '#c98d62', mouth: j.air ? 'o' : 'grin', wide: j.air, look: [0.7, 0] }, t);
    g += PERSON(600, GROUND + 60, 0.95, { j: { dy: 0, sx: j.sx, sy: j.sy, air: j.air }, shirt: '#c9b8ff', dress: 1, hair: 'long', hairC: '#7a4a2a', mouth: j.air ? 'o' : 'smile', wide: j.air, look: [-0.7, 0], ph: 2 }, t);
    g += TABLE(300, 540, 1110, '#ffffff') + BLK(360, 1084, 470, 1110, '#ffffff', 6) + `<rect x="380" y="1074" width="70" height="14" fill="#6b8e23"/>`;
    g += `</g>` + (j.air && j.dy > 50 ? DUST(420, GROUND, t, jd.t0 + 0.05, 1.2) : '');
    // waiter with a ladder, unimpressed
    if (t > s_('n28') - 0.1) {
      const u = es(t, s_('n28') - 0.1, s_('n28') + 0.6);
      const wx = lerp(1250, 830, u);
      g += LADDER(wx - 120, 300, GROUND + 40, -14 * u);
      g += PERSON(wx, GROUND + 80, 1.0, { shirt: '#ffffff', tie: '#2b2540', pants: '#2b2540', hair: 'short', hairC: '#2b2b2b', mouth: 'flat', look: [-0.6, -0.8], brow: 1 }, t);
    }
    if (t > s_('n25') && t < s_('n26')) g += BUB(560, 520, 'How’s your food?', t, s_('n25') + 0.6, 0, 60);
    if (t > s_('n26') - 0.05 && t < jd.t0 + 0.1) g += BUB(330, 520, 'Delicious!', t, s_('n26') - 0.05, -60, 70);
    return g;
  },
  school(t) {
    const CEIL = 280;
    let g = ROOM(t, '#e3f6f5', '#b9c2d6', { ceil: CEIL });
    g += BLK(90, 460, 990, 800, '#2f5d50', 10) + T(540, 600, 'HOMEWORK', 70, '#fff', { flat: 1 }) + T(540, 700, 'due TODAY', 50, '#fff', { flat: 1 });
    g += TABLE(620, 1010, 1080) + CAT(900, 1080, 0.45, t, MEH({ c: 'white', look: [-0.8, t > JJ('kid').t0 ? -1 : 0] }));
    const guilty = t > s_('n32') - 0.1;
    g += JP('kid', 320, GROUND + 60, 1.05, Object.assign({}, ME, { mouth: 'smile', look: [0.6, 0], sweat: 1 }), t, 630);
    const dj = jumpState('dog', t);
    g += SHADOW(640, GROUND + 70, 0.9, dj.dy) + `<g transform="translate(640,${n(GROUND + 70 - dj.dy)}) scale(${n(dj.sx)},${n(dj.sy)})">` + DOG(0, 0, 0.9, t, { guilty, flip: 1, paper: !dj.air }) + `</g>` + DUST(640, GROUND + 70, t, dj.land, 0.9);
    if (t > s_('n30') - 0.05 && t < JJ('kid').t0 + 0.1) g += BUB(360, 560, 'My dog ate|my homework.', t, s_('n30') - 0.05, -40, 64);
    if (guilty) g += T(560, 940, '…', 90, OUT, { flat: 1 });
    return g;
  },
  party(t) {
    const CEIL = 250, jg = JJ('socks');
    let g = ROOM(t, '#ffe1f0', '#c7a07a', { ceil: CEIL });
    for (let k = 0; k < 7; k++) g += `<path d="M ${k * 160} 300 l 80 50 l 80 -50" stroke="${['#e94b5f', '#ffd166', '#3b82c4'][k % 3]}" stroke-width="10" fill="none"/>`;
    g += T(540, 470, 'HAPPY BIRTHDAY!', 70, '#ff5f8f', { sw: 8 });
    // balloons hugging the ceiling
    const bal = [[180, 360, '#e94b5f'], [300, 330, '#3b82c4'], [440, 350, '#ffd166'], [600, 330, '#7bd389'], [760, 350, '#c9b8ff'], [900, 330, '#ff8c69']];
    g += TABLE(620, 1020, 1080, '#fff') + BLK(700, 980, 820, 1080, '#ffb5a7', 10) + BLK(730, 940, 790, 980, '#fff4d6', 6) + `<rect x="756" y="912" width="8" height="28" fill="#3b82c4"/>`;
    g += BLK(860, 1010, 960, 1080, '#7fb8ff', 8) + `<rect x="900" y="1010" width="20" height="70" fill="#e94b5f"/>`;
    const j = jumpState('socks', t, 470), up = j.flat;
    const gx = 400 + (up ? Math.sin(t * 1.5) * 20 : 0), bob = up ? Math.sin(t * 2.2) * 10 : 0;
    g += bal.map(([x, y, c], i) => BALLOON(x, y, c, t, i)).join('');
    g += PERSON(gx, GROUND + 60 + bob, 1.0, { j, shirt: '#8a9a5b', pants: '#5a5a6a', hair: 'bald', hairC: '#cfcfcf', glasses: 1, mouth: j.air ? 'o' : 'grin', wide: j.air, look: [0.4, 0] }, t);
    // the socks he loves
    if (!j.air) g += `<g transform="translate(${n(gx + 70)},${n(GROUND - 70)})">` + BLK(0, 0, 26, 60, '#ff5f8f', 6) + BLK(0, 46, 46, 66, '#ff5f8f', 6) + `</g>`;
    else g += `<g transform="translate(${n(gx + 90)},${n(GROUND + 60 + bob - j.dy - 330)}) rotate(30)">` + BLK(0, 0, 26, 60, '#ff5f8f', 6) + BLK(0, 46, 46, 66, '#ff5f8f', 6) + `</g>`;
    g += CAT(160, GROUND + 70, 0.55, t, MEH({ c: 'calico', look: [0.6, up ? -1 : 0] })) + CAT(980, 1080, 0.4, t, MEH({ c: 'orange', look: [-0.8, up ? -1 : 0] }));
    if (t > s_('n34') - 0.05 && t < jg.t0 + 0.1) g += BUB(480, 600, 'Oh wow, socks!|I love them!', t, s_('n34') - 0.05, -60, 62);
    return g;
  },
  dentist(t) {
    const jd = JJ('dentist'), crash = jd.t0 + 0.42;
    let g = ROOM(t, '#e3f6f5', '#c9d3e6');
    // window high on the wall: smashes as he goes through
    g += BLK(560, 300, 960, 600, '#ffffff', 12) + `<rect x="580" y="320" width="360" height="260" fill="#bfe9ff" stroke="${OUT}" stroke-width="3"/>`;
    if (t < crash) g += `<line x1="760" y1="320" x2="760" y2="580" stroke="${OUT}" stroke-width="3"/><line x1="580" y1="450" x2="940" y2="450" stroke="${OUT}" stroke-width="3"/>`;
    else {
      g += `<path d="M 700 320 L 740 400 L 680 470 L 760 520 L 720 580 L 840 580 L 800 500 L 880 450 L 820 380 L 860 320 Z" fill="#7cc8ff" stroke="${OUT}" stroke-width="3"/>`;
      const a = t - crash; for (let k = 0; k < 9; k++) { const ang = (k / 9) * 2 * PI; g += `<g transform="translate(${n(760 + Math.cos(ang) * (60 + a * 500))},${n(450 + Math.sin(ang) * (40 + a * 300) + a * a * 600)}) rotate(${n(k * 40 + a * 400)})"><path d="M -14 -10 L 16 -4 L -2 14 Z" fill="#dff4ff" stroke="${OUT}" stroke-width="2"/></g>`; }
    }
    // dentist chair + patient
    g += BLK(120, 1060, 460, 1130, '#3b82c4', 14) + BLK(120, 860, 170, 1060, '#3b82c4', 10) + BLK(260, 1130, 320, GROUND, '#9aa3b8', 8);
    g += PERSON(300, 1100, 0.8, { shirt: '#ffd166', hair: 'spiky', skin: '#e8b48a', mouth: 'o', wide: 1, sweat: 1, look: [0.8, t > jd.t0 ? -1 : 0] }, t);
    g += CAT(1000, GROUND + 70, 0.5, t, MEH({ c: 'grey', look: [-0.6, t > jd.t0 ? -1 : 0] }));
    // dentist: jumps up and diagonally through the window
    const j = jumpState('dentist', t);
    const dx = j.air ? Math.min(1, (t - jd.t0) / 0.42) * 160 : 0;
    g += PERSON(600 + dx, GROUND + 70, 1.05, { j, coat: 1, shirt: '#9ad0ff', hair: 'short', hairC: '#5a3a22', glasses: 1, mouth: j.air ? 'o' : 'smile', wide: j.air, look: [-0.7, 0] }, t);
    // drill (tool, on the tray)
    g += BLK(820, 1000, 960, 1020, '#cfd6e6', 6) + BLK(880, 1020, 896, GROUND, '#9aa3b8', 6) + BLK(840, 980, 900, 1000, '#ffffff', 4);
    if (t > s_('n37') - 0.05 && t < jd.t0 + 0.1) g += BUB(560, 700, 'This won’t|hurt a bit.', t, s_('n37') - 0.05, 40, 64);
    return g;
  },
});
