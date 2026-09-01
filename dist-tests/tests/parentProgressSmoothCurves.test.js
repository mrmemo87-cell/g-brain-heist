import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
const read = (path) => fs.readFileSync(path, 'utf8');
test('parent progress connects every multi-point evidence series with controlled smooth SVG curves', () => {
    const chart = read('components/guardian/ParentLearningTrendChart.tsx');
    assert.match(chart, /const buildSmoothPath = \(points: ChartCoordinate\[\]\)/);
    assert.match(chart, /controlOffset = deltaX \* 0\.38/);
    assert.match(chart, / C \$\{control1X\} \$\{previous\.y\}, \$\{control2X\} \$\{point\.y\}, \$\{point\.x\} \$\{point\.y\}/);
    assert.match(chart, /if \(trendSeries\.events\.length < 2\) return null/);
    assert.match(chart, /<path[\s\S]*d=\{buildSmoothPath\(coordinates\)\}/);
    assert.doesNotMatch(chart, /<polyline/);
});
test('baseline status does not suppress visual connectors and remains distinct from trend classification', () => {
    const chart = read('components/guardian/ParentLearningTrendChart.tsx');
    assert.match(chart, /trendState\.hasReliableTrend \? series\.map\(\(trendSeries\) => renderSeriesPath\(trendSeries, false\)\) : series\.map\(\(trendSeries\) => renderSeriesPath\(trendSeries, true\)\)/);
    assert.match(chart, /baseline \? ' is-baseline' : ''/);
    assert.match(chart, /style=\{baseline \? \{ opacity: 0\.78 \} : undefined\}/);
    assert.match(chart, /Building a baseline/);
});
test('smooth connectors preserve the existing scrub and pin evidence interaction', () => {
    const chart = read('components/guardian/ParentLearningTrendChart.tsx');
    assert.match(chart, /onPointerDown=\{handlePointerDown\}/);
    assert.match(chart, /onPointerMove=\{handlePointerMove\}/);
    assert.match(chart, /onPointerUp=\{handlePointerUp\}/);
    assert.match(chart, /setIsPinned\(true\)/);
    assert.match(chart, /parent-smart-trend-active-guide/);
    assert.match(chart, /parent-smart-trend-active-halo/);
});
