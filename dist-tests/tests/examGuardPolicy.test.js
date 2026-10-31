import test from 'node:test';
import assert from 'node:assert/strict';
import { COARSE_POINTER_BLUR_GRACE_MS, FOCUS_LOSS_COALESCE_MS, detectCoarsePointer, effectiveBlurGraceMs, isFocusLossType, shouldCoalesceFocusLoss, } from '../src/lib/examGuardPolicy.js';
test('one app switch (blur then hidden) counts as a single strike', () => {
    const t0 = 10_000;
    assert.equal(shouldCoalesceFocusLoss('window_blur', t0, null), false, 'first event counts');
    assert.equal(shouldCoalesceFocusLoss('tab_hidden', t0 + 400, t0), true, 'hidden right after blur is the same event');
    assert.equal(shouldCoalesceFocusLoss('tab_hidden', t0 + FOCUS_LOSS_COALESCE_MS, t0), false, 'a later leave counts again');
});
test('coalescing never hides copy, paste, shortcut or typing-burst violations', () => {
    const t0 = 10_000;
    for (const type of ['copy', 'cut', 'paste', 'shortcut', 'contextmenu', 'dragdrop', 'suspicious_jump']) {
        assert.equal(isFocusLossType(type), false, type);
        assert.equal(shouldCoalesceFocusLoss(type, t0 + 100, t0), false, type);
    }
});
test('touch devices get a longer blur grace; desktop and explicit zero are unchanged', () => {
    assert.equal(effectiveBlurGraceMs(300, false, 300), 300, 'desktop keeps the caller value');
    assert.equal(effectiveBlurGraceMs(300, true, 300), COARSE_POINTER_BLUR_GRACE_MS, 'phone raised to the floor');
    assert.equal(effectiveBlurGraceMs(5000, true, 300), 5000, 'a caller value above the floor wins');
    assert.equal(effectiveBlurGraceMs(0, true, 300), 0, 'explicit no-grace is respected');
    assert.equal(effectiveBlurGraceMs(undefined, false, 300), 300, 'default applies when unset');
});
test('coarse pointer detection is safe without matchMedia', () => {
    assert.equal(detectCoarsePointer({ matchMedia: () => ({ matches: true }) }), true);
    assert.equal(detectCoarsePointer({ matchMedia: () => ({ matches: false }) }), false);
    assert.equal(detectCoarsePointer({}), false);
    assert.equal(detectCoarsePointer({ matchMedia: () => { throw new Error('unsupported'); } }), false);
    assert.equal(detectCoarsePointer(undefined), false);
});
