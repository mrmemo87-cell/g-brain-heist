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
  assert.match(mapSource, /const onPointerDown =/);
  assert.match(mapSource, /const onPointerUp =/);
  assert.match(mapSource, /Math\.hypot\(event\.clientX-start\.x,event\.clientY-start\.y\) > 20/);
  assert.match(mapSource, /pointerEvents:onZoneSelect\?"all":"none"/);
  assert.match(mapSource, /touchAction:onZoneSelect\?"manipulation":"auto"/);
  assert.match(mapSource, /fill="rgba\(255,255,255,0\.001\)"/);
  assert.match(mapSource, /stroke="rgba\(255,255,255,0\.001\)"/);
  assert.match(mapSource, /strokeWidth=\{10\}/);
  assert.doesNotMatch(mapSource, /isSelected \? "rgba\(250,204,21/);
});

test('production map keeps the artwork and V6 canvas aligned at native aspect ratio', () => {
  assert.match(mapSource, /aspectRatio: `\$\{NEON_MEGACITY_WIDTH\} \/ \$\{NEON_MEGACITY_HEIGHT\}`/);
  assert.match(mapSource, /object-fill/);
  assert.match(mapSource, /aria-label="Neon Megacity V6 shader layer"/);
  assert.match(shaderSource, /export const RENDER_WIDTH = NEON_MEGACITY_WIDTH/);
  assert.match(shaderSource, /export const RENDER_HEIGHT = NEON_MEGACITY_HEIGHT/);
});

test('production map does not paint whole territory polygons over the artwork', () => {
  assert.doesNotMatch(mapSource, /mixBlendMode: "color"/);
  assert.doesNotMatch(mapSource, /mixBlendMode: "screen"/);
  assert.doesNotMatch(mapSource, /id=\{`neon-zone-/);
  assert.doesNotMatch(mapSource, /occupationRatio/);
  assert.match(mapSource, /Enhanced V6 lighting unavailable — territory selection remains active/);
});

test('embedded student map keeps the city surface full-height instead of adding the selected-zone footer', () => {
  assert.match(mapSource, /const embeddedMode = hideHeader && hideLegend/);
  assert.match(mapSource, /!embeddedMode && selectedTerritory && selectedVisual/);
  assert.match(mapSource, /hidden min-w-\[92px\].*sm:block/);
});

test('shader mask uses spaced IDs to survive browser texture color conversion', () => {
  assert.match(shaderSource, /export const ID_MASK_STEP = 24/);
  assert.match(shaderSource, /id \* ID_MASK_STEP/);
  assert.match(shaderSource, /texture\(uId,uv\)\.r\*255\.0\/24\.0/);
});

test('production shader stays visually locked to the approved V6 lighting model', () => {
  assert.match(shaderSource, /chromaLight=smoothstep\(0\.10,0\.48,sat\)\*smoothstep\(0\.08,0\.54,lum\)/);
  assert.match(shaderSource, /brightLight=smoothstep\(0\.28,0\.82,lum\)\*smoothstep\(0\.04,0\.22,sat\)/);
  assert.match(shaderSource, /emissive=clamp\(chromaLight\*0\.90 \+ brightLight\*0\.42/);
  assert.match(shaderSource, /materialMask=.*\*0\.26/);
  assert.match(shaderSource, /hueReplace\(clanColor,clamp\(lum\*1\.16,0\.0,0\.96\)\)/);
  assert.match(shaderSource, /lightStrength=emissive\*mix\(0\.60,0\.96/);
  assert.match(shaderSource, /hueReplace\(clanColor,clamp\(lum\*0\.82,0\.0,0\.68\)\)/);
  assert.match(shaderSource, /seamKeep=1\.0-border\*0\.76/);
  assert.match(shaderSource, /emissive\*0\.42/);
  assert.match(shaderSource, /emissive\*0\.24/);
  assert.doesNotMatch(shaderSource, /sourceNeutral=/);
  assert.doesNotMatch(shaderSource, /relit\+=clanColor/);
});
