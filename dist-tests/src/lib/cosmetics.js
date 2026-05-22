export const FLICKER_THEME_VALUE = 'flicker';
export const LEGACY_GLITCH_THEME_VALUE = 'glitch';
export const GREEN_GLITCH_EFFECT_VALUE = 'glitch';
export const isNeonFrameActive = (value) => value === 'neon';
/**
 * The canonical theme value is `flicker`, but older rows may still contain
 * `glitch`. Treat both values as the flicker/theme cosmetic while reading.
 */
export const isFlickerThemeActive = (value) => (value === FLICKER_THEME_VALUE || value === LEGACY_GLITCH_THEME_VALUE);
/** Green glitch is a separate effect and must only read active_cosmetic_effect. */
export const isGreenGlitchEffectActive = (value) => (value === GREEN_GLITCH_EFFECT_VALUE);
export const resolveAvatarCosmeticFlags = (state) => ({
    hasNeonFrame: isNeonFrameActive(state.active_cosmetic_frame),
    hasFlickerTheme: isFlickerThemeActive(state.active_cosmetic_theme),
    hasGlitchEffect: isGreenGlitchEffectActive(state.active_cosmetic_effect),
});
export const normalizeActiveCosmeticTheme = (value) => (isFlickerThemeActive(value) ? FLICKER_THEME_VALUE : null);
