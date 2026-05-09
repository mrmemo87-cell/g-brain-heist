import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isFlickerThemeActive,
  normalizeActiveCosmeticTheme,
  resolveAvatarCosmeticFlags,
} from '../src/lib/cosmetics.js';

test('cosmetic flag resolution supports individual and combined avatar effects', () => {
  const cases = [
    {
      name: 'neon only',
      state: { active_cosmetic_frame: 'neon' as const },
      expected: { hasNeonFrame: true, hasFlickerTheme: false, hasGlitchEffect: false },
    },
    {
      name: 'flicker only',
      state: { active_cosmetic_theme: 'flicker' as const },
      expected: { hasNeonFrame: false, hasFlickerTheme: true, hasGlitchEffect: false },
    },
    {
      name: 'legacy glitch theme value',
      state: { active_cosmetic_theme: 'glitch' as const },
      expected: { hasNeonFrame: false, hasFlickerTheme: true, hasGlitchEffect: false },
    },
    {
      name: 'green glitch only',
      state: { active_cosmetic_effect: 'glitch' as const },
      expected: { hasNeonFrame: false, hasFlickerTheme: false, hasGlitchEffect: true },
    },
    {
      name: 'neon + flicker',
      state: { active_cosmetic_frame: 'neon' as const, active_cosmetic_theme: 'flicker' as const },
      expected: { hasNeonFrame: true, hasFlickerTheme: true, hasGlitchEffect: false },
    },
    {
      name: 'neon + green glitch',
      state: { active_cosmetic_frame: 'neon' as const, active_cosmetic_effect: 'glitch' as const },
      expected: { hasNeonFrame: true, hasFlickerTheme: false, hasGlitchEffect: true },
    },
    {
      name: 'flicker + green glitch',
      state: { active_cosmetic_theme: 'flicker' as const, active_cosmetic_effect: 'glitch' as const },
      expected: { hasNeonFrame: false, hasFlickerTheme: true, hasGlitchEffect: true },
    },
    {
      name: 'all three cosmetics',
      state: {
        active_cosmetic_frame: 'neon' as const,
        active_cosmetic_theme: 'flicker' as const,
        active_cosmetic_effect: 'glitch' as const,
      },
      expected: { hasNeonFrame: true, hasFlickerTheme: true, hasGlitchEffect: true },
    },
  ];

  for (const fixture of cases) {
    assert.deepEqual(resolveAvatarCosmeticFlags(fixture.state), fixture.expected, fixture.name);
  }
});

test('flicker is canonical while legacy glitch theme values remain readable', () => {
  assert.equal(isFlickerThemeActive('flicker'), true);
  assert.equal(isFlickerThemeActive('glitch'), true);
  assert.equal(isFlickerThemeActive(null), false);
  assert.equal(normalizeActiveCosmeticTheme('flicker'), 'flicker');
  assert.equal(normalizeActiveCosmeticTheme('glitch'), 'flicker');
  assert.equal(normalizeActiveCosmeticTheme(null), null);
});
