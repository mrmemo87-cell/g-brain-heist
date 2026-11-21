/* ===== vertical Shorts library (1080 x 1920) ===== */
const VW=1080,VH=1920;
const SKYG=(id,top,bot)=>`<defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${top}"/><stop offset="1" stop-color="${bot}"/></linearGradient></defs>`;
// an original neon city
function CITY(x0,y0,w,h,glow,t){
  let g=SKYG('csky','#3a1a6a','#ff7aa8')+`<rect x="${x0}" y="${y0}" width="${w}" height="${h}" fill="url(#csky)"/><circle cx="${n(x0+w*.7)}" cy="${n(y0+h*.42)}" r="${n(h*.2)}" fill="#ff5fa2" opacity="${n(.55*glow)}"/>`;
  const B=[[.02,.48,.12],[.13,.30,.10],[.24,.55,.09],[.32,.22,.13],[.46,.40,.10],[.57,.15,.12],[.70,.45,.09],[.80,.28,.12],[.91,.50,.09]];
  for(const [bx,by,bw] of B){const X=x0+bx*w,Y=y0+by*h,W=bw*w,Hh=h-by*h;g+=`<rect x="${n(X)}" y="${n(Y)}" width="${n(W)}" height="${n(Hh)}" fill="#140f33"/>`;
    for(let r=Y+18;r<y0+h-30;r+=30)for(let c=X+10;c<X+W-14;c+=22){const k=Math.round(r*7+c*3);if(k%5<2){const fl=t!=null&&k%13===0?(Math.sin(t*3+k)>.6?.2:1):1;g+=`<rect x="${n(c)}" y="${n(r)}" width="10" height="14" fill="${k%3?'#ffd36b':'#5ff2e6'}" opacity="${n(.85*glow*fl)}"/>`}}}
  const palm=(px,ph)=>`<path d="M ${n(px)} ${n(y0+h)} q 8 ${n(-ph*.5)} -4 ${n(-ph)}" stroke="#0a0820" stroke-width="12" fill="none"/>`+[-60,-25,15,50].map(a=>`<path d="M ${n(px-4)} ${n(y0+h-ph)} q ${a} -30 ${a*1.6} 20" stroke="#0a0820" stroke-width="10" fill="none" stroke-linecap="round"/>`).join('');
  g+=palm(x0+w*.08,h*.45)+palm(x0+w*.66,h*.5)+palm(x0+w*.95,h*.38);
  return g+`<rect x="${x0}" y="${n(y0+h-34)}" width="${w}" height="34" fill="#0a0820"/><rect x="${x0}" y="${n(y0+h-20)}" width="${w}" height="4" fill="#ff5fa2" opacity="${n(.7*glow)}"/>`}
const PAD=(x,y,s=1)=>`<g transform="translate(${n(x)},${n(y)}) scale(${s})"><rect x="-70" y="-26" width="140" height="56" rx="26" fill="#2b2b3a" stroke="${OUT}" stroke-width="5"/><circle cx="-36" cy="2" r="9" fill="#9aa0b5"/><circle cx="38" cy="-6" r="6" fill="#ff5fa2"/><circle cx="50" cy="8" r="6" fill="#5ff2e6"/></g>`;
function TVSET(x,y,w,h,inner,id){return `<rect x="${x-30}" y="${y-30}" width="${w+60}" height="${h+60}" rx="24" fill="#1d1d26" stroke="#000" stroke-width="10"/><rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#07060f"/><defs><clipPath id="${id}"><rect x="${x}" y="${y}" width="${w}" height="${h}"/></clipPath></defs><g clip-path="url(#${id})">${inner}<polygon points="${x+w*.62},${y} ${x+w*.76},${y} ${x+w*.5},${y+h} ${x+w*.36},${y+h}" fill="#fff" opacity=".06"/></g>`}
function vcam(K,t){let i=0;while(i<K.length-1&&t>K[i+1][0])i++;const a=K[i],b=K[Math.min(i+1,K.length-1)],u=es(t,a[0],b[0]>a[0]?b[0]:a[0]+1);const z=lerp(a[3],b[3],u);let cx=lerp(a[1],b[1],u),cy=lerp(a[2],b[2],u);cx=cl(cx,540/z,VW-540/z);cy=cl(cy,960/z,VH-960/z);return `translate(540,960) scale(${z.toFixed(4)}) translate(${n(-cx)},${n(-cy)})`}
// the title stays on top the whole time (it is the hook)
// dark text gets no outline (an outline in the same dark colour smudges the letters)
const DARK=c=>{const h=/^#([0-9a-f]{6})$/i.exec(c);if(!h)return false;const v=parseInt(h[1],16);return .299*(v>>16)+.587*((v>>8)&255)+.114*(v&255)<110};
const TXT=(x,y,s,size,c,anchor='middle')=>`<text x="${x}" y="${y}" font-size="${size}" text-anchor="${anchor}" fill="${c}"${DARK(c)?'':` stroke="#05040f" stroke-width="${Math.round(size/4.6)}" paint-order="stroke" stroke-linejoin="round"`} letter-spacing="2">${s}</text>`;
function titleBar(l1,l2,t){const k=.92+.08*es(t,0,.25);return `<rect x="0" y="0" width="1080" height="330" fill="#05040f" opacity=".62"/><g transform="translate(540,0) scale(${n(k)}) translate(-540,0)">${TXT(540,160,l1,84,'#fff')}${TXT(540,262,l2,84,'#ffe14d')}</g>`}
// spoken words as big captions, a few words at a time
const CHUNKS=NARR.map(s=>{const w=s.replace(/\.\.\./g,'…').split(/\s+/);const out=[];let cur='';for(const x of w){if((cur+' '+x).trim().length>20&&cur){out.push(cur);cur=x}else cur=(cur+' '+x).trim();if(/[.?!…]$/.test(x)&&cur.length>8){out.push(cur);cur=''}}if(cur)out.push(cur);return out});
let NOSUB=0;
function subs(t){
  if(NOSUB)return '';
  for(let i=0;i<NARR.length;i++){const id='n'+String(i+1).padStart(2,'0'),q=V[id];if(!q||t<q.s||t>q.e+.15)continue;
    const ch=CHUNKS[i],tot=ch.reduce((s,c)=>s+c.length+4,0);let acc=0;
    for(const c of ch){const a=q.s+(q.e-q.s)*acc/tot;acc+=c.length+4;const b=q.s+(q.e-q.s)*acc/tot;if(t>=a&&t<b+.15){const k=.88+.12*es(t,a,a+.12);return `<g transform="translate(540,1510) scale(${n(k)})">${TXT(0,0,c.replace(/&/g,'&amp;').toUpperCase(),78,'#fff')}</g>`}}}
  return ''}
function endcard(t){const a=es(t,C.end,C.end+.4);if(a<=0)return '';
  return `<g opacity="${n(a)}"><rect width="1080" height="1920" fill="#08071a" opacity=".93"/>${TXT(540,880,'Bo &amp; Ob',150,'#e9e6ff')}${TXT(540,1010,'THE FULL SERIES',62,'#f6c453')}${TXT(540,1090,'IS ON THIS CHANNEL',50,'#fff')}</g>`}
function frameOut(g,t,l1,l2,hud=''){g+=`<rect width="1080" height="1920" fill="url(#vig)"/>`+hud+titleBar(l1,l2,t)+subs(t)+endcard(t);
  g+=`<rect width="1080" height="1920" fill="#000" opacity="${n(es(t,D.total-.5,D.total-.05))}"/>`;document.getElementById('s').innerHTML=g}
window.DATA={fps:D.fps,total:D.total};
window.ready=document.fonts.load('600 40px Fredoka').then(()=>{renderAt(+(new URLSearchParams(location.search).get('t')||0));return true});
