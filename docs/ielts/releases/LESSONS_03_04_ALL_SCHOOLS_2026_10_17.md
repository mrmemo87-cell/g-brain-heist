# Lessons 03–04: all-school teacher release with school branding

The owner explicitly requested publication to every school with its own branding on 2026-10-17. This supersedes the SRIS-only availability scope in PR #1646. It does not change the approved content revision 2026-10-17.1, recording bytes, lesson titles, student evidence or scoring. Existing IELTS module and programme-management permissions remain authoritative; this release does not enable paid modules or publish teacher keys to students.

## Delivery

A private shared catalogue replaces per-school copies for these two approved lessons. Every currently or subsequently eligible school gets both entries automatically. The scoped server RPC returns the authorized school's actual name/logo. The client verifies the immutable source ZIP, applies that school identity across HTML, PDF and both editable/motion-free PPTX files, embeds an offline logo, and binds the resulting files in a school-specific SHA-256 manifest.

The authoring-school identity and logo are removed from source templates. PDF redaction removes the original branding rather than painting another school's name over retained text. PDF pages, body text and print pagination remain unchanged. Logo conversion preserves aspect ratio and supplies PNG for native PDF/PPTX support, including uploaded JPEG/WebP sources. Schools without a logo use their own name and a transparent image slot; the library explains how to add a logo. A configured logo that fails to load blocks the download with a retry message instead of exporting another school's mark.

Template installation:

| Lesson | Content version | Branding template | Bytes | Template SHA-256 |
|---|---|---|---:|---|
| IELTS-03 | 1.0.1 | 1.0.0 | 3903822 | 875f6fe236f5b6db2dfe024757b1d37c229afe13efd80fd6b1d1002698858967 |
| IELTS-04 | 1.0.1 | 1.0.0 | 1154479 | ba40e529716d1f0e9a9e70e1d3f75e07252fb7f398245fa7e5fc3821133deeb0 |

Both derive from the retained owner archive SHA-256 `66feb1c16b2ec3d2994d624aa9a17e4a53c91d59feb4d42645e6d32ef30c0775`, approved text SHA-256 `3e2f36e5713d8cb7851e4eb4868413b05f013e79189f28aa65aabd0217dc5cd2`. No audio regeneration or new question identity is involved. Templates include licensed DejaVu fonts for PDF school names and the associated license.

## Authorization and rollout

`private.ielts_teacher_pack_templates` has RLS and no direct client grants. `rpc_ielts_teacher_pack_catalogue` explicitly rejects anonymous, missing/banned users and unauthorized school contexts, then returns only the selected authorized school's branding. `can_read_ielts_teacher_pack` extends the existing restrictive private-Storage policy to released shared templates for current authorized programme managers. Old scoped packs/RPC remain intact for cached clients. Students, anonymous clients and client writes remain blocked.

The installation endpoint accepted only the two exact compiled path/hash/size identities with a random 256-bit capability; both uploaded objects were downloaded and verified. It was replaced immediately with a JWT-required HTTP 410 handler. No capability, binary lesson content, keys or logo directory is committed to the public repository.

Migration created using the Supabase CLI and ordered immediately after its predecessor: the previous file uses a later version number than current UTC, so the new CLI-generated filename was adjusted to preserve fresh replay dependency order. No rollback or rewrite of existing migration contents.

Security advisors were reviewed. The private table's intentional no-policy default-deny notice and the scoped authenticated SECURITY DEFINER RPC advisory reflect this access design; tests verify the explicit guards and grants. No broad table grant or anonymous execution was introduced. Reference: https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy

## Verification

- All 18 current school identities, including 9 actual configured logos and 9 name-only schools, generated both complete packs: 36 packs, 360 PDFs, 72 PowerPoints. Offline PDF checks verified original body-word parity, page counts, correct school names and absence of another school's name. All deck XML and HTML were checked for unresolved branding and another school's name. All delivered recordings retained their exact hashes.
- Representative school-branded workbook/guide PDFs rendered and visually inspected, including logo and no-logo states. Native deck renders covered all 20 Lesson 03 slides and all 17 Lesson 04 slides with two actual school identities; structural PPTX validation passed.
- Full local suite: 2,256 passed, 2 skipped, 0 failures. Typecheck, build, portal integrity and migration-security guards passed.
- Database tests: two teachers/two schools see the same approved lesson with only their own server-authorized branding; new schools inherit content; cross-school metadata, student, anonymous, banned, revoked-access and unreleased cases fail closed, including with an unrelated permissive Storage policy.
- Branding tests: HTML/XML escaping, selected-resource separation, per-file hashes, unchanged audio, missing-logo behavior, template mismatch and logo failure. Existing duplicate-click, stale school/unmount and lesson regressions retained.
- Hosted checks: both currently IELTS-enabled programmes return the two global entries and their own branding under an existing authorized platform administrator; the existing programme lead can retrieve the two shared templates; the actual student identity sees zero pack objects. Other schools remain subject to their existing module entitlement. No user roles, student work or module subscriptions were changed.

Contracts: Diagnostic Bible 1.10.0; Lessons Bible 1.1.0 (LB-01/04/05/06/08/09/11); Visual & UX Bible 1.1.0. Source artifacts were produced against the stronger draft lesson/diagnostic contract versions recorded in their original acceptance record; no Bible is modified here.

PDF/PowerPoint dependencies are pinned and loaded on explicit download only. Single-resource actions process only the selected resource. Shared content uses native private Storage; branding runs in the teacher's browser, outside database/answer-save transactions. This release establishes no concurrent-student capacity claim. Physical printer output, classroom audio, Microsoft PowerPoint execution and authenticated teacher-browser acceptance remain separate from renderer/role verification. Supported current school names and an additional Cyrillic/escaped-name case were checked; arbitrary font scripts are not universally certified.
