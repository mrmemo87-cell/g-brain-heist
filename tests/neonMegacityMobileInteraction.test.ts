import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const mapSource = readFileSync(
  'src/features/clanTerritory/components/NeonMegacityShaderMap.tsx',
  'utf8',
);
const shaderSource = readFileSync(
  'src/features/clanTerritory/components/neonMegacityShader.ts',
  'utf8',
);

test('Neon Megacity uses pointer-up tap selection for touch reliability', () => {
  assert.match(mapSource, /onPointerDown=\{handlePointerDown\}/);
  assert.match(mapSource, /onPointerUp=\{handlePointerUp\}/);
  assert.match(mapSource, /onPointerCancel=\{handlePointerCancel\}/);
  assert.match(mapSource, /movement > 14/);
  assert.match(mapSource, /touchAction: onZoneSelect \? "pan-y" : "auto"/);
  assert.doesNotMatch(mapSource, /onClick=\{\(event\) => handlePointer/);
});

test('mobile city artwork is not covered by permanent district tooltips', () => {
  assert.match(mapSource, /hidden -translate-x-1\/2 -translate-y-1\/2/);
  assert.match(mapSource, /sm:block/);
  assert.match(mapSource, /Tap a district/);
  assert.match(mapSource, /pointer-events-none absolute inset-0/);
});

test('shader prioritizes readable clan hue over baked artwork color', () => {
  assert.match(shaderSource, /sourceNeutral=mix\(original\*0\.94,neutralLight/);
  assert.match(shaderSource, /lightStrength=emissive\*mix\(0\.78,1\.0/);
  assert.match(shaderSource, /materialMask=.*\*0\.38/);
  assert.match(shaderSource, /relit\+=clanColor\*\(0\.025\+emissive\*0\.075\)\*coverage/);
});
