
revoke all on function public.rpc_academic_reporting_context(uuid)
from public,anon,authenticated,service_role;
grant execute on function public.rpc_academic_reporting_context(uuid)
to authenticated,service_role;

revoke all on function public.rpc_student_academic_subjects(uuid)
from public,anon,authenticated,service_role;
grant execute on function public.rpc_student_academic_subjects(uuid)
to authenticated,service_role;

revoke all on function public.rpc_student_learning_catalog(text,integer)
from public,anon,authenticated,service_role;
grant execute on function public.rpc_student_learning_catalog(text,integer)
to authenticated,service_role;

revoke all on function public.rpc_teacher_student_intervention_intelligence(uuid,text)
from public,anon,authenticated,service_role;
grant execute on function public.rpc_teacher_student_intervention_intelligence(uuid,text)
to authenticated,service_role;

revoke all on function public.rpc_student_academic_profile(uuid,text,timestamptz,timestamptz)
from public,anon,authenticated,service_role;
grant execute on function public.rpc_student_academic_profile(uuid,text,timestamptz,timestamptz)
to authenticated,service_role;

revoke all on function public.rpc_bh_writing_teacher_monitoring_legacy_v1(text,integer,text)
from public,anon,authenticated,service_role;
grant execute on function public.rpc_bh_writing_teacher_monitoring_legacy_v1(text,integer,text)
to authenticated,service_role;

revoke all on function public.rpc_teacher_submit_question_batch(uuid,jsonb)
from public,anon,authenticated,service_role;
grant execute on function public.rpc_teacher_submit_question_batch(uuid,jsonb)
to authenticated,service_role;

revoke all on function public.rpc_student_academic_confidence(uuid,uuid,uuid)
from public,anon,authenticated,service_role;
grant execute on function public.rpc_student_academic_confidence(uuid,uuid,uuid)
to authenticated,service_role;

revoke all on function public.rpc_academic_progress_experience_context(uuid)
from public,anon,authenticated,service_role;
grant execute on function public.rpc_academic_progress_experience_context(uuid)
to authenticated,service_role;

revoke all on function public.rpc_school_admin_set_teaching_staff_status(uuid,uuid,boolean)
from public,anon,authenticated,service_role;
grant execute on function public.rpc_school_admin_set_teaching_staff_status(uuid,uuid,boolean)
to authenticated,service_role;

revoke all on function public.school_admin_transition_member_role(uuid,uuid,text,boolean,text)
from public,anon,authenticated,service_role;
grant execute on function public.school_admin_transition_member_role(uuid,uuid,text,boolean,text)
to authenticated,service_role;

revoke all on function public.remove_school_member(uuid,uuid)
from public,anon,authenticated,service_role;
grant execute on function public.remove_school_member(uuid,uuid)
to authenticated,service_role;

revoke all on function public.rpc_bh_writing_canonical_assessment_entitlement_internal(text)
from public,anon,authenticated,service_role;
grant execute on function public.rpc_bh_writing_canonical_assessment_entitlement_internal(text)
to authenticated,service_role;

revoke all on function public.rpc_bh_writing_submit_assessment_review_entitlement_internal(uuid,jsonb,text,boolean)
from public,anon,authenticated,service_role;
grant execute on function public.rpc_bh_writing_submit_assessment_review_entitlement_internal(uuid,jsonb,text,boolean)
to authenticated,service_role;
