import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const mapSource = readFileSync(
  'src/features/clanTerritory/components/NeonMegacityShaderMap.tsx',
  'utf8',
);
const studentSource = readFileSync(
  'src/features/clanTerritory/components/ClanTerritoryStudentView.tsx',
  'utf8',
);
const experienceSource = readFileSync(
  'src/features/clanTerritory/components/NeonMegacityV6StudentExperience.tsx',
  'utf8',
);
const shaderSource = readFileSync(
  'src/features/clanTerritory/components/neonMegacityShader.ts',
  'utf8',
);

test('V6 map uses the artwork itself as the direct district interaction surface', () => {
  assert.match(mapSource, /data-v6-map-viewport/);
  assert.match(mapSource, /territoryAtPoint/);
  assert.match(mapSource, /const handlePointerDown =/);
  assert.match(mapSource, /const handlePointerMove =/);
  assert.match(mapSource, /const handlePointerUp =/);
  assert.match(mapSource, /Math\.hypot\(event\.clientX - start\.x, event\.clientY - start\.y\) > 20/);
  assert.match(mapSource, /onZoneSelect\(territory\.zoneId\)/);
  assert.doesNotMatch(mapSource, /data-v6-immersive-map/);
  assert.doesNotMatch(mapSource, /immersiveOpen/);
  assert.doesNotMatch(mapSource, /Deploy to district/);
  assert.doesNotMatch(mapSource, /Stay in district/);
  assert.doesNotMatch(mapSource, /Tactical Map/);
  assert.doesNotMatch(mapSource, /<polygon/);
});

test('City ACTIVE flow bypasses legacy card-picker and split combat screens', () => {
  assert.match(studentSource, /NeonMegacityV6StudentExperience/);
  assert.match(
    studentSource,
    /gameState\.phase === "ACTIVE" && \(gameState\.mapId \|\| "default"\) === "city" && !hasStickyDebrief/,
  );
  assert.match(studentSource, /selectedZoneId=\{effectiveZoneId\}/);
  assert.match(studentSource, /currentQuestion=\{currentQuestion\}/);
  assert.match(studentSource, /shuffledAnswers=\{shuffledAnswers\}/);
  assert.match(studentSource, /onAnswer=\{handleAnswerClick\}/);
  assert.match(studentSource, /applyLocalZoneOverride\(zoneId\)/);
  assert.match(studentSource, /onSelectZone\(zoneId\)/);
});

test('student experience keeps the persistent V6 Shader Lab surface and side rail', () => {
  assert.match(experienceSource, /data-v6-student-experience/);
  assert.match(experienceSource, /BRAIN HEIST · NEON MEGACITY · SHADER LAB · V6/);
  assert.match(
    experienceSource,
    /True clan hue replacement · source artwork provides brightness\/texture, not faction color/,
  );
  assert.match(experienceSource, />SELECTED TERRITORY</);
  assert.match(experienceSource, />BATTLE QUESTION</);
  assert.match(experienceSource, />WHAT YOU SHOULD NOTICE</);
  assert.match(experienceSource, />LIVE OCCUPATION</);
  assert.match(experienceSource, />BATTLE FEED</);
  assert.match(experienceSource, /Click any district\. On-map badges show occupation for every active district\./);
  assert.match(experienceSource, /onZoneSelect=\{onSelectZone\}/);
  assert.doesNotMatch(experienceSource, /Deploy to district/);
  assert.doesNotMatch(experienceSource, /Stay in district/);
  assert.doesNotMatch(experienceSource, /Tactical Map/);
});

test('V6 map keeps district occupation badges and native artwork geometry', () => {
  assert.match(mapSource, /data-v6-territory-badge=\{territory\.zoneId\}/);
  assert.match(mapSource, /aspectRatio: `\$\{NEON_MEGACITY_WIDTH\} \/ \$\{NEON_MEGACITY_HEIGHT\}`/);
  assert.match(mapSource, /object-fill/);
  assert.match(mapSource, /aria-label="Neon Megacity V6 pure clan-color shader"/);
  assert.match(shaderSource, /export const RENDER_WIDTH = NEON_MEGACITY_WIDTH/);
  assert.match(shaderSource, /export const RENDER_HEIGHT = NEON_MEGACITY_HEIGHT/);
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
