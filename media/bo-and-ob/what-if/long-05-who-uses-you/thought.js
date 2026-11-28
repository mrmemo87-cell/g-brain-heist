// a thought cloud with a trail of little circles down to the head
function THOUGHT(x,y,txt,t,t0,o={}){if(t<t0||(o.t1&&t>o.t1))return '';const k=BO((t-t0)/.35),size=o.size||40,lines=Array.isArray(txt)?txt:[txt];
  const w=o.w||Math.max(260,Math.max(...lines.map(l=>l.length))*size*.56+90),h=lines.length*size*1.2+70,tx=o.tx==null?-w*.25:o.tx,ty=o.ty==null?h/2+70:o.ty;
  let g=`<g transform="translate(${n(x)},${n(y+Math.sin(t*2+x)*6)}) scale(${n(k)})">`;
  const N=Math.max(8,Math.round((w+h)/45));let cl2='';
  for(let i=0;i<N;i++){const a=i/N*2*PI,px=Math.cos(a)*w/2,py=Math.sin(a)*h/2,r=size*.75+((i*7)%3)*size*.12;cl2+=`<circle cx="${n(px)}" cy="${n(py)}" r="${n(r)}"/>`}
  g+=`<g fill="${o.fill||'#f2ecff'}" stroke="${OUT}" stroke-width="6">${cl2}</g><g fill="${o.fill||'#f2ecff'}">${cl2.replace(/r="([\d.]+)"/g,(m,r)=>`r="${n(+r-3)}"`)}<ellipse cx="0" cy="0" rx="${n(w/2)}" ry="${n(h/2)}"/></g>`;
  g+=[.35,.62,.85].map((f,i)=>`<circle cx="${n(tx*f*1.4)}" cy="${n(h/2+(ty-h/2)*f)}" r="${n(size*(.42-i*.11))}" fill="${o.fill||'#f2ecff'}" stroke="${OUT}" stroke-width="5"/>`).join('');
  g+=lines.map((l,i)=>T(0,(i-(lines.length-1)/2)*size*1.2+size*.36,l,size,o.tc||'#3a2a70',{flat:1})).join('');
  return g+`</g>`}
