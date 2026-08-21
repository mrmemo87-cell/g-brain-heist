import { supabase } from './supabaseClient.js';

export type SchoolHeadSeverity = 'info' | 'notice' | 'warning' | 'critical';
export type SchoolHeadTab = 'overview' | 'decisions' | 'academic' | 'people' | 'programs' | 'subscription' | 'governance';

export interface SchoolHeadDecision {
  id: string;
  severity: SchoolHeadSeverity;
  count: number;
  title: string;
  description: string;
  action: string;
  destination: SchoolHeadTab;
  category: string;
  owner: string;
  why: string;
  oldest_at: string | null;
  first_seen_at: string | null;
  last_seen_at: string | null;
  age_days: number;
  affected: Array<{ label: string; detail: string; [key: string]: unknown }>;
  notification_level: string;
}

export interface GradePerformance {
  grade: string;
  students: number;
  assessments: number;
  average: number | null;
}

export interface SchoolHeadSnapshot {
  account_type: 'school_head';
  school: { id: string; name: string; logo_url: string | null; status: string };
  head: { user_id: string; name: string; email: string } | null;
  period: { days: number; start: string; end: string };
  totals: { students: number; teachers: number; admins: number; classes: number; subjects: number };
  engagement: {
    active_students_7d: number;
    active_students_30d: number;
    inactive_students_14d: number;
    active_teachers_7d: number;
  };
  structure: { placed_students: number; covered_classes: number; allocated_teachers: number };
  academics: {
    average: number | null;
    previous_average: number | null;
    assignment_total: number;
    assignment_completed: number;
    completion_rate: number | null;
    grade_performance: GradePerformance[];
  };
  admissions: {
    total_candidates: number;
    pending_candidates: number;
    completed_attempts: number;
    average: number | null;
  };
  programs: {
    cambridge_attempts: number;
    writing_students: number;
    ielts_students: number;
    admission_candidates: number;
  };
  subscription: {
    plan: string;
    status: string;
    billing_interval: string | null;
    current_period_end: string | null;
    cancel_at_period_end: boolean;
    is_comp: boolean;
    comp_expires_at: string | null;
    seat_limit: number | null;
    seats_used: number;
  };
  decisions: SchoolHeadDecision[];
  generated_at: string;
}

export interface SchoolGovernanceAuditEntry {
  id: string;
  event_type: string;
  category: string;
  severity: SchoolHeadSeverity;
  summary: string;
  reason: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  actor: { user_id: string; name: string } | null;
  target: { user_id: string; name: string } | null;
}

export interface OwnershipTransferResult {
  success: boolean;
  message?: string;
  error?: string;
  new_head_user_id?: string;
}

export interface SchoolHeadSetupStep {
  id: string;
  label: string;
  completed: boolean;
  action_tab: string;
}

export interface SchoolHeadSetupChecklist {
  requested_modules: string[];
  steps: SchoolHeadSetupStep[];
}

const record = (value: unknown): Record<string, unknown> => (
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
);

const numberValue = (value: unknown): number => {
  const resolved = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(resolved) ? resolved : 0;
};

const nullableNumber = (value: unknown): number | null => (
  value === null || value === undefined || value === '' ? null : numberValue(value)
);

const stringValue = (value: unknown, fallback = ''): string => (
  typeof value === 'string' ? value : fallback
);

export function normalizeSchoolHeadSnapshot(value: unknown): SchoolHeadSnapshot | null {
  const payload = record(value);
  if (payload['success'] !== true || payload['account_type'] !== 'school_head') return null;

  const school = record(payload['school']);
  const period = record(payload['period']);
  const totals = record(payload['totals']);
  const engagement = record(payload['engagement']);
  const structure = record(payload['structure']);
  const academics = record(payload['academics']);
  const admissions = record(payload['admissions']);
  const programs = record(payload['programs']);
  const subscription = record(payload['subscription']);
  const head = record(payload['head']);

  if (!stringValue(school['id']) || !stringValue(school['name'])) return null;

  const decisions = Array.isArray(payload['decisions'])
    ? payload['decisions'].flatMap((item): SchoolHeadDecision[] => {
        const decision = record(item);
        const severity = decision['severity'];
        const destination = decision['destination'];
        if (!['info', 'notice', 'warning', 'critical'].includes(String(severity))) return [];
        if (!['overview', 'decisions', 'academic', 'people', 'programs', 'subscription', 'governance'].includes(String(destination))) return [];
        const affected = Array.isArray(decision['affected'])
          ? decision['affected'].flatMap((value) => {
              const affectedItem = record(value);
              if (!stringValue(affectedItem['label'])) return [];
              return [{ ...affectedItem, label: stringValue(affectedItem['label']), detail: stringValue(affectedItem['detail']) }];
            })
          : [];
        return [{
          id: stringValue(decision['id']),
          severity: severity as SchoolHeadSeverity,
          count: numberValue(decision['count']),
          title: stringValue(decision['title']),
          description: stringValue(decision['description']),
          action: stringValue(decision['action']),
          destination: destination as SchoolHeadTab,
          category: stringValue(decision['category'], 'Executive attention'),
          owner: stringValue(decision['owner'], 'School leadership'),
          why: stringValue(decision['why']),
          oldest_at: stringValue(decision['oldest_at']) || null,
          first_seen_at: stringValue(decision['first_seen_at']) || null,
          last_seen_at: stringValue(decision['last_seen_at']) || null,
          age_days: numberValue(decision['age_days']),
          affected,
          notification_level: stringValue(decision['notification_level'], 'Decision Center only'),
        }];
      })
    : [];

  const gradePerformance = Array.isArray(academics['grade_performance'])
    ? academics['grade_performance'].map((item) => {
        const grade = record(item);
        return {
          grade: stringValue(grade['grade'], 'Unassigned'),
          students: numberValue(grade['students']),
          assessments: numberValue(grade['assessments']),
          average: nullableNumber(grade['average']),
        };
      })
    : [];

  return {
    account_type: 'school_head',
    school: {
      id: stringValue(school['id']),
      name: stringValue(school['name']),
      logo_url: stringValue(school['logo_url']) || null,
      status: stringValue(school['status'], 'active'),
    },
    head: stringValue(head['user_id']) ? {
      user_id: stringValue(head['user_id']),
      name: stringValue(head['name'], 'School Head'),
      email: stringValue(head['email']),
    } : null,
    period: {
      days: numberValue(period['days']) || 30,
      start: stringValue(period['start']),
      end: stringValue(period['end']),
    },
    totals: {
      students: numberValue(totals['students']), teachers: numberValue(totals['teachers']),
      admins: numberValue(totals['admins']), classes: numberValue(totals['classes']), subjects: numberValue(totals['subjects']),
    },
    engagement: {
      active_students_7d: numberValue(engagement['active_students_7d']),
      active_students_30d: numberValue(engagement['active_students_30d']),
      inactive_students_14d: numberValue(engagement['inactive_students_14d']),
      active_teachers_7d: numberValue(engagement['active_teachers_7d']),
    },
    structure: {
      placed_students: numberValue(structure['placed_students']),
      covered_classes: numberValue(structure['covered_classes']),
      allocated_teachers: numberValue(structure['allocated_teachers'] ?? structure['assigned_teachers']),
    },
    academics: {
      average: nullableNumber(academics['average']),
      previous_average: nullableNumber(academics['previous_average']),
      assignment_total: numberValue(academics['assignment_total']),
      assignment_completed: numberValue(academics['assignment_completed']),
      completion_rate: nullableNumber(academics['completion_rate']),
      grade_performance: gradePerformance,
    },
    admissions: {
      total_candidates: numberValue(admissions['total_candidates']),
      pending_candidates: numberValue(admissions['pending_candidates']),
      completed_attempts: numberValue(admissions['completed_attempts']),
      average: nullableNumber(admissions['average']),
    },
    programs: {
      cambridge_attempts: numberValue(programs['cambridge_attempts']),
      writing_students: numberValue(programs['writing_students']),
      ielts_students: numberValue(programs['ielts_students']),
      admission_candidates: numberValue(programs['admission_candidates']),
    },
    subscription: {
      plan: stringValue(subscription['plan'], 'none'),
      status: stringValue(subscription['status'], 'none'),
      billing_interval: stringValue(subscription['billing_interval']) || null,
      current_period_end: stringValue(subscription['current_period_end']) || null,
      cancel_at_period_end: Boolean(subscription['cancel_at_period_end']),
      is_comp: Boolean(subscription['is_comp']),
      comp_expires_at: stringValue(subscription['comp_expires_at']) || null,
      seat_limit: nullableNumber(subscription['seat_limit']),
      seats_used: numberValue(subscription['seats_used']),
    },
    decisions,
    generated_at: stringValue(payload['generated_at']),
  };
}

export async function getSchoolHeadSnapshot(schoolId: string, days = 30): Promise<SchoolHeadSnapshot> {
  const { error: refreshError } = await supabase.rpc('rpc_school_head_refresh_decision_alerts', {
    p_school_id: schoolId,
    p_days: days,
  });
  if (refreshError) console.warn('Decision alerts could not be refreshed before loading the snapshot:', refreshError.message);

  const snapshotArgs = { p_school_id: schoolId, p_days: days };
  let { data, error } = await supabase.rpc('school_head_get_executive_snapshot_v2', snapshotArgs);

  // Keep frontend/backend deployment ordering safe. If the additive v2 RPC has not
  // reached a given environment yet, the established executive snapshot still works.
  if (error) {
    console.warn('School Head grade performance v2 unavailable; using legacy snapshot:', error.message);
    ({ data, error } = await supabase.rpc('school_head_get_executive_snapshot', snapshotArgs));
  }

  if (error) throw new Error(error.message || 'Executive data could not be loaded.');
  const snapshot = normalizeSchoolHeadSnapshot(data);
  if (!snapshot) throw new Error('Executive data returned an invalid response.');
  return snapshot;
}

export async function listSchoolGovernanceAudit(
  schoolId: string,
  options: { limit?: number; before?: string | null } = {},
): Promise<SchoolGovernanceAuditEntry[]> {
  const { data, error } = await supabase.rpc('school_head_list_governance_audit', {
    p_school_id: schoolId,
    p_limit: options.limit ?? 50,
    p_before: options.before ?? null,
  });
  if (error) throw new Error(error.message || 'Governance history could not be loaded.');
  if (!Array.isArray(data)) return [];
  return data.flatMap((item): SchoolGovernanceAuditEntry[] => {
    const entry = record(item);
    const severity = String(entry['severity']);
    if (!stringValue(entry['id']) || !['info', 'notice', 'warning', 'critical'].includes(severity)) return [];
    const actor = record(entry['actor']);
    const target = record(entry['target']);
    return [{
      id: stringValue(entry['id']),
      event_type: stringValue(entry['event_type']),
      category: stringValue(entry['category']),
      severity: severity as SchoolHeadSeverity,
      summary: stringValue(entry['summary']),
      reason: stringValue(entry['reason']) || null,
      metadata: record(entry['metadata']),
      created_at: stringValue(entry['created_at']),
      actor: stringValue(actor['user_id']) ? { user_id: stringValue(actor['user_id']), name: stringValue(actor['name'], 'Unknown user') } : null,
      target: stringValue(target['user_id']) ? { user_id: stringValue(target['user_id']), name: stringValue(target['name'], 'Unknown user') } : null,
    }];
  });
}

export async function transferSchoolHeadOwnership(input: {
  schoolId: string;
  newHeadUserId: string;
  confirmationText: string;
  reason: string;
}): Promise<OwnershipTransferResult> {
  const { data, error } = await supabase.rpc('school_head_transfer_ownership', {
    p_school_id: input.schoolId,
    p_new_head_user_id: input.newHeadUserId,
    p_confirmation_text: input.confirmationText,
    p_reason: input.reason,
  });
  if (error) return { success: false, error: error.message || 'Ownership could not be transferred.' };
  const payload = record(data);
  return {
    success: payload['success'] === true,
    message: stringValue(payload['message']) || undefined,
    error: stringValue(payload['error']) || undefined,
    new_head_user_id: stringValue(payload['new_head_user_id']) || undefined,
  };
}

export async function getSchoolHeadSetupChecklist(schoolId: string): Promise<SchoolHeadSetupChecklist> {
  const { data, error } = await supabase.rpc('school_head_get_setup_checklist', { p_school_id: schoolId });
  if (error) throw new Error(error.message || 'School setup checklist could not be loaded.');
  const payload = record(data);
  if (payload['success'] !== true) throw new Error(stringValue(payload['error'], 'School setup checklist returned an invalid response.'));
  return {
    requested_modules: Array.isArray(payload['requested_modules']) ? payload['requested_modules'].filter((item): item is string => typeof item === 'string') : ['core'],
    steps: Array.isArray(payload['steps']) ? payload['steps'].flatMap((item): SchoolHeadSetupStep[] => {
      const step = record(item);
      return stringValue(step['id']) ? [{ id: stringValue(step['id']), label: stringValue(step['label']), completed: step['completed'] === true, action_tab: stringValue(step['action_tab'], 'dashboard') }] : [];
    }) : [],
  };
}

export async function updateSchoolHeadSetup(input: { schoolId: string; step: 'identity' | 'modules' | 'launch'; completed?: boolean; requestedModules?: string[] }): Promise<{ success: boolean; error?: string }> {
  const { data, error } = await supabase.rpc('school_head_update_setup', {
    p_school_id: input.schoolId,
    p_step: input.step,
    p_completed: input.completed ?? true,
    p_requested_modules: input.requestedModules ?? null,
  });
  if (error) return { success: false, error: error.message };
  const payload = record(data);
  return payload['success'] === true ? { success: true } : { success: false, error: stringValue(payload['error'], 'Checklist update failed.') };
}
