/* ===== shots: What If You Could Control Everything? ===== */
// screen overlays (OSD, captions) are drawn as a HUD outside the camera so zooms never crop them
let HUD='';const HUDW=f=>(...a)=>{HUD+=f(...a);return ''};
PAUSEFX=HUDW(PAUSEFX);REWFX=HUDW(REWFX);FFFX=HUDW(FFFX);OSDBIG=HUDW(OSDBIG);TAG=HUDW(TAG);
const GRAY=s=>`<g filter="url(#gray)">${s}</g>`;
// you, holding the remote in your right hand (on = lit button index)
const YREM=(o,on,t=0)=>{const q=Object.assign({x:960,y:905,face:0,aR:100,look:[0,0]},o);const [hx,hy]=HANDP(q.x,q.y,q.s||1,1,q.aR);return YOU(q)+HREM(hx,hy,q.s||1,t,on)};
const YL=(o={},on)=>{const q=Object.assign({x:480,y:1000,face:.4,smile:.2,brow:.3,open:1,aR:100,look:[.6,0]},o);const [hx,hy]=HANDP(q.x,q.y,1,1,q.aR);return YOU(q)+(on===false?'':HREM(hx,hy,1,0,on))};
const SIS=(o={})=>WOMAN('#6fb3d9','#f3efe6',Object.assign({x:1440,y:1000,face:-.4,bun:0,bow:1,smile:.2,brow:.4,open:1,aL:40,aR:160,look:[-.6,0]},o))+PHONEAT(1440,1000,1);
const FRI=(o={})=>MAN('#e88f5a','#3b4256',Object.assign({x:1440,y:1000,face:-.4,smile:.7,brow:-.1,open:1,aL:40,aR:160,look:[-.6,0]},o))+PHONEAT(1440,1000,1);
const PART=(o={})=>PARTNER(Object.assign({x:1440,y:1000,face:-.4,smile:.1,brow:.4,open:1,aL:40,look:[-.6,0]},o));
const TALK=(t,k=9)=>.3+.3*Math.abs(Math.sin(t*k));
function CLAP(x,y,s,txt,t,t0){if(t<t0)return '';const k=BO((t-t0)/.3),a=t-t0<.5?-25+50*es(t,t0+.2,t0+.4):0;return `<g transform="translate(${x},${y}) scale(${n(s*k)})"><rect x="-200" y="-120" width="400" height="260" rx="14" fill="#1d1b2a" stroke="${OUT}" stroke-width="8"/>${T(0,10,'SCENE: SMALL TALK',30,'#fff',{flat:1})}${T(0,90,txt,64,'#ffd54d',{flat:1})}<g transform="translate(-200,-120) rotate(${n(a)})"><rect x="0" y="-60" width="400" height="60" rx="8" fill="#fff" stroke="${OUT}" stroke-width="6"/>${[0,1,2,3,4].map(i=>`<polygon points="${20+i*80},-60 ${60+i*80},-60 ${30+i*80},0 ${-10+i*80},0" fill="#1d1b2a"/>`).join('')}</g></g>`}
function CROWN(x,y,s){return `<g transform="translate(${x},${y}) scale(${s})"><path d="M -70 30 L -80 -40 L -40 0 L 0 -60 L 40 0 L 80 -40 L 70 30 Z" fill="#ffd54d" stroke="${OUT}" stroke-width="7" stroke-linejoin="round"/><circle cx="0" cy="-60" r="10" fill="#ff5f8f"/></g>`}
function CARD4(x,y,icon,c,txt,t,t0){if(t<t0)return '';const k=BO((t-t0)/.35);return `<g transform="translate(${x},${y}) scale(${n(k)})"><rect x="-380" y="-100" width="760" height="200" rx="28" fill="#14102e" stroke="${c}" stroke-width="7"/><circle cx="-290" cy="0" r="62" fill="${c}"/><g transform="translate(-290,0) scale(1.5)">${ICON(icon,'#14102e')}</g>${T(60,16,txt,42,'#fff',{flat:1})}</g>`}
function SNAP(t,a,b){return t>a&&t<b?FFFX(t,'▶▶| SKIP'):''}
function TEASEC(t,u){let g=PLAIN('#2a1d4a','#05040f')+dust(t);const L=[['HOW FAST POWER','CHANGES YOU'],['WHO YOU’D','MUTE FIRST'],['THE ONE THING','IT CAN’T TOUCH']];
  L.forEach((l,i)=>{if(u>.1+i*.27){const k=BO((u-.1-i*.27)*6),c=[GOLD,'#ff5f8f','#8fe07a'][i];g+=`<g transform="translate(${480+i*480},540) scale(${n(k)})"><rect x="-210" y="-230" width="420" height="460" rx="40" fill="#14102e" stroke="${c}" stroke-width="8"/>${T(0,-150,l[0],36,'#fff',{flat:1})}${T(0,-95,l[1],40,c)}`;
    g+=i===0?CROWN(0,80,1.2):i===1?`<g transform="translate(0,70)"><circle r="80" fill="${c}"/><g transform="scale(2.6)">${ICON(2,'#14102e')}</g></g>`:`<g>${T(0,90,'?',150,c)}</g>`;g+=`</g>`}});
  return g+PEEK(1650,1,t,'orange')+PEEK(260,.9,t,'grey')}
function STREETR(t,u){let g=`<rect width="1920" height="1080" fill="url(#daysky)"/>${CITYMINI(0,260,1920,520)}<rect x="0" y="${FLOOR}" width="1920" height="175" fill="#8d8aa0"/>`;
  const P=[[220,'#7fa86b',0],[520,'#c27aa8',1],[820,'#3b4256',0],[1120,'#e88f5a',1],[1420,'#6fb3d9',0],[1720,'#d9a03a',1]];
  P.forEach(([x,c,w],i)=>{const k=es(u,.1+i*.08,.2+i*.08),q={x,y:905,s:.8,face:i%2?-.3:.3,smile:.8,brow:-.2,open:blink(t,i),aR:lerp(8,130,k),look:[0,-.3]};g+=(w?WOMAN:MAN)(c,'#ffd36b',q);const [hx,hy]=HANDP(x,905,.8,1,q.aR);g+=HREM(hx,hy,.8,t,k>.9?i%4:null)});
  return g+CAT(960,1010,.6,t,{look:[0,-.4]})}
function PHONELOG(t,id){return PLAIN('#2a2a3a','#06060b')+PH(960,560,.95,`<rect x="-230" y="-440" width="460" height="110" rx="30" fill="#ece7f6"/>${T(0,-370,'Today',38,OUT,{flat:1})}`+[['Sister','SKIPPED ▶▶|','#6fb3d9'],['Sam','SKIPPED ▶▶|','#e88f5a'],['❤ Partner','SKIPPED ▶▶|','#5b8bd9'],['Mum','MUTED','#c27aa8'],['Group chat','MUTED','#7fa86b']].map(([s,l,c],i)=>`<g opacity="${n(es(t,at(id,.05+i*.15),at(id,.1+i*.15)))}"><rect x="-210" y="${-300+i*130}" width="420" height="110" rx="16" fill="#fff" stroke="#e0dbea" stroke-width="2"/><circle cx="-150" cy="${-245+i*130}" r="30" fill="${c}"/>${T(-100,-250+i*130,s,30,OUT,{a:'start',flat:1})}${T(-100,-212+i*130,l,24,'#e8344a',{a:'start',flat:1})}</g>`).join(''))}
function NOISE(x,y,t,c='#ffd54d'){let g='';for(let k=0;k<3;k++){const u=((t*1.5+k/3)%1);g+=`<path d="M ${n(x+u*120)} ${n(y-u*60)} q 30 50 0 100" stroke="${c}" stroke-width="6" fill="none" opacity="${n(1-u)}"/>`}return g}
function SHOTS(){const S=[];const A=(s,d,c,f,fx)=>S.push([s,d,c||[960,540,1.02,960,540,1.08],f||0,fx||{}]);
  // COLD OPEN
  A(0,t=>{const u=U(t,'n01');return CDEFS+OFFC(t,{fall:es(u,.08,.3),shock:u>.25})+TAG(960,140,'30 PEOPLE WATCHING','#fff',t,at('n01',.7),D.total,46)+PEEK(140,.9,t,'orange')},[960,560,1.25,1000,620,1.05],.5,{shakeAt:at('n01',.25)});
  A(at('n02'),t=>{const u=U(t,'n02');return CDEFS+PLAIN('#2a1d4a','#05040f')+dust(t)+REMOTE(960,560,1.25,t,{labels:1,on:u>.7?Math.floor((u-.7)/.06)%4:null})+CAT(1460,1000,.9,t,{look:[-.8,-.4]})+TAG(960,90,'IN YOUR POCKET','#ffd54d',t,at('n02',.2),D.total,44)},[960,560,1.25,960,540,1.05],0,{snap:1});
  A(at('n03'),t=>{const u=U(t,'n03'),r=u>.08&&u<.45;return CDEFS+OFFC(t,{fall:u<.1?1:1-es(u,.1,.45),shock:u<.45,y:u>.5?{smile:.9,brow:-.2}:null})+(r?REWFX(t):'')+TAG(960,140,'NOBODY SAW A THING','#8fe07a',t,at('n03',.75),D.total,46)+PEEK(140,.9,t,'orange')},[960,580,1.1,960,560,1.15]);
  A(at('n04'),t=>{const u=U(t,'n04'),on=u<.28?null:u<.38?1:u<.48?0:u<.58?2:u<.68?3:null;return CDEFS+PLAIN('#2a1d4a','#05040f')+dust(t)+GLOW(960,540,420,on==null?'#7fd0ff':BTNC[on],.15)+REMOTE(960,560,1.15,t,{labels:1,on})+(on!=null?POP(BTNN[on],960,120,70,BTNC[on],t,at('n04',[.28,.38,.48,.58][[1,0,2,3].indexOf(on)])):'')+POP('TIME',360,400,80,'#7fd0ff',t,at('n04',.72),-6)+POP('NOISE',1560,400,80,'#ff5f8f',t,at('n04',.8),6)+POP('PEOPLE',1560,760,80,'#ffd54d',t,at('n04',.88),-4)+PEEK(330,1,t,'grey')},[960,540,1.08,960,540,1.0]);
  A(at('n05'),t=>CDEFS+TEASEC(t,U(t,'n05')),[960,540,1.06,960,540,1.0]);
  A(C.title,t=>{const u=(t-C.title)/1.8;return CDEFS+PLAIN('#2a1d4a','#05040f')+GLOW(960,300,400,'#7fd0ff',.15)+dust(t)+REMOTE(960,290,.62,t,{on:Math.floor(t*3)%4})+POP('WHAT IF YOU COULD',960,640,92,'#fff',u,.05)+POP('CONTROL EVERYTHING?',960,790,124,'#ffd54d',u,.15)+CAT(300,1060,1,t,{look:[.6,-.4]})+CAT(1620,1060,.9,t,{c:'grey',look:[-.6,-.4]})},[960,540,1.15,960,540,1.0]);
  // 7:00 AM
  const BEDHAND=HANDP(760,905,1,1,100);
  A(at('n06'),t=>{const u=U(t,'n06'),p=u>.3,y={aR:100,y:{aR:100,open:u>.55?.08:blink(t,.4),smile:u>.55?.6:-.3,brow:u>.55?-.1:.8}};const sc=BEDC(t,Object.assign({ring:!p},y))+HREM(BEDHAND[0],BEDHAND[1],1,t,p&&u<.45?1:null);
    return CDEFS+(p?GRAY(sc)+CAT(1120,770,.7,t,{sleep:1})+PAUSEFX(t)+(u>.55?[0,1,2].map(i=>{const q=((t*.4+i/3)%1);return T(860+q*60,420-q*90,'z',40+i*8,'#fff',{op:n(1-q),flat:1})}).join(''):''):sc+CAT(1120,770,.7,t,{sleep:1}))+TAG(960,160,'+3 HOURS','#ffd54d',t,at('n06',.8),D.total,50)},[1100,600,1.15,900,620,1.3],.3);
  A(at('n07'),t=>{const u=U(t,'n07');return CDEFS+BEDC(t,{ring:u>.35&&u<.75,aR:u>.5?170:100,y:{aR:u>.5?170:100,aL:u>.5?170:8,smile:.9,brow:-.2,open:u>.5?.1:1}})+(u<.5?HREM(BEDHAND[0],BEDHAND[1],1,t,null):'')+CAT(1120,770,.7,t,{look:[-.5,-.3]})+(u>.2&&u<.45?OSDBIG(t,'▶ PLAY','#8fe07a'):'')},[1000,600,1.1,1100,640,1.2],0,{snap:1});
  A(at('n08'),t=>CDEFS+BEDC(t,{aR:30,y:{smile:1.1,brow:-.4,face:.2,look:[.3,0]}})+CAT(1120,770,.7,t,{look:[-.8,-.3]})+POP('BEST MORNING EVER',960,180,84,'#ffd54d',t,at('n08',.5),-3),[860,560,1.35,860,540,1.5]);
  A(at('n09'),t=>{const u=U(t,'n09'),p=u<.72,P=PARTNER({x:560,y:905,face:.5,smile:.2,brow:.2,open:p?.5:.4,look:[.7,0],aL:160,mouth:.8});
    const Y=YOU({x:1120,y:905,face:-.5,smile:.8,brow:-.1,open:blink(t,.9),aL:u>.35?100:8,look:[-.7,.3]});
    let g=p?GRAY(kitchenSet(t,false)+P)+Y+TABLE:KITCHEN(t,{chars:P+Y});
    g+=`<ellipse cx="1000" cy="712" rx="70" ry="16" fill="#fff" stroke="${OUT}" stroke-width="4"/><ellipse cx="985" cy="706" rx="22" ry="12" fill="#fff"/><circle cx="985" cy="706" r="9" fill="#ffc84d"/><rect x="1005" y="700" width="40" height="10" rx="4" fill="#c0573a"/>`;
    if(u>.35)g+=`<g transform="translate(1000,600) rotate(-8)"><rect x="-60" y="-40" width="120" height="80" fill="#3a7bd5" stroke="${OUT}" stroke-width="4"/><line x1="0" y1="-40" x2="0" y2="40" stroke="${OUT}" stroke-width="3"/></g>`;
    g+=CAT(lerp(1500,1750,es(u,0,.6)),905,.75,t,{look:[-.8,-.2]});
    return CDEFS+g+(p?PAUSEFX(t):'')+TAG(960,160,u<.35?'FULL BREAKFAST':'A WHOLE CHAPTER','#fff',t,at('n09',u<.35?.08:.35),at('n09',u<.35?.34:.7),40)+(u>.72&&u<.9?OSDBIG(t,'▶ PLAY','#8fe07a'):'')},[960,560,1.1,1000,560,1.18]);
  // 8:30 AM — the train
  A(at('n10'),t=>CDEFS+TRAINC(t,{loud:1})+CAT(1200,905,.5,t,{look:[-.8,-.2]})+TAG(520,140,'SPEAKERPHONE 📢','#ff5f5f',t,at('n10',.25),D.total,40),[760,540,1.15,600,520,1.3],.3);
  A(at('s1'),t=>CDEFS+TRAINC(t,{loud:1,s:{mouth:one('s1')(t)}})+CAT(1200,905,.5,t,{look:[-.8,-.2]})+BUB(620,170,'And then she took the dog. The dog, KEVIN.',t,at('s1')+.05,{size:34}),[620,500,1.35,620,490,1.45],0,{snap:1});
  A(at('n11'),t=>CDEFS+TRAINC(t,{loud:1,rem:2,muted:at('n11',.08)})+CAT(1200,905,.5,t,{look:[-.8,-.2]}),[800,520,1.15,640,500,1.3]);
  A(at('n12'),t=>CDEFS+TRAINC(t,{loud:1,rem:2,muted:-1,smiles:t>at('n12',.15),smug:t>at('n12',.45)})+CAT(1200,905,.5,t,{look:[.8,-.3]})+TAG(1420,200,'POWERFUL','#ffd54d',t,at('n12',.75),D.total,52),[960,540,1.0,1250,540,1.3]);
  A(at('n13'),t=>{const u=U(t,'n13');if(u<.55)return CDEFS+TRAINC(t,{loud:1,rem:2,muted:-1,crier:1,y:{smile:-.1,brow:.6,look:[.8,0]}});
    const p=1+.08*Math.sin(t*6);return CDEFS+PLAIN('#2a2a3a','#06060b')+REMOTE(960,540,1.2,t,{})+`<circle cx="${n(960-44*1.2)}" cy="${n(540+30*1.2)}" r="${n(72*p)}" fill="none" stroke="#ff5f8f" stroke-width="6" stroke-dasharray="14 10"/>`+TAG(960,120,'…YOU STOP.','#fff',t,at('n13',.85),D.total,52)+PEEK(1600,1,t,'grey')},[1500,520,1.25,1650,520,1.35]);
  // 10:00 AM — work, rewind everything
  A(at('n14'),t=>{const u=U(t,'n14');let g;
    if(u<.33)g=OFFC(t,{glazed:1,y:{mouth:u<.25?TALK(t):0,smile:.8,aR:120}})+BUB(960,220,'So a spreadsheet walks into a bar…',t,at('n14',.03),{size:34,t1:at('n14',.28)})+TAG(960,120,'THE JOKE: FLOPPED','#ff5f5f',t,at('n14',.2),at('n14',.33),40);
    else if(u<.6)g=PLAIN('#2a2a3a','#06060b')+CARD(960,470,['TO: THE WRONG SARAH','“ugh, Sarah AGAIN”'],RED,t,at('n14',.35))+PEEK(300,1,t,'orange');
    else g=OFFC(t,{shock:1,y:{smile:-.4,brow:1,aR:40}})+BUB(960,220,'Thanks, Mum!',t,at('n14',.62),{size:40});
    const rw=(u>.27&&u<.33)||(u>.53&&u<.6)||u>.8;return CDEFS+g+(rw?REWFX(t):'')+(u>.8?TAG(1400,140,'×3','#7fd0ff',t,at('n14',.8),D.total,60):'')},[960,540,1.05,960,540,1.12]);
  A(at('n15'),t=>{const u=U(t,'n15');return CDEFS+(u<.55?OFFC(t,{admire:at('n15',.1),y:{shades:1,smile:1,brow:-.4,aR:40}})+TAG(960,140,'SMOOTHEST PERSON ALIVE','#ff9db5',t,at('n15',.2),D.total,46):PLAIN('#2a1d4a','#05040f')+dust(t)+CLAP(960,560,1.3,'TAKE 27',t,at('n15',.55))+PEEK(1600,1,t,'black'))},[960,560,1.1,960,540,1.2]);
  A(at('n16'),t=>CDEFS+TEXT2(t,'SAME MORNING. FOUR TIMES.','NEVER LOOKED SO COOL.',at('n16',.1),at('n16',.6)).replace('font-size="96"','font-size="78"').replace('font-size="110"','font-size="88"')+'',[960,540,1.06,960,540,1.0]);
  // 11:00 AM — Greg
  A(at('q1'),t=>CDEFS+MEETC(t,{slide:1,gm:one('q1')(t)})+PEEK(150,.8,t,'grey')+BUB(1360,220,'Slide one of eighty-four…',t,at('q1')+.3,{size:34}),[960,520,1.1,960,520,1.2],.3);
  A(at('n17'),t=>{const u=U(t,'n17');return CDEFS+MEETC(t,{slide:u>.88?Math.min(84,1+Math.floor((u-.88)*700)):1,gm:u>.88?TALK(t,30):TALK(t,4)*.6})+PEEK(150,.8,t,'grey')+TAG(500,690,'40 MINUTES','#ff5f5f',t,at('n17',.3),D.total,46)+SNAP(t,at('n17',.86),D.total)},[960,540,1.0,960,540,1.06]);
  A(at('n18'),t=>{const u=U(t,'n18');return CDEFS+MEETC(t,{slide:84,gm:u>.4&&u<.75?TALK(t,5):0,faces:u>.4})+(u<.3?FFFX(t,'▶▶ ×32'):'')+BUB(1360,220,'And that concludes my forty minutes.',t,at('n18',.4),{size:32})+PEEK(150,.8,t,'grey')},[960,540,1.0,960,600,1.12]);
  A(at('n19'),t=>{const u=U(t,'n19');return CDEFS+PLAIN('#4a3a2a','#140f0a')+GLOW(960,500,500,GOLD,.25+.1*Math.sin(t*3))+dust(t,GOLD)+YREM({aR:lerp(100,165,es(u,.2,.4)),smile:1,brow:-.4,face:0,look:[0,-.2]},3,t)+CROWN(960,440,es(u,.5,.65))+CAT(1480,905,.85,t,{look:[-.8,-.2]})+TAG(960,140,'A LITTLE BIT LIKE A GOD','#ffd54d',t,at('n19',.55),D.total,52)},[960,560,1.2,960,520,1.05]);
  A(at('n20'),t=>CDEFS+TEXT2(t,'AND THAT’S WHEN','IT STARTS TO CHANGE YOU.',at('n20',.05),at('n20',.4),'#3a1020','#0b0306',RED).replace('font-size="110"','font-size="92"'),[960,540,1.2,960,540,1.0],0,{shakeAt:at('n20',.4)});
  // 1:00 PM — skip, skip, skip
  A(at('n21'),t=>{const u=U(t,'n21');return CDEFS+SPLIT2(t,{L:YL({smile:.1,brow:.4},u>.8?3:null),R:SIS({mouth:u<.8?TALK(t):0,brow:.9,smile:-.4}),bgL:'#3a4a5a',bgR:'#2a3a5a'})+TAG(1440,160,'YOUR SISTER: “MY WEEK…”','#6fb3d9',t,at('n21',.15),D.total,36)+SNAP(t,at('n21',.8),D.total)},[960,560,1.05,960,560,1.1]);
  A(at('n22'),t=>{const u=U(t,'n22');return CDEFS+SPLIT2(t,{L:YL({smile:0,brow:.5,open:.5},u>.8?3:null),R:FRI({mouth:u<.8?TALK(t):0})+CAT(1760,1000,.6,t,{c:'black',look:[-.6,-.3]}),bgL:'#3a4a5a',bgR:'#4a3a2a'})+BUB(1440,200,'Did I ever tell you about the time…',t,at('n22',.1),{size:30,t1:at('n22',.8)})+SNAP(t,at('n22',.8),D.total)},[960,560,1.05,960,560,1.1],0,{whip:1});
  A(at('n23'),t=>{const u=U(t,'n23');return CDEFS+SPLIT2(t,{L:YL({smile:-.3,brow:1,face:.3},u>.88?3:null),R:PART({mouth:u>.2&&u<.4?TALK(t):0,smile:-.2,brow:.8}),bgL:'#3a4a5a',bgR:'#5a3a4a'})+BUB(1440,200,'We need to talk.',t,at('n23',.2),{size:40,t1:at('n23',.88)})+SNAP(t,at('n23',.88),D.total)},[960,560,1.05,560,640,1.45]);
  A(at('n24'),t=>CDEFS+TEXT2(t,'THE FIRST THING THEY GET RID OF…','…ISN’T DANGER. IT’S DISCOMFORT.',at('n24',.3),at('n24',.7),'#3a1020','#0b0306',RED).replace('font-size="96"','font-size="66"').replace('font-size="110"','font-size="72"'),[960,540,1.06,960,540,1.0]);
  A(at('n25'),t=>CDEFS+PLAIN('#2a1d4a','#05040f')+dust(t)+CARD4(520,280,1,BTNC[1],'PAUSE THE ARGUMENT',t,at('n25',.05))+CARD4(1400,280,3,BTNC[3],'SKIP THE APOLOGY',t,at('n25',.2))+CARD4(520,560,2,BTNC[2],'MUTE THE CRITIC',t,at('n25',.36))+CARD4(1400,560,0,BTNC[0],'REWIND TILL YOU WIN',t,at('n25',.5))+POP('IT’S EVERYTHING WE ALREADY TRY TO DO.',960,850,60,'#ffd54d',t,at('n25',.75))+PEEK(960,.9,t,'orange'),[960,540,1.0,960,540,1.06]);
  // 3:00 PM — everyone has one
  A(at('n26'),t=>CDEFS+STREETR(t,U(t,'n26'))+TAG(960,140,'EVERYONE WOKE UP WITH ONE','#ffd54d',t,at('n26',.6),D.total,46),[960,560,1.0,960,560,1.08],.3);
  A(at('n27'),t=>CDEFS+FAMC(t,U(t,'n27')),[960,540,1.0,960,560,1.08],0,{whip:1});
  A(at('n28'),t=>CDEFS+FOOTY(t,U(t,'n28'))+PEEK(160,.8,t,'black'),[960,540,1.0,960,540,1.06],0,{whip:1});
  A(at('n29'),t=>CDEFS+POLIT(t,U(t,'n29'))+PEEK(1780,.7,t,'grey'),[960,560,1.0,960,560,1.08],0,{whip:1});
  A(at('n30'),t=>CDEFS+MOTOR(t,U(t,'n30'))+CAT(1500,690,.55,t,{look:[-.8,.2]})+PAUSEFX(t)+TAG(960,180,'🥪 SANDWICH BREAK','#ffd54d',t,at('n30',.5),D.total,44),[960,600,1.0,960,600,1.12],0,{whip:1});
  A(at('n31'),t=>{const u=U(t,'n31');return CDEFS+CATWALK(t,u,{btn:u>.72?2:u>.42?1:null,meow:u>.72?.72:0})+(u>.42&&u<.72?PAUSEFX(t):'')+(u>.72?MUTEICON(1500,300,.9,t,at('n31',.72)):'')},[960,560,1.05,900,560,1.12],0,{snap:1});
  A(at('n32'),t=>{const u=U(t,'n32');return CDEFS+PLAIN('#4a3a2a','#140f0a')+GLOW(960,600,420,GOLD,.25)+dust(t,GOLD)+CAT(960,1000,2,t,{look:[0,0]})+CROWN(960,470,es(u,.4,.55)*1.1)+POP('CATS HAVE ALWAYS',960,150,80,'#fff',t,at('n32',.05))+POP('BEEN IN CONTROL.',960,250,90,GOLD,t,at('n32',.35))},[960,560,1.12,960,520,1.0]);
  A(at('n33'),t=>{const u=U(t,'n33');return CDEFS+SOFAU(t,{cat:0,aR:100,y:{smile:-.2,brow:.8,look:[.6,.2]}})+REMOTE(1240,792,.32,t,{rot:-90})+CAT(1240,800,.6,t,{look:[-.6,-.2]})+(u>.3?`<g transform="translate(${n(HANDP(960,900,1,1,100)[0]+6)},${n(HANDP(960,900,1,1,100)[1]-30)})">${T(0,-90,'NO SIGNAL',30,'#ff5f5f')}</g>`:'')+HREM(...HANDP(960,900,1,1,100),1,t,null)+TAG(960,150,'COINCIDENCE?','#fff',t,at('n33',.55),D.total,48)+TAG(960,240,'ABSOLUTELY NOT.','#ffd54d',t,at('n33',.8),D.total,54)},[1100,620,1.2,1180,640,1.4]);
  // 7:00 PM — home
  A(at('n34'),t=>CDEFS+MUTEHOME(t,U(t,'n34')),[960,560,1.05,960,540,1.12],.3);
  A(at('n35'),t=>CDEFS+SOFAU(t,{night:1,aR:8,y:{smile:-.3,brow:.6,look:[0,.3]}})+TAG(960,160,'SKIPPED TODAY: 6 HOURS','#9aa0b5',t,at('n35',.2),D.total,44),[960,600,1.05,960,620,1.25]);
  A(at('n36'),t=>CDEFS+TEXT2(t,'THE BORING BITS','WERE WHERE THE PEOPLE WERE.',at('n36',.1),at('n36',.45),'#2a2a3a','#06060b','#ff9db5').replace('font-size="110"','font-size="84"'),[960,540,1.06,960,540,1.0]);
  A(at('n37'),t=>CDEFS+PHONELOG(t,'n37'),[960,520,1.1,960,600,1.25]);
  A(at('n38'),t=>CDEFS+PLAIN('#2a2a3a','#06060b')+PHONE(960,560,.95,t,{name:'❤ Partner',avatar:'#5b8bd9',msgs:[{at:at('n38',.3),text:'Still need to talk. Whenever you’re ready.'}]})+TAG(960,90,'3 HOURS AGO','#ff9db5',t,at('n38',.2),D.total,44)+PEEK(1600,1,t,'orange'),[960,520,1.15,960,480,1.3]);
  A(at('n39'),t=>CDEFS+TEXT2(t,'THREE HOURS.','SOMEONE WAS WAITING FOR YOU.',at('n39',.05),at('n39',.45),'#2a2a3a','#06060b','#ff9db5').replace('font-size="110"','font-size="84"'),[960,540,1.2,960,540,1.0]);
  // the rewind
  A(at('n40'),t=>{const u=U(t,'n40');let g=PLAIN('#1d2a4a','#05040f')+REMOTE(960,560,1,t,{on:0});for(let i=0;i<4;i++){const a=-t*(4+i)*2;g+=`<g transform="translate(${[360,1560,360,1560][i]},${[300,300,800,800][i]})"><circle r="110" fill="#14102e" stroke="#7fd0ff" stroke-width="8"/><line x1="0" y1="0" x2="${n(Math.sin(a)*70)}" y2="${n(-Math.cos(a)*70)}" stroke="#fff" stroke-width="10" stroke-linecap="round"/><line x1="0" y1="0" x2="${n(Math.sin(a/12)*45)}" y2="${n(-Math.cos(a/12)*45)}" stroke="#7fd0ff" stroke-width="12" stroke-linecap="round"/></g>`}
    return CDEFS+g+REWFX(t)+PEEK(960,.8,t,'grey')+POP('“WE NEED TO TALK.”',960,180,70,'#ff9db5',t,at('n40',.7))},[960,540,1.0,960,540,1.15],0,{shake:4});
  A(at('p1'),t=>CDEFS+SPLIT2(t,{L:YL({smile:-.1,brow:.6},null),R:PART({mouth:one('p1')(t),smile:-.2,brow:.8}),bgL:'#3a4a5a',bgR:'#5a3a4a'})+BUB(1440,200,'Hey… we need to talk.',t,at('p1')+.1,{size:40}),[1300,560,1.3,1350,560,1.35],0,{snap:1});
  A(at('n41'),t=>{const u=U(t,'n41');return CDEFS+SPLIT2(t,{L:YL({aR:lerp(100,30,es(u,.2,.5)),smile:0,brow:.5},u<.5?null:false),R:PART({smile:-.2,brow:.8}),bgL:'#3a4a5a',bgR:'#5a3a4a'})+(u>.5?REMOTE(250,1000,.25,t,{rot:-80}):'')+CAT(140,1000,.55,t,{look:[.8,-.3]})+POP('NO SKIP.',480,190,80,'#8fe07a',t,at('n41',.6))},[480,600,1.4,420,620,1.5]);
  A(at('p2'),t=>CDEFS+SPLIT2(t,{L:YL({aR:30,smile:-.2,brow:.7},false),R:PART({mouth:one('p2')(t),smile:-.5,brow:1,look:[-.6,.3]}),bgL:'#3a4a5a',bgR:'#5a3a4a'})+BUB(1440,200,'I’ve been feeling really far away from you lately.',t,at('p2')+.1,{size:30}),[1440,560,1.2,1440,560,1.3]);
  A(at('n42'),t=>CDEFS+SPLIT2(t,{L:YL({aR:30,smile:-.4,brow:1,look:[.6,.2]},false),R:PART({smile:-.4,brow:1,mouth:TALK(t,6)*.7}),bgL:'#3a4a5a',bgR:'#5a3a4a'})+TAG(1440,170,'MORE FUN FOR YOU…','#ff9db5',t,at('n42',.45),D.total,38)+TAG(1440,250,'…LESS OF YOU HERE','#fff',t,at('n42',.7),D.total,38),[960,560,1.05,960,560,1.12]);
  A(at('n43'),t=>{const u=U(t,'n43');let g=PLAIN('#3a2030','#0b0306')+YOU({x:960,y:1060,s:1.3,face:0,smile:-.5,brow:1.1,open:1.1,look:[.3,.2]})+BLUSH(960,1060,1.3,es(u,.3,.6));
    for(let i=0;i<4;i++){const a=t*.8+i*PI/2,r=480;g+=`<g transform="translate(${n(960+Math.cos(a)*r)},${n(520+Math.sin(a)*r*.55)}) scale(${n(.8+.15*Math.sin(t*5+i))})"><circle r="56" fill="${BTNC[i]}" opacity=".9"/><g transform="scale(1.4)">${ICON(i,'#14102e')}</g></g>`}
    return CDEFS+g+TAG(960,120,'AWKWARD. SLOW.','#ff9db5',t,at('n43',.1),D.total,48)+PEEK(1700,.9,t,'orange')},[960,560,1.0,960,500,1.15]);
  A(at('n44'),t=>CDEFS+PLAIN('#2a2a3a','#06060b')+REMOTE(960,820,.45,t,{rot:-90})+POP('YOU DON’T.',960,430,170,'#ffd54d',t,at('n44',.15))+PEEK(1650,1,t,'grey'),[960,540,1.25,960,540,1.0],0,{shakeAt:at('n44',.2)});
  A(at('n45'),t=>{const u=U(t,'n45');return CDEFS+SPLIT2(t,{L:YL({aR:30,smile:.1,brow:.6,mouth:(u>.1&&u<.3)||(u>.35&&u<.5)?TALK(t,7):0},false),R:PART({smile:lerp(-.4,.2,u),brow:lerp(1,.4,u),mouth:u>.55?TALK(t,6)*.7:0}),bgL:'#3a4a5a',bgR:'#5a3a4a'})+BUB(480,200,'I’m sorry.',t,at('n45',.1),{size:40,t1:at('n45',.33)})+BUB(480,200,'How long have you felt like this?',t,at('n45',.35),{size:30,t1:at('n45',.55)})+TAG(960,120,'LISTENING… ALL OF IT','#8fe07a',t,at('n45',.6),D.total,40)},[960,560,1.05,960,560,1.1]);
  A(at('n46'),t=>CDEFS+SPLIT2(t,{L:YL({aR:30,smile:.6,brow:-.1},false),R:PART({smile:.6,brow:0}),bgL:'#5a4a3a',bgR:'#6a4a3a'})+CAT(960,1000,.6,t,{sleep:1})+TAG(960,150,'LONGEST CONVERSATION ALL YEAR','#fff',t,at('n46',.1),D.total,40)+TAG(960,240,'AND THE BEST','#ffd54d',t,at('n46',.6),D.total,52),[960,600,1.15,960,560,1.0]);
  A(at('n47'),t=>CDEFS+SPLIT2(t,{L:YL({aR:30,smile:1.1,brow:-.3,open:.3,mouth:t>at('n47',.25)?TALK(t,12)*.8:0,bob:t>at('n47',.25)?-Math.abs(Math.sin(t*9))*10:0},false),R:PART({smile:1.1,brow:-.3,open:.3,mouth:t>at('n47',.25)?TALK(t,11)*.8:0,bob:t>at('n47',.25)?-Math.abs(Math.sin(t*9+1))*10:0}),bgL:'#5a4a3a',bgR:'#6a4a3a'})+CAT(960,1000,.6,t,{look:[0,-.4]})+POP('A REAL LAUGH',960,170,70,'#ffd54d',t,at('n47',.3))+TAG(960,280,'(NO REWIND REQUIRED)','#fff',t,at('n47',.65),D.total,36),[960,560,1.05,960,560,1.12]);
  // 11:00 PM — the drawer
  A(at('n48'),t=>CDEFS+DRAWER(t,U(t,'n48'))+PEEK(1500,1,t,'orange'),[960,600,1.1,960,600,1.2],.3);
  A(at('n49'),t=>{const u=U(t,'n49');return CDEFS+SPLIT2(t,{L:YL({aR:160,smile:.8,brow:-.1},false)+PHONEAT(480,1000,1),R:SIS({mouth:TALK(t),smile:.6,brow:.2}),bgL:'#3a4a5a',bgR:'#2a3a5a'})+TAG(1440,160,'HER WEEK','#fff',t,at('n49',.15),at('n49',.45),40)+TAG(1440,160,'THE NEIGHBOUR’S HEDGE 🌳','#8fe07a',t,at('n49',.55),D.total,36)+CAT(140,1000,.55,t,{look:[.8,-.3]})},[960,560,1.05,960,560,1.1]);
  A(at('n50'),t=>{const u=U(t,'n50'),l=u>.65;return CDEFS+SPLIT2(t,{L:YL({aR:160,smile:l?1.1:.6,brow:-.2,mouth:l?TALK(t,12)*.8:0,bob:l?-Math.abs(Math.sin(t*9))*10:0},false)+PHONEAT(480,1000,1),R:FRI({mouth:l?TALK(t,11)*.8:TALK(t),smile:1,bob:l?-Math.abs(Math.sin(t*9+1))*10:0})+CAT(1760,1000,.6,t,{c:'black',look:[-.6,-.3]}),bgL:'#3a4a5a',bgR:'#4a3a2a'})+BUB(1440,200,'…so I said, “that’s not a duck!”',t,at('n50',.1),{size:30,t1:at('n50',.65)})+POP('HA HA HA',960,200,70,'#ffd54d',t,at('n50',.67))},[960,560,1.05,960,560,1.1],0,{whip:1});
  A(at('n51'),t=>CDEFS+TEXT2(t,'YOU CAN’T SKIP TO THE GOOD PART.','THE AWKWARD BITS ARE THE GOOD PART.',at('n51',.3),at('n51',.7),'#4a3a2a','#140f0a',GOLD).replace('font-size="96"','font-size="66"').replace('font-size="110"','font-size="70"'),[960,540,1.06,960,540,1.0]);
  A(at('n52'),t=>CDEFS+VOLCAT(t,U(t,'n52')),[960,560,1.0,960,500,1.12]);
  A(at('n53'),t=>{const u=U(t,'n53');return CDEFS+SOFAU(t,{y:{x:820,smile:1,brow:-.3,open:.4,aR:8},cat:{look:[-.4,-.3]}})+PART({x:1560,y:905,face:-.4,smile:1,brow:-.2,open:.5,mouth:TALK(t,8)*.6,look:[-.7,0]})+NOISE(1680,420,t)+NOISE(1060,560,t,'#ff9db5')+TAG(960,140,'LOUD.','#fff',t,at('n53',.2),D.total,48)+TAG(960,230,'AND YOU DON’T MIND.','#ffd54d',t,at('n53',.55),D.total,48)},[960,560,1.1,960,580,1.0]);
  A(at('n54'),t=>CDEFS+TEXT2(t,'THE REMOTE STILL WORKS.','YOU JUST STOPPED NEEDING IT.',at('n54',.05),at('n54',.45),'#4a3a2a','#140f0a',GOLD).replace('font-size="96"','font-size="74"').replace('font-size="110"','font-size="80"')+REMOTE(960,900,.32,t,{rot:-90}),[960,540,1.06,960,540,1.0]);
  // outro
  A(at('n55'),t=>CDEFS+PLAIN('#2a1d4a','#05040f')+dust(t)+REMOTE(960,620,1,t,{labels:1,on:Math.floor(t*1.5)%4})+POP('WHICH BUTTON WOULD YOU',960,130,64,'#fff',t,at('n55',.05))+POP('PRESS FIRST?',960,220,80,'#ffd54d',t,at('n55',.3))+CAT(300,1060,.9,t,{look:[.6,-.4]})+CAT(1620,1060,.9,t,{c:'grey',look:[-.6,-.4]}),[960,540,1.06,960,540,1.0]);
  A(at('n56'),t=>{const u=U(t,'n56');return CDEFS+PLAIN('#4a3a2a','#140f0a')+dust(t,GOLD)+(u<.7?MUTEICON(960,420,2,t,at('n56',.05)):`<g transform="translate(960,420) scale(2)"><circle r="54" fill="#14102e" stroke="#8fe07a" stroke-width="6"/><g transform="scale(1.6)"><path d="M -20 -7 L -10 -7 L 2 -18 L 2 18 L -10 7 L -20 7 Z" fill="#fff"/><path d="M 9 -8 q 8 8 0 16 M 14 -14 q 14 14 0 28" stroke="#8fe07a" stroke-width="4" fill="none" stroke-linecap="round"/></g></g>`)+POP('WHO WOULD YOU MUTE?',960,700,74,'#fff',t,at('n56',.05))+POP('TELL ME IN THE COMMENTS',960,810,56,GOLD,t,at('n56',.35))+POP('…THEN MAYBE UNMUTE THEM.',960,920,56,'#8fe07a',t,at('n56',.7))+CAT(220,560,.9,t,{look:[.6,-.2]})+CAT(1700,560,.85,t,{c:'grey',look:[-.6,-.2]})},[960,540,1.06,960,540,1.0]);
  return S}
let SHOTL=null;
function camT(c,u,t,s,fx){const k=fx.snap?1-Math.pow(1-cl((t-s)/.3),3):E(u),z=lerp(c[2],c[5],k);let cx=lerp(c[0],c[3],k),cy=lerp(c[1],c[4],k);
  let sh=typeof fx.shake==='function'?fx.shake(t):(fx.shake||0);if(fx.shakeAt&&t>fx.shakeAt&&t<fx.shakeAt+.4)sh=8*(1-(t-fx.shakeAt)/.4);
  if(fx.snap&&t-s<.4)sh=Math.max(sh,3*(1-(t-s)/.4));
  cx=cl(cx,960/z,1920-960/z);cy=cl(cy,540/z,1080-540/z);
  const wx=fx.whip&&t-s<.25?(1-E((t-s)/.25))*700:0;
  return `translate(${n(960+Math.sin(t*67)*sh+wx)},${n(540+Math.cos(t*53)*sh)}) scale(${z.toFixed(4)}) translate(${n(-cx)},${n(-cy)})`}
const MBLUR=`<defs><filter id="mblur" x="-20%" y="-5%" width="140%" height="110%"><feGaussianBlur stdDeviation="38 0"/></filter><filter id="gray"><feColorMatrix type="saturate" values="0.1"/></filter></defs>`;
const STAMPS=()=>[[at('n06'),'7:00 AM'],[at('n10'),'8:30 AM'],[at('n14'),'10:00 AM'],[at('q1'),'11:00 AM'],[at('n21'),'1:00 PM'],[at('n26'),'3:00 PM'],[at('n34'),'7:00 PM'],[at('p1'),'1:00 PM · AGAIN'],[at('n48'),'11:00 PM']];
window.renderAt=function(t){
  if(!SHOTL)SHOTL=SHOTS().sort((a,b)=>a[0]-b[0]);
  let i=0;while(i<SHOTL.length-1&&t>=SHOTL[i+1][0])i++;
  const [s,draw,cam,fade,fx]=SHOTL[i],e=i<SHOTL.length-1?SHOTL[i+1][0]:D.total,u=cl((t-s)/Math.max(.1,e-s));
  const blur=fx.whip&&t-s<.2?' filter="url(#mblur)"':'';
  HUD='';let g=DEFS+MBLUR+`<g transform="${camT(cam,u,t,s,fx)}"${blur}>${draw(t,u)}</g>`+HUD;
  if(fade)g+=`<rect width="1920" height="1080" fill="#05040f" opacity="${n(1-es(t,s,s+fade))}"/>`;
  g+=`<rect width="1920" height="1080" fill="url(#vig)"/>`;
  g+=stamp(t,STAMPS());
  const ea=es(t,C.end,C.end+.5);if(ea>0)g+=`<g opacity="${n(ea)}"><rect width="1920" height="1080" fill="#08071a"/>${T(960,500,'FOLLOW',130,'#fff')}${T(960,640,'FOR MORE WHAT IFs',76,'#ffe14d')}</g>`;
  g+=`<rect width="1920" height="1080" fill="#000" opacity="${n(es(t,D.total-.7,D.total-.1))}"/>`;
  document.getElementById('s').innerHTML=g;
};
window.DATA={fps:D.fps,total:D.total};
window.ready=document.fonts.load('600 40px Fredoka').then(()=>{renderAt(+(new URLSearchParams(location.search).get('t')||0));return true});
