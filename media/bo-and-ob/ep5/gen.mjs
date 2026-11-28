// Builds scene.html: Episode 1's character library + the shared set pieces from Episode 3 + this episode's tail.js
import fs from 'node:fs';
const E1 = process.env.EP1 || '../ep1/scene.html', E3 = process.env.EP3 || '../ep3/tail.js';
let s = fs.readFileSync(E1, 'utf8');
let head = s.slice(0, s.indexOf('/* ---------------- bathroom ---------------- */'));
const rep = (a, b) => { if (!head.includes(a)) throw new Error('missing: ' + a.slice(0, 50)); head = head.replace(a, () => b); };
head = head.replace(/const BO=\[.*\n.*obTalk=.*\n/, '');
rep('walk:null,rot:0,brush:0},q);', "walk:null,rot:0,brush:0,brushL:0,back:0,hg:'hg',hc:HEAD,flip:0,bun:0,bow:0},q);");
rep('const f=o.face,fx=f*36,', 'const f=o.face,sf=o.flip?-f:f,fx=f*36,');
rep('<circle cx="${n(ex)}" cy="${n(ey)}" r="25" fill="${HEAD}"', '<circle cx="${n(ex)}" cy="${n(ey)}" r="25" fill="${o.hc}"');
rep('${arm(-1,o.aL,0)}', '${arm(-1,o.aL,o.brushL)}');
rep('<rect x="${n(-f*46-15)}" y="-262" width="30" height="78" rx="13" fill="${o.sc}" stroke="${OUT}" stroke-width="5" transform="rotate(${n(-f*8)} ${n(-f*46)} -262)"/>',
    '<rect x="${n(-sf*46-15)}" y="-262" width="30" height="78" rx="13" fill="${o.sc}" stroke="${OUT}" stroke-width="5" transform="rotate(${n(-sf*8)} ${n(-sf*46)} -262)"/>');
rep('-116)" fill="${HEAD}" stroke', '-116)" fill="${o.hc}" stroke');
rep('-112)" fill="${HEAD}" stroke', '-112)" fill="${o.hc}" stroke');
rep('<circle r="112" fill="url(#hg)" stroke="${OUT}" stroke-width="5"/>', '${o.bun?`<circle cx="0" cy="-118" r="50" fill="${o.hc}" stroke="${OUT}" stroke-width="5"/>`:\'\'}<circle r="112" fill="url(#${o.hg})" stroke="${OUT}" stroke-width="5"/>${o.bow?`<polygon points="0,-112 -52,-146 -52,-84" fill="${CORAL}" stroke="${OUT}" stroke-width="5" stroke-linejoin="round"/><polygon points="0,-112 52,-146 52,-84" fill="${CORAL}" stroke="${OUT}" stroke-width="5" stroke-linejoin="round"/><circle cx="0" cy="-112" r="13" fill="${CORAL}" stroke="${OUT}" stroke-width="5"/>`:\'\'}');
rep('${eyes}${mouth}', "${o.back?'':eyes+mouth}");
rep('<clipPath id="mc">', '<radialGradient id="hg2" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#9a4f8c"/><stop offset=".6" stop-color="#6a2d5f"/><stop offset="1" stop-color="#4a1d43"/></radialGradient><radialGradient id="hg3" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#7d5a92"/><stop offset=".6" stop-color="#5b3a6e"/><stop offset="1" stop-color="#3f2650"/></radialGradient><clipPath id="mc">');
// shared set pieces (mother, girl, cat, the bedroom) from Episode 3, without its voice lists
let lib = fs.readFileSync(E3, 'utf8');
lib = lib.slice(0, lib.indexOf('/* ---------- 1: good morning')).replace(/const boTalk=.*\n/, '');
// shared helpers and the kitchen set from Episode 4
const E4 = fs.readFileSync(process.env.EP4 || '../ep4/tail.js', 'utf8');
const lib4 = E4.slice(0, E4.indexOf('/* ---------- the eleven mirrors')).replace(/const boTalk=.*\n/, '').replace(/function cam\(K,t\)\{.*\n/, '') + E4.slice(E4.indexOf('function kitchenSet'), E4.indexOf('function kitchenDay'));
fs.writeFileSync('scene.html', head + lib + lib4 + fs.readFileSync('tail.js', 'utf8') + '\n</script></body></html>\n');
console.log('scene.html written');
