import {supabase} from './supabaseClient';
import type {ReportEvidence} from './ieltsLearningReportService';
export const readinessSkills=['listening','reading','writing','speaking'] as const;
export type ReadinessSkill=typeof readinessSkills[number];
export interface ReadinessRange{lower:number|null;upper:number|null;rationale:string;limitations:string;next_action:string;sources:string[]}
export interface ReadinessFields{skills:Record<ReadinessSkill,ReadinessRange>;overall:ReadinessRange;teacher_checked:boolean}
export interface ReadinessWorkspace{can_manage:boolean;eligible:boolean;source_hash:string|null;evidence:ReportEvidence[];latest_id:string|null;needs_review:boolean;estimate:null|{id:string;fields:ReadinessFields;created_at:string;author:string;policy:string}}
const empty=():ReadinessRange=>({lower:null,upper:null,rationale:'More evidence is needed before estimating this scope.',limitations:'Short starting-point assessment with partial task coverage.',next_action:'Arrange the missing independent evidence and teacher review.',sources:[]});
export const emptyReadiness=():ReadinessFields=>({skills:Object.fromEntries(readinessSkills.map(s=>[s,empty()])) as Record<ReadinessSkill,ReadinessRange>,overall:empty(),teacher_checked:false});
export const readinessRangeLabel=(r:ReadinessRange)=>r.lower==null||r.upper==null?'More evidence needed':`${r.lower.toFixed(1)}–${r.upper.toFixed(1)}`;
export const readinessLimit='Based on short assessments and teacher judgment; not a calibrated prediction. Confirm with a fuller assessment.';
export async function readinessWorkspace(school:string|null=null,student:string|null=null):Promise<ReadinessWorkspace>{const {data,error}=await supabase.rpc('rpc_ielts_readiness_workspace',{p_school:school,p_student:student});if(error)throw Error('Readiness evidence could not load. Your saved work is safe. Retry after checking your connection.');return data as ReadinessWorkspace;}
export async function publishReadiness(school:string,student:string,fields:ReadinessFields,hash:string,expected:string|null,request:string,draft:string|null=null){const {data,error}=await supabase.rpc(draft?'rpc_ielts_publish_readiness_with_draft':'rpc_ielts_publish_readiness',{p_school:school,p_student:student,p_fields:fields,p_hash:hash,p_expected:expected,p_request:request,...(draft?{p_draft:draft}:{})});if(error)throw Error('This estimate could not be shared. Refresh the evidence before retrying; another review or decision may have changed.');return data as string;}

export async function draftReadiness(school:string,student:string){const {data,error}=await supabase.functions.invoke('ielts_readiness_teacher_ai',{body:{schoolId:school,studentId:student}});if(error||!data?.fields||data.teacher_confirmation_required!==true)throw Error('AI help could not finish. Continue selecting your own ranges. Nothing has been shared.');return data as {id:string;fields:ReadinessFields;source_hash:string};}
