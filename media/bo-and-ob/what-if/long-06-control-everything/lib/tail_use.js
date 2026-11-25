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
