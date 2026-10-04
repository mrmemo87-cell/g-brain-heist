# Economics diagnosis, practice and reassessment

The original 40-item diagnostic remains unchanged. This release adds 200 original
MCQs to the same published Economics registry and exact Evidence Focuses. It is
aligned to the public Cambridge 0455 syllabus for 2027–2029, not endorsed by
Cambridge. It does not extend coverage to every node in the complete registry.

| Coverage | Before | After |
| --- | ---: | ---: |
| Original distinct questions | 40 | 240 |
| Primary content subskills | 40 | 40 |
| Questions per primary content subskill | 1 | 6 |
| Assessed subskills including secondary reasoning | 45 | 45 |
| Minimum questions per assessed subskill | 1 | 6 |
| Practice additions | 0 | 120 |
| Reassessment candidates | 0 | 80 |

## Teacher sequence

1. Use the existing diagnostic to identify a signal, then review the evidence.
2. Open Targeted Practice for the confirmed subskill and Evidence Focus. Reserve
   questions are excluded from this workspace, including broader-skill choices.
   Practice answers remain in history but do not establish independent improvement.
3. Teach using the explanations, a diagram, discussion or a worked example.
4. Create a later independent quiz from the regular bank. Preview labels identify
   the two reassessment candidates per content subskill. Use one now and preserve
   the other for a subsequent checkpoint. Do not reveal their answers beforehand.
5. Review fresh evidence across occasions alongside a student's own explanation.
   Two correct MCQs alone are insufficient to certify mastery or resolve a plan.

Purpose labels guide selection. They do not change eligibility by themselves: a
practice item used in a genuinely independent assessment may contribute when fresh;
a reserve item rehearsed or previously answered cannot be considered fresh.
Practice must be created through Targeted Practice to retain its provenance.

## Freshness and provenance

For new registry observations, an answer is fresh only when the student has no
earlier saved answer to the same question in another assignment. This includes
incomplete work and targeted practice. Equal or unknown timestamps fail closed.
The server classifies repeated work as non-contributing evidence and records the
reason. It preserves immutable item history and does not relabel repetition as
targeted practice. A mixed group containing a repeated item is conservatively
non-contributing; use fresh-only items for a checkpoint.

The candidate selector exposes fresh reserve IDs internally and excludes all
reserve items from automatic practice recommendations. Existing exact, same-subskill
and broader-skill boundaries and teacher allocation checks remain in effect.

This check measures recorded answer exposure, not unrecorded classroom exposure,
screenshots or memorisation. It applies to newly ingested observations; historical
records are not retrospectively rewritten. Existing questions may have been seen
before this policy. Teachers remain responsible for keeping reserve items unseen.

## Content quality and limits

The authored source provides five different questions for each original subskill:
definitions, contrasting cases, interpretation, calculations and transfer to new
contexts as appropriate. This is not a parameter-swapped question generator.
Distractors target common conceptual confusions; each answer has an explanation.
Correct option positions are balanced across the release. The packaging script
is deterministic and validates coverage, identities and roles.

Every item passes the existing atomic, service-role-only registry importer with
content hashes, approved taxonomy, immutable release identity and separate external
Paper 1 metadata. Cambridge Paper 1 uses AO1/AO2. Secondary internal BH reasoning
labels represent recognising a chain, diagram or condition in an MCQ, not the
ability to construct a written analysis, diagram or evaluation independently.

Difficulty labels are editorial estimates. Automated structural, arithmetic,
taxonomy and database checks are not independent human specialist review or
psychometric calibration. Six mapped items improve coverage; they do not establish
statistical reliability. Before high-stakes use, a subject specialist should review
items, then use response data to inspect accuracy, discrimination and distractor
selection. Expand beyond two reserve items per content focus when repeated
checkpoints exhaust the fresh pool. New versions require new release identities.

## Validation

`node scripts/economics/build-reassessment-bank.mjs` rebuilds the package.
`tests/economicsReassessmentBank.test.ts` checks coverage, answer-position balance,
arithmetic, AO boundaries and exact package/migration agreement.
`tests/economicsReassessmentDatabase.sql` tests reserve holdout, fresh candidates,
repeated correct work, and a genuinely fresh follow-up inside a rollback transaction.
