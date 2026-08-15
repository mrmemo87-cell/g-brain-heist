import { supabase } from './supabaseClient';

export interface GuardianChild {
  relationship_id: string;
  student_id: string;
  student_name: string;
  relationship_label: string;
  grade?: string | null;
  class_name?: string | null;
  school_id: string;
  school_name: string;
  school_logo_url?: string | null;
  verified_at: string;
}

export interface GuardianInvitationPreview {
  valid: boolean;
  status: 'ready' | 'expired' | 'revoked' | 'claimed' | 'not_found' | 'missing';
  school?: { id?: string | null; name?: string | null; logo_url?: string | null };
  student?: { id?: string | null; name?: string | null; class_name?: string | null; grade?: string | null };
  relationship_label?: string | null;
  expires_at?: string | null;
  invited_email_hint?: string | null;
}

export interface ParentFocusArea {
  subject: string;
  topic?: string | null;
  skill: string;
  status: 'new_focus' | 'recurring' | 'persistent';
  trend: string;
  priority: 'high' | 'medium' | 'low';
  first_observed_at: string;
  last_observed_at: string;
  evidence_items: number;
  latest_evidence_percentage?: number | null;
}

export interface GuardianChildProgress {
  child: GuardianChild & { id: string; name: string };
  period: { days: number; start: string; end: string };
  summary: {
    assignment_average: number | null;
    completed_assignments: number;
    assigned_assignments: number;
    overdue_assignments: number;
    persistent_focus_count: number;
    recurring_focus_count: number;
    improving_count: number;
    resolved_count: number;
    strength_count: number;
  };
  subjects: Array<{ subject: string; assignment_average: number | null; completed_assignments: number; persistent_focus_count: number; improving_count: number; resolved_count: number; strength_count: number }>;
  focus_areas: ParentFocusArea[];
  improving: Array<{ subject: string; skill: string; last_observed_at: string; evidence_items: number }>;
  resolved: Array<{ subject: string; skill: string; last_observed_at: string; evidence_items: number }>;
  strengths: Array<{ subject: string; skill: string; status: string; last_observed_at: string; evidence_items: number }>;
  recent_assignments: Array<{ assignment_id: string; title: string; subject: string; topic: string; accuracy: number; correct: number; incorrect: number; completed_at: string }>;
  timeline: Array<{ id: string; subject: string; topic?: string | null; skill: string; observation_type: string; source_type: string; observed_at: string; evidence_percentage?: number | null; evidence_quality?: string | null }>;
}

export interface GuardianManagementSnapshot {
  school_id: string;
  students: Array<{ student_id: string; student_name: string; class_name?: string | null; grade?: string | null }>;
  relationships: Array<{ id: string; student_id: string; student_name: string; guardian_user_id: string; guardian_email?: string | null; guardian_name?: string | null; relationship_label: string; status: string; verified_at: string; revoked_at?: string | null }>;
  invitations: Array<{
    id: string;
    student_id: string;
    student_name: string;
    invited_email: string;
    relationship_label: string;
    expires_at: string;
    created_at: string;
    claimed_at?: string | null;
    revoked_at?: string | null;
    status: 'pending' | 'claimed' | 'expired' | 'revoked';
    email_status?: 'pending' | 'processing' | 'sent' | 'failed' | 'cancelled' | 'not_sent';
    email_sent_at?: string | null;
    email_last_error?: string | null;
    email_attempts?: number;
  }>;
}

const friendlyError = (raw: unknown, fallback: string): Error => {
  const message = raw instanceof Error ? raw.message : String(raw || '');
  const lower = message.toLowerCase();
  if (lower.includes('invalid login credentials')) return new Error('That email and password do not match. Please try again or use Google sign-in.');
  if (lower.includes('email not confirmed')) return new Error('Please confirm your email first, then return to this invitation.');
  if (lower.includes('already registered') || lower.includes('user already registered')) return new Error('An account already exists for this email. Please sign in instead.');
  if (lower.includes('expired')) return new Error('This invitation has expired. Please ask the school for a new invitation.');
  if (lower.includes('revoked')) return new Error('This invitation is no longer active. Please contact the school if you still need access.');
  if (lower.includes('email') && lower.includes('match')) return new Error('Please sign in with the same email address the school invited.');
  if (lower.includes('not authorized') || lower.includes('not authorised') || lower.includes('permission')) return new Error('This account does not have access to that information. Please contact the school if you think this is unexpected.');
  if (lower.includes('network') || lower.includes('fetch') || lower.includes('load failed') || lower.includes('failed to fetch')) return new Error('We could not connect just now. Please check your connection and try again.');
  return new Error(fallback);
};

export async function getGuardianInvitationPreview(token: string): Promise<GuardianInvitationPreview> {
  const { data, error } = await supabase.rpc('rpc_guardian_invitation_preview', { p_token: token });
  if (error) throw friendlyError(error, 'We could not prepare this invitation just now. Please try again.');
  return (data || { valid: false, status: 'not_found' }) as GuardianInvitationPreview;
}

export async function getGuardianChildren(): Promise<GuardianChild[]> {
  const { data, error } = await supabase.rpc('rpc_guardian_my_children');
  if (error) throw friendlyError(error, 'We could not open your linked children just now. Please try again.');
  return Array.isArray(data) ? data as GuardianChild[] : [];
}

export async function getGuardianChildProgress(studentId: string, days = 90): Promise<GuardianChildProgress> {
  const { data, error } = await supabase.rpc('rpc_guardian_child_progress', { p_student_id: studentId, p_days: days });
  if (error) throw friendlyError(error, 'We could not open this progress view just now. Please try again.');
  return data as GuardianChildProgress;
}

export async function claimGuardianInvitation(token: string): Promise<{ success: boolean; student_id?: string }> {
  const { data, error } = await supabase.rpc('rpc_guardian_claim_invitation', { p_token: token });
  if (error) throw friendlyError(error, 'We could not confirm this invitation. Please check the invited email or ask the school for a new link.');
  return data as { success: boolean; student_id?: string };
}

export async function getGuardianManagementSnapshot(): Promise<GuardianManagementSnapshot> {
  const { data, error } = await supabase.rpc('rpc_school_guardian_management_snapshot');
  if (error) throw friendlyError(error, 'Parent access is temporarily unavailable. Please try again.');
  return data as GuardianManagementSnapshot;
}

export async function createGuardianInvitation(input: { studentId: string; email: string; relationshipLabel: string; expiresDays?: number }) {
  const { data, error } = await supabase.rpc('rpc_school_create_guardian_invitation', { p_student_id: input.studentId, p_invited_email: input.email, p_relationship_label: input.relationshipLabel, p_expires_days: input.expiresDays ?? 7 });
  if (error) throw friendlyError(error, 'We could not create the parent invitation just now. Please check the details and try again.');
  return data as { success: boolean; invitation_id: string; token: string; expires_at: string; invited_email: string; email_status?: string };
}

export async function revokeGuardianInvitation(invitationId: string): Promise<void> {
  const { error } = await supabase.rpc('rpc_school_revoke_guardian_invitation', { p_invitation_id: invitationId });
  if (error) throw friendlyError(error, 'We could not cancel this invitation just now. Please try again.');
}

export async function revokeGuardianRelationship(relationshipId: string): Promise<void> {
  const { error } = await supabase.rpc('rpc_school_revoke_guardian_relationship', { p_relationship_id: relationshipId });
  if (error) throw friendlyError(error, 'We could not remove this parent access just now. Please try again.');
}

export async function parentSignIn(email: string, password: string): Promise<void> {
  const { error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
  if (error) throw friendlyError(error, 'We could not sign you in. Please check your details and try again.');
}

export async function parentSignUp(email: string, password: string, redirectTo: string): Promise<{ confirmationRequired: boolean }> {
  const { data, error } = await supabase.auth.signUp({ email: email.trim().toLowerCase(), password, options: { emailRedirectTo: redirectTo } });
  if (error) throw friendlyError(error, 'We could not create the account just now. Please check the details and try again.');
  return { confirmationRequired: !data.session };
}

export async function parentGoogleSignIn(redirectTo: string): Promise<void> {
  const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo } });
  if (error) throw friendlyError(error, 'Google sign-in could not start just now. Please try again.');
}

export async function parentSignOut(): Promise<void> {
  const { error } = await supabase.auth.signOut();
  if (error) throw friendlyError(error, 'We could not sign you out just now. Please try again.');
}
