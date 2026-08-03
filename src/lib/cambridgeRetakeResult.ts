export interface CambridgeRetakeResult {
  success: boolean;
  error?: string;
  code?: string;
  history_id?: string;
  test_id?: string;
  quiz_version?: string;
  attempt_number?: number;
}

const optionalString = (value: unknown): string | undefined =>
  typeof value === 'string' && value.length > 0 ? value : undefined;

export const normalizeCambridgeRetakeResult = (payload: unknown): CambridgeRetakeResult => {
  if (!payload || typeof payload !== 'object') {
    return { success: false, error: 'The retake service returned an invalid response' };
  }

  const result = payload as Record<string, unknown>;
  if (result['success'] !== true) {
    return {
      success: false,
      error: optionalString(result['error']) || 'The retake service returned an invalid response',
      code: optionalString(result['code']),
    };
  }

  return {
    success: true,
    code: optionalString(result['code']),
    history_id: optionalString(result['history_id']),
    test_id: optionalString(result['test_id']),
    quiz_version: optionalString(result['quiz_version']),
    attempt_number: typeof result['attempt_number'] === 'number' ? result['attempt_number'] : undefined,
  };
};
