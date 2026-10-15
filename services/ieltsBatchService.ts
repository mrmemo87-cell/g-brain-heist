import { supabase } from './supabaseClient';
import type { CreateIeltsPracticeAssignmentParams, IeltsPracticeAssignmentSummary } from './ieltsPracticeAssignmentService';
export interface IeltsBatch { id:string; name:string; revision:number; student_count:number; eligible_count:number; }
export interface IeltsBatchStudent { id:string; name:string; username:string; class_name:string|null; eligible:boolean; }
export interface IeltsBatchRoster { id:string; name:string; revision:number; members:IeltsBatchStudent[]; candidates:IeltsBatchStudent[]; has_more:boolean; }
async function rpc<T>(name:string,args:Record<string,unknown>):Promise<T>{
 const {data,error}=await supabase.rpc(name,args);
 if(error||data==null)throw Error('This change could not be confirmed. Refresh the batch to check its latest roster, then retry. Saved student work is safe.');
 return data as T;
}
export const ieltsBatches=(school:string)=>rpc<IeltsBatch[]>('rpc_ielts_batches',{p_school:school});
export const ieltsBatchRoster=(batch:string,search='',offset=0)=>rpc<IeltsBatchRoster>('rpc_ielts_batch_roster',{p_batch:batch,p_search:search,p_offset:offset});
export const saveIeltsBatch=(school:string,name:string,students:string[],batch:string|null=null,revision:number|null=null)=>rpc<string>('rpc_ielts_batch_save',{p_school:school,p_name:name,p_students:students,p_batch:batch,p_revision:revision});
export const allocateIeltsBatch=(assignment:string,students?:string[])=>rpc<IeltsPracticeAssignmentSummary>('rpc_ielts_batch_allocate',{p_assignment:assignment,p_students:students??null});
export const createIeltsBatchAssignment=(batch:IeltsBatch,request:string,params:CreateIeltsPracticeAssignmentParams)=>rpc<IeltsPracticeAssignmentSummary>('rpc_ielts_batch_create_assignment',{
 p_batch:batch.id,p_revision:batch.revision,p_request:request,p_title:params.title,p_description:params.description??null,p_due_at:params.dueAt??null,
 p_items:(params.items??[]).map((i,n)=>({skill:i.skill,content_type:i.contentType,content_id:i.contentId,title:i.title??null,required:i.required??true,order_index:i.orderIndex??n})),
});
