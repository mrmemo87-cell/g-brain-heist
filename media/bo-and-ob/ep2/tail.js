/* ================= Episode 2 ================= */
const BOV=['b1','b2','b3','b4','b5','b6','b7','b8'],OBVV=['o1','o2','o3','o4','o5','o6','o7','o8'];
const boTalk=t=>BOV.reduce((s,id)=>s+talk1(id,t),0),obTalk=t=>OBVV.reduce((s,id)=>s+talk1(id,t),0);
const PLUM='#b565c9',DARK='#120e30';
const STARS2=Array.from({length:26},(_,i)=>[(i*379+90)%1920,(i*197+40)%520,8+(i*7)%12,i]);
const FAR=Array.from({length:44},(_,i)=>{const x=40+(i*431)%1840,y=30+(i*173)%470,w=26+(i*13)%38;return [x,y,w,w*1.35,i]}).filter(([x,y,w,h])=>!(x+w>1430&&x<1810&&y+h>90&&y<430)&&!(x+w>270&&x<930&&y+h>120)&&!(x+w>1070&&x<1290&&y+h>210&&y<430));
const farMirrors=(t,mf)=>{let g='';for(const [x,y,w,h,i] of FAR){const a=mf*(.45+.3*Math.sin(t*1.3+i)**2);g+=`<g opacity="${n(a)}"><rect x="${x}" y="${y}" width="${w}" height="${n(h)}" rx="4" fill="#fff0d9" stroke="#f6c453" stroke-width="3"/><circle cx="${n(x+w/2)}" cy="${n(y+h*.5)}" r="${n(w*.24)}" fill="${HEAD}"/><rect x="${n(x+w*.3)}" y="${n(y+h*.66)}" width="${n(w*.4)}" height="${n(h*.34)}" fill="${HEAD}"/></g>`}return g};
const BG2=`<rect width="1920" height="1080" fill="#211b4d"/>
${tiles(0,560,1920,345,'#d9809a','#c26684')}
<rect x="0" y="548" width="1920" height="16" fill="#b8587a"/>
<rect x="0" y="${FLOOR}" width="1920" height="175" fill="#3b3278"/><rect x="0" y="${FLOOR}" width="1920" height="10" fill="#2c2560"/>
<g><rect x="1460" y="110" width="330" height="300" rx="22" fill="#151238" stroke="#7d77c9" stroke-width="18"/><circle cx="1540" cy="190" r="42" fill="#fff6c9"/><circle cx="1558" cy="178" r="36" fill="#151238"/><line x1="1625" y1="110" x2="1625" y2="410" stroke="#7d77c9" stroke-width="12"/><line x1="1460" y1="260" x2="1790" y2="260" stroke="#7d77c9" stroke-width="12"/></g>
<g><rect x="1470" y="672" width="400" height="233" rx="16" fill="#c9832f" stroke="${OUT}" stroke-width="5"/><rect x="1496" y="716" width="164" height="160" rx="10" fill="#dc9b4a"/><rect x="1680" y="716" width="164" height="160" rx="10" fill="#dc9b4a"/>
<rect x="1450" y="640" width="440" height="40" rx="12" fill="#e9e9f2" stroke="${OUT}" stroke-width="5"/><ellipse cx="1690" cy="646" rx="110" ry="14" fill="#cfd6e6"/>
<path d="M 1735 640 V 590 Q 1735 560 1700 560 Q 1670 560 1670 590" fill="none" stroke="#9aa3b8" stroke-width="16" stroke-linecap="round"/></g>
<ellipse cx="1175" cy="965" rx="400" ry="46" fill="#178a80"/><ellipse cx="1175" cy="965" rx="360" ry="34" fill="none" stroke="#fff" stroke-width="5" stroke-dasharray="14 14" opacity=".6"/>`;
const CRACK=[[0,330],[.9,300],[1.7,360],[2.6,280],[3.3,340],[4.1,300],[4.9,370],[5.6,260]];
const cracks=(X,Y,clip,op=1)=>{let g='';for(const [a,len] of CRACK){let d='M '+X+' '+Y;for(let j=1;j<=5;j++){const r=len*j/5,w=(j%2?1:-1)*.12;d+=' L '+n(X+Math.cos(a+w)*r)+' '+n(Y+Math.sin(a+w)*r)}g+=`<path d="${d}" fill="none" stroke="#e9f6ff" stroke-width="4" stroke-linejoin="round" opacity="${op}" clip-path="url(#${clip})"/>`}return g};

/* ---------- A: behind the glass, at the cracked mirror ---------- */
function glassRoom(t){
  let g=BG2+farMirrors(t,.55);
  for(const [x,y,r,i] of STARS2)g+=star(x,y+Math.sin(t*1.2+i)*8,r,t*.6+i,i%3?'#fff':SUN,.2+.2*Math.sin(t*2+i*1.7)**2);
  // through the mirror: the bathroom, and the one who took Bo's place
  const lo=t>=C.lightoff,wk=seg(t,C.n05e,C.lightoff+1.6);
  const o2={x:lerp(600,150,ease(wk)),y:FLOOR,face:wk>0?-1:1,flip:1,smile:.3,brow:0,open:1,look:[wk>0?-1:1,0],aL:wk>0?8:104+10*Math.sin(t*15),aR:8,brushL:wk>0?0:1,s:1};
  if(wk>0&&wk<1){o2.walk=t*7;o2.bob=-Math.abs(Math.sin(t*7))*6}
  g+=`<g clip-path="url(#mc2)"><rect x="290" y="150" width="620" height="770" fill="#fff0d9"/>${tiles(290,560,620,345,'#c5ece3','#a3dccf')}<rect x="290" y="${FLOOR}" width="620" height="20" fill="#cbbdf0"/><g transform="translate(330,0)">${VANITY}</g>${wallClock(470,290,56,t,false)}${wk<1?char(o2):''}${SHINE(600)}<rect x="290" y="150" width="620" height="770" fill="#0d0b1f" opacity="${lo?.82:.12}"/></g>`+MIRROR_FRAME(290)+cracks(660,440,'mc2',.9);
  // backwards clock + water falling upward (the rules of this place)
  g+=`<g transform="translate(1180,320)"><circle r="92" fill="#e9e9f2" stroke="${OUT}" stroke-width="6"/>`;
  [['12',0,-58],['9',62,10],['6',0,74],['3',-62,10]].forEach(([s,x,y])=>g+=`<text x="${x}" y="${y}" font-size="34" text-anchor="middle" fill="${HEAD}">${s}</text>`);
  g+=`<line x1="0" y1="0" x2="0" y2="-62" stroke="${CORAL}" stroke-width="8" stroke-linecap="round" transform="rotate(${n(-t*150)})"/><line x1="0" y1="0" x2="0" y2="-40" stroke="${HEAD}" stroke-width="10" stroke-linecap="round" transform="rotate(${n(-t*14-40)})"/><circle r="9" fill="${HEAD}"/></g>`;
  for(let i=0;i<8;i++){const u=(t*.85+i/8)%1;g+=`<circle cx="${n(1670+Math.sin(u*9+i)*16)}" cy="${n(596-u*370)}" r="${n(13*(1-u*.5))}" fill="#9be7ff" stroke="#fff" stroke-width="3" opacity="${n(1-u*u)}"/>`}
  // Bo
  const pd=pulse(t,C.act1-.2,V.n04.s+2.2,.4),tr=es(t,V.b1.s-.5,V.b1.s)*(1-es(t,V.b2.s-.3,V.b2.s))+es(t,V.b3.s-.3,V.b3.s);
  const a4=t>=C.act4-.01;
  const bo={x:1010,y:FLOOR,face:lerp(-1,1,cl(tr)),aL:8,aR:8,smile:-.3,brow:.9,open:blink(t,.4),mouth:boTalk(t),look:[lerp(-.8,.8,cl(tr)),0],bob:0,tilt:0,s:1};
  bo.aL+=pd*(92+34*Math.sin(t*10));bo.aR+=pd*(60+34*Math.sin(t*10+PI));bo.bob-=pd*Math.abs(Math.sin(t*10))*8;bo.tilt=-pd*5;bo.mouth=Math.max(bo.mouth,pd*(.4+.4*Math.abs(Math.sin(t*5))));
  const sl=es(t,V.n04.s+2.2,V.n04.e);bo.aL+=sl*(1-es(t,C.lightoff,C.lightoff+1))*70;bo.brow=lerp(bo.brow,.3,sl);
  bo.aL+=pulse(t,V.b2.s-.1,V.b2.e+.3,.2)*86;
  bo.brow-=pulse(t,V.b3.s-.1,V.b3.e+.2,.2)*1.4;
  const sink=es(t,V.o3.s+2,V.n06.e);bo.tilt+=sink*4;if(sink>.5&&!a4)bo.look=[.2,.8];
  if(a4){bo.face=1;bo.look=[.8,0];bo.brow=-.5+pulse(t,V.b5.s,V.b5.e,.2)*-.6;bo.tilt=0;
    const r=seg(t,C.run,C.run+1.1);if(r>0){bo.x=lerp(1010,2150,r*r);bo.walk=t*13;bo.tilt=10;bo.aL=60+50*Math.sin(t*13);bo.aR=60-50*Math.sin(t*13)}}
  const ob={x:1390,y:FLOOR,face:-1,aL:8,aR:8,smile:.5,brow:-.2,open:blink(t,1.7),mouth:obTalk(t),look:[-.6,0],bob:0,tilt:0,sw:CORAL,sc:TEAL};
  ob.aL+=pulse(t,V.o2.s+.4,V.o2.e,.4)*70;
  if(a4){ob.aR+=pulse(t,V.o5.s+1.2,C.run+1.5,.4)*112;ob.smile=.9;if(t>C.run){ob.face=1;ob.look=[1,0]}}
  return g+char(ob)+char(bo);
}

/* ---------- B: every shining thing is a window ---------- */
function otherBo(o){return char(Object.assign({face:1,flip:1,smile:.3,open:1,look:[.6,0],s:1},o))}
function windowsScene(t){
  let g=`<rect width="1920" height="1080" fill="#0d0a26"/>`+farMirrors(t,.35);
  const a1=es(t,C.act3+.2,C.act3+1.4),a2=es(t,C.spoon,C.spoon+1.2),a3=es(t,C.window,C.window+1.2);
  // 1. hallway mirror
  const wx=lerp(160,470,seg(t,C.act3+.8,C.act3+7));
  g+=`<defs><clipPath id="v1"><rect x="200" y="150" width="380" height="560" rx="18"/></clipPath><clipPath id="v2"><ellipse cx="900" cy="350" rx="200" ry="260"/></clipPath><clipPath id="v3"><rect x="1230" y="130" width="590" height="560" rx="12"/></clipPath></defs>`;
  g+=`<g opacity="${n(a1)}"><g clip-path="url(#v1)"><rect x="200" y="150" width="380" height="560" fill="#f3e3c8"/><rect x="200" y="560" width="380" height="150" fill="#d8b98a"/><g transform="translate(0,-170) scale(1)">${otherBo({x:wx,y:FLOOR-30,s:.82,walk:t*7,bob:-Math.abs(Math.sin(t*7))*5})}</g><polygon points="300,150 370,150 250,710 180,710" fill="#fff" opacity=".14"/></g><rect x="200" y="150" width="380" height="560" rx="18" fill="none" stroke="#f6c453" stroke-width="16"/><rect x="200" y="150" width="380" height="560" rx="18" fill="none" stroke="${OUT}" stroke-width="4"/></g>`;
  // 2. the spoon
  const eat=.5+.5*Math.sin((t-C.spoon)*2.4);
  g+=`<g opacity="${n(a2)}"><rect x="878" y="590" width="44" height="330" rx="20" fill="#b9c0d0" stroke="${OUT}" stroke-width="5"/><g clip-path="url(#v2)"><ellipse cx="900" cy="350" rx="200" ry="260" fill="#efe6d6"/><rect x="700" y="470" width="400" height="160" fill="#c98a55"/>${otherBo({x:900,y:650,s:.8,face:.5,aL:88+eat*60,aR:8,brushL:0,look:[.2,.3]})}<rect x="700" y="486" width="400" height="140" fill="#b97a48"/><ellipse cx="930" cy="500" rx="70" ry="18" fill="#fdfdff" stroke="${OUT}" stroke-width="4"/><ellipse cx="830" cy="230" rx="60" ry="110" fill="#fff" opacity=".2"/></g><ellipse cx="900" cy="350" rx="200" ry="260" fill="none" stroke="#b9c0d0" stroke-width="18"/><ellipse cx="900" cy="350" rx="200" ry="260" fill="none" stroke="${OUT}" stroke-width="4"/></g>`;
  // 3. the kitchen window: his mother, and the one she is holding
  const sm=es(t,C.smile,C.smile+.5);
  g+=`<g opacity="${n(a3)}"><g clip-path="url(#v3)"><rect x="1230" y="130" width="590" height="560" fill="#ffe9c2"/><rect x="1230" y="540" width="590" height="150" fill="#e0b98a"/><rect x="1250" y="170" width="150" height="190" rx="8" fill="#d99a5b" stroke="${OUT}" stroke-width="4"/><rect x="1660" y="170" width="140" height="190" rx="8" fill="#d99a5b" stroke="${OUT}" stroke-width="4"/>`;
  g+=otherBo({x:1620,y:760,s:.9,face:-.25,smile:sm>0?1.1:.2,look:[lerp(-.8,-.1,sm),lerp(0,.25,sm)],brow:-sm*.5,aL:60,aR:8});
  g+=char({x:1470,y:800,s:1.2,face:0,back:1,bun:1,hg:'hg3',hc:'#5b3a6e',sw:PLUM,sc:'#f6c453',aL:20,aR:62});
  g+=`<polygon points="1330,130 1420,130 1300,690 1210,690" fill="#fff" opacity=".12"/></g><rect x="1230" y="130" width="590" height="560" rx="12" fill="none" stroke="#e9e6ff" stroke-width="18"/><rect x="1230" y="130" width="590" height="560" rx="12" fill="none" stroke="${OUT}" stroke-width="4"/><rect x="1205" y="686" width="640" height="26" rx="8" fill="#e9e6ff" stroke="${OUT}" stroke-width="4"/></g>`;
  // Bo and Ob, watching from the dark
  const mv=es(t,C.window-.5,C.window+1.5),dn=es(t,C.smile+.6,C.smile+2.4);
  const bo={x:lerp(700,1090,mv),y:1175,s:1.05,face:1,aL:8,aR:8+mv*(150-dn*105),smile:-.4,brow:lerp(.8,.2,dn),open:blink(t,.4),look:[.7,lerp(-.7,-.3,dn)],tilt:dn*3};
  if(mv>0&&mv<1)bo.walk=t*6;
  const ob={x:lerp(430,560,mv),y:1175,s:1.05,face:1,aL:8,aR:8,smile:.6,brow:-.2,open:blink(t,1.7),look:[.7,-.5],sw:CORAL,sc:TEAL};
  return g+char(ob)+char(bo);
}

/* ---------- C: the hall of mirrors ---------- */
const GLOWX=5380;
function hall(sc,t,o){
  let g=`<rect width="1920" height="1080" fill="${DARK}"/>`;
  for(let i=0;i<60;i++){const x=((i*263-sc*.35)%2400+2400)%2400-200,y=60+(i*97)%330,w=44+(i*13)%30;g+=`<line x1="${n(x+w/2)}" y1="0" x2="${n(x+w/2)}" y2="${y}" stroke="#3a3470" stroke-width="2"/><rect x="${n(x)}" y="${y}" width="${w}" height="${n(w*1.4)}" rx="4" fill="#1b1645" stroke="#6b5a2a" stroke-width="3"/>`}
  g+=`<rect x="0" y="${FLOOR}" width="1920" height="175" fill="#0c0922"/><rect x="0" y="${FLOOR}" width="1920" height="6" fill="#2a2360"/>`;
  for(let k=Math.floor((sc-400)/520);k<=Math.floor((sc+2200)/520);k++){
    const wx=k*520+180,x=wx-sc,glow=Math.abs(wx-GLOWX)<10,y=250+((k*37)%3)*24;
    if(wx>GLOWX+300)continue;
    g+=`<line x1="${n(x+150)}" y1="0" x2="${n(x+150)}" y2="${y}" stroke="#4a4390" stroke-width="4"/>`;
    if(glow){g+=`<ellipse cx="${n(x+150)}" cy="${y+230}" rx="520" ry="520" fill="url(#spill)" opacity="${n(.55+.08*Math.sin(t*3))}"/><rect x="${n(x)}" y="${y}" width="300" height="640" rx="16" fill="url(#glass)"/><polygon points="${n(x+70)},${y} ${n(x+150)},${y} ${n(x+50)},${y+640} ${n(x-30)},${y+640}" fill="#fff" opacity=".3" clip-path="inset(0)"/>`}
    else{const occ=(k*7+3)%5!==0;g+=`<rect x="${n(x)}" y="${y}" width="300" height="440" rx="16" fill="#191443"/>`;
      if(occ){const sw=Math.sin(t*1.1+k)*6;g+=`<g opacity=".9"><circle cx="${n(x+150+sw)}" cy="${y+170}" r="74" fill="#0e0b2c"/><rect x="${n(x+98+sw)}" y="${y+236}" width="104" height="204" rx="40" fill="#0e0b2c"/><circle cx="${n(x+126+sw)}" cy="${y+164}" r="9" fill="#e9e6ff" opacity="${n(.5+.3*Math.sin(t*2+k))}"/><circle cx="${n(x+174+sw)}" cy="${y+164}" r="9" fill="#e9e6ff" opacity="${n(.5+.3*Math.sin(t*2+k))}"/></g>`}}
    g+=`<rect x="${n(x)}" y="${y}" width="300" height="${glow?640:440}" rx="16" fill="none" stroke="#f6c453" stroke-width="${glow?18:12}" opacity="${glow?1:.55}"/><rect x="${n(x)}" y="${y}" width="300" height="${glow?640:440}" rx="16" fill="none" stroke="${OUT}" stroke-width="4"/>`;
  }
  return g+(o.hide?'':char(o.bo));
}
function hallRun(t){
  const u=seg(t,C.run,C.found+1.2),e=1-(1-u)*(1-u),sc=lerp(0,GLOWX-1050,e),moving=u<1;
  const bo={x:700,y:FLOOR,face:1,aL:8,aR:8,smile:-.3,brow:.8,open:blink(t,.4),look:[.8,0],s:1,tilt:0,bob:0,mouth:0};
  if(moving){const sp=13*(1-u*.4);bo.walk=t*sp;bo.tilt=10*(1-u*.5);bo.aL=60+50*Math.sin(t*sp);bo.aR=60-50*Math.sin(t*sp);bo.bob=-Math.abs(Math.sin(t*sp))*10;bo.mouth=.3}
  else{bo.bob=Math.sin(t*5)*5;bo.mouth=.25+.2*Math.abs(Math.sin(t*5));bo.look=[.9,-.1]}
  const p=seg(t,C.push,C.push+1.3);bo.aR+=es(t,C.push-.9,C.push)*88;
  let ex='';
  if(p>0){bo.x=lerp(700,1150,ease(p));bo.s=lerp(1,.75,p);bo.walk=t*6;for(let i=0;i<3;i++){const r=cl(p*1.3-i*.15)*420;if(r>0)ex+=`<circle cx="1080" cy="560" r="${n(r)}" fill="none" stroke="#fff" stroke-width="${n(12*(1-p))}" opacity="${n(1-p)}"/>`}}
  const c=Math.floor(52*seg(t,C.run,C.push+.2)),cs='0:'+String(c).padStart(2,'0');
  return hall(sc,t,{bo,hide:p>.85})+ex+`<g opacity="${n(es(t,C.run+.2,C.run+.7))}"><rect x="1560" y="70" width="290" height="120" rx="20" fill="#05040f" opacity=".7"/><text x="1705" y="160" font-size="92" text-anchor="middle" fill="${t>=C.push+.2?'#ffe14d':'#fff'}" letter-spacing="4">${cs}</text></g>`;
}
function teaser(t){
  const u=seg(t,0,V.n02.s-.2),sc=lerp(GLOWX-2700,GLOWX-1050,1-(1-u)*(1-u)),sp=13;
  const bo={x:700,y:FLOOR,face:1,smile:-.3,brow:.8,open:1,look:[.8,0],s:1,walk:u<1?t*sp:null,tilt:u<1?10:0,aL:u<1?60+50*Math.sin(t*sp):8,aR:u<1?60-50*Math.sin(t*sp):8+es(t,V.n02.s-.2,V.n02.s+.5)*88,bob:u<1?-Math.abs(Math.sin(t*sp))*10:0,mouth:.3};
  const p=es(t,V.n02.s+.4,V.n02.e+.3);bo.x=lerp(700,930,p);
  let ex='';if(p>0)for(let i=0;i<3;i++){const r=cl(p*1.3-i*.15)*380;if(r>0)ex+=`<circle cx="1080" cy="560" r="${n(r)}" fill="none" stroke="#fff" stroke-width="${n(12*(1-p))}" opacity="${n(1-p)}"/>`}
  return hall(sc,t,{bo})+ex;
}

/* ---------- D: the wrong house ---------- */
const BED=`<g><rect x="1210" y="700" width="400" height="205" rx="18" fill="#8fb4e8" stroke="${OUT}" stroke-width="5"/><rect x="1210" y="770" width="400" height="135" rx="14" fill="#ffd3e0" stroke="${OUT}" stroke-width="5"/><rect x="1450" y="676" width="150" height="76" rx="26" fill="#fff" stroke="${OUT}" stroke-width="5"/><rect x="1580" y="610" width="40" height="295" rx="12" fill="#a06a40" stroke="${OUT}" stroke-width="5"/></g>`;
const BG4=`<rect width="1920" height="1080" fill="#e9f2dc"/><rect x="0" y="560" width="1920" height="345" fill="#bcd9a8"/><rect x="0" y="548" width="1920" height="16" fill="#9cc487"/>
<rect x="0" y="${FLOOR}" width="1920" height="175" fill="#dcae7e"/><rect x="0" y="${FLOOR}" width="1920" height="10" fill="#bf8f5f"/>
<g transform="translate(1060,0)">${WINDOW(false)}</g>
${[[1000,470],[1130,500],[1560,470],[960,150],[1560,90]].map(([x,y],i)=>star(x,y,20,i,i%2?'#ffb3c7':SUN,.9)).join('')}
<ellipse cx="1150" cy="975" rx="420" ry="50" fill="#ffb3c7"/>`;
function girl(o){return char(Object.assign({hg:'hg2',hc:'#6a2d5f',sw:SUN,sc:PLUM,bow:1},o))}
function bedroom(t){
  let g=BG4+wallClock(1010,240,62,t,true)+BED;
  // the door
  const dop=es(t,C.door+.5,C.door+2.2),hr=es(t,C.door,C.door+.5);
  g+=`<rect x="1650" y="270" width="230" height="640" fill="#fff3c4"/>`;
  if(dop>0)g+=`<g opacity="${n(es(t,C.door+1,C.door+2.4))}"><circle cx="1765" cy="430" r="70" fill="#1b1936"/><rect x="1700" y="486" width="130" height="430" rx="46" fill="#1b1936"/><circle cx="1765" cy="352" r="30" fill="#1b1936"/></g><polygon points="1650,905 1880,905 ${n(1880-dop*900)},1080 ${n(1650-dop*1100)},1080" fill="#1b1936" opacity="${n(dop*.35)}"/>`;
  g+=`<rect x="${n(1650+dop*150)}" y="270" width="${n(230-dop*150)}" height="640" fill="#9a6642" stroke="${OUT}" stroke-width="5"/><g transform="translate(${n(1682+dop*150)},610) rotate(${n(hr*35)})"><rect x="-8" y="-8" width="46" height="16" rx="8" fill="#f6c453" stroke="${OUT}" stroke-width="4"/></g><rect x="1638" y="258" width="254" height="664" fill="none" stroke="#7a4d30" stroke-width="16"/>`;
  // the mirror he came out of
  const dk=es(t,C.thud-.2,C.thud+.3),obIn=es(t,C.act6-.2,C.act6+1);
  g+=`<g clip-path="url(#mc2)"><rect x="290" y="150" width="620" height="770" fill="url(#glass)"/><rect x="290" y="560" width="620" height="360" fill="#cfe6c2" opacity=".7"/><rect x="290" y="150" width="620" height="770" fill="#211b4d" opacity="${n(dk*.93)}"/>`;
  if(dk>0){const pb=10,hit=Math.abs(Math.sin(t*pb));
    g+=`<g opacity="${n(dk)}">${farMirrors(t,.25)}<g opacity="${n(obIn)}">${char({x:440,y:FLOOR,face:1,sw:CORAL,sc:TEAL,smile:.7,brow:-.2,open:blink(t,1.7),mouth:obTalk(t),look:[.8,0]})}</g>${girl({x:700,y:FLOOR,face:1,aL:60+40*Math.sin(t*pb+PI),aR:96+34*Math.sin(t*pb),mouth:.5+.4*hit,brow:1.2,smile:-.5,open:1.1,look:[.9,0],bob:-hit*8,tilt:4})}</g>`}
  g+=SHINE(600)+`</g>`+MIRROR_FRAME(290);
  // Bo, turned around
  const out=es(t,C.act5-.2,C.act5+.9),lg=pulse(t,C.laugh,C.laugh+1.3,.2),ck=es(t,C.clock,C.clock+.4)*(1-es(t,C.hand-.3,C.hand)),hd=es(t,C.hand,C.hand+.7)*(1-es(t,C.thud-.1,C.thud+.1));
  const tn=es(t,C.thud,C.thud+.25),dr=es(t,C.steps,C.steps+.5);
  const bo={x:lerp(900,1010,out),y:FLOOR,face:lerp(1,-1,tn),flip:1,aL:8,aR:8,smile:lerp(-.1,.7,es(t,V.n14.s+3,V.n14.e))*(1-ck),brow:.4,open:blink(t,.4),mouth:boTalk(t),look:[lerp(.6,-.9,tn),0],bob:Math.sin(t*4)*4*(1-es(t,C.laugh,C.laugh+1)),tilt:0,s:lerp(.9,1,out)};
  bo.mouth=Math.max(bo.mouth,lg*(.4+.4*Math.abs(Math.sin(t*9))));bo.bob-=lg*Math.abs(Math.sin(t*9))*8;if(lg>.1)bo.smile=1;
  if(ck>.05){bo.look=[.3,-1*ck];bo.head=-6*ck;bo.brow=lerp(.4,.9,ck)}
  if(hd>.05){bo.aL+=hd*100;bo.look=[-.9,.35];bo.brow=1;bo.smile=-.3}
  if(tn>0){bo.brow=1.1;bo.smile=-.5;bo.x+=tn*40;bo.bob-=pulse(t,C.thud,C.thud+.3,.1)*26;bo.aL+=tn*26;bo.aR+=tn*26}
  bo.brow-=pulse(t,V.b7.s-.1,V.b7.e+.2,.2)*1.6;bo.aL+=pulse(t,V.b7.s-.1,V.b7.e+.2,.2)*70;
  if(dr>0){bo.face=lerp(-1,1,dr);bo.look=[lerp(-.9,1,dr),0];bo.tilt=-dr*3}
  return g+char(bo);
}

/* ---------- camera, overlays ---------- */
const KA=[[C.act1,760,520,1.18],[V.n04.s,760,520,1.18],[V.n04.s+1.5,640,500,1.5],[C.lightoff+.5,640,500,1.5],[V.b1.s,1100,520,1.15],[V.o3.s,1150,520,1.2],[V.n06.s,1040,500,1.45],[C.act3,1040,500,1.5]];
const KB=[[C.act3,390,430,1.5],[C.spoon-.6,390,430,1.6],[C.spoon+.5,900,400,1.6],[C.window-.6,900,400,1.7],[C.window+.6,1520,420,1.5],[C.smile-.2,1520,420,1.55],[C.smile+.5,1590,360,2.15],[C.smile+2,1590,360,2.2],[V.n10.s+.5,1330,600,1.15],[C.act4,1330,600,1.2]];
const KA2=[[C.act4,1200,520,1.2],[C.run,1200,520,1.24],[C.run+1.2,1300,540,1.1]];
const KD=[[C.act5,960,540,1.12],[C.laugh,1000,540,1.05],[C.clock,1000,540,1.05],[C.clock+.6,1040,340,1.6],[C.hand-.2,1040,340,1.6],[C.hand+.5,980,520,1.5],[C.thud-.1,980,520,1.5],[C.thud+.3,760,520,1.22],[C.act6,760,520,1.22],[V.b6.s,740,520,1.3],[C.steps,740,520,1.32],[C.steps+.8,1300,540,1.08],[C.door,1400,540,1.12],[D.total,1500,560,1.28]];
function cam(K,t){let i=0;while(i<K.length-1&&t>K[i+1][0])i++;const a=K[i],b=K[Math.min(i+1,K.length-1)],u=es(t,a[0],b[0]>a[0]?b[0]:a[0]+1);const z=lerp(a[3],b[3],u);let cx=lerp(a[1],b[1],u),cy=lerp(a[2],b[2],u);cx=cl(cx,960/z,1920-960/z);cy=cl(cy,540/z,1080-540/z);return `translate(960,540) scale(${z.toFixed(4)}) translate(${n(-cx)},${n(-cy)})`}
const HOOK=[['n01',0,2.9,'THERE ARE TWO WAYS','OUT OF A MIRROR.'],['n01',3.0,99,'BO FOUND THE FIRST ONE','IN UNDER A MINUTE.'],['n02',0,99,'IT WAS','THE WRONG ONE.']];
function hookCaps(t){
  if(t>=C.title+1.9)return '';
  let g='';
  if(t<C.title){g+=`<rect x="0" y="700" width="1920" height="380" fill="#05040f" opacity=".5"/>`;
    for(const [id,a,b,l1,l2] of HOOK){const r=t-V[id].s;if(r>=a&&r<b&&t<V[id].e+.35){const k=.9+.1*es(r,a,a+.18),T=(y,txt,c)=>`<text x="0" y="${y}" font-size="108" text-anchor="middle" fill="${c}" stroke="#05040f" stroke-width="22" paint-order="stroke" stroke-linejoin="round" letter-spacing="3">${txt}</text>`;
      g+=`<g transform="translate(960,860) scale(${n(k)})">${T(-20,l1,'#ffffff')}${T(110,l2,'#ffe14d')}</g>`}}
    return g+`<rect width="1920" height="1080" fill="#000" opacity="${n(1-es(t,0,.3))}"/>`}
  return g;
}
function cornerTitle(t){const a=pulse(t,C.act1+.2,C.act1+6,.6);if(a<=0)return '';
  return `<g opacity="${n(a)}"><rect x="50" y="46" width="560" height="74" rx="16" fill="#05040f" opacity=".6"/><text x="80" y="98" font-size="44" fill="#e9e6ff" letter-spacing="3">BO &amp; OB <tspan fill="#f6c453">· EPISODE 2</tspan></text></g>`}
function endcard(t){const a=es(t,C.end,C.end+.5);if(a<=0)return '';
  return `<g opacity="${n(a)}"><rect width="1920" height="1080" fill="#08071a" opacity=".94"/><text x="960" y="520" font-size="190" text-anchor="middle" fill="#e9e6ff" letter-spacing="8">Bo &amp; Ob</text><text x="960" y="640" font-size="54" text-anchor="middle" fill="#f6c453" letter-spacing="5">TO BE CONTINUED</text></g>`}
const CUTS=[C.act1,C.act3,C.act4,C.act5];
window.renderAt=function(t){
  let g=DEFS,s;
  if(t<C.act1)s=`<g>${teaser(t)}</g>`;
  else if(t<C.act3)s=`<g transform="${cam(KA,t)}">${glassRoom(t)}</g>`;
  else if(t<C.act4)s=`<g transform="${cam(KB,t)}">${windowsScene(t)}</g>`;
  else if(t<C.run+1.2)s=`<g transform="${cam(KA2,t)}">${glassRoom(t)}</g>`;
  else if(t<C.act5)s=`<g>${hallRun(t)}</g>`;
  else s=`<g transform="${cam(KD,t)}">${bedroom(t)}</g>`;
  g+=s;
  let bl=0;for(const c of CUTS)bl=Math.max(bl,1-Math.abs(t-c)/.35);
  bl=Math.max(bl,es(t,C.title,C.title+.12)*(1-es(t,C.act1-.35,C.act1+.35)),es(t,C.push+1.1,C.black2)*(t<C.act5?1:0));
  const fl=pulse(t,C.act5,C.act5+.9,.3)*.7;
  g+=`<rect width="1920" height="1080" fill="#05040f" opacity="${n(cl(bl))}"/><rect width="1920" height="1080" fill="#fff" opacity="${n(fl)}"/><rect width="1920" height="1080" fill="url(#vig)"/>`;
  g+=hookCaps(t)+cornerTitle(t)+endcard(t);
  g+=`<rect width="1920" height="1080" fill="#000" opacity="${n(es(t,D.total-.7,D.total-.1))}"/>`;
  document.getElementById('s').innerHTML=g;
};
window.DATA={fps:D.fps,total:D.total};
window.ready=document.fonts.load('600 40px Fredoka').then(()=>{renderAt(+(new URLSearchParams(location.search).get('t')||0));return true});
