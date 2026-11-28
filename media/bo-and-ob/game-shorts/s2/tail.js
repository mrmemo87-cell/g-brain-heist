/* Short 2: What if the city never stopped? */
const HERO=560;
window.renderAt=function(t){
  let g=DEFS+`<rect width="1080" height="1920" fill="#0b0826"/>`+CITY(0,360,1080,1080,1,t);
  g+=`<rect x="0" y="1440" width="1080" height="480" fill="#17122e"/>`+[0,1,2,3,4,5].map(i=>`<rect x="${n(((i*220-t*90)%1320+1320)%1320-120)}" y="1640" width="120" height="14" fill="#ffd36b" opacity=".7"/>`).join('');
  // cars driving the same three blocks
  const car=(x,y,c,s=1)=>`<g transform="translate(${n(x)},${y}) scale(${s})"><rect x="-130" y="-40" width="260" height="80" rx="30" fill="${c}"/><rect x="-80" y="-80" width="160" height="60" rx="22" fill="${c}"/><rect x="-62" y="-70" width="56" height="40" rx="8" fill="#0b0826" opacity=".6"/><rect x="8" y="-70" width="56" height="40" rx="8" fill="#0b0826" opacity=".6"/><circle cx="-70" cy="45" r="26" fill="#0a0820"/><circle cx="70" cy="45" r="26" fill="#0a0820"/><circle cx="128" cy="-8" r="10" fill="#ffe14d"/></g>`;
  g+=car(((t*260)%1500)-200,1700,'#5ff2e6')+car(1300-((t*200+700)%1500),1560,'#ff5fa2',.8);
  // the walkers, looping the same pavement
  const stop=C.stop,st=es(t,stop,stop+.6);
  [[0,.5],[1,.55],[2,.5],[3,.52]].forEach(([i,s])=>{const x=((t*70+i*300)%1300)-110;g+=shape({x,y:1520,s,eyes:0,op:.95})});
  const hx=t<stop?HERO+(t-stop)*70:HERO,turn=es(t,stop+.8,stop+1.8);
  g+=shape({x:Math.max(hx,-200),y:1800,s:.85,eyes:turn,look:0,op:1});
  if(turn>0)g+=`<circle cx="${n(HERO-31)}" cy="${n(1800-362*.85-8)}" r="32" fill="#e9e6ff" opacity="${n(turn*.22)}"/><circle cx="${n(HERO+31)}" cy="${n(1800-362*.85-8)}" r="32" fill="#e9e6ff" opacity="${n(turn*.22)}"/>`;
  // the save file
  const sv=pulse(t,V.n05.s+2,V.n05.e+.6,.4);
  if(sv>0)g+=`<g opacity="${n(sv)}"><rect x="330" y="1100" width="460" height="150" rx="20" fill="#05040f" opacity=".82" stroke="#5ff2e6" stroke-width="5"/>${TXT(560,1165,'SAVE FILE 01',44,'#5ff2e6')}${TXT(560,1225,'PLAYER: BO',44,'#fff')}</g>`;
  const blinkOff=Math.floor(t*1.5)%2;
  let hud=`<g><rect x="680" y="360" width="340" height="80" rx="16" fill="#05040f" opacity=".78"/><circle cx="725" cy="400" r="15" fill="#ff2d2d" opacity="${blinkOff?1:.25}"/>${TXT(870,418,'POWER OFF',46,'#fff')}</g>`;
  const ck=pulse(t,V.n02.s-.2,V.n03.s+1,.3);
  if(ck>0)hud+=`<g opacity="${n(ck)}"><rect x="60" y="360" width="300" height="80" rx="16" fill="#05040f" opacity=".78"/>${TXT(210,420,'03:14 AM',52,'#ffe14d')}</g>`;
  const K=[[0,540,960,1],[V.n03.s,540,1100,1.1],[stop,HERO,1450,1.25],[stop+2,HERO,1430,1.7],[V.n07.e,HERO,1420,2.1]];
  frameOut(`<g transform="${vcam(K,t)}">${g}</g>`,t,'WHAT IF THE CITY','NEVER STOPPED?',hud);
};
