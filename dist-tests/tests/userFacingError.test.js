import assert from 'node:assert/strict';
import test from 'node:test';
import { SERVER_TIMEOUT_MESSAGE, userFacingError } from '../services/userFacingError.js';
test('a Postgres statement timeout is reported as a server-side delay, not a connection problem', () => {
    // Shape PostgREST returns for SQLSTATE 57014 (observed on rpc_teacher_student_intervention_workspace_v2).
    const pgTimeout = { code: '57014', details: null, hint: null, message: 'canceling statement due to statement timeout' };
    const mapped = userFacingError(pgTimeout, 'fallback');
    assert.equal(mapped.message, SERVER_TIMEOUT_MESSAGE);
    assert.doesNotMatch(mapped.message, /check your connection/i);
    // Code alone is enough, even if the message wording changes.
    assert.equal(userFacingError({ code: '57014', message: 'something else' }, 'fallback').message, SERVER_TIMEOUT_MESSAGE);
});
test('genuine network failures still map to the connection message', () => {
    for (const raw of [new TypeError('Failed to fetch'), new Error('Load failed'), new Error('network error'), new Error('request timeout')]) {
        assert.match(userFacingError(raw, 'fallback').message, /could not connect just now/i);
    }
});
test('authorization and unknown errors are unaffected', () => {
    assert.match(userFacingError(new Error('permission denied for table x'), 'fallback').message, /do not currently have access/i);
    assert.equal(userFacingError(new Error('weird'), 'fallback').message, 'fallback');
});
