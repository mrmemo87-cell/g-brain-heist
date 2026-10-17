import {prepareBookletPrint,BOOKLET_PRINT_CSS,type BookletPrintSettings} from './printBooklets';
async function start(){
 const style=document.createElement('style');style.textContent=BOOKLET_PRINT_CSS+'.question-pack .page{min-height:0;break-after:auto}.question-page-body h1{font-size:24px}.question-page-body h2{font-size:20px}.bar label{display:flex;align-items:center;gap:6px}.bar select{min-height:44px}.bar input{min-width:24px;min-height:24px}';document.head.append(style);
 const content=document.querySelector<HTMLElement>('[data-lesson-print]');if(!content)return;
 const status=document.getElementById('lesson-print-status')!,button=document.getElementById('lesson-print') as HTMLButtonElement,original=content.innerHTML;
 let busy=false;
 async function prepare(){if(busy)return;busy=true;button.disabled=true;status.textContent='Preparing pages…';
 try{content!.innerHTML=original;await document.fonts?.ready;
 await Promise.all(Array.from(content!.querySelectorAll('img')).map(async img=>{let timer:ReturnType<typeof setTimeout>|undefined;try{await Promise.race([img.decode(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('School logo unavailable. Reload before printing.')),10000);})]);}finally{if(timer)clearTimeout(timer);}}));
 const settings:BookletPrintSettings={keepTogether:(document.getElementById('lesson-keep') as HTMLInputElement).checked,duplex:(document.getElementById('lesson-duplex') as HTMLInputElement).checked,pagesPerSide:Number((document.getElementById('lesson-pages') as HTMLSelectElement).value) as 1|2|4};
 const plan=prepareBookletPrint(document,settings);const pages=Array.from(content!.querySelectorAll<HTMLElement>('.question-page'));
 pages.forEach((p,i)=>{const footer=document.createElement('small');footer.textContent=`${document.title} · Page ${i+1} of ${pages.length}`;footer.style.cssText='position:absolute;bottom:5mm;left:16mm;right:16mm;font:10px Arial;color:#4c6076';p.style.position='relative';p.append(footer);});
 status.textContent=`${plan.contentPages} pages · ${plan.physicalSheets} sheets. In the print dialog choose A4, ${settings.duplex?'double-sided':'single-sided'}, ${settings.pagesPerSide} page(s) per side, actual size, headers/footers off.`;button.disabled=false;
 }catch(e){status.textContent=e instanceof Error?e.message:'Layout unavailable. Reload to retry.';}finally{busy=false;}}
 button.onclick=()=>window.print();document.querySelectorAll('.bar input,.bar select').forEach(c=>c.addEventListener('change',()=>void prepare()));await prepare();
}
void start();
