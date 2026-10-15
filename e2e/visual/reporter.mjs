import fs from 'node:fs';
import {fingerprint} from '../../scripts/visual/inventory.mjs';
export default class VisualReporter{
 rows=[];
 onBegin(){this.startHash=fingerprint();}
 onTestEnd(test,result){this.rows.push({case:test.title,project:test.parent.project()?.name,status:result.status,expectedStatus:test.expectedStatus,errors:result.errors.map(e=>e.message),assets:result.attachments.filter(a=>a.path).map(a=>({name:a.name,path:a.path}))});}
 onEnd(result){const endHash=fingerprint();fs.mkdirSync('.visual-results',{recursive:true});fs.writeFileSync('.visual-results/evidence.json',JSON.stringify({schema:1,sourceHash:this.startHash,endSourceHash:endHash,commit:process.env.GITHUB_SHA??null,runURL:process.env.GITHUB_RUN_ID?`https://github.com/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`:null,comparison:process.env.VISUAL_COMPARE==='1',status:this.startHash===endHash?result.status:'source_changed',tests:this.rows},null,2));}
}
