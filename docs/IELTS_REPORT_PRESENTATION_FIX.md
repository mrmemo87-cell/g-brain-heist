# IELTS learning report correction

Reports now lead with the confirmed learning focus, next action and priorities. Skill cards distinguish the earliest captured independent check from repeated practice. Supporting work and limitations are expandable and included when printing. Presentation removes database identifiers without modifying stored report fields.

The evidence projection includes trusted `auto_submitted` attempts alongside submitted attempts, excluding voided work. This restores original checks that were previously omitted. New snapshots use profile names where available and show legacy-record limitations only when relevant.

AI plan prompt version 2 keeps source references in structured arrays, avoids unsupported strength/readiness claims and respects reviewed writing and speaking evidence. Earlier cached AI drafts are retained but not reused by the new prompt. Teachers review and confirm every plan before sharing.

Shared report snapshots remain immutable. A teacher can prepare a corrected version using the existing reporting dates, confirm the revised plan, and generate and share a linked replacement. Students cannot author corrections. Existing reports retain the evidence originally captured; the corrected evidence projection applies to new reports.

Validation: TypeScript check, production build, database authorization/immutability and evidence tests, report DOM/printing tests, and AI handler/validator tests. Browser screenshot validation was unavailable because the browser binary download failed. Assessment scoring and IELTS policy were not changed.

## Concise school overview

The default view and print output now use a compact overview: current evidence picture, four-skill table, up to three agreed priorities, progress status and next review. The full learning record is a separate view. Overview printing does not expand or append detailed feedback. An A4 page is the expected layout for concise plans; unusually long teacher actions may flow to another page rather than being clipped or silently rewritten.

School branding comes from the scoped report read for older reports and is captured as a logo URL in new snapshots. Failed or missing school images use a school monogram; the product logo is not substituted for a school logo. The Brains Heist credit appears in the footer. Account attribution remains available in the detailed record.

A narrow evidence consistency check rejects requests for an already reviewed Writing/Speaking assessment unless explicitly described as a fresh follow-up. It runs in AI validation, plan saves, report generation and draft finalization. Prompt cache version 3 discards stale cache matches without deleting their history. This catches the reported contradiction, not every possible natural-language error; teacher review remains necessary. Older approved wording is preserved and flagged in the detailed record. The overview uses captured evidence and consistent agreed priorities; no new academic judgment is generated.

Bible 1.7.0 retained. No scoring, bands, pathways, attempt status or evidence history changed. Scoped lazy report reads remain; this change establishes no new concurrency capacity. Validation includes database authorization/immutability and semantic checks, DOM sharing/print checks, AI validation/handler checks, TypeScript and build. Browser rendering with the actual SRIS logo and Gulzada-equivalent approved fields passed at desktop and 390px mobile width, with no horizontal overflow or browser script errors. The rendered PDF was inspected and confirmed as one A4 page. This was a component layout check, not an authenticated end-to-end student session.
