const optionalString = (value) => typeof value === 'string' && value.length > 0 ? value : undefined;
export const normalizeCambridgeRetakeResult = (payload) => {
    if (!payload || typeof payload !== 'object') {
        return { success: false, error: 'The retake service returned an invalid response' };
    }
    const result = payload;
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
