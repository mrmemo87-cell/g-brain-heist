// In This Town — "People Jump When They Lie" (vertical 1080x1920)
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
      if (k === 'mayor') dy = 600 * a * a + 900 * a;
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
// big bold caption under the action
const CAPS = {
  n02: 'AND <tspan fill="#ffd54d">EVERYONE</tspan> JUMPS.', n03: '“I’M FINE.”', n04: '“FIVE MINUTES|AWAY.”', n05: '“I READ THE TERMS|AND CONDITIONS.”',
  n06: 'THE WHOLE STREET|BOUNCES ALL DAY.', n07: 'CEILINGS ARE TWICE AS HIGH,|DOCTORS ONLY FIX|SPRAINED ANKLES.', n08: 'MY BEST FRIEND LEO:|“I LOVE YOUR HAIRCUT.”',
  n09: 'STRAIGHT INTO|THE LAMP.', n10: 'MY TEACHER:|“THIS TEST IS EASY.”', n11: 'SHE HIT|THE CEILING.', n12: 'THE MAYOR: “I WILL|NEVER LIE TO YOU.”', n13: 'WE LOST HIM|FOR TWO DAYS.',
  n14: 'ONE MORNING…|TOTAL SILENCE.', n15: 'NOBODY WAS JUMPING.', n16: 'WE ALL AGREED|TO STOP TALKING.', n17: 'IT LASTED|14 MINUTES.', n18: 'THEN MY DAD SAID:|“I LIKE YOUR COOKING”…',
  n19: '…AND THE BOUNCING|STARTED AGAIN.', n20: 'FOLLOW FOR MORE|OF THIS TOWN.',
};
function CAPTION(t) {
  let id = null;
  for (const k of Object.keys(CAPS)) { const q = V[k]; const next = Object.values(V).filter((v) => v.s > q.s).sort((a, b) => a.s - b.s)[0]; const end = next ? Math.min(next.s, q.e + 1.0) : q.e + 3; if (t >= q.s - 0.05 && t < end) id = k; }
  if (!id) return '';
  const lines = CAPS[id].split('|'), size = lines.some((l) => l.replace(/<[^>]+>/g, '').length > 22) ? 66 : 82, k = pop(t, V[id].s - 0.05, 0.18);
  const y0 = 1640 - (lines.length - 1) * size * 0.55;
  let g = `<g transform="translate(540,${n(y0)}) scale(${n(k)})">`;
  lines.forEach((l, i) => { g += T(0, i * size * 1.12, l, size, '#ffffff', { sw: size * 0.2 }); });
  return g + `</g>`;
}

// ---------- scenes ----------
const mid7 = s_('n07') + 0.45 * (e_('n07') - s_('n07'));
const CUTS = [
  ['hook', -1], ['fine', s_('n03') - 0.05], ['five', s_('n04') - 0.05], ['terms', s_('n05') - 0.05], ['street', s_('n06') - 0.1], ['tall', s_('n07') - 0.05], ['doctor', mid7],
  ['leo', s_('n08') - 0.05], ['teach', s_('n10') - 0.05], ['mayor', s_('n12') - 0.05], ['missing', e_('n12') + 1.4], ['silent', s_('n14') - 0.05], ['clock', s_('n17') - 0.05],
  ['dad', s_('n18') - 0.05], ['street2', s_('n19') - 0.2], ['end', e_('n19') + 1.3],
];
const shotAt = (t) => { let c = CUTS[0]; for (const q of CUTS) if (t >= q[1]) c = q; return c; };
const ME = { skin: '#f6c9a0', shirt: '#ff8c69', pants: '#3d4a7a', hair: 'bowl', hairC: '#4a2f1c' };

const SC = {
  hook(t) {
    let g = STREET(t);
    g += CAT(130, GROUND + 6, 0.55, t, { c: 'orange', look: [0.6, -0.6] }) + CAT(980, GROUND + 6, 0.5, t, { c: 'grey', look: [-0.6, -0.6] });
    g += JP('hA', 250, GROUND, 0.8, { shirt: '#7bd389', hair: 'curly', hairC: '#2f2a24', skin: '#c98d62' }, t);
    g += JP('hB', 830, GROUND, 0.78, { shirt: '#c9b8ff', dress: 1, hair: 'long', hairC: '#e0a33a' }, t);
    g += JP('hC', 680, GROUND + 60, 0.62, { shirt: '#ffd166', hair: 'spiky', hairC: '#3a2a1a', skin: '#e8b48a' }, t);
    g += JP('hero', 520, GROUND + 70, 1.05, { shirt: '#ff6f91', hair: 'short', hairC: '#4a2f1c' }, t);
    return g;
  },
  fine(t) {
    let g = ROOM(t, '#ffe9c7', '#d8a36f');
    g += `<rect x="90" y="560" width="300" height="240" rx="16" fill="#dff4ff" stroke="${OUT}" stroke-width="${LW}"/><line x1="240" y1="560" x2="240" y2="800" stroke="${OUT}" stroke-width="3"/>` + PEEK(240, 0.6, t, 'black', 800);
    g += `<rect x="640" y="1080" width="340" height="40" rx="8" fill="#b77b4e" stroke="${OUT}" stroke-width="${LW}"/><rect x="660" y="1120" width="18" height="180" fill="#b77b4e" stroke="${OUT}" stroke-width="3"/><rect x="940" y="1120" width="18" height="180" fill="#b77b4e" stroke="${OUT}" stroke-width="3"/>`;
    g += `<rect x="700" y="1020" width="56" height="60" rx="10" fill="#fff" stroke="${OUT}" stroke-width="3"/><path d="M 714 1000 q 8 -16 0 -30 M 736 1000 q 8 -16 0 -30" stroke="${OUT}" stroke-width="2.5" fill="none" opacity=".5"/>`;
    g += CAT(880, 1080, 0.5, t, { c: 'grey', look: [-0.8, -0.4] });
    const j = jumpState('fine', t);
    g += JP('fine', 430, GROUND + 60, 1.25, { shirt: '#7fb8ff', hair: 'long', hairC: '#6b3d22', mouth: t < e_('n03') ? 'smile' : 'grin', brow: 1, sweat: 1, look: [0.6, 0] }, t);
    if (t > s_('n03') + 0.1 && t < J.find((q) => q.k === 'fine').t0 + 0.1) g += BUB(430, 560, 'I’m fine.', t, s_('n03') + 0.1, -60, 76);
    return g;
  },
  five(t) {
    let g = ROOM(t, '#d9e8ff', '#c7a07a');
    g += `<rect x="560" y="1050" width="480" height="140" rx="20" fill="#fff" stroke="${OUT}" stroke-width="${LW}"/><rect x="540" y="980" width="40" height="320" rx="10" fill="#9b6a45" stroke="${OUT}" stroke-width="3"/><rect x="560" y="1130" width="480" height="170" rx="10" fill="#ffb5a7" stroke="${OUT}" stroke-width="${LW}"/><rect x="900" y="1010" width="120" height="60" rx="24" fill="#fff" stroke="${OUT}" stroke-width="3"/>`;
    g += CAT(760, 1060, 0.5, t, { sleep: 1, c: 'orange' });
    // wall clock: 9:58, pyjama morning
    g += `<circle cx="820" cy="640" r="90" fill="#fff" stroke="${OUT}" stroke-width="${LW}"/><line x1="820" y1="640" x2="820" y2="575" stroke="${OUT}" stroke-width="5" stroke-linecap="round"/><line x1="820" y1="640" x2="${n(820 - 50 * Math.sin(0.3))}" y2="${n(640 - 50 * Math.cos(0.3))}" stroke="${OUT}" stroke-width="7" stroke-linecap="round"/>`;
    g += JP('five', 330, GROUND + 60, 1.25, { shirt: '#9ad0ff', stripes: '#fff', pants: '#9ad0ff', nightcap: 1, hair: 'short', hairC: '#3a2a1a', skin: '#e8b48a', mouth: 'smile', look: [0.3, 0], ph: 1 }, t);
    // phone floating beside his head (no hand pose)
    const j = jumpState('five', t);
    g += `<g transform="translate(470,${n(GROUND + 60 - 1.25 * 330 - j.dy * 1.25)}) rotate(12)"><rect x="-24" y="-44" width="48" height="88" rx="10" fill="#2b2540"/><rect x="-18" y="-36" width="36" height="66" rx="5" fill="#7fe3c4"/></g>`;
    if (t < J.find((q) => q.k === 'five').t0 + 0.1) g += BUB(420, 560, 'Five minutes|away!', t, s_('n04') + 0.05, -40, 70);
    return g;
  },
  terms(t) {
    const j = jumpState('terms', t), cam = cl(j.dy / 2300) * 0;
    let g = ROOM(t, '#e8ffe0', '#b9c2d6');
    g += `<rect x="600" y="1050" width="420" height="34" rx="8" fill="#b77b4e" stroke="${OUT}" stroke-width="${LW}"/><rect x="620" y="1084" width="20" height="216" fill="#b77b4e" stroke="${OUT}" stroke-width="3"/><rect x="980" y="1084" width="20" height="216" fill="#b77b4e" stroke="${OUT}" stroke-width="3"/>`;
    g += `<path d="M 700 1050 L 720 900 L 950 900 L 930 1050 Z" fill="#cfd6e6" stroke="${OUT}" stroke-width="${LW}"/><rect x="734" y="914" width="182" height="120" fill="#fff" stroke="${OUT}" stroke-width="2"/>`;
    g += T(825, 940, 'TERMS', 22, OUT, { flat: 1 }); for (let k = 0; k < 5; k++) g += `<line x1="748" y1="${952 + k * 12}" x2="902" y2="${952 + k * 12}" stroke="#aab" stroke-width="3"/>`;
    g += `<rect x="780" y="1006" width="90" height="22" rx="6" fill="#4cc38a"/>` + T(825, 1023, 'I AGREE', 16, '#fff', { flat: 1 });
    g += CAT(960, 1050, 0.45, t, { c: 'white', look: [0, j.dy > 200 ? -1 : -0.3] }) + CAT(140, GROUND + 6, 0.55, t, { c: 'calico', look: [0.4, j.dy > 200 ? -1 : 0] });
    g += JP('terms', 420, GROUND + 60, 1.2, { shirt: '#ffd166', hair: 'spiky', hairC: '#2b2b2b', mouth: 'smile', look: [0.5, 0], glasses: 1 }, t);
    if (t < J.find((q) => q.k === 'terms').t0 + 0.3) g += BUB(470, 560, 'I read the terms|and conditions.', t, s_('n05') + 0.05, -60, 64);
    if (j.dy > 1100) { const w = cl((j.dy - 1100) / 300); g += `<g opacity="${n(w)}">` + [300, 420, 540].map((x) => `<line x1="${x}" y1="420" x2="${x}" y2="620" stroke="${OUT}" stroke-width="4" stroke-linecap="round"/>`).join('') + `</g>`; }
    return g;
  },
  street(t, pre = 'b') {
    let g = STREET(t);
    const P = [[110, 0.62, { shirt: '#7bd389', hair: 'curly', hairC: '#2f2a24', skin: '#c98d62' }], [330, 0.66, { shirt: '#ff6f91', hair: 'short' }], [560, 0.6, { shirt: '#c9b8ff', dress: 1, hair: 'long', hairC: '#e0a33a' }], [770, 0.64, { shirt: '#ffd166', hair: 'spiky', skin: '#e8b48a' }], [970, 0.6, { shirt: '#7fb8ff', hair: 'bun', hairC: '#7a4a2a', dress: 1, glasses: 1 }]];
    P.forEach(([x, s, o], i) => { g += JP(pre + i, x, GROUND + (i % 2) * 40, s, Object.assign({ mouth: 'grin', keepFace: 0, airMouth: 'grin' }, o), t); });
    // the mailbox and kitties stay put
    g += CAT(220, GROUND + 120, 0.5, t, { c: 'orange', look: [0.3, -0.8] }) + CAT(660, GROUND + 130, 0.45, t, { c: 'black', look: [-0.3, -0.8] }) + CAT(890, GROUND + 120, 0.5, t, { c: 'grey', look: [0, -0.8], lick: 1 });
    return g;
  },
  street2(t) { return SC.street(t, 'rb'); },
  tall(t) {
    // cross-section of a house: door, a very tall ceiling and someone bouncing inside
    let g = SKY(t);
    g += `<rect x="140" y="260" width="800" height="${GROUND - 260}" fill="#fff3d6" stroke="${OUT}" stroke-width="${LW}"/><path d="M 110 260 L 540 90 L 970 260 Z" fill="#e85d5d" stroke="${OUT}" stroke-width="${LW}" stroke-linejoin="round"/>`;
    g += `<rect x="0" y="${GROUND - 40}" width="1080" height="1920" fill="#8fd18b"/><line x1="0" y1="${GROUND - 40}" x2="1080" y2="${GROUND - 40}" stroke="${OUT}" stroke-width="3"/>`;
    g += `<rect x="140" y="${GROUND - 60}" width="800" height="20" fill="#c7a07a" stroke="${OUT}" stroke-width="3"/>`;
    // tall ruler: 2x
    g += `<line x1="880" y1="300" x2="880" y2="${GROUND - 70}" stroke="#3b82c4" stroke-width="5"/><path d="M 864 320 L 880 296 L 896 320 M 864 ${GROUND - 90} L 880 ${GROUND - 66} L 896 ${GROUND - 90}" stroke="#3b82c4" stroke-width="5" fill="none" stroke-linecap="round"/>`;
    g += `<g transform="translate(880,${(300 + GROUND) / 2})">` + `<circle r="66" fill="#fff" stroke="${OUT}" stroke-width="${LW}"/>` + T(0, 26, '2×', 74, '#3b82c4', { flat: 1 }) + `</g>`;
    g += `<rect x="190" y="${GROUND - 60 - 380}" width="130" height="380" rx="8" fill="#8a5a3c" stroke="${OUT}" stroke-width="${LW}"/>`;
    g += `<line x1="540" y1="260" x2="540" y2="380" stroke="${OUT}" stroke-width="3"/><path d="M 500 380 L 580 380 L 560 330 L 520 330 Z" fill="#ffd166" stroke="${OUT}" stroke-width="3"/>`;
    g += JP('b2', 540, GROUND - 60, 0.9, { shirt: '#7fb8ff', hair: 'bun', hairC: '#7a4a2a', dress: 1, mouth: 'grin', airMouth: 'grin' }, t);
    g += CAT(750, GROUND - 56, 0.5, t, { c: 'orange', look: [-0.8, -0.6] });
    return g;
  },
  doctor(t) {
    let g = ROOM(t, '#e3f6f5', '#c9d3e6');
    g += `<rect x="140" y="420" width="800" height="150" rx="18" fill="#fff" stroke="${OUT}" stroke-width="${LW}"/>` + T(540, 482, 'DOCTOR', 50, '#e94b5f', { flat: 1 }) + T(540, 545, 'SPRAINED ANKLES ONLY', 46, OUT, { flat: 1 });
    g += `<g transform="translate(540,640)"><rect x="-26" y="-70" width="52" height="140" fill="#e94b5f"/><rect x="-70" y="-26" width="140" height="52" fill="#e94b5f"/></g>`;
    g += PERSON(250, GROUND + 40, 1.05, { coat: 1, shirt: '#9ad0ff', hair: 'short', hairC: '#8a8a8a', glasses: 1, mouth: 'smile', look: [0.7, 0] }, t);
    // queue of ankle patients, each with a bandage (and a kitty with a tiny one)
    g += PERSON(560, GROUND + 50, 0.82, { shirt: '#ff6f91', hair: 'curly', hairC: '#2f2a24', skin: '#c98d62', bandage: 1, mouth: 'worry', look: [-0.6, 0] }, t);
    g += PERSON(800, GROUND + 50, 0.82, { shirt: '#ffd166', hair: 'long', hairC: '#e0a33a', dress: 1, bandage: 1, mouth: 'worry', look: [-0.6, 0], ph: 1 }, t);
    g += CAT(960, GROUND + 60, 0.5, t, { c: 'grey', look: [-0.8, 0] }) + `<rect x="${960 + 8}" y="${GROUND + 44}" width="26" height="16" rx="5" fill="#fff" stroke="${OUT}" stroke-width="2.5"/>`;
    return g;
  },
  leo(t) {
    const jl = J.find((q) => q.k === 'leo'), hit = t > jl.t0 + 0.45;
    let g = ROOM(t, '#fde2ff', '#c7a07a');
    const sw = hit ? Math.sin((t - jl.t0 - 0.45) * 7) * 18 * Math.exp(-(t - jl.t0 - 0.45) * 0.8) : 0;
    g += `<line x1="700" y1="0" x2="700" y2="540" stroke="${OUT}" stroke-width="3"/>`;
    if (!hit) g += `<path d="M 650 620 L 750 620 L 730 520 L 670 520 Z" fill="#ffd166" stroke="${OUT}" stroke-width="${LW}" stroke-linejoin="round"/>`;
    else g += `<g transform="rotate(${n(sw)},700,0)"><circle cx="700" cy="556" r="16" fill="#fff6a8" stroke="${OUT}" stroke-width="3"/></g>`;
    g += `<rect x="60" y="1060" width="250" height="240" rx="20" fill="#7a62d6" stroke="${OUT}" stroke-width="${LW}"/>` + CAT(180, 1070, 0.5, t, { c: 'calico', look: [0.8, hit ? -0.2 : -0.8] });
    g += PERSON(330, GROUND + 70, 1.15, Object.assign({}, ME, { mouth: hit ? 'grin' : 'smile', look: [0.8, t > jl.t0 && !hit ? -1 : 0] }), t);
    // Leo: jump capped by the lamp, ends wearing the shade
    const lj = jumpState("leo", t, 330);
    g += PERSON(720, GROUND + 70, 1.1, { j: lj, shirt: '#7bd389', hair: 'short', hairC: '#c46a2a', skin: '#e8b48a', mouth: lj.air ? 'o' : (hit ? 'grin' : 'smile'), wide: lj.air, look: [-0.7, 0], lampshade: hit, stars: hit && t < jl.t0 + 3 }, t) + DUST(720, GROUND + 70, t, lj.land, 1.1);
    if (t < jl.t0 + 0.2) g += BUB(380, 560, 'I love your|haircut!', t, s_('n08') + 0.6, 250, 70);
    return g;
  },
  teach(t) {
    const CEIL = 300, jt = J.find((q) => q.k === 'teach'), bonk = t > jt.t0 + 0.2;
    let g = ROOM(t, '#fff1c9', '#d8a36f', { ceil: CEIL });
    g += `<rect x="90" y="520" width="900" height="380" rx="12" fill="#2f5d50" stroke="#8a5a3c" stroke-width="14"/>` + T(540, 640, 'TEST', 90, '#fff', { flat: 1 }) + T(540, 760, '∫ e^x² dx = ?', 64, '#fff', { flat: 1 });
    if (bonk) { const a = cl((t - jt.t0 - 0.2) / 0.8); g += [-1, 1].map((i) => `<path d="M ${n(540 + i * 40)} ${CEIL} l ${i * 30} 40 l ${i * 30} -20 l ${i * 26} 50" stroke="${OUT}" stroke-width="3" fill="none"/>`).join(''); for (let k = 0; k < 8; k++) g += `<circle cx="${n(540 + (k - 3.5) * 50)}" cy="${n(CEIL + 20 + a * 300 * (0.5 + (k % 3) * 0.3))}" r="8" fill="#fff" stroke="${OUT}" stroke-width="2" opacity="${n(1 - a)}"/>`; }
    // students (backs/sides) and a cat on a desk
    for (const [x, c] of [[180, '#ff8c69'], [900, '#7fb8ff']]) g += `<rect x="${x - 110}" y="1240" width="220" height="30" rx="6" fill="#b77b4e" stroke="${OUT}" stroke-width="3"/>` + PERSON(x, GROUND + 260, 0.8, { shirt: c, hair: x < 500 ? 'bowl' : 'curly', hairC: '#3a2a1a', mouth: 'worry', sweat: 1, look: [x < 500 ? 0.7 : -0.7, -0.5] }, t);
    g += CAT(320, 1246, 0.42, t, { c: 'black', look: [0.6, -1] });
    const jj = jumpState('teach', t, (GROUND + 40 - CEIL - 412));
    g += PERSON(540, GROUND + 40, 1.0, { j: jj, shirt: '#e94b5f', dress: 1, hair: 'bun', hairC: '#5a3a22', glasses: 1, mouth: jj.air ? 'o' : 'smile', wide: jj.air, stars: t > jt.t0 + jt.dur && t < jt.t0 + jt.dur + 2.5 }, t) + DUST(540, GROUND + 40, t, jj.land, 1);
    if (t < jt.t0 + 0.1) g += BUB(540, 420, 'This test is easy!', t, s_('n10') + 0.4, 0, 62);
    return g;
  },
  mayor(t) {
    const jm = J.find((q) => q.k === 'mayor');
    let g = SKY(t);
    g += `<rect x="0" y="${GROUND - 40}" width="1080" height="1920" fill="#8fd18b"/><line x1="0" y1="${GROUND - 40}" x2="1080" y2="${GROUND - 40}" stroke="${OUT}" stroke-width="3"/>`;
    g += `<path d="M 0 520 Q 270 600 540 520 Q 810 600 1080 520" stroke="${OUT}" stroke-width="3" fill="none"/>` + Array.from({ length: 9 }, (_, i) => { const x = 60 + i * 120; return `<path d="M ${x - 30} ${535 + Math.sin(i) * 6} L ${x + 30} ${535 + Math.sin(i) * 6} L ${x} ${590} Z" fill="${['#e94b5f', '#ffd166', '#3b82c4'][i % 3]}" stroke="${OUT}" stroke-width="2.5"/>`; }).join('');
    const mj = jumpState('mayor', t);
    g += PERSON(540, GROUND - 40, 1.05, { j: mj, shirt: '#3b4a7a', tie: '#e94b5f', sash: 1, hair: 'bald', hairC: '#888', tophat: 1, mouth: mj.air ? 'o' : 'smile', wide: mj.air }, t);
    g += `<path d="M 380 ${GROUND - 40} L 400 ${GROUND - 290} L 680 ${GROUND - 290} L 700 ${GROUND - 40} Z" fill="#8a5a3c" stroke="${OUT}" stroke-width="${LW}"/>` + T(540, GROUND - 180, 'MAYOR', 56, '#ffd166', { flat: 1 });
    if (mj.dy > 50) for (let k = 0; k < 4; k++) g += `<line x1="${470 + k * 45}" y1="${n(GROUND - 400 - mj.dy * 1.05 + 400)}" x2="${470 + k * 45}" y2="${n(GROUND - 300 - mj.dy * 0.5)}" stroke="${OUT}" stroke-width="3" opacity=".5" stroke-linecap="round"/>`;
    // crowd: backs of heads + kitties
    for (const [x, c] of [[110, '#5a3a22'], [300, '#e0a33a'], [780, '#2f2a24'], [980, '#7a4a2a']]) g += `<circle cx="${x}" cy="${GROUND + 120}" r="70" fill="${c}" stroke="${OUT}" stroke-width="${LW}"/><rect x="${x - 70}" y="${GROUND + 170}" width="140" height="200" rx="50" fill="#9ad0ff" stroke="${OUT}" stroke-width="${LW}"/>`;
    g += CAT(540, GROUND + 230, 0.6, t, { c: 'orange', look: [0, mj.dy > 50 ? -1 : -0.5] }) + CAT(200, GROUND + 330, 0.45, t, { c: 'white', look: [0.5, -1] }) + CAT(880, GROUND + 330, 0.45, t, { c: 'black', look: [-0.5, -1] });
    if (t < jm.t0 + 0.15) g += BUB(540, 420, 'I will never|lie to you.', t, s_('n12') + 0.5, 0, 70);
    return g;
  },
  missing(t) {
    let g = STREET(t, { noWinCats: 0 });
    g += `<rect x="520" y="560" width="26" height="${GROUND - 560}" fill="#7a7a8c" stroke="${OUT}" stroke-width="3"/>`;
    const k = pop(t, e_('n12') + 1.45);
    g += `<g transform="translate(533,760) scale(${n(k)}) rotate(-3)"><rect x="-230" y="-300" width="460" height="560" fill="#fffdf2" stroke="${OUT}" stroke-width="${LW}"/>` + T(0, -220, 'MISSING', 84, '#e94b5f', { flat: 1 });
    g += `<g transform="translate(0,90) scale(.55)">` + PERSON(0, 0, 1, { shirt: '#3b4a7a', tie: '#e94b5f', sash: 1, hair: 'bald', hairC: '#888', tophat: 1, mouth: 'smile' }, 0) + `</g>`;
    g += T(0, 160, 'THE MAYOR', 52, OUT, { flat: 1 }) + T(0, 225, 'Last seen: going UP', 36, OUT, { flat: 1 }) + `</g>`;
    g += CAT(180, GROUND + 100, 0.6, t, { c: 'grey', look: [0.3, -1] }) + CAT(880, GROUND + 100, 0.6, t, { c: 'orange', look: [-0.3, -1] });
    // a tiny mayor-dot high in the sky
    g += `<circle cx="${n(760 + Math.sin(t * 2) * 10)}" cy="120" r="7" fill="${OUT}"/>`;
    return g;
  },
  silent(t) {
    let g = STREET(t);
    // quiet "shh" hush marks in the air
    const P = [[150, 0.62, { shirt: '#7bd389', hair: 'curly', hairC: '#2f2a24', skin: '#c98d62' }], [400, 0.66, { shirt: '#ff6f91', hair: 'short' }], [660, 0.6, { shirt: '#c9b8ff', dress: 1, hair: 'long', hairC: '#e0a33a' }], [920, 0.64, { shirt: '#ffd166', hair: 'spiky', skin: '#e8b48a' }]];
    P.forEach(([x, s, o], i) => { g += PERSON(x, GROUND + (i % 2) * 40, s, Object.assign({ mouth: 'zip', look: [Math.sin(t * 0.8 + i) * 0.8, 0], ph: i }, o), t); });
    g += CAT(280, GROUND + 140, 0.5, t, { c: 'orange', look: [0.5, -0.3] }) + CAT(800, GROUND + 140, 0.5, t, { c: 'black', sleep: 1 });
    g += `<rect x="0" y="0" width="1080" height="1920" fill="#2b2540" opacity=".08"/>`;
    return g;
  },
  clock(t) {
    let g = SC.silent(t);
    const u = seg(t, s_('n17'), e_('n17') - 0.2), m = Math.floor(u * 14);
    g += `<g transform="translate(540,620) scale(${n(pop(t, s_('n17')))})"><circle r="230" fill="#fff" stroke="${OUT}" stroke-width="5"/><circle r="200" fill="none" stroke="#e94b5f" stroke-width="16" stroke-dasharray="${n(u * 1257)} 2000" transform="rotate(-90)"/>` + T(0, 40, `${String(m).padStart(2, '0')}:00`, 120, OUT, { flat: 1 }) + T(0, 120, 'MINUTES', 40, '#e94b5f', { flat: 1 }) + `<rect x="-30" y="-290" width="60" height="50" rx="10" fill="${OUT}"/></g>`;
    return g;
  },
  dad(t) {
    const jd = J.find((q) => q.k === 'dad');
    let g = ROOM(t, '#ffe1d1', '#b9c2d6');
    g += `<rect x="0" y="900" width="1080" height="30" fill="#fff" stroke="${OUT}" stroke-width="3"/><rect x="0" y="930" width="1080" height="120" fill="#7a62d6" stroke="${OUT}" stroke-width="${LW}"/>`;
    g += `<rect x="560" y="1110" width="460" height="30" rx="8" fill="#b77b4e" stroke="${OUT}" stroke-width="${LW}"/><rect x="580" y="1140" width="18" height="160" fill="#b77b4e" stroke="${OUT}" stroke-width="3"/><rect x="980" y="1140" width="18" height="160" fill="#b77b4e" stroke="${OUT}" stroke-width="3"/>`;
    // the very burnt pancake
    g += `<ellipse cx="790" cy="1104" rx="96" ry="22" fill="#fff" stroke="${OUT}" stroke-width="3"/><ellipse cx="790" cy="1094" rx="64" ry="16" fill="#2a2222" stroke="${OUT}" stroke-width="3"/>`;
    for (let k = 0; k < 3; k++) { const a = (t * 0.6 + k / 3) % 1; g += `<circle cx="${n(770 + k * 20 + Math.sin(a * 6) * 14)}" cy="${n(1070 - a * 220)}" r="${n(16 + a * 26)}" fill="#8a8a9a" opacity="${n(0.55 * (1 - a))}"/>`; }
    g += CAT(950, 1104, 0.45, t, { c: 'orange', look: [-0.8, 0.3] }) + PEEK(120, 0.5, t, 'grey', 930);
    g += PERSON(260, GROUND + 70, 1.0, Object.assign({}, ME, { chef: 1, apron: 1, mouth: 'grin', look: [0.8, 0] }), t);
    g += JP('dad', 650, GROUND + 70, 1.15, { shirt: '#4aa3df', hair: 'short', hairC: '#3a2a1a', skin: '#e8b48a', mouth: 'smile', brow: 1, look: [-0.6, 0] }, t);
    if (t < jd.t0 + 0.15) g += BUB(600, 560, 'I like your|cooking…', t, s_('n18') + 0.9, 60, 70);
    return g;
  },
  end(t) {
    let g = STREET(t);
    g += `<rect width="1080" height="1920" fill="#fff8e7" opacity=".55"/>`;
    g += JP('end', 540, GROUND + 40, 0.9, { shirt: '#ff6f91', hair: 'short', mouth: 'grin', airMouth: 'grin' }, t);
    g += CAT(230, GROUND + 40, 0.65, t, { c: 'orange', look: [0.6, -0.6] }) + CAT(850, GROUND + 40, 0.65, t, { c: 'grey', look: [-0.6, -0.6] }) + CAT(380, GROUND + 160, 0.45, t, { c: 'black', look: [0.3, -0.9] }) + CAT(700, GROUND + 160, 0.45, t, { c: 'calico', look: [-0.3, -0.9] });
    return g;
  },
};

const OV = {
  hook(t) {
    let g = '';
    // title, on screen from frame 0
    const k = 1 + Math.sin(t * 3) * 0.015;
    g += `<g transform="translate(540,330) scale(${n(k)})"><rect x="-500" y="-210" width="1000" height="350" rx="44" fill="#fff8e7" stroke="${OUT}" stroke-width="4"/>`;
    g += T(0, -120, 'IN THIS TOWN,', 84, '#2b2540', { flat: 1 }) + T(0, -15, 'PEOPLE JUMP', 116, '#ff5f8f', { sw: 8, sc: OUT }) + T(0, 100, 'WHEN THEY LIE', 96, '#3b82c4', { sw: 7, sc: OUT }) + `</g>`;
    return g;
  },
  end(t) {
    let g = '';
    const k = pop(t, e_('n19') + 1.3);
    g += `<g transform="translate(540,420) scale(${n(k)})"><rect x="-480" y="-250" width="960" height="460" rx="44" fill="#fff" stroke="${OUT}" stroke-width="4"/>`;
    g += T(0, -150, 'What lie would', 80, OUT, { flat: 1 }) + T(0, -50, 'make YOU jump', 86, '#ff5f8f', { sw: 7 }) + T(0, 50, 'the highest?', 80, OUT, { flat: 1 });
    g += `<text x="0" y="170" font-size="96" text-anchor="middle" font-family="Noto Color Emoji">👇</text></g>`;
    return g;
  },
};
const CAM = { hook: [1.2, 540, 1010], fine: [1.4, 540, 1000], five: [1.4, 560, 1000], terms: [1.4, 540, 1000], street: [1.25, 540, 1080], street2: [1.25, 540, 1080], tall: [1.08, 540, 940], doctor: [1.3, 540, 1000], leo: [1.35, 540, 1000], teach: [1.3, 540, 1000], mayor: [1.22, 540, 1050], missing: [1.12, 540, 1000], silent: [1.25, 540, 1080], clock: [1.25, 540, 1080], dad: [1.35, 540, 1000], end: [1.15, 540, 1080] };
function renderAt(t) {
  const [name, t0] = shotAt(t);
  // gentle push-in per shot + shake on big landings
  const u = t - t0, z = 1 + Math.min(u, 6) * 0.006;
  let sx = 0, sy = 0;
  for (const j of J) if (j.sfx && j.dur < 50) { const a = t - (j.t0 + j.dur); if (a > 0 && a < 0.3) { const m = (j.H > 1000 ? 22 : 9) * (1 - a / 0.3); sx += Math.sin(a * 90) * m; sy += Math.cos(a * 70) * m; } }
  const [cz, cx, cy] = CAM[name] || [1, 540, 960];
  let g = `<g transform="translate(${n(540 + sx)},${n(960 + sy)}) scale(${(z * cz).toFixed(4)}) translate(${-cx},${-cy})">` + SC[name](t) + `</g>`;
  if (OV[name]) g += OV[name](t);
  // whip-flash on cuts
  const f = 1 - seg(u, 0, 0.12);
  if (f > 0 && t0 > 0) g += `<rect width="1080" height="1920" fill="#fff" opacity="${n(f * 0.6)}"/>`;
  g += CAPTION(t);
  document.getElementById('s').innerHTML = g;
}
window.renderAt = renderAt;
window.DATA = { fps: D.fps, total: D.total };
window.ready = document.fonts.ready;
