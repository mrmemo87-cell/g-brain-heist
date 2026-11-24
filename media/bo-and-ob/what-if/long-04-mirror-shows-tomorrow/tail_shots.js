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
