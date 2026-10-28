# 0654 Physics curriculum objectives — release record

Published to production on 2026-10-28 by owner authorisation (content data
release, not a schema migration).

- Framework: `bh-cie-igcse-0654-physics` ("Brains Heist IGCSE 0654 Physics
  Objectives"), authority type `brain_heist_original`, global.
- Version: `2025-2027-v1`, precision policy `specific-v1`, status published.
- Source: Cambridge IGCSE Co-ordinated Sciences 0654 syllabus 2025–2027,
  version 1 — https://www.cambridgeinternational.org/Images/664572-2025-2027-syllabus.pdf.
  Wording is Brains Heist's own; not Cambridge material.
- Scope: Physics grades 9, 10 and 11; six strands (P1–P6); 53 objectives per
  grade, one per syllabus sub-topic, including P4.5.5 (d.c. motor) and
  P4.5.6 (transformer). 159 objectives in total, all assessable, each with an
  assessment boundary stating that multiple-choice evidence does not establish
  extended written explanation or practical performance.
- Mappings: batch "IGCSE 0654 Physics question mapping v1", rule-based from each
  question's verified syllabus profile reference; all 62 `bh-physics-0654-2025-2027-*`
  questions mapped as primary in every eligible grade scope (186 approved
  mappings).
- School scope: the one active grade 9 Physics offering was moved from
  `brain-heist-international@2026-6` (no physics objectives) to this framework;
  the previous mapping is archived, not deleted.

## Placement decisions

- P6: checked against the official syllabus text. Light-years, light travel
  time and orbital speed sit under **P6.2.1 The Sun as a star** in 0654 (unlike
  0625). An AI-generated check that placed them under P6.1 was wrong and was
  not used.
- P5 objectives are written at sub-topic level; the exact point stays on each
  question's assessment profile.
- Sub-topics with two-level numbers (for example P1.2, P6.1) map to objective
  codes such as `p1-2`; three-level sub-topics (for example P2.1.2) map to
  `p2-1-2`. Packages should carry an explicit objective code rather than rely
  on parsing the syllabus reference.
