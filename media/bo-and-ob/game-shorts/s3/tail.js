/* Short 3: You waited 13 years. It waited too. */
window.renderAt=function(t){
  let g=DEFS+`<rect width="1080" height="1920" fill="#d9cdb8"/><rect y="1500" width="1080" height="420" fill="#8a6a50"/>`;
  const night=es(t,V.n05.s,V.n05.e);
  // the calendar, filling up
  const fill=es(t,V.n01.s,V.n03.e),nx=Math.floor(fill*30);
  g+=`<rect x="60" y="420" width="460" height="560" rx="10" fill="#fff8ea" stroke="${OUT}" stroke-width="6"/><rect x="60" y="420" width="460" height="90" fill="#ff5fa2"/>${TXT(290,488,'YEAR '+Math.max(1,Math.ceil(fill*13)),52,'#fff')}`;
  for(let k=0;k<nx;k++){const r=Math.floor(k/6),c=k%6,x=95+c*70,y=560+r*82;g+=`<path d="M ${x} ${y} l 40 40 M ${x+40} ${y} l -40 40" stroke="#c0392b" stroke-width="7" stroke-linecap="round"/>`}
  const hud=`<rect x="300" y="360" width="480" height="90" rx="18" fill="#05040f" opacity=".75"/>`+TXT(540,425,'DAY '+Math.max(1,Math.round(fill*4700)).toLocaleString('en-US'),58,'#ff6b5b');
  // the screen
  let inner='',load=es(t,V.n04.s,V.n04.s+2.5)*.99;
  if(t<V.n04.s){const tr=Math.floor(t*1.4)%3;inner=`<rect x="584" y="544" width="422" height="250" fill="#2a1550"/>`+TXT(795,690,['NEW TRAILER','DELAYED','RUMOUR?'][tr],46,['#5ff2e6','#ff2d2d','#ffe14d'][tr]);}
  else{const app=es(t,V.n06.s+.5,V.n06.s+2);inner=shape({x:795,y:900,s:.5,look:-.6,op:app,eyes:app});}
  g+=TVSET(584,544,422,250,inner,'tv3');
  if(t>=V.n04.s)g+=`<rect x="604" y="808" width="382" height="26" rx="13" fill="#05040f"/><rect x="608" y="812" width="${n(374*load)}" height="18" rx="9" fill="#5ff2e6"/>`+TXT(795,900,'LOADING '+Math.round(load*100)+'%',42,OUT);
  // the clock, racing through the night
  g+=wallClock(900,1100,60,t*(night>0&&night<1?40:1),false);
  g+=`<rect width="1080" height="1920" fill="#0b0826" opacity="${n(night*.45)}"/>`;
  // Bo, and the bar over his head
  const him=es(t,V.n07.s+.2,V.n07.e+.4);
  g+=`<g opacity="${n(1-him)}">${char({x:540,y:1700,s:1.25,face:.5,aL:8,aR:8,smile:-.2,brow:lerp(.6,1.2,es(t,V.n06.s,V.n07.s)),open:blink(t,.4),look:[.6,-.7]})}${PAD(560,1560,1)}</g>`+shape({x:540,y:1700,s:1.25,op:him,eyes:him,look:.3});
  const bar=es(t,V.n06.e,V.n07.e+.3);
  if(bar>0)g+=`<g opacity="${n(cl(bar*4))}"><rect x="340" y="1050" width="400" height="36" rx="18" fill="#05040f"/><rect x="346" y="1056" width="${n(388*bar)}" height="24" rx="12" fill="#ff5fa2"/>${TXT(540,1030,'LOADING BO… '+Math.round(bar*100)+'%',46,'#fff')}</g>`;
  const K=[[0,540,960,1],[V.n02.s,560,860,1.2],[V.n03.s,300,800,1.5],[V.n03.e,300,780,1.6],[V.n04.s,795,700,1.8],[V.n05.e,795,700,2.1],[V.n06.s+.3,795,700,2.5],[V.n06.e-.2,795,700,2.6],[V.n07.s+.3,540,1250,1.05],[V.n07.e,540,1280,1.15]];
  frameOut(`<g transform="${vcam(K,t)}">${g}</g>`,t,'YOU WAITED 13 YEARS.','IT WAITED TOO.',hud);
};
