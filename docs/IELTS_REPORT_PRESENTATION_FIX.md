# IELTS learning report correction

Reports now lead with the confirmed learning focus, next action and priorities. Skill cards distinguish the earliest captured independent check from repeated practice. Supporting work and limitations are expandable and included when printing. Presentation removes database identifiers without modifying stored report fields.

The evidence projection includes trusted `auto_submitted` attempts alongside submitted attempts, excluding voided work. This restores original checks that were previously omitted. New snapshots use profile names where available and show legacy-record limitations only when relevant.

AI plan prompt version 2 keeps source references in structured arrays, avoids unsupported strength/readiness claims and respects reviewed writing and speaking evidence. Earlier cached AI drafts are retained but not reused by the new prompt. Teachers review and confirm every plan before sharing.

Shared report snapshots remain immutable. A teacher can prepare a corrected version using the existing reporting dates, confirm the revised plan, and generate and share a linked replacement. Students cannot author corrections. Existing reports retain the evidence originally captured; the corrected evidence projection applies to new reports.

Validation: TypeScript check, production build, database authorization/immutability and evidence tests, report DOM/printing tests, and AI handler/validator tests. Browser screenshot validation was unavailable because the browser binary download failed. Assessment scoring and IELTS policy were not changed.
