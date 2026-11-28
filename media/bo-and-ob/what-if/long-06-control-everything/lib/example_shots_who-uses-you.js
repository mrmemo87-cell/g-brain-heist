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
