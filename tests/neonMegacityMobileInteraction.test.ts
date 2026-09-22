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
  assert.match(mapSource, /object-contain/);
  assert.match(mapSource, /aria-label="Neon Megacity V6 pure clan-color shader"/);
  assert.match(shaderSource, /export const RENDER_WIDTH = NEON_MEGACITY_WIDTH/);
  assert.match(shaderSource, /export const RENDER_HEIGHT = NEON_MEGACITY_HEIGHT/);
});

test('shader mask uses spaced IDs to survive browser texture color conversion', () => {
  assert.match(shaderSource, /export const ID_MASK_STEP = 24/);
  assert.match(shaderSource, /id \* ID_MASK_STEP/);
  assert.match(shaderSource, /texture\(uId,uv\)\.r\*255\.0\/24\.0/);
});

test('production shader keeps V6 ownership color and capture feedback clearly visible', () => {
  assert.match(shaderSource, /sharpenArt/);
  assert.match(shaderSource, /whiteLike\*0\.18/);
  assert.match(shaderSource, /networkStrength=clamp\(0\.38\+coverage\*0\.56/);
  assert.match(shaderSource, /ownershipStrength=max\(networkStrength,captured\)/);
  assert.match(shaderSource, /float age=uTime-uCaptureTime\[id\]/);
  assert.match(shaderSource, /age<1\.65/);
  assert.match(shaderSource, /aspectDistance/);
  assert.match(mapSource, /previousInfluenceSignatureRef/);
  assert.match(mapSource, /signature !== previousSignature/);
  assert.doesNotMatch(mapSource, /previousLeaderRef/);
});
