import { supabase } from './supabaseClient';
import type { RealtimeChannel } from '@supabase/supabase-js';

export type SchoolRequestStatus = 'pending' | 'needs_more_info' | 'approved' | 'rejected' | 'duplicate';

export interface SchoolRequestSuggestion {
  name: string;
  invite_code?: string | null;
}

export interface SchoolRequestResponse {
  success: boolean;
  error?: string;
  message?: string;
  requestId?: string;
  status?: SchoolRequestStatus;
  suggestions?: SchoolRequestSuggestion[];
  existingSchool?: SchoolRequestSuggestion | null;
}

export interface SchoolRequestPayload {
  schoolName: string;
  city: string;
  country: string;
  contactEmail?: string;
  website?: string;
  notes?: string;
  requesterRole: 'student' | 'teacher';
}

export interface SchoolRequestRecord {
  id: string;
  requested_name: string;
  requester_email?: string | null;
  requester_role?: string | null;
  status?: SchoolRequestStatus | string | null;
  created_at?: string | null;
  admin_notes?: string | null;
  approved_school_id?: string | null;
}

export interface SchoolRequestMessage {
  id: string;
  request_id: string;
  message: string;
  sender_role?: string | null;
  created_at?: string | null;
}

export interface SchoolRequestMessageRealtimePayload {
  eventType: 'INSERT' | 'UPDATE' | 'DELETE';
  new: { request_id?: string | null } | null;
  old: { request_id?: string | null } | null;
}

export type SchoolRequestViewerRole = 'admin' | 'applicant';

const decodeTokenRole = (token?: string | null) => {
  if (!token) return null;
  const payload = token.split('.')[1];
  if (!payload) return null;
  try {
    const decoded = JSON.parse(globalThis.atob(payload));
    return decoded?.role ?? null;
  } catch {
    return null;
  }
};

const parseRequestResponse = (data: any): SchoolRequestResponse => {
  if (!data) {
    return { success: false, error: 'No response from server.' };
  }

  const hasAcceptedRequestShape = Boolean(
    data?.request_id || data?.requestId || (data?.status && !data?.error)
  );

  if (data.success || hasAcceptedRequestShape) {
    return {
      success: true,
      message: data.message ?? 'Your request has been submitted.',
      requestId: data.request_id ?? data.requestId,
      status: data.status ?? 'pending',
      suggestions: data.similar_schools ?? data.suggestions ?? [],
    };
  }

  return {
    success: false,
    error: data.error || 'Request failed.',
    requestId: data.request_id ?? data.requestId,
    status: data.status,
    suggestions: data.similar_schools ?? data.suggestions ?? [],
    existingSchool: data.existing_school ?? data.existingSchool ?? null,
    message: data.message,
  };
};

export const requestSchool = async (payload: SchoolRequestPayload): Promise<SchoolRequestResponse> => {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  const session = sessionData?.session ?? null;
  if (import.meta.env.DEV) {
    const role = decodeTokenRole(session?.access_token);
    console.log('[SchoolRequest] session?', Boolean(session), session?.user?.id, role);
  }

  if (sessionError || !session) {
    return { success: false, error: 'Please log in to submit a school request.' };
  }

  // Check email verification
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email_confirmed_at) {
    return { success: false, error: 'Please verify your email before requesting a school' };
  }

  const trimmedName = payload.schoolName.trim();

  const tryV2 = async () => {
    const { data, error } = await supabase.rpc('request_school_v2', {
      p_requested_name: trimmedName,
      p_requester_role: payload.requesterRole,
      p_city: payload.city,
      p_country: payload.country,
      p_website: payload.website || null,
      p_contact_email: payload.contactEmail || null,
      p_notes: payload.notes || null,
    });

    if (error) {
      return { error };
    }

    return { data };
  };

  const v2Result = await tryV2();
  if (!v2Result.error) {
    return parseRequestResponse(v2Result.data);
  }
  const v2Message = v2Result.error?.message || '';
  const v2Status = (v2Result.error as { status?: number } | null)?.status;
  const isMissingV2 = v2Status === 404 || v2Message.includes('request_school_v2') || v2Result.error?.code === 'PGRST202';
  if (!isMissingV2) {
    return { success: false, error: v2Message || 'Unable to submit school request.' };
  }

  const { data, error } = await supabase.rpc('request_school', {
    p_school_name: trimmedName,
    p_requester_role: payload.requesterRole,
  });

  if (error) {
    return { success: false, error: error.message || 'Unable to submit school request.' };
  }

  return parseRequestResponse(data);
};

export const listSchoolRequests = async (
  status: string | null,
  limit = 50
): Promise<{ success: boolean; error?: string; requests: SchoolRequestRecord[] }> => {
  const { data, error } = await supabase.rpc('admin_list_school_requests', {
    p_status: status,
    p_limit: limit,
  });

  if (error) {
    return { success: false, error: error.message, requests: [] };
  }

  const result = data as { success?: boolean; requests?: SchoolRequestRecord[]; error?: string };
  if (result?.success === false) {
    return { success: false, error: result.error || 'Unable to load requests.', requests: [] };
  }

  return { success: true, requests: result?.requests ?? [] };
};

export const reviewSchoolRequest = async (
  requestId: string,
  action: 'approve' | 'reject' | 'mark_duplicate' | 'needs_more_info',
  notes?: string,
  existingSchoolId?: string | null
): Promise<{ success: boolean; error?: string; message?: string; inviteCode?: string | null; schoolId?: string | null }> => {
  if (action === 'needs_more_info') {
    const { data, error } = await supabase.rpc('admin_school_request_need_more_info', {
      p_request_id: requestId,
      p_message: notes || null,
    });

    if (error) {
      return { success: false, error: error.message };
    }

    const result = data as { success?: boolean; error?: string; message?: string };
    if (result?.success === false) {
      return { success: false, error: result.error || 'Request update failed.' };
    }

    return { success: true, message: result?.message ?? 'Request updated.' };
  }

  const { data, error } = await supabase.rpc('admin_review_school_request', {
    p_request_id: requestId,
    p_action: action,
    p_notes: notes || null,
    p_existing_school_id: existingSchoolId || null,
  });

  if (error) {
    return { success: false, error: error.message };
  }

  const result = data as {
    success?: boolean;
    error?: string;
    message?: string;
    invite_code?: string;
    school_id?: string;
  };
  if (result?.success === false) {
    return { success: false, error: result.error || 'Request update failed.' };
  }

  return {
    success: true,
    message: result?.message,
    inviteCode: result?.invite_code ?? null,
    schoolId: result?.school_id ?? null,
  };
};

export const sendSchoolRequestMessage = async (
  requestId: string,
  message: string,
  senderRole: 'applicant' | 'admin' = 'applicant'
): Promise<{ success: boolean; error?: string }> => {
  const rpcName = senderRole === 'admin' ? 'admin_school_request_need_more_info' : 'school_request_reply';
  const { error } = await supabase.rpc(rpcName, {
    p_request_id: requestId,
    p_message: message,
  });

  if (error) {
    return { success: false, error: error.message || 'Request messaging is not available yet.' };
  }

  return { success: true };
};

export const listMySchoolRequests = async (): Promise<{
  success: boolean;
  error?: string;
  requests: SchoolRequestRecord[];
}> => {
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData?.user) {
    return { success: false, error: 'Log in to view applications.', requests: [] };
  }

  const { data, error } = await supabase
    .from('school_requests')
    .select('id, requested_name, requester_email, requester_role, status, created_at, admin_notes, approved_school_id')
    .eq('requested_by', authData.user.id)
    .order('created_at', { ascending: false });

  if (error) {
    return { success: false, error: error.message, requests: [] };
  }

  return { success: true, requests: data ?? [] };
};

export const listSchoolRequestMessages = async (
  requestId: string
): Promise<{ success: boolean; error?: string; unavailable?: boolean; messages: SchoolRequestMessage[] }> => {
  const { data, error } = await supabase
    .from('school_request_messages')
    .select('id, request_id, message, sender_role, created_at')
    .eq('request_id', requestId)
    .order('created_at', { ascending: true });

  if (error) {
    const isMissingTable = error.code === '42P01' || error.message?.includes('school_request_messages');
    if (isMissingTable) {
      return { success: true, unavailable: true, messages: [] };
    }
    return { success: false, error: error.message, messages: [] };
  }

  return { success: true, messages: data ?? [] };
};

const SCHOOL_REQUEST_LAST_SEEN_PREFIX = 'school-request-last-seen:';

const getSchoolRequestLastSeenKey = (requestId: string, viewerRole: SchoolRequestViewerRole) =>
  `${SCHOOL_REQUEST_LAST_SEEN_PREFIX}${viewerRole}:${requestId}`;

const safeLocalStorageGet = (key: string): string | null => {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
};

const safeLocalStorageSet = (key: string, value: string) => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Ignore storage failures (privacy mode, quota, etc.)
  }
};

export const getSchoolRequestLastSeenAt = (
  requestId: string,
  viewerRole: SchoolRequestViewerRole
): string | null => {
  return safeLocalStorageGet(getSchoolRequestLastSeenKey(requestId, viewerRole));
};

export const markSchoolRequestThreadSeen = (
  requestId: string,
  viewerRole: SchoolRequestViewerRole,
  seenAt = new Date().toISOString()
) => {
  safeLocalStorageSet(getSchoolRequestLastSeenKey(requestId, viewerRole), seenAt);
};

export const getUnreadSchoolRequestMessageCount = (
  messages: SchoolRequestMessage[],
  viewerRole: SchoolRequestViewerRole,
  lastSeenAt: string | null
): number => {
  const lastSeenMs = lastSeenAt ? Date.parse(lastSeenAt) : 0;
  const isAdminViewer = viewerRole === 'admin';

  return messages.reduce((count, message) => {
    const senderRole = (message.sender_role || '').toLowerCase();
    // Applicant should treat any non-applicant sender as incoming (admin, superadmin, moderator, etc.)
    // Admin should treat any non-admin sender as incoming.
    const isIncomingForViewer = isAdminViewer ? senderRole !== 'admin' : senderRole !== 'applicant';
    if (!isIncomingForViewer) return count;

    if (!message.created_at) {
      return count + 1;
    }

    const createdAtMs = Date.parse(message.created_at);
    if (Number.isNaN(createdAtMs)) {
      return count + 1;
    }

    return createdAtMs > lastSeenMs ? count + 1 : count;
  }, 0);
};

export const subscribeToSchoolRequestMessageChanges = (
  channelName: string,
  onMessageChange: (payload: SchoolRequestMessageRealtimePayload) => void
): RealtimeChannel => {
  const channel = supabase
    .channel(channelName)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'school_request_messages',
      },
      (payload) => {
        onMessageChange(payload as SchoolRequestMessageRealtimePayload);
      }
    )
    .subscribe();

  return channel;
};
