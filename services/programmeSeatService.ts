import { supabase } from './supabaseClient';

export type SeatProgrammeKey = 'cambridge' | 'ielts' | 'writing';
export type SeatReleaseReason = 'wrong_student' | 'left_school' | 'programme_change' | 'academic_decision' | 'other';

export interface ProgrammeSeatAssignment {
  assignment_id: string;
  module_key: SeatProgrammeKey;
  assigned_at: string;
  activated_at: string | null;
  has_usage: boolean;
  correction_until: string;
}

export interface ProgrammeSeatPool {
  module_key: SeatProgrammeKey;
  seat_limit: number | null;
  assigned: number;
  cooling_down: number;
  available: number;
  transfer_limit: number;
  transfers_used: number;
  unique_students_served: number;
  next_available_at: string | null;
}

export interface ProgrammeSeatStudent {
  user_id: string;
  student_name: string;
  class_name: string;
  member_status: 'active' | 'inactive' | string;
  assignments: ProgrammeSeatAssignment[];
}

export interface ProgrammeSeatEvent {
  id: string;
  module_key: SeatProgrammeKey;
  event_type: string;
  reason: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  student_user_id: string;
  student_name: string;
}

export interface ProgrammeSeatExceptionRequest {
  id: string;
  module_key: SeatProgrammeKey;
  requested_transfers: number;
  reason: string;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  review_note: string | null;
  created_at: string;
  reviewed_at: string | null;
}

export interface ProgrammeSeatOverview {
  programmes: ProgrammeSeatPool[];
  students: ProgrammeSeatStudent[];
  events: ProgrammeSeatEvent[];
  exception_requests: ProgrammeSeatExceptionRequest[];
  policy: { correction_hours: number; cooldown_days: number; base_transfer_percent: number };
  generated_at: string;
}

type RpcResult = { success?: boolean; error?: string; [key: string]: unknown };

async function assertRpc(call: PromiseLike<{ data: unknown; error: { message?: string } | null }>, fallback: string): Promise<RpcResult> {
  const { data, error } = await call;
  if (error) throw new Error(error.message || fallback);
  const payload = data as RpcResult | null;
  if (!payload?.success) throw new Error(payload?.error || fallback);
  return payload;
}

export async function getProgrammeSeatOverview(schoolId: string): Promise<ProgrammeSeatOverview> {
  const payload = await assertRpc(supabase.rpc('school_head_get_programme_seats', { p_school_id: schoolId }), 'Programme licences could not be loaded.');
  return {
    programmes: (payload['programmes'] as ProgrammeSeatPool[]) ?? [], students: (payload['students'] as ProgrammeSeatStudent[]) ?? [],
    events: (payload['events'] as ProgrammeSeatEvent[]) ?? [], exception_requests: (payload['exception_requests'] as ProgrammeSeatExceptionRequest[]) ?? [],
    policy: (payload['policy'] as ProgrammeSeatOverview['policy']) ?? { correction_hours: 24, cooldown_days: 7, base_transfer_percent: 10 },
    generated_at: String(payload['generated_at'] ?? ''),
  };
}

export async function assignProgrammeSeat(schoolId: string, programme: SeatProgrammeKey, studentUserId: string): Promise<void> {
  await assertRpc(supabase.rpc('school_head_assign_programme_seat', {
    p_school_id: schoolId, p_module_key: programme, p_student_user_id: studentUserId,
  }), 'The licence could not be assigned.');
}

export async function bulkAssignProgrammeSeats(schoolId: string, programme: SeatProgrammeKey, studentUserIds: string[]): Promise<number> {
  const result = await assertRpc(supabase.rpc('school_head_bulk_assign_programme_seats', {
    p_school_id: schoolId, p_module_key: programme, p_student_user_ids: studentUserIds,
  }), 'The class could not be assigned.');
  return Number(result['assigned'] ?? 0);
}

export async function releaseProgrammeSeat(input: {
  schoolId: string; programme: SeatProgrammeKey; studentUserId: string; reason: SeatReleaseReason; note?: string;
}): Promise<RpcResult> {
  return assertRpc(supabase.rpc('school_head_release_programme_seat', {
    p_school_id: input.schoolId, p_module_key: input.programme, p_student_user_id: input.studentUserId,
    p_reason: input.reason, p_note: input.note || null,
  }), 'The licence could not be released.');
}

export async function switchProgrammeSeat(input: {
  schoolId: string; studentUserId: string; fromProgramme: SeatProgrammeKey; toProgramme: SeatProgrammeKey;
}): Promise<void> {
  await assertRpc(supabase.rpc('school_head_switch_programme_seat', {
    p_school_id: input.schoolId, p_student_user_id: input.studentUserId,
    p_from_module: input.fromProgramme, p_to_module: input.toProgramme,
  }), 'The programme switch could not be completed.');
}

export async function requestProgrammeTransferException(input: {
  schoolId: string; programme: SeatProgrammeKey; requestedTransfers: number; reason: string;
}): Promise<void> {
  await assertRpc(supabase.rpc('school_head_request_programme_transfer_exception', {
    p_school_id: input.schoolId, p_module_key: input.programme,
    p_requested_transfers: input.requestedTransfers, p_reason: input.reason,
  }), 'The exception request could not be submitted.');
}
