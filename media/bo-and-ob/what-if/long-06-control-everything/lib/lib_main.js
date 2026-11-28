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
