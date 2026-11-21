// Vertical Short scene: shared library from Episode 10's scene + gsh/lib.js + this Short's tail.js
import fs from 'node:fs';
const H = '../gsh/';
let s = fs.readFileSync('../ep10/scene.html', 'utf8');
s = s.slice(0, s.indexOf('/* ================= Episode 10')).replace('viewBox="0 0 1920 1080"', 'viewBox="0 0 1080 1920"').replace('width:1920px;height:1080px', 'width:1080px;height:1920px');
const narr = fs.readFileSync('narr.txt', 'utf8').split('\n').filter((l) => l.trim()).map((l) => l.split('|').slice(2).join('|'));
fs.writeFileSync('scene.html', s + `const NARR=${JSON.stringify(narr)};\n` + fs.readFileSync(H + 'lib.js', 'utf8') + fs.readFileSync('tail.js', 'utf8') + '\n</script></body></html>\n');
console.log('scene.html written');
