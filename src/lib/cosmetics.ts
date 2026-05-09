export type ActiveCosmeticFrame = 'neon' | null | undefined;
export type ActiveCosmeticTheme = 'flicker' | 'glitch' | null | undefined;
export type ActiveCosmeticEffect = 'glitch' | null | undefined;

export interface CosmeticStateLike {
  active_cosmetic_frame?: ActiveCosmeticFrame;
  active_cosmetic_theme?: ActiveCosmeticTheme;
  active_cosmetic_effect?: ActiveCosmeticEffect;
}

export interface AvatarCosmeticFlags {
  hasNeonFrame: boolean;
  hasFlickerTheme: boolean;
  hasGlitchEffect: boolean;
}

export const FLICKER_THEME_VALUE = 'flicker' as const;
export const LEGACY_GLITCH_THEME_VALUE = 'glitch' as const;
export const GREEN_GLITCH_EFFECT_VALUE = 'glitch' as const;

export const isNeonFrameActive = (value: ActiveCosmeticFrame): boolean => value === 'neon';

/**
 * The canonical theme value is `flicker`, but older rows may still contain
 * `glitch`. Treat both values as the flicker/theme cosmetic while reading.
 */
export const isFlickerThemeActive = (value: ActiveCosmeticTheme): boolean => (
  value === FLICKER_THEME_VALUE || value === LEGACY_GLITCH_THEME_VALUE
);

/** Green glitch is a separate effect and must only read active_cosmetic_effect. */
export const isGreenGlitchEffectActive = (value: ActiveCosmeticEffect): boolean => (
  value === GREEN_GLITCH_EFFECT_VALUE
);

export const resolveAvatarCosmeticFlags = (state: CosmeticStateLike): AvatarCosmeticFlags => ({
  hasNeonFrame: isNeonFrameActive(state.active_cosmetic_frame),
  hasFlickerTheme: isFlickerThemeActive(state.active_cosmetic_theme),
  hasGlitchEffect: isGreenGlitchEffectActive(state.active_cosmetic_effect),
});

export const normalizeActiveCosmeticTheme = (value: ActiveCosmeticTheme): 'flicker' | null => (
  isFlickerThemeActive(value) ? FLICKER_THEME_VALUE : null
);
