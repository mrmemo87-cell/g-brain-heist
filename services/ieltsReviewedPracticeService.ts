import {supabase} from './supabaseClient';
/** Same canonical task, immutable approved delivery revision; never an alternate screener. */
export async function reviewedPracticeDelivery(type:'ielts_writing_task'|'ielts_speaking_task',id:string):Promise<Record<string,unknown>>{
 const {data,error}=await supabase.rpc('rpc_ielts_reviewed_practice_delivery',{p_type:type,p_id:id});
 if(error)throw Error('The approved practice version could not load. Please retry.');
 return data??{};
}
export async function availablePracticeIds(type:string):Promise<Set<string>>{
 const {data,error}=await supabase.rpc('rpc_ielts_practice_available_ids',{p_type:type});
 if(error||!Array.isArray(data))throw Error('Available practice could not load. Please retry.');
 return new Set(data.map(String));
}
