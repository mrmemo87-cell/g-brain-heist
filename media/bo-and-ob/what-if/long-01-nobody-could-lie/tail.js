/* ===== What if nobody could lie for 24 hours? ===== */
const kidT=one('k1'),colT=one('c1'),intT=one('i1'),candT=one('j1'),salT=one('s1'),polT=one('z1'),ceoT=one('e1'),dateT=one('d1');
function PLAIN(c1,c2){return `<defs><radialGradient id="pl${c1.slice(1)}" cx=".5" cy=".45" r=".8"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></radialGradient></defs><rect width="1920" height="1080" fill="url(#pl${c1.slice(1)})"/>`}
function dust(t,c='#fff',nn=40){let g='';for(let i=0;i<nn;i++){const x=(i*173+t*20*(1+i%3))%1960-20,y=(i*97-t*14*(1+i%2))%1120;g+=`<circle cx="${n(x)}" cy="${n((y+1120)%1120)}" r="${2+i%3}" fill="${c}" opacity="${n(.15+.2*Math.abs(Math.sin(t+i)))}"/>`}return g}
function EARTH(t,cx,cy,R,wave){let g=`<defs><clipPath id="ea"><circle cx="${cx}" cy="${cy}" r="${R}"/></clipPath></defs>`+GLOW(cx,cy,R*1.25,'#5f8cff',.35)+`<circle cx="${cx}" cy="${cy}" r="${R}" fill="#16285a"/><g clip-path="url(#ea)">`;
  for(let i=0;i<7;i++){const x=cx-R+((t*18+i*230)%(2*R+400))-200,y=cy-R*.6+(i*131)%(R*1.2);g+=`<ellipse cx="${n(x)}" cy="${n(y)}" rx="${120+i*20}" ry="${70+i*12}" fill="#1f3a6e"/>`;for(let k=0;k<14;k++)g+=`<circle cx="${n(x-90+(k*37)%180)}" cy="${n(y-40+(k*23)%80)}" r="3" fill="#ffd36b" opacity="${n(.6+.4*Math.sin(t*2+k))}"/>`}
  if(wave>0)g+=`<circle cx="${cx}" cy="${cy}" r="${n(R*2*wave)}" fill="none" stroke="#fff" stroke-width="${n(30*(1-wave))}" opacity="${n(1-wave)}"/>`;
  return g+`<circle cx="${n(cx-R*.3)}" cy="${n(cy-R*.3)}" r="${R}" fill="#fff" opacity=".05"/></g><circle cx="${cx}" cy="${cy}" r="${R}" fill="none" stroke="#9fb6ff" stroke-width="4" opacity=".6"/>`}
function DIARY(t,u){let g=PLAIN('#3b2f5a','#140f2a')+dust(t)+`<g transform="translate(960,560) rotate(-3)"><rect x="-620" y="-330" width="1240" height="660" rx="24" fill="#f6efdc" stroke="${OUT}" stroke-width="8"/><line x1="0" y1="-330" x2="0" y2="330" stroke="#c9bb9a" stroke-width="6"/>`;
  const days=['MON','TUE','WED','THU','FRI','SAT','SUN'],marks=[2,1,2,1,2,1,1];
  days.forEach((d,i)=>{const col=i<4?0:1,row=i<4?i:i-4,x=col?60:-580,y=-230+row*130;g+=T(x+60,y,d,40,'#5a4a3a',{a:'start',flat:1});
    for(let m=0;m<marks[i];m++){const a=es(u,.1+i*.09+m*.04,.16+i*.09+m*.04);if(a>0)g+=`<line x1="${x+200+m*40}" y1="${y-40}" x2="${n(x+200+m*40)}" y2="${n(y-40+50*a)}" stroke="#c0392b" stroke-width="9" stroke-linecap="round"/>`}});
  return g+`</g>`+POP('1–2 LIES A DAY',960,190,96,'#ffe14d',0,0)+T(1880,1050,'DePaulo et al., 1996',30,'#cfc8e6',{a:'end',flat:1,op:.8})}
function BENCH(t,u){let g=`<rect width="1920" height="1080" fill="url(#daysky)"/><rect x="0" y="760" width="1920" height="320" fill="#7fc07a"/>`+[200,1500,1750].map(x=>`<circle cx="${x}" cy="560" r="140" fill="#5aa860"/><rect x="${x-14}" y="600" width="28" height="200" fill="#7a5a3c"/>`).join('');
  g+=`<rect x="600" y="760" width="720" height="34" rx="12" fill="#a0683e" stroke="${OUT}" stroke-width="6"/><rect x="600" y="690" width="720" height="26" rx="10" fill="#a0683e" stroke="${OUT}" stroke-width="6"/>`;
  g+=MAN('#7fa86b','#f3efe6',{x:780,y:905,face:.6,smile:.6,mouth:Math.max(0,Math.sin(t*9))*.6*(Math.sin(t*1.3)>0?1:0),look:[.8,0]})+WOMAN('#e88f5a','#f3efe6',{x:1140,y:905,face:-.6,smile:.6,mouth:Math.max(0,Math.sin(t*9+1))*.6*(Math.sin(t*1.3)<=0?1:0),look:[-.8,0]});
  g+=`<rect x="600" y="760" width="720" height="34" rx="12" fill="#a0683e" stroke="${OUT}" stroke-width="6"/>`;
  [.25,.45,.62,.8].forEach((f,i)=>{g+=POP('LIE!',i%2?1140:780,330,64,'#ff5f5f',u,f)});
  const left=Math.max(0,600-Math.floor(u*600*1.15));g+=`<g transform="translate(1600,200)"><rect x="-170" y="-70" width="340" height="120" rx="22" fill="#05040f" opacity=".8"/>${T(0,24,Math.floor(left/60)+':'+String(left%60).padStart(2,'0'),70,'#fff',{ls:4})}</g>`;
  return g+POP('60%',300,250,150,'#ffe14d',u,.5)+T(1880,1050,'Feldman et al., 2002',30,'#2a2450',{a:'end',flat:1,op:.8})}
function TINY(t,u){let g=PLAIN('#5b4a8a','#1c1538')+dust(t);
  [['I’m fine.',480,380,.08],['Love the haircut!',1300,330,.36],['On my way!',900,700,.66]].forEach(([s,x,y,f])=>{g+=BUB(x,y+Math.sin(t*2+x)*10,s,u,f,{size:60,side:0})+(u>f+.05?GLOW(x,y,160,'#ff9db5',.12):'')});
  return g}
function GLUE(t,u){let g=PLAIN('#5b4a8a','#1c1538')+dust(t);const snap=es(u,.55,.62);
  const B=[['I’m fine.',420,300],['Love it!',1500,300],['On my way!',380,760],['Great idea!',1540,760],['No, you look great.',960,200]];
  g+=YOU({x:960,y:960,face:0,smile:lerp(.3,-.6,snap),brow:lerp(0,1,snap),open:1.05,aL:60,aR:60});
  B.forEach(([s,x,y],i)=>{const fall=snap*Math.pow(cl((u-.6)/.4),2)*900,yy=y+fall,rot=snap*(i%2?20:-20)*cl((u-.6)/.4);
    if(snap<1)g+=`<path d="M 960 640 Q ${n((960+x)/2)} ${n((640+yy)/2+80)} ${x} ${n(yy)}" stroke="#f6e7a8" stroke-width="10" fill="none" stroke-dasharray="${snap>0?'20 30':'none'}" opacity="${n(1-snap)}"/>`;
    g+=`<g transform="rotate(${n(rot)} ${x} ${n(yy)})">${BUB(x,yy,s,1,0,{size:50})}</g>`});
  return g}
function MEETING(t,o={}){let g=OFFICE(t);g+=`<rect x="1250" y="200" width="520" height="360" rx="12" fill="#fff" stroke="#8a86b8" stroke-width="10"/>${T(1510,270,'THE PLAN',54,OUT)}<polyline points="1320,500 1420,430 1520,470 1640,320" fill="none" stroke="#3a7bd5" stroke-width="12"/><polygon points="1640,320 1610,330 1630,355" fill="#3a7bd5"/>`;
  if(o.tear)g+=`<path d="M 1500 200 l 20 60 l -30 60 l 30 60 l -20 60 l 25 60" stroke="#d9d2e6" stroke-width="${n(30*o.tear)}" fill="none"/>`;
  const P=[[300,'#7fa86b',0],[520,'#e88f5a',1],[740,'#3b4256',0],[960,'#c27aa8',1],[1150,'#f3efe6',0]];
  P.forEach(([x,c,w],i)=>{const shake=o.shake?Math.sin(t*10+i)*8*o.shake:0;g+=(w?WOMAN:MAN)(c,'#ffd36b',{x,y:905,s:.9,face:.5,head:shake,smile:o.shake?-.3:.3,brow:o.shake?.8:0,open:blink(t,i*.7),mouth:i===1?colT(t):0,look:[.6,0]})});
  return g+`<rect x="150" y="720" width="1160" height="40" rx="14" fill="#7a5a3c" stroke="${OUT}" stroke-width="6"/><rect x="200" y="760" width="40" height="150" fill="#5a4030"/><rect x="1220" y="760" width="40" height="150" fill="#5a4030"/>`}
function INTERVIEW(t,o={}){let g=OFFICE(t);g+=WOMAN('#3b4256','#f3efe6',{x:620,y:905,face:.7,smile:.2,brow:o.ib||0,open:blink(t,.3),mouth:intT(t),look:[.8,0]})+MAN('#9aa0b5','#3a7bd5',{x:1300,y:905,face:-.7,smile:o.cs==null?-.3:o.cs,brow:.9,open:blink(t,.8),mouth:candT(t),look:[-.8,0]});
  g+=`<rect x="420" y="700" width="1080" height="40" rx="14" fill="#5a4a6a" stroke="${OUT}" stroke-width="6"/><rect x="460" y="740" width="1000" height="170" fill="#4a3e5a" stroke="${OUT}" stroke-width="6"/><rect x="820" y="650" width="230" height="56" rx="6" fill="#fff" stroke="${OUT}" stroke-width="4" transform="rotate(-6 935 678)"/>${T(935,690,'CV',30,OUT)}`;
  if(o.sweat)g+=`<path d="M 1360 470 q 14 26 0 36 q -14 -10 0 -36 Z" fill="#9be7ff" stroke="#fff" stroke-width="3" transform="translate(0,${n((t*60)%50)})"/>`;
  return g}
function BILLBOARD(t,u,wipe){let g=CITYBIG(t,1,false)+`<rect x="380" y="150" width="1160" height="480" rx="16" fill="#2a2240"/><rect x="400" y="170" width="1120" height="440" fill="#ffd54d"/>`;
  g+=`<circle cx="620" cy="420" r="150" fill="#e0883a" stroke="${OUT}" stroke-width="8"/><rect x="470" y="400" width="300" height="40" fill="#7a3a1a"/><rect x="480" y="370" width="280" height="26" rx="10" fill="#6fbf5a"/>`;
  g+=`<defs><clipPath id="wipe"><rect x="${n(400+1120*(1-wipe))}" y="170" width="${n(1120*wipe)}" height="440"/></clipPath></defs>`;
  g+=T(1120,330,'THE BEST BURGER',72,'#c0392b')+T(1120,420,'IN THE UNIVERSE',72,'#c0392b')+T(1120,520,'★★★★★',60,'#c0392b');
  g+=`<g clip-path="url(#wipe)"><rect x="400" y="170" width="1120" height="440" fill="#f6efdc"/>`+T(960,330,'IT’S FINE.',90,OUT)+T(960,440,'IT’S FAST.',90,OUT)+T(960,550,'YOU WERE HUNGRY.',90,'#c0392b')+`</g>`;
  if(wipe>0&&wipe<1)g+=`<rect x="${n(400+1120*(1-wipe)-30)}" y="160" width="40" height="460" fill="#fff" opacity=".8"/>`;
  return g+`<rect x="930" y="630" width="60" height="280" fill="#2a2240"/>`}
function CARLOT(t,o={}){let g=`<rect width="1920" height="1080" fill="url(#daysky)"/><rect x="0" y="${FLOOR}" width="1920" height="175" fill="#9a94ac"/>`;
  for(let i=0;i<14;i++)g+=`<polygon points="${i*140},120 ${i*140+140},120 ${i*140+70},200" fill="${['#ff5f5f','#ffd54d','#3a7bd5'][i%3]}" transform="rotate(${n(Math.sin(t*3+i)*4)} ${i*140+70} 120)"/>`;
  g+=`<line x1="0" y1="120" x2="1920" y2="120" stroke="#fff" stroke-width="6"/>`;
  g+=CAR(1200,860,'#3a7bd5',1.3,o.dent);if(o.dent)for(let i=0;i<4;i++){const u=((t*.6+i/4)%1);g+=`<circle cx="${n(1480+u*60)}" cy="${n(700-u*260)}" r="${n(30+u*50)}" fill="#bbb" opacity="${n(.5*(1-u))}"/>`}
  g+=MAN('#e8d25a','#c0392b',{x:560,y:905,face:.6,aR:o.salesArm||110+Math.sin(t*5)*15,smile:o.ss==null?1:o.ss,brow:o.sb||-.3,open:blink(t,.2),mouth:salT(t),look:[.7,0]})+MAN('#7fa86b','#f3efe6',{x:260,y:905,face:.6,smile:0,brow:.3,open:blink(t,.9),look:[.8,0]});
  return g}
function REVIEWS(t,u){let g=PLAIN('#2a2450','#0b0826')+`<rect x="360" y="90" width="1200" height="760" rx="30" fill="#1b1830" stroke="#4a4570" stroke-width="12"/><rect x="390" y="120" width="1140" height="700" rx="14" fill="#f4f1fa"/><defs><clipPath id="scr"><rect x="390" y="120" width="1140" height="700" rx="14"/></clipPath></defs><g clip-path="url(#scr)">`;
  const R=[['★★★☆☆','It’s a chair. You sit on it.','Dave'],['★☆☆☆☆','Bought it to impress my neighbour. He was not impressed.','Priya'],['★★★★★','Genuinely good. I’m as surprised as you are.','Tom'],['★★☆☆☆','Smells like a wet dog. I kept it anyway.','Ana'],['★★★★☆','Does what it says. Says very little.','Kenji']];
  R.forEach(([s,txt,who],i)=>{const y=200+i*190-u*260;g+=`<rect x="430" y="${n(y-60)}" width="1060" height="160" rx="18" fill="#fff" stroke="#e1dbee" stroke-width="3"/>`+T(470,y,s,44,'#e0a83a',{a:'start',flat:1})+T(470,y+60,txt,38,OUT,{a:'start',flat:1})+T(1450,y,'— '+who,32,'#8a86a8',{a:'end',flat:1})+`<rect x="1250" y="${n(y+76)}" width="220" height="40" rx="20" fill="#4caf6a"/>`+T(1360,y+105,'VERIFIED TRUE',22,'#fff',{flat:1})});
  return g+`</g><rect x="860" y="850" width="200" height="40" fill="#1b1830"/><rect x="660" y="886" width="600" height="26" rx="10" fill="#2a2640"/>`}
function PODIUM(t,o={}){let g=`<rect width="1920" height="1080" fill="#1d2a5a"/>`;for(let i=0;i<12;i++)g+=`<rect x="${i*170}" y="0" width="80" height="1080" fill="#22306a"/>`;
  g+=`<rect x="300" y="160" width="12" height="600" fill="#c9b27a"/><path d="M 312 170 q 120 30 220 0 v 200 q -100 30 -220 0 Z" fill="#c0392b"/><rect x="1610" y="160" width="12" height="600" fill="#c9b27a"/><path d="M 1622 170 q 120 30 220 0 v 200 q -100 30 -220 0 Z" fill="#3a7bd5"/>`;
  g+=MAN('#2a3360','#c0392b',{x:o.px||960,y:905,s:1.05,face:o.pf==null?0:o.pf,smile:o.ps==null?.2:o.ps,brow:o.pb||.2,open:blink(t,.5),mouth:polT(t),look:[0,0],walk:o.walk?t*7:null})+`<rect x="780" y="640" width="360" height="300" rx="10" fill="#6a4a2a" stroke="${OUT}" stroke-width="8"/><circle cx="960" cy="760" r="56" fill="#c9b27a" stroke="${OUT}" stroke-width="6"/><line x1="840" y1="645" x2="880" y2="600" stroke="#222" stroke-width="10"/><ellipse cx="886" cy="592" rx="16" ry="22" fill="#222" transform="rotate(35 886 592)"/>`;
  for(let i=0;i<9;i++)g+=shape({x:120+i*210,y:1200,s:.75,eyes:0});
  for(let i=0;i<6;i++){const k=Math.floor(t*7+i*3.7)%9;if(k===0)g+=GLOW(200+((i*331)%1500),900,140,'#fff',.8)}
  return g}
function TVROOM(t,u){let g=PLAIN('#2a2040','#0b0826')+`<rect x="460" y="160" width="1000" height="600" rx="20" fill="#14121c" stroke="#3a3650" stroke-width="16"/><rect x="490" y="190" width="940" height="540" fill="#1d2a5a"/>`;
  g+=`<defs><clipPath id="tvc"><rect x="490" y="190" width="940" height="540"/></clipPath></defs><g clip-path="url(#tvc)">`+MAN('#2a3360','#c0392b',{x:960,y:880,s:.9,face:0,smile:-.2,brow:.3,open:1,mouth:Math.max(0,Math.sin(t*9))*.5,look:[0,0]})+`</g><rect x="490" y="660" width="940" height="70" fill="#c0392b"/>`+T(960,710,'LIVE · SPEECH LENGTH: 0:07',40,'#fff',{flat:1});
  const v=Math.floor(Math.pow(u,1.5)*3.1e9);g+=`<g transform="translate(960,880)"><rect x="-430" y="-70" width="860" height="120" rx="24" fill="#05040f" opacity=".85"/>${T(0,24,v.toLocaleString('en-US')+' WATCHING',62,'#ffe14d',{ls:3})}</g>`;
  return g}
function CALL(t,o={}){let g=`<rect width="1920" height="1080" fill="#14121c"/>`;const tiles=[[40,40,'#3a3a5a'],[980,40,'#3a3a5a'],[40,560,'#3a3a5a'],[980,560,'#3a3a5a']];
  tiles.forEach(([x,y,c],i)=>{g+=`<defs><clipPath id="ct${i}"><rect x="${x}" y="${y}" width="900" height="480" rx="20"/></clipPath></defs><g clip-path="url(#ct${i})"><rect x="${x}" y="${y}" width="900" height="480" fill="${['#2a3360','#4a3e5a','#3e5a4a','#5a4a3e'][i]}"/>`+(i===0?MAN('#1d1d26','#c0392b',{x:x+450,y:y+700,s:1.2,face:0,smile:o.cs==null?.8:o.cs,brow:o.cb||-.2,open:blink(t,.1),mouth:ceoT(t),look:[0,0]}):MAN(['','#7fa86b','#e88f5a','#9aa0b5'][i],'#f3efe6',{x:x+450,y:y+680,s:1.1,face:0,smile:o.shock?-.6:.2,brow:o.shock?1.2:0,open:o.shock?1.15:blink(t,i),mouth:o.shock?.6:0,look:[0,0]}))+`</g><rect x="${x}" y="${y}" width="900" height="480" rx="20" fill="none" stroke="${i===0&&ceoT(t)>.05?'#4caf6a':'#2a2840'}" stroke-width="8"/>`+T(x+30,y+450,['CEO','ANALYST','ANALYST','ANALYST'][i],30,'#fff',{a:'start',flat:1})});
  return g}
function STOCK(t,u){let g=PLAIN('#1a1530','#05040f')+`<rect x="160" y="110" width="1600" height="700" rx="20" fill="#0b0a14" stroke="#2a2840" stroke-width="10"/>`;
  let p=`M 200 300`;const N=60;for(let i=1;i<=N;i++){const f=i/N;if(f>u*1.25)break;const y=300+Math.sin(i*1.7)*30+(f>.45?Math.pow((f-.45)/.55,1.6)*420:0);p+=` L ${n(200+f*1520)} ${n(y)}`}
  g+=`<path d="${p}" fill="none" stroke="${u>.4?'#ff3b3b':'#4caf6a'}" stroke-width="10" stroke-linejoin="round"/>`;
  const pct=-Math.round(es(u,.35,.75)*38*10)/10;g+=T(1700,200,(pct<0?'':'+')+pct.toFixed(1)+'%',96,pct<0?'#ff3b3b':'#4caf6a',{a:'end'});
  for(let i=0;i<7;i++)g+=shape({x:220+i*250,y:1150,s:.7,eyes:1,arm:es(u,.45+i*.03,.55+i*.03)*125,side:i%2?1:-1,look:0});
  return g}
function COLLAPSE(t,u,k,label){let g=PLAIN('#3a1020','#0b0510')+dust(t,'#ff9db5');const rev=[k>=0,k>=1,k>=2,k>=3];
  const show=rev.map((r,i)=>i===k?(u>.25):r);g+=tiles4(t,show,k);if(u>.25)g+=POP(label,960,280,90,k===3?'#ffd54d':'#ff5f5f',u*3,.75);
  const shake=pulse(u,.25,.4,.05)*14;return `<g transform="translate(${n(Math.sin(t*80)*shake)},0)">${g}</g>`}
function INTERRO(t,o={}){let g=`<rect width="1920" height="1080" fill="#14121c"/>`;const sw=Math.sin(t*1.6)*10;
  g+=`<g transform="rotate(${n(sw)} 960 0)"><line x1="960" y1="0" x2="960" y2="300" stroke="#444" stroke-width="6"/><path d="M 880 300 L 1040 300 L 1000 250 L 920 250 Z" fill="#555"/><polygon points="880,300 1040,300 1400,1080 520,1080" fill="#fff3c2" opacity=".14"/></g>`+GLOW(960,560,420,'#fff3c2',.2);
  g+=MAN('#3b4256','#9aa0b5',{x:600,y:905,face:.7,smile:-.2,brow:.6,open:blink(t,.4),look:[.8,0]})+MAN('#e8d25a','#5a4a3a',{x:1320,y:905,face:-.7,smile:o.yes?.2:-.4,brow:o.yes?-.3:.8,open:blink(t,.9),mouth:o.yes?pulse(t,o.yes,o.yes+.8,.1)*.7:0,look:[-.8,0]});
  return g+`<rect x="560" y="720" width="800" height="40" rx="12" fill="#3a3448" stroke="${OUT}" stroke-width="6"/><rect x="600" y="760" width="720" height="150" fill="#2a2638"/>`}
function COURT(t,u){let g=`<rect width="1920" height="1080" fill="#5a3a2a"/>`;for(let i=0;i<10;i++)g+=`<rect x="${i*200}" y="0" width="100" height="1080" fill="#62402e"/>`;
  g+=`<rect x="560" y="420" width="800" height="490" fill="#7a4a2a" stroke="${OUT}" stroke-width="8"/>`+MAN('#1d1d26','#f3efe6',{x:960,y:520,s:.9,face:0,aR:110+Math.abs(Math.sin(t*8))*40,smile:.4,brow:-.2,open:1,look:[0,0]});
  const bang=Math.abs(Math.sin(t*8));g+=`<g transform="translate(1060,${n(250+bang*60)}) rotate(${n(-30+bang*40)})"><rect x="-20" y="-30" width="140" height="60" rx="14" fill="#a0683e" stroke="${OUT}" stroke-width="6"/><rect x="40" y="20" width="16" height="120" fill="#a0683e" stroke="${OUT}" stroke-width="5"/></g>`;
  for(let i=0;i<10;i++){const k=((t*1.2+i/10)%1),x=-200+k*2300,y=780-Math.sin(k*PI)*500+(i%3)*30;g+=`<g transform="translate(${n(x)},${n(y)}) rotate(${n(k*360)})"><rect x="-70" y="-50" width="140" height="100" rx="6" fill="#f6efdc" stroke="${OUT}" stroke-width="5"/><rect x="-60" y="-12" width="120" height="30" fill="none" stroke="#c0392b" stroke-width="5" transform="rotate(-12)"/>${T(0,10,'CLOSED',22,'#c0392b',{flat:1})}</g>`}
  const c=Math.floor(Math.pow(u,1.3)*1847213);g+=`<g transform="translate(960,120)"><rect x="-470" y="-70" width="940" height="120" rx="24" fill="#05040f" opacity=".85"/>${T(0,24,'CASES CLOSED: '+c.toLocaleString('en-US'),62,'#ffe14d',{ls:2})}</g>`;
  if(u>.6)g+=POP('INNOCENT? FREE.',960,980,80,'#4caf6a',u*3,1.8);
  return g}
function POKER(t,u){let g=`<rect width="1920" height="1080" fill="#14121c"/>`+GLOW(960,500,600,'#fff3c2',.25)+`<ellipse cx="960" cy="860" rx="900" ry="260" fill="#1f6a45" stroke="#6a4a2a" stroke-width="30"/>`;
  const P=[[360,'#7fa86b'],[760,'#e88f5a'],[1160,'#3b4256'],[1560,'#c27aa8']];
  P.forEach(([x,c],i)=>{const sh=es(u,.15+i*.1,.25+i*.1);g+=MAN(c,'#ffd36b',{x,y:780,s:.85,face:0,smile:lerp(.5,-.5,sh),brow:lerp(-.3,1,sh),open:1,look:[0,.4]})+`<g transform="translate(${x},760)">`+[0,1].map(k=>`<g transform="rotate(${n(lerp(-10+k*20,(k?1:-1)*30,sh))}) translate(${k?20:-60},${n(-60+sh*40)})"><rect width="80" height="112" rx="10" fill="${sh>.5?'#fff':'#c0392b'}" stroke="${OUT}" stroke-width="5"/>${sh>.5?T(40,74,['2','7','3','9','4','5','8','2'][i*2+k],50,OUT,{flat:1}):''}</g>`).join('')+`</g>`;if(sh>.5)g+=BUB(x,300,'I have nothing.',u*4,(.25+i*.1)*4,{size:30})});
  for(let i=0;i<20;i++)g+=`<ellipse cx="${n(700+(i*67)%520)}" cy="${n(880+(i*29)%60)}" rx="34" ry="12" fill="${['#ff5f5f','#3a7bd5','#ffd54d'][i%3]}" stroke="${OUT}" stroke-width="4"/>`;
  return g+(u>.75?`<g transform="translate(960,150) rotate(-4)"><rect x="-300" y="-70" width="600" height="120" rx="16" fill="#c0392b" stroke="#fff" stroke-width="8"/>${T(0,26,'POKER: CLOSED',64,'#fff')}</g>`:'')}
function SOFA(t,o={}){let g=`<rect width="1920" height="1080" fill="#4a3a66"/>`+WINDOWLIGHT(1250,160,520,380,'dusk',t)+GLOW(700,500,500,'#ffb36b',.25)+`<rect x="0" y="${FLOOR}" width="1920" height="175" fill="#3a2c50"/>`;
  g+=`<rect x="300" y="560" width="900" height="300" rx="60" fill="#c96a5a" stroke="${OUT}" stroke-width="8"/>`+YOU({x:750,y:905,face:.1,smile:o.smile==null?.3:o.smile,brow:0,open:blink(t,.4),aR:150,look:[.4,.6]})+`<rect x="680" y="420" width="90" height="150" rx="16" fill="#17151f" stroke="#fff" stroke-width="4" transform="rotate(-10 725 495)"/>`+GLOW(725,495,120,'#bfe0ff',.35);
  g+=`<rect x="260" y="700" width="980" height="200" rx="60" fill="#d97a6a" stroke="${OUT}" stroke-width="8"/>`;
  if(o.hearts)for(let i=0;i<6;i++){const u=((t*.5+i/6)%1);g+=`<path d="M 0 12 C -24 -8 -14 -26 0 -14 C 14 -26 24 -8 0 12 Z" fill="#ff5f8a" transform="translate(${n(760+Math.sin(i*2+t)*120)},${n(420-u*300)}) scale(${n(1.6+u)})" opacity="${n(1-u)}"/>`}
  return g}
function DATE(t,o={}){let g=`<rect width="1920" height="1080" fill="#3a1f2e"/>`+WINDOWLIGHT(700,110,520,360,'night',t)+GLOW(960,680,320,'#ffb36b',.45)+`<rect x="0" y="${FLOOR}" width="1920" height="175" fill="#2a1520"/>`;
  const leave=o.leave||0;g+=WOMAN('#c0392b','#ffd36b',{x:lerp(1240,2200,leave*leave),y:905,face:leave>0?1:-.6,bow:1,bun:0,smile:.5,brow:0,open:blink(t,.3),mouth:dateT(t),look:[-.8,0],walk:leave>0&&leave<1?t*8:null})+MAN('#3a7bd5','#f3efe6',{x:680,y:905,face:.6,smile:o.ms==null?.6:o.ms,brow:o.mb||0,open:blink(t,.9),look:[lerp(.8,.95,leave),0]});
  return g+`<rect x="700" y="700" width="520" height="34" rx="12" fill="#f3efe6" stroke="${OUT}" stroke-width="6"/><rect x="940" y="734" width="40" height="170" fill="#5a3a2a"/><rect x="948" y="620" width="24" height="80" fill="#fff6d8"/><ellipse cx="960" cy="606" rx="10" ry="18" fill="#ffd54d"/>`}
function WINDOWS(t,u,mode){let g=`<rect width="1920" height="1080" fill="#0b0826"/>`+dust(t,'#fff',20)+`<rect x="160" y="80" width="1600" height="1000" fill="#1d1840"/>`;
  let broken=0;
  for(let r=0;r<5;r++)for(let c=0;c<8;c++){const x=230+c*190,y=140+r*190,k=(r*8+c)*7%40,lit=1,brk=mode==='break'&&k<30&&u>k/40;if(brk)broken++;
    g+=`<rect x="${x}" y="${y}" width="140" height="140" rx="8" fill="${brk?'#2a2450':'#ffd36b'}" opacity="${brk?1:.85}"/>`;
    if(mode==='break'&&!brk)g+=`<path d="M 0 22 C -40 -12 -24 -44 0 -24 C 24 -44 40 -12 0 22 Z" fill="#ff5f8a" transform="translate(${x+70},${y+80})"/>`;
    if(brk){const f=cl((u-k/40)*6);g+=`<g transform="translate(${x+70},${y+80})"><path d="M 0 22 C -40 -12 -24 -44 0 -24 L 6 -2 L -4 10 Z" fill="#ff5f8a" transform="translate(${n(-f*20)},${n(f*40)}) rotate(${n(-f*30)})" opacity="${n(1-f)}"/><path d="M 0 22 L -4 10 L 6 -2 L 0 -24 C 24 -44 40 -12 0 22 Z" fill="#ff5f8a" transform="translate(${n(f*20)},${n(f*40)}) rotate(${n(f*30)})" opacity="${n(1-f)}"/></g>`}
    if(mode==='glow'&&k<10){const p=1+.15*Math.sin(t*4+k);g+=GLOW(x+70,y+70,110,'#ffd54d',.4)+`<path d="M 0 22 C -40 -12 -24 -44 0 -24 C 24 -44 40 -12 0 22 Z" fill="#ffd54d" stroke="#fff" stroke-width="4" transform="translate(${x+70},${y+80}) scale(${n(p*1.3)})"/>`}
    if(mode==='glow'&&k>=10)g+=`<rect x="${x}" y="${y}" width="140" height="140" rx="8" fill="#0b0826" opacity=".7"/>`}
  if(mode==='break')g+=`<g transform="translate(960,1010)"><rect x="-430" y="-60" width="860" height="110" rx="24" fill="#05040f" opacity=".85"/>${T(0,22,'BREAK-UPS TODAY: '+Math.floor(Math.pow(u,1.2)*41_200_000).toLocaleString('en-US'),54,'#ff5f8a',{ls:2})}</g>`;
  return g}
function PARTY(t,u){let g=`<rect width="1920" height="1080" fill="#2a2240"/>`+`<path d="M 300 160 Q 960 260 1620 160" stroke="#fff" stroke-width="4" fill="none"/>`;
  'SURPRISE!'.split('').forEach((ch,i)=>{g+=`<g transform="translate(${360+i*150},${n(190+Math.sin(i*.5)*30)})"><polygon points="-60,-10 60,-10 0,110" fill="${['#ff5f5f','#ffd54d','#3a7bd5','#4caf6a'][i%4]}"/>${T(0,50,ch,56,'#fff')}</g>`});
  const def=es(u,.5,.9);for(let i=0;i<6;i++){const x=200+i*300,sc=lerp(1,.35,def);g+=`<g transform="translate(${x},${n(560+def*260)}) scale(${n(sc)})"><ellipse cx="0" cy="0" rx="70" ry="90" fill="${['#ff5f5f','#ffd54d','#3a7bd5'][i%3]}" stroke="${OUT}" stroke-width="5"/><path d="M 0 90 q 20 60 -10 140" stroke="#fff" stroke-width="3" fill="none"/></g>`}
  g+=`<rect x="0" y="${FLOOR}" width="1920" height="175" fill="#1d1830"/><rect x="200" y="720" width="900" height="200" rx="40" fill="#5a4a7a" stroke="${OUT}" stroke-width="7"/>`;
  [380,620,860].forEach((x,i)=>{g+=`<g>`+MAN(['#7fa86b','#e88f5a','#c27aa8'][i],'#ffd36b',{x,y:905,s:.8,face:.4,smile:lerp(1,-.4,def),brow:lerp(-.3,.8,def),open:1,look:[.8,0]})+`</g>`});
  g+=`<rect x="200" y="790" width="900" height="130" rx="40" fill="#6a5a8a" stroke="${OUT}" stroke-width="7"/>`;
  g+=MAN('#3a7bd5','#f3efe6',{x:1500,y:905,face:-.5,smile:-.1,brow:.3,open:.6,look:[-.8,0]})+BUB(1500,330,'I know.',u,.25,{size:48});
  return g}
function CARD(t,lines,o={}){let g=PLAIN(o.c1||'#3b2f5a',o.c2||'#0b0826')+dust(t,o.dc||'#fff');lines.forEach(([s,y,size,c,t0],i)=>{g+=POP(s,960,y,size,c,t,t0)});return g}
function DRAWING(t,u){let g=PLAIN('#f6efdc','#d9cba8')+`<g transform="translate(960,540) rotate(${n(-3+Math.sin(t)*1.5)})"><rect x="-520" y="-380" width="1040" height="760" fill="#fffdf6" stroke="#d9cba8" stroke-width="6"/>`;
  g+=`<path d="M -260 -40 C -280 -230 120 -280 220 -120 C 300 20 160 200 -40 170 C -200 150 -250 80 -260 -40 Z" fill="#c9905c" stroke="#7a5a3c" stroke-width="10"/><circle cx="-60" cy="-60" r="18" fill="#2a2240"/><circle cx="60" cy="-80" r="18" fill="#2a2240"/><path d="M -60 20 q 60 40 120 0" stroke="#2a2240" stroke-width="10" fill="none"/>`;
  g+=`<path d="M -120 160 l -40 160 M 60 170 l 40 150 M -160 320 h -60 M 100 320 h 60" stroke="#2a2240" stroke-width="12" stroke-linecap="round"/>`;
  g+=T(0,-300,'MY DAD',70,'#3a7bd5',{flat:1})+`</g>`;
  return g+(u>.55?POP('…A POTATO WITH LEGS',960,1000,70,'#2a2240',u*4,2.3):'')}
function ENDQ(t,u){let g=PLAIN('#3b2f5a','#0b0826')+dust(t)+POP('COULD YOU LAST 24 HOURS?',960,300,92,'#fff',u*4,.1)+POP('What’s the first truth that would slip out of you?',960,430,52,'#ffe14d',u*4,.8);
  g+=`<g transform="translate(960,${n(700+Math.sin(t*3)*10)})"><rect x="-420" y="-70" width="840" height="140" rx="40" fill="#fff" stroke="${OUT}" stroke-width="8"/>${T(0,24,'TELL ME IN THE COMMENTS',60,OUT)}</g>`;
  return g}
function NOSE(x,y,s,len){return `<ellipse cx="${n(x+len/2)}" cy="${n(y)}" rx="${n(10*s+len/2)}" ry="${n(16*s)}" fill="#2a2850" stroke="${OUT}" stroke-width="5"/>`}
// ---------- the shot list ----------
// [start, draw(t,u), camera [cx0,cy0,z0, cx1,cy1,z1], fade-in]
function SHOTS(){const S=[];const A=(s,d,c,f)=>S.push([s,d,c||[960,540,1.02,960,540,1.08],f||0]);
  const Bm=(o)=>t=>BEDTOP(t,o);
  // cold open
  A(0,t=>BEDTOP(t,{clock:'07:00',blink:t<at('n01',.6),p:{open:.1},y:{open:es(t,.6,1.2)}}),[900,470,1.04,900,450,1.12],.6);
  A(at('p1'),t=>BEDTOP(t,{clock:'07:00'}),[590,330,2.1,580,320,2.3]);
  A(at('n02'),t=>BEDTOP(t,{clock:'07:01',yopen:1.15,y:{brow:1.2,smile:-.4,look:[-.6,0]},yf:-.4}),[1090,330,1.9,1080,320,2.05]);
  A(at('n03'),t=>BEDTOP(t,{clock:'07:01',yopen:1.1,popen:1.05,pf:.6,y:{brow:1,smile:-.3},p:{brow:.8,smile:-.2},plook:[.8,0],ylook:[-.8,0]}),[840,380,1.45,840,370,1.6]);
  A(at('y1'),t=>BEDTOP(t,{clock:'07:01',yopen:1.1,popen:1.1,pf:.6,y:{brow:.8,smile:0},p:{brow:1.1,smile:-.6},plook:[.8,0],ylook:[-.8,0]}),[1090,330,2.1,1090,320,2.25]);
  A(at('n04'),t=>BEDTOP(t,{clock:'07:01',yopen:1.15,popen:1.15,pf:.6,y:{brow:1.3,smile:-.6,mouth:0},p:{brow:1.2,smile:-.6},plook:[.8,0],ylook:[0,0]}),[840,420,1.3,900,500,1.06]);
  A(at('n05'),t=>CDEFS+`<rect width="1920" height="1080" fill="#05040f"/>`+dust(t,'#fff',60)+EARTH(t,960,560,380,es(t,at('n05',.45),at('n05',.8)))+(t>at('n05',.6)?POP('NOBODY CAN LIE',960,175,110,'#ffe14d',t,at('n05',.62)):'')+(t>at('n05',.8)?(()=>{const left=Math.max(0,86400-Math.floor((t-at('n05',.8))*1));const h=Math.floor(left/3600),m=Math.floor(left%3600/60),s=left%60;return `<g transform="translate(960,1000)"><rect x="-250" y="-62" width="500" height="100" rx="20" fill="#05040f" opacity=".8"/>${T(0,14,[h,m,s].map(v=>String(v).padStart(2,'0')).join(':'),64,'#fff',{ls:6})}</g>`})():''),[960,560,1.12,960,560,1.0],.3);
  A(at('n06'),t=>{const u=(t-at('n06'))/(at('n06',1)-at('n06'));return CDEFS+PLAIN('#2a1d4a','#05040f')+dust(t)+tiles4(t,[0,0,0,0],-1)+(u>.15?POP('3 COLLAPSES',730,340,80,'#ff5f5f',u,.15):'')+(u>.6?POP('1 BETTER THAN EVER',1350,340,70,'#ffd54d',u,.6):'')},[960,540,1.12,960,540,1.0]);
  A(C.title,t=>{const u=(t-C.title)/1.6;return CDEFS+PLAIN('#2a1d4a','#05040f')+GLOW(960,540,500,'#ffd54d',.15)+POP('WHAT IF NOBODY',960,460,120,'#fff',u,0)+POP('COULD LIE?',960,610,150,'#ffe14d',u,.12)},[960,540,1.15,960,540,1.0]);
  // how much we lie
  A(at('n07'),t=>{const u=(t-at('n07'))/(at('n07',1)-at('n07')),nose=es(u,.72,.95)*150;return CDEFS+PLAIN('#5b4a8a','#1c1538')+GLOW(960,500,500,'#fff3c2',.2)+YOU({x:960,y:960,face:0,smile:lerp(.8,.2,es(u,.7,.9)),brow:lerp(-.2,.6,es(u,.7,.9)),open:blink(t,.4),aL:8+es(u,.1,.25)*40*(1-es(u,.6,.7)),aR:8+es(u,.1,.25)*40*(1-es(u,.6,.7)),look:[0,0]})+(nose>2?NOSE(960,960-362+10,1,nose):'')},[960,600,1.0,960,560,1.45]);
  A(at('n08'),t=>CDEFS+DIARY(t,(t-at('n08'))/(at('n08',1)-at('n08'))),[960,540,1.12,960,560,1.02]);
  A(at('n09'),t=>CDEFS+BENCH(t,(t-at('n09'))/(at('n09',1)-at('n09'))),[960,560,1.0,960,560,1.1]);
  A(at('n10'),t=>CDEFS+TINY(t,(t-at('n10'))/(at('n10',1)-at('n10'))),[960,540,1.08,960,540,1.0]);
  A(at('n11'),t=>CDEFS+GLUE(t,(t-at('n11'))/(at('n11',1)-at('n11')+.6)),[960,520,1.0,960,560,1.08]);
  // breakfast
  const kch=(t,o={})=>PARTNER(Object.assign({x:500,y:905,face:.5,smile:.6,brow:0,open:blink(t,.2),mouth:partT(t),look:[.8,0]},o.p||{}))+KID(Object.assign({x:830,y:800,face:0,smile:.9,brow:-.2,open:blink(t,.6),mouth:kidT(t),look:[0,0],aL:8,aR:8},o.k||{}))+YOU(Object.assign({x:1160,y:905,face:-.5,smile:.4,brow:0,open:blink(t,.9),mouth:youT(t),look:[-.8,0]},o.y||{}));
  A(at('n12'),t=>CDEFS+KITCHEN(t,{chars:kch(t)}),[900,520,1.2,900,540,1.05],.3);
  A(at('k1'),t=>{const u=(t-at('k1'))/(at('k1',1)-at('k1'));return CDEFS+KITCHEN(t,{chars:kch(t,{k:{aL:60+Math.sin(t*6)*30,aR:60-Math.sin(t*6)*30},p:{brow:.8,smile:-.2,look:[.6,0]},y:{brow:.8,smile:-.2,look:[-.6,0]}})})+[['VASE',.05],['REMOTE',.35],['KEYS → FREEZER',.65]].map(([s,f],i)=>BUB(560+i*270,300,s,u,f,{size:42,fill:'#ffe9a8'})).join('')},[830,500,1.7,830,480,1.85]);
  A(at('n13'),t=>{const u=(t-at('n13'))/(at('n13',1)-at('n13'));return CDEFS+KITCHEN(t,{chars:kch(t,{k:{aR:100+Math.sin(t*9)*10}})})+`<g transform="translate(960,150)"><rect x="-340" y="-60" width="680" height="110" rx="22" fill="#05040f" opacity=".8"/>${T(0,22,'CRIMES CONFESSED: '+Math.min(3,1+Math.floor(u*4)),56,'#ffe14d',{ls:2})}</g>`},[900,520,1.08,900,520,1.18]);
  A(at('n14'),t=>{const u=(t-at('n14'))/(at('n14',1)-at('n14')),sip=es(u,.3,.6);return CDEFS+KITCHEN(t,{chars:kch(t,{y:{aR:8+sip*150,face:-.3,open:lerp(1,.5,sip)}}),front:sip>0?`<rect x="${n(1160+104-30)}" y="${n(905-339-60+ (1-sip)*200)}" width="60" height="56" rx="10" fill="#fff" stroke="${OUT}" stroke-width="5"/>`:''})},[1160,520,1.9,1160,510,2.1]);
  A(at('y2'),t=>CDEFS+KITCHEN(t,{chars:kch(t,{y:{smile:-.8,brow:1.2,face:-.4,head:Math.sin(t*12)*3}})}),[1160,520,2.0,1150,520,2.1]);
  A(at('p2'),t=>CDEFS+KITCHEN(t,{chars:kch(t,{p:{smile:.3,brow:.4,look:[.9,0]},y:{smile:-.4,brow:1.1,open:1.1}})}),[500,500,1.9,510,500,2.0]);
  A(at('n15'),t=>{const u=(t-at('n15'))/(at('n15',1)-at('n15'));return CDEFS+KITCHEN(t,{chars:kch(t,{y:{brow:1,smile:-.3,open:1.1},p:{smile:.9}})})+POP('8 YEARS OF',960,130,70,'#fff',u,.1)+POP('STRATEGIC COFFEE',960,230,92,'#ffe14d',u,.35)},[840,520,1.05,840,520,1.15]);
  // the commute
  const phoneBG=(t,mood)=>CDEFS+`<rect width="1920" height="1080" fill="${mood==='dusk'?'#4a3a66':'#3a4a66'}"/>`+GLOW(960,540,600,mood==='dusk'?'#ffb36b':'#bfe0ff',.25)+dust(t);
  A(at('n16'),t=>phoneBG(t)+PHONE(960,560,.95,t,{name:'BOSS',avatar:'#3b4256',msgs:[{at:at('n16',.5),me:0,text:'Where are you?'}]}),[960,560,1.0,960,400,1.3]);
  A(at('n17'),t=>phoneBG(t)+PHONE(960,560,.95,t,{name:'BOSS',avatar:'#3b4256',msgs:[{at:0,me:0,text:'Where are you?'},{at:at('n17',.72),me:1,bad:1,text:'Still in pyjamas. Leaving in 40.'}],input:{at:at('n17',.1),typed:'Running 5 mins late',glitchAt:at('n17',.45)}}),[960,880,1.6,960,560,1.1]);
  const office=(t,o={})=>{const bx=o.walk!=null?lerp(-200,820,es(t,o.walk,o.walk+2.2)):820;let g=OFFICE(t)+`<rect x="1450" y="520" width="200" height="390" rx="20" fill="#3a3448" stroke="${OUT}" stroke-width="7"/><rect x="1480" y="560" width="140" height="80" rx="10" fill="#9fe0ff"/><rect x="1520" y="760" width="60" height="70" fill="#fff" stroke="${OUT}" stroke-width="4"/>`;
    g+=MAN('#3b4256','#c0392b',Object.assign({x:1250,y:905,s:1.1,face:-.6,smile:.9,brow:-.2,open:blink(t,.3),mouth:bossT(t),look:[-.8,0],aR:120},o.b||{}));
    g+=YOU(Object.assign({x:bx,y:905,face:.6,smile:.2,brow:.2,open:blink(t,.6),mouth:youT(t),look:[.8,0],walk:o.walk!=null&&t<o.walk+2.2?t*7:null},o.y||{}));return CDEFS+g};
  A(at('n18'),t=>{const u=(t-at('n18'))/(at('n18',1)-at('n18'));return office(t,{walk:at('n18')})+(u>.55?POP('THE MOST DANGEROUS QUESTION',960,175,64,'#ff5f5f',u,.55):'')},[960,560,1.0,1000,560,1.1],.3);
  A(at('b1'),t=>office(t,{}),[1250,500,1.9,1250,490,2.05]);
  A(at('n19'),t=>{const u=(t-at('n19'))/(at('n19',1)-at('n19')),cr=es(u,.55,.75);return office(t,{y:{smile:-.2,brow:1,open:1.1,sqy:1+Math.sin(t*20)*.01*(1-cr)}})+(u>.2?`<g transform="translate(820,380)">${T(0,0,'“FINE.”',140,cr>0?'#ff5f5f':'#fff')}${cr>0?`<path d="M -200 -60 L -40 -10 L -120 40 L 60 10 L 200 -50" stroke="#05040f" stroke-width="${n(14*cr)}" fill="none"/>`:''}</g>`:'')},[820,500,1.8,820,500,1.95]);
  A(at('y3'),t=>office(t,{y:{brow:.9,smile:-.3,open:1.1},b:{smile:.2,brow:.6}}),[1040,500,1.45,1040,500,1.55]);
  A(at('n20'),t=>office(t,{b:{smile:0,brow:.4,head:Math.sin(t*3)*6},y:{brow:1.1,smile:-.5,open:1.1}}),[1250,500,1.9,1250,500,2.0]);
  A(at('b2'),t=>office(t,{b:{smile:-.1,brow:.8},y:{brow:.6,smile:0}}),[1040,500,1.4,1040,500,1.5]);
  A(at('n21'),t=>CDEFS+MEETING(t)+(()=>{const u=(t-at('n21'))/(at('n21',1)-at('n21'));return `<g transform="translate(1700,130)"><circle r="70" fill="#fff" stroke="${OUT}" stroke-width="8"/><line x1="0" y1="0" x2="${n(Math.sin(u*6)*50)}" y2="${n(-Math.cos(u*6)*50)}" stroke="${OUT}" stroke-width="8" stroke-linecap="round"/></g>`})(),[900,540,1.04,900,540,1.12],.3);
  A(at('c1'),t=>CDEFS+MEETING(t),[520,500,1.8,520,500,1.9]);
  A(at('n22'),t=>{const u=(t-at('n22'))/(at('n22',1)-at('n22'));return CDEFS+MEETING(t,{shake:1,tear:es(u,.5,.7)})+POP('0:04',960,140,110,'#ffe14d',u,.55)},[900,540,1.12,900,540,1.02]);
  A(at('n23'),t=>CDEFS+INTERVIEW(t),[960,520,1.05,960,520,1.15],.3);
  A(at('i1'),t=>CDEFS+INTERVIEW(t),[620,500,1.8,620,500,1.9]);
  A(at('j1'),t=>CDEFS+INTERVIEW(t,{sweat:1}),[1300,500,1.9,1300,500,2.05]);
  A(at('n24'),t=>{const u=(t-at('n24'))/(at('n24',1)-at('n24'));return CDEFS+INTERVIEW(t,{cs:lerp(-.3,1,es(u,.4,.6)),ib:-.2})+(u>.25?`<g transform="translate(960,380) rotate(-10) scale(${n(BO((u-.25)/.12)*1)})"><rect x="-260" y="-80" width="520" height="160" rx="16" fill="none" stroke="#c0392b" stroke-width="14"/>${T(0,34,'HIRED',110,'#c0392b',{flat:1})}</g>`:'')},[960,500,1.1,960,500,1.2]);
  // advertising
  A(at('n25'),t=>CDEFS+BILLBOARD(t,0,0),[960,480,1.0,960,420,1.15],.3);
  A(at('n26'),t=>CDEFS+BILLBOARD(t,0,es(t,at('n26',.25),at('n26',.6))),[960,400,1.2,960,400,1.3]);
  A(at('n27'),t=>CDEFS+CARLOT(t),[900,560,1.0,800,560,1.12]);
  A(at('s1'),t=>{const u=(t-at('s1'))/(at('s1',1)-at('s1'));return CDEFS+CARLOT(t,{dent:u>.35?1:0,ss:lerp(1,-.5,es(u,.4,.7)),sb:lerp(-.3,1,es(u,.4,.7)),salesArm:lerp(130,10,es(u,.4,.7))})},[800,560,1.3,900,560,1.15]);
  A(at('n28'),t=>CDEFS+REVIEWS(t,(t-at('n28'))/(at('n28',1)-at('n28'))),[960,480,1.05,960,480,1.15]);
  // politics and money
  A(at('n29'),t=>CDEFS+PODIUM(t,{px:lerp(1700,960,es(t,at('n29'),at('n29',.8))),pf:t<at('n29',.8)?-1:0,walk:t<at('n29',.8)}),[960,540,1.0,960,500,1.15],.3);
  A(at('z1'),t=>CDEFS+PODIUM(t,{pb:.5,ps:-.1}),[960,420,1.8,960,410,2.0]);
  A(at('n30'),t=>CDEFS+TVROOM(t,(t-at('n30'))/(at('n30',1)-at('n30'))),[960,520,1.1,960,520,1.0]);
  A(at('n31'),t=>CDEFS+CALL(t),[960,540,1.0,500,300,1.6]);
  A(at('e1'),t=>CDEFS+CALL(t,{shock:t>at('e1',.5),cs:t>at('e1',.5)?-.6:.8,cb:t>at('e1',.5)?1.2:-.2}),[960,540,1.25,960,540,1.0]);
  A(at('n32'),t=>{const u=(t-at('n32'))/(at('n32',1)-at('n32'));return CDEFS+(u<.55?STOCK(t,u/.55):COLLAPSE(t,(u-.55)/.45,0,'COLLAPSE 1 OF 3'))},[960,540,1.0,960,540,1.08]);
  // things that start working
  A(at('n33'),t=>{const u=(t-at('n33'))/(at('n33',1)-at('n33'));const on=u>.45&&!(u<.6&&Math.floor(t*20)%3===0);return CDEFS+PLAIN(on?'#5b4a2a':'#1b1630','#05040f')+`<line x1="960" y1="0" x2="960" y2="300" stroke="#555" stroke-width="6"/><circle cx="960" cy="400" r="110" fill="${on?'#fff3c2':'#3a3650'}" stroke="${OUT}" stroke-width="8"/><rect x="910" y="290" width="100" height="40" fill="#777"/>`+(on?GLOW(960,400,400,'#fff3c2',.6):'')},[960,420,1.3,960,420,1.0]);
  A(at('n34'),t=>CDEFS+INTERRO(t,{yes:at('n34',.85)})+BUB(1320,300,'Yes.',t,at('n34',.85),{size:56}),[960,520,1.05,1100,500,1.25]);
  A(at('n35'),t=>CDEFS+COURT(t,(t-at('n35'))/(at('n35',1)-at('n35'))),[960,540,1.0,960,540,1.08]);
  A(at('n36'),t=>CDEFS+POKER(t,(t-at('n36'))/(at('n36',1)-at('n36')+.8)),[960,540,1.12,960,540,1.0]);
  // evening
  A(at('n37'),t=>phoneBG(t,'dusk')+PHONE(960,560,.95,t,{name:'SAM (BEST FRIEND)',avatar:'#4caf6a',msgs:[{at:at('n37',.5),me:0,text:'Are you free tonight?'}]}),[960,560,1.0,960,400,1.3],.3);
  A(at('n38'),t=>phoneBG(t,'dusk')+PHONE(960,560,.95,t,{name:'SAM (BEST FRIEND)',avatar:'#4caf6a',msgs:[{at:0,me:0,text:'Are you free tonight?'},{at:at('n38',.6),me:1,bad:1,text:'Free. Just don’t want to see anyone.'}],input:{at:at('n38',.05),typed:'Sorry, busy',glitchAt:at('n38',.35)}}),[960,880,1.6,960,560,1.1]);
  A(at('n39'),t=>phoneBG(t,'dusk')+PHONE(960,560,.95,t,{name:'SAM (BEST FRIEND)',avatar:'#4caf6a',msgs:[{at:0,me:0,text:'Are you free tonight?'},{at:0,me:1,bad:1,text:'Free. Just don’t want to see anyone.'},{at:at('n39',.35),me:0,text:'Same. Want to not see anyone together?'}]}),[960,560,1.2,960,620,1.35]);
  A(at('n40'),t=>CDEFS+SOFA(t,{smile:1,hearts:1}),[760,500,1.4,760,500,1.6]);
  A(at('n41'),t=>{let g=phoneBG(t,'dusk');[['Working late, sorry!','At the pub. Not sorry.'],['Love your new boyfriend!','He’s awful.'],['Happy birthday!!','Forgot. Sorry.']].forEach(([a,b],i)=>{const t0=at('n41',.1+i*.22);if(t>=t0)g+=`<g transform="rotate(${(i-1)*6} ${400+i*560} 560)">`+PHONE(400+i*560,560,.62,t,{name:['MUM','SISTER','UNCLE RAY'][i],avatar:['#c27aa8','#e88f5a','#7fa86b'][i],msgs:[{at:t0+.9,me:1,bad:1,text:b}],input:{at:t0,typed:a,glitchAt:t0+.6}})+`</g>`});return g},[960,560,1.0,960,560,1.06]);
  A(at('n42'),t=>CDEFS+DATE(t),[960,560,1.0,960,560,1.1],.3);
  A(at('d1'),t=>CDEFS+DATE(t),[1240,480,1.8,1240,480,1.9]);
  A(at('n43'),t=>{const u=(t-at('n43'))/(at('n43',1)-at('n43'));return CDEFS+(u<.35?DATE(t,{leave:es(u,0,.3),ms:0,mb:.6}):u<.72?WINDOWS(t,(u-.35)/.37,'break'):COLLAPSE(t,(u-.72)/.28,1,'COLLAPSE 2 OF 3'))},[960,540,1.0,960,540,1.06]);
  A(at('n44'),t=>CDEFS+WINDOWS(t,1,'glow'),[960,540,1.1,960,500,1.3]);
  A(at('n45'),t=>{const u=(t-at('n45'))/(at('n45',1)-at('n45'));return CDEFS+(u<.68?PARTY(t,u/.68):COLLAPSE(t,(u-.68)/.32,2,'COLLAPSE 3 OF 3'))},[960,540,1.05,960,540,1.0],.3);
  // the better thing
  A(at('n46'),t=>{const u=(t-at('n46'))/(at('n46',1)-at('n46'));return CDEFS+CARD(t,[['WHAT GOT BETTER?',360,100,'#fff',at('n46')],['HONESTY',620,140,'#9aa0b5',at('n46',.35)]])+(u>.55?`<line x1="640" y1="580" x2="${n(640+640*es(u,.55,.7))}" y2="580" stroke="#ff5f5f" stroke-width="22" stroke-linecap="round"/>`:'')},[960,540,1.0,960,540,1.08]);
  A(at('n47'),t=>CDEFS+COLLAPSE(t,(t-at('n47'))/(at('n47',1)-at('n47')),3,'KINDNESS'),[960,540,1.1,960,540,1.0]);
  A(at('n48'),t=>{const u=(t-at('n48'))/(at('n48',1)-at('n48'));return CDEFS+PLAIN('#4a3a66','#1b1636')+dust(t)+BUB(960,200,'Do you like my haircut?',u,.05,{size:52})+(u>.4?`<g>${BUB(560,560,'No.',u,.42,{size:64})}${u>.55?`<path d="M 440 470 L 680 650 M 680 470 L 440 650" stroke="#ff5f5f" stroke-width="24" stroke-linecap="round"/>`:''}</g>`:'')+(u>.62?BUB(1360,560,'It’s bold. I like that you tried it.',u,.62,{size:44}):'')+(u>.75?`<path d="M 1230 700 l 70 70 l 140 -150" stroke="#4caf6a" stroke-width="24" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`:'')},[960,500,1.05,960,500,1.0]);
  A(at('n49'),t=>{const u=(t-at('n49'))/(at('n49',1)-at('n49'));return u<.45?CDEFS+KITCHEN(t,{night:1,chars:kch(t,{k:{aL:150,aR:150,smile:1},y:{smile:.4,brow:.2}})})+`<rect x="760" y="${n(420+Math.sin(t*4)*6)}" width="150" height="110" fill="#fffdf6" stroke="${OUT}" stroke-width="5"/>`:CDEFS+DRAWING(t,(u-.45)/.55)},[900,520,1.2,960,540,1.05],.3);
  A(at('n50'),t=>{const u=(t-at('n50'))/(at('n50',1)-at('n50'));return CDEFS+KITCHEN(t,{night:1,chars:kch(t,{y:{smile:.1,brow:.6,look:[-.6,-.3]},k:{aL:150,aR:150}})})+(u>.15?BUB(1160,180,'It’s wonder—',u,.15,{size:48,fill:'#e9e6ff'}):'')+(u>.55?`<line x1="980" y1="180" x2="1340" y2="180" stroke="#ff5f5f" stroke-width="12" stroke-linecap="round"/>`:'')},[1160,480,1.8,1160,470,1.9]);
  A(at('y4'),t=>CDEFS+KITCHEN(t,{night:1,chars:kch(t,{y:{smile:.9,brow:-.2,face:-.6},k:{aL:150,aR:150}})}),[1160,500,1.9,1150,500,2.0]);
  A(at('n51'),t=>{const u=(t-at('n51'))/(at('n51',1)-at('n51'));let g=CDEFS+KITCHEN(t,{night:1,chars:kch(t,{k:{aL:150,aR:150,smile:1.2,brow:-.4,open:1.15}})})+GLOW(830,560,260,'#ffd54d',.5*es(u,0,.3));for(let i=0;i<10;i++){const a=i*.63+t,r=150+30*Math.sin(t*3+i);g+=star(830+Math.cos(a)*r,520+Math.sin(a)*r,18,t*2,'#ffd54d',es(u,0,.3))}return g},[830,520,2.0,830,520,2.2]);
  A(at('n52'),t=>CDEFS+CARD(t,[['MOST LIES ARE JUST',380,80,'#fff',at('n52',.05)],['KIND WORDS',520,140,'#ffd54d',at('n52',.3)],['WE WERE TOO LAZY TO FIND',680,72,'#fff',at('n52',.55)]],{c1:'#4a3a2a',c2:'#140f0a',dc:'#ffd54d'}),[960,540,1.06,960,540,1.0],.3);
  // midnight
  A(at('n53'),t=>BEDTOP(t,{night:1,clock:'23:59',yopen:1,popen:.08,ylook:[0,-.5]})+CDEFS,[900,450,1.1,900,430,1.18],.5);
  A(at('n54'),t=>{const u=(t-at('n54'))/(at('n54',1)-at('n54')),w=es(u,.45,.9);return CDEFS+BEDTOP(t,{night:1,clock:u>.45?'00:00':'23:59',yopen:1,popen:.08,ylook:[0,-.5]})+(w>0&&w<1?`<rect width="1920" height="1080" fill="#fff3c2" opacity="${n(.35*Math.sin(w*PI))}"/>`:'')},[1590,340,2.2,900,430,1.15]);
  A(at('n55'),t=>{const u=(t-at('n55'))/(at('n55',1)-at('n55'));return CDEFS+BEDTOP(t,{night:1,clock:'00:00',yopen:1,popen:lerp(.08,1,es(u,.3,.7)),pf:lerp(.25,.7,es(u,.2,.6)),plook:[.8,0],ylook:[0,-.5]})},[840,400,1.3,740,380,1.5]);
  A(at('p3'),t=>CDEFS+BEDTOP(t,{night:1,clock:'00:00',yopen:1.1,popen:1,pf:.7,plook:[.8,0],ylook:[-.6,0],p:{smile:.7}}),[590,330,2.1,590,330,2.25]);
  A(at('n56'),t=>{const u=(t-at('n56'))/(at('n56',1)-at('n56'));return CDEFS+BEDTOP(t,{night:1,clock:'00:01',yopen:1.15,popen:.08,pf:.7,ylook:[0,-.8],y:{brow:.7,smile:0}})+(u>.5?POP('?',1200,250,160,'#ffd54d',u*4,2.1):'')},[1090,330,2.0,1090,300,2.4]);
  A(at('n57'),t=>CDEFS+ENDQ(t,(t-at('n57'))/(at('n57',1)-at('n57'))),[960,540,1.06,960,540,1.0],.4);
  return S}
let SHOTL=null;
const STAMPS=()=>[[at('n01'),'7:00 AM'],[at('n12'),'7:15 AM'],[at('n16'),'8:30 AM'],[at('n18'),'9:02 AM'],[at('n21'),'10:00 AM'],[at('n25'),'LUNCHTIME'],[at('n29'),'12:00 PM'],[at('n31'),'2:00 PM'],[at('n35'),'3:00 PM'],[at('n37'),'6:00 PM'],[at('n42'),'8:00 PM'],[at('n43',.35),'9:00 PM'],[at('n49'),'DINNER'],[at('n53'),'11:59 PM']];
function camT(c,u){const k=E(u),z=lerp(c[2],c[5],k);let cx=lerp(c[0],c[3],k),cy=lerp(c[1],c[4],k);cx=cl(cx,960/z,1920-960/z);cy=cl(cy,540/z,1080-540/z);return `translate(960,540) scale(${z.toFixed(4)}) translate(${n(-cx)},${n(-cy)})`}
function dayBar(t){const a=at('n12'),b=at('n54');if(t<a-.5||t>b+1)return '';const f=cl((t-a)/(b-a)),op=pulse(t,a-.5,b+1,.5)*.85,hr=7+f*17,x=640+f*640;
  return `<g opacity="${n(op)}"><rect x="640" y="40" width="640" height="6" rx="3" fill="#fff" opacity=".35"/><rect x="640" y="40" width="${n(f*640)}" height="6" rx="3" fill="#ffd54d"/><circle cx="${n(x)}" cy="43" r="12" fill="${hr<19?'#ffd54d':'#e9e6ff'}"/>${T(620,52,'7AM',24,'#fff',{a:'end',flat:1,op:.7})}${T(1300,52,'MIDNIGHT',24,'#fff',{a:'start',flat:1,op:.7})}</g>`}
window.renderAt=function(t){
  if(!SHOTL)SHOTL=SHOTS().sort((a,b)=>a[0]-b[0]);
  let i=0;while(i<SHOTL.length-1&&t>=SHOTL[i+1][0])i++;
  const [s,draw,cam,fade]=SHOTL[i],e=i<SHOTL.length-1?SHOTL[i+1][0]:D.total,u=cl((t-s)/Math.max(.1,e-s));
  let g=DEFS+`<g transform="${camT(cam,u)}">${draw(t,u)}</g>`;
  if(fade)g+=`<rect width="1920" height="1080" fill="#05040f" opacity="${n(1-es(t,s,s+fade))}"/>`;
  g+=`<rect width="1920" height="1080" fill="url(#vig)"/><rect width="1920" height="1080" fill="#ffb36b" opacity=".04"/>`;
  g+=stamp(t,STAMPS())+dayBar(t);
  const ea=es(t,C.end,C.end+.5);if(ea>0)g+=`<g opacity="${n(ea)}"><rect width="1920" height="1080" fill="#08071a"/>${T(960,500,'FOLLOW',130,'#fff')}${T(960,640,'FOR MORE WHAT IFs',76,'#ffe14d')}</g>`;
  g+=`<rect width="1920" height="1080" fill="#000" opacity="${n(es(t,D.total-.7,D.total-.1))}"/>`;
  document.getElementById('s').innerHTML=g;
};
window.DATA={fps:D.fps,total:D.total};
window.ready=document.fonts.load('600 40px Fredoka').then(()=>{renderAt(+(new URLSearchParams(location.search).get('t')||0));return true});
