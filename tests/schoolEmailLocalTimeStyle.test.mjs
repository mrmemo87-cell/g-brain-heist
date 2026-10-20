import test from 'node:test';import assert from 'node:assert/strict';import {build} from 'esbuild';import {readFileSync} from 'node:fs';
// Owner 2026-10-20: dates in school emails use the school's local time, and the layout is light and professional.
const out=await build({entryPoints:['supabase/functions/_shared/email.ts'],bundle:true,format:'esm',platform:'neutral',write:false,logLevel:'silent'});
const m=await import('data:text/javascript;base64,'+Buffer.from(out.outputFiles[0].text).toString('base64'));
const disp=readFileSync('supabase/functions/school_email_dispatcher/index.ts','utf8');
const mig=readFileSync('supabase/migrations/20261020080000_school_time_zone.sql','utf8');

test('due dates show in the school time zone with a plain label',()=>{
 assert.equal(m.fmtIn('2026-10-24T12:00:00Z','Asia/Bishkek'),'Sat, 24 Oct 2026 at 6:00 PM (Bishkek time)');
 assert.equal(m.fmtIn('2026-07-01T09:05:00Z','America/New_York'),'Wed, 1 Jul 2026 at 5:05 AM (New York time)');
 assert.equal(m.fmtIn('2026-10-24T12:00:00Z',null),'Sat, 24 Oct 2026 at 12:00 PM (UTC)','no time zone is labelled UTC, never guessed');
 assert.equal(m.fmtIn('2026-10-24T12:00:00Z','Not/AZone'),'Sat, 24 Oct 2026 at 12:00 PM (UTC)');
 assert.equal(m.fmtIn('',null),'Not specified');});

test('every school email path uses the school time zone',()=>{
 assert.equal((disp.match(/select\("id,name,logo_url,time_zone"\)/g)||[]).length,3);
 assert.ok(!/timeZone: "UTC"/.test(disp));
 assert.match(disp,/const fmt = \(value: unknown\) => fmtIn\(value, timeZone\);/);
 assert.match(disp,/templateFor\(row, contextSchoolName, isPlatformOperations \? null : contextSchool\.time_zone\)/);
 assert.match(disp,/fmtIn\(assignment\.due_at, school\.time_zone\)/);assert.match(disp,/fmtIn\(invitation\.expires_at, school\.time_zone\)/);
 assert.match(mig,/pg_timezone_names where name = new\.time_zone/);assert.match(mig,/set time_zone = 'Asia\/Bishkek' where id = '8eeecf5d-0496-4e0d-b5cd-538f91c9cfa0'/);
 assert.ok(!/\bdrop\b/i.test(mig));});

test('the layout is light, escapes content, keeps both brands and a plain-link fallback',()=>{
 const r=m.renderBrandedEmail({name:'Silk Road <School>',logo_url:'https://x.test/l.png'},{subject:'S',preview:'P',kicker:'IELTS practice',headline:'You have a new IELTS task',intro:'Hi',details:[{label:'Due',value:'Sat'},{label:'Empty',value:''}],action:{label:'Open my IELTS work',url:'https://www.brainsheist.com/ielts'}});
 assert.match(r.html,/<meta name="color-scheme" content="light">/);assert.match(r.html,/background:#ffffff/);
 assert.ok(r.html.includes('Silk Road &lt;School&gt;')&&!r.html.includes('Silk Road <School>'));
 assert.match(r.html,/alt="Brains Heist logo"/);assert.match(r.html,/https:\/\/x\.test\/l\.png/);
 assert.match(r.html,/If the button doesn’t work, open/);assert.ok(!r.html.includes('>Empty<'),'empty details are dropped');
 assert.match(r.html,/Marks, results and feedback are never included in email/);
 assert.match(r.text,/Due: Sat/);
 const ops=m.renderBrandedEmail({name:'x'},{subject:'s',preview:'p',kicker:'k',headline:'h',intro:'i'},'platform_operations');
 assert.match(ops.html,/Brains Heist Operations/);assert.ok(!ops.html.includes('Sent on behalf of'));});
