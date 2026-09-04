import { supabase } from './supabaseClient';

export type IntelligenceWarningSeverity = 'info' | 'warning' | 'critical';

export interface IntelligenceWarning {
  code: string;
  severity: IntelligenceWarningSeverity;
  title: string;
  message: string;
  claimed_school?: string | null;
  linked_school?: string | null;
}

export interface SuperadminUserIntelligence {
  identity: {
    user_id: string;
    username: string | null;
    email: string | null;
    public_email: string | null;
    full_name: string | null;
    auth_display_name: string | null;
    provider: string | null;
    providers: string[];
    email_verified: boolean;
    email_confirmed_at: string | null;
    created_at: string | null;
    last_sign_in_at: string | null;
    last_active_at: string | null;
    is_sso_user: boolean;
    is_anonymous: boolean;
    latest_session: {
      created_at: string | null;
      updated_at: string | null;
      aal: string | null;
      user_agent: string | null;
      ip: string | null;
    } | null;
  };
  account: {
    role: string;
    is_admin: boolean;
    is_superadmin: boolean;
    is_banned: boolean;
    banned_until: string | null;
    admin_visible: boolean;
    account_tier: string;
    needs_setup: boolean;
    tutorial_completed: boolean;
    profile_locked: boolean;
    full_name_status: string | null;
    brains_master_until: string | null;
    brains_master_show_badge: boolean;
    admin_roles: Array<{ scope: string | null; role: string | null; created_at: string | null }>;
  };
  placement: {
    grade: string | null;
    class_code: string | null;
    school_id: string | null;
    linked_school_name: string | null;
    claimed_school_name: string | null;
    school_memberships: Array<{
      school_id: string;
      school_name: string | null;
      role: string | null;
      status: string | null;
      is_owner: boolean;
      can_teach: boolean;
      joined_at: string | null;
    }>;
    class_memberships: Array<{
      class_id: string;
      class_code: string | null;
      class_name: string | null;
      grade_level: string | null;
      subject: string | null;
      school_id: string | null;
      joined_at: string | null;
    }>;
    academic_enrolments: Array<Record<string, unknown>>;
    subject_enrolment_count: number;
    guardian_relationship_count: number;
  };
  game: {
    level: number;
    xp: number;
    coins: number;
    gemstones: number;
    streak: number;
    ap_now: number;
    ap_max: number;
    attack_power: number;
    defense_power: number;
    pvp_score: number;
    pvp_wins: number;
    total_questions_answered: number;
    achievement_points: number;
    reward_sources: Record<string, number>;
  };
  activity: {
    question_attempts: { total: number; correct: number; latest_at: string | null };
    brains_heist_attempts: { total: number; correct: number; latest_at: string | null };
    assignments: { assigned: number; completed: number; average_accuracy: number | null; latest_completed_at: string | null };
    cambridge_quizzes: { attempts: number; average_percentage: number | null; latest_at: string | null };
    quests: { runs: number; completed: number; latest_at: string | null };
    raids: { participations: number; total_damage: number; latest_at: string | null };
    clan: { clan_id: string; name: string | null; role: string | null; custom_title: string | null; joined_at: string | null } | null;
    commerce: { shop_purchases: number; shop_spend: number; inventory_items: number; brains_master_purchases: number };
    achievements: { records: number; unlocked: number };
    notifications: { total: number; unread: number };
    onboarding_events: { total: number; latest_at: string | null };
  };
  onboarding: {
    segment: string | null;
    context_type: string | null;
    context_id: string | null;
    current_step: string | null;
    completed_steps: unknown;
    core_completed_at: string | null;
    first_value_started_at: string | null;
    first_value_completed_at: string | null;
    created_at: string | null;
    updated_at: string | null;
  } | null;
  ielts: {
    profile: {
      username: string | null;
      full_name: string | null;
      email: string | null;
      tier: string | null;
      phone: string | null;
      target_band: number | null;
      test_date: string | null;
      created_at: string | null;
      updated_at: string | null;
    } | null;
    membership: { plan: string | null; status: string | null; starts_at: string | null; expires_at: string | null; created_at: string | null } | null;
    prime_subscription: { plan: string | null; status: string | null; current_period_start: string | null; current_period_end: string | null; cancel_at_period_end: boolean; created_at: string | null } | null;
    attempts: { reading: number; listening: number; writing: number; speaking: number; mock_tests: number; exam_attempts: number };
  };
  writing_hub: {
    profile: { grade: number | null; genre: string | null; created_at: string | null; updated_at: string | null } | null;
    assessments: number;
    average_score: number | null;
    latest_assessment: { total_score: number | null; status: string | null; created_at: string | null } | null;
    monthly_reports: number;
  };
  warnings: IntelligenceWarning[];
}

export async function fetchSuperadminUserIntelligence(userId: string): Promise<SuperadminUserIntelligence> {
  const { data, error } = await supabase.rpc('rpc_superadmin_user_intelligence', { p_user_id: userId });
  if (error) throw error;
  if (!data || typeof data !== 'object') throw new Error('User intelligence returned an empty payload.');
  return data as SuperadminUserIntelligence;
}
