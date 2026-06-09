import { supabase } from './supabaseClient';

const ADMIN_ROLES = new Set(['school_admin', 'admin', 'superadmin']);

export interface IeltsExtraPracticeAccess {
  role: string;
  isAdmin: boolean;
  enabled: boolean;
}

export async function resolveIeltsExtraPracticeAccess(): Promise<IeltsExtraPracticeAccess> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return { role: 'student', isAdmin: false, enabled: false };

  const { data: profile } = await supabase
    .from('users')
    .select('role, school_id')
    .eq('id', auth.user.id)
    .maybeSingle();

  const role = ((profile as { role?: string | null } | null)?.role || 'student').trim().toLowerCase();
  const isAdmin = ADMIN_ROLES.has(role);

  if (isAdmin) return { role, isAdmin: true, enabled: true };

  const schoolId = (profile as { school_id?: string | null } | null)?.school_id;
  // Independent IELTS learners are not attached to a school; allow the
  // public funnel/free-task flow to work without weakening school settings.
  if (!schoolId) return { role, isAdmin: false, enabled: true };

  const { data: school } = await supabase
    .from('schools')
    .select('settings')
    .eq('id', schoolId)
    .maybeSingle();

  const raw = (school as { settings?: Record<string, unknown> | null } | null)?.settings?.['ielts_extra_practice_enabled'];
  const enabled = typeof raw === 'boolean' ? raw : false;

  return { role, isAdmin: false, enabled };
}
