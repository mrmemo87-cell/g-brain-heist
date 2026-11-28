// Blocky restyle (generic chunky toy-block look). Loaded after scene.js: redefines the drawing functions only,
// so timing, captions and layout stay identical to the original cut.
const hexb = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
const mixc = (a, b, u) => { const A = hexb(a), B = hexb(b); return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * u).toString(16).padStart(2, '0')).join(''); };
const LT = (c) => mixc(c, '#ffffff', 0.35), DK = (c) => mixc(c, '#000000', 0.25);
// a 3-tone block: front face + lighter top + darker right side
function BLK(x0, y0, x1, y1, c, d = 12, sw = 3) {
  const dx = d * 0.8, dy = d * 0.7;
  return `<path d="M ${n(x0)} ${n(y0)} L ${n(x0 + dx)} ${n(y0 - dy)} L ${n(x1 + dx)} ${n(y0 - dy)} L ${n(x1)} ${n(y0)} Z" fill="${LT(c)}" stroke="${OUT}" stroke-width="${sw}" stroke-linejoin="round"/>`
    + `<path d="M ${n(x1)} ${n(y0)} L ${n(x1 + dx)} ${n(y0 - dy)} L ${n(x1 + dx)} ${n(y1 - dy)} L ${n(x1)} ${n(y1)} Z" fill="${DK(c)}" stroke="${OUT}" stroke-width="${sw}" stroke-linejoin="round"/>`
    + `<rect x="${n(x0)}" y="${n(y0)}" width="${n(x1 - x0)}" height="${n(y1 - y0)}" fill="${c}" stroke="${OUT}" stroke-width="${sw}"/>`;
}
const STUD = (x, y, c, r = 9) => `<ellipse cx="${n(x)}" cy="${n(y)}" rx="${r}" ry="${r * 0.45}" fill="${DK(c)}" stroke="${OUT}" stroke-width="2"/><rect x="${n(x - r)}" y="${n(y - 7)}" width="${2 * r}" height="7" fill="${c}"/><ellipse cx="${n(x)}" cy="${n(y - 7)}" rx="${r}" ry="${r * 0.45}" fill="${LT(c)}" stroke="${OUT}" stroke-width="2"/>`;

function HAIR(o, back) {
  const c = o.hairC || '#5a3a22', h = o.hair || 'short';
  if (back) return h === 'long' ? BLK(-70, -360, -56, -236, c, 10) + BLK(56, -360, 72, -236, c, 10) : '';
  if (h === 'bald') return BLK(-70, -322, -60, -298, c, 6) + BLK(60, -322, 70, -298, c, 6);
  let g = BLK(-66, -384, 66, -350, c, 14);
  if (h === 'spiky') g += [-50, -20, 10, 40].map((x) => BLK(x, -404, x + 20, -384, c, 8)).join('');
  if (h === 'bun') g += BLK(-20, -414, 20, -386, c, 10);
  if (h === 'curly') g += [-60, -30, 0, 30].map((x) => BLK(x, -396, x + 26, -382, c, 8)).join('');
  if (h === 'bowl') g += BLK(-66, -350, -30, -332, c, 0) + BLK(-10, -350, 20, -324, c, 0) + BLK(36, -350, 66, -338, c, 0) + `<path d="M 52 -390 L 60 -414 M 30 -392 L 34 -410" stroke="${OUT}" stroke-width="4"/>`;
  if (h === 'long') g += BLK(-66, -350, -44, -330, c, 0) + BLK(44, -350, 66, -330, c, 0);
  return g;
}
function FACE(o, t, x) {
  const lk = o.look || [0, 0], op = blink(t, x * 0.013 + (o.ph || 0)), m = o.mouth || 'smile';
  let g = '';
  const ey = -306;
  for (const i of [-1, 1]) {
    if (o.wide) g += `<rect x="${i * 24 - 13}" y="${ey - 13}" width="26" height="26" fill="#fff" stroke="${OUT}" stroke-width="2.5"/><rect x="${n(i * 24 + lk[0] * 4 - 6)}" y="${n(ey + lk[1] * 4 - 6)}" width="12" height="12" fill="${OUT}"/>`;
    else g += `<rect x="${n(i * 24 + lk[0] * 5 - 7)}" y="${n(ey + lk[1] * 5 - 10 * op)}" width="14" height="${n(20 * op)}" rx="2" fill="${OUT}"/><rect x="${n(i * 24 + lk[0] * 5 - 2)}" y="${n(ey + lk[1] * 5 - 7)}" width="5" height="5" fill="#fff" opacity="${op > 0.5 ? 1 : 0}"/>`;
    if (o.glasses) g += `<rect x="${i * 24 - 19}" y="${ey - 17}" width="38" height="34" fill="none" stroke="${OUT}" stroke-width="3.5"/>`;
    g += `<rect x="${i * 44 - 10}" y="-282" width="20" height="10" fill="#ff8fa3" opacity=".55"/>`;
  }
  if (o.glasses) g += `<line x1="-5" y1="${ey}" x2="5" y2="${ey}" stroke="${OUT}" stroke-width="3"/>`;
  if (o.brow) for (const i of [-1, 1]) g += `<rect x="${i * 24 - 12}" y="${ey - 30}" width="24" height="5" fill="${OUT}" transform="rotate(${i * -10},${i * 24},${ey - 28})"/>`;
  const my = -268;
  if (m === 'smile') g += `<path d="M -20 ${my - 4} L -20 ${my + 4} L 20 ${my + 4} L 20 ${my - 4}" stroke="${OUT}" stroke-width="4.5" fill="none" stroke-linejoin="miter"/>`;
  else if (m === 'grin') g += `<path d="M -26 ${my - 6} L 26 ${my - 6} L 26 ${my + 2} L 14 ${my + 12} L -14 ${my + 12} L -26 ${my + 2} Z" fill="#fff" stroke="${OUT}" stroke-width="3.5" stroke-linejoin="round"/>`;
  else if (m === 'o') g += `<rect x="-11" y="${my - 10}" width="22" height="26" rx="3" fill="#7a2f3b" stroke="${OUT}" stroke-width="3"/>`;
  else if (m === 'zip') { g += `<line x1="-24" y1="${my + 2}" x2="24" y2="${my + 2}" stroke="${OUT}" stroke-width="4"/>`; for (let k = -18; k <= 18; k += 6) g += `<line x1="${k}" y1="${my - 4}" x2="${k}" y2="${my + 8}" stroke="${OUT}" stroke-width="2"/>`; }
  else if (m === 'worry') g += `<path d="M -20 ${my + 6} L -10 ${my - 2} L 0 ${my + 6} L 10 ${my - 2} L 20 ${my + 6}" stroke="${OUT}" stroke-width="4" fill="none"/>`;
  else g += `<line x1="-16" y1="${my + 2}" x2="16" y2="${my + 2}" stroke="${OUT}" stroke-width="4"/>`;
  if (o.sweat) g += `<path d="M 74 -350 q 10 18 0 26 q -10 -8 0 -26 Z" fill="#8fd3ff" stroke="${OUT}" stroke-width="2"/>`;
  return g;
}
function PERSON(x, y, s, o, t) {
  const j = o.j || { dy: 0, sx: 1, sy: 1, air: 0 };
  const sk = o.skin || '#f6c9a0', sh = o.shirt || '#4aa3df', pa = o.pants || '#3d4a7a', sl = o.sleeve || sh;
  let g = SHADOW(x, y, s, j.dy);
  g += `<g transform="translate(${n(x)},${n(y - j.dy * s)}) scale(${n(s * j.sx * (o.flip ? -1 : 1))},${n(s * j.sy)})">`;
  const tuck = j.air ? 14 : 0, kick = j.air ? 8 : 0;
  // legs + shoes
  for (const i of [-1, 1]) { const lx = i < 0 ? -46 - kick : 6 + kick; g += BLK(lx, -112 - tuck, lx + 40, -18 - tuck, pa, 10) + BLK(lx, -18 - tuck, lx + 40, 0 - tuck, o.shoe || '#3b3350', 10); }
  if (o.bandage) g += BLK(-50, -60, -2, -24, '#ffffff', 8);
  // arm: hangs, or swings up while airborne
  const ARM = (i) => { const a = j.air ? -i * 150 : 0, px = i * 76, py = -234; return `<g transform="rotate(${a},${px},${py})">` + BLK(px - 15, py, px + 15, py + 96, sl, 10) + BLK(px - 15, py + 96, px + 15, py + 122, sk, 10) + `</g>`; };
  g += ARM(-1);
  // torso
  g += BLK(-60, -240, 60, -100, sh, 16);
  if (o.dress) g += BLK(-66, -150, 66, -96, sh, 12);
  if (o.stripes) for (let k = -214; k < -110; k += 24) g += `<rect x="-60" y="${k}" width="120" height="8" fill="${o.stripes}" opacity=".85"/>`;
  if (o.coat) g += `<rect x="-60" y="-240" width="52" height="140" fill="#fff" stroke="${OUT}" stroke-width="3"/><rect x="8" y="-240" width="52" height="140" fill="#fff" stroke="${OUT}" stroke-width="3"/><rect x="-6" y="-170" width="12" height="12" fill="#9aa8c4" stroke="${OUT}" stroke-width="2"/>`;
  if (o.apron) g += `<rect x="-42" y="-206" width="84" height="106" fill="#fff4d6" stroke="${OUT}" stroke-width="3"/><rect x="-18" y="-164" width="36" height="22" fill="none" stroke="${OUT}" stroke-width="2.5"/>`;
  if (o.sash) g += `<path d="M -60 -228 L 60 -122 L 60 -100 L -60 -206 Z" fill="#e94b5f" stroke="${OUT}" stroke-width="3"/>`;
  if (o.tie) g += `<path d="M -8 -240 L 8 -240 L 8 -150 L 0 -140 L -8 -150 Z" fill="${o.tie}" stroke="${OUT}" stroke-width="2.5"/>`;
  g += ARM(1);
  // cube head with a printed face
  g += HAIR(o, 1) + BLK(-66, -366, 66, -244, sk, 18);
  g += FACE(o, t, x) + HAIR(o, 0);
  if (o.nightcap) g += BLK(-66, -398, 66, -366, '#7fb8ff', 14) + BLK(-30, -430, 30, -398, '#7fb8ff', 10) + BLK(30, -446, 58, -420, '#ffffff', 8);
  if (o.tophat) g += BLK(-60, -394, 60, -380, '#2b2540', 12) + BLK(-38, -470, 38, -394, '#2b2540', 12) + `<rect x="-38" y="-410" width="76" height="14" fill="#e94b5f"/>`;
  if (o.chef) g += BLK(-50, -404, 50, -380, '#ffffff', 10) + BLK(-56, -456, 56, -404, '#ffffff', 12);
  if (o.lampshade) g += BLK(-56, -460, 56, -378, '#ffd166', 14);
  g += `</g>`;
  if (o.stars) for (let k = 0; k < 3; k++) { const a = t * 5 + k * 2.1; g += `<g transform="translate(${n(x + Math.cos(a) * 80 * s)},${n(y - j.dy * s - 440 * s + Math.sin(a) * 18)}) rotate(45)"><rect x="-11" y="-11" width="22" height="22" fill="#ffd166" stroke="${OUT}" stroke-width="3"/></g>`; }
  return g;
}
// voxel-ish kitty
function CAT(x, y, s, t, o = {}) {
  const P = CATC[o.c || 'orange'], C = P[0], D2 = P[1], BL = P[2];
  let g = `<g transform="translate(${n(x)},${n(y)}) scale(${s})">`;
  if (o.sleep) {
    g += BLK(-120, -70, 110, 0, C, 16) + BLK(40, -130, 140, -40, C, 16) + BLK(46, -152, 72, -130, C, 8) + BLK(108, -152, 134, -130, C, 8);
    g += `<rect x="62" y="-96" width="22" height="5" fill="${OUT}"/><rect x="98" y="-96" width="22" height="5" fill="${OUT}"/>` + [0, 1, 2].map((i) => { const u = ((t * 0.4 + i / 3) % 1); return T(160 + u * 50, -160 - u * 90, 'z', 30 + i * 6, '#fff', { op: n(1 - u), flat: 1 }); }).join('');
    return g + `</g>`;
  }
  // tail: stacked blocks that sway
  const sw = Math.sin(t * 2.2 + x) * 16;
  for (let k = 0; k < 4; k++) { const tx = 52 + k * 8 + sw * (k / 3), ty = -40 - k * 26; g += BLK(tx, ty - 24, tx + 22, ty, k === 3 ? D2 : C, 8); }
  g += BLK(-62, -130, 62, 0, C, 16);
  g += `<rect x="-36" y="-30" width="72" height="18" fill="${D2}" opacity=".6"/><rect x="-36" y="-70" width="72" height="12" fill="${D2}" opacity=".5"/>`;
  if (!o.back) g += `<rect x="-26" y="-110" width="52" height="70" fill="${BL}"/>` + BLK(-54, -16, -10, 0, BL, 6) + BLK(10, -16, 54, 0, BL, 6);
  const hy = -150 + (o.lick ? Math.sin(t * 6) * 4 : 0);
  g += `<g transform="translate(0,${n(hy)})">`;
  g += BLK(-60, -100, -26, -62, C, 8) + BLK(26, -100, 60, -62, C, 8);
  if (!o.back) g += `<rect x="-50" y="-90" width="16" height="22" fill="#ff8fab"/><rect x="34" y="-90" width="16" height="22" fill="#ff8fab"/>`;
  g += BLK(-68, -64, 68, 40, C, 16);
  if (!o.back) {
    const lk = o.look || [0, 0], op = blink(t, x * 0.01 + 0.7) * (o.meh ? 0.5 : 1);
    for (const i of [-1, 1]) { g += `<rect x="${i * 26 - 13}" y="${n(-20 - 14 * op)}" width="26" height="${n(28 * op)}" fill="#c8f06a" stroke="${OUT}" stroke-width="3"/>`; if (op > 0.3) g += `<rect x="${n(i * 26 + lk[0] * 5 - 4)}" y="${n(-18 + lk[1] * 5 - 10)}" width="8" height="20" fill="#17152e"/>`; }
    if (o.meh) for (const i of [-1, 1]) g += `<rect x="${i * 26 - 15}" y="-36" width="30" height="${n(30 - 28 * op)}" fill="${C}" stroke="${OUT}" stroke-width="3"/>`;
    g += `<rect x="-7" y="6" width="14" height="9" fill="#ff8fab" stroke="${OUT}" stroke-width="2"/><path d="M -14 22 L -7 26 L 0 20 L 7 26 L 14 22" stroke="${OUT}" stroke-width="3" fill="none"/>`;
    for (const i of [-1, 1]) for (const k of [-1, 0, 1]) g += `<line x1="${i * 34}" y1="${16 + k * 8}" x2="${i * 84}" y2="${12 + k * 14}" stroke="#fff" stroke-width="3" opacity=".9"/>`;
  }
  g += `</g>`;
  if (o.lick && !o.back) g += BLK(n(-36 + Math.sin(t * 6) * 4), -128, n(-2 + Math.sin(t * 6) * 4), -90, BL, 6);
  return g + `</g>`;
}
function PEEK(x, s, t, c = 'orange', y = 1080) {
  const P = CATC[c], k = Math.sin(t * 1.3 + x) * 6, op = blink(t, x * 0.01);
  return `<g transform="translate(${x},${n(y + k)}) scale(${s})">` + BLK(-60, -212, -26, -170, P[0], 8) + BLK(26, -212, 60, -170, P[0], 8) + BLK(-70, -176, 70, -60, P[0], 14)
    + `<rect x="-38" y="${n(-140 - 13 * op)}" width="24" height="${n(26 * op)}" fill="#c8f06a" stroke="${OUT}" stroke-width="3"/><rect x="14" y="${n(-140 - 13 * op)}" width="24" height="${n(26 * op)}" fill="#c8f06a" stroke="${OUT}" stroke-width="3"/><rect x="-30" y="-148" width="8" height="18" fill="#17152e"/><rect x="22" y="-148" width="8" height="18" fill="#17152e"/><rect x="-7" y="-112" width="14" height="9" fill="#ff8fab"/>`
    + BLK(-66, -74, -16, -50, P[2], 6) + BLK(16, -74, 66, -50, P[2], 6) + `</g>`;
}
function HOUSE(x, w, h, ci, t, cat) {
  const [wall, roof] = HOUSEC[ci % 5]; const y = GROUND - 40 - h;
  let g = BLK(x, y, x + w, GROUND - 40, wall, 16);
  // stepped block roof with studs
  for (let k = 0; k < 3; k++) { const inset = k * w * 0.16; g += BLK(x - 14 + inset, y - (k + 1) * 34, x + w + 14 - inset, y - k * 34, roof, 12); }
  for (let sx = x + w * 0.4; sx <= x + w * 0.6 + 1; sx += w * 0.2) g += STUD(sx + 4, y - 104, roof, 10);
  const dw = w * 0.3; g += BLK(x + w / 2 - dw / 2, GROUND - 40 - h * 0.42, x + w / 2 + dw / 2, GROUND - 40, '#8a5a3c', 0);
  for (const wy of [y + h * 0.12, y + h * 0.36]) for (const wx of [x + w * 0.12, x + w * 0.62]) {
    g += `<rect x="${n(wx)}" y="${n(wy)}" width="${n(w * 0.26)}" height="${n(h * 0.16)}" fill="#dff4ff" stroke="${OUT}" stroke-width="3"/><line x1="${n(wx + w * 0.13)}" y1="${n(wy)}" x2="${n(wx + w * 0.13)}" y2="${n(wy + h * 0.16)}" stroke="${OUT}" stroke-width="2.5"/>`;
  }
  if (cat) g += PEEK(x + w * 0.25, 0.42, t, cat, y + h * 0.12 + h * 0.16);
  return g;
}
// studded plastic grass under the street
const _STREET = window.STREET;
window.STREET = function (t, o = {}) {
  let g = _STREET(t, o);
  for (let r = 0; r < 4; r++) for (let x = 30 + (r % 2) * 45; x < 1080; x += 90) g += STUD(x, GROUND + 80 + r * 60, '#8fd18b', 12);
  return g;
}
const _ROOM = window.ROOM;
window.ROOM = function (t, wall, floor, o = {}) {
  let g = _ROOM(t, wall, floor, o);
  // block skirting with studs
  for (let x = 40; x < 1080; x += 110) g += STUD(x, GROUND - 46, '#ffffff', 10);
  return g;
}
// chunky dust: little cubes
function DUST(x, y, t, tl, s = 1) {
  const a = t - tl; if (a < 0 || a > 0.6) return '';
  const u = a / 0.6; let g = '';
  for (const i of [-1, 1]) for (const k of [0, 1, 2]) {
    const px = x + i * (50 + k * 34 + u * 90) * s, py = y - (8 + k * 14) * s - u * 24 * s, r = (14 + k * 5) * s * (0.6 + u * 0.8);
    g += `<g opacity="${n(1 - u)}">` + BLK(px - r, py - r, px + r, py + r, '#efe6d6', r * 0.5, 2.5) + `</g>`;
  }
  return g;
}
