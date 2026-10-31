import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';
test('performance overlay styling darkens only overlay wrappers, never dialog panels or bank surfaces', () => {
    const dom = new JSDOM(`<body class="light-mode">
    <div class="legacy-modal-overlay" id="legacy"></div>
    <div class="legacy-modal" id="legacy-panel"><div class="legacy-modal-actions" id="legacy-actions"></div></div>
    <div class="intervention-modal-layer" id="intervention-layer"><section class="intervention-modal intervention-review-modal" id="intervention-panel"><div class="intervention-modal-kicker" id="intervention-kicker"></div><div class="modal-error" id="modal-error"></div></section></div>
    <div class="qb-modal" role="dialog" aria-modal="true">
      <article class="qb-modal__card"><div class="qb-modal__header-actions"><button class="qb-modal__close">Close</button></div><div class="qb-modal__questions"></div></article>
    </div>
  </body>`);
    try {
        const { document } = dom.window;
        const style = document.createElement('style');
        style.textContent = readFileSync('src/styles/light-mode.css', 'utf8');
        document.head.append(style);
        const overlayRule = Array.from(style.sheet.cssRules).find((rule) => 'selectorText' in rule && String(rule.selectorText).includes('modal-overlay'));
        assert.ok(overlayRule);
        assert.equal(document.getElementById('legacy').matches(overlayRule.selectorText), true);
        assert.equal(document.getElementById('intervention-layer').matches(overlayRule.selectorText), true);
        // Dialog panels and their parts must never receive the dark scrim (2026-10-31 regression).
        for (const id of ['legacy-panel', 'legacy-actions', 'intervention-panel', 'intervention-kicker', 'modal-error']) {
            assert.equal(document.getElementById(id).matches(overlayRule.selectorText), false, id);
        }
        for (const element of document.querySelectorAll('.qb-modal, .qb-modal *')) {
            assert.equal(element.matches(overlayRule.selectorText), false, element.className);
        }
    }
    finally {
        dom.window.close();
    }
});
