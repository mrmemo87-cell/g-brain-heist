import { supabase } from './supabaseClient';

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

const parseRequestResponse = (data: any): SchoolRequestResponse => {
  if (!data) {
    return { success: false, error: 'No response from server.' };
  }

  if (data.success) {
    return {
      success: true,
      message: data.message,
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
  const trimmedName = payload.schoolName.trim();

  const tryV2 = async () => {
    const { data, error } = await supabase.rpc('request_school_v2', {
      p_school_name: trimmedName,
      p_city: payload.city,
      p_country: payload.country,
      p_website: payload.website || null,
      p_notes: payload.notes || null,
      p_requester_role: payload.requesterRole,
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
  const isMissingV2 = v2Message.includes('request_school_v2') || v2Result.error?.code === 'PGRST202';
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
): Promise<{ success: boolean; error?: string; message?: string; inviteCode?: string | null }> => {
  const { data, error } = await supabase.rpc('admin_review_school_request', {
    p_request_id: requestId,
    p_action: action,
    p_notes: notes || null,
    p_existing_school_id: existingSchoolId || null,
  });

  if (error) {
    return { success: false, error: error.message };
  }

  const result = data as { success?: boolean; error?: string; message?: string; invite_code?: string };
  if (result?.success === false) {
    return { success: false, error: result.error || 'Request update failed.' };
  }

  return { success: true, message: result?.message, inviteCode: result?.invite_code ?? null };
};

export const sendSchoolRequestMessage = async (
  requestId: string,
  message: string
): Promise<{ success: boolean; error?: string }> => {
  const tryRpc = async (rpcName: string) => {
    const { error } = await supabase.rpc(rpcName, {
      p_request_id: requestId,
      p_message: message,
    });
    return error;
  };

  const v2Error = await tryRpc('request_school_message_v2');
  if (!v2Error) {
    return { success: true };
  }
  const isMissingV2 = v2Error.message?.includes('request_school_message_v2') || v2Error.code === 'PGRST202';
  if (!isMissingV2) {
    return { success: false, error: v2Error.message };
  }

  const { error } = await supabase
    .from('school_requests')
    .update({ requester_notes: message })
    .eq('id', requestId);

  if (error) {
    return { success: false, error: 'Request messaging is not available yet.' };
  }

  return { success: true };
};
