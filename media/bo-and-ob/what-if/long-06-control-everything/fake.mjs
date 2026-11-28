import fs from 'node:fs';
const ep=(await import('./episode.mjs')).default;let t=0;const V={},C={};
for(const tok of ep.seq.trim().split(/\s+/)){if(/^g/.test(tok))t+=+tok.slice(1);else if(/^c/.test(tok))C[tok.slice(1)]=t;else{const d=tok[0]==='n'?4:2;V[tok]={s:t,e:t+d,env:Array(60).fill(.5)};t+=d}}
fs.writeFileSync('data.js','window.EP='+JSON.stringify({fps:30,total:+t.toFixed(2),V,C})+';');console.log(t);
