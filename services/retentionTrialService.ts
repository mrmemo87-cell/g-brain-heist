import {supabase} from './supabaseClient';
import type{KudosKey,PracticeKind,PracticeResult,PracticeRun,RetentionMetrics,RetentionSnapshot,TrialControl}from '../src/features/retention/retentionModel';
const cache=new Map<string,{expires:number;data:RetentionSnapshot}>();
const pending=new Map<string,Promise<RetentionSnapshot>>();
async function rpc<T>(name:string,args?:Record<string,unknown>):Promise<T>{const{data,error}=await supabase.rpc(name,args).abortSignal(AbortSignal.timeout(8000));if(error)throw error;return data as T;}
export const trialStatus=()=>rpc<{enabled:boolean}>('rpc_retention_trial_status');
export async function trialSnapshot(userId:string,fresh=false){if(fresh)cache.delete(userId);const saved=cache.get(userId);if(saved&&saved.expires>Date.now())return saved.data;const inFlight=pending.get(userId);if(inFlight)return inFlight;const request=rpc<RetentionSnapshot>('rpc_retention_trial_snapshot').then(data=>{if(cache.size>8)cache.clear();cache.set(userId,{expires:Date.now()+60000,data});return data;}).finally(()=>pending.delete(userId));pending.set(userId,request);return request;}
export const startTrialPractice=(kind:PracticeKind)=>rpc<PracticeRun>('rpc_retention_trial_start',{p_kind:kind});
export async function finishTrialPractice(userId:string,runId:string,answers:string[]){const result=await rpc<PracticeResult>('rpc_retention_trial_finish',{p_run_id:runId,p_answers:answers});cache.delete(userId);return result;}
export async function sendTrialKudos(userId:string,assignmentId:string,key:KudosKey){await rpc<boolean>('rpc_retention_trial_kudos',{p_assignment_id:assignmentId,p_message_key:key});cache.delete(userId);}
export const getTrialControl=()=>rpc<TrialControl>('rpc_retention_trial_control');
export const setTrialControl=(c:TrialControl)=>rpc<TrialControl>('rpc_retention_trial_control',{p_enabled:c.enabled,p_audience:c.audience,p_pilot_user_ids:c.pilot_user_ids,p_school_id:c.school_id});
export const getTrialMetrics=()=>rpc<RetentionMetrics>('rpc_retention_trial_metrics');
const events=new Set<string>();let timer:ReturnType<typeof setTimeout>|undefined;let eventUser:string|undefined;
export function recordTrialEvent(userId:string,kind:string){if(eventUser!==userId){events.clear();if(timer)clearTimeout(timer);timer=undefined;eventUser=userId;}events.add(kind);if(timer)return;timer=setTimeout(()=>{const batch=Array.from(events).slice(0,6);events.clear();timer=undefined;void supabase.auth.getSession().then(({data})=>{if(data.session?.user.id===userId)return rpc<boolean>('rpc_retention_trial_events',{p_kinds:batch});}).catch(()=>{/* Never interrupt learning for analytics. */});},1500);}
