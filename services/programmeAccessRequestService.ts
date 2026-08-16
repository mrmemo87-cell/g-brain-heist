import { supabase } from './supabaseClient';
import type { StudentProgrammeKey } from './entitlementService';

export interface ProgrammeAccessRequestResult {
  success: boolean;
  status: 'created' | 'already_pending';
  requestId: string;
}

export async function listMyPendingProgrammeAccessRequests(): Promise<StudentProgrammeKey[]> {
  const { data, error } = await supabase.rpc('student_list_programme_access_requests');
  if (error) throw new Error(error.message || 'Could not load programme requests.');
  const rows = Array.isArray(data) ? data : [];
  return rows.flatMap((row) => {
    const moduleKey = row && typeof row === 'object' ? (row as Record<string, unknown>)['module_key'] : null;
    return moduleKey === 'cambridge' || moduleKey === 'ielts' || moduleKey === 'writing'
      ? [moduleKey]
      : [];
  });
}

export async function requestProgrammeAccess(moduleKey: StudentProgrammeKey): Promise<ProgrammeAccessRequestResult> {
  const { data, error } = await supabase.rpc('student_request_programme_access', {
    p_module_key: moduleKey,
  });
  if (error) throw new Error(error.message || 'Could not send your request.');
  const payload = data && typeof data === 'object' && !Array.isArray(data)
    ? data as Record<string, unknown>
    : {};
  if (payload['success'] !== true || typeof payload['request_id'] !== 'string') {
    throw new Error(typeof payload['error'] === 'string' ? payload['error'] : 'Could not send your request.');
  }
  return {
    success: true,
    status: payload['status'] === 'already_pending' ? 'already_pending' : 'created',
    requestId: payload['request_id'],
  };
}
