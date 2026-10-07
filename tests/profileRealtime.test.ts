import test from 'node:test';
import assert from 'node:assert/strict';
import { hasSignificantProfileChange } from '../services/profileRealtime';
import type { Profile } from '../types';
const current = {id:'student',xp:100,coins:20,level:2,gemstones:3,ap_now:40,is_banned:false,banned_until:null,streak:1,required_changes:{name:true,fields:['name','avatar'],options:{a:true,b:false}}} as Partial<Profile>;
test('presence-only events compare local values rather than an old primary-key-only payload',()=>{
 const next={...current,required_changes:{options:{b:false,a:true},fields:['name','avatar'],name:true},last_seen:'later'};
 assert.equal(hasSignificantProfileChange(current,next),false);
 assert.equal(hasSignificantProfileChange({id:current.id},next),true);
 assert.equal(hasSignificantProfileChange(current,{id:current.id,last_seen:'later'}),false);
});
test('ban, AP, reward and nested restriction changes still trigger enforcement/UI updates',()=>{
 for(const next of [{...current,is_banned:true},{...current,profile_locked:true},{...current,active_cosmetic_frame:'neon' as const},{...current,role:'teacher' as const},{...current,coins:21},{...current,ap_now:41},{...current,required_changes:{...current.required_changes,options:{a:true,b:true}}},{...current,required_changes:null}]) {
  assert.equal(hasSignificantProfileChange(current,next),true);
 }
 assert.equal(hasSignificantProfileChange({...current,required_changes:null},{...current,required_changes:undefined}),false);
});
test('restriction array ordering remains meaningful',()=>{
 assert.equal(hasSignificantProfileChange(current,{...current,required_changes:{...current.required_changes,fields:['avatar','name']}}),true);
});
