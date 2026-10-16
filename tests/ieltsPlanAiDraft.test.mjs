import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
const built = (
  await build({
    entryPoints: ["supabase/functions/_shared/ieltsPlanAiDraft.ts"],
    bundle: true,
    format: "esm",
    write: false,
    logLevel: "silent",
  })
).outputFiles[0].text;
const { validatePlanAiOutput, PLAN_AI_INSTRUCTIONS, planAiSchema } =
  await import(
    "data:text/javascript;base64," + Buffer.from(built).toString("base64")
  );
const fields = {
  study_goal: "A proposed study goal to agree.",
  next_action: "Arrange the missing checks with the teacher.",
  review_on: "2026-11-06",
  skills: Object.fromEntries(
    ["listening", "reading", "writing", "speaking"].map((s) => [
      s,
      {
        pathway: "more_evidence",
        rationale: "More evidence is needed for this skill.",
        sources: [],
      },
    ]),
  ),
  goals: [
    {
      skill: "writing",
      action: "Arrange a fresh writing check.",
      success: "A complete independent essay is saved.",
      check: "Teacher reviews the new essay.",
    },
  ],
};
const context = {
  review_on: "2026-11-06",
  evidence: [
    { source_id: "one", skill: "writing", kind: "screener", review_id: null },
  ],
};
test("AI plan is complete, simple and keeps missing evidence explicit", () => {
  assert.equal(
    validatePlanAiOutput(fields, context).study_goal,
    fields.study_goal,
  );
  assert.match(PLAN_AI_INSTRUCTIONS, /untrusted data/);
  assert.match(
    PLAN_AI_INSTRUCTIONS,
    /Practice completion is participation only/,
  );
});
test("AI cannot invent references, infer readiness from pending writing, change dates or claim improvement", () => {
  for (const change of [
    { ...fields, review_on: "2026-11-07" },
    { ...fields, next_action: "You improved and mastered your writing." },
    { ...fields, band: 7 },
    {
      ...fields,
      skills: {
        ...fields.skills,
        writing: {
          pathway: "foundation",
          rationale: "Develop this area next.",
          sources: ["invented"],
        },
      },
    },
    {
      ...fields,
      skills: {
        ...fields.skills,
        writing: {
          pathway: "exam_preparation",
          rationale: "Focus on timed practice.",
          sources: ["one"],
        },
      },
    },
  ])
    assert.throws(() => validatePlanAiOutput(change, context));
  const approved = {
    ...context,
    evidence: [{ ...context.evidence[0], review_id: "review" }],
  };
  assert.equal(
    validatePlanAiOutput(
      {
        ...fields,
        skills: {
          ...fields.skills,
          writing: {
            pathway: "foundation",
            rationale: "Develop the reviewed area next.",
            sources: ["one"],
          },
        },
      },
      approved,
    ).skills.writing.pathway,
    "foundation",
  );
});

test("provider schema pins the exact server date and bounded goals; validator retains the same gates", () => {
  const schema = planAiSchema(context);
  assert.deepEqual(schema.properties.review_on.enum, [context.review_on]);
  assert.equal(schema.properties.goals.minItems, 1);
  assert.equal(schema.properties.goals.maxItems, 3);
  assert.throws(
    () => validatePlanAiOutput({ ...fields, review_on: "2026-11-07" }, context),
    /invalid_review_date/,
  );
  assert.throws(
    () =>
      validatePlanAiOutput(
        { ...fields, goals: Array(4).fill(fields.goals[0]) },
        context,
      ),
    /invalid_goal_count/,
  );
  assert.throws(
    () =>
      validatePlanAiOutput({ ...fields, study_goal: "x".repeat(501) }, context),
    /invalid_study_goal/,
  );
  assert.throws(
    () =>
      validatePlanAiOutput(
        { ...fields, next_action: "The student improved." },
        context,
      ),
    /invalid_next_action/,
  );
});

test("plan prose cannot leak source identities or promote a short task to a confirmed strength", () => {
  for (const text of [
    "Review source_id: one next.",
    "Clear strengths in listening.",
    "Use source 11111111-1111-4111-8111-111111111111.",
    "Continue with more advanced sections.",
  ]) {
    assert.throws(() =>
      validatePlanAiOutput({ ...fields, next_action: text }, context),
    );
  }
  assert.match(PLAN_AI_INSTRUCTIONS, /Do not ask for a missing Writing/);
  assert.match(PLAN_AI_INSTRUCTIONS, /Do not force the same pathway/);
});

test("AI rejects retained assessment requests already covered by reviewed samples", () => {
  const reviewed = {
    ...context,
    evidence: [
      {
        source_id: "one",
        skill: "writing",
        kind: "screener",
        review_id: "review",
      },
      {
        source_id: "two",
        skill: "speaking",
        kind: "screener",
        review_id: "review2",
      },
    ],
  };
  assert.throws(
    () =>
      validatePlanAiOutput(
        { ...fields, study_goal: "Arrange a writing and speaking assessment." },
        reviewed,
      ),
    /outdated_assessment_request/,
  );
  assert.doesNotThrow(() =>
    validatePlanAiOutput(
      {
        ...fields,
        study_goal: "Arrange fresh writing and speaking follow-up assessments.",
      },
      reviewed,
    ),
  );
});
