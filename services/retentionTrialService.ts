import {supabase} from './supabaseClient';
import type{KudosKey,PracticeKind,PracticeResult,PracticeRun,RetentionEvidence,RetentionMetrics,RetentionSnapshot,TrialControl}from '../src/features/retention/retentionModel';
import type { CompanionProfile, CompanionSnapshot, CrewSignal } from '../src/features/retention/companionModel';
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
export const getTrialEvidence=()=>rpc<RetentionEvidence>('rpc_retention_trial_evidence_v2');
const companionCache = new Map<string, { expires: number; data: CompanionSnapshot }>();
const companionPending = new Map<string, Promise<CompanionSnapshot>>();
export function getCompanionSnapshot(userId: string, fresh = false): Promise<CompanionSnapshot> {
 if (fresh) companionCache.delete(userId);
 const cached = companionCache.get(userId);
 if (cached && cached.expires > Date.now()) return Promise.resolve(cached.data);
 const inFlight = companionPending.get(userId); if (inFlight) return inFlight;
 const request = rpc<CompanionSnapshot>('rpc_retention_companion_snapshot').then(data => {
  if (companionCache.size > 8) companionCache.clear();
  companionCache.set(userId, { expires: Date.now() + 60000, data }); return data;
 }).finally(() => companionPending.delete(userId));
 companionPending.set(userId, request); return request;
}
export async function saveCompanion(userId: string, profile: CompanionProfile) {
 const saved = await rpc<CompanionProfile>('rpc_retention_companion_save', { p_name: profile.name, p_palette: profile.palette });
 companionCache.delete(userId); return saved;
}
export async function sendCrewSignal(userId: string, assignmentId: string, kind: CrewSignal) {
 await rpc<boolean>('rpc_retention_crew_signal', { p_assignment_id: assignmentId, p_kind: kind });
 companionCache.delete(userId);
}
const events=new Set<string>();let timer:ReturnType<typeof setTimeout>|undefined;let eventUser:string|undefined;
export function recordTrialEvent(userId:string,kind:string){if(eventUser!==userId){events.clear();if(timer)clearTimeout(timer);timer=undefined;eventUser=userId;}events.add(kind);if(timer)return;timer=setTimeout(()=>{const batch=Array.from(events).slice(0,6);events.clear();timer=undefined;void supabase.auth.getSession().then(({data})=>{if(data.session?.user.id===userId)return rpc<boolean>('rpc_retention_trial_events',{p_kinds:batch});}).catch(()=>{/* Never interrupt learning for analytics. */});},1500);}
