import {strFromU8,strToU8,unzipSync,zipSync} from 'fflate';
import type {PackSchool,PackResource} from './ieltsApprovedTeacherPacks';
const token='{{BH_SCHOOL_NAME}}';
const blank='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGNgAAIAAAUAAXpeqz8AAAAASUVORK5CYII=';
const escape=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export async function packDigest(bytes:Uint8Array):Promise<string>{
 return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new Uint8Array(bytes))),n=>n.toString(16).padStart(2,'0')).join('');
}
export async function schoolPackLogo(school:PackSchool):Promise<Uint8Array>{
 if(!school.logo_url)return Uint8Array.from(atob(blank),c=>c.charCodeAt(0));
 const url=new URL(school.logo_url);if(url.protocol!=='https:')throw new Error('School logo could not load.');
 const response=await fetch(url.href,{credentials:'omit',signal:AbortSignal.timeout(20000)});
 if(!response.ok||Number(response.headers.get('content-length'))>5000000)throw new Error('School logo could not load.');
 const blob=await response.blob();if(blob.size>5000000)throw new Error('School logo could not load.');
 let image:ImageBitmap|undefined;
 try{
  image=await createImageBitmap(blob);if(image.width*image.height>20000000)throw new Error('Logo too large');
  const canvas=document.createElement('canvas');canvas.width=600;canvas.height=675;
  const ctx=canvas.getContext('2d');if(!ctx)throw new Error('Canvas unavailable');
  const scale=Math.min(576/image.width,651/image.height);
  ctx.drawImage(image,(600-image.width*scale)/2,(675-image.height*scale)/2,image.width*scale,image.height*scale);
  const normalized=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('Logo conversion failed')),'image/png'));
  return new Uint8Array(await normalized.arrayBuffer());
 }catch{throw new Error('School logo could not load.');}finally{image?.close();}
}
interface NameSlot{text:string;x:number;y:number;width:number;size:number;color:number;bold:boolean}
interface PageSlots{names:NameSlot[];logos:number[][]}
interface Branding{version:string;lesson_code:string;pdfs:Record<string,PageSlots[]>;pptx_media:Record<string,string>;source_archive_sha256:string;approved_source_sha256:string;
 content_revision?:string;resources?:Partial<Record<Exclude<PackResource,'zip'>,string>>}
const legacyResource=(code:string,kind:Exclude<PackResource,'zip'>)=>code+'/'+(kind==='slides'?'teacher/Presentation.html':kind==='workbook'?'student/Workbook.pdf':`teacher/${code}-Editable.pptx`);
/** Path of one downloadable resource inside a branded pack (template contract, or the Lessons 3-4 layout). */
export function packResourcePath(code:string,kind:Exclude<PackResource,'zip'>,resources?:Branding['resources']):string{
 const path=resources?.[kind]??legacyResource(code,kind);
 if(!path.startsWith(code+'/')||path.includes('..'))throw new Error('School branding template mismatch');
 return path;
}
export async function brandTeacherPack(source:Blob,school:PackSchool,code:string,kind:PackResource='zip',providedLogo?:Uint8Array):Promise<Blob>{
 if(!school.id||!school.name.trim()||school.name.length>200)throw new Error('School branding unavailable');
 const root=code+'/';
 const bytes=new Uint8Array(await source.arrayBuffer());
 const head=unzipSync(bytes,{filter:f=>f.name==='BRANDING.json'});
 if(!head['BRANDING.json'])throw new Error('School branding template missing');
 const contract=JSON.parse(strFromU8(head['BRANDING.json'])) as Branding;
 if(contract.version!=='1.0.0'||contract.lesson_code!==code)throw new Error('School branding template mismatch');
 const selected=kind==='zip'?'':packResourcePath(code,kind,contract.resources);
 const files=unzipSync(bytes,{filter:f=>kind==='zip'||f.name===selected||f.name==='BRANDING.json'||f.name.startsWith('assets/')||f.name===root+'assets/school-logo.png'});
 const logo=school.logo_url?(providedLogo??await schoolPackLogo(school)):await schoolPackLogo(school);
 const pdfPaths=Object.keys(files).filter(p=>p.endsWith('.pdf'));
 if(pdfPaths.length){
  const [{PDFDocument,rgb},{default:fontkit}]=await Promise.all([import('pdf-lib'),import('@pdf-lib/fontkit')]);
  for(const path of pdfPaths){
   const slots=contract.pdfs[path];if(!slots)throw new Error('PDF branding slots missing');
   const doc=await PDFDocument.load(files[path]);doc.registerFontkit(fontkit);
   if(doc.getPageCount()!==slots.length)throw new Error('PDF page identity mismatch');
   const regular=await doc.embedFont(files['assets/branding-regular.ttf'],{subset:true});
   const bold=await doc.embedFont(files['assets/branding-bold.ttf'],{subset:true});
   const image=school.logo_url?await doc.embedPng(logo):null;
   for(const [i,page] of doc.getPages().entries()){
    const height=page.getHeight();
    for(const s of slots[i].names){
     const text=s.text.replaceAll(token,school.name),font=s.bold?bold:regular;
     const size=Math.min(s.size,s.size*s.width/Math.max(1,font.widthOfTextAtSize(text,s.size)));
     if(size<5)throw new Error('School name is too long for this PDF layout.');
     const c=s.color;page.drawText(text,{x:s.x,y:height-s.y,size,font,color:rgb(((c>>16)&255)/255,((c>>8)&255)/255,(c&255)/255)});
    }
    if(image)for(const [x0,y0,x1,y1] of slots[i].logos)page.drawImage(image,{x:x0,y:height-y1,width:x1-x0,height:y1-y0});
   }
   doc.setTitle(`${school.name} · ${code} · ${path.split('/').pop()}`);doc.setSubject('Academic IELTS classroom preparation');
   files[path]=await doc.save();
   await new Promise<void>(resolve=>setTimeout(resolve,0));
  }
 }
 for(const path of Object.keys(files)){
  if(path.endsWith('.html'))files[path]=strToU8(strFromU8(files[path]).replaceAll(token,escape(school.name)));
  else if(path.endsWith('.txt'))files[path]=strToU8(strFromU8(files[path]).replaceAll(token,school.name));
  else if(path.endsWith('.pptx')){
   const parts=unzipSync(files[path]),media=contract.pptx_media[path];if(!media||!parts[media])throw new Error('PowerPoint branding missing');
   for(const n of Object.keys(parts))if(n.endsWith('.xml'))parts[n]=strToU8(strFromU8(parts[n]).replaceAll(token,escape(school.name)));
   parts[media]=logo;files[path]=zipSync(parts,{level:6});
  }
 }
 files[root+'assets/school-logo.png']=logo;
 const templateManifest=files['TEMPLATE-MANIFEST.json'];if(templateManifest)files['SOURCE-TEMPLATE-MANIFEST.json']=templateManifest;
 delete files['BRANDING.json'];delete files['TEMPLATE-MANIFEST.json'];
 delete files['assets/branding-regular.ttf'];delete files['assets/branding-bold.ttf'];
 const hashes:Record<string,string>={};for(const [path,bytes] of Object.entries(files))hashes[path]=await packDigest(bytes);
 files['MANIFEST.json']=strToU8(JSON.stringify({lesson_code:code,content_revision:contract.content_revision??'2026-10-17.1',branding_version:'1.0.0',school:{id:school.id,name:school.name,logo_sha256:school.logo_url?await packDigest(logo):null},source_archive_sha256:contract.source_archive_sha256,approved_source_sha256:contract.approved_source_sha256,files:hashes},null,2));
 return new Blob([new Uint8Array(zipSync(files,{level:6}))],{type:'application/zip'});
}
