import { supabase } from './supabaseClient';
import { getIeltsPrimeSubscriptionStatus, type IeltsPrimeSubscriptionStatus } from './ieltsPrimeBillingService';
import { fetchActiveReadingSets, fetchActiveListeningSets, fetchActiveWritingTasks, fetchActiveSpeakingTasks, fetchUserCompletedTasks, getUserTier, isIeltsPrime, type UserCompletedTasks } from './ieltsService';
import type { IELTSListeningSet, IELTSReadingSet, IELTSSpeakingTask, IELTSWritingTask } from '../types';

export type IeltsSkill = 'reading' | 'listening' | 'writing' | 'speaking';

export interface IeltsDiagnosticSummary {
  completed: boolean;
  taskId: string;
  skill: IeltsSkill;
  estimatedBand: number | null;
  completedAt: string | null;
}

export interface IeltsDashboardSummary {
  isAuthenticated: boolean;
  displayName: string | null;
  username: string | null;
  targetBand: number | null;
  tier: string;
  isPrimeActive: boolean;
  subscription: IeltsPrimeSubscriptionStatus;
  diagnostic: IeltsDiagnosticSummary;
  completedTasks: UserCompletedTasks;
  tasks: {
    reading: IELTSReadingSet[];
    listening: IELTSListeningSet[];
    writing: IELTSWritingTask[];
    speaking: IELTSSpeakingTask[];
  };
  recentActivity: string | null;
  weakestSkill: IeltsSkill | null;
}

const toNumber = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

export async function fetchIeltsDashboardSummary(): Promise<IeltsDashboardSummary> {
  const { data: auth } = await supabase.auth.getUser();
  const user = auth.user;
  const emptyCompleted: UserCompletedTasks = { reading: [], listening: [], writing: [], speaking: [] };
  const emptySubscription: IeltsPrimeSubscriptionStatus = {
    has_subscription: false,
    status: null,
    plan: null,
    current_period_end: null,
    cancel_at_period_end: false,
    management_url: null,
    update_payment_url: null,
  };

  if (!user) {
    return {
      isAuthenticated: false,
      displayName: null,
      username: null,
      targetBand: null,
      tier: 'free',
      isPrimeActive: false,
      subscription: emptySubscription,
      diagnostic: { completed: false, taskId: 'trial-test-2', skill: 'listening', estimatedBand: null, completedAt: null },
      completedTasks: emptyCompleted,
      tasks: { reading: [], listening: [], writing: [], speaking: [] },
      recentActivity: null,
      weakestSkill: null,
    };
  }

  const [tier, subscription, reading, listening, writing, speaking, completedTasks, ieltsUser, diagnosticEvent] = await Promise.all([
    getUserTier(),
    getIeltsPrimeSubscriptionStatus(),
    fetchActiveReadingSets().catch(() => []),
    fetchActiveListeningSets().catch(() => []),
    fetchActiveWritingTasks().catch(() => []),
    fetchActiveSpeakingTasks().catch(() => []),
    fetchUserCompletedTasks().catch(() => emptyCompleted),
    supabase.from('ielts_users').select('username, target_band, tier, updated_at').eq('id', user.id).maybeSingle(),
    supabase
      .from('ielts_funnel_events')
      .select('created_at, metadata')
      .eq('user_id', user.id)
      .eq('event_name', 'diagnostic_completed')
      .contains('metadata', { task_id: 'trial-test-2' })
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const metadata = (diagnosticEvent.data?.metadata || {}) as Record<string, unknown>;
  const estimatedBand = toNumber(metadata['estimated_band']);
  const diagnosticCompleted = Boolean(diagnosticEvent.data);
  const typedIeltsUser = ieltsUser.data as { username?: string | null; target_band?: number | null; updated_at?: string | null } | null;
  const displayName = user.user_metadata?.['full_name'] || user.user_metadata?.['name'] || typedIeltsUser?.username || user.email?.split('@')[0] || null;
  const isPrimeActive = isIeltsPrime({ tier }) || subscription.status === 'active';
  const completedCounts = Object.values(completedTasks).flat().length;

  return {
    isAuthenticated: true,
    displayName,
    username: typedIeltsUser?.username || null,
    targetBand: typedIeltsUser?.target_band ?? null,
    tier,
    isPrimeActive,
    subscription,
    diagnostic: {
      completed: diagnosticCompleted,
      taskId: 'trial-test-2',
      skill: 'listening',
      estimatedBand,
      completedAt: diagnosticEvent.data?.created_at || null,
    },
    completedTasks,
    tasks: { reading, listening, writing, speaking },
    recentActivity: diagnosticEvent.data?.created_at || (completedCounts > 0 ? 'Practice activity available' : null),
    weakestSkill: diagnosticCompleted ? 'listening' : null,
  };
}
