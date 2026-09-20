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

test('Neon Megacity uses an SVG territory hit layer for reliable phone taps', () => {
  assert.match(mapSource, /data-territory-hit=\{territory\.zoneId\}/);
  assert.match(mapSource, /handleTerritoryPointerDown/);
  assert.match(mapSource, /handleTerritoryPointerUp/);
  assert.match(mapSource, /movement > 18/);
  assert.match(mapSource, /pointerEvents: onZoneSelect \? "all" : "none"/);
  assert.match(mapSource, /touchAction: onZoneSelect \? "pan-y" : "auto"/);
  assert.match(mapSource, /fill="rgba\(255,255,255,0\.001\)"/);
  assert.match(mapSource, /strokeWidth=\{isSelected \? 3 : 18\}/);
  assert.match(mapSource, /pointer-events-none relative z-\[1\]/);
});

test('mobile city artwork is not covered by permanent district tooltips', () => {
  assert.match(mapSource, /hidden -translate-x-1\/2 -translate-y-1\/2/);
  assert.match(mapSource, /sm:block/);
  assert.match(mapSource, /Tap a district/);
  assert.match(mapSource, /Enhanced lighting unavailable — territory colors and selection remain active/);
});

test('territory ownership stays visible even if WebGL enhancement fails', () => {
  assert.match(mapSource, /id=\{`neon-zone-\$\{territory\.zoneId\}`\}/);
  assert.match(mapSource, /mixBlendMode: "color"/);
  assert.match(mapSource, /mixBlendMode: "screen"/);
  assert.match(mapSource, /occupationRatio/);
  assert.match(mapSource, /opacity=\{0\.2 \+ occupationRatio \* 0\.25\}/);
});

test('shader mask uses spaced IDs to survive browser texture color conversion', () => {
  assert.match(shaderSource, /export const ID_MASK_STEP = 24/);
  assert.match(shaderSource, /id \* ID_MASK_STEP/);
  assert.match(shaderSource, /texture\(uId,uv\)\.r\*255\.0\/24\.0/);
});

test('shader still prioritizes readable clan hue over baked artwork color', () => {
  assert.match(shaderSource, /sourceNeutral=mix\(original\*0\.94,neutralLight/);
  assert.match(shaderSource, /lightStrength=emissive\*mix\(0\.78,1\.0/);
  assert.match(shaderSource, /materialMask=.*\*0\.38/);
  assert.match(shaderSource, /relit\+=clanColor\*\(0\.025\+emissive\*0\.075\)\*coverage/);
});
