/* ===== What if you could control everything? ===== */
// the remote. on: index of the glowing button (0 rewind, 1 pause, 2 mute, 3 skip)
function ICON(i,c='#fff'){if(i===0)return `<polygon points="-4,-16 -28,0 -4,16" fill="${c}"/><polygon points="20,-16 -4,0 20,16" fill="${c}"/>`;
  if(i===1)return `<rect x="-16" y="-16" width="11" height="32" rx="3" fill="${c}"/><rect x="5" y="-16" width="11" height="32" rx="3" fill="${c}"/>`;
  if(i===2)return `<path d="M -20 -7 L -10 -7 L 2 -18 L 2 18 L -10 7 L -20 7 Z" fill="${c}"/><path d="M 9 -9 L 23 9 M 23 -9 L 9 9" stroke="#ff5f5f" stroke-width="5" stroke-linecap="round"/>`;
  return `<polygon points="-22,-16 -2,0 -22,16" fill="${c}"/><polygon points="-2,-16 18,0 -2,16" fill="${c}"/><rect x="18" y="-16" width="6" height="32" fill="${c}"/>`}
const BTNC=['#7fd0ff','#ffd54d','#ff5f8f','#8fe07a'],BTNN=['REWIND','PAUSE','MUTE','SKIP'];
function REMOTE(x,y,s,t,o={}){let g=`<g transform="translate(${n(x)},${n(y)}) rotate(${o.rot||0}) scale(${s})"><rect x="-90" y="-230" width="180" height="460" rx="60" fill="#1d1b2a" stroke="${OUT}" stroke-width="8"/><rect x="-70" y="-205" width="140" height="40" rx="14" fill="#2a2840"/><circle cx="0" cy="-185" r="9" fill="${o.on!=null?'#ff3b3b':'#4a2030'}"/>`;
  for(let i=0;i<4;i++){const bx=(i%2?44:-44),by=-90+Math.floor(i/2)*120,on=o.on===i,c=BTNC[i];g+=`<g transform="translate(${bx},${by}) scale(${on?.9:1})">${on?`<circle r="62" fill="${c}" opacity=".35" filter="url(#blur6)"/>`:''}<circle r="44" fill="${on?c:'#34324a'}" stroke="${c}" stroke-width="6"/><g transform="scale(1.1)">${ICON(i,on?'#14102e':'#fff')}</g></g>`;if(o.labels)g+=T(bx,by+78,BTNN[i],22,c,{flat:1})}
  g+=`<rect x="-60" y="150" width="120" height="14" rx="7" fill="#34324a"/><rect x="-60" y="180" width="120" height="14" rx="7" fill="#34324a"/>`;
  return g+`</g>`}
// small remote held at a hand point
const HREM=(x,y,s,t,on)=>REMOTE(x+6,y-30,.22*s,t,{on,rot:-12});
// screen overlays
function OSDBIG(t,txt,c){return `<g transform="translate(70,90)"><rect x="-20" y="-50" width="${txt.length*34+60}" height="74" rx="12" fill="#05040f" opacity=".55"/>${T(10,8,txt,52,c,{a:'start',flat:1,ls:4})}</g>`}
function REWFX(t){let g='';for(let i=0;i<9;i++){const y=((i*131+t*900)%1140)-30;g+=`<rect x="0" y="${n(y)}" width="1920" height="${6+i%3*6}" fill="#fff" opacity=".12"/>`}return g+`<rect width="1920" height="1080" fill="#7fd0ff" opacity=".08"/>`+OSDBIG(t,'◀◀ REW','#7fd0ff')}
function FFFX(t,lbl='▶▶ ×16'){let g='';for(let i=0;i<14;i++){const x=((i*173-t*4000)%2200+2200)%2200-140,y=60+(i*71)%960;g+=`<rect x="${n(x)}" y="${y}" width="${180+i%3*80}" height="4" rx="2" fill="#fff" opacity=".35"/>`}return g+OSDBIG(t,lbl,'#8fe07a')}
function PAUSEFX(t){return `<g opacity=".9"><rect x="1680" y="60" width="44" height="140" rx="10" fill="#fff"/><rect x="1750" y="60" width="44" height="140" rx="10" fill="#fff"/></g>`+OSDBIG(t,'❚❚ PAUSED','#ffd54d')}
function MUTEICON(x,y,s,t,t0){if(t<t0)return '';const k=BO((t-t0)/.3);return `<g transform="translate(${n(x)},${n(y)}) scale(${n(s*k)})"><circle r="54" fill="#14102e" stroke="#ff5f8f" stroke-width="6"/><g transform="scale(1.6)">${ICON(2)}</g></g>`}
function SHADES(x,y,s){const hy=y-362*s-12*s;return `<rect x="${n(x-82*s)}" y="${n(hy-24*s)}" width="${n(70*s)}" height="${n(44*s)}" rx="${n(12*s)}" fill="#05040f"/><rect x="${n(x+12*s)}" y="${n(hy-24*s)}" width="${n(70*s)}" height="${n(44*s)}" rx="${n(12*s)}" fill="#05040f"/><rect x="${n(x-12*s)}" y="${n(hy-12*s)}" width="${n(24*s)}" height="${n(8*s)}" fill="#05040f"/><path d="M ${n(x-70*s)} ${n(hy-14*s)} l ${n(20*s)} 0" stroke="#fff" stroke-width="${n(5*s)}" opacity=".6"/>`}
const BLUSH=(x,y,s,k)=>k<=0?'':`<ellipse cx="${n(x-52*s)}" cy="${n(y-340*s)}" rx="${n(34*s)}" ry="${n(20*s)}" fill="#ff3b5f" opacity="${n(.7*k)}"/><ellipse cx="${n(x+52*s)}" cy="${n(y-340*s)}" rx="${n(34*s)}" ry="${n(20*s)}" fill="#ff3b5f" opacity="${n(.7*k)}"/>`;
// ---------- sets ----------
function OFFC(t,o={}){let g=OFFICE(t);const P=[[300,'#7fa86b',0],[620,'#c27aa8',1],[1500,'#3b4256',0],[1760,'#e88f5a',1]];
  P.forEach(([x,c,w],i)=>{g+=(w?WOMAN:MAN)(c,'#ffd36b',{x,y:905,s:.85,face:x<960?.5:-.5,smile:o.shock?-.6:o.admire?1:.2,brow:o.shock?1.2:o.admire?-.3:0,open:o.shock?1.15:o.glazed?.35:blink(t,i),look:[x<960?.8:-.8,0]})+(o.admire&&t>o.admire?`<g transform="translate(${x},${n(380-((t*40+i*30)%120))})"><path d="M 0 30 C -50 0 -40 -40 -14 -34 C -6 -32 0 -24 0 -20 C 0 -24 6 -32 14 -34 C 40 -40 50 0 0 30 Z" fill="#ff5f8f" transform="scale(.5)"/></g>`:'')});
  const f=o.fall||0;g+=YOU(Object.assign({x:960+f*60,y:905+f*40,face:0,smile:lerp(.3,-.6,f),brow:lerp(0,1.2,f),open:lerp(1,1.15,f),rot:f*70,aL:lerp(30,160,f),aR:lerp(60,170,f),look:[0,0]},o.y||{}));
  if(f<.05)g+=`<rect x="${n(1040)}" y="${n(660)}" width="44" height="54" rx="8" fill="#fff" stroke="${OUT}" stroke-width="5"/><ellipse cx="1062" cy="666" rx="18" ry="6" fill="#6a3a1a"/>`;
  if(f>.3){const k=es(f,.3,1);g+=`<g transform="translate(1200,${n(700-k*80)}) rotate(${n(k*200)})"><rect x="-22" y="-27" width="44" height="54" rx="8" fill="#fff" stroke="${OUT}" stroke-width="5"/></g><path d="M 1000 760 C 1080 640 1240 640 1320 780 C 1260 820 1060 840 1000 760 Z" fill="#6a3a1a" opacity="${n(k*.9)}" transform="translate(${n(1160-1160*k)},0) scale(${n(k)},1)"/>`;for(let i=0;i<8;i++)g+=`<circle cx="${n(1100+i*40)}" cy="${n(760-k*120*Math.sin(i))}" r="${8+i%3*4}" fill="#6a3a1a" opacity="${n(k)}"/>`}
  if(o.y&&o.y.shades)g+=SHADES(960,905,1);
  return g}
function TRAINC(t,o={}){let g=`<rect width="1920" height="1080" fill="#cfd8e6"/><rect x="0" y="140" width="1920" height="320" fill="#8ea4cc"/><defs><clipPath id="trw"><rect x="0" y="140" width="1920" height="320"/></clipPath></defs><g clip-path="url(#trw)"><g transform="translate(${n(o.paused?0:-((t*400)%960))},0)">${CITYMINI(0,180,960,280)}${CITYMINI(960,180,960,280)}${CITYMINI(1920,180,960,280)}</g></g>`;
  for(let i=0;i<5;i++)g+=`<rect x="${i*420}" y="140" width="50" height="320" fill="#b9c3d6"/>`;g+=`<rect x="0" y="${FLOOR}" width="1920" height="175" fill="#8d8aa0"/>`;
  const S=Object.assign({x:520,y:905,face:.4,smile:.4,brow:-.2,open:1,aR:150,mouth:o.loud?.3+.4*Math.abs(Math.sin(t*12)):0,look:[.5,0]},o.s||{});g+=MAN('#c0392b','#3b4256',S)+PHONEAT(S.x,S.y,1);
  if(o.loud&&!o.muted)for(let k=0;k<3;k++){const u=((t*1.5+k/3)%1);g+=`<path d="M ${n(640+u*120)} ${n(400-u*60)} q 30 50 0 100" stroke="#ff5f5f" stroke-width="8" fill="none" opacity="${n(1-u)}"/>`}
  g+=WOMAN('#6fb3d9','#f3efe6',Object.assign({x:960,y:905,face:-.2,smile:o.smiles?.9:-.2,brow:o.smiles?-.3:.6,open:blink(t,.3),look:[-.5,0]},o.w||{}));
  g+=YOU(Object.assign({x:1420,y:905,face:-.5,smile:o.smug?1:.1,brow:o.smug?-.4:.3,open:blink(t,.8),aR:o.rem?100:8,look:[-.8,0]},o.y||{}));if(o.rem){const [hx,hy]=HANDP(1420,905,1,1,100);g+=HREM(hx,hy,1,t,o.rem)}
  if(o.crier)g+=WOMAN('#9a7fd9','#ffd36b',{x:1760,y:905,s:.9,face:-.4,smile:-.6,brow:1,open:.5,aR:150,look:[-.2,.4]})+PHONEAT(1760,905,.9)+TEARS(1760,905,.9,-.4,t,1);
  if(o.muted)g+=MUTEICON(520,230,1,t,o.muted);
  return g}
function BEDC(t,o={}){let g=BEDRM(t,Object.assign({n:0,aR:o.aR==null?30:o.aR},o));
  g+=`<g transform="translate(1440,700)"><rect x="-90" y="-60" width="180" height="120" rx="18" fill="#2a2240" stroke="${OUT}" stroke-width="5"/><rect x="-74" y="-44" width="148" height="70" rx="10" fill="#0b0814"/>${T(0,10,'07:00',52,o.ring&&Math.floor(t*4)%2?'#ff5f5f':'#ff9a9a',{flat:1})}</g><rect x="1380" y="760" width="120" height="145" fill="#6a4a3a" stroke="${OUT}" stroke-width="5"/>`;
  if(o.ring)for(let k=0;k<3;k++){const u=((t*2+k/3)%1);g+=`<path d="M ${n(1540+u*60)} ${n(640-u*30)} q 25 40 0 80" stroke="#ff5f5f" stroke-width="7" fill="none" opacity="${n(1-u)}"/>`}
  return g}
function KITC(t,o={}){const ch=(o.partner?PARTNER(Object.assign({x:600,y:905,face:.5,smile:.2,brow:.2,open:o.frozen?.5:blink(t,.3),look:[.7,0],aL:o.yawn?160:8,mouth:o.yawn?.8:0},o.p||{})):'')+YOU(Object.assign({x:1120,y:905,face:-.5,smile:.6,brow:-.1,open:blink(t,.9),aL:o.book?100:8,look:[-.7,.3]},o.y||{}));
  let g=KITCHEN(t,{chars:ch});if(o.breakfast)g+=`<ellipse cx="1000" cy="712" rx="70" ry="16" fill="#fff" stroke="${OUT}" stroke-width="4"/><ellipse cx="985" cy="706" rx="22" ry="12" fill="#fff"/><circle cx="985" cy="706" r="9" fill="#ffc84d"/><rect x="1005" y="700" width="40" height="10" rx="4" fill="#c0573a"/>`;
  if(o.book)g+=`<g transform="translate(1000,620) rotate(-8)"><rect x="-60" y="-40" width="120" height="80" fill="#3a7bd5" stroke="${OUT}" stroke-width="4"/><line x1="0" y1="-40" x2="0" y2="40" stroke="${OUT}" stroke-width="3"/></g>`;
  if(o.cat)g+=CAT(1700,905,.75,t,o.cat);
  return g}
function MEETC(t,o={}){let g=`<rect width="1920" height="1080" fill="#cfc8e0"/><rect x="120" y="120" width="760" height="460" rx="14" fill="#fff" stroke="${OUT}" stroke-width="7"/><rect x="120" y="120" width="760" height="90" rx="14" fill="#7fa86b"/>${T(500,182,'Quarterly Spreadsheet Alignment',38,'#fff',{flat:1})}${T(500,360,'Slide '+(o.slide||1)+' of 84',56,OUT,{flat:1})}<rect x="0" y="${FLOOR}" width="1920" height="175" fill="#a89fbe"/>`;
  g+=MAN('#7fa86b','#f3efe6',Object.assign({x:1060,y:905,face:-.4,smile:-.1,brow:.2,open:.7,aL:150,mouth:o.gm||0,look:[-.6,0]},o.g||{}));
  const A=[[420,'#c27aa8',1],[800,'#e88f5a',0],[1240,'#f3efe6',2],[1620,'#6fb3d9',1]];
  A.forEach(([x,c,w],i)=>{const me=w===2,q={x,y:1330,s:1.25,face:0,back:1};g+=me?YOU(q):(w?WOMAN:MAN)(c,'#ffd36b',q)});
  if(o.faces){[[420,'#c27aa8',1],[800,'#e88f5a',0],[1620,'#6fb3d9',1]].forEach(([x,c,w])=>{g+=(w?WOMAN:MAN)(c,'#ffd36b',{x,y:1330,s:1.25,face:0,smile:-.2,brow:.4,open:.25,look:[0,0]})});g+=YOU({x:1240,y:1330,s:1.25,face:0,smile:1,brow:-.3,open:1,look:[0,0]})}
  return g}
function FAMC(t,u){let g=`<rect width="1920" height="1080" fill="#e8c9a8"/><rect x="0" y="${FLOOR}" width="1920" height="175" fill="#b98a5a"/>`;
  g+=MAN('#3b4256','#c9b8a0',{x:420,y:905,face:.5,smile:-.4,brow:.8,open:1,mouth:.3+.3*Math.abs(Math.sin(t*9)),aR:100,look:[.7,0]})+mother({x:700,y:905,s:1,sw:'#c27aa8',sc:'#f3efe6',face:.5,smile:-.4,brow:.8,open:1,mouth:.3+.3*Math.abs(Math.sin(t*9+1)),aR:100,look:[.7,0]});
  g+=girl({x:1260,y:905,s:.75,face:-.5,smile:-.4,brow:.8,open:1,mouth:.3+.3*Math.abs(Math.sin(t*10)),aL:100,look:[-.7,0]})+char({x:1520,y:905,s:.7,face:-.5,smile:-.4,brow:.8,open:1,mouth:.3+.3*Math.abs(Math.sin(t*10+2)),aL:100,look:[-.7,0]});
  [[420,250],[700,250],[1260,360],[1520,380]].forEach(([x,y],i)=>{g+=MUTEICON(x,y,.9,t,V.n27.s+.1+i*.25)});
  return g+CAT(960,905,.7,t,{look:[0,-.3]})}
function FOOTY(t,u){let g=`<rect width="1920" height="1080" fill="#5aa860"/><rect x="0" y="0" width="1920" height="300" fill="#2a3a5a"/>`;for(let i=0;i<40;i++)g+=`<circle cx="${30+i*48}" cy="${200+(i%3)*30}" r="16" fill="${['#ff5f5f','#fff','#ffd54d'][i%3]}" opacity=".6"/>`;
  g+=`<rect x="560" y="300" width="800" height="300" fill="none" stroke="#fff" stroke-width="16"/><rect x="560" y="300" width="800" height="300" fill="url(#beam)" opacity=".15"/>`;
  const k=(t*1.4)%1;g+=`<circle cx="${n(lerp(960,1200,k))}" cy="${n(lerp(900,420,k))}" r="${n(lerp(40,22,k))}" fill="#fff" stroke="${OUT}" stroke-width="5"/>`;
  g+=MAN('#c0392b','#fff',{x:860,y:1010,s:1,face:.3,smile:-.3,brow:.8,open:1,aR:60,look:[.4,-.5]});
  const tk=Math.min(300,Math.floor(Math.pow(es(u,0,.9),2)*300)+1);return g+`<g transform="translate(1600,120)"><rect x="-230" y="-55" width="460" height="100" rx="18" fill="#05040f" opacity=".8"/>${T(0,14,'TAKE #'+tk,56,'#7fd0ff')}</g>`}
function POLIT(t,u){let g=`<rect width="1920" height="1080" fill="#2a3360"/><rect x="0" y="${FLOOR}" width="1920" height="175" fill="#1a2040"/><rect x="820" y="560" width="280" height="345" fill="#8a6a4c" stroke="${OUT}" stroke-width="7"/>`;
  g+=MAN('#1d1d26','#c0392b',{x:960,y:780,s:.9,face:0,smile:.9,brow:-.4,open:1,aR:120,look:[0,0]});
  for(let i=0;i<6;i++){const x=180+i*(i<3?190:190)+(i>=3?620:0);g+=(i%2?WOMAN:MAN)(['#7fa86b','#e88f5a','#c27aa8','#6fb3d9','#d9a03a','#9a7fd9'][i],'#ffd36b',{x,y:1040,s:.8,face:x<960?.5:-.5,smile:-.3,brow:.7,open:1,aR:130,mouth:.4,look:[x<960?.8:-.8,-.4]})+MUTEICON(x,560,.7,t,V.n29.s+.15+i*.12)}
  return g}
function MOTOR(t,u){let g=`<g filter="url(#gray)"><rect width="1920" height="1080" fill="url(#daysky)"/><rect x="0" y="620" width="1920" height="460" fill="#5a5870"/>`;for(let i=0;i<8;i++)g+=`<rect x="${i*260}" y="840" width="140" height="16" fill="#fff"/>`;
  for(let r=0;r<2;r++)for(let i=0;i<5;i++)g+=CAR(160+i*400+r*200,760+r*170,['#3a7bd5','#c0392b','#7fa86b','#d9a03a','#9a7fd9'][(i+r)%5],.8);g+=`</g>`;
  g+=CAR(960,930,'#ff5f8f',.9)+MAN('#e88f5a','#3b4256',{x:960,y:780,s:.8,face:0,smile:1,brow:-.3,open:.4,aR:130,mouth:.2+.2*Math.abs(Math.sin(t*6)),look:[0,0]})+`<g transform="translate(1030,520)"><rect x="-40" y="-20" width="80" height="40" rx="12" fill="#f3c27a" stroke="${OUT}" stroke-width="4"/><rect x="-36" y="-6" width="72" height="10" fill="#7fa86b"/></g>`;
  return g}
function CATWALK(t,u,o={}){let g=`<g filter="url(#gray)"><rect width="1920" height="1080" fill="#e8c9a8"/><rect x="0" y="${FLOOR}" width="1920" height="175" fill="#b98a5a"/>`+YOU({x:1500,y:905,face:-.6,smile:-.2,brow:1,open:1,aL:110,look:[-.8,0]})+`</g>`;
  const [hx,hy]=HANDP(1500,905,1,-1,110);g+=HREM(hx,hy,1,t,o.btn);
  const cx=lerp(200,1050,u);g+=CAT(cx,905,1.1,t,{look:[.8,-.2]});
  if(o.meow)g+=POP('MEOW!!',cx+60,520,90+40*es(u,.5,.9),'#ff5f8f',u*10,o.meow*10);
  return g}
function MUTEHOME(t,u){let g=SOFAU(t,{cat:0,aR:8,y:{smile:-.2,brow:.6,look:[0,.3]}});[['NEIGHBOURS',300,260],['TRAFFIC',760,200],['GROUP CHAT',1320,260],['MUM',1650,420]].forEach(([s,x,y],i)=>{const t0=V.n34.s+.2+i*.35;g+=MUTEICON(x,y,.9,t,t0)+(t>t0?T(x,y+90,s,30,'#fff'):'')});return g}
function DRAWER(t,u){let g=PLAIN('#4a3a2a','#140f0a')+`<rect x="460" y="420" width="1000" height="420" rx="20" fill="#8a5a3a" stroke="${OUT}" stroke-width="8"/>`;const k=es(u,.3,.8);g+=`<g transform="translate(0,${n(-180*(1-k))})"><rect x="500" y="${n(440+0)}" width="920" height="300" fill="#6a4a2a"/>`+REMOTE(960,600,.5,t,{rot:-80})+`</g><rect x="460" y="${n(420+300*(1-k)*0)}" width="1000" height="${n(120)}" rx="16" fill="#a8704a" stroke="${OUT}" stroke-width="7" transform="translate(0,${n(-240*(1-k))})"/><rect x="900" y="${n(470-240*(1-k))}" width="120" height="20" rx="10" fill="#ffd36b"/>`;return g}
function VOLCAT(t,u){let g=`<rect width="1920" height="1080" fill="#e8c9a8"/>`+GLOW(960,400,500,'#fff6d8',.4)+`<rect x="0" y="${FLOOR}" width="1920" height="175" fill="#b98a5a"/><rect x="460" y="700" width="1000" height="50" rx="16" fill="#8a5a3a" stroke="${OUT}" stroke-width="6"/>`+REMOTE(960,690,.35,t,{rot:-90,on:u>.4?3:null});
  g+=CAT(lerp(500,1400,u),700,.9,t,{look:[.8,0]});const v=Math.min(100,Math.floor(es(u,.4,.9)*100));if(u>.4){g+=`<g transform="translate(960,160)"><rect x="-420" y="-60" width="840" height="110" rx="18" fill="#05040f" opacity=".8"/>${T(-380,16,'VOL',46,'#8fe07a',{a:'start',flat:1})}${Array.from({length:20},(_,i)=>`<rect x="${-260+i*32}" y="-24" width="24" height="56" rx="4" fill="${i<v/5?'#8fe07a':'#34324a'}"/>`).join('')}</g>`}
  return g}
