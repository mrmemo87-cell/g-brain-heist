/* ================= Episode 6: What If She Came Back and Forgot? ================= */
const boTalk=tk(ids('b',4)),obTalk=tk(ids('o',3)),xTalk=tk(ids('x',7));
const tears=(x,y,s,a)=>a>0?`<g opacity="${n(a)}"><ellipse cx="${n(x-40*s)}" cy="${n(y)}" rx="${n(7*s)}" ry="${n(11*s)}" fill="#9be7ff" stroke="#fff" stroke-width="2"/><ellipse cx="${n(x+40*s)}" cy="${n(y+6*s)}" rx="${n(7*s)}" ry="${n(11*s)}" fill="#9be7ff" stroke="#fff" stroke-width="2"/></g>`:'';

/* ---------- 1: the lesson ---------- */
function kitchen6(t){
  const pour=pulse(t,V.n03.s+1.5,V.n03.s+5.5,.5);
  const mo={x:560,y:FLOOR,face:.9,aL:8+pour*(70+8*Math.sin(t*4)),aR:8+pulse(t,V.x2.s,V.x2.e,.4)*40,smile:lerp(.2,.9,es(t,V.n03.s,V.n03.s+.7)),brow:.1,open:blink(t,.9),mouth:xTalk(t),look:[.85,0],tilt:pulse(t,V.x4.s,V.x4.e+.5,.3)*4};
  const bo={x:1010,y:FLOOR,face:-.8,aL:8,aR:8,smile:lerp(-.3,.05,es(t,V.b3.s,V.b3.e)),brow:lerp(.6,.2,es(t,V.n04.s,V.n04.e)),open:blink(t,.4),mouth:boTalk(t),look:[-.9,pulse(t,V.n04.s+1,V.n04.e,.5)*.5]};
  return kitchenSet(t,false)+impostor(mo)+char(bo)+TABLE;
}
/* ---------- 2: the plan, written on glass ---------- */
const W6=[['w1',['CAN YOU REACH','THE ROUND MIRROR'],52,'bo'],['w2',['I KNOW','THE WAY'],84,'mo'],['w3',['TONIGHT'],104,'mo']];
function planScene(t){
  let over='',wm=0,wb=0;const fog=es(t,C.plan+.6,C.plan+1.6);
  W6.forEach(([c,lines,size,who],i)=>{const a=C[c],b=i<2?C[W6[i+1][0]]-.5:C.night+5;if(t>=a&&t<b){const cl2=i<2?1-pulse(t,b-.6,b+.2,.3):1;over+=`<g opacity="${n(cl2)}">`+fogText(lines,size,610,295,es(t,a,a+2.2),lerp(-1,1,es(t,a+2.2,a+2.7)))+`</g>`}const p=pulse(t,a-.2,a+2.3,.3);if(who==='bo')wb+=p;else wm+=p});
  over=`<rect x="360" y="170" width="500" height="250" rx="60" fill="#fff" opacity="${n(fog*.55)}"/>`+over;
  const ya=girl({x:720,y:FLOOR,face:.5,aL:8,aR:8,smile:lerp(-.2,.5,es(t,C.w2,C.w2+2)),brow:.6,open:blink(t,2.1),look:[.8,-.3]});
  const ent=es(t,C.plan+.1,C.plan+1.5);
  const bo={x:lerp(1500,1010,ent),y:FLOOR,face:-1,aL:8+cl(wb)*(118+10*Math.sin(t*7)),aR:8,smile:lerp(-.3,.2,es(t,C.w2,C.w3)),brow:.6,open:blink(t,.4),look:[-.8,-.3]};
  if(ent>0&&ent<1){bo.walk=t*6;bo.bob=-Math.abs(Math.sin(t*6))*5}
  return room(t,{dop:0,inside:kneeling(t,1,cl(wm))+ya,overGlass:over,chars:char(bo)});
}
/* ---------- 3: one full minute ---------- */
function nightTable(t,teaser){
  const go=C.go,done=C.done,el=t-go,after=t>=done;
  const pm=el*2.6,take=es(t,go,go+9),tw=pulse(t,V.n14.s,V.n14.s+.5,.12);
  const covered=1-es(t,C.pull,C.pull+.45);
  // who is in the mirror
  const swapIn=es(t,done+2.2,done+3.4);
  const strokeM=135+18*Math.sin(pm),strokeA=135+18*Math.sin((t-done)*2.4);
  const moIn=mother({x:960,y:742,s:.62,face:.7,aL:8,aR:t>=V.n13.s+2.6?strokeM:lerp(8,150,es(t,V.n13.s+1.6,V.n13.s+2.6)),brush:1,smile:-.5,brow:-.7,open:1.05,look:[.8,0]})+tears(960+12,742-362*.62+14,.62,es(t,go+28,go+34));
  const imIn=impostor({x:960,y:742,s:.62,face:.7,aL:8,aR:strokeA,brush:1,smile:.5,brow:.3,open:blink(t,.9),look:[.8,0]});
  let inMirror=after?`<g opacity="${n(1-swapIn)}"></g><g opacity="${n(swapIn)}">${imIn}</g>`:(covered<1?moIn:'');
  let g=dressSet(t,{inMirror,shine:.14});
  if(covered>0)g+=`<g transform="translate(0,${n((1-covered)*520)})" opacity="${n(cl(covered*2))}"><path d="M 760 250 q 200 -70 400 0 v 380 q -50 26 -100 0 q -50 -26 -100 0 q -50 26 -100 0 q -50 -26 -100 0 Z" fill="#efe6d0" stroke="${OUT}" stroke-width="5" stroke-linejoin="round"/><path d="M 880 232 v 400 M 1040 232 v 400" stroke="#d6c9a8" stroke-width="5" fill="none"/></g>`;
  g+=`<rect width="1920" height="1080" fill="${NIGHT}" opacity=".3"/>`;
  // the one at the table
  const habit=135+18*Math.sin(t*3.2),frozen=es(t,C.pull,C.pull+.3)*(1-es(t,go,go+.4));
  let aL=lerp(habit,34,frozen);if(t>=go)aL=lerp(34,strokeM,take)+tw*40;
  const im={x:1190,y:FLOOR,face:-.85,aL,aR:8,brushL:1,smile:lerp(.5,-.5,es(t,C.pull,C.pull+.4)),brow:lerp(.1,1,es(t,C.pull,C.pull+.4)),open:t>=C.pull?1.08:blink(t,.9),mouth:xTalk(t),look:[-.9,0]};
  const reach=pulse(t,done+.4,done+2.6,.5);
  if(after){im.aL=lerp(strokeM,96,es(t,done,done+.6));im.smile=lerp(-.5,.6,reach);im.brow=.5}
  const outA=1-es(t,done+2.0,done+3.0);
  if(outA>0)g+=`<g opacity="${n(outA)}">${impostor(im)}${tears(1190-30,FLOOR-362*1.2+16,1.2,es(t,go+26,go+32)*outA)}</g>`;
  if(after){const emg=es(t,done+.1,done+1.0),mvx=lerp(1040,1190,es(t,done+3.0,done+4.6));
    const mo={x:mvx,y:FLOOR,face:lerp(.8,-.85,es(t,done+3.0,done+4.2)),aL:8,aR:t>done+5?strokeA:8,brush:1,smile:lerp(-.3,.3,es(t,done+4,done+6)),brow:lerp(.8,.2,es(t,done+3,done+5)),open:blink(t,.9),mouth:xTalk(t),look:[lerp(.8,-.7,es(t,done+3,done+4.2)),0]};
    const tb=es(t,V.x7.s-.3,V.x7.s+.3);if(tb>0){mo.face=lerp(mo.face,-1,tb);mo.aR=lerp(mo.aR,8,tb);mo.look=[-.9,0];mo.smile=.6}
    g+=`<g opacity="${n(emg)}">${mother(mo)}</g>`}
  // Bo
  const bk=[[C.night,1640],[V.n10.s+3.2,1640],[V.n10.e,820],[C.pull+.6,820],[C.pull+1.8,620],[D.total,620]];
  const bo={x:KF(bk,t),y:FLOOR,face:t<V.n10.s+3.2?-1:(t<C.pull+.6?1:1),aL:8,aR:8+pulse(t,V.n10.e-.4,C.pull+.5,.2)*130,smile:-.3,brow:.8,open:blink(t,.4),mouth:boTalk(t),look:[.85,-.15]};stepWalk(bo,bk,t);
  if(t<V.n10.e-.3)bo.face=-1,bo.look=[-.85,0];
  if(!teaser)g+=char(bo);
  // the flash, and the count
  const rp=seg(t,done,done+1.4);if(rp>0&&rp<1)for(let i=0;i<3;i++){const r=cl(rp*1.3-i*.15)*520;if(r>0)g+=`<circle cx="960" cy="430" r="${n(r)}" fill="none" stroke="#fff" stroke-width="${n(14*(1-rp))}" opacity="${n(1-rp)}"/>`}
  return g}
function timer(t){
  if(t<C.go||t>C.done+2.4)return '';
  const s=cl(Math.floor(t-C.go),0,60),txt=(s>=60?'1:00':'0:'+String(s).padStart(2,'0')),a=1-es(t,C.done+1.6,C.done+2.4);
  return `<g opacity="${n(a)}"><rect x="1500" y="60" width="360" height="150" rx="24" fill="#05040f" opacity=".72"/><rect x="1524" y="186" width="${n(312*cl((t-C.go)/60))}" height="10" rx="5" fill="#ffe14d"/><text x="1680" y="166" font-size="112" text-anchor="middle" fill="${s>=60?'#ffe14d':'#fff'}" letter-spacing="4">${txt}</text></g>`}
/* ---------- 5: does she know me ---------- */
function lastScene(t){
  const fog=es(t,C.w4-.8,C.w4),wr=pulse(t,C.w4-.2,C.w4+2.3,.3);
  const over=`<rect x="360" y="170" width="500" height="250" rx="60" fill="#fff" opacity="${n(fog*.55)}"/>`+(t>=C.w4?fogText(['DOES SHE','KNOW ME'],84,610,295,es(t,C.w4,C.w4+2.2),lerp(-1,1,es(t,C.w4+2.2,C.w4+2.7))):'');
  const ya=girl({x:660,y:FLOOR,s:.94,face:1,aL:8,aR:8+wr*(150+10*Math.sin(t*7)),smile:-.4,brow:.9,open:blink(t,2.1),look:[.8,wr*-.6]});
  const oin=es(t,C.obin,C.obin+1.2);
  const ob=`<g opacity="${n(oin)}">${char({x:430,y:FLOOR,face:1,sw:CORAL,sc:TEAL,aL:4,aR:4,smile:lerp(.4,.8,es(t,V.o3.s,V.o3.e)),brow:-.25,open:blink(t,1.7),mouth:obTalk(t),look:[.85,0]})}</g>`;
  const ent=es(t,C.back+.2,C.back+1.6),aw=es(t,V.n26.s+2,V.n26.e),bk2=es(t,C.obin,C.obin+.5);
  const bo={x:lerp(1500,1040,ent),y:FLOOR,face:lerp(-1,.2,aw*(1-bk2)),aL:8,aR:8,smile:-.4,brow:lerp(.6,1.1,es(t,V.o3.s+3,V.o3.e)),open:blink(t,.4),look:[lerp(-.8,.3,aw*(1-bk2)),lerp(-.2,.7,aw*(1-bk2))]};
  if(ent>0&&ent<1){bo.walk=t*6;bo.bob=-Math.abs(Math.sin(t*6))*5}
  return room(t,{dop:0,night:1,inside:ob+ya,overGlass:over,chars:char(bo)});
}

/* ---------- camera, overlays ---------- */
const KT=[[0,1060,470,1.45],[C.title,1080,460,1.6]];
const K1=[[C.act1,900,540,1.08],[V.b1.s,1010,480,1.5],[V.n03.s,700,480,1.5],[V.n03.s+2,640,560,1.8],[V.n03.e,700,480,1.4],[V.x1.s,680,470,1.6],[V.x2.e,660,460,1.8],[V.b2.s,1010,480,1.5],[V.x3.s,680,470,1.7],[V.n04.s,900,540,1.1],[V.n04.e,1010,480,1.6],[V.x4.s,680,470,1.7],[V.b3.s,1010,480,1.7],[V.n05.e,1010,470,2],[C.plan,1010,470,2]];
const K2=[[C.plan,1150,540,1.1],[V.n06.s+1,900,500,1.3],[C.w1,640,340,1.8],[V.n07.s,560,560,1.7],[C.w2,620,330,1.9],[V.n08.e,620,330,1.9],[C.w3,620,330,1.95],[C.night,620,330,2.05]];
const K3=[[C.night,1100,520,1.2],[V.n09.s+3,1150,440,1.6],[V.n09.e,1100,480,1.35],[V.n10.s,1500,500,1.4],[V.n10.s+3.4,1300,520,1.2],[V.n10.e,960,480,1.4],[C.pull,960,440,1.5],[V.n12.s,960,430,2.3],[V.n12.e,960,430,2.4],[V.n13.s,1060,460,1.5],[C.go,1060,460,1.5],[V.n14.s,1160,470,2.1],[V.n15.s,1060,460,1.5],[C.go+18,1060,460,1.55],[C.go+24,1150,440,2],[C.go+30,1150,440,2.05],[C.go+36,960,430,2.3],[C.go+42,1060,460,1.55],[C.go+52,1060,455,1.75],[C.done,1060,455,1.8],[C.done+1.2,1090,470,1.5],[V.n21.e,1090,470,1.6],[C.after,900,500,1.3],[V.b4.s,640,470,1.7],[V.x7.s,1170,440,1.8],[V.x7.e,1170,440,1.9],[V.n22.s,900,500,1.3],[V.n23.s,1150,440,1.8],[V.n24.s,760,480,1.5],[V.n24.e,620,465,2.4],[C.back,620,465,2.5]];
const K5=[[C.back,1150,540,1.1],[V.n25.e,700,520,1.5],[C.w4,620,330,1.9],[V.n26.s+1.5,620,340,1.95],[V.n26.e,1040,470,1.8],[C.obin,700,520,1.4],[V.o1.e,450,480,1.9],[V.o2.e,460,470,2.05],[V.n27.s,620,520,1.4],[V.o3.s,450,470,2.1],[V.o3.e,1040,460,2.2],[D.total,1040,455,2.5]];
function cam(K,t){let i=0;while(i<K.length-1&&t>K[i+1][0])i++;const a=K[i],b=K[Math.min(i+1,K.length-1)],u=es(t,a[0],b[0]>a[0]?b[0]:a[0]+1);const z=lerp(a[3],b[3],u);let cx=lerp(a[1],b[1],u),cy=lerp(a[2],b[2],u);cx=cl(cx,960/z,1920-960/z);cy=cl(cy,540/z,1080-540/z);return `translate(960,540) scale(${z.toFixed(4)}) translate(${n(-cx)},${n(-cy)})`}
const P0=((C.n01p||[])[0]||V.n01.s+3.2)-V.n01.s;
const HOOK=[['n01',0,P0-.1,'THERE IS ONE WAY TO SEND','A REFLECTION BACK.'],['n01',P0,99,'YOU HAVE TO MAKE IT','COPY YOU.'],['n02',0,99,'FOR ONE','FULL MINUTE.']];
function hookCaps(t){
  if(t>=C.title)return '';
  let g=`<rect x="0" y="720" width="1920" height="360" fill="#05040f" opacity=".5"/>`;
  for(const [id,a,b,l1,l2] of HOOK){const r=t-V[id].s;if(r>=a&&r<b&&t<V[id].e+.5){const k=.9+.1*es(r,a,a+.18),T=(y,txt,c)=>`<text x="0" y="${y}" font-size="92" text-anchor="middle" fill="${c}" stroke="#05040f" stroke-width="20" paint-order="stroke" stroke-linejoin="round" letter-spacing="3">${txt}</text>`;
    g+=`<g transform="translate(960,880) scale(${n(k)})">${T(-10,l1,'#ffffff')}${T(96,l2,'#ffe14d')}</g>`}}
  return g+`<rect width="1920" height="1080" fill="#000" opacity="${n(1-es(t,0,.3))}"/>`}
function cornerTitle(t){const a=pulse(t,C.title+.1,C.title+6,.6);if(a<=0)return '';
  return `<g opacity="${n(a)}"><rect x="50" y="46" width="560" height="74" rx="16" fill="#05040f" opacity=".6"/><text x="80" y="98" font-size="44" fill="#e9e6ff" letter-spacing="3">BO &amp; OB <tspan fill="#f6c453">· EPISODE 6</tspan></text></g>`}
function endcard(t){const a=es(t,C.end,C.end+.5);if(a<=0)return '';
  return `<g opacity="${n(a)}"><rect width="1920" height="1080" fill="#08071a" opacity=".94"/><text x="960" y="520" font-size="190" text-anchor="middle" fill="#e9e6ff" letter-spacing="8">Bo &amp; Ob</text><text x="960" y="640" font-size="54" text-anchor="middle" fill="#f6c453" letter-spacing="5">TO BE CONTINUED</text></g>`}
const CUTS=[C.act1,C.plan,C.night,C.back];
window.renderAt=function(t){
  let g=DEFS,s;
  if(t<C.act1)s=`<g transform="${cam(KT,t)}">${nightTable(C.go+10+t*.7,true)}</g>`;
  else if(t<C.plan)s=`<g transform="${cam(K1,t)}">${kitchen6(t)}</g>`;
  else if(t<C.night)s=`<g transform="${cam(K2,t)}">${planScene(t)}</g>`;
  else if(t<C.back)s=`<g transform="${cam(K3,t)}">${nightTable(t,false)}</g>`;
  else s=`<g transform="${cam(K5,t)}">${lastScene(t)}</g>`;
  g+=s;
  let bl=0;for(const c of CUTS)bl=Math.max(bl,1-Math.abs(t-c)/.35);
  const fl=pulse(t,C.done-.03,C.done+.5,.12)*.7;
  g+=`<rect width="1920" height="1080" fill="#fff" opacity="${n(fl)}"/><rect width="1920" height="1080" fill="#05040f" opacity="${n(cl(bl))}"/><rect width="1920" height="1080" fill="url(#vig)"/>`;
  g+=timer(t)+hookCaps(t)+cornerTitle(t)+endcard(t);
  g+=`<rect width="1920" height="1080" fill="#000" opacity="${n(es(t,D.total-.7,D.total-.1))}"/>`;
  document.getElementById('s').innerHTML=g;
};
window.DATA={fps:D.fps,total:D.total};
window.ready=document.fonts.load('600 40px Fredoka').then(()=>{renderAt(+(new URLSearchParams(location.search).get('t')||0));return true});
