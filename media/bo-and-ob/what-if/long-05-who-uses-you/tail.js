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
function THUMB(x,y,s){return `<g transform="translate(${n(x+150*s)},${n(y-420*s)}) scale(${n(s)})"><circle r="34" fill="#f3efe6" stroke="${OUT}" stroke-width="5"/><rect x="-10" y="-80" width="22" height="56" rx="11" fill="#f3efe6" stroke="${OUT}" stroke-width="5"/></g>`}
function PHONEAT(x,y,s){return `<rect x="${n(x+84*s)}" y="${n(y-440*s)}" width="${n(40*s)}" height="${n(80*s)}" rx="${n(8*s)}" fill="#17151f" stroke="${OUT}" stroke-width="${n(4*s)}"/>`}
function DADARM(x,y,s){return `<path d="M ${n(x+420*s)} ${n(y-180*s)} Q ${n(x+200*s)} ${n(y-330*s)} ${n(x+60*s)} ${n(y-250*s)}" stroke="#6b7a8a" stroke-width="${n(46*s)}" fill="none" stroke-linecap="round"/><path d="M ${n(x+420*s)} ${n(y-180*s)} Q ${n(x+200*s)} ${n(y-330*s)} ${n(x+60*s)} ${n(y-250*s)}" stroke="${OUT}" stroke-width="${n(5*s)}" fill="none" opacity=".4"/><circle cx="${n(x+55*s)}" cy="${n(y-250*s)}" r="${n(30*s)}" fill="#6b7a8a" stroke="${OUT}" stroke-width="${n(5*s)}"/>`}
// tomorrow-you: a front-facing YOU plus effects. fx: {cry,bags,hair,box,stomach,palm,thumbs,phone,arm,laugh,blue}
function TMR(x,y,s,t,fx={},o={}){const sw=fx.blue?BLUE:'#f3efe6';
  let q=Object.assign({x,y,s,sw,face:0,smile:fx.cry?-.6:.2,brow:fx.cry?1:.1,open:fx.cry?.55:blink(t,.4),look:[0,0]},o);
  if(fx.laugh){q.smile=1.2;q.brow=-.3;q.open=.3;q.mouth=.35+.3*Math.abs(Math.sin(t*9));q.bob=-Math.abs(Math.sin(t*8))*10*s}
  if(fx.cry&&fx.smileCry){q.smile=.7;q.brow=.6}
  if(fx.stomach){q.aL=170;q.aR=170;q.smile=-.8;q.brow=1;q.sqy=1+.02*Math.sin(t*12)}
  if(fx.palm){q.aL=150;q.aR=150;q.head=12;q.open=.1;q.smile=-.4}
  if(fx.thumbs){q.aR=150;q.smile=1;q.brow=-.3}
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
function CALLSCR(t,u,o={}){let i=`<rect x="-230" y="-440" width="460" height="880" rx="30" fill="#1f2a3a"/><circle cx="0" cy="-160" r="90" fill="${o.av||'#6b7a8a'}"/>${T(0,10,o.name||'DAD',70,'#fff',{flat:1})}${T(0,70,o.conn?'00:'+String(Math.floor(u*59)).padStart(2,'0'):'calling…',36,'#9aa0b5',{flat:1})}`;
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
function TEXT2(t,a,b,ta,tb,c1='#3b2f5a',c2='#0b0826',col='#ffe14d'){return PLAIN(c1,c2)+dust(t)+PEEK(1650,1.1,t,['orange','grey','black','white'][Math.floor(ta)%4])+POP(a,960,470,96,'#fff',t,ta)+POP(b,960,620,110,col,t,tb)}
function STRIKE(x,y,w,t,t0){if(t<t0)return '';const k=es(t,t0,t0+.25);return `<line x1="${x-w/2}" y1="${y}" x2="${n(x-w/2+w*k)}" y2="${y}" stroke="#ff5f5f" stroke-width="16" stroke-linecap="round"/>`}
/* ===== What if you could see who uses you? ===== */
const RED='#e8344a',GOLD='#ffd54d';
// where a front-facing character's hand is. side 1 = right arm (aR), -1 = left arm (aL)
function HANDP(x,y,s,side,a){const r=a*PI/180;return [x+s*(side*64+side*Math.sin(r)*118),y+s*(-228+Math.cos(r)*118)]}
// a string between two points. o: {sag, wob, k (draw 0..1), gold (0..1), flow (+1 toward end, -1 toward start), op}
function STR(x1,y1,x2,y2,w,t,o={}){w=Math.max(1.6,w*.32);const sag=o.sag==null?70:o.sag,wob=Math.sin(t*(o.wf||2.3)+x1*.01+y2*.007)*(o.wob==null?8:o.wob);
  const mx=(x1+x2)/2,my=(y1+y2)/2+sag+wob,d=`M ${n(x1)} ${n(y1)} Q ${n(mx)} ${n(my)} ${n(x2)} ${n(y2)}`,L=Math.hypot(x2-x1,y2-y1)*1.15+40,k=o.k==null?1:cl(o.k),op=o.op==null?1:o.op;
  if(k<=0||op<=0||w<=0)return '';const da=k<1?` stroke-dasharray="${n(L)}" stroke-dashoffset="${n(L*(1-k))}"`:'';const gd=o.gold||0;
  let g=`<g opacity="${n(op)}">`;if(gd>0)g+=`<path d="${d}" stroke="${GOLD}" stroke-width="${n(w*3+16)}" fill="none" opacity="${n(.25*gd)}" filter="url(#blur6)"${da}/>`;
  g+=`<path d="${d}" stroke="#4a0a14" stroke-width="${n(w+1.6)}" fill="none" stroke-linecap="round"${da}/><path d="${d}" stroke="${RED}" stroke-width="${n(w)}" fill="none" stroke-linecap="round"${da}/>`;
  if(gd>0)g+=`<path d="${d}" stroke="${GOLD}" stroke-width="${n(w)}" fill="none" stroke-linecap="round" opacity="${n(gd)}"${da}/>`;
  g+=`<path d="${d}" stroke="#fff" stroke-width="${n(Math.max(.8,w*.25))}" fill="none" stroke-linecap="round" opacity=".3"${da}/>`;
  if(o.flow&&k>=1){for(let i=0;i<4;i++){let u=((t*.45+i/4)%1);if(o.flow<0)u=1-u;const qx=(1-u)*(1-u)*x1+2*u*(1-u)*mx+u*u*x2,qy=(1-u)*(1-u)*y1+2*u*(1-u)*my+u*u*y2;g+=`<circle cx="${n(qx)}" cy="${n(qy)}" r="${n(Math.max(2.5,w*.9))}" fill="${gd>.5?'#fff6c2':'#ffd0d6'}" opacity=".9"/>`}}
  if(gd>.5)g+=GLOW(x1,y1,40,GOLD,.5*gd)+GLOW(x2,y2,40,GOLD,.5*gd);
  return g+`</g>`}
const KNOT=(x,y,w)=>`<circle cx="${n(x)}" cy="${n(y)}" r="${n(Math.max(1.6,w*.32)*.9+4)}" fill="${RED}" stroke="#4a0a14" stroke-width="2"/>`;
function SCISSORS(x,y,s,ang,open){return `<g transform="translate(${n(x)},${n(y)}) rotate(${n(ang)}) scale(${s})"><g transform="rotate(${n(-open)})"><path d="M 0 0 L 170 -14 L 170 6 Z" fill="#cfd6e0" stroke="${OUT}" stroke-width="5"/><circle cx="-60" cy="-30" r="34" fill="none" stroke="#ff5f5f" stroke-width="16"/></g><g transform="rotate(${n(open)})"><path d="M 0 0 L 170 14 L 170 -6 Z" fill="#e6ebf2" stroke="${OUT}" stroke-width="5"/><circle cx="-60" cy="30" r="34" fill="none" stroke="#ff5f5f" stroke-width="16"/></g><circle r="9" fill="#9aa0b5" stroke="${OUT}" stroke-width="4"/></g>`}
// ---------- the wrist close-up ----------
// strings run from the wrist to the right edge. cuts: [[index, time]], out: draw mirrored (other hand), names: labels at the far end
function WRIST(t,o={}){let g=PLAIN(o.c1||'#3a2c4a',o.c2||'#140f22')+dust(t);const N=o.n||7,wx=720,wy=640;
  g+=`<g${o.out?' transform="translate(1920,0) scale(-1,1)"':''}>`;
  for(let i=0;i<N;i++){const ty=120+i*(840/Math.max(1,N-1)),w=(o.w?o.w[i]:6+((i*5)%4)*4);let x2=2000,y2=ty,op=1,k=o.k?cl((t-o.k[i])/.5):1;
    const cut=(o.cuts||[]).find(c=>c[0]===i);if(cut&&t>cut[1]){const u=cl((t-cut[1])/.6);x2=lerp(1100,2300,E(u));y2=ty+Math.sin(u*14)*80*(1-u);op=1-u;
      g+=STR(wx,wy,lerp(1100,900,E(u)),lerp(ty,wy,E(u)),w,t,{sag:20,op:1-u,wob:30*(1-u)})+STR(x2,y2,2100,ty,w,t,{sag:10,op});continue}
    g+=STR(wx,wy,x2,y2,w,t,{sag:40+i*6,k,flow:o.flowDir||1});
    if(o.names&&o.names[i]&&k>=1)g+=`<g transform="translate(${o.out?1920-1640:1640},${n(ty-28)})${o.out?' scale(-1,1)':''}">${T(0,0,o.names[i],30,'#fff')}</g>`}
  g+=`<path d="M -200 1180 Q 300 820 ${wx-40} ${wy+20}" stroke="#f3efe6" stroke-width="150" fill="none" stroke-linecap="round"/><path d="M -200 1180 Q 300 820 ${wx-40} ${wy+20}" stroke="${OUT}" stroke-width="6" fill="none" opacity=".25"/>`;
  g+=`<circle cx="${wx}" cy="${wy}" r="88" fill="#5a4a8a" stroke="${OUT}" stroke-width="7"/><rect x="${wx-110}" y="${wy-30}" width="70" height="90" rx="30" fill="#f3efe6" stroke="${OUT}" stroke-width="6" transform="rotate(-30 ${wx-75} ${wy+15})"/>`;
  for(let i=0;i<N;i++){const cut=(o.cuts||[]).find(c=>c[0]===i);if(!cut||t<cut[1])g+=KNOT(wx+30,wy-10+(i-N/2)*6,6)}
  if(o.scis)g+=SCISSORS(o.scis[0],o.scis[1],1.3,o.scis[2]||-12,o.scis[3]||14);
  g+=`</g>`;return g}
// ---------- sets ----------
function BEDRM(t,o={}){const night=o.night;let g=`<rect width="1920" height="1080" fill="${night?'#1b1636':'#4a3a5a'}"/><rect width="1920" height="1080" fill="url(#beam)" opacity="${night?0:.55}"/>`+WINDOWLIGHT(220,160,420,340,night?'night':'dawn',t);
  g+=`<rect x="1560" y="250" width="280" height="640" fill="#6a4a3a" stroke="${OUT}" stroke-width="7"/><circle cx="1600" cy="580" r="14" fill="#ffd36b"/><rect x="0" y="${FLOOR}" width="1920" height="175" fill="${night?'#120f26':'#2f2440'}"/><rect x="1550" y="890" width="300" height="14" fill="#ffd9a8" opacity="${night?.2:.6}"/>`;
  g+=`<rect x="280" y="640" width="1080" height="80" rx="24" fill="#7a5a4a" stroke="${OUT}" stroke-width="6"/><rect x="330" y="600" width="260" height="110" rx="40" fill="${night?'#8f8ab8':'#f4f0ff'}" stroke="${OUT}" stroke-width="5"/>`;
  const yo=Object.assign({x:760,y:905,face:-.3,smile:.1,brow:.2,open:night?.08:blink(t,.4),aR:o.aR==null?60:o.aR,look:[.4,.2]},o.y||{});g+=YOU(yo);
  const [hx,hy]=HANDP(yo.x,yo.y,1,1,yo.aR);
  g+=`<path d="M 300 760 Q 820 680 1340 760 L 1340 940 L 300 940 Z" fill="${night?'#5b5390':'#b9a8e0'}" stroke="${OUT}" stroke-width="6"/>`;
  if(o.cat)g+=CAT(1120,770,.7,t,o.cat);
  const N=o.n==null?7:o.n;for(let i=0;i<N;i++)g+=STR(hx,hy,1600+i*30,885,4+(i%3)*3,t,{sag:-60+i*25,k:o.k?cl((t-o.k-i*.12)/.5):1,wob:o.twitch&&i===0?30:8,wf:o.twitch&&i===0?14:2.3,gold:o.gold||0});
  if(o.phone)g+=`<g transform="translate(${n(980+(o.buzz?Math.sin(t*70)*4:0))},640) rotate(-8)"><rect x="-40" y="-70" width="80" height="140" rx="14" fill="#17151f" stroke="${OUT}" stroke-width="5"/><rect x="-30" y="-58" width="60" height="110" rx="8" fill="${o.buzz?'#9be7ff':'#2a2640'}"/></g>`+(o.buzz?GLOW(980,640,80,'#9be7ff',.5):'');
  return g+(night?`<rect width="1920" height="1080" fill="#05040f" opacity=".3"/>`:'')}
// people around you, all tied to your wrist
function WEB(t,u){let g=PLAIN('#3b2f5a','#0b0826')+dust(t);const cx=960,cy=980;g+=YOU({x:cx,y:cy,s:.75,face:0,smile:-.1,brow:.6,open:1,aR:120,look:[0,-.5]});const [hx,hy]=HANDP(cx,cy,.75,1,120);
  const P=[[160,520,'#7fa86b',0],[380,300,'#e88f5a',1],[700,170,'#3b4256',0],[1220,170,'#c27aa8',1],[1540,300,'#6fb3d9',0],[1760,520,'#d9a03a',1],[260,820,'#9a7fd9',0],[1660,820,'#f3efe6',1]];
  P.forEach(([x,y,c,w],i)=>{const k=es(u,.05+i*.07,.2+i*.07);if(k<=0)return;g+=`<g transform="translate(${x},${y}) scale(${n(BO(k))})">`+(w?WOMAN:MAN)(c,'#ffd36b',{x:0,y:150,s:.42,face:0,smile:.3,brow:0,open:1,aR:90,look:[0,0]})+`</g>`;g+=STR(x+40,y+90,hx,hy,3+(i%3)*3,t,{sag:30,k:es(u,.1+i*.07,.3+i*.07),flow:1})});
  return g}
function PAIR(t,o={}){let g=PLAIN(o.c1||'#3b2f5a','#0b0826')+dust(t);const A=o.a||{},B=o.b||{};
  g+=YOU(Object.assign({x:560,y:960,face:.5,smile:.1,brow:.4,open:1,aR:40,look:[.6,0]},A));g+=MAN('#d9a03a','#3b4256',Object.assign({x:1360,y:960,face:-.5,smile:.5,brow:0,open:1,aL:40,look:[-.6,.5]},B));
  const [x1,y1]=HANDP(1360,960,1,-1,B.aL||40),[x2,y2]=HANDP(560,960,1,1,A.aR||40);g+=STR(x1,y1,x2,y2,o.w==null?6:o.w,t,{sag:90,flow:1})+KNOT(x2,y2,o.w||6)+KNOT(x1,y1,o.w||6);
  return g}
// two rooms side by side, a string across the divider. L/R: functions (x,y)=>svg; lh/rh: hand points
function SPLIT2(t,o){let g=`<rect width="960" height="1080" fill="${o.bgL||'#3a4a5a'}"/><rect x="960" width="960" height="1080" fill="${o.bgR||'#4a3a2a'}"/>`+GLOW(480,300,320,'#fff6d8',.2)+GLOW(1440,300,320,'#ffd9a8',.3);
  g+=o.L+o.R;if(o.extra)g+=o.extra;
  g+=`<rect x="955" width="10" height="1080" fill="#05040f"/>`;
  if(o.str)g+=STR(o.str[0],o.str[1],o.str[2],o.str[3],o.str[4],t,Object.assign({sag:120},o.so||{}))+KNOT(o.str[0],o.str[1],o.str[4])+KNOT(o.str[2],o.str[3],o.str[4]);
  return g}
function OFFU(t,o={}){let g=OFFICE(t);const P=[[300,'#7fa86b',0],[620,'#c27aa8',1],[960,'#3b4256',0],[1300,'#f3efe6',2],[1620,'#e88f5a',1]];
  P.forEach(([x,c,w],i)=>{const q={x,y:905,s:.9,face:i<3?.4:-.4,smile:.3,brow:0,open:blink(t,i),aR:60,aL:60,look:[i<3?.6:-.6,0]};g+=w===2?YOU(Object.assign(q,o.y||{})):(w?WOMAN:MAN)(c,'#ffd36b',Object.assign(q,i===1?o.claire||{}:{}))});
  g+=`<rect x="0" y="720" width="1920" height="40" fill="#8a6a4c" stroke="${OUT}" stroke-width="5"/>`;for(let i=0;i<5;i++)g+=`<rect x="${200+i*340}" y="640" width="150" height="90" rx="8" fill="#2a2640" stroke="${OUT}" stroke-width="5"/>`;
  g+=`<rect x="1760" y="560" width="140" height="160" rx="10" fill="#d9d2e6" stroke="${OUT}" stroke-width="5"/>`;
  const H=P.map(([x],i)=>HANDP(x,905,.9,1,60));
  if(o.mess)for(let i=0;i<14;i++){const a=H[i%5],b=H[(i*3+2)%5];if(a===b)continue;g+=STR(a[0],a[1],b[0]+((i*37)%60),b[1]-((i*53)%80),3+i%3,t,{sag:-80+((i*71)%200),k:es(t,o.mess+i*.08,o.mess+i*.08+.5)})}
  if(o.newguy)for(let i=0;i<11;i++){const x=120+((i*173)%1700),y=200+((i*97)%380);g+=STR(H[0][0],H[0][1],x,y,4,t,{sag:40,k:es(t,o.newguy+i*.07,o.newguy+i*.07+.4),flow:-1})}
  if(o.cs)g+=STR(H[3][0]-20,H[3][1],H[1][0],H[1][1],o.cs,t,{sag:110,flow:1});
  g+=CAT(1830,560,.55,t,{c:'black',look:[-.6,.3]});
  return g}
function SLIDES(t,u){let g=PLAIN('#2a3a5a','#0b0826')+dust(t);['Q3 PLAN','NEW APP','SAVINGS'].forEach((s,i)=>{const k=BO((u-i*.2)*4);if(u<i*.2)return;g+=`<g transform="translate(${400+i*560},520) rotate(${(i-1)*4}) scale(${n(k)})"><rect x="-230" y="-160" width="460" height="320" rx="16" fill="#fff" stroke="${OUT}" stroke-width="6"/><rect x="-230" y="-160" width="460" height="70" rx="16" fill="#3a7bd5"/>${T(0,-112,s,40,'#fff',{flat:1})}${T(0,10,'by Claire ✨',40,OUT,{flat:1})}<rect x="-150" y="60" width="300" height="20" rx="10" fill="#e0dbea"/></g>`;
    if(u>.65+i*.08)g+=`<g transform="translate(${400+i*560},560) rotate(-14) scale(${n(BO((u-.65-i*.08)*6))})"><rect x="-170" y="-46" width="340" height="92" rx="10" fill="none" stroke="#ff3b3b" stroke-width="10"/>${T(0,18,'YOUR IDEA',54,'#ff3b3b',{flat:1})}</g>`});return g}
function MEETU(t,o={}){let g=`<rect width="1920" height="1080" fill="#cfc8e0"/><rect x="120" y="120" width="760" height="460" rx="14" fill="#fff" stroke="${OUT}" stroke-width="7"/><rect x="120" y="120" width="760" height="90" rx="14" fill="#3a7bd5"/>${T(500,182,'Q4 IDEAS · Claire',46,'#fff',{flat:1})}${T(500,330,'(your idea)',40,'#ff5f5f',{flat:1})}<rect x="0" y="${FLOOR}" width="1920" height="175" fill="#a89fbe"/>`;
  const cl2=Object.assign({x:1000,y:905,s:1,face:-.4,smile:.9,brow:-.3,open:1,aL:150,aR:40,look:[-.6,0]},o.claire||{});g+=WOMAN('#c27aa8','#f3efe6',cl2);
  const B=Object.assign({x:1720,y:905,s:.95,face:-.7,smile:.1,brow:.3,open:1,aR:8,look:[-.8,0]},o.boss||{});g+=MAN('#2a3360','#ffd54d',B);
  const A=[[520,'#7fa86b',0],[880,'#e88f5a',1],[1240,'#f3efe6',2],[1560,'#6fb3d9',1]];
  A.forEach(([x,c,w],i)=>{const q={x,y:1330,s:1.25,face:0,back:1,head:o.turn?(x<1240?8:-8)*o.turn:0};g+=w===2?YOU(q):(w?WOMAN:MAN)(c,'#ffd36b',q)});
  const [cx,cy]=HANDP(cl2.x,cl2.y,1,1,cl2.aR);g+=STR(cx,cy,1300,900,o.w==null?24:o.w,t,{sag:60,flow:1})+KNOT(1300,900,o.w||24);
  return g}
function CAFEU(t,o={}){let g=`<rect width="1920" height="1080" fill="#6a4a3a"/>`+WINDOWLIGHT(660,110,600,380,'day',t)+GLOW(960,300,520,'#ffe9c2',.3)+`<rect x="0" y="${FLOOR}" width="1920" height="175" fill="#4a3226"/>`;
  const M=Object.assign({x:640,y:905,face:.6,smile:1,brow:-.3,open:1,aR:40,aL:40,look:[.8,0]},o.m||{});g+=MAN('#e88f5a','#3b4256',M);
  g+=YOU(Object.assign({x:1240,y:905,face:-.6,smile:.3,brow:.2,open:blink(t,.8),aL:40,look:[-.8,0]},o.y||{}));
  if(o.waiter)g+=MAN('#1d1d26','#f3efe6',{x:1640,y:905,face:-.6,smile:-.2,brow:.6,open:1,aR:100,look:[-.8,0]})+`<rect x="1600" y="720" width="80" height="120" rx="10" fill="#fff" stroke="${OUT}" stroke-width="4"/>${T(1640,790,'BILL',28,OUT,{flat:1})}`;
  g+=`<rect x="760" y="700" width="400" height="30" rx="12" fill="#f3efe6" stroke="${OUT}" stroke-width="6"/><rect x="940" y="730" width="40" height="175" fill="#3a2a20"/>`+CAT(870,700,.45,t,{c:'calico',look:[.6,0]});
  const [mx,my]=HANDP(M.x,M.y,1,1,M.aR);if(o.sy)g+=STR(mx,my,1180,780,o.sy,t,{sag:60,flow:1});
  if(o.sw)g+=STR(mx,my,1590,720,o.sw,t,{sag:-80,k:o.sw2==null?1:o.sw2,flow:1});if(o.sm)g+=STR(mx-140,my,-60,500,o.sm,t,{sag:40,k:o.sm2==null?1:o.sm2,flow:1})+(o.sm2>.9?T(150,470,'→ HIS MUM',34,'#ff9db5'):'');
  return g}
function CROWDW(t,u){let g=CITYBIG(t,1,false);const P=[[180,'#7fa86b',0],[440,'#e88f5a',1],[700,'#3b4256',0],[960,'#c27aa8',1],[1220,'#6fb3d9',0],[1480,'#d9a03a',1],[1740,'#9a7fd9',0]];
  P.forEach(([x,c,w],i)=>{g+=(w?WOMAN:MAN)(c,'#ffd36b',{x,y:905,s:.8,face:0,smile:-.2,brow:.7,open:1,aR:120,look:[.4,.4]});const [hx,hy]=HANDP(x,905,.8,1,120);for(let k=0;k<1+(i*3)%4;k++)g+=STR(hx,hy,hx+200+k*90,hy-300-k*80,3+k,t,{sag:40,k:es(u,.1+i*.06,.4+i*.06)})});
  return g}
function INFLU(t,u){let g=`<rect width="1920" height="1080" fill="#2a1d4a"/><circle cx="960" cy="520" r="300" fill="none" stroke="#fff6d8" stroke-width="40" opacity=".9"/>`+GLOW(960,520,300,'#fff6d8',.35);
  const [hx,hy]=HANDP(960,1000,1,1,150);for(let i=0;i<70;i++){const a=-PI+i/69*PI,k=es(u,i/70*.5,i/70*.5+.2);g+=STR(hx,hy,960+Math.cos(a)*1300,300+Math.sin(a)*900,2,t,{sag:20,k,wob:4})}
  g+=WOMAN('#ff5fa2','#ffd36b',{x:960,y:1000,s:1,face:0,smile:1.1,brow:-.4,open:1,aR:150,look:[0,0]})+`<rect x="1050" y="520" width="56" height="96" rx="10" fill="#17151f"/>`;
  const v=Math.floor(Math.pow(es(u,.1,.8),2)*3e6);g+=`<g transform="translate(960,130)"><rect x="-330" y="-60" width="660" height="110" rx="20" fill="#05040f" opacity=".8"/>${T(0,20,v.toLocaleString('en-US')+' STRINGS',52,RED)}</g>`;
  return g+(u>.7?CARD(960,880,['0','GO BACK'],'#ffe14d',t,V.n26.s+.7*(V.n26.e-V.n26.s)):'')}
function DATING(t,u){let g=PLAIN('#3a1d3a','#0b0612')+dust(t,'#ff9db5');const [hx,hy]=HANDP(1500,1000,1,-1,150);
  for(let i=0;i<40;i++){const x=180+(i%8)*120,y=180+Math.floor(i/8)*130,k=es(u,i/40*.5,i/40*.5+.15);if(k<=0)continue;g+=`<circle cx="${x}" cy="${y}" r="${n(44*BO(k))}" fill="${['#ff9db5','#9be7ff','#ffd36b','#c8f06a'][i%4]}" stroke="${OUT}" stroke-width="4"/>`+T(x,y+12,'♥',30,'#fff',{flat:1})+STR(x,y+40,hx,hy,2,t,{sag:30,k:es(u,.3+i/40*.4,.45+i/40*.4),wob:3})}
  g+=MAN('#3b4256','#c9b8a0',{x:1500,y:1000,s:1,face:-.4,smile:-.4,brow:.9,open:.7,aL:150,look:[-.6,0]});
  return g+(u>.55?CARD(1460,170,['40 MATCHES','“I’M SO LONELY” × 40'],'#ff9db5',t,V.n27.s+.55*(V.n27.e-V.n27.s)):'')}
function SPIDER(t,u){let g=`<rect width="1920" height="1080" fill="url(#daysky)"/><rect x="260" y="80" width="1400" height="1000" fill="#c98a6a" stroke="${OUT}" stroke-width="7"/>`;
  const W=[];for(let r=0;r<5;r++)for(let c=0;c<6;c++){const x=360+c*220,y=150+r*170;W.push([x+70,y+60]);g+=`<rect x="${x}" y="${y}" width="140" height="110" rx="8" fill="#9fd0ea" stroke="#f3efe6" stroke-width="8"/>`}
  const cx=960,cy=560;for(let ring=1;ring<4;ring++)g+=`<circle cx="${cx}" cy="${cy}" r="${ring*150}" fill="none" stroke="#fff" stroke-width="3" opacity="${n(.5*es(u,.2,.5))}"/>`;
  W.forEach(([x,y],i)=>{g+=STR(cx,cy,x,y,3,t,{sag:0,wob:3,k:es(u,i/30*.4,i/30*.4+.2),flow:-1})});
  for(let i=0;i<4;i++)for(const sd of [-1,1])g+=`<path d="M ${cx+sd*60} ${cy-40+i*30} q ${sd*80} ${-60} ${sd*150} ${10+i*20}" stroke="#1d1d26" stroke-width="16" fill="none" stroke-linecap="round" opacity="${n(es(u,.4,.6))}"/>`;
  g+=MAN('#1d1d26','#c0392b',{x:cx,y:cy+260,s:.75,face:0,smile:.8,brow:-.6,open:.6,aR:120,aL:120,look:[0,0]})+`<rect x="${cx-60}" y="${cy-155}" width="120" height="40" fill="#1d1d26" rx="6"/><rect x="${cx-40}" y="${cy-205}" width="80" height="60" fill="#1d1d26" rx="6"/>`;
  return g+(u>.3?CARD(960,980,['LANDLORD','30 FLATS · 30 STRINGS'],'#ff5f5f',t,V.n28.s+.3*(V.n28.e-V.n28.s)):'')}
function GRAN(t,u){let g=`<rect width="1920" height="1080" fill="#e8c9a8"/>`+GLOW(960,400,500,'#fff6d8',.4)+`<rect x="0" y="${FLOOR}" width="1920" height="175" fill="#b98a5a"/><rect x="760" y="560" width="400" height="400" rx="60" fill="#c0573a" stroke="${OUT}" stroke-width="7"/>`;
  g+=mother({x:960,y:905,s:1,sw:'#9a7fd9',sc:'#f3efe6',face:0,smile:1,brow:-.3,open:.5,aL:100,aR:100,look:[0,.4]})+`<path d="M 900 720 L 1020 720" stroke="#ff5fa2" stroke-width="10"/><circle cx="960" cy="740" r="30" fill="#ff5fa2"/>`;
  const [hx,hy]=HANDP(960,905,1,1,100);const K=[[200,'girl'],[420,'char'],[640,'girl'],[1280,'char'],[1500,'girl'],[1720,'char']];
  K.forEach(([x,f],i)=>{const k=es(u,.1+i*.08,.25+i*.08);if(k<=0)return;g+=(f==='girl'?girl:char)({x,y:960,s:.6,face:x<960?.5:-.5,smile:.8,brow:-.2,open:1,aR:100,aL:100,look:[x<960?.8:-.8,-.2]});const [kx,ky]=HANDP(x,960,.6,x<960?1:-1,100);g+=STR(kx,ky,hx,hy,4,t,{sag:60,k,gold:.35,flow:1})});
  for(let i=0;i<8;i++){const q=((t*.3+i/8)%1);g+=`<g opacity="${n((1-q)*es(u,.5,.7))}" transform="translate(${n(960+Math.sin(i*2)*300)},${n(500-q*400)}) scale(.6)"><path d="M 0 30 C -50 0 -40 -40 -14 -34 C -6 -32 0 -24 0 -20 C 0 -24 6 -32 14 -34 C 40 -40 50 0 0 30 Z" fill="#ff5f8f"/></g>`}
  return g+CAT(1150,560,.55,t,{sleep:1,c:'white'})}
function CATHOME(t,o={}){let g=`<rect width="1920" height="1080" fill="#f0d9b5"/>`+GLOW(800,300,500,'#fff6d8',.4)+`<rect x="0" y="${FLOOR}" width="1920" height="175" fill="#c9a07a"/><rect x="200" y="640" width="900" height="60" rx="14" fill="#b97a48" stroke="${OUT}" stroke-width="6"/><rect x="240" y="700" width="40" height="205" fill="#9a6238"/><rect x="1020" y="700" width="40" height="205" fill="#9a6238"/>`;
  g+=`<ellipse cx="420" cy="630" rx="80" ry="22" fill="#c0392b" stroke="${OUT}" stroke-width="5"/><ellipse cx="420" cy="622" rx="58" ry="12" fill="#f3efe6"/>`;
  g+=CAT(640,640,o.cs||1.2,t,{look:o.look||[.7,0],tilt:o.tilt});
  const Y=Object.assign({x:1500,y:905,face:-.6,smile:.2,brow:.4,open:blink(t,.6),aL:60,look:[-.8,0]},o.y||{});g+=YOU(Y);const [yx,yy]=HANDP(Y.x,Y.y,1,-1,Y.aL);
  g+=STR(700,560,yx,yy,o.w||34,t,{sag:120,flow:1})+KNOT(yx,yy,o.w||34);
  return g}
function CATCU(t,u){let g=PLAIN('#f0d9b5','#c9a07a');g+=`<ellipse cx="1250" cy="900" rx="220" ry="60" fill="#c0392b" stroke="${OUT}" stroke-width="7"/><ellipse cx="1250" cy="885" rx="170" ry="34" fill="#f3efe6"/>`;
  g+=CAT(820,1150,2.4,t,{look:[.2,-.3],tilt:Math.sin(t*1.2)*3});
  return g+(u>.65?CARD(1380,300,['DINNER.','NOW.'],'#ffb84d',t,V.n31.s+.65*(V.n31.e-V.n31.s),4):'')}
// living room: you on the sofa, strings out of the right hand to the right edge (or left hand to the left edge)
function SOFAU(t,o={}){let g=`<rect width="1920" height="1080" fill="${o.night?'#1b1636':'#4a3a5a'}"/>`+WINDOWLIGHT(760,120,400,300,o.night?'night':'dusk',t)+`<rect x="0" y="${FLOOR}" width="1920" height="175" fill="#2f2440"/>`;
  const Y=Object.assign({x:960,y:900,face:0,smile:.1,brow:.3,open:blink(t,.5),aR:o.aR==null?70:o.aR,aL:o.aL==null?8:o.aL,look:[0,0]},o.y||{});g+=YOU(Y);
  g+=`<rect x="560" y="700" width="800" height="240" rx="50" fill="#6a5a8a" stroke="${OUT}" stroke-width="7"/><rect x="540" y="800" width="840" height="150" rx="50" fill="#7a6a9a" stroke="${OUT}" stroke-width="7"/>`;
  if(o.cat!==0)g+=CAT(o.catx||1240,800,.6,t,o.cat||{sleep:1});
  const [rx,ry]=HANDP(Y.x,Y.y,1,1,Y.aR),[lx,ly]=HANDP(Y.x,Y.y,1,-1,Y.aL);
  (o.right||[]).forEach(([w,ty,cut,lbl],i)=>{if(cut!=null&&t>cut){const u2=cl((t-cut)/.6);g+=STR(rx,ry,lerp(rx+200,rx+40,E(u2)),lerp(ty,ry,E(u2)),w,t,{sag:10,op:1-u2,wob:40*(1-u2)})+STR(lerp(rx+260,2300,E(u2)),ty+Math.sin(u2*12)*60*(1-u2),2100,ty,w,t,{op:1-u2,sag:0});if(lbl&&u2<.95)g+=TAG(1500,ty-30,lbl,'#fff',t,cut,cut+1.2,34)}else g+=STR(rx,ry,2000,ty,w,t,{sag:50,flow:1})});
  (o.left||[]).forEach(([w,ty,k0],i)=>{g+=STR(lx,ly,-80,ty,w,t,{sag:50,k:k0==null?1:cl((t-k0)/.5),flow:1})});
  if(o.catStr)g+=STR(1260,690,rx,ry,o.catStr,t,{sag:30,flow:1});
  if(o.scis)g+=SCISSORS(o.scis[0],o.scis[1],1,o.scis[2]||-10,o.scis[3]||10);
  return g}
const SAMW=(o={})=>WOMAN('#e88f5a','#ffd36b',Object.assign({x:1440,y:1000,face:-.4,bun:0,bow:1,smile:.2,brow:.4,open:1,aL:40,look:[-.6,0]},o));
const MUMW=(o={})=>mother(Object.assign({x:1440,y:1000,s:1.02,sw:'#c27aa8',sc:'#f3efe6',face:-.4,smile:.3,brow:.3,open:1,aL:40,aR:160,look:[-.6,0]},o));
const YOUL=(o={})=>YOU(Object.assign({x:480,y:1000,face:.4,smile:.2,brow:.3,open:1,aR:40,look:[.6,0]},o));
function TEASE3(t,u){let g=PLAIN('#2a1d4a','#05040f')+dust(t)+PEEK(960,1,t,'orange');[['WHO’S','USING YOU'],['WHO YOU’RE','USING'],['THE ONE','TO KEEP']].forEach((l,i)=>{if(u>.12+i*.25){const k=BO((u-.12-i*.25)*6),c=[RED,'#ffb84d',GOLD][i];g+=`<g transform="translate(${480+i*480},540) scale(${n(k)})"><rect x="-210" y="-210" width="420" height="420" rx="40" fill="#14102e" stroke="${c}" stroke-width="10"/>${T(0,-50,l[0],44,'#fff',{flat:1})}${T(0,20,l[1],44,c)}${T(0,140,'?',100,c)}</g>`}});return g}
function SHOTS(){const S=[];const A=(s,d,c,f,fx)=>S.push([s,d,c||[960,540,1.02,960,540,1.08],f||0,fx||{}]);
  // COLD OPEN — hook: extreme close-up on a wrist with strings, pull back to the bed
  A(0,t=>CDEFS+BEDRM(t,{cat:{sleep:1},n:1,aR:60}),[860,560,2.2,900,620,1.1],.6);
  A(at('n02'),t=>CDEFS+WRIST(t,{k:[0,1,2,3,4,5,6].map(i=>at('n02',.15)+i*.25)}),[900,600,1.25,1100,560,1.0],0,{snap:1});
  A(at('n03'),t=>{const a=at('n03',.25);let g=CDEFS+CITYBIG(t,1,false);g+=STR(-100,1000,1350,420,6,t,{sag:-120,wob:t>a&&t<a+.6?40:8,wf:t>a&&t<a+.6?16:2.3})+`<rect x="1330" y="400" width="40" height="40" fill="#ffe14d" opacity="${n(es(t,a+.4,a+.6))}"/>`+GLOW(1350,420,90,'#ffe14d',.6*es(t,a+.4,a+.6));return g},[1100,500,1.1,1300,440,1.5]);
  A(at('n04'),t=>CDEFS+WEB(t,U(t,'n04')),[960,600,1.05,960,560,1.0]);
  A(at('n05'),t=>{const u=U(t,'n05');return CDEFS+PAIR(t,{w:lerp(3,30,es(u,.1,.55)),b:{look:[-.4,.9],brow:lerp(0,1,es(u,.6,.75)),smile:lerp(.5,-.3,es(u,.6,.75))}})+TAG(960,200,'TAKES MORE = THICKER','#ff9db5',t,at('n05',.2),D.total,44)+TAG(1360,300,'THEY SEE IT TOO','#fff',t,at('n05',.65),D.total,36)},[960,560,1.1,960,520,1.2]);
  A(at('n06'),t=>CDEFS+TEASE3(t,U(t,'n06')),[960,540,1.06,960,540,1.0]);
  A(C.title,t=>{const u=(t-C.title)/1.8;let g=CDEFS+PLAIN('#2a1d4a','#05040f')+GLOW(960,540,500,RED,.12);for(let i=0;i<6;i++)g+=STR(960,320,1960,80+i*100,4+i%3*2,t,{sag:40,k:es(u,i*.06,i*.06+.3)})+STR(960,320,-40,80+i*100,4+i%3*2,t,{sag:40,k:es(u,i*.06,i*.06+.3)});
    return g+`<circle cx="960" cy="320" r="70" fill="#5a4a8a" stroke="${OUT}" stroke-width="7"/>`+POP('WHAT IF YOU COULD SEE',960,580,92,'#fff',u,.05)+POP('WHO USES YOU?',960,720,130,RED,u,.15)+CAT(320,1060,1,t,{look:[.6,-.4]})+CAT(1600,1060,.9,t,{c:'grey',look:[-.6,-.4]})},[960,540,1.15,960,540,1.0]);
  // 7:05 — Jess
  A(at('n07'),t=>CDEFS+BEDRM(t,{cat:{look:[-.6,-.3]},twitch:1,phone:1,buzz:t>at('n07',.6)}),[900,620,1.2,920,640,1.35]);
  A(at('j1'),t=>CDEFS+PLAIN('#3a1d3a','#0b0612')+PEEK(300,1,t,'grey')+PHONE(960,560,.95,t,{name:'Jess 💕',avatar:'#ff9db5',msgs:[{at:at('j1')+.1,text:'Heyyy bestie! Miss you so much!! 💕'},{at:at('j1',.5),text:'Quick favour... airport? At 4am? 🥺'}]}),[960,520,1.15,960,480,1.3]);
  const JESS=(o={})=>WOMAN('#ff9db5','#ffd36b',Object.assign({x:480,y:1000,face:.4,bun:0,bow:1,smile:.9,brow:-.3,open:1,aR:40,look:[.6,0]},o));
  const JY=(o={})=>YOU(Object.assign({x:1440,y:1000,face:-.4,smile:.2,brow:.3,open:1,aL:40,look:[-.6,0]},o));
  const jstr=(w,so)=>{const a=HANDP(480,1000,1,1,40),b=HANDP(1440,1000,1,-1,40);return [a[0],a[1],b[0],b[1],w]};
  A(at('n08'),t=>CDEFS+SPLIT2(t,{L:JESS(),R:JY(),str:jstr(lerp(6,34,es(t,at('n08',.4),at('n08',.75)))),so:{flow:1},bgL:'#5a3a5a',bgR:'#3a4a5a'})+TAG(480,170,'“BEST FRIEND”','#ff9db5',t,at('n08',.15),D.total,46),[960,600,1.05,960,620,1.15]);
  A(at('n09'),t=>CDEFS+PLAIN('#3a1d3a','#0b0612')+PHONE(960,560,.95,t,{name:'Jess 💕',avatar:'#ff9db5',msgs:[{at:at('n09',.1),text:'Miss you!! Lift? 🥺'},{at:at('n09',.3),text:'Miss you! Lend me £50?'},{at:at('n09',.5),text:'Miss u! Need a plus-one'},{at:at('n09',.7),text:'Miss you!! Lift?? 🥺'}]})+PEEK(1600,1,t,'black'),[960,500,1.2,960,480,1.3]);
  A(at('n10'),t=>CDEFS+PLAIN('#3a1d3a','#0b0612')+dust(t,'#ff9db5')+[0,1,2,3,4].map(i=>POP('“MISS YOU SO MUCH”',960+(i%2?160:-160),190+i*150,64,['#ff9db5','#fff'][i%2],t,at('n10',.1+i*.14),(i%2?4:-4))).join(''),[960,540,1.0,960,540,1.1],0,{shakeAt:at('n10',.68)});
  A(at('n11'),t=>CDEFS+PLAIN('#3a1d3a','#0b0612')+PHONE(960,560,.95,t,{name:'Jess 💕',avatar:'#ff9db5',msgs:[{at:-1,text:'Quick favour... airport? At 4am? 🥺'}].concat(t>at('n11',.9)?[{at:at('n11',.9),me:1,text:'No.'}]:[]),input:{at:at('n11',.72),typed:'No.'}}),[960,700,1.4,960,620,1.5],0,{snap:1});
  A(at('n12'),t=>CDEFS+SPLIT2(t,{L:JESS({smile:-.3,brow:.8,aR:40})+(t>at('n12',.3)&&t<at('n12',.75)?`<g transform="translate(480,480)"><rect x="-80" y="-36" width="160" height="72" rx="36" fill="#fff" stroke="${OUT}" stroke-width="5"/>${[0,1,2].map(i=>`<circle cx="${-40+i*40}" cy="0" r="${n(10+4*Math.sin(t*8+i))}" fill="#9aa0b5"/>`).join('')}</g>`:''),R:JY({smile:0,brow:.5}),str:jstr(4),so:{sag:300,wob:3},bgL:'#5a3a5a',bgR:'#3a4a5a'}),[960,620,1.1,960,640,1.0]);
  A(at('n13'),t=>CDEFS+PLAIN('#3a1d3a','#0b0612')+PH(960,560,.95,`<rect x="-230" y="-440" width="460" height="100" rx="30" fill="#fff"/><circle cx="-170" cy="-390" r="30" fill="#ff9db5"/>${T(-120,-378,'jess_xo',34,OUT,{a:'start',flat:1})}<rect x="-230" y="-340" width="460" height="520" fill="#9fd0ea"/><rect x="-200" y="-300" width="180" height="120" rx="20" fill="#fff" opacity=".6"/>`+'')+`<g transform="translate(960,560) scale(.95)">`+WOMAN('#ff9db5','#ffd36b',{x:-70,y:180,s:.55,face:.3,bun:0,bow:1,smile:1,brow:-.3,open:1,aR:150,look:[.3,0]})+MAN('#2a3360','#ffd54d',{x:100,y:180,s:.55,face:-.3,smile:.4,brow:.1,open:1,aL:40,look:[-.3,0]})+STR(-25,90,40,110,5,t,{sag:20,wob:3})+`</g>`+T(960,860,'✈️ my lifesaver!! 💕',36,'#fff')+TAG(960,140,'BRAND NEW STRING','#ff9db5',t,at('n13',.6),D.total,44),[960,540,1.1,960,520,1.2]);
  // 9:15 — the office
  A(at('n14'),t=>CDEFS+OFFU(t,{mess:at('n14',.05)}),[960,520,1.0,960,500,1.1],.3);
  A(at('n15'),t=>CDEFS+OFFU(t,{mess:-9,newguy:at('n15',.1)})+TAG(300,300,'NEW GUY · 11','#ff9db5',t,at('n15',.55),D.total,40),[500,480,1.4,380,460,1.6],0,{snap:1});
  A(at('n16'),t=>CDEFS+OFFU(t,{claire:{smile:1.1,brow:-.4,face:.6,look:[.9,0]},cs:20}),[960,480,1.3,900,460,1.45]);
  A(at('k1'),t=>CDEFS+OFFU(t,{claire:{smile:1,brow:-.4,face:.6,mouth:one('k1')(t),look:[.9,0],aR:110},cs:22})+BUB(620,190,'Love that! Mind if I take it to the meeting?',t,at('k1')+.05,{size:34}),[760,440,1.45,760,430,1.55]);
  A(at('n17'),t=>CDEFS+OFFU(t,{claire:{smile:.9,face:.6,look:[.9,0]},cs:28,y:{brow:.9,smile:-.3}}),[960,640,1.6,960,620,1.75],0,{snap:1});
  A(at('n18'),t=>CDEFS+SLIDES(t,U(t,'n18')),[960,540,1.05,960,540,1.0],0,{whip:1});
  A(at('n19'),t=>CDEFS+MEETU(t,{turn:es(t,at('n19',.55),at('n19',.75))}),[1000,520,1.05,1100,560,1.15]);
  A(at('n20'),t=>CDEFS+MEETU(t,{turn:1,boss:{face:-.9,smile:.4,mouth:t>at('n20',.6)?.3+.3*Math.abs(Math.sin(t*9)):0,look:[-.9,.3]}})+BUB(1720,220,'Why don’t you take it from here?',t,at('n20',.6),{size:34}),[1400,520,1.3,1500,500,1.4]);
  A(at('n21'),t=>CDEFS+MEETU(t,{turn:1,w:lerp(24,4,es(t,at('n21',.5),at('n21',.85))),claire:{smile:lerp(.9,-.5,es(t,at('n21',.4),at('n21',.6))),brow:lerp(-.3,.9,es(t,at('n21',.4),at('n21',.6)))}}),[1150,560,1.4,1150,560,1.5]);
  // 12:30 — Max
  A(at('n22'),t=>CDEFS+CAFEU(t,{m:{mouth:.4+.3*Math.abs(Math.sin(t*10)),bob:-Math.abs(Math.sin(t*9))*8}}),[960,520,1.1,900,500,1.2],.3);
  A(at('x1'),t=>CDEFS+CAFEU(t,{waiter:1,m:{mouth:one('x1')(t),aR:150,aL:150,brow:1,smile:.6}})+BUB(640,190,'Forgot my wallet again!',t,at('x1')+.1,{size:40}),[900,480,1.3,900,470,1.4],0,{snap:1});
  A(at('n23'),t=>CDEFS+CAFEU(t,{waiter:1,sy:16,sw:10,sw2:es(t,at('n23',.45),at('n23',.6)),sm:8,sm2:es(t,at('n23',.7),at('n23',.85))}),[960,540,1.0,960,540,1.06]);
  A(at('n24'),t=>CDEFS+TEXT2(t,'NOT VILLAINS.','JUST USED TO YOU SAYING YES.',at('n24',.45),at('n24',.7)).replace('font-size="110"','font-size="84"'),[960,540,1.06,960,540,1.0]);
  // 2:00 PM — the world
  A(at('n25'),t=>CDEFS+CROWDW(t,U(t,'n25')),[960,540,1.08,960,540,1.0],.3);
  A(at('n26'),t=>CDEFS+INFLU(t,U(t,'n26')),[960,540,1.0,960,560,1.08],0,{whip:1});
  A(at('n27'),t=>CDEFS+DATING(t,U(t,'n27')),[960,540,1.0,1000,520,1.08],0,{whip:1});
  A(at('n28'),t=>CDEFS+SPIDER(t,U(t,'n28')),[960,560,1.25,960,560,1.0],0,{snap:1});
  A(at('n29'),t=>CDEFS+GRAN(t,U(t,'n29')),[960,560,1.0,960,560,1.1],0,{whip:1});
  A(at('n30'),t=>CDEFS+CATHOME(t,{w:lerp(6,40,es(t,at('n30',.5),at('n30',.8)))}),[960,560,1.0,800,520,1.2],0,{whip:1});
  A(at('n31'),t=>CDEFS+CATCU(t,U(t,'n31')),[960,560,1.1,960,560,1.0],0,{snap:1});
  A(at('n32'),t=>CDEFS+TEXT2(t,'THEY WEREN’T WEAK.','THEY NEVER LEARNED TO SAY NO.',at('n32',.4),at('n32',.62)).replace('font-size="110"','font-size="80"'),[960,540,1.06,960,540,1.0]);
  // 4:00 PM — the scissors
  const WN=['NEIGHBOUR (LADDER)','COUSIN (PAYDAY)','GROUP CHAT (YOUR CAR)','JESS','CLAIRE','MAX','THE CAT'];
  A(at('n33'),t=>{const u=U(t,'n33');return CDEFS+WRIST(t,{names:WN,scis:[lerp(1500,1000,es(u,.3,.8)),lerp(1100,620,es(u,.3,.8)),-12,14+Math.sin(t*6)*8]})},[960,560,1.0,960,560,1.08],.3);
  const CUTS=[[0,at('n34',.15)],[1,at('n35',.15)],[2,at('n36',.15)]];
  const SP=i=>{const ty=120+i*(840/6),my=(640+ty)/2+40+i*6,u=.35;return [(1-u)*(1-u)*720+2*u*(1-u)*1360+u*u*2000,(1-u)*(1-u)*640+2*u*(1-u)*my+u*u*ty]};
  const SC=(t,id)=>{const a=at(id,.15),i=['n34','n35','n36'].indexOf(id),[px,py]=SP(i);return [px-170,py+20,-8,t<a?20:t<a+.15?2:16]};
  ['n34','n35','n36'].forEach((id,i)=>{const [px,py]=SP(i);A(at(id),t=>CDEFS+WRIST(t,{names:WN,cuts:CUTS,scis:SC(t,id)})+(t>at(id,.15)&&t<at(id,.15)+.15?`<rect width="1920" height="1080" fill="#fff" opacity=".35"/>`:''),[px,py,1.5,px+40,py,1.6],0,{shakeAt:at(id,.15)})});
  A(at('n37'),t=>{const R=[[6,300,at('n37',.15),'JESS'],[8,440,at('n37',.4),'CLAIRE'],[6,580,at('n37',.65),'MAX']];return CDEFS+SOFAU(t,{right:R,aR:lerp(70,150,es(t,at('n37',.75),at('n37',.95))),y:{smile:lerp(.1,1,es(t,at('n37',.6),at('n37',.9))),brow:-.2}})},[1100,560,1.1,1000,540,1.0]);
  A(at('n38'),t=>CDEFS+SOFAU(t,{catStr:30,y:{smile:.8,brow:-.2}})+TAG(1240,500,'THE CAT’S','#ffb84d',t,at('n38',.5),D.total,40),[1100,600,1.3,1150,620,1.45]);
  // 6:00 PM — the twist
  A(at('n39'),t=>CDEFS+SOFAU(t,{catStr:30,aR:8,y:{smile:.9,brow:-.3,open:.4}}),[960,560,1.05,960,540,1.12],.3);
  A(at('n40'),t=>CDEFS+SOFAU(t,{catStr:30,aR:8,aL:lerp(8,150,es(t,at('n40',.2),at('n40',.5))),left:[[8,300,at('n40',.6)],[6,420,at('n40',.7)],[20,560,at('n40',.8)]],y:{smile:.2,brow:.9,face:-.3,look:[-.6,-.2]}}),[900,600,1.1,840,560,1.7],0,{snap:1});
  A(at('n41'),t=>CDEFS+WRIST(t,{out:1,n:5,flowDir:-1,k:[0,1,2,3,4].map(i=>at('n41',.1)+i*.3),w:[8,6,5,10,26],c1:'#2a1d3a'}),[960,560,1.0,960,560,1.08]);
  A(at('n42'),t=>CDEFS+TEXT2(t,'YOU’RE THE ONE','PULLING.',at('n42',.05),at('n42',.35),'#3a1020','#0b0306',RED),[960,540,1.2,960,540,1.0],0,{shakeAt:at('n42',.35)});
  const yl=HANDP(480,1000,1,1,40),sr=HANDP(1440,1000,1,-1,40);
  A(at('n43'),t=>{const u=U(t,'n43');return CDEFS+SPLIT2(t,{L:YOUL({mouth:.3+.3*Math.abs(Math.sin(t*9)),smile:-.1,brow:.6}),R:SAMW({smile:lerp(.5,-.1,u),brow:.3,open:lerp(1,.6,u)})+CAT(1760,1000,.6,t,{c:'grey',look:[-.6,-.3]}),str:[yl[0],yl[1],sr[0],sr[1],18],so:{flow:-1},bgL:'#3a4a5a',bgR:'#5a4a3a'})+['…and then my boss…','ugh, and THEN…','anyway, me again…'].map((s,i)=>TAG(480,200+i*90,s,'#fff',t,at('n43',.05+i*.15),D.total,32)).join('')+TAG(1440,200,'SAM · 3 YEARS','#ffb84d',t,at('n43',.55),D.total,40)},[960,560,1.05,960,560,1.12]);
  A(at('n44'),t=>CDEFS+SPLIT2(t,{L:YOUL({aR:40,smile:.3}),R:WOMAN('#6fb3d9','#f3efe6',{x:1440,y:1000,face:-.4,smile:-.2,brow:.6,open:1,aL:40,aR:120,look:[-.6,0]})+`<g transform="translate(1560,690) rotate(${n(Math.sin(t*4)*10)})"><circle r="22" fill="none" stroke="#ffd54d" stroke-width="8"/><rect x="18" y="-6" width="60" height="12" fill="#ffd54d"/></g>`,str:[yl[0],yl[1],sr[0],sr[1],12],so:{flow:-1},bgL:'#3a4a5a',bgR:'#2a3a4a'})+TAG(1440,200,'YOUR SISTER (HER CAR)','#6fb3d9',t,at('n44',.3),D.total,38),[960,560,1.05,960,560,1.0],0,{whip:1});
  A(at('n45'),t=>CDEFS+SPLIT2(t,{L:YOUL({aR:40,brow:.5,smile:0}),R:MAN('#2a3360','#ffd54d',{x:1440,y:1000,face:-.4,smile:0,brow:.3,open:1,aL:40,look:[-.6,0]}),str:[yl[0],yl[1],sr[0],sr[1],5],so:{flow:-1},bgL:'#3a4a5a',bgR:'#3a3a4a'})+TAG(1440,200,'OLD BOSS (A REFERENCE)','#9aa0b5',t,at('n45',.4),D.total,36),[960,560,1.05,960,560,1.0],0,{whip:1});
  A(at('n46'),t=>CDEFS+SPLIT2(t,{L:YOUL({aR:40,brow:.9,smile:-.3}),R:MUMW({aR:8,smile:.7,brow:-.1})+CAT(1760,1000,.6,t,{c:'white',look:[-.6,-.3]}),str:[yl[0],yl[1],sr[0],sr[1],lerp(10,44,es(t,at('n46',.55),at('n46',.85)))],so:{flow:-1,sag:150},bgL:'#3a4a5a',bgR:'#6a4a3a'})+TAG(1440,200,'MUM','#ff9db5',t,at('n46',.7),D.total,56),[960,560,1.0,960,600,1.25],0,{whip:1});
  A(at('n47'),t=>CDEFS+PLAIN('#3a2a2a','#0b0606')+PH(960,560,.95,`<rect x="-230" y="-440" width="460" height="110" rx="30" fill="#ece7f6"/>${T(0,-370,'Recent calls',38,OUT,{flat:1})}`+['“Mum, can you…”','“Mum, could you…”','“Mum, I need…”','“Mum, can you…”','“Mum, I need…”'].map((s,i)=>`<g opacity="${n(es(t,at('n47',.05+i*.17),at('n47',.1+i*.17)))}"><rect x="-210" y="${-300+i*130}" width="420" height="110" rx="16" fill="#fff" stroke="#e0dbea" stroke-width="2"/><circle cx="-150" cy="${-245+i*130}" r="30" fill="#c27aa8"/>${T(-100,-235+i*130,s,30,OUT,{a:'start',flat:1})}</g>`).join('')),[960,540,1.1,960,600,1.3]);
  A(at('n48'),t=>CDEFS+PLAIN('#3a2a2a','#0b0606')+dust(t)+CARD(480,300,['BIRTHDAY','CALLED 2 DAYS LATE'],'#ff9db5',t,at('n48',.05),-4)+CARD(1440,520,['VISIT','CUT SHORT'],'#ffb84d',t,at('n48',.35),4)+CARD(700,800,['“I’LL CALL YOU BACK”','NEVER DID'],RED,t,at('n48',.65),-2)+PEEK(1650,1,t,'white'),[960,540,1.0,960,540,1.08]);
  A(at('n49'),t=>CDEFS+TEXT2(t,'THE EASIEST PEOPLE TO USE…','…LOVE YOU TOO MUCH TO SAY NO.',at('n49',.1),at('n49',.55),'#3a2a2a','#0b0606','#ff9db5').replace('font-size="96"','font-size="74"').replace('font-size="110"','font-size="74"'),[960,540,1.06,960,540,1.0]);
  // 8:00 PM — the call
  A(at('n50'),t=>CDEFS+PLAIN('#1f2a3a','#05040f')+PH(960,560,.95,CALLSCR(t,U(t,'n50'),{name:'MUM',av:'#c27aa8'})),[960,500,1.2,960,450,1.4],0,{shake:t=>{const u=U(t,'n50');return [.5,.75].some(f=>Math.abs(u-f)<.03)?5:0}});
  A(at('m1'),t=>CDEFS+SPLIT2(t,{L:YOUL({aR:160,smile:.2,brow:.5})+PHONEAT(480,1000,1),R:MUMW({mouth:one('m1')(t),brow:.8,smile:.1})+PHONEAT(1440,1000,1.02),bgL:'#3a4a5a',bgR:'#6a4a3a'})+BUB(1440,200,'You never just call.',t,at('m1',.6),{size:42}),[1440,520,1.4,1440,510,1.5],0,{snap:1});
  A(at('n51'),t=>CDEFS+SPLIT2(t,{L:YOUL({aR:160,smile:-.5,brow:1.1,open:1.1})+PHONEAT(480,1000,1),R:MUMW({smile:.4})+PHONEAT(1440,1000,1.02),bgL:'#3a4a5a',bgR:'#6a4a3a'})+POP('“YOU NEVER JUST CALL.”',480,330,52,'#ff9db5',t,at('n51',.1)),[480,520,1.5,480,500,1.7]);
  A(at('n52'),t=>CDEFS+SPLIT2(t,{L:YOUL({aR:160,smile:1,brow:-.3,open:.4,bob:-Math.abs(Math.sin(t*8))*8})+PHONEAT(480,1000,1),R:MUMW({smile:1,brow:-.3,open:.4,bob:-Math.abs(Math.sin(t*8+1))*8})+PHONEAT(1440,1000,1.02)+CAT(1760,1000,.6,t,{c:'white',lick:1}),bgL:'#3a4a5a',bgR:'#6a4a3a'})+TAG(960,170,'1 HOUR','#ffe14d',t,at('n52',.05),D.total,48)+TAG(1440,320,'HER KNEE','#fff',t,at('n52',.3),0,36)+TAG(1440,320,'HER GARDEN','#8fe07a',t,at('n52',.55),0,36)+TAG(1440,320,'THE FENCE 😤','#ffb84d',t,at('n52',.8),0,36),[960,540,1.0,960,540,1.05]);
  const ml=HANDP(1440,1000,1.02,-1,40);
  A(at('n53'),t=>{const gd=es(t,at('n53',.35),at('n53',.7));return CDEFS+SPLIT2(t,{L:YOUL({aR:40,smile:.9,brow:-.2}),R:MUMW({aR:8,aL:40,smile:1,brow:-.2}),str:[yl[0],yl[1],ml[0],ml[1],lerp(30,16,gd)],so:{gold:gd,flow:gd>.5?1:-1,sag:120},bgL:'#3a4a5a',bgR:'#6a4a3a'})},[960,640,1.3,960,600,1.1]);
  A(at('n54'),t=>CDEFS+TEXT2(t,'A STRING ISN’T THE PROBLEM.','A ONE-WAY STRING IS.',at('n54',.1),at('n54',.55),'#4a3a2a','#140f0a',GOLD).replace('font-size="96"','font-size="78"'),[960,540,1.06,960,540,1.0]);
  A(at('n55'),t=>{const u=U(t,'n55');return u<.5?CDEFS+PLAIN('#2a3a5a','#0b0826')+PHONE(960,560,.95,t,{name:'Sam',avatar:'#e88f5a',msgs:[{at:at('n55',.05),me:1,text:'Hey! How are YOU doing? 💛'}]}):CDEFS+CAFEU(t,{waiter:1,m:{smile:1.1,brow:-.4,aR:120}})+CARD(960,170,['THIS ONE’S ON ME','NEXT ONE’S YOURS'],GOLD,t,at('n55',.55))},[960,540,1.05,960,540,1.1]);
  A(at('n56'),t=>CDEFS+BEDRM(t,{night:1,n:1,gold:1,aR:40,y:{open:.08,smile:.6},cat:{sleep:1}}),[900,640,1.1,860,640,1.3],.4);
  A(at('n57'),t=>CDEFS+BEDRM(t,{night:1,n:1,gold:1,aR:40,y:{open:.08,smile:.6}})+CAT(820,810,.7,t,{look:[-.3,-.3]})+STR(860,700,900,760,12,t,{sag:30,flow:1}),[820,620,1.7,820,620,1.8]);
  A(at('n58'),t=>CDEFS+TEXT2(t,'BEING USED ISN’T THE WORST THING.','BEING UNNOTICED IS.',at('n58',.3),at('n58',.7),'#2a1d4a','#05040f',GOLD).replace('font-size="96"','font-size="70"'),[960,540,1.06,960,540,1.0]);
  A(at('n59'),t=>CDEFS+WRIST(t,{n:5,w:[6,10,34,8,5],c1:'#2a1d4a'})+POP('WHO’S THE THICKEST STRING',960,140,66,'#fff',t,at('n59',.1))+POP('ON YOUR WRIST?',960,230,74,RED,t,at('n59',.35)),[960,540,1.0,960,540,1.05]);
  A(at('n60'),t=>CDEFS+PLAIN('#4a3a2a','#140f0a')+dust(t,'#ffd54d')+STR(300,500,1620,500,14,t,{sag:80,gold:1,flow:1})+POP('WHOSE WRIST IS YOURS TIED TO?',960,760,70,'#fff',t,at('n60',.05))+POP('TELL ME IN THE COMMENTS',960,870,56,GOLD,t,at('n60',.4))+POP('…THEN CALL THEM. JUST TO CALL.',960,970,54,'#ff9db5',t,at('n60',.75))+CAT(220,520,.9,t,{look:[.6,-.2]})+CAT(1700,520,.85,t,{c:'grey',look:[-.6,-.2]}),[960,540,1.06,960,540,1.0]);
  return S}
let SHOTL=null;
function camT(c,u,t,s,fx){const k=fx.snap?1-Math.pow(1-cl((t-s)/.3),3):E(u),z=lerp(c[2],c[5],k);let cx=lerp(c[0],c[3],k),cy=lerp(c[1],c[4],k);
  let sh=typeof fx.shake==='function'?fx.shake(t):(fx.shake||0);if(fx.shakeAt&&t>fx.shakeAt&&t<fx.shakeAt+.4)sh=8*(1-(t-fx.shakeAt)/.4);
  if(fx.snap&&t-s<.4)sh=Math.max(sh,3*(1-(t-s)/.4));
  cx=cl(cx,960/z,1920-960/z);cy=cl(cy,540/z,1080-540/z);
  const wx=fx.whip&&t-s<.25?(1-E((t-s)/.25))*700:0;
  return `translate(${n(960+Math.sin(t*67)*sh+wx)},${n(540+Math.cos(t*53)*sh)}) scale(${z.toFixed(4)}) translate(${n(-cx)},${n(-cy)})`}
const MBLUR=`<defs><filter id="mblur" x="-20%" y="-5%" width="140%" height="110%"><feGaussianBlur stdDeviation="38 0"/></filter></defs>`;
const STAMPS=()=>[[at('n01'),'7:00 AM'],[at('n07'),'7:05 AM'],[at('n14'),'9:15 AM'],[at('n22'),'12:30 PM'],[at('n25'),'2:00 PM'],[at('n33'),'4:00 PM'],[at('n39'),'6:00 PM'],[at('n50'),'8:00 PM'],[at('n56'),'11:30 PM']];
window.renderAt=function(t){
  if(!SHOTL)SHOTL=SHOTS().sort((a,b)=>a[0]-b[0]);
  let i=0;while(i<SHOTL.length-1&&t>=SHOTL[i+1][0])i++;
  const [s,draw,cam,fade,fx]=SHOTL[i],e=i<SHOTL.length-1?SHOTL[i+1][0]:D.total,u=cl((t-s)/Math.max(.1,e-s));
  const blur=fx.whip&&t-s<.2?' filter="url(#mblur)"':'';
  let g=DEFS+MBLUR+`<g transform="${camT(cam,u,t,s,fx)}"${blur}>${draw(t,u)}</g>`;
  if(fade)g+=`<rect width="1920" height="1080" fill="#05040f" opacity="${n(1-es(t,s,s+fade))}"/>`;
  g+=`<rect width="1920" height="1080" fill="url(#vig)"/>`;
  g+=stamp(t,STAMPS());
  const ea=es(t,C.end,C.end+.5);if(ea>0)g+=`<g opacity="${n(ea)}"><rect width="1920" height="1080" fill="#08071a"/>${T(960,500,'FOLLOW',130,'#fff')}${T(960,640,'FOR MORE WHAT IFs',76,'#ffe14d')}</g>`;
  g+=`<rect width="1920" height="1080" fill="#000" opacity="${n(es(t,D.total-.7,D.total-.1))}"/>`;
  document.getElementById('s').innerHTML=g;
};
window.DATA={fps:D.fps,total:D.total};
window.ready=document.fonts.load('600 40px Fredoka').then(()=>{renderAt(+(new URLSearchParams(location.search).get('t')||0));return true});
