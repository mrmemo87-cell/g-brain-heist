import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.46.1";
import OpenAI from "https://esm.sh/openai@4.52.3";

// ── Environment (deferred — don't crash on cold start so CORS still works) ──
const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const openAiKey   = Deno.env.get("OPENAI_API_KEY") ?? "";

const supabase = supabaseUrl && serviceKey ? createClient(supabaseUrl, serviceKey) : null;
const openai   = openAiKey ? new OpenAI({ apiKey: openAiKey }) : null;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body ?? {}), {
    status,
    headers: { "content-type": "application/json", ...corsHeaders },
  });

// ────────────────────────────────────────────────────────────
// Types that can be AI-graded
// ────────────────────────────────────────────────────────────
const AI_GRADABLE_TYPES = new Set([
  // Writing (always AI-graded)
  "email_writing",
  "essay_writing",
  // Text-based English (AI re-checks for flexible marking)
  "gap_fill",
  "sentence_transformation",
  "error_correction",
  "word_formation",
  "open_cloze",
  // Math (AI grades working & partial credit)
  "short_answer",
  "structured",
]);

// ────────────────────────────────────────────────────────────
// Cambridge-aligned default prompts (fallback when question
// has no custom ai_grading_prompt)
// ────────────────────────────────────────────────────────────
const DEFAULT_PROMPTS: Record<string, string> = {
  email_writing: `You are a Cambridge Assessment English examiner grading a student's email.

MARKING CRITERIA (each 0-5):
1. CONTENT: Are ALL bullet points addressed? Are ideas relevant and developed?
2. COMMUNICATIVE ACHIEVEMENT: Is register appropriate? Does writing hold the reader's attention?
3. ORGANISATION: Logical structure, paragraphing, cohesive devices, email conventions (greeting, body, sign-off)?
4. LANGUAGE: Range of vocabulary, grammar accuracy, sentence variety, spelling/punctuation?

SCORING: 5=exceptional, 4=good with minor lapses, 3=satisfactory, 2=inadequate, 1=very limited, 0=no relevant content.

Return VALID JSON only:
{"content":X,"communicative_achievement":X,"organisation":X,"language":X,"total":X,"max":20,"feedback":"2-3 paragraphs of examiner commentary","strengths":["..."],"improvements":["..."],"corrected_version":"rewritten version fixing all errors"}`,

  essay_writing: `You are a Cambridge Assessment English examiner grading a student's essay.

MARKING CRITERIA (each 0-5):
1. CONTENT: Clear argument/discussion? Both viewpoints considered? Personal opinion supported?
2. COMMUNICATIVE ACHIEVEMENT: Appropriate register? Persuasive? Audience awareness?
3. ORGANISATION: Clear intro, body, conclusion? Logical sequencing? Discourse markers?
4. LANGUAGE: Precise vocabulary? Complex grammar attempted accurately? Sentence variety?

SCORING: 5=exceptional, 4=good with minor lapses, 3=satisfactory, 2=inadequate, 1=very limited, 0=no relevant content.

Return VALID JSON only:
{"content":X,"communicative_achievement":X,"organisation":X,"language":X,"total":X,"max":20,"feedback":"2-3 paragraphs","strengths":["..."],"improvements":["..."],"corrected_version":"..."}`,

  gap_fill: `You are grading a Cambridge-style gap-fill answer.

IMPORTANT: Students may include extra words around their answer:
- "had already begun" when the answer is "had already begun" → CORRECT
- "The hardly" when the answer is "hardly" → extract key word, accept
- Full phrases or sentences containing the correct answer → extract and grade

RULES:
- Accept minor spelling variations if the intended word is clearly recognisable
- Accept valid ALTERNATIVE answers that are grammatically correct in context (e.g. "hadn't finished" and "had not finished" are equivalent)
- The answer must fit the gap grammatically AND semantically
- Strip leading articles (the, a, an) and trailing punctuation before comparing
- Case-insensitive
- Accept contracted forms as equivalent to full forms (don't = do not, hadn't = had not)

Return VALID JSON only:
{"is_correct":true/false,"marks_awarded":X,"marks_possible":X,"feedback":"brief explanation","accepted_answer":"the answer you accepted or the correct one"}`,

  sentence_transformation: `You are grading a Cambridge Key Word Transformation answer.
RULES:
- The keyword must be used WITHOUT changing its form
- Same meaning as the original sentence
- 2 marks: fully correct | 1 mark: one half correct | 0 marks: neither half correct
- Contractions are acceptable

Return VALID JSON only:
{"is_correct":true/false,"marks_awarded":X,"marks_possible":X,"feedback":"...","accepted_answer":"..."}`,

  error_correction: `You are grading a Cambridge error correction answer.

IMPORTANT: Students may respond in TWO different ways:
1. Just the corrected WORD (e.g. "doesn't") — compare directly to the correct answer
2. The FULL corrected sentence (e.g. "I'm looking forward to meeting you") — check if the correction they made is the right one

RULES:
- If the student rewrites the full sentence, check WHETHER THE SPECIFIC ERROR was correctly fixed
- The student must fix the CORRECT error (not change something else)
- If they fixed the right error but also changed other words unnecessarily, still award the mark
- Accept minor spelling variations if intent is clear
- Case-insensitive
- Example: Sentence has "to meet" (should be "to meeting"). Student writes "I'm looking forward to meeting you at the conference" → CORRECT (they fixed "meet" to "meeting")
- Example: Sentence has "have" (should be "has"). Student writes full sentence changing "have" to "had" → INCORRECT (wrong correction)

Return VALID JSON only:
{"is_correct":true/false,"marks_awarded":X,"marks_possible":X,"feedback":"explain what the error was and whether the student fixed it correctly"}`,

  word_formation: `You are grading a Cambridge word formation answer. The student must transform the base word into the correct derived form.

IMPORTANT: Students may include extra words around their answer:
- "The competition" when the answer is "competition" → extract the key word and grade it
- "completely" with a capital letter → accept (case-insensitive)
- Strip articles (the, a, an), pronouns, and other filler words to find the actual answer word

RULES:
- The core transformed word must be the correct derived form (noun, adjective, adverb, verb, etc.)
- Spelling must be correct for the KEY WORD (this type tests word knowledge)
- Ignore extra words the student may have added around the answer
- Case-insensitive
- Example: Base word COMPETE, correct answer "competition". Student writes "The competition" → CORRECT
- Example: Base word WILLING, correct answer "willingness". Student writes "Willing" → INCORRECT (not transformed to noun)

Return VALID JSON only:
{"is_correct":true/false,"marks_awarded":X,"marks_possible":X,"feedback":"explain the correct word form and whether the student's answer matches"}`,

  open_cloze: `You are grading a Cambridge open cloze answer. Accept valid alternatives. Case-insensitive.

Return VALID JSON only:
{"is_correct":true/false,"marks_awarded":X,"marks_possible":X,"feedback":"..."}`,

  short_answer: `You are grading a mathematics short answer. Accept equivalent forms (0.5 = 1/2 = 50%). Accept reasonable rounding.

Return VALID JSON only:
{"is_correct":true/false,"marks_awarded":X,"marks_possible":X,"feedback":"step-by-step explanation"}`,

  structured: `You are grading a structured mathematics question. Award marks for correct method even if the final answer has arithmetic errors. Check each step.

Return VALID JSON only:
{"is_correct":true/false,"marks_awarded":X,"marks_possible":X,"feedback":"detailed marking of each step","working_analysis":"..."}`,
};

// ────────────────────────────────────────────────────────────
// AI Grading for a single answer
// ────────────────────────────────────────────────────────────
interface AnswerToGrade {
  answer_id: string;
  question_id: string;
  question_type: string;
  stem: string;
  passage?: string;
  keyword?: string;
  base_word?: string;
  correct_answer: any;
  marks_possible: number;
  ai_grading_prompt?: string;
  response: any;
  explanation?: string;
}

async function gradeAnswer(a: AnswerToGrade): Promise<{
  marks_awarded: number;
  is_correct: boolean | null;
  ai_feedback: string;
  raw_ai: any;
}> {
  const isWriting = a.question_type === "email_writing" || a.question_type === "essay_writing";

  // Build the system prompt
  const systemPrompt = a.ai_grading_prompt
    || DEFAULT_PROMPTS[a.question_type]
    || DEFAULT_PROMPTS.gap_fill; // fallback

  // Build user message with all context
  let userMessage = `QUESTION:\n${a.stem}\n`;
  if (a.passage)     userMessage += `\nPASSAGE:\n${a.passage}\n`;
  if (a.keyword)     userMessage += `\nKEYWORD: ${a.keyword}\n`;
  if (a.base_word)   userMessage += `\nBASE WORD: ${a.base_word}\n`;
  if (a.explanation)  userMessage += `\nEXPLANATION/CONTEXT: ${a.explanation}\n`;

  if (!isWriting && a.correct_answer) {
    userMessage += `\nCORRECT ANSWER: ${JSON.stringify(a.correct_answer)}\n`;
  }

  // Add student response
  const studentResponse = typeof a.response === "object"
    ? (a.response?.text || JSON.stringify(a.response))
    : String(a.response ?? "");

  userMessage += `\nSTUDENT'S ANSWER:\n"""\n${studentResponse}\n"""\n`;
  userMessage += `\nMARKS AVAILABLE: ${a.marks_possible}`;

  console.log(`[AI Grade] ${a.question_type} — question_id=${a.question_id}`);

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4-turbo",
      response_format: { type: "json_object" },
      temperature: 0,
      max_tokens: isWriting ? 4096 : 1024,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user",   content: userMessage },
      ],
    });

    const raw = JSON.parse(completion.choices[0].message.content || "{}");
    console.log(`[AI Grade] Result:`, JSON.stringify(raw).slice(0, 200));

    if (isWriting) {
      // Writing: total out of 20, scaled to marks_possible
      const aiTotal   = Number(raw.total ?? 0);
      const aiMax     = Number(raw.max ?? 20);
      const scaled    = Math.round((aiTotal / aiMax) * a.marks_possible);
      const isCorrect = scaled > 0 ? null : false; // Writing doesn't have "correct/incorrect"

      const feedback = [
        raw.feedback || "",
        raw.strengths?.length ? `\nStrengths: ${raw.strengths.join("; ")}` : "",
        raw.improvements?.length ? `\nAreas to improve: ${raw.improvements.join("; ")}` : "",
        `\nMarks: Content ${raw.content}/5, Achievement ${raw.communicative_achievement}/5, Organisation ${raw.organisation}/5, Language ${raw.language}/5`,
        `\nTotal: ${aiTotal}/${aiMax} → ${scaled}/${a.marks_possible}`,
        raw.corrected_version ? `\n\nCorrected version:\n${raw.corrected_version}` : "",
      ].join("");

      return { marks_awarded: scaled, is_correct: isCorrect, ai_feedback: feedback, raw_ai: raw };
    } else {
      // Non-writing: direct marks
      const marks   = Math.min(Number(raw.marks_awarded ?? 0), a.marks_possible);
      const correct = raw.is_correct === true;
      const feedback = raw.feedback || raw.accepted_answer
        ? `${raw.feedback || ""}${raw.accepted_answer ? ` (Accepted: ${raw.accepted_answer})` : ""}`
        : "AI graded";

      return { marks_awarded: marks, is_correct: correct, ai_feedback: feedback, raw_ai: raw };
    }
  } catch (err: any) {
    console.error(`[AI Grade] Error for ${a.question_id}:`, err.message);
    return {
      marks_awarded: 0,
      is_correct: null,
      ai_feedback: `AI grading failed: ${err.message}`,
      raw_ai: { error: err.message },
    };
  }
}

// ────────────────────────────────────────────────────────────
// MAIN HANDLER
// ────────────────────────────────────────────────────────────
serve(async (req: Request) => {
  // CORS preflight — must respond even if env vars are missing
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST")   return json(405, { error: "Method not allowed" });

  // Check env vars (deferred to here so OPTIONS always works)
  if (!supabase || !openai) {
    return json(500, { error: "Server misconfigured — missing SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, or OPENAI_API_KEY" });
  }

  try {
    // ── Auth ──
    const authHeader = req.headers.get("authorization");
    if (!authHeader) return json(401, { error: "Missing authorization" });

    const token = authHeader.replace("Bearer ", "");
    const { data: authData, error: authError } = await supabase.auth.getUser(token);
    if (authError || !authData?.user) return json(401, { error: "Unauthorized" });

    // Verify teacher/admin
    const { data: userData } = await supabase
      .from("users")
      .select("is_admin, role")
      .eq("id", authData.user.id)
      .single();

    const isTeacher = userData?.is_admin === true
      || userData?.role === "teacher"
      || userData?.role === "admin";
    if (!isTeacher) return json(403, { error: "Teachers/admins only" });

    // ── Parse body ──
    const { attempt_id } = await req.json();
    if (!attempt_id) return json(400, { error: "attempt_id is required" });

    console.log(`[adm_generate_report] Starting for attempt ${attempt_id}`);

    // ── Fetch attempt ──
    const { data: attempt, error: attErr } = await supabase
      .from("adm_attempts")
      .select("*, adm_test_forms!inner(form_code, blueprint_id)")
      .eq("id", attempt_id)
      .single();

    if (attErr || !attempt) return json(404, { error: "Attempt not found" });

    // ── Fetch answers with question details ──
    const { data: answers, error: ansErr } = await supabase
      .from("adm_answers")
      .select(`
        id, question_id, response, is_correct, marks_awarded, marks_possible,
        adm_questions!inner(
          question_type, stem, passage, keyword, base_word,
          correct_answer, marks, explanation, ai_grading_prompt, topic, skill_tag
        )
      `)
      .eq("attempt_id", attempt_id);

    if (ansErr) return json(500, { error: `Failed to fetch answers: ${ansErr.message}` });
    if (!answers?.length) return json(400, { error: "No answers found for this attempt" });

    console.log(`[adm_generate_report] Found ${answers.length} answers`);

    // ── Grade each AI-gradable answer ──
    let totalScore  = 0;
    let maxScore    = 0;
    let writingGraded = 0;
    let textGraded    = 0;
    const gradedAnswers: any[] = [];

    for (const ans of answers) {
      const q = (ans as any).adm_questions;
      const qType = q.question_type;
      const shouldAiGrade = AI_GRADABLE_TYPES.has(qType);

      if (shouldAiGrade && ans.response) {
        const result = await gradeAnswer({
          answer_id:        ans.id,
          question_id:      ans.question_id,
          question_type:    qType,
          stem:             q.stem,
          passage:          q.passage,
          keyword:          q.keyword,
          base_word:        q.base_word,
          correct_answer:   q.correct_answer,
          marks_possible:   ans.marks_possible,
          ai_grading_prompt: q.ai_grading_prompt,
          response:         ans.response,
          explanation:      q.explanation,
        });

        // Update the answer in DB
        await supabase
          .from("adm_answers")
          .update({
            marks_awarded:     result.marks_awarded,
            is_correct:        result.is_correct,
            ai_feedback:       result.ai_feedback,
            ai_grading_status: result.ai_feedback.startsWith("AI grading failed") ? "failed" : "graded",
          })
          .eq("id", ans.id);

        totalScore += result.marks_awarded;
        maxScore   += ans.marks_possible;

        if (qType === "email_writing" || qType === "essay_writing") writingGraded++;
        else textGraded++;

        gradedAnswers.push({
          question_id: ans.question_id,
          question_type: qType,
          stem: q.stem,
          topic: q.topic,
          response: ans.response,
          correct_answer: q.correct_answer,
          is_correct: result.is_correct,
          marks_awarded: result.marks_awarded,
          marks_possible: ans.marks_possible,
          ai_feedback: result.ai_feedback,
        });
      } else {
        // MCQ / reading comp — keep existing score
        totalScore += (ans.marks_awarded ?? 0);
        maxScore   += ans.marks_possible;

        gradedAnswers.push({
          question_id: ans.question_id,
          question_type: qType,
          stem: q.stem,
          topic: q.topic,
          response: ans.response,
          correct_answer: q.correct_answer,
          is_correct: ans.is_correct,
          marks_awarded: ans.marks_awarded,
          marks_possible: ans.marks_possible,
          ai_feedback: null,
        });
      }
    }

    // ── Also count unanswered questions ──
    const { data: unanswered } = await supabase
      .from("adm_test_form_questions")
      .select("marks_override, adm_questions!inner(marks)")
      .eq("form_id", attempt.form_id)
      .not("question_id", "in", `(${answers.map(a => a.question_id).join(",")})`);

    if (unanswered) {
      for (const u of unanswered) {
        maxScore += (u as any).marks_override ?? (u as any).adm_questions.marks;
      }
    }

    // ── Recalculate attempt totals ──
    const pct = maxScore > 0 ? Math.round((totalScore / maxScore) * 10000) / 100 : 0;
    const band = pct >= 80 ? "A" : pct >= 65 ? "B" : pct >= 50 ? "C" : pct >= 35 ? "D" : "E";

    await supabase
      .from("adm_attempts")
      .update({
        total_score: totalScore,
        max_score:   maxScore,
        percentage:  pct,
        status:      "scored",
      })
      .eq("id", attempt_id);

    // ── Generate AI summary ──
    let aiSummary = "";
    try {
      const summaryCompletion = await openai.chat.completions.create({
        model: "gpt-4-turbo",
        temperature: 0.3,
        max_tokens: 1024,
        messages: [
          {
            role: "system",
            content: `You are a report writer for a Cambridge school admission test. Write a concise 2-3 paragraph summary of the candidate's performance. Include: overall impression, key strengths, areas needing development, and a placement recommendation (Band ${band}). Be professional but kind.`,
          },
          {
            role: "user",
            content: `Score: ${totalScore}/${maxScore} (${pct}%, Band ${band})
Writing tasks graded: ${writingGraded}
Text-based tasks AI-checked: ${textGraded}

Per-question results:
${gradedAnswers.map(a =>
  `- ${a.question_type}: ${a.marks_awarded}/${a.marks_possible} ${a.ai_feedback ? `(${a.ai_feedback.slice(0, 100)}...)` : ""}`
).join("\n")}`,
          },
        ],
      });
      aiSummary = summaryCompletion.choices[0].message.content || "";
    } catch (err: any) {
      console.error("[AI Summary] Error:", err.message);
      aiSummary = `Score: ${totalScore}/${maxScore} (${pct}%, Band ${band}). AI summary generation failed.`;
    }

    // ── Audit log ──
    await supabase
      .from("adm_audit_log")
      .insert({
        school_id: attempt.school_id,
        actor_id:  authData.user.id,
        action:    "ai_report_generated",
        target_type: "attempt",
        target_id:   attempt_id,
        details: {
          total_score: totalScore,
          max_score:   maxScore,
          percentage:  pct,
          band,
          writing_graded: writingGraded,
          text_graded:    textGraded,
        },
      });

    console.log(`[adm_generate_report] Done: ${totalScore}/${maxScore} (${pct}%) Band ${band}`);

    return json(200, {
      success: true,
      total_score: totalScore,
      max_score:   maxScore,
      percentage:  pct,
      band,
      ai_summary:  aiSummary,
      writing_graded: writingGraded,
      text_graded:    textGraded,
      answers:     gradedAnswers,
    });

  } catch (err: any) {
    console.error("[adm_generate_report] Unhandled error:", err);
    return json(500, { error: err.message || "Internal server error" });
  }
});
