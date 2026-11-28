/* Short 1: What if the NPCs could see you? */
const TX=100,TY=500,TW=880,TH=500;
const FIG=[[230,.55,.35],[380,.62,.18],[540,.7,0],[700,.6,-.18],[850,.52,-.35]];
window.renderAt=function(t){
  const off=C.off,on=t<off,fl=pulse(t,off-.02,off+.25,.1);
  let inner='';
  if(on){ // the game is running
    inner=CITY(TX,TY,TW,TH,1,t)+[0,1,2,3].map(i=>{const x=TX+((t*120+i*260)%(TW+200))-100;return shape({x,y:TY+TH-6,s:.28,eyes:0})}).join('');
  }else{
    inner=`<g opacity=".35">${CITY(TX,TY,TW,TH,.3,null)}</g>`;
    // Bo's reflection, small and dim
    inner+=`<g opacity=".22">${char({x:540,y:TY+TH+120,s:.5,face:0,smile:-.2,brow:.6,open:1,look:[0,0]})}</g>`;
    FIG.forEach(([x,s,l],i)=>{const app=es(t,V.n02.s+.3+i*.32,V.n02.s+.8+i*.32),eye=es(t,V.n05.s+1+i*.35,V.n05.s+1.4+i*.35);
      const arm=i===2?es(t,V.n06.s+.1,V.n06.s+.8)*(105+Math.sin(t*8)*20):0;
      const yb=TY+TH+(i===2?80:10);if(app>0)inner+=shape({x,y:yb,s,look:l,op:app*.95,eyes:eye,arm,side:1});
      if(i===2&&arm>5){const r=Math.min(arm,125)*PI/180,hx=x+(64+Math.sin(r)*118)*s,hy=yb+(-228+Math.cos(r)*118)*s;
        inner+=`<g opacity="${n(es(t,V.n06.s+.1,V.n06.s+.5))}"><circle cx="${n(hx)}" cy="${n(hy)}" r="${n(30*s)}" fill="none" stroke="#e9e6ff" stroke-width="4" opacity=".7"/><path d="M ${n(hx+40)} ${n(hy-30)} q 18 30 0 60 M ${n(hx+60)} ${n(hy-45)} q 26 45 0 90" stroke="#e9e6ff" stroke-width="5" fill="none" stroke-linecap="round" opacity=".55"/></g>`}});
  }
  let g=DEFS+`<rect width="1080" height="1920" fill="#0c0a1c"/><ellipse cx="540" cy="760" rx="600" ry="420" fill="${on?'#5ff2e6':'#3a2a8a'}" opacity="${on?.12:.06}"/>`;
  g+=TVSET(TX,TY,TW,TH,inner,'tv1')+`<rect x="${TX}" y="${TY}" width="${TW}" height="${TH}" fill="#fff" opacity="${n(fl*.8)}"/>`;
  g+=`<rect x="500" y="1030" width="80" height="60" fill="#1d1d26"/><rect x="360" y="1086" width="360" height="22" rx="10" fill="#1d1d26"/>`;
  const wave=es(t,V.n07.s+.5,V.n07.e+.3);
  g+=char({x:540,y:1900,s:1.35,face:0,back:1,aL:60,aR:60+wave*70,bob:-pulse(t,off,off+.5,.2)*10});
  g+=`<rect x="0" y="1720" width="1080" height="200" fill="#3a2a5a"/><rect x="0" y="1700" width="1080" height="40" rx="20" fill="#4a3870"/>`+PAD(540,1690-wave*40,1.2);
  const K=[[0,540,960,1],[V.n02.s,540,900,1.12],[V.n03.s,540,800,1.3],[V.n05.s,540,760,1.5],[V.n06.s,540,740,1.3],[V.n06.e,540,740,1.4],[V.n07.s,540,960,1.05]];
  frameOut(`<g transform="${vcam(K,t)}">${g}</g>`,t,'WHAT IF THE NPCs','COULD SEE YOU?');
};
