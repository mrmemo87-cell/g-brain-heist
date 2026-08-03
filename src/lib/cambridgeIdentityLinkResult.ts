export interface CambridgeIdentityLinkResult {
  success: boolean;
  error?: string;
  code?: string;
  audit_id?: string;
  score_id?: string;
  student_id?: string;
  student_name?: string;
}

const optionalString = (value: unknown): string | undefined =>
  typeof value === 'string' && value.length > 0 ? value : undefined;

export const normalizeCambridgeIdentityLinkResult = (
  payload: unknown,
): CambridgeIdentityLinkResult => {
  if (!payload || typeof payload !== 'object') {
    return { success: false, error: 'The identity service returned an invalid response' };
  }

  const result = payload as Record<string, unknown>;
  if (result['success'] !== true) {
    return {
      success: false,
      error: optionalString(result['error']) || 'The identity service returned an invalid response',
      code: optionalString(result['code']),
    };
  }

  return {
    success: true,
    code: optionalString(result['code']),
    audit_id: optionalString(result['audit_id']),
    score_id: optionalString(result['score_id']),
    student_id: optionalString(result['student_id']),
    student_name: optionalString(result['student_name']),
  };
};
