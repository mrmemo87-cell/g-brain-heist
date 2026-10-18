import { supabase } from './supabaseClient';
export const teacherPackBucket = 'ielts-teacher-course-packs';
export interface PackSchool{id:string;name:string;logo_url:string|null}
export type PackResource='zip'|'slides'|'workbook'|'pptx';
export interface ApprovedTeacherPack {
 lesson_code: string; title: string; version: string;
 object_path: string; sha256: string; size_bytes: number;
 school:PackSchool; branding_version:'1.0.0';
}
export async function approvedTeacherPacks(schoolId: string): Promise<ApprovedTeacherPack[]> {
 const {data,error}=await supabase.rpc('rpc_ielts_teacher_pack_catalogue',{p_school:schoolId});
 const school=data?.school;
 if(error || data?.school_id!==schoolId || school?.id!==schoolId || typeof school.name!=='string' || !school.name.trim() ||
  school.name.length>200 || (school.logo_url!==null && (typeof school.logo_url!=='string'||!school.logo_url.startsWith('https://'))) ||
  data?.release!=='teacher_only' || !Array.isArray(data.packs))throw new Error('Teaching packs unavailable');
 for(const p of data.packs) {
  if(!/^IELTS-(0[1-9]|1[0-9]|2[0-4]|X[1-8]|M[1-3])$/.test(p.lesson_code) || typeof p.title!=='string' || !p.title.trim() ||
   typeof p.version!=='string' || !/^[a-f0-9]{64}$/.test(p.sha256) || p.branding_version!=='1.0.0' ||
   !Number.isInteger(p.size_bytes) || p.size_bytes<1 || p.size_bytes>20000000 ||
   p.object_path!==`templates/${p.lesson_code}/${p.branding_version}/${p.sha256}.zip`)
    throw new Error('Teaching pack identity mismatch');
 }
 return data.packs.map((p:ApprovedTeacherPack)=>({...p,school}));
}
export async function approvedTeacherPackSource(pack: ApprovedTeacherPack): Promise<Blob> {
 const {data,error}=await supabase.storage.from(teacherPackBucket).download(pack.object_path);
 if(error || !data || data.size!==pack.size_bytes) throw new Error('Teaching pack unavailable');
 const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await data.arrayBuffer())),n=>n.toString(16).padStart(2,'0')).join('');
 if(hash!==pack.sha256) throw new Error('Teaching pack verification failed');
 return data;
}
export async function approvedTeacherPackBlob(pack:ApprovedTeacherPack,kind:PackResource='zip'):Promise<Blob>{
 const source=await approvedTeacherPackSource(pack);
 const {brandTeacherPack}=await import('./ieltsPackBranding');
 return brandTeacherPack(source,pack.school,pack.lesson_code,kind);
}
