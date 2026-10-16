# IELTS-02: Reading evidence and developed answers

Private teacher-review draft 1.0.0. Intended duration: 60 minutes. Source is `lesson.json`.

The pack completes the post-screener teaching handoff with reading evidence, paragraph development and paired speaking. It includes seven A4 PDFs, a 17-slide editable PowerPoint, its motion-free alternative, offline HTML with optional finite fade, a start guide, school identity and logo, and a version manifest. No recording is required. No audio is generated or substituted.

The source is reusable. Pass school identity, the original local school logo and the programme review date explicitly. Do not hardcode a school into lesson source. Only the requested school's output carries its identity. Keep all generated packs private.

## Build

Requires Python with ReportLab/pypdf and the Codex primary runtime's Artifact Tool. Follow the Presentations/PDF skill authoring and finalization instructions. Create a private writable build directory with its `node_modules` symlink to `CODEX_PRIMARY_RUNTIME_NODE_MODULES`; copy the presentation builder there before executing it. The source repository does not depend on Artifact Tool at runtime.

```
python3 scripts/ielts/build-lesson-two-pack.py --output /absolute/private/output --school "Authorized school name" --logo /absolute/original-school-logo.jpg --review-date "Programme review date and timezone"
```

Run `build-lesson-two-presentation.mjs OUTPUT BUILD_DIRECTORY` with `CODEX_PRIMARY_RUNTIME_NODE` from that prepared build directory. It exports via Artifact Tool and requires successful package/layout/font/import checks before writing the final PPTX. Both PowerPoints are motion-free; optional HTML fade remains finite and manually selected. Use a new output directory for a new finalized PPTX revision.

```
python3 scripts/ielts/validate-lesson-two-pack.py /absolute/private/output
```

This validation checks timing continuity, pagination, student/key separation, fresh-prompt withholding, exact source hash, local links, slide-body parity, notes and absence of automatic advance. It cannot confer academic or human approval.

## Distribution and evidence

Give students only the `Students` PDFs after release review. The complete ZIP, slides, keys, planning sheet and fresh check belong to the teacher. Fresh-check student pages 2-3 are withheld until their planned reviewed delivery; page 4 is the private key. Do not publish these resources under `public/` or a public download URL.

The worksheet IDs are lesson-local identifiers, not canonical L/R/W/S catalogue codes. No RPC, migration, catalogue registration, automatic assignment, saved attempt or report is changed. Future online installation must use existing school authorization, task registry, originality and content-release gates.

Teacher review remains pending for the exact source hash. Do not record an AI-generated approval. The review sheet has blanks for actual editorial/key/mapping/difficulty/originality/rights and device decisions. A limited classroom paragraph or paired answer does not replace a screener or a full skill review. Guided corrections/revisions remain practice; a fresh task alone is insufficient to establish comparable improvement.
