/* What if you stopped sleeping? (standalone explainer Short) */
const bo=u=>{u=cl(u);return 1+2.70158*Math.pow(u-1,3)+1.70158*Math.pow(u-1,2)};
const POP=(txt,x,y,size,c,t,t0,rot=0)=>{if(t<t0)return '';const k=bo((t-t0)/.35);return `<g transform="translate(${x},${y}) rotate(${rot}) scale(${n(k)})">${TXT(0,0,txt,size,c)}</g>`};
const lin=(k,t)=>{if(t<=k[0][0])return k[0][1];for(let i=0;i<k.length-1;i++)if(t<=k[i+1][0])return lerp(k[i][1],k[i+1][1],(t-k[i][0])/Math.max(.001,k[i+1][0]-k[i][0]));return k[k.length-1][1]};
const chip=(x,y,w,label,val,c)=>`<g transform="translate(${x},${y})"><rect x="0" y="0" width="${w}" height="104" rx="18" fill="#05040f" opacity=".78"/><text x="${w/2}" y="34" font-size="26" text-anchor="middle" fill="#9aa0b5" letter-spacing="3">${label}</text>${TXT(w/2,86,val,46,c)}</g>`;
function stars(t,a=1){let g='';for(let i=0;i<50;i++){const x=(i*137)%1080,y=(i*251)%1300,k=.3+.7*Math.abs(Math.sin(t*1.5+i));g+=`<circle cx="${x}" cy="${y}" r="${1.5+i%3}" fill="#fff" opacity="${n(k*.7*a)}"/>`}return g}
function poll(t,t0,tEnd,opts){let g='';const u=t-t0;
  opts.forEach(([k,txt,c],i)=>{const a=bo((u-i*.15)/.45),x=lerp(1400,540,a),w=Math.sin(t*5+i)*4;
    g+=`<g transform="translate(${n(x)},${700+i*190}) rotate(${n(w)})"><rect x="-380" y="-70" width="760" height="140" rx="34" fill="#fff" stroke="${OUT}" stroke-width="8"/><circle cx="-300" cy="0" r="48" fill="${c}" stroke="${OUT}" stroke-width="6"/>${TXT(-300,18,k,54,OUT)}${TXT(40,22,txt,64,OUT)}</g>`});
  const cd=t-tEnd;if(cd>0){const num=Math.max(1,3-Math.floor(cd/1.05)),f=(cd/1.05)%1,k=1.3-.3*es(f,0,.3);
    g+=`<g transform="translate(540,1330)"><circle r="96" fill="#05040f" opacity=".8"/><circle r="96" fill="none" stroke="#ffe14d" stroke-width="14" stroke-dasharray="${n(603*(1-f))} 603" transform="rotate(-90)"/><g transform="scale(${n(k)})">${TXT(0,36,String(num),110,'#fff')}</g></g>`}
  return g}
function confetti(t,t0,cx,cy,dur=1.4){if(t<t0||t>t0+dur)return '';let g='';const u=t-t0;for(let i=0;i<40;i++){const x=cx+Math.cos(i*2.4)*u*(260+i*9),y=cy+Math.sin(i*2.4)*u*260+u*u*400;g+=`<rect x="${n(x)}" y="${n(y)}" width="18" height="10" fill="${['#ff5fa2','#5ff2e6','#ffe14d'][i%3]}" transform="rotate(${n(u*400+i*30)} ${n(x)} ${n(y)})"/>`}return g}
// a cartoon brain
function BRAIN(cx,cy,s,col,t,o={}){
  let g=`<g transform="translate(${cx},${cy}) scale(${s})"><defs><clipPath id="brc"><path d="M -300 20 C -320 -150 -170 -240 -40 -220 C 60 -260 250 -230 300 -80 C 340 40 290 170 160 190 C 60 230 -80 230 -180 190 C -280 160 -300 100 -300 20 Z"/></clipPath></defs>`;
  g+=`<path d="M -300 20 C -320 -150 -170 -240 -40 -220 C 60 -260 250 -230 300 -80 C 340 40 290 170 160 190 C 60 230 -80 230 -180 190 C -280 160 -300 100 -300 20 Z" fill="${col}" stroke="${OUT}" stroke-width="10"/>`;
  g+=`<g clip-path="url(#brc)" stroke="${OUT}" stroke-width="8" fill="none" stroke-linecap="round" opacity=".55">`;
  for(let r=0;r<6;r++){let p=`M -320 ${-180+r*70}`;for(let x=-320;x<=320;x+=40)p+=` q 20 ${r%2?-28:28} 40 0`;g+=`<path d="${p}" transform="translate(${n(Math.sin(t*.8+r)*8)},0)"/>`}
  g+=`<path d="M 0 -220 Q 20 0 -10 200" stroke-width="10"/>`+(o.inner||'')+`</g>`;
  return g+`<path d="M 60 190 Q 70 260 40 320 L 100 320 Q 120 250 120 185 Z" fill="${col}" stroke="${OUT}" stroke-width="10"/></g>`}
const BLANKET2=(x,y)=>`<path d="M ${x-290} ${y-60} q 300 -40 620 0 v 120 h -620 Z" fill="#ff9db5" stroke="${OUT}" stroke-width="8" stroke-linejoin="round"/>`;
const BEDW=(x,y)=>`<g transform="translate(${x},${y})"><rect x="-330" y="-40" width="660" height="140" rx="26" fill="#6b5aa8" stroke="${OUT}" stroke-width="8"/><rect x="-360" y="-200" width="60" height="320" rx="20" fill="#4a3e7a" stroke="${OUT}" stroke-width="8"/><rect x="-300" y="-90" width="190" height="80" rx="34" fill="#f2efff" stroke="${OUT}" stroke-width="7"/></g>`;
function battery(x,y,f,t){const c=f>.5?'#4caf6a':f>.2?'#ffb31a':'#ff2d2d',blink=f<.2&&Math.floor(t*4)%2;return `<g transform="translate(${x},${y})"><rect x="-90" y="-40" width="170" height="80" rx="14" fill="#05040f" stroke="#fff" stroke-width="7"/><rect x="82" y="-16" width="16" height="32" rx="4" fill="#fff"/><rect x="-80" y="-30" width="${n(150*cl(f))}" height="60" rx="8" fill="${c}" opacity="${blink?.3:1}"/></g>`}
window.renderAt=function(t){
  let g=DEFS,hud='';
  const H=lin([[C.go,16],[V.n04.s,24],[V.n05.s,48],[V.n06.s,70],[C.brain,72]],t),bat=lin([[0,.9],[C.go,.75],[V.n04.s,.6],[V.n05.s,.35],[V.n06.s,.15],[C.brain,.05]],t);
  if(t<C.poll){ // wide awake in bed
    g+=`<rect width="1080" height="1920" fill="#120e2e"/>`+stars(t)+`<rect x="660" y="520" width="300" height="300" rx="20" fill="#0b0826" stroke="#3a2f70" stroke-width="14"/><circle cx="870" cy="610" r="50" fill="#f6f1c8"/>`;
    g+=wallClock(260,660,90,t*60,false);
    const z=1+.06*Math.sin(t*.9);g+=`<g transform="translate(540,1300) scale(${n(z)}) translate(-540,-1300)">`+BEDW(540,1330)+char({x:560,y:1380,face:.1,aL:20,aR:20,smile:-.3,brow:1,open:1.15,look:[Math.sin(t*2)*.6,-.3]})+BLANKET2(560,1320)+`</g>`;
    g+=battery(570,740+Math.sin(t*3)*8,bat,t);
  }else if(t<C.go){
    g+=`<rect width="1080" height="1920" fill="#120e2e"/>`+stars(t,.5)+poll(t,C.poll,V.n02.e,[['A','3 DAYS','#5ff2e6'],['B','11 DAYS','#ffe14d'],['C','1 MONTH','#ff5fa2']]);
  }else if(t<C.brain){ // the clock runs
    const ph=(t-C.go)/4,day=(Math.sin(ph*2*PI)+1)/2;
    const sky=`rgb(${n(lerp(18,120,day))},${n(lerp(14,170,day))},${n(lerp(46,230,day))})`;
    g+=`<rect width="1080" height="1920" fill="${sky}"/>`+stars(t,1-day);
    const ang=ph*2*PI;g+=`<circle cx="${n(540+Math.cos(ang-PI/2)*420)}" cy="${n(980+Math.sin(ang-PI/2)*420)}" r="70" fill="#ffd54d"/><circle cx="${n(540-Math.cos(ang-PI/2)*420)}" cy="${n(980-Math.sin(ang-PI/2)*420)}" r="56" fill="#f6f1c8"/>`;
    g+=`<rect x="0" y="1380" width="1080" height="540" fill="#3b2f6e"/><rect x="0" y="1380" width="1080" height="20" fill="#55479a"/>`;
    const micro=t>=V.n05.s&&t<V.n06.s,hall=t>=V.n06.s;
    const sway=t>=V.n04.s?Math.sin(t*2.2)*lerp(5,12,cl((H-24)/48)):0;
    const lids=micro?(Math.sin(t*3)>.4?.2:.75):hall?.6:t>=V.n04.s?.85:1;
    if(hall)for(let i=0;i<5;i++){const a=.5+.5*Math.sin(t*1.7+i*1.3),x=150+i*200+Math.sin(t+i)*40;g+=shape({x,y:1400,s:.45+(i%2)*.1,op:a*.75,eyes:a,look:(540-x)/600})}
    const wob=hall?`skewX(${n(Math.sin(t*2.5)*4)})`:'';
    g+=`<g transform="translate(540,1420) ${wob} rotate(${n(sway)}) translate(-540,-1420)">`+char({x:540,y:1420,s:1.15,face:Math.sin(t*.9)*.3,aL:8+(t<V.n04.s?pulse(t,V.n03.s+.4,V.n03.s+2,.3)*120:0),aR:8,smile:lerp(.4,-.6,cl((H-16)/56)),brow:lerp(0,1.2,cl((H-16)/56)),open:lids,mouth:pulse(t,V.n03.s+.4,V.n03.s+2,.3)*.9,look:[hall?Math.sin(t*3)*.8:0,0]})+`</g>`;
    if(t>=V.n04.s&&t<V.n05.s){const a=es(t,V.n04.s+.8,V.n04.s+1.4);g+=`<g opacity="${n(a)}" transform="translate(830,${n(1060+Math.sin(t*3)*10)}) rotate(${n(Math.sin(t*2)*6)})"><rect x="-70" y="-90" width="140" height="180" rx="18" fill="#ffd36b" stroke="${OUT}" stroke-width="7"/><rect x="-70" y="-90" width="140" height="44" rx="18" fill="#fff" stroke="${OUT}" stroke-width="7"/><path d="M 70 -40 h 40 a 30 30 0 0 1 0 90 h -40" fill="none" stroke="${OUT}" stroke-width="10"/></g>`+POP('≈ OVER THE LIMIT',540,860,70,'#ffe14d',t,V.n04.s+1.6)}
    if(micro){const blk=Math.sin(t*3)>.85;if(blk)g+=`<rect width="1080" height="1920" fill="#000"/>`+TXT(540,960,'MICROSLEEP',70,'#5a5a7a')}
    if(hall){const qa=pulse(t,V.n06.s+.8,V.n06.s+3,.3);if(qa>0)g+=`<g opacity="${n(qa)}" transform="translate(540,${n(920+Math.sin(t*4)*10)})"><rect x="-300" y="-70" width="600" height="120" rx="50" fill="#fff" stroke="${OUT}" stroke-width="6"/>${TXT(0,12,'WHAT WAS I… ?',56,OUT)}</g>`}
    hud=chip(40,360,320,'HOURS AWAKE',String(Math.floor(H)),'#fff')+chip(380,360,320,'DAY',String(Math.max(1,Math.ceil(H/24))),'#ffe14d')+`<g transform="translate(720,360)"><rect width="320" height="104" rx="18" fill="#05040f" opacity=".78"/><text x="160" y="34" font-size="26" text-anchor="middle" fill="#9aa0b5" letter-spacing="3">BRAIN</text></g>`+battery(870,425,bat,t);
  }else if(t<C.rec){ // the trash
    g+=`<rect width="1080" height="1920" fill="#14102e"/>`;
    const sleepM=t<V.n08.s,u=sleepM?es(t,V.n07.s+3,V.n07.e):0,pile=es(t,V.n08.s,V.n08.e+.4);
    let inner='';
    const N=sleepM?Math.round(40*(1-u)):Math.round(lerp(40,140,pile));
    for(let i=0;i<N;i++){const x=-260+((i*73)%520),y=-180+((i*131)%360),dx=sleepM?u*600:0,yy=y+(sleepM?0:Math.sin(t*2+i)*4);inner+=`<circle cx="${n(x+dx)}" cy="${n(yy)}" r="${8+i%4*3}" fill="#6b6b7a" stroke="${OUT}" stroke-width="3"/>`}
    if(sleepM&&u>0)inner+=`<rect x="${n(-400+u*800)}" y="-260" width="200" height="520" fill="#5ff2e6" opacity=".45"/>`;
    const col=sleepM?'#ff9db5':`rgb(${n(lerp(255,150,pile))},${n(lerp(157,140,pile))},${n(lerp(181,150,pile))})`;
    g+=BRAIN(540,980,1.2+.02*Math.sin(t*3),col,t,{inner});
    g+=POP(sleepM?'ASLEEP: CLEAN-UP':'AWAKE: PILING UP',540,620,64,sleepM?'#5ff2e6':'#ff5f5f',t,sleepM?V.n07.s+1.5:V.n08.s);
    if(!sleepM&&Math.floor(t*3)%2)g+=`<g transform="translate(860,1300)"><polygon points="0,-70 70,60 -70,60" fill="#ffd21a" stroke="${OUT}" stroke-width="8" stroke-linejoin="round"/>${TXT(0,40,'!',80,OUT)}</g>`;
  }else if(t<C.ask){ // the record
    g+=`<rect width="1080" height="1920" fill="#e9dcc2"/>`;
    for(let i=0;i<16;i++)g+=`<rect x="${60+(i%2)*500}" y="${600+Math.floor(i/2)*110}" width="${400+(i*37)%60}" height="18" rx="9" fill="#c8b89a"/>`;
    const card=bo((t-C.rec)/.5);
    g+=`<g transform="translate(540,${n(lerp(-300,900,card))}) rotate(${n(-4+Math.sin(t)*1.5)})"><rect x="-420" y="-260" width="840" height="520" fill="#fffaf0" stroke="${OUT}" stroke-width="8"/>${TXT(0,-190,'THE DAILY RECORD · 1964',40,'#5a4a3a')}<rect x="-380" y="-160" width="760" height="6" fill="#5a4a3a"/>${TXT(0,-80,'17-YEAR-OLD STAYS',62,'#2a1550')}${TXT(0,0,'AWAKE FOR',62,'#2a1550')}${TXT(0,150,Math.round(lin([[V.n09.s+2,0],[V.n09.e,264]],t))+' HOURS',120,'#c0392b')}</g>`;
    const ans=t>=V.n10.s;if(ans)g+=POP('11 DAYS',540,1260,150,'#ffe14d',t,V.n10.s,-5)+POP('B WAS RIGHT ✓',540,1370,60,'#2a1550',t,V.n10.s+.6)+confetti(t,V.n10.s,540,1260);
    const sl=t>=V.n11.s;if(sl){const later=t>=V.n11.s+(V.n11.e-V.n11.s)*.45;g+=`<rect width="1080" height="1920" fill="${later?'#120e2e':'#2a2058'}"/>`+stars(t,later?1:.4)+BEDW(540,1300)+(later?char({x:560,y:1350,s:1,face:0,aL:20,aR:20,smile:-.4,brow:1,open:1.1,look:[Math.sin(t*2)*.5,-.2]})+BLANKET2(560,1290):`<g transform="translate(${n(620+Math.sin(t*1.5)*3)},1180) rotate(-90)">${char({x:0,y:140,s:.95,face:0,aL:10,aR:10,smile:.6,brow:-.2,open:.08,look:[0,0]})}</g><path d="M 470 1220 q 200 -40 420 0 v 130 h -420 Z" fill="#ff9db5" stroke="${OUT}" stroke-width="8" stroke-linejoin="round"/>`);
      if(!later)for(let i=0;i<3;i++){const u=((t*.8+i/3)%1);g+=`<g opacity="${n(1-u)}">${TXT(n(640+u*160),n(820-u*260-i*10),'Z',60+i*20,'#fff')}</g>`}
      g+=POP(later?'60 YEARS LATER…':'SLEPT 14 HOURS',540,700,72,'#ffe14d',t,later?V.n11.s+(V.n11.e-V.n11.s)*.45:V.n11.s+.2)}
  }else{ // your turn
    g+=`<rect width="1080" height="1920" fill="#0b0826"/>`+stars(t)+POP('YOUR RECORD?',540,700,110,'#fff',t,C.ask);
    [['1 NIGHT','#5ff2e6'],['2 DAYS','#ffe14d'],['3+ DAYS','#ff5fa2']].forEach(([w,c],i)=>{const k=bo((t-C.ask-.3-i*.15)/.35)*(1+.04*Math.sin(t*6+i*2));if(t>C.ask+.3)g+=`<g transform="translate(540,${900+i*170}) scale(${n(k)})"><rect x="-300" y="-65" width="600" height="130" rx="40" fill="${c}" stroke="${OUT}" stroke-width="8"/>${TXT(0,24,w,70,OUT)}</g>`});
    g+=`<g transform="translate(540,${n(1430+Math.sin(t*4)*10)})"><rect x="-380" y="-60" width="760" height="120" rx="34" fill="#fff" stroke="${OUT}" stroke-width="6"/>${TXT(0,20,'TELL ME IN THE COMMENTS',52,OUT)}</g>`;
    NOSUB=1;
  }
  frameOut(g,t,'WHAT IF YOU','STOPPED SLEEPING?',hud);NOSUB=0;
};
function endcard(t){const a=es(t,C.end,C.end+.4);if(a<=0)return '';
  return `<g opacity="${n(a)}"><rect width="1080" height="1920" fill="#08071a" opacity=".93"/>${TXT(540,880,'FOLLOW',120,'#fff')}${TXT(540,1010,'FOR MORE WHAT IFs',66,'#ffe14d')}</g>`}
