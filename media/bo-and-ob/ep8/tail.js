/* ================= Episode 8: What If Nobody Remembered You? ================= */
const boTalk=tk(ids('b',4)),obTalk=tk(ids('o',6)),moTalk=tk(ids('m',5));
/* ---------- the man behind the glass ---------- */
function oldBo(o){const c=Object.assign({x:0,y:FLOOR,s:1,face:.2,aL:8,aR:8,smile:-.2,brow:.5,open:1,look:[0,0],sw:'#59606e',sc:'#a9adb8'},o),s=c.s,hx=c.x+c.face*36*s,hy=c.y-362*s+(c.bob||0);
  return char(c)+`<path d="M ${n(hx-98*s)} ${n(hy+52*s)} A ${n(112*s)} ${n(112*s)} 0 0 0 ${n(hx+98*s)} ${n(hy+52*s)} A ${n(170*s)} ${n(170*s)} 0 0 1 ${n(hx-98*s)} ${n(hy+52*s)} Z" fill="#e3e6ee" opacity=".9"/><path d="M ${n(hx-70*s)} ${n(hy-62*s)} q ${n(30*s)} ${n(-10*s)} ${n(60*s)} 0 M ${n(hx+18*s)} ${n(hy-62*s)} q ${n(30*s)} ${n(-10*s)} ${n(60*s)} 0" stroke="#e9ebf2" stroke-width="${n(9*s)}" fill="none" stroke-linecap="round" opacity=".85"/>`}
/* ---------- seven photographs ---------- */
const PX=i=>230+i*245,PY=i=>520-i*52,stairY=x=>1010-Math.floor(cl(x,0,1919)/192)*40;
const PBG=['#bfe6f5','#cfe8b8','#b9d7f0','#ffd9c9','#e6ecf7','#d5efc9','#ffe9c2'];
function kid(k,vis,x,y,s,o){const a=Object.assign({x,y,s,face:.3,aL:8,aR:8,smile:.9,brow:0,open:1,look:[.2,0]},o||{});
  return `<g opacity="${n(vis)}">`+(k<1?`<g opacity="${n(1-k)}">${girl(a)}</g>`:'')+(k>0?`<g opacity="${n(k)}">${char(a)}</g>`:'')+`</g>`}
// one photograph, drawn in a 180 x 220 box. k: 0 = the girl, 1 = Bo. man: the figure in the mirror (last photo only)
function photo(i,k,vis,man){
  const W=180,H=220,fy=H-16,s=.3,cx=90;let g=`<rect width="${W}" height="${H}" fill="${PBG[i]}"/>`;
  if(i===0)g+=`<rect y="96" width="180" height="46" fill="#6fc3e8"/><rect y="138" width="180" height="90" fill="#f3dc9a"/><circle cx="146" cy="34" r="17" fill="#ffd54d"/>`+kid(k,vis,cx,fy,s)+`<g opacity="${n(vis)}"><ellipse cx="93" cy="${fy-140}" rx="42" ry="12" fill="#ffd54d" stroke="${OUT}" stroke-width="2"/></g><rect x="134" y="${fy-26}" width="24" height="26" rx="3" fill="#ff7b6b" stroke="${OUT}" stroke-width="2"/>`;
  else if(i===1)g+=`<rect y="150" width="180" height="70" fill="#8fc97a"/><circle cx="118" cy="${fy-22}" r="22" fill="none" stroke="${OUT}" stroke-width="4"/><circle cx="162" cy="${fy-22}" r="22" fill="none" stroke="${OUT}" stroke-width="4"/><path d="M 118 ${fy-22} l 20 -34 l 24 34 M 138 ${fy-56} h -14" stroke="#ff7b6b" stroke-width="5" fill="none"/>`+kid(k,vis,62,fy,s);
  else if(i===2)g+=`<rect y="150" width="180" height="70" fill="#7fb1d9"/>`+kid(k,vis,80,fy,s,{aR:120})+`<g opacity="${n(vis)}"><ellipse cx="128" cy="${fy-112}" rx="24" ry="10" fill="#9fd0ea" stroke="${OUT}" stroke-width="2"/><polygon points="150,${fy-112} 164,${fy-122} 164,${fy-102}" fill="#9fd0ea" stroke="${OUT}" stroke-width="2"/></g>`;
  else if(i===3)g+=`<rect y="160" width="180" height="60" fill="#e7b9a4"/><rect x="108" y="${fy-50}" width="60" height="34" rx="5" fill="#fff" stroke="${OUT}" stroke-width="2"/><rect x="108" y="${fy-50}" width="60" height="10" fill="#ff9db5"/>`+[0,1,2,3].map(j=>`<rect x="${116+j*13}" y="${fy-68}" width="4" height="18" fill="#ffd54d"/><circle cx="${118+j*13}" cy="${fy-72}" r="4" fill="#ff7b6b"/>`).join('')+kid(k,vis,60,fy,s);
  else if(i===4)g+=`<rect y="160" width="180" height="60" fill="#fff"/><circle cx="132" cy="${fy-22}" r="26" fill="#fff" stroke="${OUT}" stroke-width="2"/><circle cx="132" cy="${fy-62}" r="18" fill="#fff" stroke="${OUT}" stroke-width="2"/><circle cx="126" cy="${fy-66}" r="2.5"/><circle cx="138" cy="${fy-66}" r="2.5"/>`+kid(k,vis,60,fy,s);
  else if(i===5)g+=`<rect y="170" width="180" height="50" fill="#8fc97a"/><path d="M 56 0 V ${fy-60} M 124 0 V ${fy-60}" stroke="#8a5a3c" stroke-width="4"/><rect x="48" y="${fy-62}" width="84" height="10" rx="4" fill="#8a5a3c" stroke="${OUT}" stroke-width="2"/>`+kid(k,vis,90,fy-56,s*.9);
  else{g+=`<rect y="150" width="180" height="70" fill="#f3cf9a"/><rect x="20" y="24" width="56" height="70" rx="5" fill="#cfe0ee"/><defs><clipPath id="pm"><rect x="20" y="24" width="56" height="70" rx="5"/></clipPath></defs><g clip-path="url(#pm)"><g opacity="${n(man||0)}">${oldBo({x:47,y:136,s:.2,face:.1,look:[0,0],open:1.05})}</g><polygon points="56,24 68,24 44,94 32,94" fill="#fff" opacity=".18"/></g><rect x="20" y="24" width="56" height="70" rx="5" fill="none" stroke="#8a5a3c" stroke-width="5"/>`;
    g+=`<path d="M 96 ${fy} V 150 M 150 ${fy} V 150" stroke="#8a5a3c" stroke-width="7"/><rect x="88" y="138" width="70" height="14" rx="5" fill="#b97a48" stroke="${OUT}" stroke-width="2"/>`+kid(k,vis,122,196,.22,{face:.1,aL:60,aR:60})+`<g opacity="${n(vis*(1-k))}"><ellipse cx="124" cy="132" rx="9" ry="5" fill="#fff6dc"/></g>`}
  return g}
function frame(i,k,vis,man,glow){
  return `<g transform="translate(${PX(i)-90},${PY(i)-110})"><rect x="-13" y="-13" width="206" height="246" rx="6" fill="#8a5a3c" stroke="${OUT}" stroke-width="5"/>${glow>0?`<rect x="-22" y="-22" width="224" height="264" rx="10" fill="none" stroke="#ffe14d" stroke-width="8" opacity="${n(glow)}"/>`:''}<svg width="180" height="220" viewBox="0 0 180 220" overflow="hidden">${photo(i,k,vis,man)}</svg><rect width="180" height="220" fill="none" stroke="${OUT}" stroke-width="3"/><polygon points="120,0 150,0 70,220 40,220" fill="#fff" opacity=".12"/></g>`}
// o.k(i), o.vis(i), o.gone (the last frame is off the wall), o.bo (character object or null)
function stairsWall(t,o){
  let g=`<rect width="1920" height="1080" fill="#eadfca"/>`;
  for(let x=40;x<1920;x+=120)g+=`<rect x="${x}" y="0" width="40" height="1080" fill="#e2d5ba"/>`;
  for(let i=0;i<7;i++){if(i===6&&o.gone){g+=`<rect x="${PX(6)-90}" y="${PY(6)-110}" width="180" height="220" fill="#f3ead8"/>`;continue}
    const k=o.k?o.k(i):0;g+=frame(i,k,o.vis?o.vis(i):1,0,o.glow?o.glow(i):0)}
  let p='M 0 1080 L 0 1010';for(let i=0;i<10;i++)p+=` L ${(i+1)*192} ${1010-i*40} L ${(i+1)*192} ${1010-(i+1)*40}`;
  g+=`<path d="${p} L 1920 1080 Z" fill="#9a6642" stroke="${OUT}" stroke-width="5" stroke-linejoin="round"/>`;
  for(let i=0;i<10;i++)g+=`<rect x="${i*192}" y="${1010-i*40}" width="192" height="12" fill="#b97a48" stroke="${OUT}" stroke-width="3"/>`;
  if(o.bo)g+=char(o.bo);
  return g}
const turn=(t,a)=>es(t,a,a+1.3);
const glowAt=(t,a)=>pulse(t,a-.1,a+1.8,.3);

/* ---------- 0: cold open ---------- */
function coldOpen(t){return stairsWall(t,{k:()=>0,vis:i=>1-es(t,V.n02.s+.2+i*.32,V.n02.s+.9+i*.32)})}
/* ---------- 1: one plate ---------- */
function kitchenA(t){
  const mo={x:560,y:FLOOR,face:.9,aL:8+pulse(t,V.n03.s+4,V.n03.e,.5)*(60+8*Math.sin(t*4)),aR:8,smile:.8,brow:0,open:blink(t,.9),mouth:moTalk(t),look:[.85,0],tilt:pulse(t,V.m2.s,V.m2.e+.6,.3)*5};
  const lookBack=pulse(t,V.n05.s,V.n05.s+3,.4),run=seg(t,C.stairs-1.1,C.stairs);
  const bo={x:lerp(1010,2150,run*run),y:FLOOR,face:run>0?1:lerp(-.8,.8,lookBack),aL:8,aR:8,smile:-.35,brow:lerp(.5,1.1,es(t,V.m2.s,V.m2.e)),open:blink(t,.4),mouth:boTalk(t),look:[run>0?.9:lerp(-.9,.9,lookBack),0]};
  if(run>0){bo.walk=t*13;bo.tilt=10}
  return kitchenSet(t,false)+mother(mo)+char(bo)+TABLE}
/* ---------- 2: the first frame ---------- */
const T0=V.n07.e-.2;
function stairsA(t){
  const kx=[[C.stairs,-140],[C.stairs+1.5,95]];
  const bo=stepWalk({x:KF(kx,t),y:stairY(95),s:.7,face:1,aL:8,aR:8,smile:-.4,brow:lerp(.5,1.3,turn(t,T0)),open:t>T0?1.1:blink(t,.4),look:[.6,-.7]},kx,t,11);
  let g=stairsWall(t,{k:i=>i===0?turn(t,T0):0,glow:i=>i===0?glowAt(t,T0):0,bo});
  if(t>=C.one)g+=`<g id="cnt"></g>`;
  return g}
/* ---------- 3: what he left out ---------- */
function mirrorA(t){
  const sad=es(t,V.o3.s,V.o3.e),lie=pulse(t,V.o5.s,V.o5.e+.5,.3);
  const ob=char({x:520,y:FLOOR,face:1,sw:CORAL,sc:TEAL,aL:8,aR:8,smile:lerp(-.1,-.6,sad),brow:lerp(.1,.9,sad),open:blink(t,1.7),mouth:obTalk(t),look:[.85,lie*.6+sad*.3],tilt:lie*4});
  const wr=pulse(t,C.w1-.2,C.w1+2.6,.3),fade=es(t,V.n15.s+2,V.n15.e),hand=es(t,V.n15.s+2.5,V.n15.s+4.5);
  const ya=`<g opacity="${n(1-fade*.55)}">${girl({x:770,y:FLOOR,s:.94,face:lerp(.6,.2,hand),aL:8,aR:8+wr*(150+10*Math.sin(t*7))+hand*118,smile:-.4,brow:.9,open:blink(t,2.1),look:[lerp(.8,.5,hand),lerp(-.2,-.5,hand)]})}</g>`;
  const a1=1-es(t,C.w1-.9,C.w1-.3);
  let over=`<rect x="330" y="170" width="540" height="260" rx="60" fill="#fff" opacity=".55"/>`;
  if(a1>0)over+=`<g opacity="${n(a1)}">${fogText(['HE LEFT','SOMETHING OUT'],64,600,300,1,1)}</g>`;
  if(t>=C.w1)over+=fogText(['THE ONE','LEFT INSIDE','GETS FORGOTTEN'],50,600,300,es(t,C.w1,C.w1+2.4),lerp(-1,1,es(t,C.w1+2.4,C.w1+2.9)));
  const ent=es(t,C.mirror,C.mirror+1.3);
  const bo={x:lerp(1500,1040,ent),y:FLOOR,face:-1,aL:8,aR:8,smile:-.4,brow:lerp(.7,1.1,sad),open:blink(t,.4),mouth:boTalk(t),look:[-.85,lerp(-.2,0,es(t,V.b2.s,V.b2.e))]};
  if(ent>0&&ent<1){bo.walk=t*8;bo.bob=-Math.abs(Math.sin(t*8))*5}
  return room(t,{dop:0,inside:ob+ya,overGlass:over,chars:char(bo)})}
/* ---------- 4: two more ---------- */
function stairsB(t){
  const a=V.n17.s+.6,b=V.n17.s+2.2;
  return stairsWall(t,{k:i=>i===0?1:i===1?turn(t,a):i===2?turn(t,b):0,glow:i=>i===1?glowAt(t,a):i===2?glowAt(t,b):0,
    bo:{x:560,y:stairY(560),s:.7,face:1,aL:8,aR:8,smile:-.5,brow:1.2,open:1.08,look:[.3,-.8]}})}
/* ---------- 5: three ways to make her remember ---------- */
const BOW=(x,y,s)=>`<g transform="translate(${n(x)},${n(y)}) scale(${s})"><polygon points="0,0 -52,-34 -52,28" fill="${CORAL}" stroke="${OUT}" stroke-width="5" stroke-linejoin="round"/><polygon points="0,0 52,-34 52,28" fill="${CORAL}" stroke="${OUT}" stroke-width="5" stroke-linejoin="round"/><circle r="13" fill="${CORAL}" stroke="${OUT}" stroke-width="5"/></g>`;
function kitchenB(t){
  const hold=pulse(t,C.try,V.m3.e+.4,.4),stop=es(t,V.n21.s,V.n21.s+.6),smileOn=es(t,V.n22.s+1.2,V.n22.s+2);
  const kx=[[V.n19.s-.2,1010],[V.n19.s+1.6,1600],[V.m4.e+.3,1600],[V.n20.s+1.2,1010]];
  const bx=KF(kx,t),atDoor=es(t,V.n19.s+1.4,V.n19.s+2)*(1-es(t,V.m4.e,V.m4.e+.5));
  const mo={x:560,y:FLOOR,face:lerp(.9,1,atDoor),aL:lerp(8,70,stop),aR:8+pulse(t,V.m4.s,V.m4.e,.3)*50,smile:lerp(.8,.2,stop)*(1-smileOn)+smileOn*1.1,brow:lerp(0,.5,stop)*(1-smileOn),open:stop>0&&smileOn<1?1.05:blink(t,.9),mouth:moTalk(t),look:[.85,lerp(0,-.2,stop)],tilt:pulse(t,V.m3.s,V.m3.e,.3)*4};
  const bo=stepWalk({x:bx,y:FLOOR,face:atDoor>.5?1:(mv(kx,t)?(KF(kx,t+.1)>bx?1:-1):-.8),aL:8,aR:8+hold*100+atDoor*118,smile:-.4,brow:.9,open:blink(t,.4),mouth:boTalk(t),look:[atDoor>.5?.8:-.9,0]},kx,t,8);
  let g=kitchenSet(t,false);
  // the door frame with a child's heights on it
  g+=`<rect x="1740" y="180" width="60" height="725" fill="#fdfdff" stroke="${OUT}" stroke-width="5"/>`+[[5,640],[6,596],[7,548]].map(([a,y])=>`<path d="M 1748 ${y} h 34" stroke="#59606e" stroke-width="5" stroke-linecap="round"/><text x="1700" y="${y+10}" font-size="26" fill="#59606e" text-anchor="middle">${a}</text>`).join('');
  g+=mother(mo)+char(bo)+TABLE;
  if(hold>0)g+=`<g opacity="${n(hold)}">${BOW(bx-118,FLOOR-262,.62)}</g>`;
  if(stop>0)g+=`<g opacity="${n(stop)}"><path d="M 652 ${FLOOR-262} q -4 34 22 36 q 26 -2 22 -36 Z" fill="#fdfdff" stroke="${OUT}" stroke-width="5"/></g>`;
  return g}
/* ---------- 6: the last two ---------- */
function stairsC(t){
  const a=C.five+.3,b=C.five+1.3,c=C.six;
  const kx=[[C.five+2.6,560],[C.sit+1.2,1575]];
  const low=es(t,C.sit+1.2,C.sit+2.4)*(1-es(t,C.six-.4,C.six+.2)),reach=es(t,V.n28.s+3,V.n28.e);
  const bx=KF(kx,t);
  const bo=stepWalk({x:bx,y:stairY(bx),s:.7,face:lerp(1,.4,low),aL:8,aR:8+reach*150,smile:-.5,brow:1.1,open:low>.5?.55:blink(t,.4),look:[.3+reach*.5,lerp(-.8,.8,low)-reach*.9],tilt:low*8},kx,t,9);
  return stairsWall(t,{k:i=>i<3?1:i===3?turn(t,a):i===4?turn(t,b):i===5?turn(t,c):0,glow:i=>i===3?glowAt(t,a):i===4?glowAt(t,b):i===5?glowAt(t,c):i===6?pulse(t,V.n28.s,V.n28.e,.5)*.8:0,bo})}
/* ---------- 7: the man in the photograph ---------- */
const MAN=V.n29.e-1.9;
function photoClose(t){
  const man=es(t,MAN,MAN+1.6),sc=4.4;
  let g=`<rect width="1920" height="1080" fill="#1b1530"/><circle cx="960" cy="540" r="760" fill="#f6c453" opacity=".07"/>`;
  g+=`<g transform="translate(564,56) scale(${sc})"><rect x="-13" y="-13" width="206" height="246" rx="6" fill="#8a5a3c" stroke="${OUT}" stroke-width="3"/>${photo(6,0,1,man)}<rect width="180" height="220" fill="none" stroke="${OUT}" stroke-width="2"/></g>`;
  g+=`<circle cx="520" cy="820" r="62" fill="#1d1a3a" stroke="${OUT}" stroke-width="6"/><circle cx="1400" cy="820" r="62" fill="#1d1a3a" stroke="${OUT}" stroke-width="6"/>`;
  return g}

/* ---------- camera, overlays ---------- */
const K0=[[0,560,560,1.55],[V.n01.e,1380,330,1.55],[V.n02.s+.4,960,540,1.02],[C.title,960,540,1.08]];
const K1=[[C.act1,900,540,1.08],[V.n03.e,820,520,1.3],[V.n04.s,960,640,2.3],[V.n04.e+.4,960,640,2.5],[V.m1.s,640,470,1.6],[V.n05.s,1010,470,1.7],[V.b1.s,1010,470,1.9],[V.m2.s,580,440,1.9],[V.m2.e,580,435,2.2],[V.n06.s,1010,470,1.8],[V.n06.e,1010,465,2.1],[C.stairs,1100,500,1.5]];
const K2=[[C.stairs,420,640,1.4],[V.n07.s+2.5,300,560,1.9],[V.n07.e-.6,760,450,2],[V.n08.s+.6,230,540,2.5],[V.n09.e,230,530,3],[C.one+.2,330,600,1.9],[C.mirror,330,600,2]];
const K3=[[C.mirror,1000,540,1.1],[V.n11.s+2.5,620,380,1.7],[C.w1+2.6,600,320,1.95],[V.n12.e,600,340,1.85],[V.b2.s,1040,470,1.7],[V.o1.s,540,470,1.9],[V.o2.s,560,480,1.6],[V.o2.e,540,465,2],[V.o3.s,540,465,2.1],[V.o3.e,540,462,2.4],[V.n13.s,1040,470,1.7],[V.n14.e,1040,465,2],[V.b3.s,1040,470,1.8],[V.o4.s,540,470,1.9],[V.o6.s,540,465,2.1],[V.o6.e,540,462,2.4],[V.n15.s,760,500,1.6],[V.n15.e,800,470,2.3],[V.n16.e,800,465,2.5],[C.down,800,465,2.5]];
const K4=[[C.down,960,540,1],[V.n17.s+3,640,470,1.6],[C.try,600,470,1.7]];
const K5=[[C.try,900,540,1.08],[V.n18.s+1.5,880,500,1.5],[V.m3.s,600,450,1.8],[V.n19.s+.4,1100,540,1.3],[V.n19.s+3,1650,600,1.9],[V.n19.e,1700,600,2.2],[V.m4.s,900,520,1.2],[V.n20.s+1,1010,470,1.6],[V.n20.e,1010,465,2],[V.b4.e,1010,465,2.2],[V.n21.s,580,440,1.9],[V.m5.e,580,432,2.3],[V.n22.e,580,430,2.7],[C.five,580,430,2.7]];
const K6=[[C.five,960,540,1],[C.five+2.4,1150,420,1.35],[C.sit+1.2,1500,560,1.6],[V.n24.e,1575,500,2.3],[V.n25.e,1575,495,2.5],[V.n26.s+1,1300,460,1.4],[V.n26.e,1575,480,2.1],[C.six-.2,1455,300,2.3],[V.n27.e,1455,300,2.7],[V.n28.s+1.2,1700,240,2.6],[V.n28.e,1700,230,3.3],[C.close,1700,230,3.4]];
const K7=[[C.close,960,540,1],[V.n29.s+2.5,960,520,1.12],[MAN+.4,790,330,2.1],[V.n30.e,775,318,2.8],[V.n31.e,772,300,3.7],[V.n32.e,772,298,4],[V.n34.e,772,296,4.6],[D.total,772,296,4.8]];
function cam(K,t){let i=0;while(i<K.length-1&&t>K[i+1][0])i++;const a=K[i],b=K[Math.min(i+1,K.length-1)],u=es(t,a[0],b[0]>a[0]?b[0]:a[0]+1);const z=lerp(a[3],b[3],u);let cx=lerp(a[1],b[1],u),cy=lerp(a[2],b[2],u);cx=cl(cx,960/z,1920-960/z);cy=cl(cy,540/z,1080-540/z);return `translate(960,540) scale(${z.toFixed(4)}) translate(${n(-cx)},${n(-cy)})`}
const N1=V.n01.e-V.n01.s;
const HOOK=[['n01',0,N1*.58,'SEVEN PHOTOGRAPHS HANG ON','THE STAIRS IN YASMINE’S HOUSE.'],['n01',N1*.59,99,'THIS MORNING, SHE WAS','IN EVERY ONE OF THEM.'],['n02',0,99,'BY TONIGHT, SHE WON’T','BE IN A SINGLE ONE.']];
function hookCaps(t){
  if(t>=C.title)return '';
  let g=`<rect x="0" y="720" width="1920" height="360" fill="#05040f" opacity=".5"/>`;
  for(const [id,a,b,l1,l2] of HOOK){const r=t-V[id].s;if(r>=a&&r<b&&t<V[id].e+.5){const k=.9+.1*es(r,a,a+.18),T=(y,txt,c)=>`<text x="0" y="${y}" font-size="86" text-anchor="middle" fill="${c}" stroke="#05040f" stroke-width="20" paint-order="stroke" stroke-linejoin="round" letter-spacing="3">${txt}</text>`;
    g+=`<g transform="translate(960,880) scale(${n(k)})">${T(-10,l1,'#ffffff')}${T(94,l2,'#ffe14d')}</g>`}}
  return g+`<rect width="1920" height="1080" fill="#000" opacity="${n(1-es(t,0,.3))}"/>`}
function cornerTitle(t){const a=pulse(t,C.title+.1,C.title+6,.6);if(a<=0)return '';
  return `<g opacity="${n(a)}"><rect x="50" y="46" width="560" height="74" rx="16" fill="#05040f" opacity=".6"/><text x="80" y="98" font-size="44" fill="#e9e6ff" letter-spacing="3">BO &amp; OB <tspan fill="#f6c453">· EPISODE 8</tspan></text></g>`}
function endcard(t){const a=es(t,C.end,C.end+.5);if(a<=0)return '';
  return `<g opacity="${n(a)}"><rect width="1920" height="1080" fill="#08071a" opacity=".94"/><text x="960" y="520" font-size="190" text-anchor="middle" fill="#e9e6ff" letter-spacing="8">Bo &amp; Ob</text><text x="960" y="640" font-size="54" text-anchor="middle" fill="#f6c453" letter-spacing="5">TO BE CONTINUED</text></g>`}
// how many photographs have turned
function tally(t){
  const S=[[C.one,'1'],[V.n17.s+3.2,'3'],[C.five+.4,'4'],[C.five+1.4,'5'],[C.six+.6,'6']];let cur=null;
  for(const [a,txt] of S)if(t>=a)cur=[a,txt];
  if(!cur||t>=C.close)return '';
  const hide=t>=C.mirror&&t<V.n17.s+3.2||t>=C.try&&t<C.five+.4;if(hide)return '';
  return counter(cur[1]+' / 7',es(t,cur[0],cur[0]+.3),'#ffe14d')}
const CUTS=[C.act1,C.stairs,C.mirror,C.down,C.try,C.five,C.close];
window.renderAt=function(t){
  let g=DEFS,s;
  if(t<C.act1)s=`<g transform="${cam(K0,t)}">${coldOpen(t)}</g>`;
  else if(t<C.stairs)s=`<g transform="${cam(K1,t)}">${kitchenA(t)}</g>`;
  else if(t<C.mirror)s=`<g transform="${cam(K2,t)}">${stairsA(t)}</g>`;
  else if(t<C.down)s=`<g transform="${cam(K3,t)}">${mirrorA(t)}</g>`;
  else if(t<C.try)s=`<g transform="${cam(K4,t)}">${stairsB(t)}</g>`;
  else if(t<C.five)s=`<g transform="${cam(K5,t)}">${kitchenB(t)}</g>`;
  else if(t<C.close)s=`<g transform="${cam(K6,t)}">${stairsC(t)}</g>`;
  else s=`<g transform="${cam(K7,t)}">${photoClose(t)}</g>`;
  g+=s;
  let bl=0;for(const c of CUTS)bl=Math.max(bl,1-Math.abs(t-c)/.3);
  g+=`<rect width="1920" height="1080" fill="#05040f" opacity="${n(cl(bl))}"/><rect width="1920" height="1080" fill="url(#vig)"/>`;
  g+=tally(t)+hookCaps(t)+cornerTitle(t)+endcard(t);
  g+=`<rect width="1920" height="1080" fill="#000" opacity="${n(es(t,D.total-.7,D.total-.1))}"/>`;
  document.getElementById('s').innerHTML=g;
};
window.DATA={fps:D.fps,total:D.total};
window.ready=document.fonts.load('600 40px Fredoka').then(()=>{renderAt(+(new URLSearchParams(location.search).get('t')||0));return true});
