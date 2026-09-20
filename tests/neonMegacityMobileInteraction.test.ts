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

test('Neon Megacity uses an invisible SVG territory hit layer for reliable phone taps', () => {
  assert.match(mapSource, /data-territory-hit=\{territory\.zoneId\}/);
  assert.match(mapSource, /handleTerritoryPointerDown/);
  assert.match(mapSource, /handleTerritoryPointerUp/);
  assert.match(mapSource, /movement > 18/);
  assert.match(mapSource, /pointerEvents: onZoneSelect \? "all" : "none"/);
  assert.match(mapSource, /touchAction: onZoneSelect \? "pan-y" : "auto"/);
  assert.match(mapSource, /fill="rgba\(255,255,255,0\.001\)"/);
  assert.match(mapSource, /stroke="rgba\(255,255,255,0\.001\)"/);
  assert.match(mapSource, /strokeWidth=\{18\}/);
  assert.doesNotMatch(mapSource, /isSelected \? "rgba\(250,204,21/);
});

test('production map does not paint whole territory polygons over the artwork', () => {
  assert.doesNotMatch(mapSource, /mixBlendMode: "color"/);
  assert.doesNotMatch(mapSource, /mixBlendMode: "screen"/);
  assert.doesNotMatch(mapSource, /id=\{`neon-zone-/);
  assert.doesNotMatch(mapSource, /occupationRatio/);
  assert.match(mapSource, /Enhanced lighting unavailable — territory selection remains active/);
});

test('mobile city artwork is not covered by permanent district tooltips', () => {
  assert.match(mapSource, /hidden -translate-x-1\/2 -translate-y-1\/2/);
  assert.match(mapSource, /sm:block/);
  assert.match(mapSource, /Tap a district/);
});

test('shader mask uses spaced IDs to survive browser texture color conversion', () => {
  assert.match(shaderSource, /export const ID_MASK_STEP = 24/);
  assert.match(shaderSource, /id \* ID_MASK_STEP/);
  assert.match(shaderSource, /texture\(uId,uv\)\.r\*255\.0\/24\.0/);
});

test('production shader stays visually locked to the approved V6 lighting model', () => {
  assert.match(shaderSource, /chromaLight=smoothstep\(0\.10,0\.48,sat\)\*smoothstep\(0\.08,0\.54,lum\)/);
  assert.match(shaderSource, /brightLight=smoothstep\(0\.28,0\.82,lum\)\*smoothstep\(0\.04,0\.22,sat\)/);
  assert.match(shaderSource, /emissive=clamp\(chromaLight\*0\.90\+brightLight\*0\.42/);
  assert.match(shaderSource, /0\.26;/);
  assert.match(shaderSource, /hueReplace\(clanColor,clamp\(lum\*1\.16,0\.0,0\.96\)\)/);
  assert.match(shaderSource, /lightStrength=emissive\*mix\(0\.60,0\.96/);
  assert.match(shaderSource, /hueReplace\(clanColor,clamp\(lum\*0\.82,0\.0,0\.68\)\)/);
  assert.match(shaderSource, /seamKeep=1\.0-border\*0\.76/);
  assert.match(shaderSource, /emissive\*0\.42/);
  assert.match(shaderSource, /emissive\*0\.24/);
  assert.doesNotMatch(shaderSource, /sourceNeutral=/);
  assert.doesNotMatch(shaderSource, /relit\+=clanColor/);
});
