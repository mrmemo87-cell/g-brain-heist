import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildGeometryQuestionSvg } from '../components/geometry/questionAssetExport.js';
import type { DiagramShape } from '../components/geometry/KonvaCanvasEditor.js';

const sampleShapes: DiagramShape[] = [
  {
    id: 'line-1',
    type: 'line',
    points: [100, 100, 300, 100, 260, 220, 60, 220, 100, 100],
    stroke: '#22d3ee',
    strokeWidth: 3,
  },
  {
    id: 'label-1',
    type: 'text',
    x: 120,
    y: 120,
    text: '2x + 10°',
    fontSize: 24,
    fill: '#f8fafc',
  },
];

test('geometry question SVG is tightly cropped with standard safe padding', () => {
  const result = buildGeometryQuestionSvg(sampleShapes, [], {
    paddingPreset: 'standard',
    background: 'transparent',
  });

  assert.equal(result.padding, 40);
  assert.ok(result.width < 400, `expected cropped width, received ${result.width}`);
  assert.ok(result.height < 300, `expected cropped height, received ${result.height}`);
  assert.match(result.svg, /viewBox="0 0 \d+ \d+"/);
  assert.doesNotMatch(result.svg, /<rect width="\d+" height="\d+" fill="#ffffff"\/>/);
  assert.match(result.svg, /2x \+ 10°/);
});

test('white export adds a background without changing the safe-border contract', () => {
  const result = buildGeometryQuestionSvg(sampleShapes, [], {
    paddingPreset: 'worksheet',
    background: 'white',
  });

  assert.equal(result.padding, 64);
  assert.match(result.svg, /<rect width="\d+" height="\d+" fill="#ffffff"\/>/);
});

test('geometry labels are XML escaped in generated SVG', () => {
  const result = buildGeometryQuestionSvg([
    {
      id: 'label-escape',
      type: 'text',
      x: 10,
      y: 10,
      text: 'x < 5 & y > 2',
      fontSize: 18,
    },
  ], [], {
    paddingPreset: 'tight',
    background: 'transparent',
  });

  assert.match(result.svg, /x &lt; 5 &amp; y &gt; 2/);
  assert.doesNotMatch(result.svg, /x < 5 & y > 2/);
});
