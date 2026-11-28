/* Short 4: What if you were the NPC? */
const STREET=1640;
function shops(){let g=`<rect width="1080" height="1920" fill="#2a2150"/>`+[0,1,2].map(i=>{const x=i*360,c=['#ff8f6b','#6bc6ff','#ffd36b'][i];return `<rect x="${x+10}" y="700" width="340" height="900" fill="#3b2f6e"/><rect x="${x+40}" y="1180" width="280" height="300" rx="10" fill="#1a1440"/><rect x="${x+40}" y="1180" width="280" height="300" rx="10" fill="${c}" opacity=".18"/><rect x="${x+30}" y="1090" width="300" height="70" rx="12" fill="${c}"/>`+TXT(x+180,1142,['COFFEE','PHONES','DELI'][i],44,'#1a1440')+[0,1,2].map(r=>[0,1].map(cc=>`<rect x="${x+70+cc*140}" y="${780+r*95}" width="80" height="60" fill="#ffd36b" opacity="${(r+cc+i)%3?.75:.2}"/>`).join('')).join('')}).join('');
  return g+`<rect x="0" y="1590" width="1080" height="330" fill="#4a4266"/><rect x="0" y="1590" width="1080" height="16" fill="#6a6290"/>`}
window.renderAt=function(t){
  let g=DEFS+SKYG('sk4','#1a1040','#5a3a8a')+`<rect width="1080" height="700" fill="url(#sk4)"/>`+shops();
  // the loop: everybody walks the same pavement, Bo among them
  [[0,.6],[1,.62],[2,.58]].forEach(([i,s])=>{const x=((t*80+i*380)%1400)-160;g+=shape({x,y:STREET+90,s,eyes:0})});
  const look=es(t,V.n05.s+1,V.n05.s+2.2),stopB=es(t,V.n05.s,V.n05.s+.6);
  const bx=lerp(((t*80+190)%1400)-160,540,stopB);
  const bo={x:bx,y:STREET+60,face:lerp(1,.3,stopB),aL:8,aR:8,smile:-.1,brow:lerp(.1,.8,look),open:blink(t,.4),look:[lerp(.9,.1,stopB),lerp(0,-.95,look)]};
  if(stopB<1){bo.walk=t*6;bo.bob=-Math.abs(Math.sin(t*6))*5}
  g+=char(bo);
  // three words
  const W3=['SORRY.','EXCUSE ME.','THANKS.'],ws=V.n02.s,wd=(V.n02.e-ws)/3;
  const bbx=cl(bx,170,910);W3.forEach((w,i)=>{const a=pulse(t,ws+i*wd,ws+(i+1)*wd+.1,.1);if(a>0)g+=`<g opacity="${n(a)}"><rect x="${n(bbx-150)}" y="${STREET-430}" width="300" height="90" rx="40" fill="#fff" stroke="${OUT}" stroke-width="5"/>${TXT(n(bbx),STREET-370,w,44,OUT)}</g>`});
  // the loop counter
  const lp=pulse(t,V.n03.s,V.n03.e+.4,.3);if(lp>0)g+=`<g opacity="${n(lp)}">${TXT(540,560,'DAY 1  ·  DAY 1  ·  DAY 1',54,'#ffe14d')}</g>`;
  // the one who runs
  const runA=V.n04.s+1.6,rx=lerp(-300,1500,cl((t-runA)/1.1));
  const obOn=t>=runA,ox=t<runA+1.1?rx:lerp(1500,860,es(t,V.n06.s-.6,V.n06.s+.6));
  if(obOn&&ox<1400){const fast=t<runA+1.1;g+=(fast?`<g opacity=".5">${[1,2,3].map(k=>`<line x1="${n(ox-120-k*60)}" y1="${STREET-200+k*40}" x2="${n(ox-40-k*60)}" y2="${STREET-200+k*40}" stroke="#fff" stroke-width="8" stroke-linecap="round"/>`).join('')}</g>`:'')+char({x:ox,y:STREET+60,face:fast?1:-.4,sw:CORAL,sc:TEAL,aL:fast?100:8,aR:fast?20:8,smile:.6,brow:-.2,open:blink(t,1.7),look:[-.6,0],tilt:fast?14:0,walk:fast?t*16:null})}
  // the arrow
  const ar=es(t,V.n06.s+.4,V.n06.s+1);if(ar>0&&!(t<runA+1.1)){const y=STREET-430+Math.sin(t*4)*14;g+=`<g opacity="${n(ar)}"><polygon points="${n(ox-46)},${n(y)} ${n(ox+46)},${n(y)} ${n(ox)},${n(y+70)}" fill="#7dff6b" stroke="${OUT}" stroke-width="6" stroke-linejoin="round"/></g>`}
  const empty=es(t,V.n07.s,V.n07.s+.5);if(empty>0)g+=`<g opacity="${n(empty*.6)}"><polygon points="${n(bx-46)},${STREET-430} ${n(bx+46)},${STREET-430} ${n(bx)},${STREET-360}" fill="none" stroke="#fff" stroke-width="5" stroke-dasharray="14 12"/></g>`;
  const K=[[0,540,1300,1.1],[V.n03.s,540,1200,1.05],[V.n04.s+1,540,1450,1.3],[V.n05.s+.8,540,1300,1.1],[V.n05.e,540,900,1.15],[V.n06.s+.6,860,1300,1.6],[V.n06.e,860,1300,1.75],[V.n07.s,540,1350,1.7],[V.n07.e,540,1330,2]];
  frameOut(`<g transform="${vcam(K,t)}">${g}</g>`,t,'WHAT IF YOU','WERE THE NPC?');
};
