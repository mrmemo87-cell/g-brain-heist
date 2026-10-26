# Extension lessons X1-X8 revised versions: teacher release to every school

**Release date:** 2026-10-26 (Asia/Bishkek). Supersedes the v1.0.0 extension release of 2026-10-18.

## Authority

After a review of PR #1711 and the follow-up rendering fixes, the owner wrote on 2026-10-26 at 06:18 Asia/Bishkek:
"I need them approved for teaching and normally ready to use in the IELTS course."

Each source carries an `approval_record` for its exact version (X1-X4 v1.1.1, X5-X8 v1.1.0). The v1.0.0 approval stays
in `previous_approval_record` as history. No in-platform review decision was entered on the owner's behalf, and no
school-scoped review-draft pack was opened before approval.

## What changed from v1.0.0

- Revised content and keys as described in PR #1711 (connected X1 summary, X2 matching keys, X3 branched flow chart,
  X4 safeguards and numeric-only Q7, X5-X8 stronger independent transfer tasks).
- Pack rendering: one-line footer ("Approved for teaching"), flow charts kept on one page, choose-TWO questions numbered
  once.
- **New recording IELTS-X4-C1 v2** for the revised script (the v1.0.0 C1 recording no longer matches and is not shipped).
  Produced 2026-10-26 with Runway (eleven_v4): instructions Tom, archivist Miriam; copyright notice and end cue reused
  unchanged from v1. 326.1 s, -18.5 LUFS, true peak -1.7 dBFS, designed silences 30.0 s and 15.0 s.
  SHA-256 `e400f3d6fdfb87bab4822973d35dc382cf3f5a6aa75173695d74514421caa1b5`. Details in
  `lesson-x4/AUDIO_PRODUCTION_v1.json`. IELTS-X4-L1 v1 is unchanged (SHA-256 verified against the v1.0.0 template).
- The pack builder takes an optional `file_version` per recording; the pack validator checks summary and flow-chart text
  in the withheld fresh check.

## What was released

Templates built with `--template`; all eight passed `validate-lesson-pack.py` with zero errors. Uploaded to the private
`ielts-teacher-course-packs` bucket through a one-time endpoint that accepted only `templates/IELTS-X*/1.1.x/<sha>.zip`
whose body matched the SHA-256 in its name. Each object was re-downloaded and its SHA-256 verified. The endpoint is back
to HTTP 410 with JWT required; the capability was destroyed and never committed. The rows in
`private.ielts_teacher_pack_templates` were updated in place (one row per lesson code).

| Code | Version | Template bytes | Template SHA-256 |
|---|---|---:|---|
| IELTS-X1 | 1.1.1 | 1240013 | `e3a1e798f1e69f955ea1ab4f7c8aeaf7cb365ea1326e9355c75379e72e12c995` |
| IELTS-X2 | 1.1.1 | 1218381 | `b35a62fc5bb0e9f86453a7b3c35237a88e40b0419f23b76b48f3d23836c0de04` |
| IELTS-X3 | 1.1.1 | 1534935 | `b3dc0beacddaff151617920a5421dae4db2c691b54c896e413163f346bf91326` |
| IELTS-X4 | 1.1.1 | 8668422 | `f4d7c61ec41bb0ec64512555f1e6fcf4805c405fb39871430b10d09375c1c1f2` |
| IELTS-X5 | 1.1.0 | 2352546 | `ad70402db222696cc2573844df29ac3cab1945611aa8529a7e810dfb67bf3ff9` |
| IELTS-X6 | 1.1.0 | 1858897 | `0bcc7ba7c4126ef000b1fbc20b5d607efe4991251985a5d0005bdd50bf868af2` |
| IELTS-X7 | 1.1.0 | 2514060 | `22a60c30e293a199bc9de96a178a0294328e9d0cb4471e34f95dc53ba2216e1b` |
| IELTS-X8 | 1.1.0 | 1207840 | `04d19daa21bb262979ebf6ba86e85392de9dc6bec7a324987c7c9c5916941c68` |

## Verification

- **Branding.** The production branding code (`services/ieltsPackBranding.ts`) branded every template for a school with
  a logo and one without. Packs contain the expected PDFs and both decks; X4 contains `IELTS-X4-C1_v2.mp3` and
  `IELTS-X4-L1_v1.mp3`. PDF headers carry the school name; footers read "Approved for teaching". The only remaining
  `{{BH_` text is in `SOURCE-TEMPLATE-MANIFEST.json`, exactly as in the approved v1.0.0 templates.
- **Access** (live database roles, transaction rolled back): the Silk Road and Testopia school administrators each see
  X1-X8 at the new versions with their own school identity and can read all 8 new objects; a Silk Road student reads 0.
- **Tests.** Lesson and mock source contracts pass (79/79), including the transcript hash of the new C1 recording.

## Not verified

- Word-for-word listening check of IELTS-X4-C1 v2 against the script (no speech recognition was available; the script
  text was sent verbatim to the speech model).
- Microsoft PowerPoint playback, physical printing, projector legibility and classroom audio (LB-08).
- Student task publication remains a separate, governed step; nothing feeds Journey, readiness or band logic.
