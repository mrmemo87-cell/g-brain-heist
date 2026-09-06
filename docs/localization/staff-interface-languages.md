# Staff and family interface languages

Localization is now global rather than portal-specific. The existing persisted English / Arabic / Russian interface preference is applied by `LanguageProvider` through one shared `AppLocalizationLayer`, covering public login/home, onboarding, student UI, Teacher, School Admin, Admin/Superadmin, School Head, and Parent routes.

The global layer translates approved exact interface copy plus a small set of safe dynamic patterns. Unknown text remains unchanged. Cambridge and IELTS question/passage/test/exam surfaces remain English through explicit language-lock selectors and are forced to LTR inside an Arabic interface.

Legacy `withPortalLocalization(...)` wrappers remain only as compatibility shims, so older portal imports do not need risky large-file rewrites and no longer render their own language controls.

A single Brain Heist styled language control is shown consistently across routes and reuses the same `brains-heist:ui-language:v1` preference. New visible hard-coded product copy should be added to `src/i18n/interfaceTranslations.ts` or migrated to keyed `t(...)` messages.
