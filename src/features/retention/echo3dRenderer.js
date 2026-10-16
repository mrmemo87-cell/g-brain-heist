/** Small model-specific WebGL2 renderer. No framework, texture fetches or global render loop. */
export function createEcho3DRenderer(canvas, arrayBuffer, options = {}) {
 const gl=canvas.getContext('webgl2',{antialias:true,alpha:true,powerPreference:'low-power'}) || canvas.getContext('webgl2',{antialias:false,alpha:true});
 if(!gl)throw Error('3D unavailable');
 const bytes=new Uint8Array(arrayBuffer);if(bytes.length>3000000||bytes.length<28||new DataView(arrayBuffer).getUint32(0,true)!==0x46546c67)throw Error('Invalid character model');
 const buffers=[],shaders=[];
 try {
const dv=new DataView(bytes.buffer);const jl=dv.getUint32(12,true);const doc=JSON.parse(new TextDecoder().decode(bytes.subarray(20,20+jl)));const binStart=28+jl;const payload=bytes.buffer;
function acc(i){const a=doc.accessors[i],v=doc.bufferViews[a.bufferView],len={SCALAR:1,VEC3:3,VEC4:4,MAT4:16}[a.type],T={5126:Float32Array,5123:Uint16Array,5125:Uint32Array}[a.componentType];return new T(payload,binStart+(v.byteOffset||0)+(a.byteOffset||0),a.count*len)}
function compile(type,source){const s=gl.createShader(type);shaders.push(s);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s}
const vs=`#version 300 es
precision highp float;layout(location=0)in vec3 p;layout(location=1)in vec3 n;layout(location=2)in uvec4 j;layout(location=3)in vec4 w;uniform mat4 joints[19];uniform mat4 vp;out vec3 normal;out vec3 position;void main(){mat4 skin=joints[j.x]*w.x+joints[j.y]*w.y+joints[j.z]*w.z+joints[j.w]*w.w;vec4 v=skin*vec4(p,1.);position=v.xyz;normal=normalize(mat3(skin)*n);gl_Position=vp*v;}`;
const fs=`#version 300 es
precision highp float;in vec3 normal;in vec3 position;uniform vec3 color;uniform vec3 emit;uniform vec3 camera;uniform float rough;uniform float metal;out vec4 pixel;void main(){vec3 N=normalize(normal);vec3 V=normalize(camera-position);vec3 L=normalize(vec3(-3.,5.,5.)-position);vec3 H=normalize(L+V);vec3 L2=normalize(vec3(4.,3.,-2.)-position);float d=max(0.,dot(N,L));float r=max(0.,dot(N,L2));float s=pow(max(0.,dot(N,H)),mix(90.,12.,rough));float rim=pow(1.-max(0.,dot(N,V)),3.);vec3 lit=color*(.30+d*.85+r*.36)+vec3(.65,.85,1.)*s*(.15+metal*.35)+vec3(.05,.24,.31)*rim+emit*.65;pixel=vec4(pow(clamp(lit,0.,1.),vec3(.8)),1.);}`;
const program=gl.createProgram();gl.attachShader(program,compile(gl.VERTEX_SHADER,vs));gl.attachShader(program,compile(gl.FRAGMENT_SHADER,fs));gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));gl.useProgram(program);gl.enable(gl.DEPTH_TEST);
const uniforms=Object.fromEntries(['joints[0]','vp','color','emit','camera','rough','metal'].map(k=>[k,gl.getUniformLocation(program,k)]));
const primitives=doc.meshes[0].primitives.map(p=>{const vao=gl.createVertexArray();gl.bindVertexArray(vao);for(const [key,loc,size]of [['POSITION',0,3],['NORMAL',1,3],['JOINTS_0',2,4],['WEIGHTS_0',3,4]]){const b=gl.createBuffer();buffers.push(b);gl.bindBuffer(gl.ARRAY_BUFFER,b);gl.bufferData(gl.ARRAY_BUFFER,acc(p.attributes[key]),gl.STATIC_DRAW);gl.enableVertexAttribArray(loc);if(key==='JOINTS_0')gl.vertexAttribIPointer(loc,size,gl.UNSIGNED_SHORT,0,0);else gl.vertexAttribPointer(loc,size,gl.FLOAT,false,0,0)}const indices=acc(p.indices),b=gl.createBuffer();buffers.push(b);gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,b);gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,indices,gl.STATIC_DRAW);return{vao,count:indices.length,material:doc.materials[p.material]}});
const I=()=>new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);
function mul(a,b){const c=new Float32Array(16);for(let col=0;col<4;col++)for(let row=0;row<4;row++)for(let k=0;k<4;k++)c[col*4+row]+=a[k*4+row]*b[col*4+k];return c}
function trs(t=[0,0,0],q=[0,0,0,1]){const[x,y,z,w]=q;return new Float32Array([1-2*(y*y+z*z),2*(x*y+z*w),2*(x*z-y*w),0,2*(x*y-z*w),1-2*(x*x+z*z),2*(y*z+x*w),0,2*(x*z+y*w),2*(y*z-x*w),1-2*(x*x+y*y),0,...t,1])}
function normalize(a){const l=Math.hypot(...a);return a.map(x=>x/l)}function cross(a,b){return[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]]}function dot(a,b){return a.reduce((s,x,i)=>s+x*b[i],0)}
function view(eye,target){const z=normalize(eye.map((v,i)=>v-target[i])),x=normalize(cross([0,1,0],z)),y=cross(z,x);return new Float32Array([x[0],y[0],z[0],0,x[1],y[1],z[1],0,x[2],y[2],z[2],0,-dot(x,eye),-dot(y,eye),-dot(z,eye),1])}
function perspective(aspect){const f=1/Math.tan(.38),near=.1,far=100;return new Float32Array([f/aspect,0,0,0,0,f,0,0,0,0,(far+near)/(near-far),-1,0,0,2*far*near/(near-far),0])}
const tracks=doc.animations.map(a=>a.channels.map(ch=>{const s=a.samplers[ch.sampler];return{node:ch.target.node,path:ch.target.path,times:acc(s.input),values:acc(s.output)}}));
const inverse=acc(doc.skins[0].inverseBindMatrices);
let clip=0,playing=false,time=0,last=0,endAt=0,raf=0,disposed=false,visible=true,reduced=Boolean(options.reduced),palette=options.palette||'cyan',announced=false;
const yaw=.25,pitch=.05,distance=5.6;
let lastDraw=0;
function draw(){raf=0;if(disposed||!visible)return;const now=performance.now()/1000;if(playing)time+=Math.min(.05,last?now-last:0);if(time>=endAt)playing=false;last=now;const ratio=Math.min(window.devicePixelRatio||1,1.5);const width=Math.round(Math.max(96,canvas.clientWidth)*ratio),height=Math.round(Math.max(96,canvas.clientHeight)*ratio);if(canvas.width!==width||canvas.height!==height){canvas.width=width;canvas.height=height}gl.viewport(0,0,width,height);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
 const local=doc.nodes.map(n=>({t:[...(n.translation||[0,0,0])],q:[...(n.rotation||[0,0,0,1])]}));const duration=tracks[clip][0].times.at(-1),at=time%duration;
 for(const tr of tracks[clip]){const ts=tr.times,n=tr.path==='rotation'?4:3;let k=0;while(k<ts.length-2&&at>ts[k+1])k++;const a=(at-ts[k])/(ts[k+1]-ts[k]);const out=[];let sign=1;if(n===4){let dp=0;for(let i=0;i<4;i++)dp+=tr.values[k*4+i]*tr.values[(k+1)*4+i];if(dp<0)sign=-1}for(let i=0;i<n;i++)out.push(tr.values[k*n+i]*(1-a)+sign*tr.values[(k+1)*n+i]*a);if(n===4)local[tr.node].q=normalize(out);else local[tr.node].t=out;}
 const world=[];function walk(idx,parent){world[idx]=mul(parent,trs(local[idx].t,local[idx].q));for(const c of doc.nodes[idx].children||[])walk(c,world[idx]);}for(const n of doc.scenes[0].nodes)walk(n,I());const skin=new Float32Array(19*16);doc.skins[0].joints.forEach((j,i)=>skin.set(mul(world[j],inverse.subarray(i*16,i*16+16)),i*16));gl.uniformMatrix4fv(uniforms['joints[0]'],false,skin);
 const target=[-.35,1.95,0],eye=[target[0]+Math.sin(yaw)*Math.cos(pitch)*distance*Math.max(1,.65/(width/height)),target[1]+Math.sin(pitch)*distance*Math.max(1,.65/(width/height)),Math.cos(yaw)*Math.cos(pitch)*distance*Math.max(1,.65/(width/height))];gl.uniformMatrix4fv(uniforms.vp,false,mul(perspective(width/height),view(eye,target)));gl.uniform3fv(uniforms.camera,eye);
 for(const p of primitives){let m=p.material,c=m.pbrMetallicRoughness.baseColorFactor.slice(0,3),e=m.emissiveFactor;if(m.name==='Cyan energy strands'&&palette!=='cyan'){c=palette==='pink'?[1,.12,.48]:[.65,.34,1];e=c.map(v=>v*.7)}gl.uniform3fv(uniforms.color,c);gl.uniform3fv(uniforms.emit,e);gl.uniform1f(uniforms.rough,m.pbrMetallicRoughness.roughnessFactor);gl.uniform1f(uniforms.metal,m.pbrMetallicRoughness.metallicFactor);gl.bindVertexArray(p.vao);gl.drawElements(gl.TRIANGLES,p.count,gl.UNSIGNED_INT,0)}if(!announced){const error=gl.getError();if(error!==gl.NO_ERROR)throw Error('3D draw failed');announced=true;options.onReady?.()}if(playing)schedule();}
function schedule(){if(disposed||!visible||raf)return;raf=requestAnimationFrame(t=>{raf=0;if(playing&&t-lastDraw<1000/30){schedule();return}lastDraw=t;try{draw()}catch{playing=false;options.onError?.()}});}
function play(next){clip=Math.max(0,Math.min(2,next));time=0;last=0;endAt=tracks[clip][0].times.at(-1)*2;playing=!reduced;schedule();}
function lost(event){event.preventDefault();if(!disposed){playing=false;cancelAnimationFrame(raf);raf=0;options.onError?.();}}
canvas.addEventListener('webglcontextlost',lost);
return {
 setPose(pose){play(pose==='celebrate'||pose==='cheer'?2:pose==='curious'||pose==='thinking'||pose==='keepsake'?1:0)},
 setPalette(next){palette=next;schedule()},
 setReduced(value){reduced=value;if(value)playing=false;schedule()},
 setVisible(value){visible=value;last=0;if(!value){cancelAnimationFrame(raf);raf=0}else schedule()},
 dispose(){if(disposed)return;disposed=true;cancelAnimationFrame(raf);canvas.removeEventListener('webglcontextlost',lost);primitives.forEach(p=>gl.deleteVertexArray(p.vao));buffers.forEach(b=>gl.deleteBuffer(b));shaders.forEach(s=>gl.deleteShader(s));gl.deleteProgram(program);gl.getExtension('WEBGL_lose_context')?.loseContext()},
};
 } catch(error) { gl.getExtension('WEBGL_lose_context')?.loseContext(); throw error; }
}
