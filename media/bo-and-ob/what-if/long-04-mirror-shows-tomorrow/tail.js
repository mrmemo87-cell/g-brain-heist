/* ===== What if your mirror showed you tomorrow? ===== */
const PLAIN=(c1,c2)=>`<defs><radialGradient id="pl${c1.slice(1)}" cx=".5" cy=".45" r=".8"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></radialGradient></defs><rect width="1920" height="1080" fill="url(#pl${c1.slice(1)})"/>`;
function dust(t,c='#fff',nn=40){let g='';for(let i=0;i<nn;i++){const x=(i*173+t*20*(1+i%3))%1960-20,y=(i*97-t*14*(1+i%2))%1120;g+=`<circle cx="${n(x)}" cy="${n((y+1120)%1120)}" r="${2+i%3}" fill="${c}" opacity="${n(.15+.2*Math.abs(Math.sin(t+i)))}"/>`}return g}
const U=(t,id)=>cl((t-V[id].s)/(V[id].e-V[id].s));
const headY=(y,s=1)=>y-362*s;
const BLUE='#3a7bd5';
function TAG(x,y,txt,c,t,t0,t1,size=46){if(t<t0||(t1&&t>t1))return '';const u=t-t0,k=BO(u/.3),a=t1?1:1-es(t,t0+1.8,t0+2.2);if(a<=0)return '';
  return `<g opacity="${n(a)}" transform="translate(${n(x)},${n(y-u*14)}) scale(${n(k)})">${T(0,0,txt,size,c)}</g>`}
function CARD(x,y,lines,c,t,t0,rot=0){if(t<t0)return '';const k=BO((t-t0)/.35);return `<g transform="translate(${n(x)},${n(y)}) rotate(${rot}) scale(${n(k)})"><rect x="-330" y="-110" width="660" height="220" rx="24" fill="#14102e" stroke="${c}" stroke-width="8"/>${lines.map((l,i)=>T(0,(i-(lines.length-1)/2)*70+22,l,i?(l.length>22?34:44):60,i?'#fff':c,{flat:1})).join('')}</g>`}
// ---- tomorrow-you effects, all relative to a front-facing character at (x,y) scale s, facing f ----
const EYE=(x,y,s,f,i)=>[x+s*(f*36+i*40),y-s*(362+12)];
function TEARS(x,y,s,f,t,k=1){if(k<=0)return '';let g='';for(const i of [-1,1]){const [ex,ey]=EYE(x,y,s,f,i);
  g+=`<path d="M ${n(ex)} ${n(ey+18*s)} q ${n(6*s)} ${n(40*s)} ${n(-2*s)} ${n(80*s)}" stroke="#7fd0ff" stroke-width="${n(9*s)}" fill="none" stroke-linecap="round" opacity="${n(.85*k)}"/>`;
  for(let d=0;d<2;d++){const u=((t*1.3+d*.5+(i>0?.25:0))%1);g+=`<ellipse cx="${n(ex+i*4*s)}" cy="${n(ey+(30+u*130)*s)}" rx="${n(7*s)}" ry="${n(10*s)}" fill="#7fd0ff" opacity="${n(k*(1-u))}"/>`}}
  return g}
function BAGS(x,y,s,f,k=1){let g='';for(const i of [-1,1]){const [ex,ey]=EYE(x,y,s,f,i);g+=`<ellipse cx="${n(ex)}" cy="${n(ey+30*s)}" rx="${n(26*s)}" ry="${n(10*s)}" fill="#1b0f2e" opacity="${n(.75*k)}"/>`}return g}
function BADHAIR(x,y,s,k=1){if(k<=0)return '';const hy=y-362*s;let p=`M ${n(x-118*s)} ${n(hy-10*s)} Q ${n(x)} ${n(hy-200*s)} ${n(x+118*s)} ${n(hy-10*s)}`;
  for(let i=0;i<9;i++){const xx=x+118*s-i*29.5*s;p+=` L ${n(xx-14*s)} ${n(hy-10*s+((i%2)?38:6)*s)}`}
  return `<g opacity="${n(k)}"><path d="${p} Z" fill="#2a1a3a" stroke="${OUT}" stroke-width="${n(5*s)}"/><path d="M ${n(x-20*s)} ${n(hy-150*s)} L ${n(x+30*s)} ${n(hy-150*s)} L ${n(x+70*s)} ${n(hy-10*s)} L ${n(x+30*s)} ${n(hy-10*s)} Z" fill="#8a7aaa"/><circle cx="${n(x-60*s)}" cy="${n(hy-70*s)}" r="${n(20*s)}" fill="#8a7aaa"/><path d="M ${n(x-60*s)} ${n(hy-150*s)} l ${n(-20*s)} ${n(-40*s)} M ${n(x+10*s)} ${n(hy-165*s)} l ${n(6*s)} ${n(-50*s)}" stroke="#2a1a3a" stroke-width="${n(10*s)}" stroke-linecap="round"/></g>`}
function BOX(x,y,s,plant=1){const bx=x-100*s,by=y-205*s;return `<g><rect x="${n(bx)}" y="${n(by)}" width="${n(200*s)}" height="${n(140*s)}" fill="#c9965a" stroke="${OUT}" stroke-width="${n(5*s)}"/><path d="M ${n(bx)} ${n(by)} l ${n(30*s)} ${n(-30*s)} l ${n(140*s)} 0 l ${n(30*s)} ${n(30*s)}" fill="#b8854a" stroke="${OUT}" stroke-width="${n(5*s)}"/>${plant?`<rect x="${n(x+20*s)}" y="${n(by-40*s)}" width="${n(50*s)}" height="${n(40*s)}" fill="#c0573a" stroke="${OUT}" stroke-width="${n(4*s)}"/><path d="M ${n(x+45*s)} ${n(by-40*s)} q ${n(-30*s)} ${n(-30*s)} ${n(-10*s)} ${n(-55*s)} M ${n(x+45*s)} ${n(by-40*s)} q ${n(30*s)} ${n(-25*s)} ${n(20*s)} ${n(-60*s)}" stroke="#4caf6a" stroke-width="${n(12*s)}" fill="none" stroke-linecap="round"/>`:''}${T(x-30*s,by+80*s,'MY STUFF',22*s,'#6a4a2a',{flat:1})}</g>`}
function THUMB(x,y,s){const Y='#ffcc4d',O='#8a5a00';return `<g transform="translate(${n(x+175*s)},${n(y-470*s)}) scale(${n(s)})"><circle r="95" fill="#4caf6a" opacity=".25"/><circle r="95" fill="none" stroke="#4caf6a" stroke-width="8"/><rect x="-30" y="-78" width="40" height="80" rx="20" fill="${Y}" stroke="${O}" stroke-width="6" transform="rotate(-12 -10 0)"/><rect x="-46" y="-12" width="96" height="78" rx="22" fill="${Y}" stroke="${O}" stroke-width="6"/><path d="M 14 8 L 50 8 M 14 30 L 50 30 M 14 50 L 48 50" stroke="${O}" stroke-width="5" stroke-linecap="round"/><rect x="-64" y="-6" width="26" height="78" rx="8" fill="#3a7bd5" stroke="${OUT}" stroke-width="5"/></g>`}
function PHONEAT(x,y,s){return `<rect x="${n(x+84*s)}" y="${n(y-440*s)}" width="${n(40*s)}" height="${n(80*s)}" rx="${n(8*s)}" fill="#17151f" stroke="${OUT}" stroke-width="${n(4*s)}"/>`}
function DADARM(x,y,s){return `<path d="M ${n(x+420*s)} ${n(y-180*s)} Q ${n(x+200*s)} ${n(y-330*s)} ${n(x+60*s)} ${n(y-250*s)}" stroke="#6b7a8a" stroke-width="${n(46*s)}" fill="none" stroke-linecap="round"/><path d="M ${n(x+420*s)} ${n(y-180*s)} Q ${n(x+200*s)} ${n(y-330*s)} ${n(x+60*s)} ${n(y-250*s)}" stroke="${OUT}" stroke-width="${n(5*s)}" fill="none" opacity=".4"/><circle cx="${n(x+55*s)}" cy="${n(y-250*s)}" r="${n(30*s)}" fill="#6b7a8a" stroke="${OUT}" stroke-width="${n(5*s)}"/>`}
// tomorrow-you: a front-facing YOU plus effects. fx: {cry,bags,hair,box,stomach,palm,thumbs,phone,arm,laugh,blue}
function TMR(x,y,s,t,fx={},o={}){const sw=fx.blue?BLUE:'#f3efe6';
  let q=Object.assign({x,y,s,sw,face:0,smile:fx.cry?-.6:.2,brow:fx.cry?1:.1,open:fx.cry?.55:blink(t,.4),look:[0,0]},o);
  if(fx.laugh){q.smile=1.2;q.brow=-.3;q.open=.3;q.mouth=.35+.3*Math.abs(Math.sin(t*9));q.bob=-Math.abs(Math.sin(t*8))*10*s}
  if(fx.cry&&fx.smileCry){q.smile=.7;q.brow=.6}
  if(fx.stomach){q.aL=170;q.aR=170;q.smile=-.8;q.brow=1;q.sqy=1+.02*Math.sin(t*12)}
  if(fx.palm){q.aL=150;q.aR=150;q.head=12;q.open=.1;q.smile=-.4}
  if(fx.thumbs){q.aR=60;q.smile=1.1;q.brow=-.3}
  if(fx.phone){q.aR=160}
  if(fx.box){q.aL=40;q.aR=40}
  let g=fx.arm?MAN('#6b7a8a','#c9b8a0',{x:x+300*s,y,s:s*1.02,face:-.5,smile:.7,brow:.5,open:.5,look:[-.7,0]})+TEARS(x+300*s,y,s*1.02,-.5,t,.8):'';g+=YOU(q);
  if(fx.bags)g+=BAGS(x,y,s,q.face,fx.bags);
  if(fx.hair)g+=BADHAIR(x,y,s,fx.hair);
  if(fx.cry)g+=TEARS(x,y,s,q.face,t,fx.cry);
  if(fx.palm)g+=`<ellipse cx="${n(x-40*s)}" cy="${n(y-380*s)}" rx="${n(48*s)}" ry="${n(56*s)}" fill="#5a4a8a" stroke="${OUT}" stroke-width="${n(5*s)}"/><ellipse cx="${n(x+40*s)}" cy="${n(y-380*s)}" rx="${n(48*s)}" ry="${n(56*s)}" fill="#5a4a8a" stroke="${OUT}" stroke-width="${n(5*s)}"/>`;
  if(fx.thumbs)g+=THUMB(x,y,s);
  if(fx.phone)g+=PHONEAT(x,y,s);
  if(fx.box)g+=BOX(x,y,s);
  return g}
// glass glitch when the future updates
function GLITCH(x0,y0,w,h,t,t0){const u=t-t0;if(u<0||u>.4)return '';let g='';const k=1-u/.4;
  for(let i=0;i<7;i++){const yy=y0+((i*137+Math.floor(t*40)*53)%h),hh=10+((i*31)%40),dx=Math.sin(t*90+i)*60*k;g+=`<rect x="${n(x0+dx)}" y="${n(yy)}" width="${n(w)}" height="${hh}" fill="${i%2?'#00e5ff':'#ff2bd6'}" opacity="${n(.35*k)}"/>`}
  return g+`<rect x="${x0}" y="${y0}" width="${w}" height="${h}" fill="#fff" opacity="${n(.5*Math.max(0,1-u/.12))}"/>`}
const OSD=(x,y,t,txt,size=30)=>`<circle cx="${x}" cy="${y-size*.35}" r="${size*.3}" fill="#ff3b3b" opacity="${Math.floor(t*2)%2?1:.25}"/>${T(x+size*.6,y,txt,size,'#ff5f5f',{a:'start',flat:1,ls:2})}`;
// ---------- sets ----------
const MX=460,MY=60,MW=1000,MH=700;
function MIR(t,o={}){let g=`<rect width="1920" height="1080" fill="${o.night?'#3a4a5a':'#cfe3e6'}"/>`;
  for(let r=0;r<10;r++)for(let c=0;c<14;c++)g+=`<rect x="${c*140}" y="${r*110}" width="134" height="104" fill="${o.night?'#465a6a':'#e3f1f2'}"/>`;
  g+=`<defs><clipPath id="mirc"><rect x="${MX}" y="${MY}" width="${MW}" height="${MH}" rx="24"/></clipPath><linearGradient id="mirg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#b9d6e6"/><stop offset="1" stop-color="#7fa3bf"/></linearGradient></defs>`;
  g+=`<g clip-path="url(#mirc)"><rect x="${MX}" y="${MY}" width="${MW}" height="${MH}" fill="url(#mirg)"/>`;
  for(let r=0;r<7;r++)for(let c=0;c<8;c++)g+=`<rect x="${MX+c*130-20}" y="${MY+r*105}" width="124" height="98" fill="#fff" opacity=".08"/>`;
  g+=GLOW(960,420,360,'#ffffff',.18);
  const fl=o.floor;g+=TMR(960+(o.rdx||0),fl?960:905,fl?.8:1,t,o.fx||{},Object.assign(fl?{open:.5,head:-10}:{},o.r||{}));
  if(o.cat!==0&&!o.floor)g+=CAT(650,800,.75,t,{back:1})+CAT(1230,760,.55,t,{c:'grey',look:[-.5,.5]})+`<circle cx="${n(1150+Math.sin(t*3)*30)}" cy="735" r="22" fill="#ff5f8f" stroke="${OUT}" stroke-width="4"/>`;
  if(o.floor)g+=CAT(1150,800,.6,t,{c:'grey',look:[-.8,0]});
  if(o.extra)g+=o.extra;
  g+=`<path d="M ${MX+40} ${MY} L ${MX+260} ${MY} L ${MX+60} ${MY+320} Z" fill="#fff" opacity=".14"/>`;
  g+=GLITCH(MX,MY,MW,MH,t,o.gl==null?-9:o.gl)+`<rect x="${MX}" y="${MY}" width="${MW}" height="${MH}" fill="${o.night?'#0b0826':'#7fd0ff'}" opacity="${o.night?.25:.06}"/></g>`;
  g+=`<rect x="${MX}" y="${MY}" width="${MW}" height="${MH}" rx="24" fill="none" stroke="#f3efe6" stroke-width="26"/><rect x="${MX}" y="${MY}" width="${MW}" height="${MH}" rx="24" fill="none" stroke="${OUT}" stroke-width="5"/>`;
  if(o.osd!==0)g+=OSD(MX+50,MY+70,t,o.osd||'TOMORROW · 7:02 AM');
  g+=`<rect x="360" y="790" width="1200" height="60" rx="20" fill="#f3efe6" stroke="${OUT}" stroke-width="6"/><ellipse cx="960" cy="822" rx="170" ry="20" fill="#cfe3e6"/><rect x="940" y="760" width="40" height="40" rx="8" fill="#b9c3c9" stroke="${OUT}" stroke-width="4"/>`;
  if(o.cat!==0)g+=CAT(470,808,.6,t,{c:'grey',look:[.8,0]})+CAT(650,808,.8,t,Object.assign({look:[.6,.2],lick:Math.floor(t/6)%3===1},o.catO||{}));
  if(o.me!==0)g+=YOU(Object.assign({x:1330,y:1560,s:1.7,face:-.2,back:1,aR:o.brush?150:8,brush:o.brush?1:0},o.mo||{}));
  return g}
function REALFRONT(t,o={}){let g=`<rect width="1920" height="1080" fill="#cfe3e6"/>`;for(let r=0;r<10;r++)for(let c=0;c<14;c++)g+=`<rect x="${c*140}" y="${r*110}" width="134" height="104" fill="#e3f1f2"/>`;
  g+=GLOW(960,400,500,'#fff6d8',.35)+CAT(420,1080,1.1,t,{look:[.8,-.4],lick:1})+PEEK(1560,1,t,'grey')+YOU(Object.assign({x:960,y:1060,s:1.1,face:0,smile:.15,brow:-.1,open:.45,aR:150,brush:1,look:[0,0]},o));
  return g}
// office bathroom: one long mirror, colleagues seen from behind, their tomorrow-reflections in the glass
function OFFB(t,o={}){let g=`<rect width="1920" height="1080" fill="#d9d2e6"/><rect x="0" y="0" width="1920" height="1080" fill="url(#beam)" opacity=".2"/>`;
  g+=`<defs><clipPath id="offm"><rect x="160" y="100" width="1600" height="610" rx="16"/></clipPath></defs><g clip-path="url(#offm)"><rect x="160" y="100" width="1600" height="610" fill="url(#mirg)"/>`;
  const P=[[400,'#7fa86b',0],[760,'#c27aa8',1],[1160,'#d9a03a',0],[1520,'#3b4256',1]];
  P.forEach(([x,c,w],i)=>{const dave=i===2,q={x,y:740,s:.72,face:0,smile:dave?(o.dsm==null?.1:o.dsm):.3,brow:dave?(o.dbr==null?.4:o.dbr):0,open:blink(t,i),look:[0,0]};
    if(dave&&o.box)q.aL=q.aR=40;g+=(w?WOMAN:MAN)(c,'#ffd36b',q);if(dave&&o.box)g+=BOX(x,740,.72)});
  g+=CAT(1700,700,.55,t,{c:'black',back:1})+`<path d="M 200 100 L 420 100 L 220 400 Z" fill="#fff" opacity=".14"/>`+GLITCH(160,100,1600,610,t,o.gl==null?-9:o.gl)+`</g><rect x="160" y="100" width="1600" height="610" rx="16" fill="none" stroke="#f3efe6" stroke-width="22"/>`+OSD(210,160,t,'TOMORROW · 9:15 AM');
  g+=`<rect x="100" y="720" width="1720" height="56" rx="16" fill="#f3efe6" stroke="${OUT}" stroke-width="6"/>`+CAT(1700,735,.6,t,{c:'black',look:[-.6,.3]});
  P.forEach(([x,c,w],i)=>{if(o.daveOut&&i===2)return;g+=(w?WOMAN:MAN)(c,'#ffd36b',{x,y:1420,s:1.35,face:0,back:1,aL:o.wash?120+Math.sin(t*14+i)*14:8,aR:o.wash?120-Math.sin(t*14+i)*14:8})});
  return g}
function HANDS(t,u){let g=`<rect width="1920" height="1080" fill="#e3e8ee"/><rect x="0" y="640" width="1920" height="440" fill="#f3efe6"/>`;
  [[480,'#7fa86b'],[960,'#c27aa8'],[1440,'#3b4256']].forEach(([x,c],i)=>{g+=`<rect x="${x-20}" y="160" width="40" height="160" fill="#b9c3c9" stroke="${OUT}" stroke-width="5"/><rect x="${x-60}" y="300" width="80" height="40" rx="10" fill="#b9c3c9" stroke="${OUT}" stroke-width="5"/>`;
    for(let k=0;k<4;k++)g+=`<line x1="${x-30+k*10}" y1="340" x2="${x-34+k*12}" y2="560" stroke="#7fd0ff" stroke-width="6" opacity=".7"/>`;
    const r=Math.sin(t*16+i)*30;g+=`<ellipse cx="${n(x-40+r)}" cy="560" rx="70" ry="44" fill="#5a4a8a" stroke="${OUT}" stroke-width="6"/><ellipse cx="${n(x+40-r)}" cy="580" rx="70" ry="44" fill="#5a4a8a" stroke="${OUT}" stroke-width="6"/>`;
    for(let b=0;b<6;b++)g+=`<circle cx="${n(x-80+b*32+Math.sin(t*3+b)*8)}" cy="${n(520-((t*40+b*20)%80))}" r="${10+b%3*4}" fill="#fff" stroke="#cfe3e6" stroke-width="3" opacity=".9"/>`;
    g+=`<rect x="${x-24}" y="610" width="48" height="400" fill="${c}"/>`});
  g+=CAT(1760,640,.8,t,{c:'black',look:[-.8,.4]})+CAT(160,640,.7,t,{c:'white',look:[.8,.4],lick:1});
  const sec=Math.floor(12+u*150);g+=`<g transform="translate(960,860)"><rect x="-230" y="-60" width="460" height="100" rx="18" fill="#05040f" opacity=".85"/>${T(0,14,'WASHING: '+Math.floor(sec/60)+':'+String(sec%60).padStart(2,'0'),46,'#ffe14d',{ls:2})}</g>`;
  return g}
const DAVE=(o={})=>MAN('#d9a03a','#3b4256',Object.assign({x:760,y:905,face:.5,smile:.5,brow:.2,open:1,look:[.7,0]},o));
function DAVEFRONT(t,o={}){let g=`<rect width="1920" height="1080" fill="#d9d2e6"/>`+GLOW(960,300,500,'#fff6d8',.3)+`<rect x="0" y="${FLOOR}" width="1920" height="175" fill="#a89fbe"/>`;
  g+=CAT(1600,905,.75,t,{c:'black',look:[-.8,0]})+CAT(320,905,.6,t,{c:'calico',look:[.8,0]})+DAVE(o.d)+YOU(Object.assign({x:1260,y:905,face:-.5,smile:.1,brow:.6,open:1,look:[-.7,0]},o.y||{}));return g}
// a grid of 8 little mirrors around the world
function GRID8(t,o={}){let g=PLAIN('#2a3a5a','#0b0826')+dust(t);const C=['#7fa86b','#e88f5a','#3b4256','#c27aa8','#6fb3d9','#d9a03a','#9a7fd9','#f3efe6'];
  for(let i=0;i<8;i++){const x=270+(i%4)*460,y=290+Math.floor(i/4)*440,k=o.t0==null?1:BO((t-o.t0-i*.12)/.3);if(k<=0)continue;
    g+=`<g transform="translate(${x},${y}) scale(${n(k)})"><defs><clipPath id="g8${i}"><rect x="-180" y="-170" width="360" height="340" rx="16"/></clipPath></defs><g clip-path="url(#g8${i})"><rect x="-180" y="-170" width="360" height="340" fill="url(#mirg)"/>`;
    if(i===5||i===2||i===7)g+=CAT(0,190,.85,t,{c:['','','grey','','','orange','','black'][i],look:[0,-.3]});else g+=(i%2?WOMAN:MAN)(C[i],'#ffd36b',{x:0,y:235,s:.6,face:0,smile:.3,brow:0,open:blink(t,i),aR:o.hair?175:8,aL:o.hair?175:8,look:[0,-.4]});
    const cov=o.cover?es(t,o.cover+i*.35,o.cover+i*.35+.4):0;if(cov>0&&i%3===1)g+=`<rect x="-180" y="${n(-170-340*(1-cov))}" width="360" height="340" fill="${['#ff9db5','#9be7ff','#ffd36b'][i%3]}"/>${cov>.95?`<path d="M -180 140 L 180 140" stroke="#fff" stroke-width="10" stroke-dasharray="20 12"/>`:''}`;
    g+=`</g><rect x="-180" y="-170" width="360" height="340" rx="16" fill="none" stroke="#f3efe6" stroke-width="12"/>${OSD(-160,-130,t,'TOMORROW',20)}</g>`}
  return g}
function BRIDE(t,u){let g=`<rect width="1920" height="1080" fill="#f4e4ec"/>`+GLOW(960,400,600,'#fff',.4);
  g+=`<defs><clipPath id="brm"><rect x="980" y="120" width="620" height="640" rx="300"/></clipPath></defs><g clip-path="url(#brm)"><rect x="980" y="120" width="620" height="640" fill="url(#mirg)"/>`;
  g+=WOMAN('#ffffff','#f4e4ec',{x:1290,y:900,s:1,face:0,smile:1.1,brow:-.3,open:.5,look:[0,0]})+`<path d="M 1200 230 L 1380 230 L 1440 760 L 1140 760 Z" fill="#fff" opacity=".45"/>`+`</g><rect x="980" y="120" width="620" height="640" rx="300" fill="none" stroke="#d9b36a" stroke-width="20"/>`+OSD(1110,230,t,'TOMORROW',24);
  g+=WOMAN('#ffffff','#f4e4ec',{x:560,y:1000,s:1.05,face:.6,smile:lerp(-.2,.8,es(u,.4,.6)),brow:lerp(1,.4,es(u,.4,.6)),open:.6,look:[.8,0]})+`<path d="M 470 290 L 650 290 L 720 900 L 400 900 Z" fill="#fff" opacity=".4"/>`;
  g+=CAT(820,1000,.8,t,{c:'white',look:[-.6,-.3]})+`<polygon points="795,860 820,872 795,884" fill="#c0392b"/><polygon points="845,860 820,872 845,884" fill="#c0392b"/>`;
  if(u>.55)g+=TEARS(560,1000,1.05,.6,t,es(u,.55,.65));
  return g}
function TEEN(t,u){let g=`<rect width="1920" height="1080" fill="#2a2450"/>`+WINDOWLIGHT(260,160,520,520,'night',t)+`<rect x="0" y="${FLOOR}" width="1920" height="175" fill="#1d1838"/>`;
  g+=`<defs><clipPath id="tm"><rect x="1100" y="140" width="520" height="620" rx="16"/></clipPath></defs><g clip-path="url(#tm)"><rect x="1100" y="140" width="520" height="620" fill="url(#mirg)"/>`+girl({x:1360,y:900,s:.95,face:0,smile:-.6,brow:1,open:.6,look:[0,.3]})+`<g transform="translate(1360,620) rotate(-4)"><rect x="-150" y="-40" width="300" height="80" rx="10" fill="#ff5f5f" stroke="${OUT}" stroke-width="5"/>${T(0,16,'GROUNDED',46,'#fff',{flat:1})}</g></g><rect x="1100" y="140" width="520" height="620" rx="16" fill="none" stroke="#f3efe6" stroke-width="16"/>`+OSD(1130,200,t,'TOMORROW',22);
  g+=CAT(700,690,.7,t,{c:'black',look:[-.6,0]});
  const back=es(u,.55,.85);g+=girl({x:lerp(520,760,back),y:lerp(700,905,back),s:.9,face:lerp(-.6,.5,back),smile:-.3,brow:.8,open:1,aL:lerp(160,8,back),aR:lerp(160,8,back),look:[.8,0]});
  g+=`<path d="M 520 680 Q 500 800 540 905" stroke="#f3efe6" stroke-width="22" fill="none" opacity="${n(1-back)}"/>`;
  return g}
function GYM(t,u){let g=`<rect width="1920" height="1080" fill="#3a3a4a"/><rect x="0" y="${FLOOR}" width="1920" height="175" fill="#2a2a36"/>`;
  for(let i=0;i<4;i++)g+=`<g transform="translate(${200+i*420},760)"><rect x="-140" y="40" width="280" height="40" rx="10" fill="#14121c"/><rect x="100" y="-180" width="20" height="240" fill="#14121c"/><rect x="60" y="-200" width="100" height="40" rx="8" fill="#5a5a6a"/></g>`;
  g+=CAT(200,790,.7,t,{sleep:1,c:'grey'})+CAT(1460,790,.7,t,{c:'orange',look:[-.6,0]});
  g+=`<defs><clipPath id="gm"><rect x="700" y="100" width="520" height="560" rx="12"/></clipPath></defs><g clip-path="url(#gm)"><rect x="700" y="100" width="520" height="560" fill="url(#mirg)"/>`+MAN('#e88f5a','#3b4256',{x:960,y:830,s:.9,face:0,smile:0,brow:.2,open:1,aR:160,look:[0,0]})+`</g><rect x="700" y="100" width="520" height="560" rx="12" fill="none" stroke="#f3efe6" stroke-width="16"/>`+OSD(730,160,t,'TOMORROW',22);
  g+=MAN('#e88f5a','#3b4256',{x:lerp(1300,2200,es(u,.6,1)),y:905,s:.95,face:lerp(-.6,.7,es(u,.5,.6)),smile:-.2,brow:.5,open:1,aR:lerp(160,8,es(u,.3,.45)),look:[-.8,0],walk:u>.6?t*8:null});
  return g+(u>.3?CARD(960,880,['1 WORKOUT','= ZERO DIFFERENCE'],'#ffb84d',t,V.n37.s+.3*(V.n37.e-V.n37.s)):'')}
function JOB(t,u,o={}){let g=`<rect width="1920" height="1080" fill="#4a3a5a"/>`;
  g+=`<defs><clipPath id="jm"><rect x="1000" y="120" width="600" height="640" rx="16"/></clipPath></defs><g clip-path="url(#jm)"><rect x="1000" y="120" width="600" height="640" fill="url(#mirg)"/>`;
  const cel=o.cel==null?1:o.cel;g+=MAN('#2a3360','#ffd54d',{x:1300,y:900,s:.95,face:0,smile:lerp(-.3,1.1,cel),brow:lerp(.6,-.3,cel),open:1,aL:lerp(8,170,cel),aR:lerp(8,170,cel),look:[0,0]});
  if(cel>.5)for(let i=0;i<14;i++){const yy=((t*200+i*70)%640)+120;g+=`<rect x="${1020+((i*97)%560)}" y="${n(yy)}" width="14" height="22" fill="${['#ffd54d','#ff5f8f','#7fd0ff'][i%3]}" transform="rotate(${n(t*200+i*40)} ${1027+((i*97)%560)} ${n(yy+11)})" opacity="${n(cel)}"/>`}
  g+=GLITCH(1000,120,600,640,t,o.gl==null?-9:o.gl)+`</g><rect x="1000" y="120" width="600" height="640" rx="16" fill="none" stroke="#f3efe6" stroke-width="16"/>`+OSD(1030,180,t,'TOMORROW',22);
  if(cel>.5)g+=`<g transform="translate(1300,700)"><rect x="-120" y="-36" width="240" height="72" rx="12" fill="#4caf6a" stroke="${OUT}" stroke-width="5"/>${T(0,14,'HIRED!',44,'#fff',{flat:1})}</g>`;
  const th=o.throw||0;g+=MAN('#2a3360','#ffd54d',{x:560,y:905,s:1,face:.6,smile:.6,brow:-.2,open:1,aR:lerp(60,150,th),look:[.8,0]});
  g+=`<g transform="translate(${n(lerp(660,300,th))},${n(lerp(560,900,th)-Math.sin(th*PI)*250)}) rotate(${n(th*400)})"><rect x="-40" y="-50" width="80" height="100" fill="#fff" stroke="${OUT}" stroke-width="4"/>${th<.1?T(0,0,'NOTES',18,OUT,{flat:1}):''}</g>`;
  g+=CAT(lerp(160,300,o.throw||0),1000,.7,t,{c:'calico',look:[.6,-.3]});
  return g}
function SOFA(t,u){let g=`<rect width="1920" height="1080" fill="#1b1636"/><rect x="600" y="120" width="720" height="460" fill="#3a2a4a"/>`;for(let i=0;i<8;i++)g+=`<rect x="${600+i*90}" y="110" width="80" height="480" rx="10" fill="#5a2a3a" stroke="#3a1a2a" stroke-width="4"/>`;
  g+=`<rect x="0" y="${FLOOR}" width="1920" height="175" fill="#120f26"/>`+YOU({x:960,y:940,s:1,face:0,smile:-.4,brow:.8,open:.5,look:[0,.6]});
  g+=`<rect x="560" y="700" width="800" height="240" rx="50" fill="#4a3a6a" stroke="${OUT}" stroke-width="7"/><rect x="540" y="800" width="840" height="150" rx="50" fill="#5a4a7a" stroke="${OUT}" stroke-width="7"/>`;
  g+=CAT(760,800,.8,t,{sleep:1})+CAT(1300,770,.6,t,{sleep:1,c:'grey'});g+=`<rect x="1150" y="770" width="90" height="40" rx="8" fill="#14121c" stroke="${OUT}" stroke-width="4"/>`+GLOW(1195,790,60,'#9be7ff',.3*(.5+.5*Math.sin(t*4)));
  return g+`<rect width="1920" height="1080" fill="#05040f" opacity=".25"/>`}
// a phone screen close-up: contacts, or a call
function PH(x,y,s,inner){return PEEK(300,1,0,'orange')+PEEK(1620,.9,0,'black')+`<g transform="translate(${n(x)},${n(y)}) scale(${s})"><rect x="-260" y="-500" width="520" height="1000" rx="70" fill="#17151f" stroke="#3a3650" stroke-width="10"/><rect x="-230" y="-440" width="460" height="880" rx="30" fill="#f4f1fa"/>${inner}</g>`}
function CONTACTS(t,u){const L=['Alex','Barber (cheap)','Ben','Chloe','DAD','Dave (work)','Dentist','Domino’s'];const sc=lerp(0,-140,es(u,0,.5));let i='';
  i+=`<defs><clipPath id="ctc"><rect x="-230" y="-330" width="460" height="770"/></clipPath></defs><rect x="-230" y="-440" width="460" height="110" rx="30" fill="#ece7f6"/>${T(0,-370,'Contacts',40,OUT,{flat:1})}<g clip-path="url(#ctc)">`;
  L.forEach((nm,k)=>{const yy=-260+k*110+sc,dad=nm==='DAD';i+=`<rect x="-210" y="${n(yy-45)}" width="420" height="90" rx="16" fill="${dad?'#ffe9a8':'#fff'}" stroke="${dad?'#ffb84d':'#e0dbea'}" stroke-width="${dad?6:2}"/><circle cx="-150" cy="${n(yy)}" r="30" fill="${dad?'#6b7a8a':'#c4bcd6'}"/>${T(-100,yy+14,nm,dad?44:36,OUT,{a:'start',flat:1})}${dad?T(150,yy+12,'2 yrs',24,'#a09ab0',{flat:1}):''}`});
  i+=`</g>`;return i}
function CALLSCR(t,u,o={}){let i=`<rect x="-230" y="-440" width="460" height="880" rx="30" fill="#1f2a3a"/><circle cx="0" cy="-160" r="90" fill="#6b7a8a"/>${T(0,10,'DAD',70,'#fff',{flat:1})}${T(0,70,o.conn?'00:'+String(Math.floor(u*59)).padStart(2,'0'):'calling…',36,'#9aa0b5',{flat:1})}`;
  if(!o.conn)for(let k=0;k<3;k++){const q=((t*.8+k/3)%1);i+=`<circle cx="0" cy="-160" r="${n(90+q*120)}" fill="none" stroke="#7fd0ff" stroke-width="${n(6*(1-q))}" opacity="${n(1-q)}"/>`}
  i+=`<circle cx="0" cy="330" r="56" fill="#ff5f5f"/><rect x="-28" y="320" width="56" height="20" rx="10" fill="#fff"/>`;return i}
function SPLIT(t,o={}){let g=`<rect width="960" height="1080" fill="#3a4a5a"/><rect x="960" width="960" height="1080" fill="#4a3a2a"/>`+GLOW(1500,300,300,'#ffd9a8',.45)+`<rect x="1560" y="560" width="120" height="20" fill="#2a2018"/><rect x="1610" y="300" width="20" height="260" fill="#2a2018"/><path d="M 1560 300 L 1680 300 L 1650 220 L 1590 220 Z" fill="#ffd36b"/>`;
  g+=YOU(Object.assign({x:480,y:1000,s:1,face:.4,smile:-.1,brow:.8,open:1,aR:160,look:[.6,0]},o.y||{}))+PHONEAT(480,1000,1);
  g+=MAN('#6b7a8a','#c9b8a0',Object.assign({x:1440,y:1000,s:1.02,face:-.4,smile:0,brow:.5,open:1,aR:160,look:[-.6,0]},o.d||{}))+PHONEAT(1440,1000,1.02);
  g+=CAT(230,1000,.7,t,{c:'grey',look:[.8,-.3]})+CAT(1740,1000,.75,t,{c:'orange',look:[-.8,-.3],lick:1});
  if(o.cry)g+=TEARS(480,1000,1,o.y?.face??.4,t,o.cry)+TEARS(1440,1000,1.02,o.d?.face??-.4,t,o.cry);
  return g+`<rect x="955" width="10" height="1080" fill="#05040f"/>`}
function NEITHER(t,u){let g=PLAIN('#2a2450','#05040f')+dust(t);
  g+=`<path d="M 960 0 L 930 200 L 990 400 L 940 600 L 980 800 L 950 1080" stroke="#05040f" stroke-width="22" fill="none"/>`;
  g+=YOU({x:620,y:960,s:1,face:-.6,smile:-.3,brow:.7,open:1,aR:120,look:[-.4,.6]})+`<rect x="660" y="560" width="50" height="90" rx="8" fill="#17151f"/>`+GLOW(685,600,50,'#9be7ff',.4);
  g+=MAN('#6b7a8a','#c9b8a0',{x:1300,y:960,s:1.02,face:.6,smile:-.3,brow:.7,open:1,aL:120,look:[.4,.6]})+`<rect x="1215" y="560" width="50" height="90" rx="8" fill="#17151f"/>`+GLOW(1240,600,50,'#9be7ff',.4);
  g+=CAT(420,960,.7,t,{c:'grey',look:[.6,-.4]})+CAT(1520,960,.7,t,{c:'orange',look:[-.6,-.4]});
  return g+(u>.55?CARD(960,170,['NEITHER','CALLED FIRST.'],'#ff9db5',t,V.n49.s+.55*(V.n49.e-V.n49.s)):'')}
function HALL(t,o={}){let g=`<rect width="1920" height="1080" fill="#b98a5a"/><rect x="0" y="0" width="1920" height="1080" fill="url(#beam)" opacity=".6"/>`+GLOW(700,300,500,'#ffe9c2',.45);
  for(let i=0;i<4;i++)g+=`<circle cx="${200+i*90}" cy="300" r="14" fill="#5a3a20"/><path d="M ${180+i*90} 310 L ${170+i*90} 560 L ${240+i*90} 560 Z" fill="${['#c0392b','#3b4256','#7fa86b','#d9a03a'][i]}" opacity=".85"/>`;
  g+=`<defs><clipPath id="hm"><ellipse cx="1500" cy="420" rx="230" ry="300"/></clipPath></defs><g clip-path="url(#hm)"><rect x="1270" y="120" width="460" height="600" fill="url(#mirg)"/>`+TMR(1500,880,.85,t,{laugh:o.laugh,blue:1})+CAT(1650,720,.55,t,{c:'orange',look:[-.6,0]})+`</g><ellipse cx="1500" cy="420" rx="230" ry="300" fill="none" stroke="#5a3a20" stroke-width="22"/>`+(o.mosd?OSD(1360,250,t,'TOMORROW',22):'');
  g+=`<rect x="0" y="${FLOOR}" width="1920" height="175" fill="#7a4a2a"/>`;
  g+=MAN('#6b7a8a','#c9b8a0',Object.assign({x:620,y:905,s:1.05,face:.5,smile:.6,brow:.5,open:.7,aR:110,look:[.7,0]},o.d||{}));
  g+=TMR(960,905,1,t,{cry:o.cry||0,blue:1,smileCry:1},Object.assign({face:-.5,look:[-.7,0]},o.y||{}));
  g+=CAT(1180,905,.75,t,{c:'orange',look:[-.8,-.2]})+CAT(330,905,.65,t,{c:'black',look:[.8,-.2]});
  if(o.cry)g+=TEARS(620,905,1.05,.5,t,o.cry);
  return g}
// the cat: orange tabby, sitting. o: {back, sleep, look:[x,y], blink}
const CATC={orange:['#e8933a','#b8651f','#f6d2a8'],grey:['#9aa0b5','#666b80','#e3e6ee'],black:['#2a2838','#14121c','#4a4658'],white:['#f3efe6','#d8cfc0','#ffffff'],calico:['#f3efe6','#e8933a','#ffffff']};
function CAT(x,y,s,t,o={}){const P=CATC[o.c||'orange'],C=P[0],D2=P[1],BL=P[2],sw=Math.sin(t*2.2+x)*14;let g=`<g transform="translate(${n(x)},${n(y)}) scale(${s})">`;
  if(o.sleep){g+=`<ellipse cx="0" cy="-45" rx="120" ry="55" fill="${C}" stroke="${OUT}" stroke-width="6"/>`;for(const k of [-50,-10,30])g+=`<path d="M ${k} -95 q 10 25 0 50" stroke="${D2}" stroke-width="10" fill="none" stroke-linecap="round"/>`;
    g+=`<path d="M -110 -30 Q -150 20 -60 10" stroke="${C}" stroke-width="26" fill="none" stroke-linecap="round"/><g transform="translate(85,-60)"><circle r="52" fill="${C}" stroke="${OUT}" stroke-width="6"/><polygon points="-38,-30 -24,-78 -4,-44" fill="${C}" stroke="${OUT}" stroke-width="5" stroke-linejoin="round"/><polygon points="38,-30 24,-78 4,-44" fill="${C}" stroke="${OUT}" stroke-width="5" stroke-linejoin="round"/><path d="M -24 0 q 10 8 20 0 M 6 0 q 10 8 20 0" stroke="${OUT}" stroke-width="5" fill="none" stroke-linecap="round"/><ellipse cx="1" cy="16" rx="6" ry="4" fill="#ff8fab"/></g>`;
    g+=[0,1,2].map(i=>{const u=((t*.4+i/3)%1);return T(150+u*50,-140-u*90,'z',30+i*6,'#fff',{op:n(1-u),flat:1})}).join('');return g+`</g>`}
  // tail
  g+=`<path d="M ${o.back?0:50} -20 Q ${o.back?20:120} -30 ${n((o.back?10:110)+sw)} -110" stroke="${C}" stroke-width="22" fill="none" stroke-linecap="round"/><path d="M ${o.back?0:50} -20 Q ${o.back?20:120} -30 ${n((o.back?10:110)+sw)} -110" stroke="${OUT}" stroke-width="4" fill="none" opacity=".35"/>`;
  g+=`<path d="M -60 0 Q -70 -120 0 -130 Q 70 -120 60 0 Z" fill="${C}" stroke="${OUT}" stroke-width="6"/>`;
  for(const k of [-30,0,30])g+=`<path d="M ${k} -120 q ${k/6} 20 0 40" stroke="${D2}" stroke-width="9" fill="none" stroke-linecap="round" opacity=".8"/>`;
  if(!o.back)g+=`<ellipse cx="0" cy="-50" rx="30" ry="40" fill="${BL}"/><ellipse cx="-28" cy="-4" rx="18" ry="10" fill="${BL}" stroke="${OUT}" stroke-width="4"/><ellipse cx="28" cy="-4" rx="18" ry="10" fill="${BL}" stroke="${OUT}" stroke-width="4"/>`;
  const hy=-170+(o.lick?Math.sin(t*6)*4:0);g+=`<g transform="translate(0,${n(hy)}) rotate(${n(o.tilt||Math.sin(t*.8)*4)})">`;
  g+=`<polygon points="-52,-20 -40,-82 -8,-50" fill="${C}" stroke="${OUT}" stroke-width="5" stroke-linejoin="round"/><polygon points="52,-20 40,-82 8,-50" fill="${C}" stroke="${OUT}" stroke-width="5" stroke-linejoin="round"/>`;
  if(!o.back)g+=`<polygon points="-44,-30 -38,-66 -20,-46" fill="#ff8fab"/><polygon points="44,-30 38,-66 20,-46" fill="#ff8fab"/>`;
  g+=`<ellipse cx="0" cy="0" rx="66" ry="58" fill="${C}" stroke="${OUT}" stroke-width="6"/>`;
  if(o.back){g+=`<path d="M -20 -50 q 0 20 0 30 M 0 -56 q 0 22 0 34 M 20 -50 q 0 20 0 30" stroke="${D2}" stroke-width="8" fill="none" stroke-linecap="round"/>`}
  else{const lk=o.look||[0,0],op=blink(t,x*.01+.7);
    for(const i of [-1,1]){g+=`<ellipse cx="${i*24}" cy="-6" rx="13" ry="${n(15*op)}" fill="#c8f06a" stroke="${OUT}" stroke-width="3"/>`;if(op>.3)g+=`<ellipse cx="${n(i*24+lk[0]*5)}" cy="${n(-6+lk[1]*5)}" rx="4" ry="12" fill="#17152e"/>`}
    g+=`<path d="M -6 16 L 6 16 L 0 23 Z" fill="#ff8fab"/><path d="M 0 23 q -8 10 -16 4 M 0 23 q 8 10 16 4" stroke="${OUT}" stroke-width="3" fill="none" stroke-linecap="round"/>`;
    for(const i of [-1,1])for(const k of [-1,0,1])g+=`<line x1="${i*30}" y1="${18+k*7}" x2="${i*80}" y2="${12+k*14}" stroke="#fff" stroke-width="3" opacity=".85"/>`;
    if(o.hat)g+=`<ellipse cx="0" cy="-58" rx="70" ry="14" fill="#c0392b" stroke="${OUT}" stroke-width="4"/><path d="M -46 -58 Q 0 -140 46 -58 Z" fill="#c0392b" stroke="${OUT}" stroke-width="4"/>`}
  g+=`</g>`;
  if(o.lick&&!o.back)g+=`<ellipse cx="${n(-20+Math.sin(t*6)*4)}" cy="-115" rx="18" ry="22" fill="${BL}" stroke="${OUT}" stroke-width="4"/>`;
  return g+`</g>`}
function PEEK(x,s,t,c='orange',y=1080){const P=CATC[c],k=Math.sin(t*1.3+x)*6;return `<g transform="translate(${x},${n(y+k)}) scale(${s})"><polygon points="-52,-150 -40,-212 -8,-180" fill="${P[0]}" stroke="${OUT}" stroke-width="5"/><polygon points="52,-150 40,-212 8,-180" fill="${P[0]}" stroke="${OUT}" stroke-width="5"/><polygon points="-44,-160 -38,-196 -20,-176" fill="#ff8fab"/><polygon points="44,-160 38,-196 20,-176" fill="#ff8fab"/><ellipse cx="0" cy="-120" rx="70" ry="62" fill="${P[0]}" stroke="${OUT}" stroke-width="6"/><ellipse cx="-24" cy="-128" rx="12" ry="${n(14*blink(t,x*.01))}" fill="#c8f06a" stroke="${OUT}" stroke-width="3"/><ellipse cx="24" cy="-128" rx="12" ry="${n(14*blink(t,x*.01))}" fill="#c8f06a" stroke="${OUT}" stroke-width="3"/><ellipse cx="-24" cy="-128" rx="4" ry="11" fill="#17152e"/><ellipse cx="24" cy="-128" rx="4" ry="11" fill="#17152e"/><path d="M -6 -106 L 6 -106 L 0 -99 Z" fill="#ff8fab"/><ellipse cx="-40" cy="-62" rx="26" ry="18" fill="${P[2]}" stroke="${OUT}" stroke-width="5"/><ellipse cx="40" cy="-62" rx="26" ry="18" fill="${P[2]}" stroke="${OUT}" stroke-width="5"/></g>`}
// a thought cloud with a trail of little circles down to the head
function THOUGHT(x,y,txt,t,t0,o={}){if(t<t0||(o.t1&&t>o.t1))return '';const k=BO((t-t0)/.35),size=o.size||40,lines=Array.isArray(txt)?txt:[txt];
  const w=o.w||Math.max(260,Math.max(...lines.map(l=>l.length))*size*.56+90),h=lines.length*size*1.2+70,tx=o.tx==null?-w*.25:o.tx,ty=o.ty==null?h/2+70:o.ty;
  let g=`<g transform="translate(${n(x)},${n(y+Math.sin(t*2+x)*6)}) scale(${n(k)})">`;
  const N=Math.max(8,Math.round((w+h)/45));let cl2='';
  for(let i=0;i<N;i++){const a=i/N*2*PI,px=Math.cos(a)*w/2,py=Math.sin(a)*h/2,r=size*.75+((i*7)%3)*size*.12;cl2+=`<circle cx="${n(px)}" cy="${n(py)}" r="${n(r)}"/>`}
  g+=`<g fill="${o.fill||'#f2ecff'}" stroke="${OUT}" stroke-width="6">${cl2}</g><g fill="${o.fill||'#f2ecff'}">${cl2.replace(/r="([\d.]+)"/g,(m,r)=>`r="${n(+r-3)}"`)}<ellipse cx="0" cy="0" rx="${n(w/2)}" ry="${n(h/2)}"/></g>`;
  g+=[.35,.62,.85].map((f,i)=>`<circle cx="${n(tx*f*1.4)}" cy="${n(h/2+(ty-h/2)*f)}" r="${n(size*(.42-i*.11))}" fill="${o.fill||'#f2ecff'}" stroke="${OUT}" stroke-width="5"/>`).join('');
  g+=lines.map((l,i)=>T(0,(i-(lines.length-1)/2)*size*1.2+size*.36,l,size,o.tc||'#3a2a70',{flat:1})).join('');
  return g+`</g>`}
// a hat, for the "decide something" demo
const HAT=(x,y,s,k)=>k<=0?'':`<g opacity="${n(k)}"><ellipse cx="${x}" cy="${n(y-470*s)}" rx="${n(150*s)}" ry="${n(28*s)}" fill="#c0392b" stroke="${OUT}" stroke-width="5"/><path d="M ${n(x-95*s)} ${n(y-470*s)} Q ${x} ${n(y-640*s)} ${n(x+95*s)} ${n(y-470*s)} Z" fill="#c0392b" stroke="${OUT}" stroke-width="5"/><circle cx="${x}" cy="${n(y-600*s)}" r="${n(22*s)}" fill="#fff"/></g>`;
function TEXT2(t,a,b,ta,tb,c1='#3b2f5a',c2='#0b0826',col='#ffe14d'){return PLAIN(c1,c2)+dust(t)+PEEK(1650,1.1,t,['orange','grey','black','white'][Math.floor(ta)%4])+POP(a,960,470,96,'#fff',t,ta)+POP(b,960,620,110,col,t,tb)}
function STRIKE(x,y,w,t,t0){if(t<t0)return '';const k=es(t,t0,t0+.25);return `<line x1="${x-w/2}" y1="${y}" x2="${n(x-w/2+w*k)}" y2="${y}" stroke="#ff5f5f" stroke-width="16" stroke-linecap="round"/>`}
function TEASE3(t,u){let g=PLAIN('#2a1d4a','#05040f')+dust(t)+PEEK(960,1,t,'orange');[['WHAT PEOPLE','CHECK FIRST'],['WHAT THEY’D','RATHER NOT KNOW'],['WHY YOU’RE','CRYING']].forEach((l,i)=>{if(u>.12+i*.25){const k=BO((u-.12-i*.25)*6),c=['#7fd0ff','#ffb84d','#ff5f8f'][i];g+=`<g transform="translate(${480+i*480},540) scale(${n(k)})"><rect x="-210" y="-210" width="420" height="420" rx="40" fill="#14102e" stroke="${c}" stroke-width="10"/>${T(0,-50,l[0],44,'#fff',{flat:1})}${T(0,20,l[1],44,c)}${T(0,140,'?',100,c)}</g>`}});return g}
function SHOTS(){const S=[];const A=(s,d,c,f,fx)=>S.push([s,d,c||[960,540,1.02,960,540,1.08],f||0,fx||{}]);
  const M=(o)=>t=>CDEFS+MIR(t,o);
  const MF=(o)=>t=>CDEFS+MIR(t,typeof o==='function'?o(t):o);
  // COLD OPEN — hook: extreme close-up on tomorrow-you crying, then pull back to reveal calm today-you brushing
  A(0,M({fx:{cry:1,blue:1},brush:1}),[960,470,2.6,960,560,1.0],.5);
  A(at('n01',.55),t=>CDEFS+REALFRONT(t),[960,560,1.25,960,520,1.4]);
  A(at('n02'),M({fx:{cry:1,blue:1},brush:1,mo:{rot:-3}}),[960,560,1.0,960,470,1.9],0,{snap:1,shake:3});
  A(at('n03',.45),t=>CDEFS+MIR(t,{fx:{cry:1,blue:1}})+TAG(960,180,'TOMORROW: BLUE SHIRT',BLUE,t,at('n03',.55),D.total,44)+TAG(1330,690,'TODAY: WHITE','#fff',t,at('n03',.7),D.total,40),[1050,560,1.15,1050,560,1.25],0,{whip:1});
  A(at('n04'),t=>CDEFS+GRID8(t,{t0:at('n04')})+(t>at('n04',.55)?CARD(960,540,['24 HOURS AHEAD','EVERY MIRROR ON EARTH'],'#7fd0ff',t,at('n04',.55)):''),[960,540,1.12,960,540,1.0]);
  A(at('n05'),t=>{const a=at('n05',.62);return CDEFS+MIR(t,{fx:{},gl:a,osd:'TOMORROW · 7:03 AM',extra:HAT(960,905,1,es(t,a,a+.05)),catO:{hat:t>a}})+THOUGHT(1380,330,'Wear a hat tomorrow?',t,at('n05',.35),{size:36,tx:-40})},[1100,480,1.2,1050,470,1.3]);
  A(at('n06'),t=>CDEFS+TEASE3(t,U(t,'n06')),[960,540,1.06,960,540,1.0]);
  A(C.title,t=>{const u=(t-C.title)/1.8;return CDEFS+PLAIN('#2a1d4a','#05040f')+GLOW(960,540,500,'#7fd0ff',.15)+`<g opacity="${n(es(u,0,.2))}"><rect x="760" y="150" width="400" height="260" rx="20" fill="url(#mirg)" stroke="#f3efe6" stroke-width="12"/>${OSD(790,200,t,'TOMORROW',22)}</g>`+POP('WHAT IF YOU COULD SEE THE FUTURE',960,560,80,'#fff',u,.05)+POP('THROUGH THE MIRROR?',960,690,104,'#7fd0ff',u,.15)+CAT(380,1060,1.1,t,{look:[.6,-.4]})+CAT(1560,1060,1,t,{c:'grey',look:[-.6,-.4],hat:1})},[960,540,1.15,960,540,1.0]);
  // 7:15 — the first check
  A(at('n07'),t=>CDEFS+GRID8(t,{hair:t>at('n07',.6)}),[960,540,1.0,960,540,1.1]);
  A(at('n08'),t=>CDEFS+PLAIN('#3b2f5a','#0b0826')+dust(t)+PEEK(300,1,t,'grey')+PEEK(1620,1,t,'orange')+POP('AM I OKAY?',700,300,70,'#fff',t,at('n08',.05))+STRIKE(700,280,520,t,at('n08',.2))+POP('AM I ALIVE?',1240,300,70,'#fff',t,at('n08',.25))+STRIKE(1240,280,540,t,at('n08',.42))+POP('THEIR HAIR.',960,640,190,'#ffe14d',t,at('n08',.62)),[960,540,1.0,960,560,1.12],0,{shakeAt:at('n08',.62)});
  A(at('n09'),MF(t=>({fx:{hair:1},osd:'TOMORROW · 7:15 AM',mo:{sqy:t>at('n09',.2)?.97:1}})),[960,420,1.6,1050,480,1.25],0,{snap:1});
  A(at('n10'),t=>CDEFS+PLAIN('#3b2f5a','#0b0826')+PH(960,560,.9,`<rect x="-230" y="-440" width="460" height="110" rx="30" fill="#ece7f6"/>${T(0,-370,'Bookings',40,OUT,{flat:1})}<rect x="-200" y="-260" width="400" height="200" rx="20" fill="#fff" stroke="#e0dbea" stroke-width="3"/>${T(0,-190,'CHEAP CUTS',44,'#c0392b',{flat:1})}${T(0,-140,'Today · 3:00 PM',34,OUT,{flat:1})}${T(0,-95,'£6',34,'#4caf6a',{flat:1})}`),[960,560,1.0,960,500,1.15]);
  A(at('n11'),t=>CDEFS+PLAIN('#3b2f5a','#0b0826')+PH(960,560,.9,`<rect x="-230" y="-440" width="460" height="110" rx="30" fill="#ece7f6"/>${T(0,-370,'Bookings',40,OUT,{flat:1})}<rect x="-200" y="-260" width="400" height="200" rx="20" fill="#fff" stroke="#e0dbea" stroke-width="3"/>${T(0,-190,'CHEAP CUTS',44,'#c0392b',{flat:1})}<rect x="-160" y="40" width="320" height="90" rx="45" fill="${t>at('n11',.18)?'#9aa0b5':'#ff5f5f'}"/>${T(0,98,t>at('n11',.18)?'CANCELLED':'CANCEL',40,'#fff',{flat:1})}`),[960,560,1.15,960,560,1.2]);
  A(at('n11',.38),t=>{const a=at('n11',.5);return CDEFS+MIR(t,{fx:{hair:1-es(t,a,a+.05)},gl:a,osd:'TOMORROW · 7:15 AM',mo:{sqy:1}})},[1050,480,1.25,1000,470,1.3],0,{whip:1});
  // 8:00 — testing it
  const T8='TOMORROW · 8:00 AM';
  A(at('n12'),t=>CDEFS+MIR(t,{osd:T8})+THOUGHT(1400,320,'Let’s test this.',t,at('n12',.3),{size:38,tx:-60}),[960,540,1.05,1000,520,1.15],.3);
  A(at('n13'),t=>{const a=at('n13',.62);return CDEFS+MIR(t,{osd:T8,fx:{bags:es(t,a,a+.05)},gl:a})+THOUGHT(1400,300,['One more','episode…'],t,at('n13',.15),{size:38,tx:-60})},[1000,460,1.3,980,440,1.5]);
  A(at('n14'),t=>{const a=at('n14',.6);return CDEFS+MIR(t,{osd:T8,fx:t>a?{stomach:1,bags:1}:{bags:1},gl:a})+THOUGHT(1400,300,['Giant bacon','sandwich…'],t,at('n14',.1),{size:38,tx:-60})},[1000,480,1.25,980,480,1.35]);
  A(at('n15'),t=>CDEFS+PLAIN('#2a2450','#05040f')+PEEK(400,1,t,'black')+PEEK(1520,1,t,'orange')+PHONE(960,560,.95,t,{name:'Jamie (ex)',avatar:'#c27aa8',msgs:[{at:-1,text:'ok bye'}],input:{at:at('n15',.55),typed:'Hey. You up?'}}),[960,700,1.2,960,780,1.6]);
  A(at('n16'),M({osd:T8,fx:{palm:1},gl:at('n16')}),[960,500,1.0,960,430,1.6],0,{snap:1});
  A(at('n17'),t=>CDEFS+PLAIN('#2a2450','#05040f')+PEEK(400,1,t,'black')+PEEK(1520,1,t,'orange')+PHONE(960,560,.95,t,{name:'Jamie (ex)',avatar:'#c27aa8',msgs:[{at:-1,text:'ok bye'}],input:{at:at('n17')-1.5,typed:'Hey. You up?',glitchAt:at('n17')+.1}}),[960,780,1.6,960,780,1.6]);
  A(at('n17',.45),M({osd:T8,fx:{thumbs:1},gl:at('n17',.45)}),[1000,450,1.4,1000,460,1.3],0,{whip:1});
  A(at('n18'),t=>CDEFS+TEXT2(t,'IT NEVER TOLD YOU ANYTHING NEW.','IT JUST STOPPED LETTING YOU PRETEND.',at('n18',.3),at('n18',.62)).replace('font-size="96"','font-size="74"').replace('font-size="110"','font-size="74"'),[960,540,1.06,960,540,1.0]);
  A(at('n19'),t=>CDEFS+MIR(t,{osd:T8})+THOUGHT(1400,280,['Dear boss,','your seating plan','is a crime.'],t,at('n19',.35),{size:36,tx:-60}),[1050,480,1.2,1050,470,1.3]);
  A(at('n20'),t=>{const b=at('n20',.62);return CDEFS+MIR(t,{osd:T8,fx:t<b?{box:1}:{},gl:t<b?at('n20'):b,mo:{head:t>at('n20',.5)&&t<b?Math.sin(t*14)*8:0}})},[960,520,1.25,960,500,1.35],0,{snap:1});
  // 9:15 — the office bathroom
  A(at('n21'),t=>CDEFS+OFFB(t),[960,560,1.0,960,520,1.1],.3);
  A(at('n22'),t=>CDEFS+OFFB(t,{box:t>at('n22',.45),gl:at('n22',.45)}),[960,520,1.05,1160,420,1.5]);
  A(at('n23'),t=>CDEFS+OFFB(t,{box:1}),[960,540,1.0,960,540,1.04],0,{snap:1});
  A(at('n24'),t=>CDEFS+HANDS(t,U(t,'n24')),[960,540,1.08,960,600,1.0]);
  A(at('v1'),t=>CDEFS+DAVEFRONT(t,{d:{mouth:one('v1')(t),smile:.9,brow:-.2,aR:60}})+BUB(760,180,'Why is everyone being so weird?',t,at('v1')+.05,{size:38}),[860,460,1.35,860,450,1.45]);
  A(at('n25'),t=>CDEFS+TEXT2(t,'WE’D RATHER LET THEM GET HURT…','…THAN HAVE ONE AWKWARD TALK.',at('n25',.2),at('n25',.6)).replace('font-size="96"','font-size="74"').replace('font-size="110"','font-size="80"'),[960,540,1.06,960,540,1.0]);
  A(at('n26'),t=>CDEFS+DAVEFRONT(t,{y:{mouth:.3+.3*Math.abs(Math.sin(t*9))*(t<at('n26',.9)?1:0),brow:.3}})+BUB(1260,200,'Dave. Look at the mirror.',t,at('n26',.3),{size:38}),[1100,460,1.3,1100,450,1.4]);
  A(at('n27'),t=>{const u=U(t,'n27');return CDEFS+DAVEFRONT(t,{d:{smile:lerp(.5,-.4,es(u,0,.2)),brow:lerp(.2,1,es(u,0,.2)),x:lerp(760,-300,es(u,.5,1)),face:u>.45?-.7:.5,walk:u>.5?t*8:null,aR:u>.5?160:8}})},[960,520,1.1,800,520,1.2]);
  A(at('n28'),t=>CDEFS+OFFB(t,{box:1}),[1160,420,1.5,1160,400,1.65]);
  A(at('n29'),t=>CDEFS+OFFB(t,{box:1,dsm:t>at('n29',.3)?1:.1,dbr:t>at('n29',.3)?-.3:.4,gl:at('n29',.3)})+TAG(1160,170,'HE HAS A PLAN','#8fe07a',t,at('n29',.55),D.total,40),[1160,420,1.6,1160,400,1.7]);
  A(at('n30'),t=>CDEFS+DAVEFRONT(t,{d:{smile:1,brow:-.3,aR:90+Math.sin(t*10)*10,face:.4,x:900},y:{smile:.6,brow:-.1,aL:90+Math.sin(t*10)*10,x:1180}})+[0,1,2,3].map(i=>TAG(500+i*300,200+(i%2)*120,'THANK YOU!','#ffe14d',t,at('n30',.15+i*.18),0,40)).join(''),[1040,520,1.15,1040,520,1.05]);
  A(at('n31'),t=>CDEFS+TEXT2(t,'THE KINDEST THING IN THE ROOM…','…WAS ALSO THE MOST AWKWARD.',at('n31',.1),at('n31',.55)).replace('font-size="96"','font-size="74"').replace('font-size="110"','font-size="80"'),[960,540,1.06,960,540,1.0]);
  // 12:00 — the world
  A(at('n32'),t=>CDEFS+GRID8(t,{t0:at('n32',.2)}),[960,540,1.1,960,540,1.0],.3);
  A(at('n33'),t=>CDEFS+GRID8(t)+(t>at('n33',.6)?CARD(960,540,['TOMORROW LOOKS…','A LOT LIKE TODAY.'],'#7fd0ff',t,at('n33',.6)):''),[960,540,1.0,960,540,1.06]);
  A(at('n34'),t=>CDEFS+BRIDE(t,U(t,'n34')),[900,520,1.05,780,460,1.3]);
  A(at('n35'),t=>CDEFS+TEXT2(t,'WE EXPECT THE WORST…','…SO WE’RE NEVER SURPRISED.',at('n35',.05),at('n35',.5)).replace('font-size="110"','font-size="90"'),[960,540,1.06,960,540,1.0]);
  A(at('n36'),t=>CDEFS+TEEN(t,U(t,'n36')),[1000,520,1.05,1100,480,1.2],0,{whip:1});
  A(at('n37'),t=>CDEFS+GYM(t,U(t,'n37')),[960,540,1.0,960,540,1.08],0,{whip:1});
  A(at('n38'),t=>CDEFS+JOB(t,U(t,'n38'),{cel:1,throw:es(U(t,'n38'),.55,.85)}),[960,540,1.0,1000,520,1.12],0,{whip:1});
  A(at('n39'),t=>CDEFS+JOB(t,U(t,'n39'),{cel:1-es(U(t,'n39'),.25,.3),gl:at('n39',.25),throw:1}),[1300,480,1.4,1300,470,1.5],0,{snap:1});
  A(at('n40'),t=>CDEFS+GRID8(t,{cover:at('n40',.25)})+(t>at('n40',.6)?CARD(960,540,['1 IN 3','MIRRORS COVERED'],'#ff9db5',t,at('n40',.6)):''),[960,540,1.08,960,540,1.0]);
  A(at('n41'),t=>CDEFS+TEXT2(t,'IT MOSTLY DOESN’T.','UNLESS WE CHANGE IT.',at('n41',.45),at('n41',.75)),[960,540,1.06,960,540,1.0]);
  // 3:00 PM — playing it safe
  const T3='TOMORROW · 3:00 PM';
  A(at('n42'),M({osd:T3,fx:{cry:1}}),[960,540,1.0,960,480,1.3],.3);
  A(at('n43'),t=>CDEFS+PLAIN('#2a2450','#05040f')+PEEK(400,1,t,'grey')+PHONE(960,560,.95,t,{name:'The Gang (5)',avatar:'#e88f5a',msgs:[{at:-1,text:'Dinner tonight? 8pm!'},{at:at('n43',.35),me:1,text:'Can’t, sorry.'}]}),[960,520,1.2,960,500,1.3]);
  A(at('n43',.62),t=>CDEFS+MIR(t,{osd:T3,fx:{cry:1}})+TAG(960,240,'STILL CRYING','#7fd0ff',t,at('n43',.65),D.total,44),[960,460,1.5,960,450,1.6],0,{whip:1});
  A(at('n44'),t=>CDEFS+PLAIN('#2a2450','#05040f')+PH(960,560,.95,`<rect x="-230" y="-440" width="460" height="880" rx="30" fill="#1f2a3a"/><circle cx="0" cy="-160" r="90" fill="#c27aa8"/>${T(0,10,'MUM',70,'#fff',{flat:1})}${T(0,70,'incoming call',34,'#9aa0b5',{flat:1})}<circle cx="-110" cy="330" r="56" fill="#ff5f5f" stroke="#fff" stroke-width="${t>at('n44',.25)?8:0}"/><circle cx="110" cy="330" r="56" fill="#4caf6a"/>`),[960,560,1.1,960,600,1.25],0,{shake:t=>t<at('n44',.25)?2:0});
  A(at('n44',.6),t=>CDEFS+MIR(t,{osd:T3,fx:{cry:1}})+TAG(960,240,'STILL CRYING','#7fd0ff',t,at('n44',.62),D.total,44),[960,450,1.55,960,440,1.65],0,{whip:1});
  A(at('m1'),t=>CDEFS+PLAIN('#2a2450','#05040f')+PH(960,560,.95,`<rect x="-230" y="-440" width="460" height="110" rx="30" fill="#ece7f6"/>${T(0,-370,'Voicemail · Mum',36,OUT,{flat:1})}<rect x="-200" y="-260" width="400" height="300" rx="24" fill="#fff" stroke="#e0dbea" stroke-width="3"/>${T(0,-190,'“Hi love, it’s Mum.',30,OUT,{flat:1})}${T(0,-145,'Just checking in.',30,OUT,{flat:1})}${T(0,-100,'Call me back…',30,OUT,{flat:1})}${T(0,-55,'no rush.”',30,OUT,{flat:1})}<rect x="-180" y="120" width="${n(360*U(t,'m1'))}" height="12" rx="6" fill="#3a7bd5"/>`),[960,500,1.25,960,480,1.35]);
  A(at('n45'),t=>CDEFS+SOFA(t,U(t,'n45')),[960,600,1.15,960,640,1.3],.3);
  A(at('n46'),M({osd:T3,night:1,floor:1,fx:{cry:1},me:0}),[960,400,1.0,960,600,1.45]);
  A(at('n47'),t=>CDEFS+TEXT2(t,'HIDING DOESN’T STOP THE TEARS.','IT JUST MEANS NOBODY’S THERE.',at('n47',.25),at('n47',.6),'#2a2450','#05040f','#7fd0ff').replace('font-size="96"','font-size="74"').replace('font-size="110"','font-size="80"'),[960,540,1.06,960,540,1.0]);
  // 9:00 PM — the call
  const T9='TOMORROW · 9:00 PM';
  A(at('n48'),t=>CDEFS+PLAIN('#2a2450','#05040f')+PH(960,560,.95,CONTACTS(t,U(t,'n48'))),[960,560,1.0,960,540,1.5],.4);
  A(at('n49'),t=>CDEFS+NEITHER(t,U(t,'n49')),[960,560,1.08,960,540,1.0]);
  A(at('n50'),M({osd:T9,night:1,fx:{cry:1},mo:{aR:150}}),[1100,520,1.15,960,420,1.75]);
  A(at('n51'),t=>CDEFS+PLAIN('#1f2a3a','#05040f')+PH(960,560,.95,CALLSCR(t,U(t,'n51'))),[960,500,1.2,960,440,1.45],0,{shake:t=>{const u=U(t,'n51');return [.35,.6,.85].some(f=>Math.abs(u-f)<.03)?5:0}});
  A(at('b1'),t=>CDEFS+SPLIT(t,{d:{mouth:one('b1')(t)}}),[1440,520,1.5,1440,510,1.6],0,{snap:1});
  A(at('y1'),t=>CDEFS+SPLIT(t,{y:{mouth:one('y1')(t),brow:1,smile:.1}}),[480,520,1.5,480,510,1.6],0,{whip:1});
  A(at('b2'),t=>CDEFS+SPLIT(t,{d:{mouth:one('b2')(t),brow:1,smile:.4},y:{brow:.9,smile:.5},cry:es(t,at('b2'),at('b2')+1)}),[1440,520,1.5,1440,500,1.7],0,{whip:1});
  A(at('n52'),t=>CDEFS+SPLIT(t,{y:{smile:1.1,brow:-.3,open:.4,bob:-Math.abs(Math.sin(t*8))*8},d:{smile:1.1,brow:-.3,open:.4,bob:-Math.abs(Math.sin(t*8+1))*8}})+TAG(960,180,'2 HOURS','#ffe14d',t,at('n52',.1),D.total,50)+TAG(480,300,'FOOTBALL','#8fe07a',t,at('n52',.45),0,40)+TAG(1440,300,'THE DOG','#ffb84d',t,at('n52',.7),0,40),[960,540,1.0,960,540,1.05]);
  A(at('n53'),t=>CDEFS+SPLIT(t,{y:{smile:.8,brow:0},d:{smile:.8,brow:0}}),[960,560,1.05,960,560,1.12]);
  A(at('n54'),M({osd:T9,night:1,fx:{cry:1,smileCry:1,arm:1,blue:1},mo:{aR:150}}),[1150,560,1.1,1100,540,1.2],0,{whip:1});
  A(at('n55'),M({osd:T9,night:1,fx:{cry:1,smileCry:1,arm:1,blue:1},mo:{aR:150}}),[960,520,1.2,1100,440,1.5]);
  // 7:02 AM, the next day
  A(at('n56'),t=>CDEFS+HALL(t,{cry:1}),[900,540,1.05,820,500,1.2],.4);
  A(at('b3'),t=>CDEFS+HALL(t,{cry:1,d:{mouth:one('b3')(t),smile:.8}})+BUB(620,180,'It suits you better than it ever suited me.',t,at('b3')+.1,{size:34}),[760,460,1.3,760,450,1.4]);
  A(at('n57'),t=>CDEFS+TEXT2(t,'THE TEARS YOU RAN FROM…','…WERE THE BEST PART OF THE YEAR.',at('n57',.15),at('n57',.55),'#4a3a2a','#140f0a','#ffd54d').replace('font-size="96"','font-size="78"').replace('font-size="110"','font-size="78"'),[960,540,1.06,960,540,1.0]);
  A(at('n58'),t=>CDEFS+HALL(t,{laugh:1,mosd:1,cry:.3}),[1100,520,1.0,1500,420,1.9]);
  A(at('n59'),t=>CDEFS+GRID8(t,{cover:at('n59')-3}),[960,540,1.0,960,540,1.08]);
  A(at('n60'),t=>CDEFS+TEXT2(t,'WE NEVER NEEDED THE FUTURE.','WE NEEDED A REASON TO STOP WAITING.',at('n60',.3),at('n60',.62),'#4a3a2a','#140f0a','#ffd54d').replace('font-size="96"','font-size="74"').replace('font-size="110"','font-size="70"'),[960,540,1.06,960,540,1.0]);
  A(at('n61'),t=>CDEFS+PLAIN('#2a3a5a','#0b0826')+dust(t)+`<rect x="760" y="140" width="400" height="300" rx="20" fill="url(#mirg)" stroke="#f3efe6" stroke-width="12"/>${OSD(790,190,t,'TOMORROW',22)}`+POP('WHAT WOULD YOU CHECK FIRST?',960,600,74,'#fff',t,at('n61',.1))+POP('(IT’S YOUR HAIR.)',960,740,70,'#ffe14d',t,at('n61',.7))+CAT(1560,1000,1,t,{look:[-.6,-.2],lick:t>at('n61',.7)}),[960,540,1.06,960,540,1.0]);
  A(at('n62'),t=>CDEFS+PLAIN('#4a3a2a','#140f0a')+dust(t,'#ffd54d')+PH(960,330,.42,CALLSCR(t,.5))+POP('WHO WOULD YOU FINALLY CALL?',960,720,74,'#fff',t,at('n62',.05))+POP('TELL ME IN THE COMMENTS',960,850,56,'#ffd54d',t,at('n62',.35))+POP('…THEN CALL THEM.',960,960,60,'#ff9db5',t,at('n62',.75))+CAT(1600,1020,.9,t,{sleep:1}),[960,540,1.06,960,540,1.0]);
  return S}
let SHOTL=null;
const MIRG=`<defs><linearGradient id="mirg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#b9d6e6"/><stop offset="1" stop-color="#7fa3bf"/></linearGradient><filter id="mblur" x="-20%" y="-5%" width="140%" height="110%"><feGaussianBlur stdDeviation="38 0"/></filter></defs>`;
function camT(c,u,t,s,fx){const k=fx.snap?1-Math.pow(1-cl((t-s)/.3),3):E(u),z=lerp(c[2],c[5],k);let cx=lerp(c[0],c[3],k),cy=lerp(c[1],c[4],k);
  let sh=typeof fx.shake==='function'?fx.shake(t):(fx.shake||0);if(fx.shakeAt&&t>fx.shakeAt&&t<fx.shakeAt+.4)sh=8*(1-(t-fx.shakeAt)/.4);
  if(fx.snap&&t-s<.4)sh=Math.max(sh,(fx.shake||3)*(1-(t-s)/.4));
  cx=cl(cx,960/z,1920-960/z);cy=cl(cy,540/z,1080-540/z);
  const wx=fx.whip&&t-s<.25?(1-E((t-s)/.25))*700:0;
  return `translate(${n(960+Math.sin(t*67)*sh+wx)},${n(540+Math.cos(t*53)*sh)}) scale(${z.toFixed(4)}) translate(${n(-cx)},${n(-cy)})`}
const STAMPS=()=>[[at('n01'),'7:02 AM'],[at('n07'),'7:15 AM'],[at('n12'),'8:00 AM'],[at('n21'),'9:15 AM'],[at('n32'),'12:00 PM'],[at('n42'),'3:00 PM'],[at('n48'),'9:00 PM'],[at('n56'),'7:02 AM · NEXT DAY']];
window.renderAt=function(t){
  if(!SHOTL)SHOTL=SHOTS().sort((a,b)=>a[0]-b[0]);
  let i=0;while(i<SHOTL.length-1&&t>=SHOTL[i+1][0])i++;
  const [s,draw,cam,fade,fx]=SHOTL[i],e=i<SHOTL.length-1?SHOTL[i+1][0]:D.total,u=cl((t-s)/Math.max(.1,e-s));
  const blur=fx.whip&&t-s<.2?' filter="url(#mblur)"':'';
  let g=DEFS+MIRG+`<g transform="${camT(cam,u,t,s,fx)}"${blur}>${draw(t,u)}</g>`;
  if(fade)g+=`<rect width="1920" height="1080" fill="#05040f" opacity="${n(1-es(t,s,s+fade))}"/>`;
  g+=`<rect width="1920" height="1080" fill="url(#vig)"/>`;
  g+=stamp(t,STAMPS());
  const ea=es(t,C.end,C.end+.5);if(ea>0)g+=`<g opacity="${n(ea)}"><rect width="1920" height="1080" fill="#08071a"/>${T(960,500,'FOLLOW',130,'#fff')}${T(960,640,'FOR MORE WHAT IFs',76,'#ffe14d')}</g>`;
  g+=`<rect width="1920" height="1080" fill="#000" opacity="${n(es(t,D.total-.7,D.total-.1))}"/>`;
  document.getElementById('s').innerHTML=g;
};
window.DATA={fps:D.fps,total:D.total};
window.ready=document.fonts.load('600 40px Fredoka').then(()=>{renderAt(+(new URLSearchParams(location.search).get('t')||0));return true});
