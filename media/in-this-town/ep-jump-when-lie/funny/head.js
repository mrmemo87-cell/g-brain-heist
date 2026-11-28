// In This Town — "People Jump When People Lie" funny cut (vertical 1080x1920). Helpers copied from ../scene.js; blocky.js restyles them.
const D = window.EP, V = D.V, PI = Math.PI;
const cl = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const lerp = (a, b, u) => a + (b - a) * u;
const ease = (u) => { u = cl(u); return u * u * (3 - 2 * u); };
const seg = (t, a, b) => cl((t - a) / (b - a));
const es = (t, a, b) => ease(seg(t, a, b));
const n = (v) => (+v).toFixed(1);
const blink = (t, ph) => ((t + ph) % 3.7) < 0.12 ? 0.1 : 1;
const OUT = '#2b2540', LW = 3.5;
const s_ = (id) => V[id].s, e_ = (id) => V[id].e;
const { J } = TIMING(V);
function T(x, y, txt, size, col, o = {}) {
  return `<text x="${n(x)}" y="${n(y)}" font-size="${size}" fill="${col}" text-anchor="${o.anchor || 'middle'}" opacity="${o.op ?? 1}" ${o.flat ? '' : `stroke="${o.sc || OUT}" stroke-width="${o.sw ?? size * 0.16}" paint-order="stroke" stroke-linejoin="round"`}>${txt}</text>`;
}
const pop = (t, a, d = 0.22) => { const u = seg(t, a, a + d); return u <= 0 ? 0 : u >= 1 ? 1 : 1 + Math.sin(u * PI) * 0.18 * (1 - u) + (ease(u) - 1) * 1; };

// ---------- jump physics: squash, stretch, airtime, dust ----------
function jumpState(k, t, ceil) {
  let st = { dy: 0, sx: 1, sy: 1, air: 0, land: -9, flat: 0 };
  const js = J.filter((j) => j.k === k);
  for (const j of js) {
    const a = t - j.t0;
    if (a < -0.14 || a > j.dur + 0.3) { if (a > j.dur + 0.3) st.land = j.t0 + j.dur; continue; }
    if (a < 0) { const u = (a + 0.14) / 0.14; const q = Math.sin(u * PI / 2); st.sy = 1 - 0.2 * q; st.sx = 1 + 0.14 * q; }
    else if (a < j.dur) {
      const p = a / j.dur; let dy = 4 * j.H * p * (1 - p);
      if (j.dur > 50) dy = 700 * a * a + 1500 * a;
      const str = Math.abs(1 - 2 * p); st.sy = 1 + 0.24 * str; st.sx = 1 / Math.sqrt(st.sy); st.air = 1;
      if (ceil && dy > ceil) { dy = ceil; st.flat = 1; st.sy = 0.78; st.sx = 1.2; }
      st.dy = dy;
    } else { const q = Math.sin(((a - j.dur) / 0.3) * PI); st.sy = 1 - 0.26 * q; st.sx = 1 + 0.2 * q; st.land = j.t0 + j.dur; }
  }
  return st;
}
function DUST(x, y, t, tl, s = 1) {
  const a = t - tl; if (a < 0 || a > 0.6) return '';
  const u = a / 0.6; let g = '';
  for (const i of [-1, 1]) for (const k of [0, 1, 2]) {
    const px = x + i * (50 + k * 34 + u * 90) * s, py = y - (8 + k * 14) * s - u * 24 * s, r = (16 + k * 6) * s * (0.6 + u * 0.8);
    g += `<circle cx="${n(px)}" cy="${n(py)}" r="${n(r)}" fill="#efe6d6" stroke="${OUT}" stroke-width="2.5" opacity="${n(1 - u)}"/>`;
  }
  return g;
}
const SHADOW = (x, y, s, dy) => `<ellipse cx="${n(x)}" cy="${n(y + 4)}" rx="${n(70 * s / (1 + dy / 500))}" ry="${n(14 * s / (1 + dy / 500))}" fill="#000" opacity="${n(0.16 / (1 + dy / 400))}"/>`;

// ---------- people ----------
function HAIR(o, back) {
  const c = o.hairC || '#5a3a22', h = o.hair || 'short';
  if (back) {
    if (h === 'long') return `<path d="M -68 -310 Q -80 -250 -70 -238 L 70 -238 Q 80 -250 68 -310 Z" fill="${c}" stroke="${OUT}" stroke-width="${LW}"/>`;
    if (h === 'bun') return `<circle cx="0" cy="-378" r="30" fill="${c}" stroke="${OUT}" stroke-width="${LW}"/>`;
    return '';
  }
  if (h === 'short') return `<path d="M -64 -300 Q -66 -372 0 -370 Q 66 -372 64 -300 Q 50 -336 0 -338 Q -50 -336 -64 -300 Z" fill="${c}" stroke="${OUT}" stroke-width="${LW}"/>`;
  if (h === 'long' || h === 'bun') return `<path d="M -66 -296 Q -70 -372 0 -368 Q 70 -372 66 -296 Q 40 -340 -10 -332 Q -50 -330 -66 -296 Z" fill="${c}" stroke="${OUT}" stroke-width="${LW}"/>`;
  if (h === 'curly') return [-48, -24, 0, 24, 48].map((x, i) => `<circle cx="${x}" cy="${-350 + Math.abs(x) * 0.5}" r="26" fill="${c}" stroke="${OUT}" stroke-width="${LW}"/>`).join('');
  if (h === 'spiky') return `<path d="M -64 -304 L -58 -360 L -36 -342 L -24 -386 L -2 -350 L 16 -390 L 30 -348 L 54 -372 L 52 -336 L 66 -304 Q 30 -330 0 -330 Q -30 -330 -64 -304 Z" fill="${c}" stroke="${OUT}" stroke-width="${LW}" stroke-linejoin="round"/>`;
  if (h === 'bowl') return `<path d="M -70 -290 Q -74 -378 0 -376 Q 74 -378 70 -290 L 52 -306 L 38 -288 L 22 -312 L 6 -292 L -12 -318 L -26 -294 L -40 -310 L -56 -290 Z" fill="${c}" stroke="${OUT}" stroke-width="${LW}" stroke-linejoin="round"/><path d="M 56 -350 L 70 -372 M 40 -366 L 46 -390" stroke="${OUT}" stroke-width="${LW}" stroke-linecap="round"/>`;
  if (h === 'bald') return `<path d="M -64 -300 Q -70 -330 -52 -340 M 64 -300 Q 70 -330 52 -340" stroke="${c}" stroke-width="12" fill="none" stroke-linecap="round"/>`;
  return '';
}
function FACE(o, t, x) {
  const lk = o.look || [0, 0], op = blink(t, x * 0.013 + (o.ph || 0)), m = o.mouth || 'smile';
  let g = '';
  const ey = -300;
  for (const i of [-1, 1]) {
    if (o.wide) { g += `<circle cx="${i * 24}" cy="${ey}" r="13" fill="#fff" stroke="${OUT}" stroke-width="2.5"/><circle cx="${n(i * 24 + lk[0] * 4)}" cy="${n(ey + lk[1] * 4)}" r="6" fill="${OUT}"/>`; }
    else g += `<ellipse cx="${n(i * 24 + lk[0] * 5)}" cy="${n(ey + lk[1] * 5)}" rx="7" ry="${n(9 * op)}" fill="${OUT}"/><circle cx="${n(i * 24 + lk[0] * 5 + 2)}" cy="${n(ey + lk[1] * 5 - 3)}" r="2.4" fill="#fff" opacity="${op > 0.5 ? 1 : 0}"/>`;
    if (o.glasses) g += `<circle cx="${i * 24}" cy="${ey}" r="19" fill="none" stroke="${OUT}" stroke-width="3"/>`;
    g += `<ellipse cx="${i * 42}" cy="-272" rx="11" ry="7" fill="#ff8fa3" opacity=".55"/>`;
  }
  if (o.glasses) g += `<line x1="-5" y1="${ey}" x2="5" y2="${ey}" stroke="${OUT}" stroke-width="3"/>`;
  if (o.brow) for (const i of [-1, 1]) g += `<path d="M ${i * 34} ${ey - 24 - o.brow * i * 0} q ${-i * 10} ${-6 * o.brow} ${-i * 20} 0" stroke="${OUT}" stroke-width="3" fill="none" stroke-linecap="round"/>`;
  const my = -262;
  if (m === 'smile') g += `<path d="M -18 ${my} Q 0 ${my + 16} 18 ${my}" stroke="${OUT}" stroke-width="3.5" fill="none" stroke-linecap="round"/>`;
  else if (m === 'grin') g += `<path d="M -24 ${my - 4} Q 0 ${my + 26} 24 ${my - 4} Z" fill="#fff" stroke="${OUT}" stroke-width="3" stroke-linejoin="round"/>`;
  else if (m === 'o') g += `<ellipse cx="0" cy="${my + 4}" rx="11" ry="14" fill="#7a2f3b" stroke="${OUT}" stroke-width="3"/>`;
  else if (m === 'talk') { const k = Math.abs(Math.sin(t * 15 + x)); g += `<ellipse cx="0" cy="${my + 2}" rx="${n(14 - k * 2)}" ry="${n(3 + k * 9)}" fill="#7a2f3b" stroke="${OUT}" stroke-width="3"/>`; }
  else if (m === 'zip') { g += `<line x1="-22" y1="${my + 2}" x2="22" y2="${my + 2}" stroke="${OUT}" stroke-width="3.5" stroke-linecap="round"/>`; for (let k = -18; k <= 18; k += 6) g += `<line x1="${k}" y1="${my - 3}" x2="${k}" y2="${my + 7}" stroke="${OUT}" stroke-width="2"/>`; }
  else if (m === 'worry') g += `<path d="M -18 ${my + 6} q 9 -8 18 0 q 9 8 18 0" stroke="${OUT}" stroke-width="3.5" fill="none" stroke-linecap="round"/>`;
  else if (m === 'flat') g += `<line x1="-14" y1="${my + 4}" x2="14" y2="${my + 4}" stroke="${OUT}" stroke-width="3.5" stroke-linecap="round"/>`;
  if (o.sweat) g += `<path d="M 66 -340 q 10 18 0 26 q -10 -8 0 -26 Z" fill="#8fd3ff" stroke="${OUT}" stroke-width="2"/>`;
  return g;
}
function PERSON(x, y, s, o, t) {
  const j = o.j || { dy: 0, sx: 1, sy: 1, air: 0 };
  const sk = o.skin || '#f6c9a0', sh = o.shirt || '#4aa3df', pa = o.pants || '#3d4a7a';
  const fo = o.face ?? 0; // -1..1 turn
  let g = SHADOW(x, y, s, j.dy);
  g += `<g transform="translate(${n(x)},${n(y - j.dy * s)}) scale(${n(s * j.sx * (o.flip ? -1 : 1))},${n(s * j.sy)})${j.rot ? ` rotate(${n(j.rot)})` : ''}">`;
  const tuck = j.air ? 16 : 0, kick = j.air ? 10 : 0;
  // legs + shoes
  for (const i of [-1, 1]) {
    const lx = i * (22 + kick), d = `M ${i * 22} -104 L ${lx} ${-14 - tuck}`;
    g += `<path d="${d}" stroke="${OUT}" stroke-width="${30 + 2 * LW}" stroke-linecap="round"/><path d="${d}" stroke="${pa}" stroke-width="30" stroke-linecap="round"/>`;
    g += `<ellipse cx="${lx + i * 8}" cy="${-8 - tuck}" rx="24" ry="13" fill="${o.shoe || '#3b3350'}" stroke="${OUT}" stroke-width="${LW}"/>`;
  }
  if (o.bandage) g += `<rect x="-48" y="-56" width="54" height="40" rx="12" fill="#fff" stroke="${OUT}" stroke-width="3"/><path d="M -40 -44 L -4 -44 M -40 -32 L -4 -32" stroke="#e5e0f0" stroke-width="3"/>`;
  // arms
  for (const i of [-1, 1]) {
    const hx = j.air ? i * 112 : i * (o.armOut || 70), hy = j.air ? -300 : -112;
    const d = `M ${i * 54} -214 Q ${i * (j.air ? 96 : 72)} ${j.air ? -250 : -170} ${hx} ${hy}`;
    g += `<path d="${d}" stroke="${OUT}" stroke-width="${22 + 2 * LW}" fill="none" stroke-linecap="round"/><path d="${d}" stroke="${o.sleeve || sh}" stroke-width="22" fill="none" stroke-linecap="round"/>`;
    g += `<circle cx="${hx}" cy="${hy}" r="14" fill="${sk}" stroke="${OUT}" stroke-width="${LW}"/>`;
  }
  // torso
  if (o.dress) g += `<path d="M -54 -232 Q 0 -244 54 -232 L 76 -92 Q 0 -80 -76 -92 Z" fill="${sh}" stroke="${OUT}" stroke-width="${LW}" stroke-linejoin="round"/>`;
  else g += `<rect x="-60" y="-238" width="120" height="146" rx="40" fill="${sh}" stroke="${OUT}" stroke-width="${LW}"/>`;
  if (o.stripes) for (let k = -210; k < -100; k += 24) g += `<line x1="-56" y1="${k}" x2="56" y2="${k}" stroke="${o.stripes}" stroke-width="7" opacity=".8"/>`;
  if (o.coat) g += `<path d="M -60 -228 L -64 -96 L -8 -96 L 0 -200 L 8 -96 L 64 -96 L 60 -228 Q 0 -244 -60 -228 Z" fill="#fff" stroke="${OUT}" stroke-width="${LW}"/><path d="M -20 -220 q -10 50 14 70 q 24 -20 14 -70" stroke="#5a6b8a" stroke-width="4" fill="none"/><circle cx="7" cy="-150" r="8" fill="#9aa8c4" stroke="${OUT}" stroke-width="2"/>`;
  if (o.apron) g += `<path d="M -40 -200 L 40 -200 L 48 -96 L -48 -96 Z" fill="#fff4d6" stroke="${OUT}" stroke-width="3"/><rect x="-18" y="-160" width="36" height="22" rx="5" fill="none" stroke="${OUT}" stroke-width="2.5"/>`;
  if (o.sash) g += `<path d="M -52 -226 L 58 -118 L 44 -100 L -60 -206 Z" fill="#e94b5f" stroke="${OUT}" stroke-width="3"/>`;
  if (o.tie) g += `<path d="M 0 -234 L -10 -220 L 0 -150 L 10 -220 Z" fill="${o.tie}" stroke="${OUT}" stroke-width="2.5"/>`;
  // neck + head
  g += HAIR(o, 1);
  g += `<rect x="-14" y="-252" width="28" height="22" fill="${sk}" stroke="${OUT}" stroke-width="${LW}"/>`;
  g += `<g transform="translate(${n(fo * 8)},0)"><circle cx="0" cy="-300" r="64" fill="${sk}" stroke="${OUT}" stroke-width="${LW}"/>`;
  g += `<ellipse cx="-64" cy="-296" rx="10" ry="14" fill="${sk}" stroke="${OUT}" stroke-width="3"/><ellipse cx="64" cy="-296" rx="10" ry="14" fill="${sk}" stroke="${OUT}" stroke-width="3"/>`;
  g += FACE(o, t, x) + HAIR(o, 0);
  if (o.nightcap) g += `<path d="M -62 -330 Q -10 -420 70 -440 Q 40 -380 64 -330 Z" fill="#7fb8ff" stroke="${OUT}" stroke-width="${LW}" stroke-linejoin="round"/><circle cx="72" cy="-440" r="14" fill="#fff" stroke="${OUT}" stroke-width="3"/>`;
  if (o.tophat) g += `<rect x="-52" y="-372" width="104" height="14" rx="6" fill="#2b2540"/><rect x="-36" y="-452" width="72" height="84" rx="6" fill="#2b2540"/><rect x="-36" y="-388" width="72" height="12" fill="#e94b5f"/>`;
  if (o.chef) g += `<rect x="-44" y="-372" width="88" height="22" fill="#fff" stroke="${OUT}" stroke-width="3"/><path d="M -44 -372 Q -70 -420 -30 -428 Q -10 -460 20 -430 Q 66 -428 44 -372 Z" fill="#fff" stroke="${OUT}" stroke-width="3"/>`;
  if (o.lampshade) g += `<path d="M -50 -330 L 50 -330 L 30 -430 L -30 -430 Z" fill="#ffd166" stroke="${OUT}" stroke-width="${LW}" stroke-linejoin="round"/>`;
  g += `</g>`;
  if (o.stars) for (let k = 0; k < 3; k++) { const a = t * 5 + k * 2.1; g += T(Math.cos(a) * 80, -400 + Math.sin(a) * 18, '★', 40, '#ffd166', { sw: 3 }); }
  return g + `</g>`;
}
// someone tied to a jump track
function JP(k, x, y, s, o, t, ceil) {
  const j = jumpState(k, t, ceil);
  const oo = Object.assign({}, o, { j });
  if (j.air && !o.keepFace) { oo.mouth = o.airMouth || 'o'; oo.wide = 1; }
  return PERSON(x, y, s, oo, t) + DUST(x, y, t, j.land, s);
}

// ---------- backgrounds ----------
const GROUND = 1320;
function SKY(t, c1 = '#a9e2ff', c2 = '#e9f8ff') {
  let g = `<defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient></defs><rect width="1080" height="1920" fill="url(#sky)"/>`;
  g += `<circle cx="900" cy="250" r="78" fill="#ffd166" stroke="${OUT}" stroke-width="3"/>`;
  for (const [x0, y, s] of [[120, 300, 1], [640, 180, 0.8], [1000, 470, 0.7]]) { const x = ((x0 + t * 14) % 1300) - 110; g += `<g transform="translate(${n(x)},${y}) scale(${s})"><path d="M -90 20 Q -100 -20 -60 -26 Q -50 -70 0 -60 Q 40 -90 70 -40 Q 110 -36 100 20 Z" fill="#fff" stroke="${OUT}" stroke-width="3"/></g>`; }
  return g;
}
const HOUSEC = [['#ffb5a7', '#e85d5d'], ['#b8e0d2', '#4a9c8c'], ['#ffe08a', '#e0973a'], ['#c9b8ff', '#7a62d6'], ['#a8d8ff', '#3b82c4']];
function HOUSE(x, w, h, ci, t, cat) {
  const [wall, roof] = HOUSEC[ci % 5]; const y = GROUND - 40 - h;
  let g = `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${wall}" stroke="${OUT}" stroke-width="${LW}"/>`;
  g += `<path d="M ${x - 16} ${y} L ${x + w / 2} ${y - w * 0.42} L ${x + w + 16} ${y} Z" fill="${roof}" stroke="${OUT}" stroke-width="${LW}" stroke-linejoin="round"/>`;
  const dw = w * 0.3; g += `<rect x="${x + w / 2 - dw / 2}" y="${GROUND - 40 - h * 0.42}" width="${dw}" height="${h * 0.42}" rx="10" fill="#8a5a3c" stroke="${OUT}" stroke-width="${LW}"/>`;
  for (const wy of [y + h * 0.12, y + h * 0.36]) for (const wx of [x + w * 0.12, x + w * 0.62]) {
    g += `<rect x="${n(wx)}" y="${n(wy)}" width="${n(w * 0.26)}" height="${n(h * 0.16)}" rx="6" fill="#dff4ff" stroke="${OUT}" stroke-width="3"/>`;
  }
  if (cat) g += `<g clip-path="none">${PEEK(x + w * 0.25, 0.42, t, cat, y + h * 0.12 + h * 0.16)}</g>`;
  return g;
}
function STREET(t, o = {}) {
  let g = SKY(t);
  const H = [[10, 200, 560, 0, 'grey'], [230, 230, 640, 1, ''], [480, 200, 520, 2, 'black'], [700, 180, 600, 3, ''], [900, 200, 560, 4, 'orange']];
  for (const [x, w, h, c, cat] of H) g += HOUSE(x, w, h, c, t, o.noWinCats ? '' : cat);
  g += `<rect x="0" y="${GROUND - 40}" width="1080" height="70" fill="#d9d4e3" stroke="${OUT}" stroke-width="3"/>`;
  for (let x = 0; x < 1080; x += 120) g += `<line x1="${x}" y1="${GROUND - 40}" x2="${x - 20}" y2="${GROUND + 30}" stroke="${OUT}" stroke-width="2" opacity=".4"/>`;
  g += `<rect x="0" y="${GROUND + 30}" width="1080" height="1920" fill="#8fd18b"/><line x1="0" y1="${GROUND + 30}" x2="1080" y2="${GROUND + 30}" stroke="${OUT}" stroke-width="3"/>`;
  return g;
}
function ROOM(t, wall, floor, o = {}) {
  const top = o.ceil ?? -10;
  let g = `<rect width="1080" height="1920" fill="${wall}"/>`;
  if (o.ceil) g += `<rect x="0" y="0" width="1080" height="${top}" fill="#f4efe6" stroke="${OUT}" stroke-width="${LW}"/>`;
  g += `<rect x="0" y="${GROUND - 20}" width="1080" height="1920" fill="${floor}" stroke="${OUT}" stroke-width="${LW}"/>`;
  for (let x = 40; x < 1080; x += 160) g += `<line x1="${x}" y1="${GROUND - 20}" x2="${x - 60}" y2="1920" stroke="${OUT}" stroke-width="2" opacity=".25"/>`;
  g += `<rect x="0" y="${GROUND - 44}" width="1080" height="24" fill="#fff" stroke="${OUT}" stroke-width="3"/>`;
  return g;
}
function BUB(x, y, txt, t, ta, tail = 0, size = 60, w0) {
  if (t < ta) return '';
  const k = pop(t, ta), lines = txt.split('|'), w = w0 || Math.max(...lines.map((l) => l.length)) * size * 0.56 + 80, h = lines.length * size * 1.15 + 50;
  let g = `<g transform="translate(${n(x)},${n(y)}) scale(${n(k)})">`;
  g += `<path d="M ${-w / 2 + 40} ${-h / 2} H ${w / 2 - 40} Q ${w / 2} ${-h / 2} ${w / 2} ${-h / 2 + 40} V ${h / 2 - 40} Q ${w / 2} ${h / 2} ${w / 2 - 40} ${h / 2} H ${tail + 30} L ${tail} ${h / 2 + 50} L ${tail - 20} ${h / 2} H ${-w / 2 + 40} Q ${-w / 2} ${h / 2} ${-w / 2} ${h / 2 - 40} V ${-h / 2 + 40} Q ${-w / 2} ${-h / 2} ${-w / 2 + 40} ${-h / 2} Z" fill="#fff" stroke="${OUT}" stroke-width="${LW}" stroke-linejoin="round"/>`;
  lines.forEach((l, i) => { g += T(0, -h / 2 + 25 + size * 0.92 + i * size * 1.15, l, size, OUT, { flat: 1 }); });
  return g + `</g>`;
}
function CAPTION(t) {
  let id = null;
  for (const k of Object.keys(CAPS)) { const q = V[k]; const next = Object.values(V).filter((v) => v.s > q.s).sort((a, b) => a.s - b.s)[0]; const end = next ? Math.min(next.s, q.e + 1.0) : q.e + 3; if (t >= q.s - 0.05 && t < end) id = k; }
  if (!id) return '';
  const lines = CAPS[id].split('|'), size = lines.some((l) => l.replace(/<[^>]+>/g, '').length > 22) ? 66 : 82, k = pop(t, V[id].s - 0.05, 0.16) * (1 + 0.12 * Math.max(0, 1 - (t - V[id].s) / 0.25));
  const y0 = 1640 - (lines.length - 1) * size * 0.55;
  let g = `<g transform="translate(540,${n(y0)}) scale(${n(k)})">`;
  lines.forEach((l, i) => { g += T(0, i * size * 1.12, l, size, '#ffffff', { sw: size * 0.2 }); });
  return g + `</g>`;
}

