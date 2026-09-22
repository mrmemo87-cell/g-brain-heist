-- School Subjects v2 / explicit RPC permission boundary.

revoke all on function public.get_all_active_questions(text,text,uuid,integer,integer)
  from public,anon,authenticated,service_role;
grant execute on function public.get_all_active_questions(text,text,uuid,integer,integer)
  to authenticated,service_role;

revoke all on function public.rpc_student_academic_subjects(uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.rpc_student_academic_subjects(uuid)
  to authenticated,service_role;

revoke all on function public.rpc_school_admin_subject_catalog(uuid,boolean)
  from public,anon,authenticated,service_role;
grant execute on function public.rpc_school_admin_subject_catalog(uuid,boolean)
  to authenticated,service_role;

revoke all on function public.rpc_school_admin_save_school_subject(uuid,text,uuid,text,uuid,uuid,text,uuid,text,uuid[],uuid,uuid[],boolean)
  from public,anon,authenticated,service_role;
grant execute on function public.rpc_school_admin_save_school_subject(uuid,text,uuid,text,uuid,uuid,text,uuid,text,uuid[],uuid,uuid[],boolean)
  to authenticated,service_role;

revoke all on function public.rpc_school_admin_delete_school_subject(uuid,uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.rpc_school_admin_delete_school_subject(uuid,uuid)
  to authenticated,service_role;

revoke all on function public.rpc_superadmin_subject_mapping_requests(text)
  from public,anon,authenticated,service_role;
grant execute on function public.rpc_superadmin_subject_mapping_requests(text)
  to authenticated,service_role;
