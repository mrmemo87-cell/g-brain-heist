import test from 'node:test';import assert from 'node:assert/strict';import {build} from 'esbuild';
// Material pickers never show file-style names, and lists are grouped by skill and sorted by code number.
const out=await build({entryPoints:['src/pages/ielts/materialLabel.ts'],bundle:true,format:'esm',write:false,platform:'node'});
const m=await import('data:text/javascript;base64,'+Buffer.from(out.outputFiles[0].text).toString('base64'));
test('speaking bank items get a readable title from their prompt',()=>{
 assert.equal(m.friendlyTitle({title:'practice-bank-01-sb01',description:"Let's talk about your daily routine. What time do you usually get up on weekdays?"}),'Your daily routine');
 assert.equal(m.friendlyTitle({title:'practice-bank-01-sb04',description:'Describe a skill you learned that took a long time to master.\n\nYou should say:'}),'A skill you learned that took a long time to master');
 assert.equal(m.friendlyTitle({title:'Fast fashion',description:'Some people…'}),'Fast fashion');
 assert.equal(m.friendlyTitle({title:'hometown-part1',description:null}),'hometown-part1');
});
test('groups by skill in IELTS order and sorts by code number',()=>{
 const g=m.groupBySkill([{skill:'reading',display_code:'R-026'},{skill:'listening',display_code:'L-025'},{skill:'reading',display_code:'R-002'},{skill:'speaking',display_code:'S-001'},{skill:'listening',display_code:'L-002'}]);
 assert.deepEqual(g.map(x=>x.label),['Listening','Reading','Speaking']);
 assert.deepEqual(g[0].items.map(i=>i.display_code),['L-002','L-025']);assert.deepEqual(g[1].items.map(i=>i.display_code),['R-002','R-026']);
});
