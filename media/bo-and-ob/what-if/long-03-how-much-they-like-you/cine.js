/* ===== cinematic landscape library (1920 x 1080) ===== */
const W=1920,H=1080;
const E=u=>{u=cl(u);return u<.5?4*u*u*u:1-Math.pow(-2*u+2,3)/2};
const BO=u=>{u=cl(u);return 1+2.70158*Math.pow(u-1,3)+1.70158*Math.pow(u-1,2)};
const at=(id,f=0)=>V[id].s+f*(V[id].e-V[id].s);
const DK=c=>{const h=/^#([0-9a-f]{6})$/i.exec(c);if(!h)return false;const v=parseInt(h[1],16);return .299*(v>>16)+.587*((v>>8)&255)+.114*(v&255)<110};
const T=(x,y,s,size,c='#fff',o={})=>`<text x="${n(x)}" y="${n(y)}" font-size="${size}" text-anchor="${o.a||'middle'}" fill="${c}"${DK(c)||o.flat?'':` stroke="#05040f" stroke-width="${Math.round(size/5)}" paint-order="stroke" stroke-linejoin="round"`} letter-spacing="${o.ls==null?1:o.ls}"${o.op!=null?` opacity="${n(o.op)}"`:''}>${s}</text>`;
const POP=(txt,x,y,size,c,t,t0,rot=0)=>{if(t<t0)return '';const k=BO((t-t0)/.35);return `<g transform="translate(${n(x)},${n(y)}) rotate(${rot}) scale(${n(k)})">${T(0,0,txt,size,c)}</g>`};
const GLOW=(x,y,r,c,a)=>`<circle cx="${n(x)}" cy="${n(y)}" r="${n(r)}" fill="${c}" opacity="${n(a)}" filter="url(#blur40)"/>`;
const CDEFS=`<defs><filter id="blur40" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="40"/></filter><filter id="blur6"><feGaussianBlur stdDeviation="6"/></filter><filter id="blur3"><feGaussianBlur stdDeviation="3"/></filter>
<linearGradient id="dawn" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffd9a8"/><stop offset="1" stop-color="#f39a7b"/></linearGradient>
<linearGradient id="dusk" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2b1d5a"/><stop offset="1" stop-color="#c2577a"/></linearGradient>
<linearGradient id="nightsky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0b0826"/><stop offset="1" stop-color="#2a1d5a"/></linearGradient>
<linearGradient id="daysky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7fb8f0"/><stop offset="1" stop-color="#d8ecff"/></linearGradient>
<linearGradient id="beam" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff3d1" stop-opacity=".55"/><stop offset="1" stop-color="#fff3d1" stop-opacity="0"/></linearGradient></defs>`;
// cast
const YOU=o=>char(Object.assign({sw:'#f3efe6',sc:'#e0a83a'},o));
const PARTNER=o=>mother(Object.assign({sw:'#5b8bd9',sc:'#f3efe6',s:1.05},o));
const KID=o=>girl(Object.assign({s:.66},o));
const MAN=(sw,sc,o)=>char(Object.assign({sw,sc},o));
const WOMAN=(sw,sc,o)=>char(Object.assign({sw,sc,hg:'hg2',hc:'#6a2d5f',bun:1},o));
const youT=t=>0,partT=tk(ids('p',3)),bossT=t=>0;
const one=id=>t=>talk1(id,t);
// a speech bubble
function BUB(x,y,txt,t,t0,o={}){if(t<t0||(o.t1&&t>o.t1))return '';const k=BO((t-t0)/.3),w=o.w||Math.max(220,txt.length*(o.size||40)*.56+70),hh=(o.size||40)*2.1,side=o.side||0;
  return `<g transform="translate(${n(x)},${n(y)}) scale(${n(k)})"><rect x="${n(-w/2)}" y="${n(-hh/2)}" width="${n(w)}" height="${n(hh)}" rx="${n(hh/2)}" fill="${o.fill||'#fff'}" stroke="${OUT}" stroke-width="6"/><polygon points="${n(side*w*.25-18)},${n(hh/2-4)} ${n(side*w*.25+18)},${n(hh/2-4)} ${n(side*w*.25+(o.tx||-30))},${n(hh/2+40)}" fill="${o.fill||'#fff'}" stroke="${OUT}" stroke-width="6" stroke-linejoin="round"/><rect x="${n(side*w*.25-14)}" y="${n(hh/2-10)}" width="28" height="12" fill="${o.fill||'#fff'}"/>${T(0,(o.size||40)*.36,txt,o.size||40,o.tc||OUT)}</g>`}
// ---------- sets ----------
function WINDOWLIGHT(x,y,w,h,mood,t){const sky=mood==='night'?'url(#nightsky)':mood==='dusk'?'url(#dusk)':mood==='dawn'?'url(#dawn)':'url(#daysky)';
  let g=`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="10" fill="${sky}"/>`;if(mood==='night')for(let i=0;i<14;i++)g+=`<circle cx="${n(x+((i*97)%w))}" cy="${n(y+((i*53)%(h*.6)))}" r="2.5" fill="#fff" opacity="${n(.4+.6*Math.abs(Math.sin(t+i)))}"/>`;
  if(mood==='dawn')g+=`<circle cx="${n(x+w*.7)}" cy="${n(y+h*.75)}" r="${n(h*.18)}" fill="#fff4c9"/>`;
  return g+`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="10" fill="none" stroke="#f3ead8" stroke-width="18"/><line x1="${x+w/2}" y1="${y}" x2="${x+w/2}" y2="${y+h}" stroke="#f3ead8" stroke-width="10"/>`}
// the bed, seen from above: heads on pillows, duvet over the rest
function BEDTOP(t,o){
  const night=o.night||0;
  let g=`<rect width="1920" height="1080" fill="${night?'#1b1636':'#3a2c4a'}"/><rect x="0" y="0" width="1920" height="1080" fill="url(#beam)" opacity="${night?0:.8}"/>`;
  g+=`<rect x="300" y="40" width="1080" height="1100" rx="40" fill="${night?'#3b3466':'#6a5a8a'}"/><rect x="300" y="40" width="1080" height="110" rx="30" fill="${night?'#2a2450':'#4a3e6a'}"/>`;
  g+=`<rect x="400" y="170" width="380" height="200" rx="80" fill="${night?'#8f8ab8':'#f4f0ff'}"/><rect x="900" y="170" width="380" height="200" rx="80" fill="${night?'#8f8ab8':'#f4f0ff'}"/>`;
  const S=.82;
  g+=PARTNER(Object.assign({x:590,y:300+362*S,s:S,face:o.pf==null?.25:o.pf,smile:.2,brow:0,open:o.popen==null?.1:o.popen,mouth:partT(t),look:o.plook||[.5,0]},o.p||{}));
  g+=YOU(Object.assign({x:1090,y:300+362*S,s:S,face:o.yf==null?-.15:o.yf,smile:.3,brow:0,open:o.yopen==null?.1:o.yopen,mouth:youT(t),look:o.ylook||[0,0]},o.y||{}));
  g+=`<path d="M 320 430 Q 840 380 1360 430 L 1360 1100 L 320 1100 Z" fill="${night?'#5b5390':'#e9dff5'}"/><path d="M 480 520 q 120 60 220 10 M 980 600 q 150 50 260 -10 M 640 800 q 200 60 400 0" stroke="${night?'#4a4380':'#cfc2e6'}" stroke-width="10" fill="none" stroke-linecap="round"/>`;
  // the bedside clock
  g+=`<rect x="1440" y="250" width="300" height="200" rx="20" fill="#2a2240"/><rect x="1460" y="280" width="260" height="120" rx="14" fill="#0b0814"/>${T(1590,368,o.clock||'07:00',86,'#ff5f5f',{flat:1,ls:6,op:o.blink&&Math.floor(t*3)%2?.25:1})}`+GLOW(1590,340,150,'#ff5f5f',.18);
  if(night)g+=`<rect width="1920" height="1080" fill="#0b0826" opacity=".25"/>`;
  return g}
function KITCHEN(t,o={}){let g=kitchenSet(t,!!o.night)+GLOW(1480,300,420,'#fff3c2',.35);
  g+=o.chars||'';g+=TABLE;g+=`<g><rect x="600" y="668" width="60" height="56" rx="10" fill="#fff" stroke="${OUT}" stroke-width="5"/><path d="M 660 680 q 26 4 0 30" fill="none" stroke="${OUT}" stroke-width="6"/><rect x="1110" y="668" width="60" height="56" rx="10" fill="#ff9db5" stroke="${OUT}" stroke-width="5"/></g>`;
  return g+(o.front||'')}
function OFFICE(t,o={}){let g=`<rect width="1920" height="1080" fill="#d9d2e6"/><rect x="0" y="0" width="1920" height="120" fill="#c4bcd6"/>`;
  for(let i=0;i<3;i++)g+=`<g transform="translate(${180+i*560},170)"><rect width="440" height="420" rx="12" fill="url(#daysky)"/>${CITYMINI(0,120,440,300)}<rect width="440" height="420" rx="12" fill="none" stroke="#efeaf7" stroke-width="16"/></g>`;
  g+=`<rect x="0" y="${FLOOR}" width="1920" height="175" fill="#8f86a6"/>`+GLOW(960,300,600,'#fff6d8',.25);
  return g+(o.chars||'')}
function CITYMINI(x0,y0,w,h){let g='';const B=[[0,.4,.14],[.15,.2,.12],[.3,.5,.1],[.42,.1,.14],[.58,.35,.12],[.72,.05,.1],[.84,.3,.16]];for(const [bx,by,bw] of B)g+=`<rect x="${n(x0+bx*w)}" y="${n(y0+by*h)}" width="${n(bw*w)}" height="${n(h-by*h)}" fill="#9fb3d6"/>`;return g}
function CITYBIG(t,glow,night){
  let g=`<rect width="1920" height="1080" fill="url(#${night?'nightsky':'daysky'})"/>`;
  const B=[[0,.42,.1],[.09,.22,.08],[.18,.5,.07],[.25,.18,.1],[.36,.38,.08],[.45,.12,.1],[.56,.42,.07],[.64,.25,.1],[.75,.48,.07],[.83,.2,.1],[.93,.45,.07]];
  for(const [bx,by,bw] of B){const X=bx*1920,Y=by*905,Wd=bw*1920;g+=`<rect x="${n(X)}" y="${n(Y)}" width="${n(Wd)}" height="${n(905-Y)}" fill="${night?'#1b1640':'#8ea4cc'}"/>`;
    for(let r=Y+24;r<870;r+=40)for(let c=X+14;c<X+Wd-20;c+=30){const k=Math.round(r*7+c*3);if(k%5<2)g+=`<rect x="${n(c)}" y="${n(r)}" width="14" height="20" fill="${night?(k%3?'#ffd36b':'#ff9db5'):'#dfe9f7'}" opacity="${night?n(.85*glow):.7}"/>`}}
  return g+`<rect x="0" y="${FLOOR}" width="1920" height="175" fill="${night?'#151130':'#6d6780'}"/><rect x="0" y="${FLOOR}" width="1920" height="12" fill="${night?'#2a2250':'#8c86a0'}"/>`}
function CAR(x,y,c,s=1,dent=0){return `<g transform="translate(${n(x)},${n(y)}) scale(${s})"><path d="M -230 -40 Q -230 -90 -170 -95 L -110 -170 Q -90 -190 -50 -190 L 90 -190 Q 130 -190 150 -160 L 190 -100 Q 240 -95 240 -40 L 240 10 L -230 10 Z" fill="${c}" stroke="${OUT}" stroke-width="7" stroke-linejoin="round"/>${dent?`<path d="M 170 -100 l 30 25 l -25 15 l 35 20 l -30 30 Z" fill="#05040f" opacity=".35"/>`:''}<path d="M -95 -165 L -40 -165 L -40 -100 L -150 -100 Z M -10 -165 L 85 -165 L 140 -100 L -10 -100 Z" fill="#cfe6ff" stroke="${OUT}" stroke-width="6" stroke-linejoin="round"/><circle cx="-140" cy="10" r="48" fill="#2a2a3a" stroke="${OUT}" stroke-width="7"/><circle cx="150" cy="10" r="48" fill="#2a2a3a" stroke="${OUT}" stroke-width="7"/><circle cx="-140" cy="10" r="18" fill="#9aa0b5"/><circle cx="150" cy="10" r="18" fill="#9aa0b5"/></g>`}
// a phone with a chat on it. msgs: [{at, me, text, bad}], input: {at, typed, glitchAt}
function PHONE(x,y,s,t,o){
  let g=`<g transform="translate(${n(x)},${n(y)}) scale(${s})"><rect x="-260" y="-500" width="520" height="1000" rx="70" fill="#17151f" stroke="#3a3650" stroke-width="10"/><rect x="-230" y="-440" width="460" height="880" rx="30" fill="#f4f1fa"/><rect x="-70" y="-480" width="140" height="22" rx="11" fill="#0a0910"/>`;
  g+=`<rect x="-230" y="-440" width="460" height="120" rx="30" fill="#ece7f6"/><circle cx="-160" cy="-380" r="34" fill="${o.avatar||'#5b8bd9'}"/>${T(-110,-368,o.name||'',38,OUT,{a:'start'})}`;
  let yy=-270;
  for(const m of o.msgs||[]){if(t<m.at)continue;const k=BO((t-m.at)/.3),w=Math.min(400,m.text.length*19+60),lines=m.text.length>20?2:1,hh=lines*46+30;
    const bx=m.me?210-w:-210,txt=lines>1?(()=>{const wds=m.text.split(' ');let a='',b='';for(const wd of wds){if((a+' '+wd).trim().length<=Math.ceil(m.text.length/2))a=(a+' '+wd).trim();else b=(b+' '+wd).trim()}return [a,b]})():[m.text];
    g+=`<g transform="translate(${n(bx+w/2)},${n(yy+hh/2)}) scale(${n(k)}) translate(${n(-w/2)},${n(-hh/2)})"><rect width="${w}" height="${hh}" rx="26" fill="${m.bad?'#ff5f5f':m.me?'#3a7bd5':'#ffffff'}" stroke="${m.me?'none':'#d8d2e6'}" stroke-width="3"/>${txt.map((l,i)=>T(w/2,44+i*46,l,34,m.me||m.bad?'#fff':OUT,{flat:1})).join('')}</g>`;
    if(m.bad&&t>m.at+.3)g+=T(m.me?200:-200,yy+hh+34,'not what you typed',22,'#ff5f5f',{flat:1,a:m.me?'end':'start'});
    yy+=hh+(m.bad?56:26)}
  // the input line
  g+=`<rect x="-210" y="340" width="420" height="70" rx="35" fill="#fff" stroke="#d8d2e6" stroke-width="3"/>`;
  const ip=o.input;if(ip&&t>=ip.at&&(!ip.glitchAt||t<ip.glitchAt+.5)){const nch=Math.floor(cl((t-ip.at)/1.4)*ip.typed.length),txt=ip.typed.slice(0,nch),gl=ip.glitchAt&&t>=ip.glitchAt,jx=gl?Math.sin(t*90)*6:0;
    g+=`<g transform="translate(${n(jx)},0)">${T(-185,388,txt+(gl||Math.floor(t*3)%2?'':'|'),30,gl?'#ff2d2d':OUT,{a:'start',flat:1})}${gl?`<line x1="-190" y1="378" x2="${n(-190+txt.length*16)}" y2="378" stroke="#ff2d2d" stroke-width="4"/>`:''}</g>`}
  return g+`</g>`}
// a glowing day clock, bottom left
function stamp(t,list){let cur=null;for(const [a,txt] of list)if(t>=a)cur=[a,txt];if(!cur)return '';const u=t-cur[0],a=pulse(u,0,3.2,.35);if(a<=0)return '';
  return `<g opacity="${n(a)}" transform="translate(70,${n(990+(1-E(u/.4))*30)})"><circle cx="26" cy="-16" r="26" fill="none" stroke="#fff" stroke-width="5"/><line x1="26" y1="-16" x2="26" y2="-32" stroke="#fff" stroke-width="5" stroke-linecap="round"/><line x1="26" y1="-16" x2="38" y2="-10" stroke="#fff" stroke-width="5" stroke-linecap="round"/>${T(72,0,cur[1],52,'#fff',{a:'start',ls:3})}</g>`}
// the three collapses and the one good thing
function tiles4(t,rev,big){const icons=['CHART','HEART','PARTY','STAR'];let g='';
  for(let i=0;i<4;i++){const x=960+(i-1.5)*230,r=rev[i],gold=i===3,k=big===i?1+.12*Math.sin(t*8):1;
    g+=`<g transform="translate(${x},540) scale(${n(k)})"><rect x="-95" y="-95" width="190" height="190" rx="26" fill="${r?(gold?'#ffd54d':'#ff5f5f'):'#2a2450'}" stroke="${gold?'#ffd54d':'#fff'}" stroke-width="8"/>`;
    if(!r)g+=T(0,32,'?',100,gold?'#ffd54d':'#fff');
    else if(i===0)g+=`<polyline points="-60,-40 -20,0 10,-20 60,50" fill="none" stroke="#fff" stroke-width="14" stroke-linejoin="round" stroke-linecap="round"/><polygon points="60,50 30,46 56,22" fill="#fff"/>`;
    else if(i===1)g+=`<path d="M 0 55 C -80 0 -60 -60 -20 -50 C -5 -46 0 -35 0 -30 L 10 -5 L -8 15 L 6 40 Z" fill="#fff"/><path d="M 14 50 L 22 20 L 4 0 L 18 -25 C 22 -40 40 -55 60 -45 C 90 -25 60 25 14 50 Z" fill="#fff"/>`;
    else if(i===2)g+=`<polygon points="0,-70 -50,50 50,50" fill="#fff"/><circle cx="0" cy="-70" r="14" fill="#fff"/><path d="M -40 30 L 40 10 M -30 0 L 25 -15" stroke="#ff5f5f" stroke-width="8"/>`;
    else g+=star(0,0,70,-PI/2,'#fff');
    g+=`</g>`}
  return g}
