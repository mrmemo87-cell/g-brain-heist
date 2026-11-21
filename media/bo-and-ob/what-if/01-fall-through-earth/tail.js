/* What if you fell through the Earth? (standalone explainer Short) */
const bo=u=>{u=cl(u);return 1+2.70158*Math.pow(u-1,3)+1.70158*Math.pow(u-1,2)};
const POP=(txt,x,y,size,c,t,t0,rot=0)=>{if(t<t0)return '';const k=bo((t-t0)/.35);return `<g transform="translate(${x},${y}) rotate(${rot}) scale(${n(k)})">${TXT(0,0,txt,size,c)}</g>`};
const LAYER=[[35,'#8a6a4c','#5a4532','CRUST'],[2891,'#d9542b','#a83a1c','MANTLE'],[5150,'#ff9a2b','#e06a10','OUTER CORE'],[6371,'#ffe14d','#ffb31a','INNER CORE']];
const layerAt=d=>{const q=d>6371?12742-d:d;return LAYER.find(l=>q<=l[0])||LAYER[3]};
// mission clock (seconds of the real fall) against video time
const MK=()=>[[C.fall,0],[V.n04.s+.6,60],[V.n05.s+.8,780],[V.n06.s+1.2,1146],[V.n07.s+.2,1146],[V.n08.s+.6,1900],[V.n09.s,2291]];
const lin=(k,t)=>{if(t<=k[0][0])return k[0][1];for(let i=0;i<k.length-1;i++)if(t<=k[i+1][0])return lerp(k[i][1],k[i+1][1],(t-k[i][0])/Math.max(.001,k[i+1][0]-k[i][0]));return k[k.length-1][1]};
const vel=m=>{const a=m<=1146?m:2292-m;return a<=780?9.8*a:lerp(7644,8050,(a-780)/366)};
const dist=m=>{const a=m<=1146?m:2292-m;const d=a<=780?.5*9.8*a*a/1000:lerp(2981,6371,(a-780)/366);return m<=1146?d:12742-d};
function scroll(t){let s=0;for(let x=C.fall;x<t;x+=.04)s+=vel(lin(MK(),x))/8050*.04;return s}
const mmss=m=>{m=Math.round(m);return String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0')};
const chip=(x,y,w,label,val,c)=>`<g transform="translate(${x},${y})"><rect x="0" y="0" width="${w}" height="104" rx="18" fill="#05040f" opacity=".78"/><text x="${w/2}" y="34" font-size="26" text-anchor="middle" fill="#9aa0b5" letter-spacing="3">${label}</text>${TXT(w/2,86,val,46,c)}</g>`;
function stars(t){let g='';for(let i=0;i<60;i++){const x=(i*137)%1080,y=(i*251)%1920,a=.3+.7*Math.abs(Math.sin(t*1.5+i));g+=`<circle cx="${x}" cy="${y}" r="${1.5+i%3}" fill="#fff" opacity="${n(a*.7)}"/>`}return g}
function earth(cx,cy,R,t,hole,o={}){
  let g=`<defs><clipPath id="ec"><circle cx="${cx}" cy="${cy}" r="${R}"/></clipPath><radialGradient id="atm"><stop offset=".85" stop-color="#5ff2e6" stop-opacity="0"/><stop offset="1" stop-color="#5ff2e6" stop-opacity=".35"/></radialGradient></defs><circle cx="${cx}" cy="${cy}" r="${R*1.08}" fill="url(#atm)"/>`;
  const rr=[1,.996,.546,.192].map(f=>R*f);// crust/mantle, outer core (3480 km), inner core (1220 km)
  g+=`<g clip-path="url(#ec)"><circle cx="${cx}" cy="${cy}" r="${R}" fill="#2f7fd6"/>`;
  // drifting continents on the near half
  for(let i=0;i<5;i++){const x=cx-R+((t*40+i*260)%(2*R+300))-150,y=cy-R*.7+(i*97)%(R*1.4);g+=`<ellipse cx="${n(x)}" cy="${n(y)}" rx="${80+i*14}" ry="${50+i*9}" fill="#4caf6a"/>`}
  g+=`</g>`;
  // cutaway: the right half shows the layers
  const cut=o.cut==null?1:o.cut;
  if(cut>0){g+=`<g opacity="${n(cut)}"><defs><clipPath id="half"><rect x="${cx}" y="${cy-R}" width="${R}" height="${2*R}"/></clipPath></defs><g clip-path="url(#half)"><circle cx="${cx}" cy="${cy}" r="${R}" fill="#8a6a4c"/><circle cx="${cx}" cy="${cy}" r="${R*.97}" fill="#d9542b"/><circle cx="${cx}" cy="${cy}" r="${R*.546}" fill="#ff9a2b"/><circle cx="${cx}" cy="${cy}" r="${R*.192*(1+.03*Math.sin(t*4))}" fill="#ffe14d"/></g></g>`}
  if(hole>0)g+=`<line x1="${cx}" y1="${cy-R}" x2="${cx}" y2="${n(cy-R+2*R*hole)}" stroke="#05040f" stroke-width="${R*.07}" stroke-linecap="round"/>`;
  if(o.dot!=null)g+=`<circle cx="${cx}" cy="${n(cy-R+2*R*o.dot)}" r="${R*.09}" fill="#ff5fa2" stroke="#fff" stroke-width="${R*.025}"/>`;
  return g+`<circle cx="${cx}" cy="${cy}" r="${R}" fill="none" stroke="#05040f" stroke-width="${R*.02}"/>`}
const PLANE=(x,y,s)=>`<g transform="translate(${n(x)},${n(y)}) scale(${s}) rotate(-90)"><path d="M -90 0 Q -60 -14 70 -10 Q 96 0 70 10 Q -60 14 -90 0 Z" fill="#e9e6ff" stroke="${OUT}" stroke-width="5"/><path d="M 0 -8 L -30 -70 L -10 -70 L 30 -8 Z M 0 8 L -30 70 L -10 70 L 30 8 Z M -80 -4 L -96 -34 L -84 -34 L -66 -4 Z" fill="#cfd3e6" stroke="${OUT}" stroke-width="5"/></g>`;
window.renderAt=function(t){
  let g=DEFS+`<rect width="1080" height="1920" fill="#0b0826"/>`+stars(t),hud='';
  const m=lin(MK(),t),v=vel(m),d=dist(m);
  if(t<C.poll){ // the hole is dug
    const hole=es(t,V.n01.s+.4,V.n01.s+3.2),z=1+.08*Math.sin(t*.8);
    g+=`<g transform="translate(540,1000) rotate(${n(Math.sin(t*.6)*3)}) scale(${n(z)}) translate(-540,-1000)">`+earth(540,1000,400,t,hole)+`</g>`;
    g+=`<g transform="translate(540,${n(560+Math.sin(t*3)*6)}) scale(.55)">`+char({x:0,y:0,face:0,aL:60+20*Math.sin(t*4),aR:60-20*Math.sin(t*4),smile:.4,brow:.3,open:blink(t,.4),look:[0,.8]})+`</g>`;
  }else if(t<C.fall){ // guess first
    const u=t-C.poll;
    g+=`<g opacity=".35">`+earth(540,1000,400,t,1)+`</g>`;
    const OPT=[['A','42 SECONDS','#5ff2e6'],['B','38 MINUTES','#ffe14d'],['C','3 DAYS','#ff5fa2']];
    OPT.forEach(([k,txt,c],i)=>{const a=bo((u-i*.15)/.45),x=lerp(1400,540,a),w=Math.sin(t*5+i)*4;
      g+=`<g transform="translate(${n(x)},${700+i*190}) rotate(${n(w)})"><rect x="-380" y="-70" width="760" height="140" rx="34" fill="#fff" stroke="${OUT}" stroke-width="8"/><circle cx="-300" cy="0" r="48" fill="${c}" stroke="${OUT}" stroke-width="6"/>${TXT(-300,18,k,54,OUT)}${TXT(40,22,txt,64,OUT)}</g>`});
    const cd=t-V.n02.e;if(cd>0){const num=Math.max(1,3-Math.floor(cd/1.05)),f=(cd/1.05)%1,k=1.3-.3*es(f,0,.3);
      g+=`<g transform="translate(540,1330)"><circle r="96" fill="#05040f" opacity=".8"/><circle r="96" fill="none" stroke="#ffe14d" stroke-width="14" stroke-dasharray="${n(603*(1-f))} 603" transform="rotate(-90)"/><g transform="scale(${n(k)})">${TXT(0,36,String(num),110,'#fff')}</g></g>`}
  }else if(t<C.out){ // the fall
    const s=scroll(t),sp=v/8050,L=layerAt(d),core=d>2891&&d<9851;
    const rising=m>1146;
    g+=`<rect width="1080" height="1920" fill="${core?'#3a1406':'#1a0e08'}"/>`;
    if(core)g+=`<circle cx="540" cy="1000" r="${n(700+40*Math.sin(t*3))}" fill="#ff7a1a" opacity=".22"/>`;
    // tunnel walls with rocks streaming past
    for(const side of [0,1]){const x0=side?850:0;g+=`<rect x="${x0}" y="0" width="230" height="1920" fill="${L[1]}"/>`;
      for(let i=0;i<14;i++){const y=((i*170-(rising?-1:1)*s*2600)%2040+2040)%2040-120,xx=x0+30+(i*53)%160;g+=`<ellipse cx="${xx}" cy="${n(y)}" rx="${26+i%4*10}" ry="${16+i%3*6}" fill="${L[2]}"/>`}}
    // speed lines
    const nl=Math.round(4+sp*18);for(let i=0;i<nl;i++){const x=250+(i*97)%580,y=((i*311-(rising?-1:1)*s*3800)%2200+2200)%2200-140,len=60+sp*320;g+=`<line x1="${x}" y1="${n(y)}" x2="${x}" y2="${n(y+len)}" stroke="#fff" stroke-width="${3+sp*4}" opacity="${n(.15+sp*.35)}" stroke-linecap="round"/>`}
    // the airliner he overtakes
    const pl=pulse(t,V.n04.s,V.n04.e+.6,.3);if(pl>0){const py=lerp(1500,500,es(t,V.n04.s,V.n04.e+.6));g+=`<g opacity="${n(pl)}">${PLANE(790,py,.9)}${TXT(790,py+150,'JET: 900 KM/H',34,'#fff')}</g>`}
    // Bo, tumbling
    const cen=pulse(t,V.n06.s+1,V.n07.s+.3,.5),rot=rising?Math.sin(t*1.5)*8:Math.sin(t*2.2)*22*(1-cen)+t*40*cen%360;
    const flail=1-cen;
    g+=`<g transform="translate(540,${n(1060+Math.sin(t*5)*10)}) rotate(${n(rot)}) scale(.9)">`+char({x:0,y:180,face:0,aL:lerp(140,95,cen)+flail*25*Math.sin(t*9),aR:lerp(140,95,cen)-flail*25*Math.sin(t*9),smile:lerp(-.4,.9,cen),brow:lerp(1,-.2,cen),open:1.1,look:[Math.sin(t*2)*.3,rising?-.6:.6]})+`</g>`;
    if(cen>0)g+=`<g opacity="${n(cen)}">`+POP('WEIGHT: 0 KG',540,700,84,'#5ff2e6',t,V.n06.s+2.4)+`</g>`;
    const flash=pulse(t,V.n05.s+.6,V.n05.s+1.2,.2);g+=`<rect width="1080" height="1920" fill="#ffb31a" opacity="${n(flash*.5)}"/>`;
    // instruments
    const kmh=Math.round(v*3.6/100)*100;
    hud=chip(40,360,320,'TIME',mmss(m),'#fff')+chip(380,360,320,'SPEED',(kmh>=28800?'29,000+':kmh.toLocaleString('en-US'))+' KM/H',kmh>=28800?'#ff5fa2':'#ffe14d')+chip(720,360,320,'LAYER',L[3],'#5ff2e6');
    hud+=`<g transform="translate(940,610)"><circle r="104" fill="#05040f" opacity=".7"/>`+earth(0,0,90,t,1,{cut:1,dot:d/12742})+`</g>`;
  }else{ // out the other side, and the rest
    const pop=es(t,C.out,C.out+.6);
    g+=SKYG('sk','#3a8de0','#bfe6ff')+`<rect width="1080" height="1920" fill="url(#sk)"/><rect x="0" y="1250" width="1080" height="670" fill="#4caf6a"/><rect x="0" y="1250" width="1080" height="30" fill="#3d8f56"/><ellipse cx="540" cy="1262" rx="110" ry="26" fill="#05040f"/>`;
    for(let i=0;i<4;i++)g+=`<ellipse cx="${n((t*30+i*330)%1400-160)}" cy="${560+i*90}" rx="${110+i*20}" ry="40" fill="#fff" opacity=".85"/>`;
    const tw=t>=V.n10.s,slip=pulse(t,V.n10.s+1.5,V.n10.e,.6);
    const by=lerp(1500,1290,bo(pop*1.05))+slip*30*Math.abs(Math.sin(t*6));
    g+=`<defs><clipPath id="above"><rect x="0" y="0" width="1080" height="1262"/></clipPath></defs><g clip-path="url(#above)">`+char({x:540,y:by+100,face:0,aL:150,aR:150,smile:tw?-.6:1,brow:tw?1.2:-.3,open:1.05,look:[0,tw?.4:-.3],bob:0})+`</g>`;
    g+=`<g transform="translate(540,1262)"><circle cx="-80" cy="0" r="26" fill="${OUT}"/><circle cx="80" cy="0" r="26" fill="${OUT}"/></g>`;
    // the answer
    const ans=pulse(t,V.n09.s,V.n10.s+.2,.3);if(ans>0)g+=`<g opacity="${n(ans)}">`+POP('38 MINUTES',540,760,150,'#ffe14d',t,V.n09.s,-4)+POP('B WAS RIGHT ✓',540,900,64,'#fff',t,V.n09.s+.5)+`</g>`;
    for(let i=0;i<40&&t>=V.n09.s&&t<V.n10.s+.3;i++){const u=t-V.n09.s,x=540+Math.cos(i*2.4)*u*(260+i*9),y=760+Math.sin(i*2.4)*u*260+u*u*400;g+=`<rect x="${n(x)}" y="${n(y)}" width="18" height="10" fill="${['#ff5fa2','#5ff2e6','#ffe14d'][i%3]}" transform="rotate(${n(u*400+i*30)} ${n(x)} ${n(y)})"/>`}
    // forever: the dot bouncing through the planet
    const fe=pulse(t,V.n10.s+.6,V.n11.s,.4);if(fe>0){const ph=(t-V.n10.s)*1.6,dot=.5-.5*Math.cos(ph*PI);g+=`<g opacity="${n(fe)}"><rect width="1080" height="1920" fill="#05040f" opacity=".55"/>`+earth(540,900,330,t,1,{dot})+POP('∞',540,1400,220,'#ff5fa2',t,V.n10.s+1.4)+`</g>`}
    // as hot as the Sun
    const hot=pulse(t,V.n11.s,V.n12.s+.1,.4);if(hot>0){const h=es(t,V.n11.s+.6,V.n11.s+2.4);g+=`<g opacity="${n(hot)}"><rect width="1080" height="1920" fill="#1a0a05" opacity=".88"/><circle cx="780" cy="820" r="${n(170+10*Math.sin(t*4))}" fill="#ffb31a"/><circle cx="780" cy="820" r="${n(210+14*Math.sin(t*3))}" fill="#ffb31a" opacity=".25"/>${TXT(780,1080,'SUN’S SURFACE',46,'#fff')}`+earth(300,820,170,t,0,{cut:1})+TXT(300,1080,'EARTH’S CORE',46,'#fff')+`<g transform="translate(0,${n(1240)})"><rect x="140" y="0" width="320" height="40" rx="20" fill="#333"/><rect x="140" y="0" width="${n(320*h)}" height="40" rx="20" fill="#ff5f1a"/><rect x="620" y="0" width="320" height="40" rx="20" fill="#333"/><rect x="620" y="0" width="${n(320*h)}" height="40" rx="20" fill="#ff5f1a"/></g>`+POP('≈',540,860,160,'#ffe14d',t,V.n11.s+2.2)+`</g>`}
    // your turn
    const q=es(t,V.n12.s,V.n12.s+.3);if(q>0){g+=`<g opacity="${n(q)}"><rect width="1080" height="1920" fill="#0b0826" opacity="1"/>`+POP('WOULD YOU JUMP?',540,800,96,'#fff',t,V.n12.s);
      [['YES','#4caf6a',330],['NO','#ff2d2d',750]].forEach(([w,c,x],i)=>{const k=bo((t-V.n12.s-.3-i*.15)/.35)*(1+.05*Math.sin(t*6+i*2));if(t>V.n12.s+.3)g+=`<g transform="translate(${x},1050) scale(${n(k)})"><rect x="-150" y="-80" width="300" height="160" rx="40" fill="${c}" stroke="${OUT}" stroke-width="8"/>${TXT(0,28,w,80,'#fff')}</g>`});
      g+=`<g transform="translate(540,${n(1290+Math.sin(t*4)*10)})"><rect x="-380" y="-60" width="760" height="120" rx="34" fill="#fff" stroke="${OUT}" stroke-width="6"/>${TXT(0,20,'TELL ME IN THE COMMENTS',52,OUT)}</g></g>`}
  }
  if(t>=V.n12.s)NOSUB=1;
  frameOut(g,t,'WHAT IF YOU FELL','THROUGH THE EARTH?',hud);NOSUB=0;
};
function endcard(t){const a=es(t,C.end,C.end+.4);if(a<=0)return '';
  return `<g opacity="${n(a)}"><rect width="1080" height="1920" fill="#08071a" opacity=".93"/>${TXT(540,880,'FOLLOW',120,'#fff')}${TXT(540,1010,'FOR MORE WHAT IFs',66,'#ffe14d')}</g>`}
