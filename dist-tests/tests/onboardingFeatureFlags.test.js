import assert from 'node:assert/strict';
import test from 'node:test';
import { isOnboardingDebugEnabled } from '../src/features/onboarding/featureFlags.js';
const installDebugLocalStorage = (values) => {
    const previousWindow = globalThis.window;
    Object.defineProperty(globalThis, 'window', {
        configurable: true,
        value: {
            localStorage: {
                getItem: (key) => values[key] ?? null,
            },
        },
    });
    return () => {
        if (previousWindow === undefined) {
            Reflect.deleteProperty(globalThis, 'window');
        }
        else {
            Object.defineProperty(globalThis, 'window', { configurable: true, value: previousWindow });
        }
    };
};
test('onboarding debug logging is disabled by default', () => {
    const restore = installDebugLocalStorage({});
    try {
        assert.equal(isOnboardingDebugEnabled(), false);
    }
    finally {
        restore();
    }
});
test('onboarding debug logging can be enabled by localStorage', () => {
    const restore = installDebugLocalStorage({ brains_heist_onboarding_debug: 'true' });
    try {
        assert.equal(isOnboardingDebugEnabled(), true);
    }
    finally {
        restore();
    }
});
