import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { build } from 'esbuild';
const compiled=await build({stdin:{contents:`export {getEntitlements,invalidateEntitlementCache} from './services/entitlementService';export {fetchEffectiveTier,fetchSchoolPlanDetails,invalidateTierCache} from './services/tierService';export {touchPresence} from './services/presenceService';`,resolveDir:process.cwd(),loader:'ts'},bundle:true,format:'cjs',write:false,plugins:[{name:'session-fixture',setup(b){b.onResolve({filter:/supabaseClient$/},()=>({path:'fixture',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export const supabase=globalThis.fixture;',loader:'js'}));}}]});
function setup(){
 let token='account-a';let fail=false;const calls=[];
 const context=vm.createContext({module:{exports:{}},console,Date,Promise,fixture:{auth:{getSession:async()=>({data:{session:{access_token:token}}})},rpc:async name=>{calls.push(name);await Promise.resolve();return {data: name==='get_effective_tier'?'pro':{success:true,plan:'pro',has_subscription:false,entitlements:{assignments:{enabled:true,limit_value:10}}},error:fail?{message:'offline'}:null};}}});
 vm.runInContext(compiled.outputFiles[0].text,context);
 return {api:context.module.exports,calls,account:v=>{token=v;},failure:v=>{fail=v;}};
}
test('30 overlapping UI requests issue one RPC per resource and account changes invalidate access',async()=>{
 const {api,calls,account}=setup();
 await Promise.all(Array.from({length:30},()=>Promise.all([api.getEntitlements(),api.fetchEffectiveTier(),api.fetchSchoolPlanDetails(),api.touchPresence()])));
 for(const rpc of ['get_my_effective_entitlements','get_effective_tier','get_school_plan_details','get_billing_subscription','rpc_touch_last_seen']) assert.equal(calls.filter(n=>n===rpc).length,1,rpc);
 account('account-b');await api.getEntitlements();
 assert.equal(calls.filter(n=>n==='get_my_effective_entitlements').length,2);
});
test('failed entitlement refresh clears prior cached privileges and is immediately retryable',async()=>{
 const {api,calls,failure}=setup();
 assert.equal((await api.getEntitlements()).canUse('assignments'),true);
 failure(true);assert.equal((await api.getEntitlements(true)).canUse('assignments'),false);
 failure(false);assert.equal((await api.getEntitlements()).canUse('assignments'),true);
 assert.equal(calls.length,3);
});
