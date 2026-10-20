import { supabase } from './supabaseClient';

/** Teacher-chosen student emails for IELTS tasks (owner decision 2026-10-20). Email never carries scores or notes. */
export type IeltsEmailEvent = 'targeted_assigned' | 'course_assigned' | 'targeted_feedback' | 'practice_feedback';
export interface IeltsEmailQueued { keys: string[]; queued: number }
export interface IeltsEmailStatus { total: number; waiting: number; sent: number; delivered: number; no_email: number; turned_off: number; not_delivered: number }

export async function notifyIeltsStudents(event: IeltsEmailEvent, refs: string[], remindDue = false): Promise<IeltsEmailQueued> {
  const { data, error } = await supabase.rpc('rpc_ielts_notify_students', { p_event: event, p_refs: refs, p_remind_due: remindDue });
  if (error) throw error;
  return data as IeltsEmailQueued;
}

export async function ieltsEmailStatus(keys: string[]): Promise<IeltsEmailStatus> {
  const { data, error } = await supabase.rpc('rpc_ielts_email_status', { p_keys: keys });
  if (error) throw error;
  return data as IeltsEmailStatus;
}

/** One plain sentence for the teacher. "Sent" means the email service accepted it; only "delivered" is confirmed. */
export function emailStatusText(s: IeltsEmailStatus, requested: number): string {
  const parts: string[] = [];
  if (s.delivered) parts.push(`delivered to ${s.delivered}`);
  if (s.sent) parts.push(`sent to ${s.sent}`);
  if (s.waiting) parts.push(`sending to ${s.waiting}`);
  if (s.no_email) parts.push(`${s.no_email} ${s.no_email === 1 ? 'has' : 'have'} no verified email address`);
  if (s.turned_off) parts.push(`${s.turned_off} turned school emails off`);
  if (s.not_delivered) parts.push(`${s.not_delivered} could not be delivered`);
  if (!parts.length) parts.push(`queued for ${requested}`);
  const t = parts.join(' · ');
  return `Email: ${t.charAt(0).toLowerCase() + t.slice(1)}.`;
}
