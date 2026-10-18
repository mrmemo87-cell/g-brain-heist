# Lessons 05–24: teacher release to every eligible school

Release date 2026-10-18 (Asia/Bishkek). Diagnostic Bible 1.10.0; Lessons Bible 1.1.0 (LB-01/02/04/05/06/08/09/11); Visual & UX Bible 1.1.0.

## Authority

The owner reviewed the v0.2.0 private review packs in the Silk Road teacher library and wrote "approved" in the review conversation on 2026-10-18 at 12:03 Asia/Bishkek, asking for publication to all schools. Each lesson source records this in `approval_record` (version 0.2.0). No in-platform review decision was entered on the owner's behalf. Recordings in Lessons 10, 14, 17 and 21 were inside the approved packs and are recorded as approved with them.

## What was released

Shared school-neutral templates in the private `ielts-teacher-course-packs` bucket, registered in `private.ielts_teacher_pack_templates` (migration `20261018090000`, lesson codes IELTS-01..24). Every school with the IELTS module receives each lesson; the teacher's download is branded in the browser with that school's own name and logo (PDF headers, HTML presentation and start guide, both PowerPoint decks). Schools without a logo get their name only. At release, two schools hold the IELTS module (Silk Road International School and Testopia); other schools receive the lessons automatically if the module is enabled.

| Code | Title | Template bytes | Template SHA-256 |
|---|---|---:|---|
| IELTS-05 | Listening distractors and paraphrases | 16105721 | `cd91d566961b623131965fee47b8d3516c940f38a16dcdd869af2b456938cb49` |
| IELTS-06 | Reading for specific information | 1232852 | `ed10921067780dbfa916ea60b64039e7d220b885be2e14834105c4e9a474ccdb` |
| IELTS-07 | Writing Task 2: positions and developed arguments | 1220698 | `622feb80e0b023a176c4f4199fa9af01bf5d156806b344a5af0b7101f435ce54` |
| IELTS-08 | Speaking development and first progress review | 1184391 | `a1c4592b5410bd2a6e9d2b7750ec5c85b6b365cf440b44ea430cbf51bf3a8eec` |
| IELTS-09 | Reading headings, paragraph purpose and the writer's argument | 1191172 | `dfa251fe755c0bc6fc05d71a4f0f491c509c80d8487dc090195444522baf9e6e` |
| IELTS-10 | Listening Part 4: lecture notes and summaries | 15905816 | `f4b179f1434ec41dffaf6318f7e55e4963cfedcf57affe5300cda6cb9ccac2f1` |
| IELTS-11 | Academic Writing Task 1: overviews and accurate comparisons | 2230054 | `4df5ca2c0626029e8e9e71f7f7dc5bebfebe4ddf15ddc9108675abb5f51922a4` |
| IELTS-12 | Speaking Part 2: planning and sustaining a long turn | 1188450 | `9c16f6b4c39f39fd428b67da180d6361b3ab2d604cca55bda711bb3e7311bbdd` |
| IELTS-13 | Advanced TRUE/FALSE/NOT GIVEN and YES/NO/NOT GIVEN | 1205398 | `10170a84b5e02b06a21df8a34468c67863a60899703b069d6c9eb45f1a005b62` |
| IELTS-14 | Listening Part 3: longer discussions, delayed answers and matching | 11753901 | `b63f02b364b95a6deec9b4baea1db890feb6101b979ff641efd997b55420210f` |
| IELTS-15 | Writing Task 2: planning and writing a complete response under time | 1197771 | `25f6806eb89f272779e132e203d4e1564f51613e8a05014b6a31101ffa19cae9` |
| IELTS-16 | Speaking Part 3: abstract discussion and second progress review | 1176316 | `7a9c036dbb652d0b86956c71430626f9d0d499f4b6e96b1e00626a8f52128d03` |
| IELTS-17 | Timed Listening: a full Part 2 section, map labelling and error analysis | 11951822 | `6d2843ec3886f63f4c2b0f8b712e4644c703e5a54fe575d988fe4255a518bace` |
| IELTS-18 | Timed Academic Reading: one passage in twenty minutes | 1201674 | `7bf5caaa69db0d0566de5cba3576a9ea9dfe49be455f6cdaec4c179e7cd5cfdc` |
| IELTS-19 | Writing revision clinic: Task 1 tables and accuracy | 1668287 | `e4f793c4178a609f65baae285084f89bbd4b16fd41f09fbd60e847a95ea1e4f8` |
| IELTS-20 | Speaking: a complete three-part interview and targeted repair | 1189252 | `5210261f90f15ccc43f75e91c6fccef9f19d15ae9270bfd78d8450b4c6359ade` |
| IELTS-21 | Fresh receptive-skill check: one Listening section and one Reading passage | 7220055 | `849e929fe14720e474de582732c279c67acba1ad32816b3f5362657867428526` |
| IELTS-22 | Fresh productive-skill evidence: a timed essay and a new long turn | 1334237 | `1eb39bbe6d1a9ad3cb4ec7b46e599603f137cf2d936259ff12e9c89c0787a7d3` |
| IELTS-23 | Individual priorities from check evidence: targeted stations | 1237255 | `92c7eab3b6e82a217a3e2fba1c7db78e3ef815996e33c2579830b9e1b75112e5` |
| IELTS-24 | Final course review and next learning plan | 1187412 | `65ea690b46414243e7c845d352a858b231c86df4b1bb8d6878817ea6fdb6ff1d` |

Templates were built with `scripts/ielts/build-lesson-pack.py --template` from the approved sources and validated with `validate-lesson-pack.py` (20/20, zero errors). Each was uploaded through a one-time, capability-protected endpoint limited to these exact paths, sizes and hashes, re-downloaded and SHA-256 verified, and the endpoint was then replaced with a JWT-required HTTP 410 handler. No capability or binary is committed. The Silk Road review drafts were unpublished after release.

## Verification

- Branding run end to end with the production branding code on real templates: Lesson 17 for Silk Road and Lesson 05 for Testopia. Every PDF page carries the school name, presentations and decks carry the school name and logo, recordings unchanged.
- Hosted authorization checks with existing identities (no roles or student data changed): Silk Road programme lead and Testopia school admin each see 22 released lessons (03–24) with their own school identity; the Silk Road lead is refused for Testopia; Gulzada (student) is refused and sees no objects.
- CI on PR #1657: guard, typecheck, build and full tests passed.

## Not verified

Microsoft PowerPoint playback of animations and embedded audio, physical printing, projector legibility and classroom audio. Lessons 01–04 in the new format are pending: their approved content and recordings are in private storage and are being supplied by the owner.
