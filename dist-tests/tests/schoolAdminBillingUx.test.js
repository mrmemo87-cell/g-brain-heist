import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
const studio = readFileSync('components/school-admin/BillingStudio.tsx', 'utf8');
const portal = readFileSync('components/SchoolAdminPortal.tsx', 'utf8');
const styles = readFileSync('src/index.css', 'utf8');
test('billing configuration starts monthly and preserves a reconcilable receipt hierarchy', () => {
    assert.match(studio, /contractTerm: 'monthly'/);
    assert.match(portal, /useState<'monthly' \| 'yearly'>\('monthly'\)/);
    const totalPosition = studio.indexOf('>Total</strong>');
    const discountsPosition = studio.indexOf('calculation.discounts.combination_bps');
    const toPayPosition = studio.indexOf('>To Pay</p>');
    assert.ok(totalPosition >= 0, 'receipt should show Total');
    assert.ok(discountsPosition > totalPosition, 'discounts should follow Total');
    assert.ok(toPayPosition > discountsPosition, 'To Pay should follow discounts');
    assert.match(studio, /combinationDiscountTotalMinor = \(calculation\?\.discounts\.combination_monthly_minor \?\? 0\) \* \(calculation\?\.totals\.months \?\? 1\)/);
});
test('selected billing choices stay white under the admin light-theme adapter', () => {
    assert.match(studio, /billing-choice[\s\S]*billing-on-dark/);
    assert.match(styles, /billing-choice\[aria-pressed="true"\][\s\S]*color:#fff !important/);
});
test('school admin desktop navigation collapses to icon buttons with persisted preference and tooltips', () => {
    assert.match(portal, /brains-heist:school-admin-sidebar-collapsed/);
    assert.match(portal, /SCHOOL_ADMIN_SIDEBAR_COMPACT_QUERY = '\(max-width: 1279px\)'/);
    assert.match(portal, /localStorage\.setItem\(SCHOOL_ADMIN_SIDEBAR_STORAGE_KEY/);
    assert.match(portal, /school-admin-nav-icon/);
    assert.match(portal, /<CollapsedNavTooltip label=\{desktopAdminNavTooltip\.label\} anchor=\{desktopAdminNavTooltip\.anchor\}/);
    assert.match(styles, /\.school-admin-layout\.is-sidebar-collapsed \{ grid-template-columns:76px minmax\(0,1fr\); \}/);
    assert.match(styles, /\.school-admin-sidebar\.is-collapsed \.school-admin-nav-text/);
});
