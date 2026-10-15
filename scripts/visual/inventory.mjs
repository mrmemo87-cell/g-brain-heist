import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import ts from 'typescript';
export const root=process.cwd();
export const walk=(dir)=>fs.existsSync(dir)?fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(`${dir}/${e.name}`):[`${dir}/${e.name}`]):[];
export function discover(){
 const text=fs.readFileSync('index.tsx','utf8'),ast=ts.createSourceFile('index.tsx',text,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 const imports=Object.fromEntries([...text.matchAll(/const (\w+) = lazyRetry\(\(\) => import\('([^']+)'\)/g)].map(m=>[m[1],m[2].replace(/^\.\//,'')+'.tsx']));
 const routes=[];function visit(node){
  if(ts.isObjectLiteralExpression(node)){
   const p=node.properties.find(p=>p.name?.getText(ast)==='path');
   if(p&&ts.isPropertyAssignment(p)&&ts.isStringLiteral(p.initializer)&&p.initializer.text.startsWith('/ielts')){
    const tags=[...node.getText(ast).matchAll(/<([A-Z]\w*)/g)].map(m=>m[1]);
    routes.push({route:p.initializer.text,sources:[...new Set(tags.filter(t=>imports[t]&&!/Guard$|SchoolAdminIeltsRoute/.test(t)).map(t=>imports[t]))]});
   }
  }ts.forEachChild(node,visit);
 }visit(ast);
 if(routes.some(r=>!r.sources.length))throw Error('An IELTS route has no classified page source: '+routes.filter(r=>!r.sources.length).map(r=>r.route).join(', '));
 const pages=[...new Set([...routes.flatMap(r=>r.sources),...walk('src/pages/ielts').filter(p=>p.endsWith('.tsx')),...walk('src/components/ielts').filter(p=>/(?:Modal|Workspace|Review|Editor|Hub|Result|Card|Ui)\.tsx$/.test(p))])].sort();
 return pages.map(source=>({id:path.basename(source,'.tsx'),source,routes:routes.filter(r=>r.sources.includes(source)).map(r=>r.route)}));
}
export function fingerprint(){
 const paths=[...new Set(['index.tsx','App.tsx','package.json','package-lock.json','tailwind.config.js','postcss.config.js','docs/ielts/IELTS_VISUAL_UX_BIBLE.md',...walk('src'),...walk('components'),...walk('services'),...walk('hooks'),...walk('types'),...walk('public'),...walk('e2e/visual').filter(p=>!p.includes('/baselines/')&&!p.endsWith('reviews.json')),...walk('scripts/visual')])].filter(p=>fs.existsSync(p)).sort();
 const hash=crypto.createHash('sha256');for(const p of paths)hash.update(p+'\0').update(fs.readFileSync(p)).update('\0');return hash.digest('hex');
}
if(process.argv[1]?.endsWith('/inventory.mjs')){
 const file='e2e/visual/inventory.json',found=discover();
 if(process.argv.includes('--write')){
  const previous=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):[];
  fs.writeFileSync(file,JSON.stringify(found.map(item=>({...item,roles:/Admin|Funnel/.test(item.id)?['platform_admin']:/Programme|Teacher|Manager|Monitor|Review|LessonLibrary|Batches|PlanDesk/.test(item.id)?['teacher','school_admin']:['student'],requiredStates:['populated','empty','loading','error'],deviceReviewRequired:true,...previous.find(p=>p.id===item.id),...item})),null,2)+'\n');
 }else{
  const saved=JSON.parse(fs.readFileSync(file,'utf8'));
  if(JSON.stringify(saved.map(({id,source,routes})=>({id,source,routes})))!==JSON.stringify(found))throw Error('IELTS screen inventory drift: run npm run visual:inventory:update and classify new screens.');
  console.log(`Inventory covers ${found.length} page surfaces and ${new Set(found.flatMap(s=>s.routes)).size} routes. Embedded pages are included; shared component states are tracked in cases.mjs.`);
 }
}
