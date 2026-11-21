/* Short 5: What if the save file remembered? */
function shop5(t,crack,keeperIn,keeperOut){
  let g=SKYG('sk5','#16123a','#3a2a6a')+`<rect width="1080" height="1920" fill="url(#sk5)"/><rect x="60" y="500" width="960" height="1140" fill="#5a3f6e"/><rect x="60" y="500" width="960" height="140" fill="#ff8f6b"/>${TXT(540,600,'CORNER SHOP',72,'#2a1550')}`;
  g+=`<defs><clipPath id="win5"><rect x="120" y="700" width="840" height="700"/></clipPath></defs><g clip-path="url(#win5)"><rect x="120" y="700" width="840" height="700" fill="#ffe9b8"/>`+[0,1,2].map(r=>`<rect x="140" y="${760+r*150}" width="800" height="16" fill="#8a5a3c"/>`+[0,1,2,3,4,5].map(c=>`<rect x="${170+c*125}" y="${700+r*150}" width="70" height="60" rx="8" fill="${['#ff5fa2','#5ff2e6','#ffd36b'][(r+c)%3]}"/>`).join('')).join('')+`<rect x="120" y="1200" width="840" height="200" fill="#b57c50"/>${keeperIn||''}<polygon points="600,700 720,700 520,1400 400,1400" fill="#fff" opacity=".18"/></g><rect x="120" y="700" width="840" height="700" fill="none" stroke="#2a1550" stroke-width="16"/>`;
  if(crack>0)g+=`<g opacity="${n(crack)}" stroke="#fff" stroke-width="6" fill="none" stroke-linecap="round"><path d="M 540 1000 l -180 -200 M 540 1000 l 220 -230 M 540 1000 l 260 120 M 540 1000 l -240 160 M 540 1000 l 40 330 M 540 1000 l -60 -290"/><circle cx="540" cy="1000" r="60"/></g>`;
  return g+`<rect x="0" y="1640" width="1080" height="280" fill="#3a3456"/>`+(keeperOut||'')}
const BROOM=(x,y,s=1,rot=0)=>`<g transform="translate(${n(x)},${n(y)}) rotate(${n(rot)}) scale(${s})"><line x1="0" y1="-430" x2="0" y2="0" stroke="#8a5a3c" stroke-width="16" stroke-linecap="round"/><path d="M -50 0 h 100 l 20 90 h -140 Z" fill="#e8c46a" stroke="${OUT}" stroke-width="5"/></g>`;
window.renderAt=function(t){
  const load=t<V.n03.s?1:t<V.n05.s?Math.min(41,1+Math.floor(es(t,V.n03.s,V.n04.e)*40)):42;
  const ph=V.n03.s<=t&&t<V.n04.s?((t-V.n03.s)*3)%1:0,crack=t>=V.n03.s&&t<V.n04.s?(ph<.5?1:0):t<V.n03.s?0:0;
  const out=t>=V.n05.s,flash=pulse(t,V.n05.s-.05,V.n05.s+.3,.1);
  const sweep=Math.sin(t*5)*12;
  let inK='',outK='';
  if(!out)inK=mother({x:540,y:1330,s:1.05,face:.3,sw:'#3f8f7a',sc:'#ff9db5',aL:8,aR:8,smile:lerp(.4,.9,es(t,V.n04.s,V.n04.s+1)),brow:0,open:blink(t,.9),look:[.3,.3]})+(t>=V.n04.s?BROOM(660,1330,.8,sweep):'');
  else{const stare=es(t,V.n06.s,V.n06.s+1);outK=mother({x:540,y:1880,s:1.35,face:0,sw:'#3f8f7a',sc:'#ff9db5',aL:8,aR:60,smile:lerp(.2,-.6,stare),brow:lerp(.2,-.9,stare),open:blink(t,.9),look:[0,0]})+BROOM(700,1880,1);}
  let g=DEFS+shop5(t,crack,inK,outK)+`<rect width="1080" height="1920" fill="#fff" opacity="${n(flash*.8)}"/>`;
  let hud=`<g><rect x="370" y="360" width="340" height="90" rx="16" fill="#05040f" opacity=".8"/>${TXT(540,425,'LOAD '+load,58,load>41?'#ff2d2d':'#5ff2e6')}</g>`;
  const bub=es(t,V.n07.s,V.n07.s+.3);if(bub>0)hud="";if(bub>0)g+=`<g opacity="${n(bub)}"><rect x="290" y="760" width="500" height="130" rx="60" fill="#fff" stroke="${OUT}" stroke-width="6"/><polygon points="520,885 580,885 545,940" fill="#fff" stroke="${OUT}" stroke-width="6" stroke-linejoin="round"/><rect x="515" y="878" width="70" height="12" fill="#fff"/>${TXT(540,850,'NOT AGAIN.',64,OUT)}</g>`;
  const K=[[0,540,1000,1],[V.n03.s,540,1050,1.1],[V.n04.s,540,1150,1.35],[V.n05.s,540,1100,1],[V.n06.s,540,1250,1.4],[V.n06.e,540,1220,1.75],[V.n07.e,540,1150,1.6]];
  frameOut(`<g transform="${vcam(K,t)}">${g}</g>`,t,'WHAT IF THE SAVE FILE','REMEMBERED?',hud);
};
