import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import{transformSync}from 'esbuild';
const code=transformSync(fs.readFileSync('src/features/retention/retentionModel.ts','utf8'),{loader:'ts',format:'esm'}).code;const m=await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
test('weekly theme resets at Monday midnight Bishkek',()=>{assert.notEqual(m.weeklyTheme(new Date('2026-10-18T17:59:59Z')).name,m.weeklyTheme(new Date('2026-10-18T18:00:00Z')).name);});
test('vault handles zero and bounded progress',()=>{assert.equal(m.vaultPercent(null),0);assert.equal(m.vaultPercent({total:0,completed:4}),0);assert.equal(m.vaultPercent({total:14,completed:13}),93);});
test('practice error messages offer safe recovery',()=>{assert.match(m.trialError({message:'TRIAL_PAUSED'}),/normal/);assert.match(m.trialError({message:'FOCUS_NOT_READY'}),/Weekly Drop/);assert.match(m.trialError({message:'DAILY_LIMIT'}),/tomorrow/);});
