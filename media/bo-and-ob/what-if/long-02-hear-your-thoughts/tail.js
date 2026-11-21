/* ===== What if everyone could hear your thoughts? ===== */
const PLAIN=(c1,c2)=>`<defs><radialGradient id="pl${c1.slice(1)}" cx=".5" cy=".45" r=".8"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></radialGradient></defs><rect width="1920" height="1080" fill="url(#pl${c1.slice(1)})"/>`;
function dust(t,c='#fff',nn=40){let g='';for(let i=0;i<nn;i++){const x=(i*173+t*20*(1+i%3))%1960-20,y=(i*97-t*14*(1+i%2))%1120;g+=`<circle cx="${n(x)}" cy="${n((y+1120)%1120)}" r="${2+i%3}" fill="${c}" opacity="${n(.15+.2*Math.abs(Math.sin(t+i)))}"/>`}return g}
const U=(t,id)=>cl((t-V[id].s)/(V[id].e-V[id].s));
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
// the soft ring that means "this head is audible"
function RING(x,y,a,t,c='#bfa8ff'){if(a<=0)return '';let g='';for(let i=0;i<3;i++){const u=((t*.9+i/3)%1);g+=`<circle cx="${n(x)}" cy="${n(y)}" r="${n(120+u*150)}" fill="none" stroke="${c}" stroke-width="${n(8*(1-u))}" opacity="${n(a*(1-u)*.8)}"/>`}return g}
const headY=(y,s=1)=>y-362*s;
// ---------- sets ----------
function LIFT(t,o={}){let g=`<rect width="1920" height="1080" fill="#6a6f80"/><rect x="0" y="0" width="1920" height="1080" fill="url(#beam)" opacity=".25"/>`;
  for(let i=0;i<6;i++)g+=`<rect x="${i*330+20}" y="60" width="290" height="820" rx="8" fill="#7d8294" stroke="#5a5f70" stroke-width="6"/>`;
  g+=`<rect x="840" y="40" width="240" height="110" rx="12" fill="#14121c"/>${T(960,120,o.floor||'4',80,'#ff9a3a',{flat:1})}<rect x="0" y="${FLOOR}" width="1920" height="175" fill="#4a4e5c"/>`+GLOW(960,120,200,'#ff9a3a',.15);
  const sa=o.sa||0,ya=o.ya||0;
  g+=RING(760,headY(905),sa,t)+RING(1160,headY(905),ya,t);
  g+=MAN('#6b7a8a','#c0392b',Object.assign({x:760,y:905,face:.15,smile:-.1,brow:.4,open:blink(t,.3),look:[.5,0]},o.s||{}))+YOU(Object.assign({x:1160,y:905,face:-.15,smile:0,brow:.2,open:blink(t,.8),look:[-.5,0]},o.y||{}));
  return g}
function TRAIN(t,o={}){let g=`<rect width="1920" height="1080" fill="#cfd8e6"/>`;
  for(let i=0;i<4;i++){const x=80+i*470;g+=`<rect x="${x}" y="150" width="380" height="300" rx="30" fill="#8ea4cc"/><g transform="translate(${n(-((t*500+i*300)%700))},0)"><defs><clipPath id="tw${i}"><rect x="${x}" y="150" width="380" height="300" rx="30"/></clipPath></defs></g><g clip-path="url(#tw${i})">`+[0,1,2,3,4].map(k=>{const bx=x+((k*170-t*600)%900+900)%900-260;return `<rect x="${n(bx)}" y="${200+(k%3)*60}" width="120" height="300" fill="#6f86b0"/>`}).join('')+`</g><rect x="${x}" y="150" width="380" height="300" rx="30" fill="none" stroke="#e9eef6" stroke-width="14"/>`}
  g+=`<rect x="0" y="${FLOOR}" width="1920" height="175" fill="#8d8aa0"/>`;for(let i=0;i<5;i++)g+=`<rect x="${200+i*380}" y="0" width="16" height="905" fill="#c9cdd8"/>`;
  const P=[[180,'#7fa86b',0],[420,'#e88f5a',1],[660,'#3b4256',0],[900,'#c27aa8',1],[1140,'#f3efe6',0],[1380,'#6fb3d9',1],[1620,'#d9a03a',0],[1840,'#9a7fd9',1]];
  P.forEach(([x,c,w],i)=>{const sw=Math.sin(t*2+i)*3;g+=(w?WOMAN:MAN)(c,'#ffd36b',{x,y:905+(i%2)*40,s:.82,face:Math.sin(i)*.4,smile:o.hum?(.7):-.1,brow:o.hum?-.2:.3,open:blink(t,i*.6),tilt:sw,mouth:o.hum?.25+.2*Math.sin(t*6+i):0,look:[Math.sin(i*2)*.6,0]})});
  return g}
function NOTES(t,a,cx,cy,spread){if(a<=0)return '';let g='';for(let i=0;i<18;i++){const u=((t*.35+i/18)%1),x=cx+Math.cos(i*2.1)*spread*u,y=cy-u*500+Math.sin(t*3+i)*20;g+=`<g opacity="${n(a*(1-u))}" transform="translate(${n(x)},${n(y)}) rotate(${n(Math.sin(t+i)*15)})"><ellipse cx="0" cy="0" rx="16" ry="12" fill="#ffd54d" stroke="${OUT}" stroke-width="4"/><line x1="14" y1="0" x2="14" y2="-46" stroke="${OUT}" stroke-width="5"/><path d="M 14 -46 q 18 6 18 22" fill="none" stroke="${OUT}" stroke-width="5"/></g>`}return g}
function RESTO(t,o={}){let g=`<rect width="1920" height="1080" fill="#5a3a3a"/>`+WINDOWLIGHT(1250,140,520,380,'day',t)+GLOW(700,400,500,'#ffd9a8',.3)+`<rect x="0" y="${FLOOR}" width="1920" height="175" fill="#3a2424"/>`;
  g+=YOU(Object.assign({x:620,y:905,face:.5,smile:.3,brow:0,open:blink(t,.4),look:[.7,-.2]},o.y||{}))+`<rect x="380" y="700" width="700" height="34" rx="12" fill="#f3efe6" stroke="${OUT}" stroke-width="6"/><rect x="700" y="734" width="40" height="170" fill="#5a3a2a"/>`;
  const sx=o.soupX||820;g+=`<g transform="translate(${n(sx)},680)"><ellipse cx="0" cy="0" rx="90" ry="26" fill="#fff" stroke="${OUT}" stroke-width="5"/><ellipse cx="0" cy="-6" rx="70" ry="16" fill="#e0883a"/>${[0,1,2].map(i=>`<path d="M ${-30+i*30} -30 q 10 -20 0 -40 q -10 -20 0 -40" stroke="#fff" stroke-width="5" fill="none" opacity="${n(.5+.3*Math.sin(t*3+i))}"/>`).join('')}</g>`;
  g+=RING(1180,headY(905),o.wa||0,t)+MAN('#1d1d26','#f3efe6',Object.assign({x:1180,y:905,face:-.6,aR:100,smile:.6,brow:.2,open:blink(t,.9),look:[-.8,0]},o.w||{}));
  return g}
function DATE2(t,u){let g=`<rect width="1920" height="1080" fill="#3a1f2e"/>`+WINDOWLIGHT(700,110,520,360,'night',t)+GLOW(960,680,320,'#ffb36b',.45)+`<rect x="0" y="${FLOOR}" width="1920" height="175" fill="#2a1520"/>`;
  g+=MAN('#3a7bd5','#f3efe6',{x:680,y:905,face:.6,smile:-.2,brow:.6,open:blink(t,.9),look:[.8,0]})+WOMAN('#c0392b','#ffd36b',{x:1240,y:905,face:-.6,bun:0,bow:1,smile:-.2,brow:.6,open:blink(t,.3),look:[-.8,0]});
  g+=`<rect x="700" y="700" width="520" height="34" rx="12" fill="#f3efe6" stroke="${OUT}" stroke-width="6"/><rect x="940" y="734" width="40" height="170" fill="#5a3a2a"/><rect x="948" y="620" width="24" height="80" fill="#fff6d8"/><ellipse cx="960" cy="606" rx="10" ry="18" fill="#ffd54d"/>`;
  g+=THOUGHT(460,230,['Is there food','in my teeth?'],u,.1,{size:40})+THOUGHT(1460,230,['She looks bored.','Say something!'],u,.3,{size:40,tx:60})+THOUGHT(960,120,'…',u,.6,{size:50,w:200});
  return g+RING(680,headY(905),1,t)+RING(1240,headY(905),1,t)}
function CALM(t,u){let g=`<rect width="1920" height="1080" fill="url(#daysky)"/><rect x="0" y="760" width="1920" height="320" fill="#7fc07a"/><rect x="600" y="760" width="720" height="34" rx="12" fill="#a0683e" stroke="${OUT}" stroke-width="6"/>`;
  g+=WOMAN('#6fb3d9','#f3efe6',{x:960,y:905,face:0,smile:.8,brow:-.3,open:.35+.05*Math.sin(t),look:[0,0]});
  g+=THOUGHT(960,250,'',u,.05,{w:420,size:50})+(u>.1?`<g transform="translate(960,${n(250+Math.sin(t*2+960)*6)})">${star(-110,0,30,t,'#ffd54d')}<circle cx="0" cy="0" r="34" fill="#ff9db5"/><path d="M 80 20 q 30 -60 60 0" stroke="#4caf6a" stroke-width="10" fill="none"/></g>`:'');
  [[300,'#e88f5a',0],[520,'#7fa86b',1],[1400,'#3b4256',0],[1620,'#c27aa8',1]].forEach(([x,c,w],i)=>{const k=es(u,.35+i*.08,.6+i*.08),xx=lerp(x<960?-200:2120,x,k);g+=(w?WOMAN:MAN)(c,'#ffd36b',{x:xx,y:905,s:.9,face:x<960?.7:-.7,smile:.8,brow:-.2,open:1,look:[x<960?.8:-.8,0],walk:k>0&&k<1?t*8:null})});
  return g}
function MAGIC(t,u){let g=`<rect width="1920" height="1080" fill="#2a0f1f"/><path d="M 0 0 L 520 0 Q 420 500 520 1080 L 0 1080 Z" fill="#8a1f3a"/><path d="M 1920 0 L 1400 0 Q 1500 500 1400 1080 L 1920 1080 Z" fill="#8a1f3a"/>`+GLOW(960,500,450,'#fff3c2',.4);
  g+=RING(960,headY(905,1.05),one('m1')(t)>0||u>.3?1:0,t)+`<g>`+MAN('#1d1d26','#c0392b',{x:960,y:905,s:1.05,face:0,aR:150,aL:8+40*Math.sin(t*3),smile:lerp(1,-.6,es(u,.45,.6)),brow:lerp(-.4,1.2,es(u,.45,.6)),open:1,mouth:es(u,0,.05)*(1-es(u,.4,.45))*Math.abs(Math.sin(t*9))*.7,look:[0,0]})+`</g><rect x="890" y="${n(headY(905,1.05)-210)}" width="140" height="110" fill="#1d1d26" stroke="${OUT}" stroke-width="5"/><rect x="860" y="${n(headY(905,1.05)-110)}" width="200" height="20" rx="8" fill="#1d1d26" stroke="${OUT}" stroke-width="5"/>`;
  g+=`<g transform="translate(1140,360) rotate(${n(Math.sin(t*4)*10)})"><rect x="-40" y="-60" width="80" height="120" rx="10" fill="#fff" stroke="${OUT}" stroke-width="5"/>${T(0,20,'A♠',40,OUT,{flat:1})}</g>`;
  g+=THOUGHT(560,240,['It’s in my sleeve.','Don’t think about','the sleeve.'],u,.42,{size:38,tx:300});
  for(let i=0;i<9;i++)g+=shape({x:120+i*210,y:1260,s:.9,eyes:1,look:(960-(120+i*210))/900});
  return g+(u>.78?`<g transform="translate(960,960) rotate(-3)"><rect x="-420" y="-60" width="840" height="110" rx="16" fill="#c0392b" stroke="#fff" stroke-width="7"/>${T(0,22,'MAGICIANS: UNEMPLOYED',58,'#fff')}</g>`:'')}
function POKER2(t,u){let g=`<rect width="1920" height="1080" fill="#14121c"/>`+GLOW(960,500,600,'#fff3c2',.25)+`<ellipse cx="960" cy="860" rx="900" ry="260" fill="#1f6a45" stroke="#6a4a2a" stroke-width="30"/>`;
  const P=[[360,'#7fa86b','Pair of twos.'],[760,'#e88f5a','I have nothing.'],[1160,'#3b4256','Full house!!'],[1560,'#c27aa8','Bluff. Bluff.']];
  P.forEach(([x,c,th],i)=>{g+=RING(x,headY(780,.85),1,t)+MAN(c,'#ffd36b',{x,y:780,s:.85,face:0,smile:-.2,brow:.6,open:1,look:[0,.4]})+THOUGHT(x,250,th,u,.1+i*.12,{size:34})});
  const sec=Math.min(240,Math.floor(u*300));g+=`<g transform="translate(960,1000)"><rect x="-300" y="-60" width="600" height="100" rx="20" fill="#05040f" opacity=".85"/>${T(0,14,'POKER LASTED '+Math.floor(sec/60)+':'+String(sec%60).padStart(2,'0'),46,'#ffe14d',{ls:2})}</g>`;
  return g}
function FORTUNE(t,u){let g=`<rect width="1920" height="1080" fill="#2a1840"/>`;for(let i=0;i<8;i++)g+=`<path d="M ${i*260} 0 Q ${i*260+130} 200 ${i*260+260} 0" fill="${i%2?'#5a2a6a':'#4a1f5a'}"/>`;
  g+=GLOW(960,640,260,'#9be7ff',.6)+`<circle cx="960" cy="640" r="120" fill="#9be7ff" opacity=".55" stroke="#fff" stroke-width="6"/><rect x="560" y="740" width="800" height="40" rx="12" fill="#6a3a2a"/>`;
  g+=WOMAN('#6a2d8a','#ffd54d',{x:620,y:905,face:.6,smile:.9,brow:-.4,open:.6,look:[.8,0]})+MAN('#7fa86b','#f3efe6',{x:1300,y:905,face:-.6,smile:.4,brow:.3,open:blink(t,.2),look:[-.8,0]})+RING(1300,headY(905),1,t);
  g+=THOUGHT(1380,220,['Please say I get','the promotion.'],u,.25,{size:38,tx:-60});
  return g+(u>.6?`<g transform="translate(560,180) rotate(-6)"><rect x="-230" y="-60" width="460" height="100" rx="14" fill="#ffd54d" stroke="${OUT}" stroke-width="6"/>${T(0,14,'100% ACCURATE',46,OUT)}</g>`:'')}
function BANK(t,u){let g=`<rect width="1920" height="1080" fill="#d9d0bf"/>`;for(let i=0;i<5;i++)g+=`<rect x="${120+i*380}" y="80" width="70" height="825" fill="#cbbfa8"/>`;
  g+=`<rect x="1300" y="520" width="620" height="385" fill="#8a6a4c" stroke="${OUT}" stroke-width="7"/>${T(1610,480,'BANK',70,'#5a4a3a',{flat:1})}<rect x="0" y="${FLOOR}" width="1920" height="175" fill="#a8997c"/>`;
  const turn=es(u,.55,.7);
  [[300,'#7fa86b'],[520,'#e88f5a'],[740,'#3b4256'],[960,'#c27aa8']].forEach(([x,c],i)=>{g+=(i===2?RING(x,headY(905,.9),1,t):'')+MAN(c,'#ffd36b',{x,y:905,s:.9,face:i===2?.6:lerp(.6,-.6,turn*(i!==2?1:0)),smile:i===2?-.3:lerp(.2,-.4,turn),brow:i===2?1:lerp(0,.8,turn),open:1,look:[i===2?.8:lerp(.8,-.6,turn),0],head:i===2?Math.sin(t*14)*2:0})});
  g+=THOUGHT(740,200,['Don’t think about','robbing the bank.'],u,.25,{size:40});
  g+=MAN('#2a3360','#ffd54d',{x:1180,y:905,face:lerp(.2,-.6,turn),smile:lerp(.2,-.6,turn),brow:lerp(0,-.9,turn),open:1,look:[lerp(0,-.8,turn),0]});
  return g}
function WORKSHOP(t,u){let g=`<rect width="1920" height="1080" fill="#3a3456"/>`+WINDOWLIGHT(1350,120,460,340,'night',t)+GLOW(780,560,420,'#fff3c2',.35)+`<rect x="0" y="${FLOOR}" width="1920" height="175" fill="#2a2640"/>`;
  g+=`<rect x="300" y="700" width="980" height="34" rx="12" fill="#8a6a4c" stroke="${OUT}" stroke-width="6"/><rect x="340" y="734" width="40" height="170" fill="#6a4a3a"/><rect x="1200" y="734" width="40" height="170" fill="#6a4a3a"/>`;
  const built=es(u,.3,.7);
  g+=girl({x:780,y:905,s:.95,face:0,aL:130+Math.sin(t*8)*10,aR:130-Math.sin(t*8)*10,smile:lerp(.2,1,built),brow:lerp(.6,-.3,built),open:1,look:[0,.6]});
  g+=`<g transform="translate(780,${n(headY(905,.95)-20)})"><path d="M -120 0 Q 0 -150 120 0" stroke="#3a3a4a" stroke-width="22" fill="none" opacity="${n(built)}"/><rect x="-150" y="-30" width="50" height="80" rx="18" fill="#ff5fa2" stroke="${OUT}" stroke-width="5" opacity="${n(built)}"/><rect x="100" y="-30" width="50" height="80" rx="18" fill="#ff5fa2" stroke="${OUT}" stroke-width="5" opacity="${n(built)}"/></g>`;
  for(let i=0;i<5;i++){const a=es(u,.4,.6);g+=`<rect x="${n(420+i*150)}" y="660" width="90" height="16" fill="#c9c06a" transform="rotate(${i*20} ${470+i*150} 668)" opacity="${n(1-a)}"/>`}
  if(built>.9){for(let i=0;i<8;i++){const a=i*.8+t*2;g+=star(780+Math.cos(a)*220,headY(905,.95)+Math.sin(a)*160,16,t,'#ffd54d')}}
  return g+(u>.05?`<g transform="translate(300,140)"><rect x="-200" y="-50" width="400" height="90" rx="16" fill="#05040f" opacity=".7"/>${T(0,16,'SEOUL · DAY 3',42,'#fff',{ls:3})}</g>`:'')}
function SALES(t,u){let g=PLAIN('#3b2f5a','#0b0826')+dust(t);
  g+=`<g transform="translate(560,560) rotate(-6)"><rect x="-230" y="-280" width="460" height="560" rx="20" fill="#ff5fa2" stroke="${OUT}" stroke-width="10"/>${T(0,-140,'MUTE',110,'#fff')}<path d="M -120 60 Q 0 -90 120 60" stroke="#fff" stroke-width="24" fill="none"/><rect x="-150" y="30" width="56" height="90" rx="20" fill="#fff"/><rect x="94" y="30" width="56" height="90" rx="20" fill="#fff"/>${T(0,230,'nobody can hear you think',30,'#fff')}</g>`;
  const v=Math.floor(Math.pow(es(u,.1,.9),1.7)*2e9);g+=`<g transform="translate(1300,560)"><rect x="-420" y="-110" width="840" height="200" rx="30" fill="#05040f" opacity=".85"/>${T(0,-30,'UNITS SOLD',40,'#9aa0b5',{flat:1})}${T(0,60,v.toLocaleString('en-US'),92,'#ffe14d',{ls:3})}</g>`;
  return g}
function STATIC(t,u,off){let g=CITYBIG(t,1,false);
  const P=[[200,'#7fa86b',0],[460,'#e88f5a',1],[720,'#3b4256',0],[980,'#c27aa8',1],[1240,'#6fb3d9',0],[1500,'#d9a03a',1],[1760,'#9a7fd9',0]];
  P.forEach(([x,c,w],i)=>{const x2=x+Math.sin(t*.5+i)*30,removed=off&&u>.2+i*.08;const hy=headY(905,.85);
    if(!removed){let s='';for(let k=0;k<40;k++){const a=k*2.4+t*30,r=60+((k*37+Math.floor(t*30))%60);s+=`<circle cx="${n(x2+Math.cos(a)*r*1.4)}" cy="${n(hy+Math.sin(a)*r)}" r="3" fill="#fff" opacity=".7"/>`}g+=`<ellipse cx="${n(x2)}" cy="${n(hy)}" rx="190" ry="140" fill="#9aa0b5" opacity=".35"/>`+s}
    g+=(w?WOMAN:MAN)(c,'#ffd36b',{x:x2,y:905,s:.85,face:Math.sin(i)*.4,smile:removed?.6:-.3,brow:removed?-.2:.5,open:1,look:[0,0],aR:removed&&u<.2+i*.08+.3?150:8});
    if(!removed)g+=`<path d="M ${n(x2-95)} ${n(hy-20)} Q ${n(x2)} ${n(hy-140)} ${n(x2+95)} ${n(hy-20)}" stroke="#ff5fa2" stroke-width="16" fill="none"/>`});
  return g}
function HOMEK(t,u){let g=kitchenSet(t,true)+GLOW(1480,300,420,'#fff3c2',.25);
  g+=RING(560,headY(905,1.05),one('p1')(t)>0||u>.2?1:0,t,'#ff9db5')+PARTNER({x:560,y:905,face:.5,aL:60+Math.sin(t*3)*10,smile:-.1,brow:.8,open:blink(t,.3),look:[.6,.3]});
  g+=`<rect x="1000" y="640" width="700" height="265" rx="50" fill="#6a5a8a" stroke="${OUT}" stroke-width="7"/>`+YOU({x:1350,y:905,face:lerp(.2,-.6,es(u,.3,.6)),smile:lerp(-.2,.2,es(u,.6,1)),brow:lerp(.4,1,es(u,.3,.6)),open:1,look:[lerp(0,-.9,es(u,.3,.6)),0]})+`<rect x="980" y="760" width="740" height="150" rx="50" fill="#7a6a9a" stroke="${OUT}" stroke-width="7"/>`;
  return g}
function FAMWIN(t,u){let g=`<rect width="1920" height="1080" fill="#1b1636"/>`+dust(t,'#fff',20)+`<rect x="160" y="80" width="1600" height="1000" fill="#2a2450"/>`;
  for(let r=0;r<4;r++)for(let c=0;c<6;c++){const x=240+c*250,y=140+r*230,k=(r*6+c)*7%24;g+=`<rect x="${x}" y="${y}" width="180" height="170" rx="10" fill="#ffd36b" opacity=".85"/>`;
    if(u>k/24)g+=THOUGHT(x+90,y+70,'♥',u*8,k/24*8,{size:40,w:100,tx:0,fill:'#fff'})}
  return g}
function CAR2(t,u){let g=`<rect width="1920" height="1080" fill="url(#daysky)"/>`;
  for(let i=0;i<6;i++){const x=((i*400-t*300)%2400+2400)%2400-300;g+=`<circle cx="${n(x)}" cy="560" r="130" fill="#5aa860"/><rect x="${n(x-12)}" y="600" width="24" height="200" fill="#7a5a3c"/>`}
  g+=`<rect x="0" y="790" width="1920" height="290" fill="#5a5870"/>`;for(let i=0;i<8;i++)g+=`<rect x="${n(((i*300-t*700)%2400+2400)%2400-200)}" y="920" width="140" height="16" fill="#fff"/>`;
  g+=`<g transform="translate(960,${n(800+Math.sin(t*9)*2)})">`+CAR(0,0,'#3a7bd5',1.9)+`</g>`;
  g+=`<defs><clipPath id="cw"><path d="M -95 -165 L -40 -165 L -40 -100 L -150 -100 Z M -10 -165 L 85 -165 L 140 -100 L -10 -100 Z" transform="translate(960,800) scale(1.9)"/></clipPath></defs><g clip-path="url(#cw)">`+MAN('#3b4256','#9aa0b5',{x:1100,y:900,s:.62,face:.6,smile:-.3,brow:.4,open:1,look:[.8,0]})+girl({x:830,y:900,s:.55,face:.6,smile:-.3,brow:.6,open:1,look:[-.3,0]})+`</g>`;
  return g}
function CARIN(t,u,o={}){let g=`<rect width="1920" height="1080" fill="#2a2638"/><path d="M 0 0 L 1920 0 L 1920 520 Q 960 420 0 520 Z" fill="url(#daysky)"/>`;
  for(let i=0;i<5;i++){const x=((i*500-t*500)%2500+2500)%2500-300;g+=`<circle cx="${n(x)}" cy="430" r="90" fill="#5aa860"/>`}
  g+=`<path d="M 0 520 Q 960 420 1920 520 L 1920 1080 L 0 1080 Z" fill="#2a2638"/>`;
  g+=MAN('#3b4256','#9aa0b5',{x:640,y:1010,s:1.05,face:.4,aL:150,aR:40,smile:o.ds==null?-.3:o.ds,brow:o.db==null?.4:o.db,open:1,look:[.3,0]})+girl({x:1300,y:1010,s:1,face:-.3,smile:o.ts==null?-.3:o.ts,brow:o.tb==null?.6:o.tb,open:1,look:[o.tlook==null?.8:o.tlook,.2]});
  g+=RING(640,headY(1010,1.05),o.dr||0,t)+RING(1300,headY(1010,1),o.tr||0,t)+`<circle cx="640" cy="900" r="130" fill="none" stroke="#14121c" stroke-width="28"/><rect x="0" y="960" width="1920" height="120" fill="#1d1a28"/>`;
  return g}
function SCHOOL(t,u,o={}){let g=`<rect width="1920" height="1080" fill="url(#daysky)"/><rect x="0" y="700" width="1920" height="380" fill="#c9b8a0"/><rect x="0" y="300" width="1920" height="400" fill="#c98a6a"/>`;
  for(let i=0;i<6;i++)g+=`<rect x="${100+i*310}" y="360" width="180" height="140" rx="8" fill="#9fd0ea" stroke="#f3efe6" stroke-width="10"/>`;
  [[200,.7],[400,.75],[1500,.7],[1720,.75]].forEach(([x,s],i)=>{g+=(i%2?girl:char)({x,y:960,s,face:x<960?.6:-.6,smile:o.calm?.4:-.2,brow:o.calm?0:.6,open:1,look:[x<960?.8:-.8,0]})});
  const hug=o.hug||0;
  g+=RING(820,headY(960,1.05),o.br||0,t)+MAN('#c0392b','#3b4256',{x:820,y:960,s:1.05,face:.5,smile:lerp(-.3,-.1,hug),brow:lerp(.8,1.2,hug),open:1,aL:8,aR:8,look:[.6,0],head:o.br?Math.sin(t*10)*2:0});
  g+=char({x:lerp(1180,1000,hug),y:960,s:.72,face:-.6,smile:lerp(-.4,.5,hug),brow:lerp(1,-.1,hug),open:1,aL:lerp(8,130,hug),aR:8,look:[-.8,-.3]});
  return g}
function SCIENCE(t,u){let g=PLAIN('#1a2a4a','#05040f')+`<rect x="160" y="110" width="1600" height="760" rx="24" fill="#0b1426" stroke="#2a4a7a" stroke-width="10"/>`;
  const B=[['DID I LOCK THE DOOR?',.62],['DO THEY LIKE ME?',.71],['AM I GOOD ENOUGH?',.8],['WHAT’S FOR DINNER?',.55],['???',1]];
  B.forEach(([s,v],i)=>{const y=210+i*130,w=es(u,.05+i*.08,.5+i*.08)*v*900;g+=T(200,y+24,s,38,i===4?'#ffd54d':'#cfe0ff',{a:'start',flat:1})+`<rect x="680" y="${y-20}" width="${n(w)}" height="56" rx="12" fill="${i===4?'#ffd54d':'#3a7bd5'}"/>`});
  return g+T(960,960,'MOST REPEATED THOUGHTS · WORLDWIDE',40,'#9aa0b5',{flat:1,ls:3})}
function SAMETHOUGHT(t,u){let g=PLAIN('#3b2f5a','#0b0826')+dust(t,'#ffd54d');
  const N=9;for(let i=0;i<N;i++){const r=Math.floor(i/3),c=i%3,x=380+c*580,y=330+r*310,a=es(u,i/N*.7,i/N*.7+.15);g+=`<g opacity="${n(.4+.6*a)}">`+(i%3===1?girl:i%3===2?mother:char)({x,y:y+190,s:.4,face:0,smile:.1,brow:.5,open:1,look:[0,-.4]})+`</g>`+(a>0?THOUGHT(x,y-60,'I hope I\u2019m doing okay.',u*10,(i/N*.7)*10,{size:32,w:450}):'')}
  return g}
function LEADERS(t,u){const k=Math.min(2,Math.floor(u*3)),lu=(u*3)%1;let g='';
  if(k===0)g=OFFICE(t)+MAN('#1d1d26','#c0392b',{x:960,y:905,s:1.15,face:0,smile:1,brow:-.5,open:1,aR:110,look:[0,0]})+RING(960,headY(905,1.15),1,t)+THOUGHT(960,170,'I hope I’m doing okay.',lu,.15,{size:44});
  else if(k===1)g=`<rect width="1920" height="1080" fill="#1d2a5a"/>`+WOMAN('#2a3360','#ffd54d',{x:960,y:905,s:1.05,face:0,smile:.5,brow:-.1,open:1,look:[0,0]})+`<rect x="780" y="640" width="360" height="300" rx="10" fill="#6a4a2a" stroke="${OUT}" stroke-width="8"/>`+RING(960,headY(905,1.05),1,t)+THOUGHT(960,170,'I hope I’m doing okay.',lu,.15,{size:44});
  else g=LIFT(t,{sa:1,s:{smile:.1,brow:.6}})+THOUGHT(760,150,'I hope I’m doing okay.',lu,.15,{size:44});
  return g}
function WEEK(t,d){let g='';for(let i=1;i<=7;i++){const x=960+(i-4)*60,on=i<=d;g+=`<circle cx="${x}" cy="56" r="${i===d?16:11}" fill="${on?'#ffd54d':'#fff'}" opacity="${on?1:.35}"/>`}return g+T(960,108,'DAY '+d,30,'#fff',{flat:1,ls:4,op:.85})}
function DAYCARD(t,s,d,sub){const u=t-s;let g=PLAIN('#2a1d4a','#05040f')+dust(t);g+=POP('DAY '+['','ONE','TWO','THREE','FOUR','FIVE','SIX','SEVEN'][d],960,500,170,'#ffe14d',u,0)+(sub?POP(sub,960,640,60,'#fff',u,.25):'');for(let i=1;i<=7;i++){const x=960+(i-4)*90;g+=`<circle cx="${x}" cy="760" r="${i===d?24:16}" fill="${i<=d?'#ffd54d':'#fff'}" opacity="${i<=d?1:.3}"/>`}return g}
function TEASE(t,u){let g=PLAIN('#2a1d4a','#05040f')+dust(t);const L=[['1 JOB','VANISHES','#ff5f5f'],['1 INVENTION','2 BILLION SOLD','#5ff2e6'],['THE THOUGHT','EVERYONE HAS','#ffd54d']];
  L.forEach(([a,b,c],i)=>{const k=BO((u-i*.22)/.3);if(u>i*.22)g+=`<g transform="translate(${480+i*480},560) scale(${n(k)})"><rect x="-200" y="-200" width="400" height="400" rx="40" fill="#14102e" stroke="${c}" stroke-width="10"/>${T(0,-40,a,56,c)}${T(0,40,b,40,'#fff')}${T(0,140,'?',90,c)}</g>`});return g}
// ---------- shot list ----------
function SHOTS(){const S=[];const A=(s,d,c,f)=>S.push([s,d,c||[960,540,1.02,960,540,1.08],f||0]);
  const L=(o)=>t=>CDEFS+LIFT(t,o);
  A(0,t=>CDEFS+LIFT(t,{floor:String(Math.max(1,4-Math.floor(t/3)))}),[960,560,1.1,960,520,1.2],.6);
  A(at('n02'),L({floor:'3'}),[960,500,1.3,960,480,1.45]);
  A(at('a1'),t=>CDEFS+LIFT(t,{floor:'3',sa:1,s:{brow:1,smile:-.5}})+THOUGHT(560,170,['Please don’t sneeze.','Four more floors.'],t,at('a1')+.2,{size:42,tx:150}),[760,420,1.5,760,400,1.65]);
  A(at('n03'),t=>CDEFS+LIFT(t,{floor:'2',y:{brow:1.1,smile:-.3,face:-.5,look:[-.8,0]},s:{brow:1,smile:-.5}}),[1160,440,1.8,1160,430,1.95]);
  A(at('y1'),t=>CDEFS+LIFT(t,{floor:'2',ya:1,y:{brow:1.2,smile:.2,sqy:1+.01*Math.sin(t*20)},s:{face:.6,brow:.8,smile:-.4,look:[.8,0]}})+THOUGHT(1360,170,['Don’t laugh.','He can hear me.'],t,at('y1')+.2,{size:42,tx:-150}),[1160,420,1.5,1160,400,1.6]);
  A(at('n04'),t=>CDEFS+LIFT(t,{floor:'1',s:{face:.7,brow:1.2,smile:-.6,open:1.15,look:[.9,0]},y:{face:-.5,brow:1.3,smile:-.6,open:1.15,look:[-.9,0]}}),[960,460,1.25,960,500,1.05]);
  A(at('n05'),t=>{const u=U(t,'n05');let g=CDEFS+PLAIN('#2a1d4a','#05040f')+dust(t);const xs=[260,560,860,1160,1460,1760];xs.forEach((x,i)=>{g+=RING(x,headY(905,.8),es(u,.3+i*.06,.4+i*.06),t)+(i%2?WOMAN:MAN)(['#7fa86b','#e88f5a','#3b4256','#c27aa8','#6fb3d9','#d9a03a'][i],'#ffd36b',{x,y:905,s:.8,face:0,smile:.2,brow:.3,open:1,look:[0,0]})});
    if(u>.55)g+=`<g opacity="${n(es(u,.55,.7))}"><line x1="260" y1="210" x2="560" y2="210" stroke="#fff" stroke-width="5"/><polygon points="260,210 284,198 284,222" fill="#fff"/><polygon points="560,210 536,198 536,222" fill="#fff"/>${T(410,190,'3 METRES',40,'#fff')}</g>`;return g},[960,560,1.15,960,560,1.0],.3);
  A(at('n06'),t=>CDEFS+TEASE(t,U(t,'n06')),[960,560,1.06,960,560,1.0]);
  A(C.title,t=>{const u=(t-C.title)/1.6;return CDEFS+PLAIN('#2a1d4a','#05040f')+GLOW(960,540,500,'#bfa8ff',.15)+RING(960,540,1,t)+POP('WHAT IF EVERYONE COULD',960,470,96,'#fff',u,0)+POP('HEAR YOUR THOUGHTS?',960,610,120,'#ffe14d',u,.12)},[960,540,1.15,960,540,1.0]);
  A(at('n07'),t=>CDEFS+PLAIN('#3b2f5a','#0b0826')+dust(t)+POP('ONE NUMBER',960,560,140,'#fff',t,at('n07',.3)),[960,540,1.1,960,540,1.0]);
  A(at('n08'),t=>{const u=U(t,'n08');const v=Math.floor(es(u,.3,.9)*6200);return CDEFS+PLAIN('#3b2f5a','#0b0826')+dust(t)+GLOW(960,520,500,'#bfa8ff',.2)+T(960,580,v.toLocaleString('en-US'),240,'#ffe14d')+T(960,720,'THOUGHTS A DAY',70,'#fff')+T(1880,1050,'Tseng & Poppenk, Queen’s University, 2020 (estimate)',28,'#cfc8e6',{a:'end',flat:1,op:.8})},[960,560,1.0,960,560,1.1]);
  A(at('n09'),t=>{const u=U(t,'n09');let g=CDEFS+PLAIN('#3b2f5a','#0b0826')+dust(t)+YOU({x:960,y:1000,face:0,smile:.2,brow:.3,open:blink(t,.4),look:[Math.sin(t*2)*.6,-.4]})+RING(960,headY(1000),1,t);
    for(let i=0;i<8;i++){const t0=at('n09')+i*.55;if(t>t0){const a=i*.8;g+=`<g opacity="${n(1-es(t,t0+1.2,t0+1.8))}">`+THOUGHT(960+Math.cos(a)*600,420+Math.sin(a)*200,['Hungry.','Text Mum.','Bills.','That song…','Cringe.','Nap?','Coffee.','Did I…?'][i],t,t0,{size:34,tx:Math.cos(a)>0?-120:120})+`</g>`}}
    return g+(u>.5?POP('1 EVERY 9 SECONDS',960,130,72,'#ffe14d',u,.5):'')},[960,560,1.0,960,600,1.1]);
  // day one
  A(at('n10'),t=>CDEFS+DAYCARD(t,at('n10'),1,'THE TRAIN'),[960,540,1.1,960,540,1.0]);
  A(at('n11'),t=>CDEFS+TRAIN(t),[960,560,1.0,960,560,1.08]);
  A(at('n12'),t=>{const u=U(t,'n12');let g=CDEFS+TRAIN(t);[['Is that my stop?',180,.0],['So tired.',660,.18],['Oven??',1140,.34],['Don’t look at him.',1620,.5],['Is that my stop?',420,.7],['Is that my stop?',1380,.82]].forEach(([s,x,f],i)=>{g+=RING(x,headY(905,.82),u>f?1:0,t)+THOUGHT(x,180+(i%2)*90,s,u*6,f*6,{size:34})});return g},[960,520,1.12,960,520,1.0]);
  A(at('n13'),t=>CDEFS+TRAIN(t)+NOTES(t,es(t,at('n13',.5),at('n13',.7)),1620,500,80)+THOUGHT(1620,200,'♪ ♫ ♪',t,at('n13',.5),{size:50,w:220}),[1620,520,1.8,1620,500,1.9]);
  A(at('n14'),t=>{const u=U(t,'n14');return u<.5?CDEFS+TRAIN(t,{hum:1})+NOTES(t,1,960,700,900):CDEFS+CITYBIG(t,1,false)+NOTES(t,1,960,800,1000)+NOTES(t+3,1,400,700,600)+NOTES(t+5,1,1500,700,600)},[960,540,1.0,960,540,1.06]);
  A(at('n15'),t=>CDEFS+RESTO(t),[900,540,1.05,900,540,1.15],.3);
  A(at('w1'),t=>CDEFS+RESTO(t,{wa:1,w:{smile:.8}})+THOUGHT(1340,170,['He’s going to','send it back.'],t,at('w1')+.2,{size:40,tx:-120}),[1180,420,1.6,1180,410,1.7]);
  A(at('n16'),t=>{const u=U(t,'n16');return CDEFS+RESTO(t,{soupX:lerp(820,1000,es(u,.5,.8)),y:{smile:lerp(.3,.6,es(u,.4,.6)),brow:lerp(0,-.5,es(u,.4,.6)),aR:lerp(8,90,es(u,.4,.7))},w:{smile:lerp(.6,-.4,es(u,.6,.8)),brow:lerp(.2,1,es(u,.6,.8))}})},[860,520,1.4,900,520,1.25]);
  A(at('n48'),t=>CDEFS+DATE2(t,U(t,'n48')),[960,520,1.05,960,500,1.15]);
  A(at('n17'),t=>CDEFS+CALM(t,U(t,'n17')),[960,540,1.08,960,540,1.0]);
  A(at('n18'),t=>CDEFS+CALM(t,U(t,'n18')*.3),[960,420,1.6,960,420,1.7]);
  A(at('n19'),t=>CDEFS+CALM(t,.3+U(t,'n19')*.7),[960,560,1.05,960,560,1.0]);
  // day two
  A(at('n20'),t=>CDEFS+DAYCARD(t,at('n20'),2,'A JOB VANISHES'),[960,540,1.1,960,540,1.0]);
  A(at('n21'),t=>CDEFS+MAGIC(t,U(t,'n21')*.25),[960,520,1.0,960,500,1.15]);
  A(at('m1'),t=>CDEFS+MAGIC(t,.25+U(t,'m1')*.55),[860,420,1.45,860,420,1.55]);
  A(at('n22'),t=>CDEFS+POKER2(t,U(t,'n22')),[960,540,1.06,960,540,1.0]);
  A(at('n49'),t=>CDEFS+FORTUNE(t,U(t,'n49')),[960,540,1.0,1000,500,1.12]);
  A(at('n50'),t=>CDEFS+BANK(t,U(t,'n50')),[960,540,1.0,900,520,1.12]);
  // day three
  A(at('n23'),t=>CDEFS+DAYCARD(t,at('n23'),3,'THE INVENTION'),[960,540,1.1,960,540,1.0]);
  A(at('n24'),t=>CDEFS+WORKSHOP(t,U(t,'n24')),[860,540,1.1,800,480,1.35]);
  A(at('n25'),t=>CDEFS+SALES(t,U(t,'n25')),[960,540,1.08,960,540,1.0]);
  A(at('n26'),t=>CDEFS+STATIC(t,U(t,'n26'),0),[960,540,1.0,960,540,1.08]);
  A(at('n27'),t=>CDEFS+STATIC(t,U(t,'n27'),1),[960,540,1.08,960,540,1.0]);
  // day four
  A(at('n28'),t=>CDEFS+DAYCARD(t,at('n28'),4,'HOME'),[960,540,1.1,960,540,1.0]);
  A(at('n28',.35),t=>CDEFS+HOMEK(t,0),[1100,540,1.0,1100,540,1.1]);
  A(at('p1'),t=>CDEFS+HOMEK(t,.3)+THOUGHT(560,150,['I hope he’s okay.','I don’t know how to ask.'],t,at('p1')+.2,{size:38,tx:0}),[700,480,1.35,700,470,1.45]);
  A(at('n29'),t=>CDEFS+HOMEK(t,U(t,'n29')),[1350,500,1.6,1350,490,1.75]);
  A(at('n30'),t=>CDEFS+FAMWIN(t,U(t,'n30')),[960,540,1.08,960,540,1.0]);
  A(at('n31'),t=>CDEFS+CAR2(t,U(t,'n31')),[960,620,1.0,960,600,1.12]);
  A(at('t1'),t=>CDEFS+CARIN(t,0,{tr:1,tlook:.2})+THOUGHT(1300,230,['I miss when Dad','and I used to talk.'],t,at('t1')+.2,{size:40,tx:0}),[1200,480,1.4,1200,470,1.5]);
  A(at('d1'),t=>CDEFS+CARIN(t,0,{dr:1,db:.9,ds:-.1})+THOUGHT(640,230,'Me too, kiddo.',t,at('d1')+.1,{size:44,tx:0}),[700,480,1.4,700,470,1.5]);
  A(at('n32'),t=>{const u=U(t,'n32');return CDEFS+CARIN(t,u,{ds:lerp(-.1,.5,es(u,.4,.8)),db:lerp(.9,.1,es(u,.4,.8)),ts:lerp(-.3,.7,es(u,.5,.9)),tb:lerp(.6,-.1,es(u,.5,.9)),tlook:lerp(.2,-.8,es(u,.3,.6))})},[960,560,1.2,960,560,1.05]);
  // day five
  A(at('n33'),t=>CDEFS+DAYCARD(t,at('n33'),5,'SCHOOL'),[960,540,1.1,960,540,1.0]);
  A(at('n34'),t=>CDEFS+SCHOOL(t,U(t,'n34'),{br:es(t,at('n34',.6),at('n34',.8))}),[960,560,1.0,960,560,1.1]);
  A(at('h1'),t=>CDEFS+SCHOOL(t,0,{br:1})+THOUGHT(820,150,['If I’m not tough,','they’ll find out','about my house.'],t,at('h1')+.15,{size:38,tx:0}),[820,420,1.45,820,410,1.55]);
  A(at('n35'),t=>CDEFS+SCHOOL(t,0,{br:1,calm:1})+THOUGHT(820,170,'🏠',t,at('n35'),{size:70,w:200,tx:0}),[900,500,1.3,900,500,1.2]);
  A(at('n36'),t=>CDEFS+SCHOOL(t,0,{hug:es(t,at('n36',.2),at('n36',.7)),calm:1}),[960,520,1.2,960,540,1.05]);
  // day six
  A(at('n37'),t=>CDEFS+DAYCARD(t,at('n37'),6,'THE THOUGHT'),[960,540,1.1,960,540,1.0]);
  A(at('n38'),t=>CDEFS+SCIENCE(t,U(t,'n38')),[960,500,1.0,960,500,1.08]);
  A(at('n39'),t=>{const u=U(t,'n39');return CDEFS+SCIENCE(t,1)+`<rect width="1920" height="1080" fill="#05040f" opacity="${n(es(u,.5,1)*.6)}"/>`},[960,700,1.1,1100,740,1.9]);
  A(at('q1'),t=>CDEFS+PLAIN('#3b2f5a','#0b0826')+GLOW(960,540,500,'#ffd54d',.3)+POP('I HOPE I’M',960,480,130,'#fff',t,at('q1'))+POP('DOING OKAY.',960,640,150,'#ffe14d',t,at('q1')+.35),[960,560,1.15,960,560,1.0]);
  A(at('q2'),t=>CDEFS+SAMETHOUGHT(t,U(t,'q2')*.35),[960,560,1.0,960,560,1.04]);
  A(at('q3'),t=>CDEFS+SAMETHOUGHT(t,.35+U(t,'q3')*.3),[960,560,1.04,960,560,1.08]);
  A(at('n40'),t=>CDEFS+LEADERS(t,U(t,'n40')),[960,540,1.05,960,500,1.15]);
  A(at('n41'),t=>CDEFS+SAMETHOUGHT(t,.65+U(t,'n41')*.35),[960,560,1.12,960,560,1.0]);
  // day seven
  A(at('n42'),t=>CDEFS+DAYCARD(t,at('n42'),7,'SILENCE'),[960,540,1.1,960,540,1.0]);
  A(at('n43'),t=>CDEFS+LIFT(t,{floor:String(Math.max(1,4-Math.floor((t-at('n43'))/2)))}),[960,560,1.1,960,520,1.2],.3);
  A(at('n44'),t=>CDEFS+LIFT(t,{floor:'2',s:{face:.5,smile:.3,brow:.4,look:[.8,0]},y:{face:-.3}}),[960,480,1.3,960,470,1.4]);
  A(at('a2'),t=>CDEFS+LIFT(t,{floor:'2',s:{face:.6,smile:.9,brow:.2,mouth:one('a2')(t),look:[.8,0]},y:{face:-.5,smile:.6,look:[-.8,0]}})+BUB(760,200,'Sneeze. All week.',t,at('a2')+.3,{size:44}),[760,440,1.6,760,430,1.7]);
  A(at('y2'),t=>CDEFS+LIFT(t,{floor:'1',s:{face:.6,smile:1,look:[.8,0]},y:{face:-.6,smile:1,mouth:one('y2')(t),look:[-.8,0]}})+BUB(1160,200,'Me too. I was nervous.',t,at('y2')+.2,{size:44}),[1160,440,1.6,1160,430,1.7]);
  A(at('n45'),t=>CDEFS+LIFT(t,{floor:'G',s:{face:.6,smile:1.2,open:.3,mouth:.4+.3*Math.abs(Math.sin(t*8)),bob:-Math.abs(Math.sin(t*8))*8,look:[.8,0]},y:{face:-.6,smile:1.2,open:.3,mouth:.4+.3*Math.abs(Math.sin(t*8+1)),bob:-Math.abs(Math.sin(t*8+1))*8,look:[-.8,0]}})+GLOW(960,500,500,'#ffd54d',.25),[960,520,1.3,960,540,1.05]);
  A(at('n46'),t=>CDEFS+PLAIN('#4a3a2a','#140f0a')+dust(t,'#ffd54d')+POP('THEY WERE',960,440,110,'#fff',t,at('n46',.55))+POP('JUST LIKE YOURS.',960,600,130,'#ffd54d',t,at('n46',.7)),[960,540,1.06,960,540,1.0],.3);
  A(at('n47'),t=>{const u=U(t,'n47');return CDEFS+PLAIN('#3b2f5a','#0b0826')+dust(t)+THOUGHT(960,330,['The thought you’d','never want heard.'],u*5,.2,{size:56})+(u>.45?`<line x1="640" y1="330" x2="${n(640+640*es(u,.45,.55))}" y2="330" stroke="#ff5f5f" stroke-width="20" stroke-linecap="round"/>`:'')+(u>.6?POP('TELL ME THE SECOND ONE',960,700,80,'#ffe14d',u*5,3):'')+(u>.75?`<g transform="translate(960,${n(880+Math.sin(t*3)*8)})"><rect x="-360" y="-60" width="720" height="120" rx="34" fill="#fff" stroke="${OUT}" stroke-width="7"/>${T(0,20,'IN THE COMMENTS',58,OUT)}</g>`:'')},[960,540,1.05,960,540,1.0],.4);
  return S}
let SHOTL=null;
function camT(c,u){const k=E(u),z=lerp(c[2],c[5],k);let cx=lerp(c[0],c[3],k),cy=lerp(c[1],c[4],k);cx=cl(cx,960/z,1920-960/z);cy=cl(cy,540/z,1080-540/z);return `translate(960,540) scale(${z.toFixed(4)}) translate(${n(-cx)},${n(-cy)})`}
const DAYS=()=>[[at('n10'),1],[at('n20'),2],[at('n23'),3],[at('n28'),4],[at('n33'),5],[at('n37'),6],[at('n42'),7]];
window.renderAt=function(t){
  if(!SHOTL)SHOTL=SHOTS().sort((a,b)=>a[0]-b[0]);
  let i=0;while(i<SHOTL.length-1&&t>=SHOTL[i+1][0])i++;
  const [s,draw,cam,fade]=SHOTL[i],e=i<SHOTL.length-1?SHOTL[i+1][0]:D.total,u=cl((t-s)/Math.max(.1,e-s));
  let g=DEFS+`<g transform="${camT(cam,u)}">${draw(t,u)}</g>`;
  if(fade)g+=`<rect width="1920" height="1080" fill="#05040f" opacity="${n(1-es(t,s,s+fade))}"/>`;
  g+=`<rect width="1920" height="1080" fill="url(#vig)"/><rect width="1920" height="1080" fill="#bfa8ff" opacity=".03"/>`;
  let d=0;for(const [a,k] of DAYS())if(t>=a+1.4)d=k;if(d&&t<at('n46'))g+=WEEK(t,d);
  const ea=es(t,C.end,C.end+.5);if(ea>0)g+=`<g opacity="${n(ea)}"><rect width="1920" height="1080" fill="#08071a"/>${T(960,500,'FOLLOW',130,'#fff')}${T(960,640,'FOR MORE WHAT IFs',76,'#ffe14d')}</g>`;
  g+=`<rect width="1920" height="1080" fill="#000" opacity="${n(es(t,D.total-.7,D.total-.1))}"/>`;
  document.getElementById('s').innerHTML=g;
};
window.DATA={fps:D.fps,total:D.total};
window.ready=document.fonts.load('600 40px Fredoka').then(()=>{renderAt(+(new URLSearchParams(location.search).get('t')||0));return true});
