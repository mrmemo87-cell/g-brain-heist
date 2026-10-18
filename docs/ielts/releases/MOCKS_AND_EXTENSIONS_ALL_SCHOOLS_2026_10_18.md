# Mock tests M1-M3 and extension lessons X1-X8: teacher release to every school

**Release date:** 2026-10-18 (Asia/Bishkek).

**Bibles:** Diagnostic Bible 1.10.0, Lessons Bible 1.1.0, Visual & UX Bible 1.1.0.

## Authority

The owner reviewed the v0.1.0 review drafts in the Silk Road teacher library and wrote, on 2026-10-18 at 23:51
Asia/Bishkek: "approved, make the needed changes as these all materials are official now and ready, then publish to all
schools."

Each source records this in `approval_record`, with the exact pack SHA-256 that was reviewed. The packs are released as
**v1.0.0**:

- Content, answer keys, models, figures and recordings are unchanged.
- Only status, approval and release metadata changed. The draft labels became "Approved for teaching".

The recordings (M1-M3 Listening; X4-L1 and X4-C1) were inside the approved packs and are recorded as approved with them.
No in-platform review decision was entered on the owner's behalf.

## What was released

School-neutral templates are stored in the private `ielts-teacher-course-packs` bucket and registered in
`private.ielts_teacher_pack_templates`. The lesson codes were widened by migration `20261018150000`.

- Every school with the IELTS module receives them.
- Each teacher's download is branded in the browser with that school's own name and logo.
- The library shows them under the **Extension lessons** and **Mock tests** tabs.

| Code | Title | Template bytes | Template SHA-256 |
|---|---|---:|---|
| IELTS-M1 | Mock Test 1: full Academic IELTS test (paper-based) | 13086655 | `fe25d486419ea9d14654268bda24b5f4cffda6e5dc280cbb722032be298897a4` |
| IELTS-M2 | Mock Test 2: full Academic IELTS test (paper-based) | 12112398 | `1536ee60586ef8f43295e6151bc03db6a37d1dfbf5fdda39a7c8a78dc697958a` |
| IELTS-M3 | Mock Test 3: full Academic IELTS test (paper-based) | 13006295 | `4a798195ca9f6893253cf126edc69553562dd10be9139b45011f8e3a1bc45a8d` |
| IELTS-X1 | Reading: summary completion and sentence endings | 1233092 | `c13137e7dd3b376486cccfe6ca6942c657ec2f4412540cfeedea1c0872601f5e` |
| IELTS-X2 | Reading: matching features and short-answer questions | 1214061 | `7ff10bba6fbac9763890365b12cb8534c158147a3ab330ae31d0cbad6038aa9d` |
| IELTS-X3 | Reading: diagram labelling and flow-chart completion | 1526323 | `b6dcdd0a9f8c24ab7f546f527e12fc2129dcb8e9e0eabea57fbed1dfb2f15347` |
| IELTS-X4 | Listening: flow charts and 'choose TWO' questions | 6378301 | `a0c84059e9b957d0f1f079180566101b4e1a94be1a0bf0c856ce18ba9fcf9b8e` |
| IELTS-X5 | Academic Writing Task 1: describing a process | 2350951 | `0204b7bdf122a6c2c3c169ccc36eca6c2a5829af1f26f8d3f5f01615ad124042` |
| IELTS-X6 | Academic Writing Task 1: comparing maps | 1857328 | `7dec45dd33e33e49c9c62664c0af1ce0417f6e207e6bef649396f36f3532f373` |
| IELTS-X7 | Academic Writing Task 1: pie charts and mixed visuals | 2509707 | `6ef6562d0a2b4632359559ca717edd77ddef9deaa2c0173371237098cbc43145` |
| IELTS-X8 | Writing Task 2: problem-solution and two-part questions | 1206185 | `a9f7054ca2920084ea42ee565f764f3191d3af049cc8f6d3d4f2a08e48558ee0` |

**How the templates were built and uploaded:**

- Built with `--template` from the approved sources. The extension lessons passed `validate-lesson-pack.py` with zero
  errors.
- Uploaded through a one-time endpoint that accepted only these exact sizes and SHA-256 values, with a capability key.
- Each object was re-downloaded and its SHA-256 verified.
- The endpoint now requires a JWT and returns HTTP 410. The capability was destroyed; no capability or binary is
  committed.
- The Silk Road review drafts were unpublished after release.

## Verification

**Branding.** The production branding code (`services/ieltsPackBranding.ts`) was run on the real templates X1, X4, M1 and
M3:

- for Silk Road, with its logo;
- for Testopia, without a logo.

Results:

- No unbranded placeholders were left.
- PDF headers carry the school name and logo, and the footers read "Approved for teaching".
- The single-file downloads work: the presentation or control page, and the workbook or answer sheet.

**Access.** Checked as live database roles, inside a transaction that was rolled back:

| Account | Released packs | Mocks and extensions | Own school identity | Template objects readable |
|---|---:|---:|---|---|
| Silk Road programme lead | 35 | 11 | Yes | Yes |
| Testopia school administrator | 35 | 11 | Yes | Yes |
| Gulzada (pilot student) | not applicable | not applicable | not applicable | 0 |

## Scoring and assessment impact

The mocks report raw scores out of 40 for Listening and Reading, and criterion feedback for Writing and Speaking. There is
no band conversion (Diagnostic Bible 2.2-2.3, 16.6). Nothing feeds Journey, readiness, screeners or school reporting.

## Not verified

- Microsoft PowerPoint playback of animations and embedded audio.
- Physical printing.
- Projector legibility.
- Classroom audio (LB-08).
- A word-for-word check of recordings against transcripts. Known difference: M2 Part 4 says "the two thousands" where
  the transcript reads "2000s".
