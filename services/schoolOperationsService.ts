import { supabase } from './supabaseClient.js';

export type SchoolOpsPreset = 'british' | 'ib' | 'american' | 'primary' | 'online' | 'custom';
export type CycleType = 'weekly' | 'ab' | 'rotating' | 'custom';

export interface SchoolOpsSettings {
  school_id: string;
  preset: SchoolOpsPreset;
  timezone: string;
  week_start: number;
  cycle_type: CycleType;
  cycle_length: number;
  terminology: Record<string, string>;
  attendance_mode: { daily?: boolean; am_pm?: boolean; lesson?: boolean };
  modules: { attendance?: boolean; timetable?: boolean; student360?: boolean };
  ui_preferences: Record<string, unknown>;
}

export interface ScheduleTemplate {
  id: string;
  school_id: string;
  name: string;
  cycle_type: CycleType;
  cycle_length: number;
  status: 'draft' | 'published' | 'archived';
  valid_from: string | null;
  valid_to: string | null;
  is_default: boolean;
}

export interface SchoolOpsPeriod {
  id: string;
  school_id: string;
  template_id: string;
  day_key: string;
  position: number;
  label: string;
  block_type: string;
  starts_at: string;
  ends_at: string;
  attendance_required: boolean;
}

export interface TeachingGroup {
  id: string;
  school_id: string;
  class_id: string | null;
  code: string;
  name: string;
  group_type: string;
  subject: string | null;
  grade_label: string | null;
  active: boolean;
}

export interface AttendanceCode {
  id: string;
  school_id: string;
  code: string;
  label: string;
  category: string;
  counts_as_present: boolean;
  authorized: boolean;
  requires_reason: boolean;
  active: boolean;
  sort_order: number;
}

export interface AttendanceSession {
  id: string;
  school_id: string;
  session_date: string;
  session_type: string;
  group_id: string | null;
  lesson_id: string | null;
  label: string | null;
  status: 'open' | 'submitted' | 'locked' | 'cancelled';
  submitted_at: string | null;
}

export interface Student360Payload {
  student?: {
    id: string;
    username: string;
    full_name: string | null;
    email: string | null;
    avatar_url: string | null;
    grade: number | null;
    batch: string | null;
    level: number | null;
    xp: number | null;
    last_seen: string | null;
  };
  placement?: { id: string; class_code: string; class_name: string; grade_level: string | null } | null;
  attendance?: { recorded: number; present: number; late: number };
  focus?: Array<Record<string, unknown>>;
  guardians?: Array<Record<string, unknown>>;
  custom_fields?: Record<string, { label: string; value: unknown }>;
}

function throwIfError(error: { message?: string } | null, fallback: string) {
  if (error) throw new Error(error.message || fallback);
}

export async function bootstrapSchoolOperations(schoolId: string, preset: SchoolOpsPreset = 'custom') {
  const { data, error } = await supabase.rpc('school_ops_bootstrap', {
    p_school_id: schoolId,
    p_preset: preset,
  });
  throwIfError(error, 'Could not initialize school operations.');
  return data as { success: boolean; template_id: string };
}

export async function getSchoolOpsSettings(schoolId: string): Promise<SchoolOpsSettings | null> {
  const { data, error } = await supabase.from('school_ops_settings').select('*').eq('school_id', schoolId).maybeSingle();
  throwIfError(error, 'Could not load settings.');
  return data as SchoolOpsSettings | null;
}

export async function saveSchoolOpsSettings(settings: SchoolOpsSettings) {
  const { error } = await supabase.from('school_ops_settings').upsert(settings, { onConflict: 'school_id' });
  throwIfError(error, 'Could not save settings.');
}

export async function listScheduleTemplates(schoolId: string): Promise<ScheduleTemplate[]> {
  const { data, error } = await supabase.from('school_ops_schedule_templates').select('*').eq('school_id', schoolId).order('created_at');
  throwIfError(error, 'Could not load timetable.');
  return (data || []) as ScheduleTemplate[];
}

export async function updateScheduleTemplate(id: string, patch: Partial<ScheduleTemplate>) {
  const { error } = await supabase.from('school_ops_schedule_templates').update(patch).eq('id', id);
  throwIfError(error, 'Could not update timetable.');
}

export async function listPeriods(templateId: string): Promise<SchoolOpsPeriod[]> {
  const { data, error } = await supabase.from('school_ops_periods').select('*').eq('template_id', templateId).order('day_key').order('position');
  throwIfError(error, 'Could not load periods.');
  return (data || []) as SchoolOpsPeriod[];
}

export async function savePeriod(period: Omit<SchoolOpsPeriod, 'id'> & { id?: string }) {
  const payload = period.id ? period : { ...period, id: undefined };
  const query = period.id
    ? supabase.from('school_ops_periods').update(payload).eq('id', period.id).select().single()
    : supabase.from('school_ops_periods').insert(payload).select().single();
  const { data, error } = await query;
  throwIfError(error, 'Could not save period.');
  return data as SchoolOpsPeriod;
}

export async function removePeriod(id: string) {
  const { error } = await supabase.from('school_ops_periods').delete().eq('id', id);
  throwIfError(error, 'Could not remove period.');
}

export async function syncClassesToTeachingGroups(schoolId: string): Promise<TeachingGroup[]> {
  const { error: syncError } = await supabase.rpc('school_ops_sync_class_groups', { p_school_id: schoolId });
  throwIfError(syncError, 'Could not sync school groups.');
  return listTeachingGroups(schoolId);
}

export async function listTeachingGroups(schoolId: string): Promise<TeachingGroup[]> {
  const { data, error } = await supabase.from('school_ops_teaching_groups').select('*').eq('school_id', schoolId).eq('active', true).order('name');
  throwIfError(error, 'Could not load groups.');
  return (data || []) as TeachingGroup[];
}

export async function listGroupStudentIds(groupId: string): Promise<string[]> {
  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await supabase.from('school_ops_group_students').select('student_id,valid_from,valid_to').eq('group_id', groupId).lte('valid_from', today).or(`valid_to.is.null,valid_to.gte.${today}`);
  throwIfError(error, 'Could not load students.');
  return (data || []).map((row: any) => row.student_id);
}

export async function listAttendanceCodes(schoolId: string): Promise<AttendanceCode[]> {
  const { data, error } = await supabase.from('school_ops_attendance_codes').select('*').eq('school_id', schoolId).eq('active', true).order('sort_order');
  throwIfError(error, 'Could not load attendance codes.');
  return (data || []) as AttendanceCode[];
}

export async function listAttendanceSessions(schoolId: string, date: string): Promise<AttendanceSession[]> {
  const { data, error } = await supabase.from('school_ops_attendance_sessions').select('*').eq('school_id', schoolId).eq('session_date', date).order('created_at');
  throwIfError(error, 'Could not load registers.');
  return (data || []) as AttendanceSession[];
}

export async function createAttendanceSession(input: {
  school_id: string;
  session_date: string;
  session_type: string;
  group_id: string;
  label?: string;
}): Promise<AttendanceSession> {
  const { data: user } = await supabase.auth.getUser();
  const { data, error } = await supabase.from('school_ops_attendance_sessions').insert({ ...input, opened_by: user.user?.id || null }).select().single();
  throwIfError(error, 'Could not create register.');
  return data as AttendanceSession;
}

export async function listAttendanceRecords(sessionId: string) {
  const { data, error } = await supabase.from('school_ops_attendance_records').select('id,student_id,code_id,minutes_late,reason,note,version').eq('session_id', sessionId);
  throwIfError(error, 'Could not load attendance.');
  return data || [];
}

export async function saveAttendanceRecords(schoolId: string, sessionId: string, rows: Array<{ student_id: string; code_id: string; minutes_late?: number | null; reason?: string | null }>) {
  const { data: user } = await supabase.auth.getUser();
  const payload = rows.map((row) => ({
    school_id: schoolId,
    session_id: sessionId,
    student_id: row.student_id,
    code_id: row.code_id,
    minutes_late: row.minutes_late ?? null,
    reason: row.reason ?? null,
    marked_by: user.user?.id || null,
  }));
  const { error } = await supabase.from('school_ops_attendance_records').upsert(payload, { onConflict: 'session_id,student_id' });
  throwIfError(error, 'Could not save attendance.');
}

export async function submitAttendanceSession(sessionId: string) {
  const { data: user } = await supabase.auth.getUser();
  const { error } = await supabase.from('school_ops_attendance_sessions').update({ status: 'submitted', submitted_by: user.user?.id || null, submitted_at: new Date().toISOString() }).eq('id', sessionId);
  throwIfError(error, 'Could not submit register.');
}

export async function getStudent360(schoolId: string, studentId: string): Promise<Student360Payload> {
  const { data, error } = await supabase.rpc('school_ops_student_360', { p_school_id: schoolId, p_student_id: studentId });
  throwIfError(error, 'Could not load Student 360.');
  return (data || {}) as Student360Payload;
}
