import { supabase } from './supabaseClient';

export type SeatProgrammeKey = 'cambridge' | 'ielts' | 'writing';
export type SeatReleaseReason = 'wrong_student' | 'left_school' | 'programme_change' | 'academic_decision' | 'other';

export interface ProgrammeSeatPool {
  module_key: SeatProgrammeKey;
  seat_limit: number | null;
  assigned: number;
  cooling_down: number;
  transfer_limit: number;
  transfers_used: number;
}

export interface ProgrammeSeatStudent {
  user_id: string;
  student_name: string;
  class_name: string;
  modules: SeatProgrammeKey[];
}

export interface ProgrammeSeatOverview {
  programmes: ProgrammeSeatPool[];
  students: ProgrammeSeatStudent[];
  generated_at: string;
}

type RpcResult = { success?: boolean; error?: string };

export async function getProgrammeSeatOverview(schoolId: string): Promise<ProgrammeSeatOverview> {
  const { data, error } = await supabase.rpc('school_head_get_programme_seats', { p_school_id: schoolId });
  if (error) throw new Error(error.message || 'Programme licences could not be loaded.');
  const payload = data as (RpcResult & ProgrammeSeatOverview) | null;
  if (!payload?.success) throw new Error(payload?.error || 'Programme licences could not be loaded.');
  return { programmes: payload.programmes ?? [], students: payload.students ?? [], generated_at: payload.generated_at };
}

export async function assignProgrammeSeat(schoolId: string, programme: SeatProgrammeKey, studentUserId: string): Promise<void> {
  const { data, error } = await supabase.rpc('school_head_assign_programme_seat', {
    p_school_id: schoolId, p_module_key: programme, p_student_user_id: studentUserId,
  });
  if (error) throw new Error(error.message || 'The licence could not be assigned.');
  const payload = data as RpcResult | null;
  if (!payload?.success) throw new Error(payload?.error || 'The licence could not be assigned.');
}

export async function releaseProgrammeSeat(input: {
  schoolId: string; programme: SeatProgrammeKey; studentUserId: string; reason: SeatReleaseReason; note?: string;
}): Promise<void> {
  const { data, error } = await supabase.rpc('school_head_release_programme_seat', {
    p_school_id: input.schoolId, p_module_key: input.programme, p_student_user_id: input.studentUserId,
    p_reason: input.reason, p_note: input.note || null,
  });
  if (error) throw new Error(error.message || 'The licence could not be released.');
  const payload = data as RpcResult | null;
  if (!payload?.success) throw new Error(payload?.error || 'The licence could not be released.');
}
