import { supabase } from './supabaseClient.js';
import { userFacingError } from './userFacingError.js';
async function call(rpc, args, message) {
    const { data, error } = await supabase.rpc(rpc, args);
    if (error)
        throw userFacingError(error, message);
    return data;
}
export const fetchSchoolSubjectGroups = (schoolId, offeringId) => call('rpc_school_admin_subject_groups', {
    p_school_id: schoolId, p_offering_id: offeringId ?? null,
}, 'We could not load teaching groups. Please try again.');
export const fetchTeacherTeachingGroups = (schoolId) => call('rpc_teacher_teaching_groups', {
    p_school_id: schoolId,
}, 'We could not load your teaching groups. Please try again.');
export const fetchSchoolSubjectGroupRoster = (schoolId, groupId) => call('rpc_school_admin_subject_group_roster', {
    p_school_id: schoolId, p_group_id: groupId,
}, 'We could not load this teaching group’s roster. Please try again.');
export const fetchTeacherTeachingGroupRoster = (schoolId, groupId) => call('rpc_teacher_teaching_group_roster', {
    p_school_id: schoolId, p_group_id: groupId,
}, 'We could not load this teaching group’s roster. Please try again.');
export const saveSchoolSubjectGroup = (input) => call('rpc_school_admin_save_subject_group', {
    p_school_id: input.schoolId, p_offering_id: input.offeringId, p_name: input.name.trim(),
    p_group_type: input.groupType, p_registration_class_id: input.registrationClassId ?? null,
    p_group_id: input.groupId ?? null,
}, 'We could not save this teaching group. Check its name and registration class.');
export const archiveSchoolSubjectGroup = (schoolId, groupId) => call('rpc_school_admin_archive_subject_group', {
    p_school_id: schoolId, p_group_id: groupId,
}, 'We could not archive this teaching group. Please try again.');
export const setSchoolSubjectGroupStudents = (schoolId, groupId, studentIds) => call('rpc_school_admin_set_subject_group_students', {
    p_school_id: schoolId, p_group_id: groupId, p_student_ids: studentIds,
}, 'We could not save the roster. Check that every student is enrolled in this subject and grade.');
export const setSchoolSubjectGroupTeacher = (input) => call('rpc_school_admin_set_subject_group_teacher', {
    p_school_id: input.schoolId, p_group_id: input.groupId, p_teacher_user_id: input.teacherUserId,
    p_active: input.active, p_can_create: input.canCreate, p_can_grade: input.canGrade,
}, 'We could not save this teacher allocation. Check that the teacher has active teaching access.');
export const setSchoolSubjectDelivery = (input) => call('rpc_school_admin_set_subject_delivery', {
    p_school_id: input.schoolId, p_offering_id: input.offeringId,
    p_delivery_mode: input.deliveryMode, p_confirm_archive: input.confirmArchive,
}, 'We could not change teaching delivery. Review the offering and confirm any group archival.');
export const attachAssignmentToTeachingGroup = (input) => call('rpc_teacher_attach_assignment_group', {
    p_assignment_id: input.assignmentId,
    p_school_id: input.schoolId,
    p_group_id: input.groupId,
}, 'We could not attach this assignment to its teaching group.');
