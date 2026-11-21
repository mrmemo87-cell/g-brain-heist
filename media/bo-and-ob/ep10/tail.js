/* ================= Episode 10: What If You Had to Choose Which One of You Is Real? ================= */
const boTalk=tk(ids('b',6)),obTalk=tk(ids('o',4)),moTalk=tk(['m2']);
const OUTCLIP=`<defs><clipPath id="out10"><rect x="905" y="0" width="1100" height="1080"/></clipPath></defs>`;
// how far the last photograph has gone (0 = the girl, 1 = nobody left to come back for)
function gone10(t){return t<C.go?lerp(.42,.6,es(t,C.act1,C.go)):t<C.stop?lerp(.6,.96,(t-C.go)/60):lerp(.96,0,es(t,C.out+1,C.out+3))}
/* ---------- the bedroom, the last night ---------- */
function night10(t){
  const go=C.go,stop=C.stop,inMin=t>=go&&t<stop;
  const boHand=es(t,V.n08.s+.4,V.n08.s+2),obHand=es(t,V.n10.s+1.2,V.n10.e-.3);
  const clear=es(t,stop,stop+1.2),cloud=pulse(t,V.n19.s+4,C.hand+1.2,1.2),held=es(t,C.hand,C.hand+1);
  const out=t>=C.out;
  // Yasmine
  const stand=es(t,C.step,C.step+1.2),yk=[[C.step+1.2,480],[C.step+3.2,870],[C.out,870],[C.out+2.2,1290]];
  const yx=KF(yk,t),ya={x:yx,y:FLOOR+(1-stand)*150,s:.94,face:es(t,C.door,C.door+.4)>0?1:.8,aL:8,aR:8,smile:lerp(-.4,.9,es(t,C.out+1.5,C.out+3)),brow:lerp(.9,0,es(t,C.out+1.5,C.out+3)),open:blink(t,2.1),look:[.8,lerp(.4,0,stand)]};
  stepWalk(ya,yk,t,7);
  const yaG=`<g opacity="${n(1-gone10(t)*.62)}">${girl(ya)}</g>`;
  // Ob
  const shake=pulse(t,go+40.5,go+52,.8),ok=[[C.out+2.4,730],[C.out+4.6,1110]];
  const feet=es(t,C.out+4.8,C.out+5.6)*(1-es(t,C.door,C.door+.5));
  const ob={x:KF(ok,t),y:FLOOR,face:1,sw:CORAL,sc:TEAL,aL:8,aR:8+obHand*87*(1-es(t,C.out+1,C.out+2))+shake*5*Math.sin(t*23),smile:lerp(-.2,.1,es(t,V.o2.s,V.o2.e))+es(t,C.out+5,C.out+7)*.6,brow:lerp(.2,.8,es(t,V.o2.s,V.o2.e))*(1-es(t,C.out+5,C.out+7)),open:inMin?1.05:blink(t,1.7),mouth:obTalk(t),look:[lerp(.85,.2,feet),feet*.9+pulse(t,V.n04.s+3,V.n04.s+6,.5)*.5],tilt:feet*6};
  stepWalk(ob,ok,t,7);
  // the man who holds the door
  const old=held>0?`<g opacity="${n(held*.9)}">${oldBo({x:lerp(330,420,held),y:FLOOR,face:1,aL:8,aR:150,smile:lerp(-.2,.5,es(t,C.out,C.out+3)),brow:.3,open:blink(t,2.6),look:[.8,0]})}</g>`:'';
  let inside=`<rect x="290" y="150" width="620" height="770" fill="#fff3c4" opacity="${n(clear*.3)}"/>`+old+(yx<905?yaG:'')+(ob.x<905?char(ob):'');
  let over=`<rect x="290" y="150" width="620" height="770" fill="none" stroke="#fff" stroke-width="${n(cloud*210)}" opacity="${n(cloud*.5)}"/>`;
  // Bo
  const bk=[[C.out-.2,1090],[C.out+1.6,1480]];
  const bo={x:KF(bk,t),y:FLOOR,face:out?lerp(-1,-.6,es(t,C.out+2,C.out+3)):-1,aL:8+boHand*87*(1-es(t,C.out-.4,C.out+.4)),aR:8,smile:lerp(-.4,.7,es(t,C.out+2,C.out+4)),brow:lerp(.7,.3,es(t,V.b2.s,V.b2.e))+pulse(t,go,stop,3)*.4-es(t,C.out+2,C.out+4)*.3,open:inMin?1.05:blink(t,.4),mouth:boTalk(t),look:[-.85,pulse(t,V.n21.s,V.n21.e,.5)*-.1]};
  stepWalk(bo,bk,t,7);
  const dop=es(t,C.door-.3,C.door+.5);
  let chars=OUTCLIP+(dop>0?mother({x:1765,y:FLOOR,face:-.9,aL:8,aR:8+pulse(t,V.m2.s,V.m2.e,.3)*60,smile:.9,brow:0,open:blink(t,.9),mouth:moTalk(t),look:[-.8,0]}):'');
  chars+=`<g clip-path="url(#out10)">${yx>=850?yaG:''}${ob.x>=850?char(ob):''}</g>`+char(bo);
  return room(t,{dop,night:.72,inside,overGlass:over,chars})}
function timer10(el,stopd,a){
  const s=cl(Math.floor(el),0,60);
  return `<g opacity="${n(a)}"><rect x="1500" y="60" width="360" height="150" rx="24" fill="#05040f" opacity=".72"/><rect x="1524" y="186" width="${n(312*cl(el/60))}" height="10" rx="5" fill="#ffe14d"/><text x="1680" y="166" font-size="112" text-anchor="middle" fill="${stopd?'#ffe14d':'#fff'}" letter-spacing="4">${s>=60?'1:00':'0:'+String(s).padStart(2,'0')}</text></g>`}
function meter10(t,k,a){
  return `<g opacity="${n(a)}" transform="translate(74,150) scale(.86)"><rect x="-13" y="-13" width="206" height="246" rx="6" fill="#8a5a3c" stroke="${OUT}" stroke-width="5"/><svg width="180" height="220" viewBox="0 0 180 220" overflow="hidden">${photo(6,0,1-k,0)}</svg><rect width="180" height="220" fill="none" stroke="${OUT}" stroke-width="3"/><rect x="0" y="236" width="180" height="12" rx="6" fill="#05040f" opacity=".7"/><rect x="0" y="236" width="${n(180*(1-k))}" height="12" rx="6" fill="#ff7b6b"/></g>`}
/* ---------- seven photographs, turning back ---------- */
function stairs10(t){const a=C.photos+.9;return stairsWall(t,{k:i=>1-es(t,a,a+.5),glow:i=>pulse(t,a-.1,a+1.6,.3)})}
/* ---------- starting at the chin ---------- */
function fade10(t){
  const f=es(t,V.n27.s+6,V.n38.e+1);
  const inside=`<g opacity="${n(1-f*.86)}">${oldBo({x:600,y:FLOOR,s:1.05,face:.05,aL:8,aR:8,smile:lerp(-.1,.6,es(t,V.n28.s,V.n38.e)),brow:.2,open:blink(t,2.6),look:[0,0]})}</g>`;
  return room(t,{dop:0,night:.8,inside,overGlass:''})}
/* ---------- two plates ---------- */
function home10(t){
  const mo={x:520,y:FLOOR,face:.9,sw:'#3f8f7a',sc:'#ff9db5',aL:8+pulse(t,V.n29.s+5,V.n29.s+9,.5)*60,aR:8,smile:.9,brow:0,open:blink(t,.9),look:[.85,0]};
  const a=char({x:930,y:FLOOR,face:-.6,aL:8,aR:8,smile:.8,brow:0,open:blink(t,.4),look:[-.6,.2]});
  const b=char({x:1150,y:FLOOR,face:-.7,sw:CORAL,sc:TEAL,aL:8,aR:8,smile:lerp(.2,.9,es(t,V.n29.s+6,V.n29.e)),brow:.2,open:blink(t,1.7),look:[-.8,lerp(.6,.1,es(t,V.n29.s+6,V.n29.e))]});
  return kitchenSet(t,false)+mother(mo)+a+b+TABLE+`<ellipse cx="1150" cy="716" rx="74" ry="20" fill="#fdfdff" stroke="${OUT}" stroke-width="5"/><ellipse cx="1150" cy="712" rx="54" ry="11" fill="#f0c98a"/>`}
/* ---------- wave first ---------- */
function bath10(t){
  const w=es(t,C.wave,C.wave+.5),wl=es(t,C.wave+.9,C.wave+1.4);
  const wave=t=>120+26*Math.sin(t*6);
  const bo=char({x:780,y:FLOOR,face:1,aL:8,aR:8+w*(wave(t)-8),smile:lerp(-.1,.9,es(t,C.wave+1.2,C.wave+2.4)),brow:lerp(.3,0,w),open:lerp(.5,1,es(t,V.n31.s+4,V.n31.e)),look:[.7,0]});
  const rf=char({x:1240,y:FLOOR,face:-1,aL:8+wl*(wave(t-.9)-8),aR:8,smile:lerp(-.1,.9,es(t,C.wave+2.1,C.wave+3.3)),brow:.1,open:lerp(.5,1,es(t,V.n31.s+4.6,V.n31.e+.6)),look:[-.7,0]});
  return BG1+wallClock(CLOCKX,CLOCKY,62,t,false)+`<g clip-path="url(#mc)"><rect x="1010" y="150" width="620" height="770" fill="url(#glass)"/>${tiles(1010,560,620,345,'#d3f3ec','#b6e6db')}<rect x="1010" y="${FLOOR}" width="620" height="20" fill="#d9cef5"/>${wallClock(2020-CLOCKX,CLOCKY,62,t,false)}${rf}${SHINE(1320)}</g>`+MIRROR_FRAME(1010)+bo}

/* ---------- camera, overlays ---------- */
const TZ=C.go+57;
const K0=[[0,900,520,1.5],[C.title,900,500,1.7]];
const K1=[[C.act1,1000,540,1.08],[V.n03.s+5,560,640,1.5],[V.n03.e,480,700,2],[V.n04.s,700,480,1.6],[V.n04.e,730,465,2.1],[V.o1.s,730,470,1.9],[V.b1.s,1090,470,1.8],[V.n05.s,1090,470,1.7],[V.n05.e,1090,465,2.1],[V.b2.s,1090,465,2.3],[V.n06.s,730,470,2],[V.n06.e,730,465,2.6],[V.b3.s,1090,470,1.9],[V.o2.s,730,470,1.9],[V.o2.e,730,462,2.6],[V.n07.s,900,500,1.3],[V.b4.s,1090,470,1.8],[V.b4.e,1090,465,2.1],[V.o3.s,730,470,1.9],[V.b5.s,1090,465,2.3],[V.n08.s,910,520,1.7],[V.n08.e,910,540,2.3],[V.n09.s,730,470,2],[V.n09.e,760,500,2.8],[V.n10.s,820,540,2.4],[V.n10.e,910,540,2.4],[C.go,910,520,1.5],
  [V.n12.s,910,520,1.5],[V.n12.e,910,540,2.2],[V.n13.s,480,720,1.8],[V.n14.s,910,520,1.4],[V.n14.e,910,500,1.8],[V.n15.s,800,560,2.4],[V.o4.s,730,470,2.3],[V.b6.s,1090,470,2.3],[V.n16.s,910,530,1.9],[C.stop,910,530,2.3],
  [C.stop+1,800,520,1.3],[V.n18.e,700,520,1.5],[C.step,600,560,1.5],[V.n19.e,800,540,1.7],[V.n20.e,700,520,1.4],[V.n21.s,910,480,1.6],[V.n21.e,910,470,2],[V.n22.s,910,470,2.1],[V.n23.s,600,480,1.5],[C.hand,420,480,2],[V.n24.e,420,470,2.5],[V.n36.e,430,470,2.2],
  [C.out,900,540,1.15],[V.n25.e,1150,520,1.5],[C.door,1400,520,1.3],[C.photos,1400,520,1.35]];
const K2=[[C.photos,960,540,1],[C.fade,960,520,1.12]];
const K3=[[C.fade,600,470,1.5],[V.n27.e,600,440,2.1],[V.n28.e,600,430,2.4],[V.n38.e,600,425,2.9],[C.home,600,425,2.9]];
const K4=[[C.home,900,540,1.08],[V.n29.s+5,960,640,1.9],[V.n29.e,1050,480,1.6],[V.n30.e,1050,470,1.8],[C.bath,1050,470,1.8]];
const K5=[[C.bath,1000,560,1.15],[V.n31.e,1000,540,1.3],[C.wave,1010,540,1.4],[V.n33.s,1150,500,1.7],[V.n33.e+1,1240,470,2.3],[D.total,1240,470,2.4]];
function cam(K,t){let i=0;while(i<K.length-1&&t>K[i+1][0])i++;const a=K[i],b=K[Math.min(i+1,K.length-1)],u=es(t,a[0],b[0]>a[0]?b[0]:a[0]+1);const z=lerp(a[3],b[3],u);let cx=lerp(a[1],b[1],u),cy=lerp(a[2],b[2],u);cx=cl(cx,960/z,1920-960/z);cy=cl(cy,540/z,1080-540/z);return `translate(960,540) scale(${z.toFixed(4)}) translate(${n(-cx)},${n(-cy)})`}
const N1=V.n01.e-V.n01.s,N2=V.n02.e-V.n02.s;
const HOOK=[['n01',0,N1*.42,'I HAVE TOLD YOU NINE','OF THESE STORIES.'],['n01',N1*.43,99,'I KNEW HOW EVERY ONE','OF THEM ENDED.'],['n02',0,N2*.4,'I DO NOT KNOW','HOW THIS ONE ENDS.'],['n02',N2*.41,99,'I WILL FIND OUT WHEN','YOU DO. WATCH CLOSELY.']];
function hookCaps(t){
  if(t>=C.title)return '';
  let g=`<rect x="0" y="720" width="1920" height="360" fill="#05040f" opacity=".5"/>`;
  for(const [id,a,b,l1,l2] of HOOK){const r=t-V[id].s;if(r>=a&&r<b&&t<V[id].e+.5){const k=.9+.1*es(r,a,a+.18),T=(y,txt,c)=>`<text x="0" y="${y}" font-size="88" text-anchor="middle" fill="${c}" stroke="#05040f" stroke-width="20" paint-order="stroke" stroke-linejoin="round" letter-spacing="3">${txt}</text>`;
    g+=`<g transform="translate(960,880) scale(${n(k)})">${T(-10,l1,'#ffffff')}${T(94,l2,'#ffe14d')}</g>`}}
  return g+`<rect width="1920" height="1080" fill="#000" opacity="${n(1-es(t,0,.3))}"/>`}
function cornerTitle(t){const a=pulse(t,C.title+.1,C.title+6,.6);if(a<=0)return '';
  return `<g opacity="${n(a)}"><rect x="50" y="46" width="640" height="74" rx="16" fill="#05040f" opacity=".6"/><text x="80" y="98" font-size="44" fill="#e9e6ff" letter-spacing="3">BO &amp; OB <tspan fill="#f6c453">· THE LAST EPISODE</tspan></text></g>`}
function endcard(t){const a=es(t,C.end,C.end+.6);if(a<=0)return '';
  return `<g opacity="${n(a)}"><rect width="1920" height="1080" fill="#08071a" opacity=".95"/><text x="960" y="500" font-size="190" text-anchor="middle" fill="#e9e6ff" letter-spacing="8">Bo &amp; Ob</text><text x="960" y="620" font-size="60" text-anchor="middle" fill="#f6c453" letter-spacing="8">THE END</text><text x="960" y="720" font-size="44" text-anchor="middle" fill="#e9e6ff" opacity=".8" letter-spacing="3">Your reflection is late. Wave first.</text></g>`}
const CUTS=[C.act1,C.photos,C.fade,C.home,C.bath];
window.renderAt=function(t){
  let g=DEFS,s;
  if(t<C.act1)s=`<g transform="${cam(K0,t)}">${night10(TZ+t*.12)}</g>`;
  else if(t<C.photos)s=`<g transform="${cam(K1,t)}">${night10(t)}</g>`;
  else if(t<C.fade)s=`<g transform="${cam(K2,t)}">${stairs10(t)}</g>`;
  else if(t<C.home)s=`<g transform="${cam(K3,t)}">${fade10(t)}</g>`;
  else if(t<C.bath)s=`<g transform="${cam(K4,t)}">${home10(t)}</g>`;
  else s=`<g transform="${cam(K5,t)}">${bath10(t)}</g>`;
  g+=s;
  let bl=0;for(const c of CUTS)bl=Math.max(bl,1-Math.abs(t-c)/.3);
  g+=`<rect width="1920" height="1080" fill="#05040f" opacity="${n(cl(bl))}"/><rect width="1920" height="1080" fill="url(#vig)"/>`;
  if(t<C.act1)g+=timer10(57+t*.12,false,1);
  else{
    if(t>=C.go&&t<C.stop+4)g+=timer10(t-C.go,t>=C.stop,1-es(t,C.stop+3.2,C.stop+4));
    if(t>=V.n03.s&&t<C.out+4)g+=meter10(t,gone10(t),es(t,V.n03.s,V.n03.s+.6)*(1-es(t,C.out+3.3,C.out+4)));
  }
  g+=hookCaps(t)+cornerTitle(t)+endcard(t);
  g+=`<rect width="1920" height="1080" fill="#000" opacity="${n(es(t,D.total-.7,D.total-.1))}"/>`;
  document.getElementById('s').innerHTML=g;
};
window.DATA={fps:D.fps,total:D.total};
window.ready=document.fonts.load('600 40px Fredoka').then(()=>{renderAt(+(new URLSearchParams(location.search).get('t')||0));return true});
