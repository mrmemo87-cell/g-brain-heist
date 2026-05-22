import assert from 'node:assert/strict';
import test from 'node:test';
import { decideNeedsSetup } from '../src/features/onboarding/setupStatus.js';
test('brand-new profile with defaulted role still enters setup when profile needs_setup is true', () => {
    const decision = decideNeedsSetup({
        status: {
            authenticated: true,
            needs_setup: true,
            reason: 'incomplete_profile',
            has_role: true,
        },
        profileNeedsSetup: true,
    });
    assert.equal(decision.needsSetup, true);
    assert.equal(decision.reason, 'profile_needs_setup_true');
});
test('completed individual profile is not forced back into setup by legacy school_id-null RPC response', () => {
    const decision = decideNeedsSetup({
        status: {
            authenticated: true,
            needs_setup: true,
            reason: 'incomplete_profile',
            has_role: true,
        },
        profileNeedsSetup: false,
    });
    assert.equal(decision.needsSetup, false);
    assert.equal(decision.reason, 'profile_needs_setup_false');
});
test('missing profile enters setup even without a profile snapshot', () => {
    const decision = decideNeedsSetup({
        status: {
            authenticated: true,
            needs_setup: true,
            reason: 'no_profile',
            has_role: false,
        },
    });
    assert.equal(decision.needsSetup, true);
    assert.equal(decision.reason, 'missing_profile');
});
