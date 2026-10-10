# IELTS design system — Themely Evidence Blue

**Design date:** 10 October 2026. **Status:** review branch; not deployed.

Theme generated in Themely, based on the existing Brains Heist IELTS Programme identity. All IELTS pages now share a semantic token source at `src/styles/ielts-design-system.css`. The school workspace, teacher assignment/review, student Journey, legacy IELTS, monthly reports, Prime dashboard and exam pages keep their own functional layouts and consume the same design primitives. Different contexts can remain visually distinctive.

## Token mapping
| Role | Token | Value | Origin |
|---|---|---|---|
| Canvas | `--bh-ielts-background` | #F5F7FC | Adapted from IELTS surfaces |
| Surface | `--bh-ielts-surface` | #FFFFFF | Existing |
| Muted surface | `--bh-ielts-surface-muted` | #F5F8FC | Existing |
| Ink | `--bh-ielts-foreground` | #15243A | Existing Programme |
| Muted ink | `--bh-ielts-foreground-muted` | #4C6076 | Existing Programme |
| Primary | `--bh-ielts-primary` | #1746B0 | Existing Programme |
| On-primary | `--bh-ielts-primary-foreground` | #FFFFFF | Existing |
| Secondary | `--bh-ielts-secondary` | #EEF3FA | Existing |
| On-secondary | `--bh-ielts-secondary-foreground` | #284B72 | Existing |
| Accent/focus | `--bh-ielts-accent` | #0E7490 | Adapted teal |
| Border | `--bh-ielts-border` | #DCE5EF | Existing Programme |

Themely typography: IBM Plex Sans with Inter/system fallbacks, 1rem base, 0.875rem small, 750 heading, line height 1.6, tracking −0.02em. Spacing 4/8/16/24/32/48px. Radii 10/13/24/999px. Three light shadow elevations.

Inferred semantic extensions: hover, input border, success, warning and danger. These tokens are presentation only; **do not** turn status colors into grade/band/readiness/improvement claims.

## Preserved constraints
- Canonical `docs/ielts/IELTS_DIAGNOSTIC_BIBLE.md`, permissions, RPCs, Supabase schema, eligibility, exposure/repeat gates, idempotent assignment and teacher review remain untouched.
- Independent-check exposure is not softened. Writing and Speaking still require valid reviewed evidence.
- Exam controls remain quiet and readable; Prime's unique hero illustration retains its own composition.
- No global Brains Heist game selectors or theme variables are changed.
- Legacy `ielts-theme` force-light CSS is retained until separate browser QA. Avoid universal button/div background resets.

## Acceptance before merge
Run `npm run typecheck`, `npm test`, `npm run build`, `git diff --check`. Inspect Programme Today, practice history, assign targeted practice, student Journey, monthly reports, Writing review, Speaking recorder, Prime, and exam-mode routes on 375px, 768px and desktop. Test keyboard focus and real WCAG component pairs, as well as zero/partial/submitted/completed/reviewed states. Confirm duplicate assignment, repeated practice, missing source, cross-role, cross-school and independent-check protections still behave identically. Visual browser and physical device QA is not yet claimed.
