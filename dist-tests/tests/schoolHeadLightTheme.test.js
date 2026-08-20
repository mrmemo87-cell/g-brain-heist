import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
const portalTheme = readFileSync('src/styles/school-head.css', 'utf8');
const intelligence = readFileSync('components/school-head/SchoolHeadLearningIntelligence.tsx', 'utf8');
const intelligenceTheme = readFileSync('components/school-head/SchoolHeadLearningIntelligence.light.css', 'utf8');
const governance = readFileSync('components/school-head/AcademicIntelligenceGovernance.tsx', 'utf8');
const governanceTheme = readFileSync('components/school-head/AcademicIntelligenceGovernance.light.css', 'utf8');
const reportBuilder = readFileSync('components/student-progress/AcademicReportBuilder.tsx', 'utf8');
const reportBuilderTheme = readFileSync('components/student-progress/AcademicReportBuilder.school-head-light.css', 'utf8');
const entry = readFileSync('src/schoolHeadLearningIntelligenceEntry.tsx', 'utf8');
const html = readFileSync('school-head-learning-intelligence.html', 'utf8');
test('the executive portal uses a light-only foundation across all tabs and states', () => {
    assert.match(portalTheme, /--head-bg:\s*#f5f7fb/i);
    assert.match(portalTheme, /--head-surface:\s*#ffffff/i);
    assert.match(portalTheme, /--head-ink:\s*#10243a/i);
    assert.match(portalTheme, /color-scheme:\s*light/i);
    assert.match(portalTheme, /\.school-head-transfer-modal[\s\S]*background:\s*#fff/i);
    assert.match(portalTheme, /\.school-head-mobile-nav[\s\S]*background:\s*rgba\(255, 255, 255/i);
    assert.doesNotMatch(portalTheme, /--head-bg:\s*#07101d/i);
});
test('academic intelligence and governance load their light overrides', () => {
    assert.match(intelligence, /SchoolHeadLearningIntelligence\.light\.css/);
    assert.match(intelligenceTheme, /\.shli-shell[\s\S]*#f5f7fb[\s\S]*color-scheme:\s*light/i);
    assert.match(governance, /AcademicIntelligenceGovernance\.light\.css/);
    assert.match(governanceTheme, /\.aig-modal[\s\S]*background:\s*#f7f9fc[\s\S]*color-scheme:\s*light/i);
});
test('School Head report builder and standalone auth states stay light', () => {
    assert.match(intelligence, /appearance="school-head-light"/);
    assert.match(reportBuilder, /appearance\?:\s*'default'\s*\|\s*'school-head-light'/);
    assert.match(reportBuilderTheme, /\.arb-overlay\.is-school-head-light[\s\S]*\.arb-toolbar[\s\S]*background:\s*#fff/i);
    assert.doesNotMatch(entry, /#07101d/i);
    assert.match(entry, /background:\s*'#f5f7fb'/i);
    assert.match(html, /theme-color" content="#f5f7fb"/i);
    assert.match(html, /body style="margin:0;background:#f5f7fb"/i);
});
