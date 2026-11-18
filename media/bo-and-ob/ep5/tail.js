/* ================= Episode 5: What If the Impostor Loved Her? ================= */
const boTalk=tk(ids('b',5)),obTalk=tk(ids('o',3)),xTalk=tk(ids('x',12));
const impostor=o=>mother(Object.assign({flip:1},o));
const SHEET=(pull,col='#efe6d0',fold='#d6c9a8')=>`<g transform="translate(0,${n(pull*900)}) rotate(${n(pull*6)} 600 500)" opacity="${n(1-cl((pull-.55)*3))}"><path d="M 262 120 h 676 v 800 q -85 34 -169 0 q -85 -34 -169 0 q -85 34 -169 0 q -85 -34 -169 0 Z" fill="${col}" stroke="${OUT}" stroke-width="5" stroke-linejoin="round"/><path d="M 430 120 v 780 M 600 120 v 800 M 770 120 v 780" stroke="${fold}" stroke-width="6" fill="none"/></g>`;

/* ---------- 1: two impostors and one pot of tea ---------- */
function kitchen5(t){
  const lean=es(t,V.x4.s,V.x4.e),turn=es(t,V.x2.s-.3,V.x2.s+.3),run=seg(t,C.run,C.run+1.1);
  const mo={x:560,y:FLOOR,face:lerp(.5,1,turn),aL:62+10*Math.sin(t*6)*(1-turn),aR:8,brushL:turn<.5?1:0,smile:lerp(.7,1,lean),brow:.1,open:blink(t,.9),mouth:xTalk(t),look:[lerp(.2,.9,turn),lerp(.5,0,turn)],tilt:lean*4};
  const bo={x:lerp(1010,2150,run*run),y:FLOOR,face:run>0?1:-.8,aL:8,aR:8,smile:-.35,brow:.9,open:blink(t,.4),mouth:boTalk(t),look:[run>0?.9:-.9,.15]};
  if(run>0){bo.walk=t*13;bo.tilt=10;bo.aL=60+50*Math.sin(t*13);bo.aR=60-50*Math.sin(t*13)}
  return kitchenSet(t,false)+impostor(mo)+char(bo)+TABLE;
}
/* ---------- 2: no glass between them ---------- */
function kneeling(t,look,write){
  const mo=mother({x:540,y:FLOOR+105,face:lerp(.6,1,look),aL:20,aR:lerp(70,84,look)*(1-write)+write*(150+8*Math.sin(t*7)),smile:lerp(1,-.2,look),brow:lerp(.2,1,look),open:lerp(.12,1.08,look),look:[lerp(.4,.9,look),0],tilt:5});
  return mo}
function reunion(t){
  const pull=es(t,C.pull,C.pull+.9),look=es(t,C.look,C.look+.7),wr=pulse(t,C.who-.2,C.who+2.1,.3);
  const talkY=pulse(t,V.n11.s-.3,V.n11.e,.5)*(1-look);
  const ya=girl({x:700,y:FLOOR,face:lerp(-.7,.3,look),aL:60,aR:8,smile:lerp(1,-.2,look),brow:.4,open:blink(t,2.1),mouth:talkY*(.3+.35*Math.abs(Math.sin(t*9))),look:[lerp(-.8,.8,look),-.2]});
  const fog=es(t,C.who-.8,C.who)*.55;
  const over=`<rect x="360" y="170" width="500" height="250" rx="60" fill="#fff" opacity="${n(fog)}"/>`+(t>=C.who?fogText(['WHO','ARE YOU'],84,610,295,es(t,C.who,C.who+2),lerp(-1,1,es(t,C.who+2,C.who+2.5))):'');
  const ent=es(t,C.run+1.2,C.pull-.2);
  const bo={x:lerp(1800,1040,ent),y:FLOOR,face:-1,aL:8+pulse(t,C.pull-.4,C.pull+.5,.2)*140,aR:8+pulse(t,C.pull-.4,C.pull+.5,.2)*120,smile:-.3,brow:lerp(.9,.4,es(t,V.b2.s+2,V.b2.e)),open:blink(t,.4),mouth:boTalk(t),look:[-.8,lerp(-.1,.7,es(t,V.b2.s+2.2,V.b2.e+.5))]};
  if(ent>0&&ent<1){bo.walk=t*11;bo.tilt=-8}
  return room(t,{dop:1,inside:kneeling(t,look,wr)+ya,overGlass:over,chars:char(bo)})+SHEET(pull);
}
/* ---------- 3-5: the dressing table ---------- */
function dressSet(t,o){
  let g=`<rect width="1920" height="1080" fill="#e3d8ee"/><rect x="0" y="620" width="1920" height="285" fill="#c9bcd9"/><rect x="0" y="${FLOOR}" width="1920" height="175" fill="#8f6f58"/>`;
  g+=`<rect x="1500" y="230" width="270" height="680" fill="#ffe9a8"/>${o.door||''}<rect x="1486" y="216" width="298" height="708" fill="none" stroke="#6a5340" stroke-width="16"/>`;
  g+=`<rect x="700" y="640" width="520" height="34" rx="10" fill="#8a5a3c" stroke="${OUT}" stroke-width="5"/><rect x="730" y="674" width="460" height="231" rx="8" fill="#a06a40" stroke="${OUT}" stroke-width="5"/><rect x="760" y="704" width="400" height="80" rx="8" fill="#b57c50"/><circle cx="960" cy="744" r="9" fill="#f6c453"/><rect x="945" y="600" width="30" height="44" fill="#8d95a8" stroke="${OUT}" stroke-width="4"/>`;
  g+=`<defs><clipPath id="dm"><circle cx="960" cy="430" r="178"/></clipPath></defs><circle cx="960" cy="430" r="178" fill="#d6cbe2"/><g clip-path="url(#dm)"><rect x="782" y="470" width="356" height="140" fill="#c0b2d1"/>${o.inMirror||''}<polygon points="900,250 960,250 860,610 800,610" fill="#fff" opacity="${o.shine==null?.2:o.shine}"/></g><circle cx="960" cy="430" r="178" fill="none" stroke="#f6c453" stroke-width="18"/><circle cx="960" cy="430" r="178" fill="none" stroke="${OUT}" stroke-width="4"/>`;
  return g}
function tableScene(t){
  const leave=es(t,V.x9.e+.3,C.ob-.1),back=es(t,C.offer-.2,C.offer+.6),gone=leave*(1-back);
  const brushing=1-es(t,V.b3.s-.2,V.b3.s+.4);
  const xk=[[C.table,1190],[V.x9.e+.3,1190],[C.ob-.1,1640],[C.offer+.6,1640]];
  const mo={x:KF(xk,t),y:FLOOR,face:back>.5?-1:(leave>.05?1:lerp(-1,-.7,1-brushing)),aL:8+brushing*(150+12*Math.sin(t*5)),aR:8,brushL:1,smile:lerp(.6,.95,es(t,V.x11.s,V.x11.e)),brow:lerp(.1,-.2,es(t,V.x5.s,V.x5.e)),open:blink(t,.9),mouth:xTalk(t),look:[back>.5?-.8:-.7,brushing*-.1]};stepWalk(mo,xk,t);
  const obIn=es(t,C.ob,C.ob+1)*(1-es(t,V.o3.e+.6,C.offer));
  const bk=[[C.table+.4,-170],[V.n14.e,600],[C.ob,600],[C.ob+1.2,690],[C.offer,690]];
  const bo={x:KF(bk,t),y:FLOOR,face:1,aL:8,aR:8+pulse(t,V.b3.s-.1,V.b3.e+.3,.2)*86,smile:-.35,brow:.8-pulse(t,V.b3.s-.1,V.b3.e+.3,.2)*1.6,open:blink(t,.4),mouth:boTalk(t),look:[.85,es(t,C.ob,C.ob+.6)*(1-back)*-.5]};stepWalk(bo,bk,t);
  const think=es(t,V.n18.s,V.n18.s+1.2);if(think>0){bo.look=[lerp(.85,.1,think),lerp(0,.6,think)];bo.brow=lerp(bo.brow,.5,think);bo.tilt=2*think}
  const inMirror=`<g opacity="${n(1-obIn)}">${char({x:lerp(700,840,cl((bo.x+170)/770)),y:650,s:.42,face:.5,smile:-.4,brow:.9,look:[.6,0]})}</g><g opacity="${n(obIn)}">${char({x:960,y:690,s:.6,face:-.5,sw:CORAL,sc:TEAL,smile:.5,brow:-.2,open:blink(t,1.7),mouth:obTalk(t),look:[-.7,.3]})}</g>`;
  const inDoor=gone>.3||back>0, door=inDoor?'':'';
  let g=dressSet(t,{inMirror,door});
  // the memory of home
  const mem=pulse(t,V.n19.s+3.5,V.n19.e+.6,.6);
  const card=mem>0?`<g opacity="${n(mem)}"><defs><clipPath id="mm"><rect x="1010" y="120" width="620" height="420" rx="26"/></clipPath></defs><g clip-path="url(#mm)"><rect x="1010" y="120" width="620" height="420" fill="#1c1840"/><rect x="1010" y="400" width="620" height="140" fill="#8fb4e8"/><rect x="1380" y="340" width="200" height="90" rx="30" fill="#fff"/>${char({x:1290,y:760,s:.9,face:.4,flip:1,open:.06,smile:.5,brow:0,look:[0,0]})}<rect x="1010" y="470" width="620" height="70" fill="#ffd3e0"/></g><rect x="1010" y="120" width="620" height="420" rx="26" fill="none" stroke="#e9e6ff" stroke-width="10"/></g>`:'';
  return g+(mo.x<1500||back>0?impostor(mo):'')+char(bo)+card;
}
/* ---------- 6: forty years early ---------- */
const W5=[['w1',['I KNOW','YOUR FACE'],80],['w2',['YOU WERE','OLDER'],84],['w3',['DON’T LET','HER IN'],84]];
function flashback(t){
  const a=pulse(t,V.n25.s+.3,V.n25.e+.5,.7);if(a<=0)return '';
  const tk2=.25+.35*Math.abs(Math.sin(t*8));
  return `<g opacity="${n(a)}"><rect width="1920" height="1080" fill="#2b2118"/><defs><clipPath id="fm"><circle cx="1120" cy="520" r="340"/></clipPath></defs><circle cx="1120" cy="520" r="340" fill="#6b5a4a"/><g clip-path="url(#fm)">${char({x:1120,y:1230,s:1.55,face:-.4,smile:-.4,brow:1.1,open:1.05,mouth:tk2,look:[-.8,.35],sw:'#3f8f88',sc:'#c9574c'})}<polygon points="1000,180 1100,180 900,860 800,860" fill="#fff" opacity=".1"/></g><circle cx="1120" cy="520" r="340" fill="none" stroke="#c9a04a" stroke-width="26"/><circle cx="1120" cy="520" r="340" fill="none" stroke="${OUT}" stroke-width="5"/>${mother({x:470,y:1090,s:.78,face:.5,back:1,sw:'#c98bb0'})}<rect width="1920" height="1080" fill="#c9a04a" opacity=".12"/></g>`}
function writing5(t){
  let over='',wr=0;const fog=es(t,C.w1-.8,C.w1);
  W5.forEach(([c,lines,size],i)=>{const a=C[c],b=i<2?C[W5[i+1][0]]-.5:C.turn+20;if(t>=a&&t<b){const cl2=i<2?1-pulse(t,b-.6,b+.2,.3):1;over+=`<g opacity="${n(cl2)}">`+fogText(lines,size,610,295,es(t,a,a+2),lerp(-1,1,es(t,a+2,a+2.5)))+`</g>`}wr+=pulse(t,a-.2,a+2.1,.3)});
  over=`<rect x="360" y="170" width="500" height="250" rx="60" fill="#fff" opacity="${n(fog*.55)}"/>`+over;
  const ya=girl({x:720,y:FLOOR,face:.5,aL:8,aR:8,smile:-.2,brow:.7,open:blink(t,2.1),look:[.8,-.3]});
  const turn=es(t,C.turn,C.turn+.35),ent=es(t,C.back+.2,C.back+1.6);
  const bo={x:lerp(1500,1040,ent),y:FLOOR,face:lerp(-1,1,turn),aL:8,aR:8,smile:-.35,brow:lerp(.7,1.2,turn),open:blink(t,.4),look:[lerp(-.8,.9,turn),-.25*(1-turn)],bob:-pulse(t,C.turn,C.turn+.3,.1)*20};
  if(ent>0&&ent<1){bo.walk=t*6;bo.bob-=Math.abs(Math.sin(t*6))*5}
  const sm=es(t,C.smile,C.smile+.6),inD=es(t,C.turn-.3,C.turn+.2);
  const imp=`<g opacity="${n(inD)}">${impostor({x:1740,y:FLOOR,face:-.8,aL:70,aR:8,brushL:1,smile:lerp(-.05,1.1,sm),brow:0,open:1.05,mouth:xTalk(t),look:[-.8,0]})}</g>`;
  return room(t,{dop:1,inside:kneeling(t,1,cl(wr))+ya,overGlass:over,chars:imp+char(bo)});
}

/* ---------- camera, overlays ---------- */
const K1=[[0,640,470,1.7],[V.n01.e,640,470,1.6],[V.n02.e,900,540,1.1],[V.n03.s+1,620,500,1.6],[V.n04.e,620,500,1.7],[V.x1.s,800,540,1.2],[V.n05.s,1010,480,1.6],[V.n05.e,860,500,1.3],[V.x2.s,680,470,1.6],[V.b1.s,1010,480,1.6],[V.x3.s,680,470,1.7],[V.n06.s,900,540,1.08],[V.x4.s,640,450,1.9],[C.run,900,540,1.1]];
const K2=[[C.run+1.2,1300,540,1.1],[C.pull-.3,900,520,1.2],[V.n08.s,640,540,1.5],[V.n09.e,620,560,1.8],[V.n10.e,640,560,1.85],[V.n11.s,760,540,1.4],[C.look,640,500,1.9],[C.who,610,360,1.9],[V.n13.e,620,380,1.9],[V.b2.s,1040,470,1.7],[C.table,1040,480,1.9]];
const K3=[[C.table,1000,520,1.15],[V.n14.e,1060,450,1.5],[V.b3.s,640,470,1.6],[V.x5.s,1190,450,1.7],[V.x6.e,1190,440,1.9],[V.x7.s,1080,460,1.4],[V.x8.s,1190,440,1.8],[V.n15.s,900,520,1.15],[V.n15.e,1190,450,1.6],[V.b4.s,640,470,1.7],[V.x9.s,1190,440,1.9],[C.ob-.2,1000,520,1.2],[C.ob+.8,960,430,2.3],[V.o1.e,960,430,2.4],[V.b5.s,690,470,1.8],[V.o2.s,960,430,2.4],[V.n16.s+.4,820,470,1.5],[V.o3.s,960,430,2.5],[C.offer,1000,520,1.2],[V.x10.s,1560,470,1.7],[V.x11.e,1600,450,2],[V.n18.s,900,520,1.2],[V.n18.e,700,480,1.6],[V.n19.s+3.4,1000,430,1.25],[V.n20.s,700,470,1.9],[C.back,690,460,2.1]];
const K6=[[C.back,1150,540,1.1],[V.n21.e,900,520,1.25],[C.w1,620,330,1.9],[V.n23.e,620,330,1.95],[C.w2,620,330,1.95],[V.n24.e,640,440,1.5],[C.w3-.3,640,440,1.5],[C.w3,620,330,1.95],[V.n27.e,620,340,2.05],[V.n28.s,860,500,1.3],[C.turn-.2,1040,470,1.6],[C.turn+.4,1400,520,1.25],[V.x12.s,1700,470,1.8],[C.smile-.2,1740,440,2.4],[D.total,1740,430,2.7]];
function cam(K,t){let i=0;while(i<K.length-1&&t>K[i+1][0])i++;const a=K[i],b=K[Math.min(i+1,K.length-1)],u=es(t,a[0],b[0]>a[0]?b[0]:a[0]+1);const z=lerp(a[3],b[3],u);let cx=lerp(a[1],b[1],u),cy=lerp(a[2],b[2],u);cx=cl(cx,960/z,1920-960/z);cy=cl(cy,540/z,1080-540/z);return `translate(960,540) scale(${z.toFixed(4)}) translate(${n(-cx)},${n(-cy)})`}
const N1=V.n01.e-V.n01.s,P0=N1*.53,P1b=N1*.83;
const HOOK=[['n01',0,P0-.1,'BO KNEW THREE THINGS ABOUT','THE WOMAN MAKING BREAKFAST.'],['n01',P0,P1b-.1,'SHE HAD HER','MOTHER’S FACE.'],['n01',P1b,99,'SHE HAD','HER VOICE.'],['n02',0,99,'AND SHE HAD NEVER BEEN','ON THIS SIDE OF A MIRROR.']];
function hookCaps(t){
  if(t>=C.title)return '';
  let g=`<rect x="0" y="720" width="1920" height="360" fill="#05040f" opacity=".5"/>`;
  for(const [id,a,b,l1,l2] of HOOK){const r=t-V[id].s;if(r>=a&&r<b&&t<V[id].e+.5){const k=.9+.1*es(r,a,a+.18),T=(y,txt,c)=>`<text x="0" y="${y}" font-size="84" text-anchor="middle" fill="${c}" stroke="#05040f" stroke-width="20" paint-order="stroke" stroke-linejoin="round" letter-spacing="3">${txt}</text>`;
    g+=`<g transform="translate(960,880) scale(${n(k)})">${T(-10,l1,'#ffffff')}${T(92,l2,'#ffe14d')}</g>`}}
  return g+`<rect width="1920" height="1080" fill="#000" opacity="${n(1-es(t,0,.3))}"/>`}
function cornerTitle(t){const a=pulse(t,C.title+.1,C.title+6,.6);if(a<=0)return '';
  return `<g opacity="${n(a)}"><rect x="50" y="46" width="560" height="74" rx="16" fill="#05040f" opacity=".6"/><text x="80" y="98" font-size="44" fill="#e9e6ff" letter-spacing="3">BO &amp; OB <tspan fill="#f6c453">· EPISODE 5</tspan></text></g>`}
function endcard(t){const a=es(t,C.end,C.end+.5);if(a<=0)return '';
  return `<g opacity="${n(a)}"><rect width="1920" height="1080" fill="#08071a" opacity=".94"/><text x="960" y="520" font-size="190" text-anchor="middle" fill="#e9e6ff" letter-spacing="8">Bo &amp; Ob</text><text x="960" y="640" font-size="54" text-anchor="middle" fill="#f6c453" letter-spacing="5">TO BE CONTINUED</text></g>`}
const CUTS=[C.run+1.15,C.table,C.back];
window.renderAt=function(t){
  let g=DEFS,s;
  if(t<C.run+1.15)s=`<g transform="${cam(K1,t)}">${kitchen5(t)}</g>`;
  else if(t<C.table)s=`<g transform="${cam(K2,t)}">${reunion(t)}</g>`;
  else if(t<C.back)s=`<g transform="${cam(K3,t)}">${tableScene(t)}</g>`;
  else s=`<g transform="${cam(K6,t)}">${writing5(t)}</g>`;
  g+=s;
  let bl=0;for(const c of CUTS)bl=Math.max(bl,1-Math.abs(t-c)/.35);
  g+=`<rect width="1920" height="1080" fill="#05040f" opacity="${n(cl(bl))}"/><rect width="1920" height="1080" fill="url(#vig)"/>`;
  g+=flashback(t)+hookCaps(t)+cornerTitle(t)+endcard(t);
  g+=`<rect width="1920" height="1080" fill="#000" opacity="${n(es(t,D.total-.7,D.total-.1))}"/>`;
  document.getElementById('s').innerHTML=g;
};
window.DATA={fps:D.fps,total:D.total};
window.ready=document.fonts.load('600 40px Fredoka').then(()=>{renderAt(+(new URLSearchParams(location.search).get('t')||0));return true});
