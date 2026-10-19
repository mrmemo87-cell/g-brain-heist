import { supabase } from './supabaseClient';
import type { CreateIeltsPracticeAssignmentParams, IeltsPracticeAssignmentSummary } from './ieltsPracticeAssignmentService';
export interface IeltsBatch { id:string; name:string; revision:number; student_count:number; eligible_count:number; archived_at?:string|null;delete_allowed?:boolean; }
export interface IeltsBatchStudent { id:string; name:string; username:string; class_name:string|null; eligible:boolean; }
export interface IeltsBatchRoster { id:string; name:string; revision:number; members:IeltsBatchStudent[]; candidates:IeltsBatchStudent[]; has_more:boolean; archived_at?:string|null; }
async function rpc<T>(name:string,args:Record<string,unknown>):Promise<T>{
 const {data,error}=await supabase.rpc(name,args);
 if(error)throw Error('This change could not be confirmed. Refresh the batch to check its latest roster, then retry. Saved student work is safe.');
 return data as T;
}
export const ieltsBatches=(school:string,includeArchived=false)=>rpc<IeltsBatch[]>('rpc_ielts_batches',{p_school:school}).then(rows=>includeArchived?rows:rows.filter(b=>!b.archived_at));
export const ieltsBatchRoster=(batch:string,search='',offset=0)=>rpc<IeltsBatchRoster>('rpc_ielts_batch_roster',{p_batch:batch,p_search:search,p_offset:offset});
export const saveIeltsBatch=(school:string,name:string,students:string[],batch:string|null=null,revision:number|null=null)=>rpc<string>('rpc_ielts_batch_save',{p_school:school,p_name:name,p_students:students,p_batch:batch,p_revision:revision});
export const allocateIeltsBatch=(assignment:string,students?:string[])=>rpc<IeltsPracticeAssignmentSummary>('rpc_ielts_batch_allocate',{p_assignment:assignment,p_students:students??null});
/** students: the chosen batch members; the draft snapshots exactly these (omit for the whole batch). */
export const createIeltsBatchAssignment=(batch:IeltsBatch,request:string,params:Omit<CreateIeltsPracticeAssignmentParams,'schoolId'>,students?:string[])=>rpc<IeltsPracticeAssignmentSummary>(students?'rpc_ielts_batch_create_assignment_for':'rpc_ielts_batch_create_assignment',{
 p_batch:batch.id,p_revision:batch.revision,p_request:request,p_title:params.title,p_description:params.description??null,p_due_at:params.dueAt??null,
 p_items:(params.items??[]).map((i,n)=>({skill:i.skill,content_type:i.contentType,content_id:i.contentId,title:i.title??null,required:i.required??true,order_index:i.orderIndex??n})),
 ...(students?{p_students:students}:{}),
});

export const changeIeltsBatch=(batch:string,revision:number,action:'archive'|'restore'|'delete')=>rpc<void>('rpc_ielts_batch_lifecycle',{p_batch:batch,p_revision:revision,p_action:action});
export interface BatchPracticeTask {code:string;display_code:string;title:string;skill:string;purpose:string;instructions:string;success_description:string;originality_label?:string;}
export interface BatchPracticePreview {batch:{id:string;name:string;revision:number};tasks:BatchPracticeTask[];students:{id:string;name:string;class_name:string;eligible:boolean;source_ready:boolean;source_id?:string|null;prior_count:number;active:boolean}[];}
export const batchPracticePreview=(batch:string,task:string|null=null)=>rpc<BatchPracticePreview>('rpc_ielts_batch_practice_preview',{p_batch:batch,p_task:task});
export const assignBatchPractice=(batch:string,revision:number,task:string,students:string[],reason:string,due:string|null,request:string,repeat:boolean,reviewed:boolean)=>rpc<{assigned_count:number;allocation_ids:string[]}>('rpc_ielts_batch_assign_practice',{p_batch:batch,p_revision:revision,p_task:task,p_students:students,p_reason:reason,p_due:due,p_request:request,p_repeat:repeat,p_reviewed:reviewed});
/** Weekly learning loop (Diagnostic Bible 2.0.0 sections 8A.4A and 15B.5), computed on the server under bh-learning-policy-v1. */
export type LearningState='possible_difficulty'|'repeated_difficulty'|'persistent_candidate'|'difficulty_observed_again'|'mixed'|'improvement_observed'|'improvement_sustained'|'possible_strength'|'repeated_strength'|'no_concern';
export interface LoopPractice {material_type:string;material_id:string;display_code:string|null;title:string;purpose:string;}
export interface LoopConstruct {node_id:string;code:string;name:string;skill:string;state:LearningState;stale:boolean;sources:number;opportunities:number;correct:number;newest_at:string|null;practised_at?:string|null;practice:LoopPractice[];extension:string|null;}
export interface BatchLearningLoop {batch:{id:string;name:string;revision:number};policy:string;students:{id:string;name:string;has_evidence:boolean;constructs:LoopConstruct[]}[];gaps:{node_id:string;code:string;name:string}[];}
export const batchLearningLoop=(batch:string)=>rpc<BatchLearningLoop>('rpc_ielts_batch_learning_loop',{p_batch:batch});
export type PracticeEffectVerdict='waiting_for_check'|'no_starting_point'|'too_few_questions'|'higher'|'higher_not_secure'|'similar'|'lower'|'teacher_judged'|'not_practised';
export interface PracticeEffectCheck{code:string;display_code:string|null;title:string;}
export interface PracticeEffectRow{student_id:string;student:string;node_id:string;code:string;skill_name:string;first_practice_at:string;last_practice_at:string;practice_count:number;practice:string[]|null;verdict:PracticeEffectVerdict;before:{opportunities:number;correct:number;at:string|null};after:{opportunities:number;correct:number;at:string|null};fresh_checks:PracticeEffectCheck[];pending_checks:PracticeEffectCheck[];}
export interface BatchPracticeEffect{batch:{id:string;name:string;revision:number};policy:string;rows:PracticeEffectRow[];members:number;}
export const batchPracticeEffect=(batch:string)=>rpc<BatchPracticeEffect>('rpc_ielts_batch_practice_effect',{p_batch:batch});
export type ProductiveVerdict='higher'|'similar'|'lower'|'waiting_for_fresh_task'|'different_scales'|'no_rating';
export interface ProductiveRating{at:string;task:string;scale:'band'|'status';value:string;source:'practice'|'screener'|'interview';}
export interface ProductiveEffectRow{student_id:string;student:string;skill:'writing'|'speaking';criterion:string;verdict:ProductiveVerdict;pieces:number;first:ProductiveRating|null;last:ProductiveRating|null;}
export interface BatchProductiveEffect{batch:{id:string;name:string;revision:number};policy:string;rows:ProductiveEffectRow[];}
export const batchProductiveEffect=(batch:string)=>rpc<BatchProductiveEffect>('rpc_ielts_batch_productive_effect',{p_batch:batch});
export interface CoverageCount{released:number;pilot:number;}
export interface SkillCoverageRow{skill:'listening'|'reading'|'writing'|'speaking';ord:number;code:string;name:string;method:'fresh_questions'|'teacher_ratings';practice:CoverageCount;checks:CoverageCount;materials:number;baseline:{screener?:boolean;mock?:boolean;interview?:boolean};students_measured:number;students_rated?:number;}
export interface BatchSkillCoverage{batch:{id:string;name:string;revision:number};policy:string;members:number;rows:SkillCoverageRow[];}
export const batchSkillCoverage=(batch:string)=>rpc<BatchSkillCoverage>('rpc_ielts_batch_skill_coverage',{p_batch:batch});
