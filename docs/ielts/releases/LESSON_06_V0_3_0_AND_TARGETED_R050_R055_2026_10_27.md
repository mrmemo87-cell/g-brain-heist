# Lesson 06 v0.3.0 and targeted reading R-050 to R-055: release to every school

**Release date:** 2026-10-27 (Asia/Bishkek). Supersedes the Lesson 06 v0.2.0 teacher release of 2026-10-18.

## Authority

The owner wrote on 2026-10-27 at 15:03 Asia/Bishkek, after reviewing PR #1725 and piloting the step-by-step practice
with a student: "make lesson 6 and its lessons approved and live to be used normally", and confirmed at 17:50:
"Please do it". The lesson source carries an `approval_record` for v0.3.0; the v0.2.0 approval stays in
`previous_approval_record`. No in-platform review decision was entered on the owner's behalf.

## Teacher pack

| Code | Version | Template bytes | Template SHA-256 |
|---|---|---:|---|
| IELTS-06 | 0.3.0 | 1291686 | `07f63b961f1907e35332c462bec2f258165367ef90adda3b77de56b260cf4c5d` |

Built with `--template`; `validate-lesson-pack.py` zero errors; branded with the production code (`services/ieltsPackBranding.ts`)
for a school without a logo: school name on every PDF, no placeholders outside the source manifest. Uploaded through a
one-time endpoint that accepted only this exact path, size and SHA-256; re-downloaded and verified; the endpoint is back
to a JWT-required HTTP 410 and the capability was destroyed and never committed. The row in
`private.ielts_teacher_pack_templates` was updated in place by migration `20261027115357` (together with Lessons 09 and 13).

## Student targeted practice

Migration `20261027115148` releases R-050 to R-055 (`bh-ielts-targeted-reading-r28-v2` to `r33-v2`) to all eligible
students, each pinned to the content hash the owner piloted. Released tasks count as approved for every school, so
teachers can assign them without a separate content confirmation. School, entitlement, source-evidence and
repeat-exposure checks remain.

## Not verified

Microsoft PowerPoint playback, physical printing and projector legibility (LB-08). Nothing feeds Journey, readiness or
band logic.
