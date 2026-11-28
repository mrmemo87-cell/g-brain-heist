// Landscape explainer scene: shared library from Episode 10's scene + cine.js + tail.js
import fs from 'node:fs';
let s = fs.readFileSync('../../ep10/scene.html', 'utf8');
s = s.slice(0, s.indexOf('/* ================= Episode 10'));
fs.writeFileSync('scene.html', s + fs.readFileSync('cine.js', 'utf8') + fs.readFileSync('tail.js', 'utf8') + '\n</script></body></html>\n');
console.log('scene.html written');
