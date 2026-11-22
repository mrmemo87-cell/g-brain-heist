/* ===== What if you could see how much everyone actually liked you? ===== */
const PLAIN=(c1,c2)=>`<defs><radialGradient id="pl${c1.slice(1)}" cx=".5" cy=".45" r=".8"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></radialGradient></defs><rect width="1920" height="1080" fill="url(#pl${c1.slice(1)})"/>`;
function dust(t,c='#fff',nn=40){let g='';for(let i=0;i<nn;i++){const x=(i*173+t*20*(1+i%3))%1960-20,y=(i*97-t*14*(1+i%2))%1120;g+=`<circle cx="${n(x)}" cy="${n((y+1120)%1120)}" r="${2+i%3}" fill="${c}" opacity="${n(.15+.2*Math.abs(Math.sin(t+i)))}"/>`}return g}
const U=(t,id)=>cl((t-V[id].s)/(V[id].e-V[id].s));
const headY=(y,s=1)=>y-362*s;
const topY=(y,s=1)=>y-362*s-205*s;
// colour of a number: red, amber, green, gold
const NC=v=>v===''||v==null||typeof v==='string'?'#9aa0b5':v<30?'#ff5f5f':v<60?'#ffb84d':v<85?'#8fe07a':'#ffe14d';
// value that eases between keyframes [[time,value],...]
function VAL(t,keys,d=.6){let v=keys[0][1];for(let i=1;i<keys.length;i++){const [a,b]=keys[i];if(t>=a)v=Math.round(lerp(keys[i-1][1],b,es(t,a,a+d)))}return v}
// the glowing number above a head. v: number, '' (blank) or '?' (hidden)
function NUM(x,y,v,t,o={}){const t0=o.t0==null?-1:o.t0;if(t<t0)return '';const k=(o.k==null?1:o.k)*BO((t-t0)/.35),s=o.s||1;if(k<=0)return '';
  const blank=v===''||v==null,txt=blank?'–':String(v),col=o.col||NC(v),w=Math.max(150,txt.length*58+70),bob=Math.sin(t*2+x*.013)*6,shake=o.shake?Math.sin(t*60)*o.shake:0,op=o.op==null?1:o.op;
  let g=`<g opacity="${n(op*(blank?.55:1))}" transform="translate(${n(x+shake)},${n(y+bob)}) scale(${n(s*k)})">`+GLOW(0,0,blank?60:110,col,blank?.12:.35);
  g+=`<rect x="${n(-w/2)}" y="-62" width="${n(w)}" height="124" rx="62" fill="#0b0826" opacity=".62" stroke="${col}" stroke-width="6"/>`;
  g+=`<g${o.blur?' filter="url(#blur6)"':''}>${T(0,31,txt,92,col,{flat:1})}</g>`;
  if(v===100||o.spark)for(let i=0;i<6;i++){const a=i*1.05+t*1.6;g+=star(Math.cos(a)*(w/2+40),Math.sin(a)*90,12,t+i,'#ffe14d')}
  return g+`</g>`}
// a small floating label (e.g. +3 COFFEE)
function TAG(x,y,txt,c,t,t0,t1){if(t<t0||(t1&&t>t1))return '';const u=t-t0,k=BO(u/.3),a=1-es(t,(t1||t0+2.2)-.4,t1||t0+2.2);if(a<=0)return '';
  return `<g opacity="${n(a)}" transform="translate(${n(x)},${n(y-u*18)}) scale(${n(k)})">${T(0,0,txt,46,c)}</g>`}
function ARROW(x,y,up,c,t,t0){if(t<t0)return '';const k=BO((t-t0)/.3),dy=Math.sin(t*6)*6*(up?-1:1);return `<g transform="translate(${n(x)},${n(y+dy)}) scale(${n(k)}) rotate(${up?0:180})"><polygon points="0,-46 40,6 14,6 14,46 -14,46 -14,6 -40,6" fill="${c}" stroke="${OUT}" stroke-width="5"/></g>`}
function CARD(x,y,lines,c,t,t0,rot=0){if(t<t0)return '';const k=BO((t-t0)/.35);return `<g transform="translate(${n(x)},${n(y)}) rotate(${rot}) scale(${n(k)})"><rect x="-320" y="-110" width="640" height="220" rx="24" fill="#14102e" stroke="${c}" stroke-width="8"/>${lines.map((l,i)=>T(0,(i-(lines.length-1)/2)*70+22,l,i?(l.length>20?34:44):60,i?'#fff':c,{flat:1})).join('')}</g>`}
// ---------- the dog ----------
function DOG(x,y,s,t,o={}){const wag=Math.sin(t*(o.sleep?2:14))*(o.sleep?6:28),sl=o.sleep;
  return `<g transform="translate(${n(x)},${n(y)}) scale(${s})"><ellipse cx="0" cy="6" rx="170" ry="18" fill="#000" opacity=".15"/>
  <g transform="translate(-140,-70) rotate(${n(-30+wag)})"><rect x="-10" y="-80" width="22" height="90" rx="11" fill="#c98a4a" stroke="${OUT}" stroke-width="5"/></g>
  <ellipse cx="0" cy="-60" rx="150" ry="70" fill="#c98a4a" stroke="${OUT}" stroke-width="6"/><ellipse cx="-20" cy="-40" rx="80" ry="34" fill="#e7b57a"/>
  ${sl?'':`<rect x="-110" y="-30" width="34" height="36" rx="14" fill="#c98a4a" stroke="${OUT}" stroke-width="5"/><rect x="70" y="-30" width="34" height="36" rx="14" fill="#c98a4a" stroke="${OUT}" stroke-width="5"/>`}
  <g transform="translate(${sl?130:120},${sl?-70:-120})"><ellipse cx="-50" cy="-10" rx="30" ry="60" transform="rotate(25 -50 -10)" fill="#8a5a2a" stroke="${OUT}" stroke-width="5"/>
  <circle r="78" fill="#d99a5a" stroke="${OUT}" stroke-width="6"/><ellipse cx="44" cy="26" rx="44" ry="32" fill="#f0cfa0" stroke="${OUT}" stroke-width="5"/><ellipse cx="74" cy="12" rx="16" ry="12" fill="#2a1a10"/>
  ${sl?`<path d="M -12 -8 q 14 12 28 0" stroke="${OUT}" stroke-width="6" fill="none" stroke-linecap="round"/>`:`<circle cx="4" cy="-14" r="13" fill="#17152e"/><circle cx="0" cy="-18" r="4" fill="#fff"/>`}
  ${sl?'':`<path d="M 40 50 q 14 30 34 4" fill="#ff8fab" stroke="${OUT}" stroke-width="4"/>`}
  <ellipse cx="-40" cy="-20" rx="26" ry="56" transform="rotate(-20 -40 -20)" fill="#8a5a2a" stroke="${OUT}" stroke-width="5"/></g>
  ${sl?[0,1,2].map(i=>{const u=((t*.4+i/3)%1);return T(240+u*60,-170-u*120,'z',40+i*8,'#fff',{op:n(1-u),flat:1})}).join(''):''}</g>`}
// ---------- sets ----------
function KIT(t,o={}){const pf=o.p||{},yf=o.y||{};
  const ch=PARTNER(Object.assign({x:600,y:905,face:.5,smile:.4,brow:0,open:blink(t,.3),mouth:partT(t),look:[.7,0]},pf))+YOU(Object.assign({x:1120,y:905,face:-.5,smile:.3,brow:.1,open:blink(t,.9),look:[-.7,0]},yf));
  return KITCHEN(t,{chars:ch})}
function BUS(t,o={}){let g=`<rect width="1920" height="1080" fill="#e8dcc6"/><rect x="0" y="150" width="1920" height="340" fill="#8ea4cc"/>`;
  g+=`<defs><clipPath id="busw"><rect x="0" y="150" width="1920" height="340"/></clipPath></defs><g clip-path="url(#busw)"><g transform="translate(${n(-((t*260)%960))},0)">${CITYMINI(0,200,960,290)}${CITYMINI(960,200,960,290)}${CITYMINI(1920,200,960,290)}</g></g>`;
  for(let i=0;i<6;i++)g+=`<rect x="${i*340}" y="150" width="40" height="340" fill="#d2c4aa"/>`;
  g+=`<rect x="0" y="120" width="1920" height="20" fill="#b9b2c8"/>`;for(let i=0;i<5;i++)g+=`<rect x="${180+i*400}" y="120" width="14" height="785" fill="#e8c34a" stroke="${OUT}" stroke-width="3"/>`;
  g+=`<rect x="0" y="${FLOOR}" width="1920" height="175" fill="#6d6780"/>`;
  const P=[[230,'#7fa86b',0],[520,'#3b4256',1],[1390,'#e88f5a',0],[1680,'#c27aa8',1]];
  P.forEach(([x,c,w],i)=>{g+=(w?WOMAN:MAN)(c,'#ffd36b',{x,y:905,s:.82,face:Math.sin(i*2)*.4,smile:-.1,brow:.3,open:blink(t,i*.7),aR:i%2?170:8,look:[Math.sin(i)*.5,-.7]})+NUM(x,topY(905,.82),o.vals?o.vals[i]:'',t,{s:.75,t0:o.t0})});
  g+=WOMAN('#2a3360','#ffd54d',{x:850,y:905,s:.9,face:.6,smile:o.her?-.5:-.1,brow:o.her?.9:.3,open:blink(t,.2),look:[.8,-.2]})+NUM(850,topY(905,.9),o.her?11:'',t,{s:.85,t0:o.her?o.hert0:o.t0});
  g+=YOU({x:1110,y:905,s:.9,face:-.6,smile:o.ys==null?.1:o.ys,brow:o.yb==null?.3:o.yb,open:blink(t,.5),look:[-.8,-.3]});
  if(o.seat)g+=`<g transform="translate(1110,${n(640+Math.sin(t*5)*6)})"><rect x="-150" y="-40" width="300" height="70" rx="14" fill="#ff5f5f" stroke="${OUT}" stroke-width="5"/>${T(0,14,'HER SEAT',40,'#fff',{flat:1})}</g>`;
  return g}
function OFF(t,ch){return OFFICE(t,{chars:ch})}
function MEETING(t,o={}){let g=OFFICE(t)+`<rect x="360" y="660" width="1200" height="60" rx="18" fill="#8a6a4c" stroke="${OUT}" stroke-width="6"/>`;
  const P=[[520,'#2a3360',0],[760,'#c27aa8',1],[1160,'#6b7a8a',0],[1400,'#e88f5a',1]];
  g+=`<g transform="translate(220,300) rotate(-4)"><rect x="-150" y="-110" width="300" height="220" fill="#ffe46b" stroke="${OUT}" stroke-width="5"/>${T(0,-20,'DON’T',54,'#3a2a10',{flat:1})}${T(0,50,'LOOK UP',54,'#3a2a10',{flat:1})}</g>`;
  P.forEach(([x,c,w],i)=>{g+=(w?WOMAN:MAN)(c,'#f3efe6',{x,y:905,s:.85,face:0,smile:-.2,brow:.5,open:.6,look:[0,1]})});
  g+=YOU({x:960,y:905,s:.85,face:0,smile:o.ys==null?-.2:o.ys,brow:.5,open:.6,aR:o.hand||8,look:[0,o.hand?-.3:1]});
  g+=`<rect x="340" y="700" width="1240" height="40" rx="14" fill="#6a4a3a"/>`;
  if(o.boss!=null)g+=NUM(520,topY(905,.85),o.boss,t,{s:.8});
  return g}
function CAFE(t,o={}){let g=`<rect width="1920" height="1080" fill="#6a4a3a"/>`+WINDOWLIGHT(660,110,600,380,'day',t)+GLOW(960,300,520,'#ffe9c2',.35)+`<rect x="0" y="${FLOOR}" width="1920" height="175" fill="#4a3226"/>`;
  for(let i=0;i<5;i++)g+=`<circle cx="${200+i*380}" cy="70" r="18" fill="#ffd36b"/>`+GLOW(200+i*380,70,60,'#ffd36b',.4);
  g+=WOMAN('#e88f5a','#ffd36b',Object.assign({x:680,y:905,face:.6,bun:0,bow:1,smile:.6,brow:0,open:blink(t,.3),look:[.8,0]},o.s||{}));
  g+=YOU(Object.assign({x:1240,y:905,face:-.6,smile:.5,brow:0,open:blink(t,.8),look:[-.8,0]},o.y||{}));
  g+=`<rect x="760" y="700" width="400" height="30" rx="12" fill="#f3efe6" stroke="${OUT}" stroke-width="6"/><rect x="940" y="730" width="40" height="175" fill="#3a2a20"/>`;
  g+=`<rect x="820" y="652" width="54" height="50" rx="10" fill="#fff" stroke="${OUT}" stroke-width="5"/><rect x="1040" y="652" width="54" height="50" rx="10" fill="#fff" stroke="${OUT}" stroke-width="5"/>`;
  if(o.sv!=null)g+=NUM(680,topY(905),o.sv,t,{s:.9,t0:o.st0,shake:o.shake});
  return g}
function HOUSE(t,o={}){let g=`<rect width="1920" height="1080" fill="url(#daysky)"/><rect x="200" y="160" width="1520" height="745" fill="#e7c9a8" stroke="${OUT}" stroke-width="7"/>`;
  g+=`<polygon points="140,170 960,-60 1780,170" fill="#a8473a" stroke="${OUT}" stroke-width="7"/>`;
  g+=`<rect x="780" y="380" width="360" height="525" fill="#3a2a40" stroke="${OUT}" stroke-width="7"/>`+GLOW(960,600,200,'#ffd9a8',.35);
  g+=WINDOWLIGHT(300,280,340,260,'day',t)+WINDOWLIGHT(1280,280,340,260,'day',t)+`<rect x="0" y="${FLOOR}" width="1920" height="175" fill="#7fa86b"/><rect x="700" y="${FLOOR}" width="520" height="30" fill="#b8a98f"/>`;
  const mx=o.mx==null?960:o.mx;
  if(o.mum!==0)g+=`<g opacity="${n(o.mum==null?1:o.mum)}">`+mother({x:mx,y:905,s:1,sw:'#c27aa8',sc:'#f3efe6',face:o.mf==null?.2:o.mf,smile:o.ms==null?.8:o.ms,brow:o.mb==null?-.2:o.mb,open:blink(t,.2),look:o.ml||[.5,0],aL:o.aL||8,aR:o.aR||8})+`</g>`;
  g+=YOU(Object.assign({x:1340,y:905,face:-.6,smile:.6,brow:0,open:blink(t,.6),look:[-.8,0]},o.y||{}));
  if(o.bx!=null)g+=MAN('#3a7bd5','#f3efe6',Object.assign({x:o.bx,y:905,face:-.6,smile:.5,brow:0,open:blink(t,.4),look:[-.8,0],walk:o.bwalk?t*8:null},o.b||{}));
  return g}
function BATH(t,o={}){let g=`<rect width="1920" height="1080" fill="#cfe3e6"/>`;for(let r=0;r<10;r++)for(let c=0;c<14;c++)g+=`<rect x="${c*140}" y="${r*110}" width="134" height="104" fill="#e3f1f2"/>`;
  g+=`<rect x="560" y="80" width="800" height="620" rx="30" fill="#8fb3c8" stroke="#f3efe6" stroke-width="24"/><defs><clipPath id="mir"><rect x="572" y="92" width="776" height="596" rx="20"/></clipPath></defs>`;
  g+=`<g clip-path="url(#mir)"><rect x="560" y="80" width="800" height="620" fill="#a9c9d9"/>`+YOU({x:960,y:860,s:.9,face:0,smile:o.rs==null?-.1:o.rs,brow:o.rb==null?.4:o.rb,open:blink(t,.4),aR:150,brush:1,look:[0,0]});
  if(o.v!=null)g+=NUM(960,topY(860,.9)+10,o.v,t,{s:.95,t0:o.t0,blur:o.blur});
  g+=`<path d="M 600 120 L 760 120 L 620 300 Z" fill="#fff" opacity=".18"/></g>`;
  g+=`<rect x="460" y="740" width="1000" height="60" rx="20" fill="#f3efe6" stroke="${OUT}" stroke-width="6"/><ellipse cx="960" cy="770" rx="160" ry="22" fill="#cfe3e6"/>`;
  g+=YOU({x:1400,y:1500,s:1.6,face:-.2,back:1,aR:150,brush:1});
  return g}
function PARTY(t,o={}){const night=o.night;let g=`<rect width="1920" height="1080" fill="${night?'#1b1636':'#4a2f5a'}"/>`+WINDOWLIGHT(760,120,400,300,'night',t);
  for(let i=0;i<18;i++){const x=40+i*108,y=70+Math.sin(i*.7)*26;g+=`<circle cx="${x}" cy="${n(y)}" r="9" fill="${['#ffd36b','#ff9db5','#9be7ff'][i%3]}" opacity="${night?.25:.95}"/>`}
  g+=`<path d="M 0 60 Q 240 120 480 70 Q 720 130 960 70 Q 1200 130 1440 70 Q 1680 130 1920 60" stroke="#2a2040" stroke-width="3" fill="none"/>`+`<rect x="0" y="${FLOOR}" width="1920" height="175" fill="${night?'#120f26':'#2f1f3a'}"/><ellipse cx="1120" cy="940" rx="330" ry="50" fill="${night?'#3a2a50':'#8a3a5a'}"/>`;
  if(o.dog!==0)g+=DOG(o.dx||1120,o.dy||930,o.ds||.75,t,{sleep:o.sleep});
  if(o.guests!==0){const G=[[170,'#7fa86b',0],[390,'#e88f5a',1],[1540,'#3b4256',0],[1760,'#c27aa8',1]];
    G.forEach(([x,c,w],i)=>{const v=o.gv?o.gv[i]:50;g+=(w?WOMAN:MAN)(c,'#ffd36b',{x,y:905,s:.82,face:x<960?.6:-.6,smile:o.relax?.8:.2,brow:o.relax?-.2:.4,open:blink(t,i),aR:o.relax&&i%2?120:8,look:[x<960?.8:-.8,0]})+NUM(x,topY(905,.82),v,t,{s:.72})})}
  return g}
// your shirt after the red wine
const WINE=(x,y,s,k)=>k<=0?'':`<g transform="translate(${x},${y}) scale(${s*k})"><path d="M -40 -200 C -70 -170 -60 -120 -30 -110 C -10 -90 30 -100 40 -130 C 70 -150 50 -210 10 -205 C -5 -225 -30 -220 -40 -200 Z" fill="#a8173a" opacity=".9"/><circle cx="50" cy="-90" r="10" fill="#a8173a"/></g>`;
function TRIO(t,u){let g=PLAIN('#3b2f5a','#0b0826')+dust(t);
  const P=[[400,'#3b4256',0,'I LOST MY JOB.',[[0,50],[.12,74]],1],[960,'#c27aa8',1,'I HATE THIS MUSIC.',[[0,50],[.35,77]],1],[1520,'#d9a03a',0,'MY NEW CAR HAS…',[[0,60],[.62,48],[.74,35],[.86,22]],0]];
  P.forEach(([x,c,w,s,keys,up],i)=>{const a=keys[1][0];if(u<a-.08)return;const v=VAL(u*10,keys.map(([q,b])=>[q*10,b]),1.2);
    g+=(w?WOMAN:MAN)(c,'#ffd36b',{x,y:945,s:.82,face:0,smile:up?.6:.9,brow:up?-.2:-.5,open:1,aR:up?8:140,look:[0,0]})+NUM(x,topY(945,.82),v,t,{s:.8})+T(x,1020,s,40,'#fff')+ARROW(x+150,topY(945,.82),up,up?'#8fe07a':'#ff5f5f',u*10,(a+.05)*10)});
  return g}
function RANK(t,u){let g=PLAIN('#2a2a4a','#05040f')+dust(t);const R=[['MUM',96],['SAM',93],['IT GUY',87],['BOSS',61],['COLLEAGUE',24],['YOU',21]];
  R.forEach(([nm,v],i)=>{const y=190+i*130,a=es(u,i*.1,i*.1+.25),me=nm==='YOU';g+=T(560,y+20,nm,46,me?'#ff5f5f':'#fff',{a:'end'})+`<rect x="600" y="${y-26}" width="${n(a*v*9)}" height="62" rx="14" fill="${NC(v)}"/>`+(a>.9?T(620+v*9,y+20,String(v),46,NC(v),{a:'start'}):'')});
  return g+T(960,1040,'HOW MUCH THEY LIKE YOU',36,'#9aa0b5',{flat:1,ls:4})}
function TEASE(t,u){let g=PLAIN('#2a1d4a','#05040f')+dust(t);[['WHO’S','FAKING IT'],['WHO’S','JEALOUS'],['WHOSE NUMBER','NEVER MOVES']].forEach((l,i)=>{if(u>.12+i*.27){const k=BO((u-.12-i*.27)*6);g+=`<g transform="translate(${480+i*480},540) scale(${n(k)})"><rect x="-210" y="-210" width="420" height="420" rx="40" fill="#14102e" stroke="${['#ff5f5f','#ffb84d','#ffe14d'][i]}" stroke-width="10"/>${T(0,-60,l[0],46,'#fff',{flat:1})}${T(0,10,l[1],50,['#ff5f5f','#ffb84d','#ffe14d'][i])}${T(0,140,'?',100,['#ff5f5f','#ffb84d','#ffe14d'][i])}</g>`}});return g}
function CROWD(t,u){let g=PLAIN('#3b2f5a','#0b0826')+dust(t);const xs=[240,480,720,960,1200,1440,1680],vals=[72,15,'',88,40,'',63];
  xs.forEach((x,i)=>{const y=880+(i%2)*60;g+=(i%2?WOMAN:MAN)(['#7fa86b','#e88f5a','#3b4256','#c27aa8','#6fb3d9','#d9a03a','#9a7fd9'][i],'#ffd36b',{x,y,s:.72,face:0,smile:.2,brow:.3,open:blink(t,i*.5),look:[0,-.5]})+NUM(x,topY(y,.72),vals[i],t,{s:.68,t0:V.n04.s+.5+((i*3)%7)*.35})});return g}
function FACEOFF(t,u){let g=PLAIN('#2a1d4a','#05040f')+dust(t);
  g+=YOU({x:620,y:960,s:1,face:.6,smile:.2,brow:.3,open:blink(t,.2),look:[.8,-.2]})+PARTNER({x:1300,y:960,face:-.6,smile:.2,brow:.3,open:blink(t,.8),look:[-.8,-.2]});
  g+=NUM(1300,topY(960,1.05),62,t,{s:.9})+NUM(620,topY(960),'?',t,{s:.9,t0:V.n05.s+.6,col:'#bfa8ff'});
  g+=TAG(1300,230,'YOU SEE THEIRS',NC(62),t,V.n05.s+.2,V.n05.e+.3)+TAG(620,230,'THEY SEE YOURS','#bfa8ff',t,V.n05.s+1.2,V.n05.e+.3);
  return g}
// the family group chat: phone in the middle, Auntie Pat left, Uncle Ray right
function CHAT(t,o={}){let g=PLAIN('#2a3a5a','#0b0826')+dust(t);
  if(o.aunt)g+=WOMAN('#e88f5a','#ffd36b',{x:330,y:1000,s:.95,face:.6,smile:1.1,brow:-.5,open:1,aR:150,aL:30+Math.sin(t*6)*10,mouth:o.am||0,look:[.8,0]})+(o.av!=null?NUM(330,topY(1000,.95),o.av,t,{s:.85,t0:o.at0}):'')+(o.al?TAG(330,1050,'LOUDEST','#ff9db5',t,o.al,o.al+30):'');
  if(o.unc)g+=MAN('#6b5a4a','#9aa0b5',{x:1590,y:1000,s:.95,face:-.6,smile:o.us==null?0:o.us,brow:o.ub==null?.2:o.ub,open:o.uo==null?.6:o.uo,mouth:o.um||0,look:[-.8,.4]})+(o.uv!=null?NUM(1590,topY(1000,.95),o.uv,t,{s:.85,t0:o.ut0,spark:o.uv>=95}):'')+(o.ql?TAG(1590,1050,'QUIETEST','#ffe14d',t,o.ql,o.ql+30):'');
  return g+PHONE(960,560,.95,t,{name:o.name,avatar:o.avc,msgs:o.msgs||[]})}
// a first date, seen through a restaurant window from the street
function DATEWIN(t,o={}){let g=`<rect width="1920" height="1080" fill="#1b1636"/>`;
  for(let r=0;r<14;r++)for(let c=0;c<17;c++)g+=`<rect x="${c*120+(r%2)*60-60}" y="${r*70}" width="114" height="64" fill="#2a2148"/>`;
  g+=`<defs><clipPath id="dwin"><rect x="300" y="130" width="1320" height="700" rx="12"/></clipPath></defs><g clip-path="url(#dwin)"><rect x="300" y="130" width="1320" height="700" fill="#6a3a3a"/>`+GLOW(960,560,420,'#ffb36b',.55);
  for(let i=0;i<9;i++)g+=`<circle cx="${380+i*150}" cy="180" r="10" fill="#ffd36b"/>`;
  const ms=o.ms==null?.1:o.ms,ws=o.ws==null?-.1:o.ws;
  g+=MAN('#3a7bd5','#f3efe6',{x:690,y:905,face:o.mf==null?-.3:o.mf,smile:ms,brow:o.mb==null?-.2:o.mb,open:o.mo==null?.75:o.mo,aR:o.phone?150:8,aL:o.lean?20:8,rot:o.lean?-6:0,mouth:o.mm||0,look:o.ml||[.2,.8]});
  if(o.phone)g+=`<rect x="742" y="470" width="56" height="96" rx="10" fill="#17151f" stroke="${OUT}" stroke-width="4"/><rect x="748" y="478" width="44" height="78" rx="6" fill="#9be7ff" opacity=".8"/>`;
  g+=WOMAN('#c0392b','#ffd36b',{x:1230,y:905,face:o.wf==null?.3:o.wf,bun:0,bow:1,smile:ws,brow:o.wb==null?-.2:o.wb,open:o.wo==null?.7:o.wo,aL:o.stir?120+Math.sin(t*5)*12:8,mouth:o.wm||0,look:o.wl||[-.2,.8]});
  g+=`<rect x="660" y="700" width="600" height="30" rx="12" fill="#f3efe6" stroke="${OUT}" stroke-width="6"/><rect x="940" y="730" width="40" height="120" fill="#3a2a20"/><rect x="950" y="630" width="20" height="70" fill="#fff6d8"/><ellipse cx="960" cy="${n(618+Math.sin(t*9)*2)}" rx="9" ry="16" fill="#ffd54d"/>`+GLOW(960,620,90,'#ffd54d',.5);
  if(o.v){g+=NUM(690,topY(905),84,t,{s:.8,t0:o.v[0]})+NUM(1230,topY(905),86,t,{s:.8,t0:o.v[1]});
    if(t>o.v[0]+.3)g+=T(690,topY(905)+88,'WHAT SHE SEES',28,'#fff');if(t>o.v[1]+.3)g+=T(1230,topY(905)+88,'WHAT HE SEES',28,'#fff')}
  if(o.hearts)for(let i=0;i<10;i++){const u=((t*.3+i/10)%1);g+=`<g opacity="${n(o.hearts*(1-u))}" transform="translate(${n(760+i*45+Math.sin(t*2+i)*30)},${n(640-u*420)}) scale(${n(.5+u*.4)})"><path d="M 0 30 C -50 0 -40 -40 -14 -34 C -6 -32 0 -24 0 -20 C 0 -24 6 -32 14 -34 C 40 -40 50 0 0 30 Z" fill="#ff5f8f"/></g>`}
  g+=`</g><rect x="300" y="130" width="1320" height="700" rx="12" fill="none" stroke="#3a2a20" stroke-width="22"/><rect x="280" y="830" width="1360" height="40" fill="#4a3a30" stroke="${OUT}" stroke-width="5"/>`;
  g+=`<path d="M 300 150 L 520 150 L 340 420 Z" fill="#fff" opacity=".07"/><rect x="0" y="960" width="1920" height="120" fill="#2a2440"/>`;
  g+=YOU({x:1760,y:1150,s:1.05,face:-.7,smile:o.ys==null?.1:o.ys,brow:o.yb==null?.3:o.yb,open:blink(t,.4),look:[-.9,-.2]});
  return g}
// ---------- shot list ----------
function SHOTS(){const S=[];const A=(s,d,c,f)=>S.push([s,d,c||[960,540,1.02,960,540,1.08],f||0]);
  const BED=o=>t=>CDEFS+BEDTOP(t,Object.assign({clock:'07:40'},o))+(o.pv!=null?NUM(590,150,o.pv,t,{s:.9,t0:o.pt0}):'');
  const pv0=t=>VAL(t,[[0,62]]);
  // cold open
  A(0,BED({pf:.1,popen:.1,yopen:blink(0,.5)}),[840,400,1.25,840,380,1.35],.8);
  A(at('p1'),t=>BED({pf:.2,popen:1,plook:[.8,0]})(t)+BUB(600,560,'Morning, you.',t,at('p1')+.1,{size:44}),[720,380,1.6,720,370,1.7]);
  A(at('n02'),t=>BED({pf:.2,popen:1,plook:[.8,0],pv:62,pt0:at('n02',.3)})(t),[600,320,1.3,600,250,1.9]);
  A(at('n03'),t=>CDEFS+PLAIN('#3b2f5a','#0b0826')+dust(t)+NUM(960,470,62,t,{s:2.4})+POP('OUT OF 100',960,800,80,'#fff',t,at('n03',.45)),[960,540,1.12,960,540,1.0]);
  A(at('n04'),t=>CDEFS+CROWD(t,U(t,'n04')),[960,560,1.0,960,520,1.1]);
  A(at('n05'),t=>CDEFS+FACEOFF(t,U(t,'n05')),[960,540,1.1,960,520,1.0]);
  A(at('n06'),t=>CDEFS+TEASE(t,U(t,'n06')),[960,540,1.06,960,540,1.0]);
  A(C.title,t=>{const u=(t-C.title)/1.8;return CDEFS+PLAIN('#2a1d4a','#05040f')+GLOW(960,540,500,'#ffe14d',.12)+POP('WHAT IF YOU COULD SEE',960,560,88,'#fff',u,0)+POP('HOW MUCH PEOPLE LIKE YOU?',960,690,104,'#ffe14d',u,.12)+NUM(960,330,VAL(u,[[0,0],[.15,62]],.5),t,{s:1.3,t0:C.title})},[960,540,1.15,960,540,1.0]);
  // 7:40 kitchen
  A(at('n07'),t=>CDEFS+KIT(t)+NUM(600,topY(905,1.05),62,t)+(t>at('n07',.7)?`<g transform="translate(820,${n(topY(905,1.05))}) rotate(-12) scale(${n(BO((t-at('n07',.7))/.3))})"><rect x="-80" y="-70" width="160" height="140" rx="16" fill="#fff" stroke="#ff5f5f" stroke-width="8"/>${T(0,34,'C−',96,'#ff5f5f',{flat:1})}</g>`:''),[700,420,1.35,700,400,1.5],.4);
  A(at('n08'),t=>CDEFS+KIT(t,{p:{look:[.6,-1],brow:.8,smile:-.2},y:{brow:.6,smile:0}})+NUM(600,topY(905,1.05),62,t)+NUM(1120,topY(905),'??',t,{blur:1,t0:at('n08',.35),col:'#ff9a5a'}),[960,420,1.15,960,400,1.25]);
  A(at('p2'),t=>CDEFS+KIT(t,{p:{look:[.7,0],brow:.9,smile:-.4,open:1}})+NUM(600,topY(905,1.05),62,t)+BUB(820,700,'Still annoyed about last night?',t,at('p2')+.1,{size:38}),[700,500,1.45,700,480,1.55]);
  A(at('n09'),t=>{const a=at('n09',.3),b=at('n09',.7);return CDEFS+KIT(t,{p:{smile:t>a&&t<b?.9:.2,brow:t>b?.6:-.2}})+NUM(600,topY(905,1.05),VAL(t,[[0,62],[a,65],[b,60]],.5),t)+TAG(900,300,'+3  COFFEE','#8fe07a',t,a,b)+TAG(900,300,'−5  CUP IN THE SINK','#ff5f5f',t,b)},[760,430,1.3,760,420,1.4]);
  A(at('n10'),t=>CDEFS+PLAIN('#3b2f5a','#0b0826')+dust(t)+POP('IT’S NOT LOVE.',960,460,110,'#fff',t,at('n10',.1))+POP('IT’S TODAY.',960,620,140,'#ffe14d',t,at('n10',.4)),[960,540,1.08,960,540,1.0]);
  // 8:30 bus
  A(at('n11'),t=>CDEFS+BUS(t,{vals:['','','',''],t0:at('n11',.6)}),[960,560,1.0,960,540,1.08],.3);
  A(at('n12'),t=>CDEFS+BUS(t,{her:1,hert0:at('n12',.12),seat:t>at('n12',.65),ys:-.3,yb:.9}),[980,480,1.45,980,470,1.55]);
  A(at('n13'),t=>CDEFS+BUS(t,{vals:['','','',''],her:t<at('n13',.2)}),[960,540,1.12,960,540,1.0]);
  A(at('n14'),t=>CDEFS+PLAIN('#3b2f5a','#0b0826')+dust(t)+POP('STRANGERS',960,470,130,'#fff',t,at('n14',.12))+POP('WEREN’T THINKING.',960,630,110,'#ffe14d',t,at('n14',.3)),[960,540,1.08,960,540,1.0]);
  // 9:15 office
  const BOSS=(t,o={})=>MAN('#2a3360','#ffd54d',Object.assign({x:700,y:905,face:.6,smile:1,brow:-.4,open:1,aR:110,mouth:one('k1')(t),look:[.8,0]},o));
  const ME=(o={})=>YOU(Object.assign({x:1260,y:905,face:-.6,smile:.3,brow:.1,open:1,look:[-.8,0]},o));
  A(at('n15'),t=>CDEFS+OFF(t,BOSS(t)+ME()),[960,520,1.1,900,500,1.2],.3);
  A(at('k1'),t=>CDEFS+OFF(t,BOSS(t)+ME())+BUB(700,180,'Great to see you!',t,at('k1')+.05,{size:44}),[760,420,1.45,760,410,1.55]);
  A(at('n16'),t=>CDEFS+OFF(t,BOSS(t)+ME({smile:-.1,brow:.6}))+NUM(700,topY(905),38,t,{t0:at('n16')}),[760,380,1.5,760,370,1.6]);
  const COL=(t,o={})=>WOMAN('#c27aa8','#f3efe6',Object.assign({x:700,y:905,face:.6,smile:1,brow:-.3,open:1,aR:150,mouth:one('l1')(t),look:[.8,0]},o));
  A(at('l1'),t=>CDEFS+OFF(t,COL(t)+ME())+BUB(700,180,'Love that idea!',t,at('l1')+.05,{size:44}),[760,440,1.4,760,430,1.5]);
  A(at('n17'),t=>CDEFS+OFF(t,COL(t)+ME({smile:-.2,brow:.7}))+NUM(700,topY(905),24,t,{t0:at('n17',.3)})+(t>at('n17',.55)?CARD(1240,190,['3 YEARS','OF COMPLIMENTS'],'#ff5f5f',t,at('n17',.55),4):''),[960,440,1.2,960,430,1.3]);
  const IT=(t,o={})=>MAN('#6b7a8a','#3b4256',Object.assign({x:700,y:905,s:.88,face:.4,smile:.1,brow:.6,open:.7,mouth:one('i1')(t),look:[.5,.6],head:6},o));
  A(at('n18'),t=>CDEFS+OFF(t,IT(t)+ME()),[960,520,1.1,800,520,1.3]);
  A(at('i1'),t=>CDEFS+OFF(t,IT(t)+ME())+BUB(700,260,'…morning.',t,at('i1')+.05,{size:40}),[720,480,1.6,720,470,1.7]);
  A(at('n19'),t=>CDEFS+OFF(t,IT(t,{look:[.8,0]})+ME({smile:0,brow:1.1,head:-6}))+NUM(700,topY(905,.88),87,t,{t0:at('n19'),spark:1})+POP('?',1260,330,140,'#fff',t,at('n19',.45)),[960,440,1.2,960,430,1.3]);
  A(at('n20'),t=>CDEFS+MEETING(t),[960,560,1.05,960,520,1.15]);
  A(at('n21'),t=>{const a=at('n21',.75);return CDEFS+MEETING(t,{hand:es(t,at('n21',.3),at('n21',.45))*160,ys:.4,boss:VAL(t,[[0,38],[a,61]],.7)})+TAG(760,330,'+23',NC(61),t,a+.3)},[760,480,1.25,700,470,1.4]);
  A(at('n22'),t=>CDEFS+PLAIN('#3b2f5a','#0b0826')+dust(t)+POP('“YOU’RE USEFUL',960,470,110,'#fff',t,at('n22',.12))+POP('TO ME.”',960,630,130,'#ffe14d',t,at('n22',.6)),[960,540,1.08,960,540,1.0]);
  // 12:30 lunch with Sam
  A(at('n23'),t=>CDEFS+CAFE(t,{sv:91,st0:at('n23',.25)}),[960,520,1.1,960,500,1.2],.3);
  A(at('n24'),t=>CDEFS+CAFE(t,{sv:91,y:{smile:1,brow:-.3,open:1,mouth:.3+.3*Math.abs(Math.sin(t*9))*(1-es(t,at('n24',.85),at('n24',.95))),aR:120}})+BUB(1240,180,'I got the flat!',t,at('n24',.4),{size:44}),[1100,460,1.3,1100,450,1.4]);
  A(at('s1'),t=>CDEFS+CAFE(t,{sv:91,s:{smile:1,brow:-.5,mouth:one('s1')(t),aL:150,aR:150}})+BUB(680,170,'That’s amazing!',t,at('s1')+.05,{size:44}),[760,440,1.4,760,430,1.5]);
  A(at('n25'),t=>{const a=at('n25',.15),b=at('n25',.45),c=at('n25',.75);return CDEFS+CAFE(t,{sv:VAL(t,[[0,91],[a,84],[b,79]],.5),s:{smile:1,brow:-.3},y:{smile:.2,brow:.6},shake:t>a&&t<c?2:0})+TAG(840,300,'−7','#ff5f5f',t,a,b)+TAG(840,300,'−5','#ff5f5f',t,b)},[700,380,1.6,700,360,1.75]);
  A(at('n26'),t=>CDEFS+CAFE(t,{sv:79,s:{smile:1.1,brow:.4,look:[.3*Math.sin(t*3),-.6]},y:{smile:-.1,brow:.8}}),[700,520,2.0,700,510,2.1]);
  A(at('n27'),t=>{const u=U(t,'n27');return CDEFS+PLAIN('#4a2a3a','#0b0612')+dust(t,'#ffb84d')+`<g transform="translate(960,${n(470+Math.sin(t*2)*8)}) scale(${n(1+.04*Math.sin(t*3))})"><path d="M 0 150 C -260 0 -200 -200 -70 -170 C -30 -160 0 -120 0 -100 C 0 -120 30 -160 70 -170 C 200 -200 260 0 0 150 Z" fill="#ff5f8f" stroke="${OUT}" stroke-width="10"/><path d="M 0 150 C 120 70 170 -20 150 -90" stroke="#4a8a3a" stroke-width="22" fill="none" stroke-linecap="round" opacity="${n(es(u,.3,.5))}"/></g>`+POP('LOVE',700,860,90,'#ff9db5',u*10,1)+POP('+ A LITTLE ENVY',1230,860,80,'#8fe07a',u*10,3.2)+POP('AT THE SAME TIME.',960,980,60,'#fff',u*10,6.5)},[960,540,1.08,960,540,1.0]);
  A(at('s2'),t=>CDEFS+CAFE(t,{sv:79,s:{smile:-.2,brow:.9,mouth:one('s2')(t),look:[.4,.6],head:8},y:{smile:.1,brow:.6}})+BUB(680,170,'Sorry. I’m just… stuck.',t,at('s2')+.4,{size:40}),[760,450,1.4,760,440,1.5]);
  A(at('n28'),t=>CDEFS+CAFE(t,{sv:VAL(t,[[0,79],[at('n28',.05),93]],.8),s:{smile:.7,brow:.2},y:{smile:.8,brow:-.2}})+TAG(880,250,'+14','#ffe14d',t,at('n28',.1)),[820,420,1.4,960,500,1.15]);
  // 15:00 mum's house
  A(at('n29'),t=>CDEFS+HOUSE(t)+NUM(960,topY(905),96,t,{t0:at('n29',.45)}),[1000,480,1.2,1000,460,1.3],.3);
  A(at('n30'),t=>CDEFS+HOUSE(t,{bx:lerp(2150,1640,es(t,at('n30'),at('n30',.6))),bwalk:t<at('n30',.6),b:{look:[-.8,-.8]},y:{look:[-.8,-.8]},ml:[0,0]})+NUM(960,topY(905),96,t),[1150,480,1.15,1200,460,1.2]);
  A(at('n31'),t=>CDEFS+HOUSE(t,{bx:1640,ms:.5,mb:.6,b:{look:[-.8,-.8]},y:{look:[-.8,-.8],smile:-.1,brow:.8}})+NUM(860,topY(905),96,t,{s:.85})+NUM(1080,topY(905),98,t,{s:.85,t0:at('n31',.1),spark:1})+T(860,topY(905)+80,'YOU',30,'#fff')+T(1080,topY(905)+80,'HIM',30,'#fff'),[970,330,1.6,970,320,1.75]);
  A(at('n32'),t=>{const u=U(t,'n32'),k=es(u,.55,.75);return CDEFS+HOUSE(t,{bx:1640,mf:lerp(.2,-.8,es(u,.5,.55)),ms:.3,mb:.5,mx:lerp(960,900,k),mum:1-k,b:{smile:.2,brow:.4},y:{smile:.1,brow:.5}})+(u>.8?TAG(960,560,'…','#fff',t,at('n32',.8)):'')},[960,560,1.05,960,540,1.12]);
  A(at('r1'),t=>CDEFS+HOUSE(t,{mum:0,bx:1580,b:{smile:1,brow:-.4,face:-.4,mouth:one('r1')(t),look:[-.8,0]},y:{smile:.6}})+BUB(1560,240,'Two points. I’ll take it.',t,at('r1')+.05,{size:40}),[1460,480,1.5,1460,470,1.6]);
  A(at('n33'),t=>{const a=at('n33',.5);return CDEFS+HOUSE(t,{mum:0,bx:1580,b:{smile:.8,brow:-.2,face:-.4},y:{smile:1.1,brow:-.3,open:t<a?.35:1,bob:t<a?-Math.abs(Math.sin(t*8))*8:0}})+NUM(1580,topY(905),97,t,{t0:a,spark:1})+(t>a+.6?CARD(1060,200,['HIGHER THAN','YOU’D EVER SAY'],'#ffe14d',t,a+.6,-3):'')},[1400,440,1.35,1400,420,1.45]);
  // 5 PM the family group chat
  const FAM=t=>{const b=at('n52');return [{at:b+.3,text:'Who took my charger??'},{at:b+1.1,text:'Happy birthday Dave!!'},{at:b+1.9,text:'LOL'},{at:b+2.6,text:'Dinner Sunday?'}].concat(t>=at('a1')?[{at:at('a1')+.1,text:'Love you all!! Big hugs!! ♥♥♥♥♥'}]:[])};
  const CH=o=>t=>CDEFS+CHAT(t,Object.assign({name:'FAMILY (43)',avc:'#e88f5a',msgs:FAM(t)},o));
  A(at('n52'),CH({}),[960,540,1.05,960,520,1.15],.3);
  A(at('a1'),t=>CH({aunt:1,am:one('a1')(t)})(t),[640,540,1.2,640,520,1.3]);
  A(at('n53'),t=>CH({aunt:1,av:34,at0:at('n53',.72)})(t)+TAG(560,250,'♥ x 11','#ff9db5',t,at('n53',.2),at('n53',.65)),[560,470,1.35,560,450,1.5]);
  A(at('n54'),t=>CH({aunt:1,av:34,unc:1,uv:90,ut0:at('n54',.78)})(t),[1300,470,1.3,1360,450,1.45]);
  A(at('n55'),t=>CH({aunt:1,av:34,unc:1,uv:90,al:at('n55',.05),ql:at('n55',.5)})(t),[960,540,1.05,960,540,1.0]);
  const PRIV=t=>{const m=[{at:at('n56',.5),me:1,text:'Thank you for always being there.'}];if(t>=at('n57',.3)&&t<at('w1'))m.push({at:at('n57',.3),text:'• • •'});if(t>=at('w1'))m.push({at:at('w1')+.1,text:'Always.'});return m};
  const PR=o=>t=>CDEFS+CHAT(t,Object.assign({name:'UNCLE RAY',avc:'#6b5a4a',unc:1,uv:90,msgs:PRIV(t)},o));
  A(at('n56'),PR({}),[1100,520,1.15,1100,500,1.25]);
  A(at('n57'),PR({}),[960,560,1.45,960,560,1.6]);
  A(at('w1'),t=>PR({um:one('w1')(t),us:.6,ub:-.1,uo:1})(t),[1300,480,1.35,1300,470,1.45]);
  A(at('n58'),t=>PR({us:.8,ub:-.2,uo:1,uv:VAL(t,[[0,90],[at('n58',.1),97]],.7)})(t)+TAG(1590,170,'+7','#ffe14d',t,at('n58',.2)),[1450,450,1.4,1450,430,1.5]);
  // 18:00 the mirror
  A(at('n34'),t=>CDEFS+BATH(t,{v:t>at('n34',.75)?'?':null,t0:at('n34',.75)}),[960,520,1.05,960,460,1.2],.4);
  A(at('n35'),t=>CDEFS+BATH(t,{v:'?',blur:1})+CARD(1540,300,['HOW MUCH','YOU LIKE YOURSELF'],'#ffe14d',t,at('n35',.2),4),[960,540,1.12,960,540,1.04]);
  A(at('n36'),t=>CDEFS+BATH(t,{v:21,t0:at('n36'),rs:-.3,rb:.9}),[960,420,1.4,960,380,1.75]);
  A(at('n37'),t=>CDEFS+RANK(t,U(t,'n37')),[960,540,1.02,960,540,1.06]);
  A(at('n38'),t=>CDEFS+PLAIN('#3b2f5a','#0b0826')+dust(t)+POP('YOU NEVER',960,470,120,'#fff',t,at('n38',.1))+POP('ONCE CHECKED.',960,630,130,'#ffe14d',t,at('n38',.55)),[960,540,1.08,960,540,1.0]);
  // 7 PM a first date through a window
  A(at('n59'),t=>CDEFS+DATEWIN(t,{phone:1,lean:1,stir:1}),[1100,560,1.0,1000,540,1.12],.3);
  A(at('n60'),t=>CDEFS+DATEWIN(t,{phone:1,lean:1,stir:1,ms:0,ws:-.2,mb:-.4,wb:-.3}),[960,520,1.25,960,500,1.35]);
  A(at('n61'),t=>CDEFS+DATEWIN(t,{phone:1,lean:1,stir:1,v:[at('n61',.15),at('n61',.6)]}),[960,450,1.3,960,430,1.4]);
  A(at('n62'),t=>CDEFS+DATEWIN(t,{phone:1,lean:1,stir:1,v:[-1,-1],mf:-.6,wf:.6,ml:[-.6,.6],wl:[.6,.6]})+(t>at('n62',.55)?CARD(960,960,['PLAY IT COOL','AND NOBODY CAN TURN YOU DOWN'],'#ff9db5',t,at('n62',.55)):''),[960,560,1.05,960,560,1.0]);
  A(at('n63'),t=>{const u=U(t,'n63');return CDEFS+DATEWIN(t,{phone:u<.5,stir:0,v:[-1,-1],wl:[-.5,-.9],wb:lerp(-.2,1.1,es(u,.3,.6)),wo:1.1,ws:lerp(-.1,.3,es(u,.5,.8)),ml:[.5,0]})},[1150,420,1.4,1150,400,1.6]);
  A(at('d1'),t=>CDEFS+DATEWIN(t,{v:[-1,-1],wf:-.3,ws:1.1,wb:-.4,wo:.4,wm:one('d1')(t),wl:[-.8,0],ml:[.8,-.6],mb:1,mo:1.1})+BUB(1230,200,'Oh, thank God.',t,at('d1')+.05,{size:42}),[1100,440,1.35,1100,430,1.45]);
  A(at('e1'),t=>CDEFS+DATEWIN(t,{v:[-1,-1],wf:-.3,ws:1.1,wb:-.3,mf:.3,ms:1.1,mb:-.3,mo:.4,mm:one('e1')(t),wl:[-.8,0],ml:[.8,0]})+BUB(690,200,'Me too. Me too.',t,at('e1')+.05,{size:42}),[820,440,1.35,820,430,1.45]);
  A(at('n64'),t=>CDEFS+DATEWIN(t,{v:[-1,-1],wf:-.4,ws:1,wb:-.2,mf:.4,ms:1,mb:-.2,wl:[-.8,0],ml:[.8,0],hearts:es(t,at('n64'),at('n64',.3)),ys:.8,yb:-.2}),[960,540,1.2,1100,560,1.0]);
  // 20:00 the party
  const YP=(t,o={})=>YOU(Object.assign({x:820,y:905,face:.2,smile:.3,brow:.3,open:blink(t,.5),aR:110,look:[.3,0]},o));
  A(at('n39'),t=>CDEFS+PARTY(t)+YP(t)+NUM(820,topY(905),50,t,{s:.72,col:'#bfa8ff'}),[960,520,1.05,960,520,1.12],.3);
  A(at('n40'),t=>{const u=U(t,'n40'),f=es(u,.3,.45);return CDEFS+PARTY(t,{dx:1000})+YP(t,{x:lerp(820,930,es(u,0,.35)),rot:f*28,bob:f*20,aR:lerp(110,170,f),aL:lerp(8,150,f),smile:lerp(.3,-.6,f),brow:lerp(.3,1.2,f),walk:u<.35?t*8:null})+WINE(lerp(820,930,es(u,0,.35)),905,1,es(u,.4,.55))+(u>.45?TAG(1000,420,'SPLASH','#ff5f8f',t,at('n40',.45)):'')},[960,560,1.15,960,540,1.25]);
  A(at('n41'),t=>{const a=at('n41',.15);return CDEFS+PARTY(t,{dx:1000,relax:t>a,gv:[0,1,2,3].map(i=>VAL(t,[[0,50],[a+i*.15,[71,78,69,82][i]]],.6))})+YP(t,{x:930,rot:0,smile:1,brow:-.3,aR:150,aL:30})+WINE(930,905,1,1)+[170,390,1540,1760].map((x,i)=>ARROW(x+120,topY(905,.82),1,'#8fe07a',t,a+i*.15+.4)).join('')},[960,520,1.12,960,520,1.0]);
  A(at('n42'),t=>CDEFS+TRIO(t,U(t,'n42')),[960,560,1.0,960,560,1.05]);
  A(at('n43'),t=>CDEFS+PLAIN('#4a3a2a','#140f0a')+dust(t,'#ffd54d')+POP('NOT FOR BEING PERFECT.',960,460,90,'#fff',t,at('n43',.1))+POP('FOR STOPPING',960,600,110,'#ffd54d',t,at('n43',.6))+POP('PRETENDING.',960,730,110,'#ffd54d',t,at('n43',.72)),[960,540,1.06,960,540,1.0]);
  // 23:59 bed
  const NB=o=>t=>CDEFS+BEDTOP(t,Object.assign({night:1,clock:'23:40'},o))+`<rect x="470" y="400" width="240" height="150" rx="10" fill="#c0392b" stroke="${OUT}" stroke-width="6" transform="rotate(-6 590 475)"/>`;
  A(at('n44'),t=>NB({pf:.1,popen:.7,plook:[0,.6]})(t)+NUM(590,150,'?',t,{s:.9,col:'#9aa0b5'}),[840,380,1.25,700,320,1.45],.5);
  A(at('n45'),t=>{const u=U(t,'n45');return NB({pf:.1,popen:.8,plook:[.6,0],y:{mouth:.25+.25*Math.abs(Math.sin(t*9))}})(t)+TAG(1300,200,'I’VE BEEN TIRED.','#fff',t,at('n45',.3),at('n45',.5))+TAG(1300,200,'I’M WORRIED ABOUT MONEY.','#fff',t,at('n45',.5),at('n45',.72))+TAG(1300,200,'I DIDN’T MEAN IT.','#ffe14d',t,at('n45',.72),at('n45')+40)},[1000,380,1.3,1000,370,1.4]);
  A(at('n46'),t=>NB({pf:.4,popen:1,plook:[.9,0],yopen:.1})(t)+NUM(590,150,'?',t,{s:.9,col:'#ffe14d',op:.6}),[1090,400,1.6,1090,400,1.7]);
  A(at('p3'),t=>NB({pf:.4,popen:1,plook:[.9,0],yopen:.1})(t)+BUB(720,620,'Thank you for telling me.',t,at('p3')+.1,{size:40})+GLOW(590,150,140,'#ffe14d',.35*es(t,at('p3'),at('p3')+1)),[860,420,1.4,860,410,1.5]);
  A(at('n47'),t=>{const u=U(t,'n47'),off=es(u,.45,.55);let g=CDEFS+CITYBIG(t,1,true);for(let i=0;i<24;i++){const x=80+(i*331)%1760,y=200+(i*197)%560;g+=NUM(x,y,[62,93,11,87,24,96,50,71][i%8],t,{s:.32,k:1-off})}
    g+=`<g transform="translate(960,540)"><rect x="-260" y="-110" width="520" height="220" rx="30" fill="#05040f" opacity=".85" stroke="#ff5f5f" stroke-width="6"/>${T(0,40,u<.45?'23:59':'00:00',130,'#ff5f5f',{flat:1,ls:6})}</g>`;return g+`<rect width="1920" height="1080" fill="#fff" opacity="${n(pulse(u,.44,.62,.08)*.6)}"/>`},[960,540,1.0,960,540,1.12]);
  A(at('n48'),t=>{const u=U(t,'n48');return CDEFS+PARTY(t,{night:1,guests:0,dx:960,dy:930,ds:1,sleep:1})+NUM(1090,600,100,t,{s:.9})+CARD(400,330,['100','WHEN YOU WOKE UP'],'#ffe14d',t,at('n48',.4),-5)+CARD(1520,330,['100','WHEN YOU CAME HOME LATE'],'#ffe14d',t,at('n48',.6),4)+(u>.8?CARD(960,190,['100','WHEN YOU TRIPPED OVER HIM'],'#ffe14d',t,at('n48',.8),-2):'')},[960,560,1.0,960,560,1.04],.5);
  A(at('n49'),t=>{const u=U(t,'n49');return CDEFS+PARTY(t,{night:1,guests:0,dx:960,dy:930,ds:1.2,sleep:u<.25})+NUM(1110,520,100,t,{s:1,k:1-es(u,.6,.8)})+POP('HE NEVER NEEDED A NUMBER.',960,560,70,'#ffe14d',t,at('n49',.75))},[1060,600,1.5,960,520,1.1]);
  A(at('n50'),t=>{const u=U(t,'n50');return CDEFS+PLAIN('#3b2f5a','#0b0826')+dust(t)+NUM(960,280,100,t,{s:1.4,t0:at('n50')})+POP('WHO GIVES YOU 100?',960,560,100,'#ffe14d',t,at('n50',.15))+POP('WHOSE NUMBER WOULD SCARE YOU?',960,700,70,'#fff',t,at('n50',.4))+POP('TELL ME IN THE COMMENTS',960,860,56,'#bfa8ff',t,at('n50',.8))},[960,540,1.06,960,540,1.0]);
  A(at('n51'),t=>CDEFS+PLAIN('#4a3a2a','#140f0a')+dust(t,'#ffd54d')+POP('SEND THIS TO THEM.',960,480,110,'#fff',t,at('n51',.05))+NUM(960,700,VAL(t,[[0,62],[at('n51',.6),100]],1.2),t,{s:1.1,t0:at('n51',.6)}),[960,540,1.06,960,540,1.0]);
  return S}
let SHOTL=null;
function camT(c,u){const k=E(u),z=lerp(c[2],c[5],k);let cx=lerp(c[0],c[3],k),cy=lerp(c[1],c[4],k);cx=cl(cx,960/z,1920-960/z);cy=cl(cy,540/z,1080-540/z);return `translate(960,540) scale(${z.toFixed(4)}) translate(${n(-cx)},${n(-cy)})`}
const STAMPS=()=>[[at('n07'),'7:40 AM'],[at('n11'),'8:30 AM'],[at('n15'),'9:15 AM'],[at('n23'),'12:30 PM'],[at('n29'),'3:00 PM'],[at('n52'),'5:00 PM'],[at('n34'),'6:00 PM'],[at('n59'),'7:00 PM'],[at('n39'),'8:00 PM'],[at('n44'),'11:40 PM']];
window.renderAt=function(t){
  if(!SHOTL)SHOTL=SHOTS().sort((a,b)=>a[0]-b[0]);
  let i=0;while(i<SHOTL.length-1&&t>=SHOTL[i+1][0])i++;
  const [s,draw,cam,fade]=SHOTL[i],e=i<SHOTL.length-1?SHOTL[i+1][0]:D.total,u=cl((t-s)/Math.max(.1,e-s));
  let g=DEFS+`<g transform="${camT(cam,u)}">${draw(t,u)}</g>`;
  if(fade)g+=`<rect width="1920" height="1080" fill="#05040f" opacity="${n(1-es(t,s,s+fade))}"/>`;
  g+=`<rect width="1920" height="1080" fill="url(#vig)"/>`;
  g+=stamp(t,STAMPS());
  const ea=es(t,C.end,C.end+.5);if(ea>0)g+=`<g opacity="${n(ea)}"><rect width="1920" height="1080" fill="#08071a"/>${T(960,500,'FOLLOW',130,'#fff')}${T(960,640,'FOR MORE WHAT IFs',76,'#ffe14d')}</g>`;
  g+=`<rect width="1920" height="1080" fill="#000" opacity="${n(es(t,D.total-.7,D.total-.1))}"/>`;
  document.getElementById('s').innerHTML=g;
};
window.DATA={fps:D.fps,total:D.total};
window.ready=document.fonts.load('600 40px Fredoka').then(()=>{renderAt(+(new URLSearchParams(location.search).get('t')||0));return true});
