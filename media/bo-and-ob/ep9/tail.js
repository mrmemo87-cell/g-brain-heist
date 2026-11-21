/* ================= Episode 9: What If the Mirror Was Watching Back? ================= */
const boTalk=tk(ids('b',7)),moTalk=tk(ids('m',1)),nTalk=tk(Array.from({length:40},(_,i)=>'n'+String(i+1).padStart(2,'0')));
const NIGHT9='#0b0930';
/* ---------- the round mirror ---------- */
// who: how much of the old man is visible; eye: where he looks (0 = at Bo, 1 = straight out at you)
function man9(t,who,eye,o){
  return `<g opacity="${n(who)}">${oldBo(Object.assign({x:960,y:700,s:.7,face:lerp(.55,0,eye),aL:8,aR:8,smile:-.15,brow:.45,open:blink(t,2.6),mouth:nTalk(t)*.9,look:[lerp(.8,0,eye),0]},o||{}))}</g>`}
function coldOpen(t){
  const g=dressSet(t,{inMirror:man9(t,1,1,{open:es(t,V.n02.e-.6,V.n02.e-.2)>0&&t<V.n02.e?.1:1.05}),shine:.12});
  return g+`<rect width="1920" height="1080" fill="${NIGHT9}" opacity=".45"/>`}
/* ---------- 1: the slip ---------- */
function stairs9(t){
  const up=es(t,V.n05.s+.3,V.n05.s+1),around=pulse(t,V.b1.s-.2,V.n06.e,.5),go=seg(t,C.room-1.6,C.room-.2);
  const bx=lerp(1575,2050,go*go);
  const bo={x:bx,y:stairY(Math.min(bx,1900)),s:.7,face:go>0?1:lerp(.4,-.6,around*(.5+.5*Math.sin(t*1.6))),aL:8,aR:go>0?8:70,smile:-.4,brow:lerp(.8,1.3,up),open:up>0&&go<=0?1.1:.6,mouth:boTalk(t),look:[go>0?.9:lerp(.3,-.8,around*(.5+.5*Math.sin(t*1.6))),lerp(.8,-.5,up)],tilt:lerp(8,0,up)};
  if(go>0){bo.walk=t*11;bo.bob=-Math.abs(Math.sin(t*11))*5}
  let g=stairsWall(t,{k:i=>i<6?1:0,gone:1,bo});
  // the last photograph, in his hand
  if(go<=0)g+=`<g transform="translate(${n(bx+52)},${n(stairY(bx)-230)}) rotate(-8) scale(.42)"><rect x="-13" y="-13" width="206" height="246" rx="6" fill="#8a5a3c" stroke="${OUT}" stroke-width="5"/>${photo(6,0,1,1)}</g>`;
  return g+`<rect width="1920" height="1080" fill="${NIGHT9}" opacity=".32"/>`}
/* ---------- 2: the man in the glass ---------- */
function note9(lines,a,rot){if(a<=0)return '';
  return `<g opacity="${n(a)}" transform="translate(${n(380-60*(1-a))},470) rotate(${rot})"><rect x="-270" y="-190" width="540" height="380" rx="8" fill="#f4ecd6" stroke="${OUT}" stroke-width="5"/><path d="M -270 -120 h 540" stroke="#d9cdb0" stroke-width="3"/>${lines.map((l,i)=>`<text x="0" y="${-60+i*78}" font-size="58" text-anchor="middle" fill="#2b2140" letter-spacing="2">${l}</text>`).join('')}</g>`}
function room9(t){
  const kx=[[C.room+.3,1900],[C.room+2.6,1330]];
  const bx=KF(kx,t),you=es(t,C.you-.2,C.you+.5)*(1-es(t,C.back-.3,C.back+.3));
  const momIn=es(t,C.mom-.2,C.mom+.5)*(1-es(t,V.n17.e,V.n17.e+1)),turnTo=es(t,V.m1.s-.2,V.m1.s+.3)*(1-es(t,V.n17.s+1,V.n17.s+2));
  const hope=es(t,V.n23.s,V.n24.e),down=es(t,V.n25.e-2.2,V.n25.e-1);
  const bo=stepWalk({x:bx,y:FLOOR,face:lerp(-1,1,turnTo),aL:8,aR:lerp(8,70,down),smile:lerp(-.4,-.1,hope),brow:lerp(1.1,.6,es(t,V.n10.e,V.n11.e))-pulse(t,V.b3.s-.1,V.b3.e+.2,.2)*1.2,open:blink(t,.4),mouth:boTalk(t),look:[lerp(-.85,.8,turnTo),lerp(-.25,.7,down)],tilt:down*6},kx,t,8);
  const inMirror=man9(t,1,you,{smile:lerp(-.15,.35,pulse(t,V.n10.e-1.5,V.n10.e+1,.5))+hope*.3,brow:lerp(.45,.9,pulse(t,V.n15.s,V.n16.e,.6))-hope*.3,look:[lerp(.8,0,you)-momIn*.2,momIn*-.1]});
  let g=dressSet(t,{inMirror,shine:.12,door:momIn>0?`<g opacity="${n(momIn)}">${mother({x:1640,y:FLOOR,face:-.9,aL:8,aR:8+pulse(t,V.n17.e-2.4,V.n17.e,.4)*118,smile:.5,brow:.1,open:blink(t,.9),mouth:moTalk(t),look:[-.8,-.1]})}</g>`:''});
  g+=`<rect width="1920" height="1080" fill="${NIGHT9}" opacity=".3"/>`+char(bo);
  // the cloth, on the floor where he dropped it
  g+=`<path d="M 560 ${FLOOR+40} q 60 -50 130 -18 q 70 -30 120 14 q -40 30 -130 22 q -70 12 -120 -18 Z" fill="#efe6d0" stroke="${OUT}" stroke-width="5" stroke-linejoin="round"/>`;
  return g}
/* ---------- 3: the seventh frame ---------- */
function photo9(t){
  const k=es(t,V.n26.s+5,D.total)*.42,sc=4.4;
  let g=`<rect width="1920" height="1080" fill="#1b1530"/><circle cx="960" cy="540" r="760" fill="#f6c453" opacity=".07"/>`;
  g+=`<g transform="translate(564,56) scale(${sc})"><rect x="-13" y="-13" width="206" height="246" rx="6" fill="#8a5a3c" stroke="${OUT}" stroke-width="3"/>${photo(6,k,1-k*.4,1)}<rect width="180" height="220" fill="none" stroke="${OUT}" stroke-width="2"/></g>`;
  g+=`<circle cx="520" cy="820" r="62" fill="#1d1a3a" stroke="${OUT}" stroke-width="6"/><circle cx="1400" cy="820" r="62" fill="#1d1a3a" stroke="${OUT}" stroke-width="6"/>`;
  return g}
function last9(t){return dressSet(t,{inMirror:man9(t,1,es(t,V.n30.s-.4,V.n30.s+.4),{brow:.8,smile:-.3}),shine:.12})+`<rect width="1920" height="1080" fill="${NIGHT9}" opacity=".4"/>`}

/* ---------- camera, overlays ---------- */
const MX=975,MY=450;
const K0=[[0,MX,MY+45,2.3],[V.n01.e,MX,MY+40,2.7],[V.n02.e,MX,MY+36,3],[C.title,MX,MY+36,3.1]];
const K1=[[C.act1,1300,480,1.3],[V.n03.s+4,1560,470,2],[V.n03.e,1600,430,2.6],[V.n04.s,1575,470,2.3],[V.n04.e,1575,460,2.7],[V.n05.s+.5,1575,470,2.1],[V.b1.s,1450,480,1.7],[V.n06.s,1575,470,2.2],[V.n07.s,1500,480,1.7],[C.room-1.6,1500,480,1.5],[C.room,1700,480,1.5]];
const K2=[[C.room,1250,520,1.15],[V.n08.s+3,1200,500,1.3],[V.n08.s+9,MX,MY,2.2],[V.n08.e,MX,MY,2.6],[V.b2.s,1330,470,1.9],[V.n09.s,MX,MY,2.3],[V.n09.e,MX,MY,2.8],[V.b3.s,1330,470,1.9],[V.n10.s,MX,MY,2.4],[V.n10.e-1.5,1330,470,2],[V.b4.s,1330,470,1.9],[V.n11.s,MX,MY,2.4],[V.n11.e,MX,MY,3],[V.b5.s,1330,470,1.9],[V.n12.s,1150,480,1.45],[V.n12.e,MX,MY,2.2],[C.note,900,500,1.5],[C.noteoff,900,500,1.55],[V.n15.s,MX,MY,2.6],[V.n15.e,MX,MY,3],[V.n16.s,1330,470,1.8],[V.n16.e,1330,465,2.1],[C.mom,1400,520,1.3],[V.n17.s,1300,500,1.35],[V.n17.e,1250,500,1.45],[C.you,MX,MY,2.6],[C.you+1.5,MX,MY-6,3.4],[V.n18.e,MX,MY-8,3.8],[V.n34.e,MX,MY-10,4.4],[C.back,MX,MY,2.4],[V.b6.s,1330,470,1.9],[V.n19.s,MX,MY,2.3],[V.n19.e,MX,MY,2.8],[V.n20.s,1150,480,1.45],[V.n20.e,MX,MY,2.2],[V.n21.e,MX,MY,2.7],[V.n22.s,1150,480,1.4],[V.n22.e,1150,480,1.6],[V.b7.s,1330,470,2],[V.n23.s,MX,MY,2.8],[V.n23.e+.6,MX,MY,3.2],[V.n24.s+.4,MX,MY,2.4],[V.n24.e,1150,480,1.5],[V.n25.s,1330,480,1.7],[V.n25.e,1330,520,2.2],[C.photo,1330,520,2.3]];
const K3=[[C.photo,960,540,1],[V.n26.s+4,1080,560,1.5],[V.n26.e,1110,620,2.5],[V.n27.e,1110,630,3],[V.n28.e,790,330,2.6],[C.last,790,330,2.7]];
const K4=[[C.last,MX,MY,2.3],[V.n29.e,MX,MY,2.8],[V.n30.s,MX,MY-6,3.2],[V.n30.e,MX,MY-10,4],[D.total,MX,MY-10,4.2]];
function cam(K,t){let i=0;while(i<K.length-1&&t>K[i+1][0])i++;const a=K[i],b=K[Math.min(i+1,K.length-1)],u=es(t,a[0],b[0]>a[0]?b[0]:a[0]+1);const z=lerp(a[3],b[3],u);let cx=lerp(a[1],b[1],u),cy=lerp(a[2],b[2],u);cx=cl(cx,960/z,1920-960/z);cy=cl(cy,540/z,1080-540/z);return `translate(960,540) scale(${z.toFixed(4)}) translate(${n(-cx)},${n(-cy)})`}
const N1=V.n01.e-V.n01.s;
const HOOK=[['n01',0,N1*.42,'EVERY MIRROR YOU HAVE EVER','LOOKED INTO LOOKS BACK.'],['n01',N1*.43,N1*.66,'I CAN TELL YOU THAT','FOR CERTAIN.'],['n01',N1*.67,99,'FOR FORTY YEARS,','IT HAS BEEN ME.'],['n02',0,99,'TONIGHT, THE BOY I WAS','WATCHING LOOKED UP.']];
function hookCaps(t){
  if(t>=C.title)return '';
  let g=`<rect x="0" y="720" width="1920" height="360" fill="#05040f" opacity=".5"/>`;
  for(const [id,a,b,l1,l2] of HOOK){const r=t-V[id].s;if(r>=a&&r<b&&t<V[id].e+.5){const k=.9+.1*es(r,a,a+.18),T=(y,txt,c)=>`<text x="0" y="${y}" font-size="88" text-anchor="middle" fill="${c}" stroke="#05040f" stroke-width="20" paint-order="stroke" stroke-linejoin="round" letter-spacing="3">${txt}</text>`;
    g+=`<g transform="translate(960,880) scale(${n(k)})">${T(-10,l1,'#ffffff')}${T(94,l2,'#ffe14d')}</g>`}}
  return g+`<rect width="1920" height="1080" fill="#000" opacity="${n(1-es(t,0,.3))}"/>`}
function cornerTitle(t){const a=pulse(t,C.title+.1,C.title+6,.6);if(a<=0)return '';
  return `<g opacity="${n(a)}"><rect x="50" y="46" width="560" height="74" rx="16" fill="#05040f" opacity=".6"/><text x="80" y="98" font-size="44" fill="#e9e6ff" letter-spacing="3">BO &amp; OB <tspan fill="#f6c453">· EPISODE 9</tspan></text></g>`}
function endcard(t){const a=es(t,C.end,C.end+.5);if(a<=0)return '';
  return `<g opacity="${n(a)}"><rect width="1920" height="1080" fill="#08071a" opacity=".94"/><text x="960" y="520" font-size="190" text-anchor="middle" fill="#e9e6ff" letter-spacing="8">Bo &amp; Ob</text><text x="960" y="640" font-size="54" text-anchor="middle" fill="#f6c453" letter-spacing="5">NEXT: THE LAST EPISODE</text></g>`}
const CUTS=[C.act1,C.room,C.photo,C.last];
window.renderAt=function(t){
  let g=DEFS,s;
  if(t<C.act1)s=`<g transform="${cam(K0,t)}">${coldOpen(t)}</g>`;
  else if(t<C.room)s=`<g transform="${cam(K1,t)}">${stairs9(t)}</g>`;
  else if(t<C.photo)s=`<g transform="${cam(K2,t)}">${room9(t)}</g>`;
  else if(t<C.last)s=`<g transform="${cam(K3,t)}">${photo9(t)}</g>`;
  else s=`<g transform="${cam(K4,t)}">${last9(t)}</g>`;
  g+=s;
  // the warnings he left
  g+=note9(['DON’T TRUST HIM.','HE NEEDS YOU','BACK INSIDE.'],pulse(t,C.note,C.note2-.2,.4),-5)+note9(['DON’T','LET HER IN.'],pulse(t,C.note2,C.noteoff,.4),4);
  let bl=0;for(const c of CUTS)bl=Math.max(bl,1-Math.abs(t-c)/.3);
  g+=`<rect width="1920" height="1080" fill="#05040f" opacity="${n(cl(bl))}"/><rect width="1920" height="1080" fill="url(#vig)"/>`;
  g+=hookCaps(t)+cornerTitle(t)+endcard(t);
  g+=`<rect width="1920" height="1080" fill="#000" opacity="${n(es(t,D.total-.7,D.total-.1))}"/>`;
  document.getElementById('s').innerHTML=g;
};
window.DATA={fps:D.fps,total:D.total};
window.ready=document.fonts.load('600 40px Fredoka').then(()=>{renderAt(+(new URLSearchParams(location.search).get('t')||0));return true});
