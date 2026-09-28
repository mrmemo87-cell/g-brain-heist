import test from 'node:test';
import assert from 'node:assert/strict';
import { createBootstrapFlight, sameBootstrapAuthority, type AuthBootstrap } from '../src/lib/authBootstrap';
import { resolveAccountWorkspace } from '../src/lib/accountWorkspace';
import type { SchoolCapabilities } from '../services/schoolAdminService';
const caps = (patch: Partial<SchoolCapabilities> = {}): SchoolCapabilities => ({
  school_id:'school',role:'student',is_owner:false,can_administer:false,can_teach:false,has_active_teacher_allocation:false,...patch,
});
test('workspace routing preserves owners, allocations, guardians and authorised preferences',()=>{
  assert.equal(resolveAccountWorkspace('teacher',null,false),'teacher');
  assert.equal(resolveAccountWorkspace('school_admin',caps({can_administer:true}),false),'school_admin');
  assert.equal(resolveAccountWorkspace('student',caps({is_owner:true}),false),'school_head');
  assert.equal(resolveAccountWorkspace('school_admin',caps({can_administer:true,is_owner:true}),false),'workspace_chooser');
  const dual=caps({can_administer:true,can_teach:true,has_active_teacher_allocation:true});
  assert.equal(resolveAccountWorkspace('school_admin',dual,false),'workspace_chooser');
  assert.equal(resolveAccountWorkspace('school_admin',dual,false,null,'teacher'),'teacher');
  assert.equal(resolveAccountWorkspace('school_admin',{...dual,has_active_teacher_allocation:false},false,'teacher','teacher'),'school_admin');
  assert.equal(resolveAccountWorkspace('teacher',null,true),'workspace_chooser');
  assert.equal(resolveAccountWorkspace('teacher',null,true,'parent'),'parent');
  assert.equal(resolveAccountWorkspace('teacher',null,false,'admin','school_head'),'teacher');
});
test('concurrent bootstrap consumers share one request; later logins recheck',async()=>{
  let calls=0;const f=createBootstrapFlight(async()=>++calls);
  const a=f.load('a'),b=f.load('a');assert.equal(a,b);assert.equal(await a,1);assert.equal(await f.load('a'),2);
});
test('sign out and account switching invalidate late results',async()=>{
  const done:Array<(s:string)=>void>=[];const f=createBootstrapFlight<string>(()=>new Promise(resolve=>done.push(resolve)));
  const a=f.load('a');const rejected=assert.rejects(a,/Sign-in changed/);const b=f.load('b');
  done[0]('old');done[1]('new');await rejected;assert.equal(await b,'new');
  const late=f.load('b');const rejected2=assert.rejects(late,/Sign-in changed/);f.clear();done[2]('late');await rejected2;
});
test('failed bootstrap retries without caching failure',async()=>{
  let calls=0;const f=createBootstrapFlight(async()=>{if(++calls===1)throw new Error('offline');return 'ready'});
  await assert.rejects(f.load('a'),/offline/);assert.equal(await f.load('a'),'ready');
});
test('resume preserves an active workspace unless authority changes',()=>{
  const a={user_id:'a',email_verified:true,needs_setup:false,is_banned:false,capabilities:null,is_superadmin:false,has_parent_workspace:false,profile:{role:'student',school_id:'s',coins:2}} as AuthBootstrap;
  assert.equal(sameBootstrapAuthority(a,{...a,profile:{...a.profile!,coins:20}}),true);
  assert.equal(sameBootstrapAuthority(a,{...a,is_banned:true}),false);
  assert.equal(sameBootstrapAuthority(a,{...a,has_parent_workspace:true}),false);
  assert.equal(sameBootstrapAuthority(a,{...a,capabilities:caps({can_administer:true})}),false);
});
