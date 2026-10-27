# Lessons 09 and 13 v0.3.0: teacher release to every school

**Release date:** 2026-10-27 (Asia/Bishkek). Supersedes the v0.2.0 releases of 2026-10-18.

## Authority

After the v0.3.0 review copy with answer keys, an external content and level review, and the revisions made in
response (PR #1732), the owner wrote on 2026-10-27 at 17:50 Asia/Bishkek: "Approve". Each source carries an
`approval_record` for v0.3.0; the v0.2.0 approval stays in `previous_approval_record`. No in-platform review decision
was entered on the owner's behalf.

Lessons 10 and 14 v0.3.0 were approved at the same time, but their scripts changed, so their new recordings must be
produced and approved before their templates are released (recorded as release blockers). Their v0.2.0 templates stay
in use until then.

## What was released

| Code | Version | Template bytes | Template SHA-256 |
|---|---|---:|---|
| IELTS-09 | 0.3.0 | 1242251 | `0b4dcbc414192a1f40c48813eff8dd2a379b066e84c203e6206c3c1dca66ee58` |
| IELTS-13 | 0.3.0 | 1229348 | `236c7321a2e85505cad673b442712a83c3389b3e22796dd302998ba2209d9be9` |

Built with `--template`; `validate-lesson-pack.py` zero errors; branded with the production code for a school without
a logo (no placeholders outside the source manifest). Uploaded through a one-time endpoint that accepted only these exact
paths, sizes and SHA-256 values; re-downloaded and verified; the endpoint is back to a JWT-required HTTP 410 and the
capability was destroyed and never committed. Rows in `private.ielts_teacher_pack_templates` were updated in place by
migration `20261027115357`, which also released Lesson 06 v0.3.0 (see the Lesson 06 release record).

## Not verified

Microsoft PowerPoint playback, physical printing and projector legibility (LB-08). The reading timings are practice
allocations, not test section limits; no lesson score is converted to a band.
