/* ================= Episode 7: What If You Were the Reflection? ================= */
const boTalk=tk(ids('b',5)),obTalk=tk(ids('o',13));
const tears=(x,y,s,a)=>a>0?`<g opacity="${n(a)}"><ellipse cx="${n(x-40*s)}" cy="${n(y)}" rx="${n(7*s)}" ry="${n(11*s)}" fill="#9be7ff" stroke="#fff" stroke-width="2"/><ellipse cx="${n(x+40*s)}" cy="${n(y+6*s)}" rx="${n(7*s)}" ry="${n(11*s)}" fill="#9be7ff" stroke="#fff" stroke-width="2"/></g>`:'';
const SEPIA=`<rect width="1920" height="1080" fill="#c9a04a" opacity=".2"/><rect width="1920" height="1080" fill="#2b2118" opacity=".22"/>`;

/* ---------- the bathroom, eleven years ago ---------- */
// mode: 'cry' (cold open), 'touch' (two four-year-olds at the glass), 'grow' (the one inside learning to copy)
function flashBath(t,mode){
  const K=.56;let inside='',outside='';
  if(mode==='cry'){
    const p=pound(t,1);inside=char(Object.assign({x:1200,y:FLOOR,s:K,face:-1,smile:-.8,brow:1.2,open:.9,look:[-.9,0]},p))+tears(1200-18,FLOOR-362*K+12,K,1);
    outside=char({x:860,y:FLOOR,s:K,face:.6,back:1});
  }else if(mode==='touch'){
    const sw=es(t,C.swap,C.swap+.5),after=es(t,C.swap+.5,C.swap+1.4),away=es(t,V.n05.s+2,V.n05.e);
    const cryA=es(t,C.swap+.8,C.swap+2);
    const p=pound(t,cryA);
    inside=char(Object.assign({x:1110,y:FLOOR,s:K,face:-1,aL:lerp(95,8,cryA),aR:8,smile:lerp(.8,-.8,cryA),brow:lerp(.2,1.2,cryA),open:1,look:[-.9,0]},cryA>.3?p:{}))+tears(1110-18,FLOOR-362*K+12,K,cryA);
    outside=char({x:lerp(910,620,away),y:FLOOR,s:K,face:lerp(1,-1,es(t,V.n05.s+1.5,V.n05.s+2.2)),aL:8,aR:lerp(95,8,after),smile:lerp(.8,1.1,after),brow:.2,open:blink(t,.4),look:[lerp(.9,-.6,away),0],walk:away>0&&away<1?t*8:null});
  }else{
    const g=es(t,V.o5.s+2,V.o5.e-1),s=lerp(K,1,g),wave=120+25*Math.sin(t*6);
    outside=char({x:780,y:FLOOR,s,face:1,aL:8,aR:wave,smile:.6,open:blink(t,.4),look:[.7,0]});
    inside=char({x:1240,y:FLOOR,s,face:-1,aL:wave,aR:8,smile:lerp(-.6,.3,g),brow:lerp(1,.1,g),open:1,look:[-.7,0]})+tears(1240-18*s/K,FLOOR-362*s+12,s,1-g);
  }
  let g=BG1+wallClock(CLOCKX,CLOCKY,62,t,false)+`<g clip-path="url(#mc)"><rect x="1010" y="150" width="620" height="770" fill="url(#glass)"/>${tiles(1010,560,620,345,'#d3f3ec','#b6e6db')}<rect x="1010" y="${FLOOR}" width="620" height="20" fill="#d9cef5"/>${inside}${SHINE(1320)}</g>`+MIRROR_FRAME(1010)+outside;
  if(mode==='touch'){const f=pulse(t,C.swap-.03,C.swap+.5,.12);g+=`<rect width="1920" height="1080" fill="#fff" opacity="${n(f*.7)}"/>`}
  return g+SEPIA}
// the first morning, as we saw it in Episode 1
function recall(t){
  const up=es(t,V.n10.s+.6,V.n10.s+2.4),lag=es(t,V.n10.s+1.4,V.n10.s+3.4);
  const ob=char({x:1300,y:FLOOR,face:-1,aL:8+up*122,aR:8,smile:.8,brow:-.15,open:1,look:[-.6,0]});
  const bo=char({x:720,y:FLOOR,face:1,aL:8,aR:8+lag*122,smile:-.2,brow:.9,open:1.05,look:[.9,-.6*lag]});
  return BG1+wallClock(CLOCKX,CLOCKY,62,t,false)+`<g clip-path="url(#mc)"><rect x="1010" y="150" width="620" height="770" fill="url(#glass)"/>${tiles(1010,560,620,345,'#d3f3ec','#b6e6db')}<rect x="1010" y="${FLOOR}" width="620" height="20" fill="#d9cef5"/>${wallClock(2020-CLOCKX,CLOCKY,62,t,false)}${ob}${SHINE(1320)}</g>`+MIRROR_FRAME(1010)+bo+SEPIA}
const RLAB=`<rect x="60" y="56" width="470" height="74" rx="14" fill="#05040f" opacity=".6"/><text x="86" y="106" font-size="42" fill="#f6c453" letter-spacing="3">THE FIRST MORNING</text>`;

/* ---------- Yasmine's room, at night ---------- */
function nightTalk(t){
  const go=C.go,stop=C.stop,inMin=t>=go&&t<stop,el=t-go;
  const stroke=120+26*Math.sin(el*2.4),take=es(t,go,go+9);
  const fog0=Math.min(C.fog,stop-1.2),fogA=es(t,fog0,stop-.1),shake=pulse(t,V.n08.s,V.n08.s+4,.4);
  // Ob
  const up=es(t,V.n09.s,V.n09.e+.8);
  const ob=char({x:560,y:FLOOR,face:1,sw:CORAL,sc:TEAL,aL:8,aR:t>=stop?lerp(stroke,8,es(t,stop,stop+1.2)):t>=go?stroke:8+up*112,smile:lerp(.4,.8,es(t,V.o7.s,V.o7.e))*(1-es(t,V.n26.s+2,V.n26.e)*1.3),brow:-.2,open:t>=go&&t<stop?1.05:blink(t,1.7),mouth:obTalk(t),look:[.85,0]});
  const breath=pulse(t,fog0-.6,stop+.4,.3);
  const ya=girl({x:790,y:FLOOR,s:.94,face:lerp(.6,1,breath),aL:8,aR:8+pulse(t,C.w1-.2,C.w1+2.3,.3)*(150+10*Math.sin(t*7)),smile:-.4,brow:.9,open:blink(t,2.1),mouth:breath*.6,look:[.8,-.2],head:shake*8*Math.sin(t*9),tilt:breath*5});
  let over=`<rect x="290" y="150" width="620" height="770" fill="#fff" opacity="${n(fogA*.93*(1-es(t,V.n17.s,V.n17.e)*.25))}"/>`;
  if(t>=C.w1)over+=fogText(['HE LEFT','SOMETHING','OUT'],64,600,340,es(t,C.w1,C.w1+2.2),lerp(-1,1,es(t,C.w1+2.2,C.w1+2.7)));
  // Bo
  const drop=es(t,stop,stop+.25),sit=es(t,V.n17.s,V.n17.s+1.6);
  let aL=8;if(t>=go)aL=lerp(8,stroke,take)*(1-drop)+8*drop+pulse(t,go+.3,go+1.2,.15)*30;
  const bo={x:lerp(1040,1010,sit),y:FLOOR+sit*150,face:lerp(-1,1,sit),aL,aR:8,smile:-.4,brow:lerp(.7,1.2,es(t,go,go+3)),open:inMin?1.08:blink(t,.4),mouth:boTalk(t),look:[lerp(-.85,.3,sit),lerp(0,.6,sit)],bob:-pulse(t,stop,stop+.3,.1)*14};
  bo.brow-=pulse(t,V.b1.s-.1,V.b1.e+.2,.2)*1.4+pulse(t,V.b3.s-.1,V.b3.e+.2,.2)*1.4;
  const think=pulse(t,V.n03.s+1,V.n04.e,.6);if(think>0)bo.look=[lerp(-.85,.2,think),lerp(0,.7,think)];
  return room(t,{dop:0,night:.72,inside:ob+ya,overGlass:over,chars:char(bo)});
}
function timer(t){
  if(t<C.go||t>C.stop+4)return '';
  const s=cl(Math.floor(t-C.go),0,41),stopd=t>=C.stop,a=1-es(t,C.stop+3.2,C.stop+4);
  return `<g opacity="${n(a)}"><rect x="1500" y="60" width="360" height="150" rx="24" fill="#05040f" opacity=".72"/><rect x="1524" y="186" width="${n(312*cl((t-C.go)/60,0,41/60))}" height="10" rx="5" fill="#ffe14d"/><text x="1680" y="166" font-size="112" text-anchor="middle" fill="${stopd?'#ffe14d':'#fff'}" letter-spacing="4">0:${String(s).padStart(2,'0')}</text></g>`}

/* ---------- camera, overlays ---------- */
const K0=[[0,1150,560,1.5],[C.title,1200,600,2.1]];
const K1=[[C.act1,1000,540,1.1],[V.o1.s,640,490,1.6],[V.o1.e,580,470,1.9],[V.b1.s,1040,470,1.7],[V.o2.s,580,470,1.8],[V.o2.e,580,465,2],[V.n03.s,1040,470,1.6],[V.n04.e,1040,465,2.2],[C.flash,1040,465,2.3]];
const K2=[[C.flash,1000,560,1.5],[C.swap,1010,560,1.9],[C.swap+1,1000,560,1.5],[V.n05.e,760,560,1.6],[V.o4.s,1150,580,2],[V.o4.e,1150,580,2.2],[V.n06.s,660,600,2.2],[V.n06.e,640,600,2.6],[C.grow,1010,540,1.15],[C.ask,1010,540,1.25]];
const K3=[[C.ask,1000,540,1.1],[V.b2.s,1040,470,1.7],[V.o6.s,580,470,1.8],[V.o7.s,600,480,1.6],[V.o7.e,580,465,2.1],[V.n07.s,1040,470,1.7],[V.n08.s,760,480,1.7],[V.n08.e,790,470,2],[V.b4.s,1040,470,1.8],[V.o12.s,580,470,1.9],[V.o12.e,580,465,2.2],[V.n22.s,1040,470,1.7],[V.n22.e,1040,465,2.1],[V.n23.e,800,500,1.4],[V.b5.s,1040,470,1.9],[V.o13.s,580,468,2.2],[V.n24.s,1040,470,1.8],[V.n24.e,1040,465,2.2],[V.b3.s,1040,470,1.8],[V.o8.s,580,470,1.9],[V.n09.s,640,480,1.6],[V.n10.s-.3,700,480,1.5],[C.go,800,500,1.35],[V.o9.s,580,470,1.9],[V.n11.s,1040,480,1.7],[V.n12.s,800,500,1.35],[V.n12.e,1040,470,1.9],[V.n13.s+2.4,790,470,2],[C.stop,700,500,1.4],[V.n15.e,1040,500,1.5],[V.o10.s,620,480,1.6],[V.n25.s,1040,470,1.7],[V.n25.e,1040,465,2.2],[V.n17.s,960,560,1.3],[V.n17.e,1000,640,1.6],[C.w1,640,400,1.7],[V.n19.e,620,380,1.95],[V.n26.s+1.5,560,470,2],[D.total,560,465,2.4]];
function cam(K,t){let i=0;while(i<K.length-1&&t>K[i+1][0])i++;const a=K[i],b=K[Math.min(i+1,K.length-1)],u=es(t,a[0],b[0]>a[0]?b[0]:a[0]+1);const z=lerp(a[3],b[3],u);let cx=lerp(a[1],b[1],u),cy=lerp(a[2],b[2],u);cx=cl(cx,960/z,1920-960/z);cy=cl(cy,540/z,1080-540/z);return `translate(960,540) scale(${z.toFixed(4)}) translate(${n(-cx)},${n(-cy)})`}
const N1=V.n01.e-V.n01.s;
const HOOK=[['n01',0,N1*.29,'WHAT IS THE FIRST THING','YOU REMEMBER?'],['n01',N1*.3,N1*.6,'BO’S WAS A','BATHROOM FLOOR.'],['n01',N1*.61,99,'AND A LITTLE BOY, CRYING,','BEHIND A MIRROR.'],['n02',0,99,'HE ALWAYS THOUGHT','THAT BOY WAS HIM.']];
function hookCaps(t){
  if(t>=C.title)return '';
  let g=`<rect x="0" y="720" width="1920" height="360" fill="#05040f" opacity=".5"/>`;
  for(const [id,a,b,l1,l2] of HOOK){const r=t-V[id].s;if(r>=a&&r<b&&t<V[id].e+.5){const k=.9+.1*es(r,a,a+.18),T=(y,txt,c)=>`<text x="0" y="${y}" font-size="90" text-anchor="middle" fill="${c}" stroke="#05040f" stroke-width="20" paint-order="stroke" stroke-linejoin="round" letter-spacing="3">${txt}</text>`;
    g+=`<g transform="translate(960,880) scale(${n(k)})">${T(-10,l1,'#ffffff')}${T(94,l2,'#ffe14d')}</g>`}}
  return g+`<rect width="1920" height="1080" fill="#000" opacity="${n(1-es(t,0,.3))}"/>`}
function cornerTitle(t){const a=pulse(t,C.title+.1,C.title+6,.6);if(a<=0)return '';
  return `<g opacity="${n(a)}"><rect x="50" y="46" width="560" height="74" rx="16" fill="#05040f" opacity=".6"/><text x="80" y="98" font-size="44" fill="#e9e6ff" letter-spacing="3">BO &amp; OB <tspan fill="#f6c453">· EPISODE 7</tspan></text></g>`}
function endcard(t){const a=es(t,C.end,C.end+.5);if(a<=0)return '';
  return `<g opacity="${n(a)}"><rect width="1920" height="1080" fill="#08071a" opacity=".94"/><text x="960" y="520" font-size="190" text-anchor="middle" fill="#e9e6ff" letter-spacing="8">Bo &amp; Ob</text><text x="960" y="640" font-size="54" text-anchor="middle" fill="#f6c453" letter-spacing="5">TO BE CONTINUED</text></g>`}
const R0=V.n10.s-.15,R1=V.n10.e+.3;
const CUTS=[C.act1,C.flash,C.grow,C.ask,R0,R1];
window.renderAt=function(t){
  let g=DEFS,s;
  if(t<C.act1)s=`<g transform="${cam(K0,t)}">${flashBath(t,'cry')}</g>`;
  else if(t<C.flash)s=`<g transform="${cam(K1,t)}">${nightTalk(t)}</g>`;
  else if(t<C.grow)s=`<g transform="${cam(K2,t)}">${flashBath(t,'touch')}</g>`;
  else if(t<C.ask)s=`<g transform="${cam(K2,t)}">${flashBath(t,'grow')}</g>`;
  else if(t>=R0&&t<R1)s=`<g transform="translate(960,540) scale(${n(1.1+.1*seg(t,R0,R1))}) translate(-1010,-540)">${recall(t)}</g>`;
  else s=`<g transform="${cam(K3,t)}">${nightTalk(t)}</g>`;
  g+=s;
  let bl=0;for(const c of CUTS)bl=Math.max(bl,1-Math.abs(t-c)/.3);
  g+=`<rect width="1920" height="1080" fill="#05040f" opacity="${n(cl(bl))}"/><rect width="1920" height="1080" fill="url(#vig)"/>`;
  if(t>=R0&&t<R1)g+=RLAB;
  g+=timer(t)+hookCaps(t)+cornerTitle(t)+endcard(t);
  g+=`<rect width="1920" height="1080" fill="#000" opacity="${n(es(t,D.total-.7,D.total-.1))}"/>`;
  document.getElementById('s').innerHTML=g;
};
window.DATA={fps:D.fps,total:D.total};
window.ready=document.fonts.load('600 40px Fredoka').then(()=>{renderAt(+(new URLSearchParams(location.search).get('t')||0));return true});
