import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';

test('performance overlay styling excludes bank surfaces while retaining legacy wrappers', () => {
  const dom = new JSDOM(`<body class="light-mode">
    <div class="legacy-modal" id="legacy"></div>
    <div class="qb-modal" role="dialog" aria-modal="true">
      <article class="qb-modal__card"><div class="qb-modal__header-actions"><button class="qb-modal__close">Close</button></div><div class="qb-modal__questions"></div></article>
    </div>
  </body>`);
  try {
    const { document } = dom.window;
    const style = document.createElement('style');
    style.textContent = readFileSync('src/styles/light-mode.css', 'utf8');
    document.head.append(style);
    const overlayRule = Array.from(style.sheet!.cssRules).find((rule) =>
      'selectorText' in rule && String(rule.selectorText).includes('[class*="modal"]'),
    ) as CSSStyleRule;
    assert.ok(overlayRule);
    assert.equal(document.getElementById('legacy')!.matches(overlayRule.selectorText), true);
    for (const element of document.querySelectorAll('.qb-modal, .qb-modal *')) {
      assert.equal(element.matches(overlayRule.selectorText), false, element.className);
    }
  } finally { dom.window.close(); }
});
