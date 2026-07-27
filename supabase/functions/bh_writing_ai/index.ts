import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.46.1";
import OpenAI from "https://esm.sh/openai@4.52.3";

type Mode = "feedback" | "plan_assist" | "prompt_rewrite";

type Payload = {
  mode: Mode;
  promptText: string;
  studentResponse?: string;
  weaknesses?: string[];
  grade?: number;
  genre?: string;
};

type UserRole = "student" | "teacher" | "admin";

type AiResult = {
  task_understanding?: string;
  submission_read?: string;
  alignment?:
    | "on_task"
    | "partially_on_task"
    | "off_topic"
    | "too_short"
    | "underdeveloped"
    | "mostly_correct_but_needs_polish";
  what_is_working?: string[];
  what_is_missing?: string[];
  grammar_fixes?: Array<{ original: string; issue: string; better_version: string }>;
  punctuation_fixes?: Array<{ original: string; issue: string; better_version: string }>;
  natural_phrase_upgrades?: Array<{ original: string; better_version: string; why_it_helps: string }>;
  style_tone_feedback?: Array<{ evidence: string; issue: string; suggestion: string }>;
  next_move?: string;
  example_revision_start?: string;
  strengths?: string[];
  weaknesses?: string[];
  weakness_tags?: string[];
  next_steps?: string[];
  focus?: string;
  drills?: string[];
  checkpoints?: string[];
  coaching_points?: string[];
  rewritten_prompt?: string;
  daily_task?: string;
  monthly_report_summary?: string;
  anchor_version?: string;
  text_fingerprint?: string;
  highlights?: Array<{
    id?: string;
    polarity?: "strong" | "weak";
    category?: string;
    start_char?: number;
    end_char?: number;
    sentence_index?: number;
    paragraph_index?: number;
    exact_text?: string;
    confidence?: number;
  }>;
  repair_steps?: Array<{
    id?: string;
    highlight_id?: string;
    step_type?: string;
    title?: string;
    instruction?: string;
    source_field?: string;
    done_criteria?: string;
    evidence?: string;
  }>;
};

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const openAiKey = Deno.env.get("OPENAI_API_KEY");

if (!supabaseUrl || !serviceKey || !openAiKey) {
  throw new Error("Missing required environment variables.");
}

const supabase = createClient(supabaseUrl, serviceKey);
const openai = new OpenAI({ apiKey: openAiKey });

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      ...corsHeaders,
    },
  });

const withTimeout = async <T>(promise: Promise<T>, timeoutMs: number): Promise<T> => {
  return await Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`Timed out after ${timeoutMs}ms`)), timeoutMs)
    ),
  ]);
};

const normalizeGrade = (value: unknown): number | undefined => {
  if (value === null || value === undefined || value === "") return undefined;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(n) || n < 6 || n > 12) return undefined;
  return n;
};

const normalizeTextForFingerprint = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[“”]/g, "\"")
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, " ")
    .trim();

const buildDeterministicTextFingerprint = (value: string): string => {
  const normalized = normalizeTextForFingerprint(value);
  let hash = 2166136261;
  for (let i = 0; i < normalized.length; i += 1) {
    hash ^= normalized.charCodeAt(i);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return `fp_${(hash >>> 0).toString(16)}`;
};

const normalizeRole = (value: unknown): UserRole | null => {
  if (value === "student" || value === "teacher" || value === "admin") return value;
  return null;
};

const validatePayload = (payload: Payload | null): string | null => {
  if (!payload) return "Invalid payload";
  if (payload.mode !== "feedback" && payload.mode !== "plan_assist" && payload.mode !== "prompt_rewrite") {
    return "Invalid mode";
  }
  if (!payload.promptText || payload.promptText.trim().length < 8) {
    return "Prompt text is required";
  }
  if (payload.studentResponse && payload.studentResponse.length > 10000) {
    return "studentResponse is too long";
  }
  if (payload.weaknesses && payload.weaknesses.length > 20) {
    return "Too many weaknesses";
  }
  if (payload.grade !== undefined && normalizeGrade(payload.grade) === undefined) {
    return "grade must be an integer between 6 and 12";
  }
  return null;
};

const getUserRole = async (
  userId: string,
  fallbackRole?: unknown,
  fallbackIsAdmin?: unknown,
): Promise<UserRole> => {
  const { data, error } = await supabase
    .from("users")
    .select("role, is_admin")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    console.warn("[bh_writing_ai] failed to load role from users table, falling back to auth metadata", error.message);
  }

  if (data?.is_admin === true || data?.role === "admin" || fallbackIsAdmin === true) {
    return "admin";
  }

  if (data?.role === "teacher") return "teacher";
  if (data?.role === "student") return "student";

  const fallback = normalizeRole(fallbackRole);
  return fallback ?? "student";
};

const normalizeAiResult = (mode: Mode, raw: unknown): AiResult | null => {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;

  if (mode === "feedback") {
    const alignmentRaw = typeof value.alignment === "string" ? value.alignment : "";
    const alignment = alignmentRaw === "partly_on_task" ? "partially_on_task" : alignmentRaw;
    const normalizedAlignment =
      alignment === "on_task" ||
      alignment === "partially_on_task" ||
      alignment === "off_topic" ||
      alignment === "too_short" ||
      alignment === "underdeveloped" ||
      alignment === "mostly_correct_but_needs_polish"
        ? alignment
        : "underdeveloped";

    const normalizeFixes = (
      input: unknown,
    ): Array<{ original: string; issue: string; better_version: string }> => {
      if (!Array.isArray(input)) return [];
      return input
        .map((item) => {
          if (!item || typeof item !== "object") return null;
          const obj = item as Record<string, unknown>;
          return {
            original: typeof obj.original === "string" ? obj.original.trim() : "",
            issue: typeof obj.issue === "string" ? obj.issue.trim() : "",
            better_version: typeof obj.better_version === "string" ? obj.better_version.trim() : "",
          };
        })
        .filter((item): item is { original: string; issue: string; better_version: string } =>
          Boolean(item && item.original && item.issue && item.better_version)
        )
        .slice(0, 5);
    };

    const grammarIssuePattern =
      /\b(subject-?verb|verb agreement|agreement|verb tense|tense|plural|singular|article|pronoun|word form|grammar|run-?on|fragment|sentence structure|clause|auxiliary verb|verb form)\b/i;
    const punctuationIssuePattern =
      /\b(comma|period|apostrophe|quotation|quote mark|capitalization|punctuation|semicolon|colon|question mark|exclamation)\b/i;

    const repartitionFixes = (
      grammarFixes: Array<{ original: string; issue: string; better_version: string }>,
      punctuationFixes: Array<{ original: string; issue: string; better_version: string }>,
    ) => {
      const movedToGrammar = punctuationFixes.filter((fix) => grammarIssuePattern.test(fix.issue));
      const keptPunctuation = punctuationFixes.filter((fix) => !grammarIssuePattern.test(fix.issue));
      const movedToPunctuation = grammarFixes.filter(
        (fix) => punctuationIssuePattern.test(fix.issue) && !grammarIssuePattern.test(fix.issue),
      );
      const keptGrammar = grammarFixes.filter(
        (fix) => !(punctuationIssuePattern.test(fix.issue) && !grammarIssuePattern.test(fix.issue)),
      );

      return {
        grammar: [...keptGrammar, ...movedToGrammar].slice(0, 3),
        punctuation: [...keptPunctuation, ...movedToPunctuation].slice(0, 3),
      };
    };

    const normalizePhraseUpgrades = (
      input: unknown,
    ): Array<{ original: string; better_version: string; why_it_helps: string }> => {
      if (!Array.isArray(input)) return [];
      return input
        .map((item) => {
          if (!item || typeof item !== "object") return null;
          const obj = item as Record<string, unknown>;
          return {
            original: typeof obj.original === "string" ? obj.original.trim() : "",
            better_version: typeof obj.better_version === "string" ? obj.better_version.trim() : "",
            why_it_helps: typeof obj.why_it_helps === "string" ? obj.why_it_helps.trim() : "",
          };
        })
        .filter((item): item is { original: string; better_version: string; why_it_helps: string } =>
          Boolean(item && item.original && item.better_version && item.why_it_helps)
        )
        .slice(0, 5);
    };

    const normalizeStyleTone = (
      input: unknown,
    ): Array<{ evidence: string; issue: string; suggestion: string }> => {
      if (!Array.isArray(input)) return [];
      return input
        .map((item) => {
          if (!item || typeof item !== "object") return null;
          const obj = item as Record<string, unknown>;
          return {
            evidence: typeof obj.evidence === "string" ? obj.evidence.trim() : "",
            issue: typeof obj.issue === "string" ? obj.issue.trim() : "",
            suggestion: typeof obj.suggestion === "string" ? obj.suggestion.trim() : "",
          };
        })
        .filter((item): item is { evidence: string; issue: string; suggestion: string } =>
          Boolean(item && item.evidence && item.issue && item.suggestion)
        )
        .slice(0, 4);
    };

    const normalizedGrammarFixes = normalizeFixes(value.grammar_fixes);
    const normalizedPunctuationFixes = normalizeFixes(value.punctuation_fixes);
    const repartitionedFixes = repartitionFixes(normalizedGrammarFixes, normalizedPunctuationFixes);
    const allowedWeaknessTags = new Set([
      "missed_content_point",
      "partial_content_coverage",
      "irrelevant_detail",
      "under_length",
      "wrong_tone",
      "weak_register_control",
      "weak_genre_convention",
      "weak_audience_awareness",
      "weak_paragraphing",
      "poor_sequencing",
      "weak_linking",
      "repetitive_flow",
      "tense_error",
      "agreement_error",
      "article_error",
      "preposition_error",
      "fragment",
      "run_on",
      "weak_word_choice",
      "spelling_error",
      "punctuation_error",
    ]);
    const weaknessTags = Array.isArray(value.weakness_tags)
      ? [...new Set(value.weakness_tags.map(String).filter((tag) => allowedWeaknessTags.has(tag)))].slice(0, 12)
      : [];

    const normalizeHighlights = (input: unknown): AiResult["highlights"] => {
      if (!Array.isArray(input)) return [];
      return input
        .map((item) => {
          if (!item || typeof item !== "object") return null;
          const obj = item as Record<string, unknown>;
          const start = typeof obj.start_char === "number" && Number.isInteger(obj.start_char) ? obj.start_char : null;
          const end = typeof obj.end_char === "number" && Number.isInteger(obj.end_char) ? obj.end_char : null;
          if (start === null || end === null || start < 0 || end <= start) return null;
          const polarity = obj.polarity === "strong" ? "strong" : "weak";
          return {
            id: typeof obj.id === "string" ? obj.id : undefined,
            polarity,
            category: typeof obj.category === "string" ? obj.category : undefined,
            start_char: start,
            end_char: end,
            sentence_index:
              typeof obj.sentence_index === "number" && Number.isInteger(obj.sentence_index)
                ? obj.sentence_index
                : undefined,
            paragraph_index:
              typeof obj.paragraph_index === "number" && Number.isInteger(obj.paragraph_index)
                ? obj.paragraph_index
                : undefined,
            exact_text: typeof obj.exact_text === "string" ? obj.exact_text : undefined,
            confidence:
              typeof obj.confidence === "number" && Number.isFinite(obj.confidence)
                ? Math.max(0, Math.min(1, obj.confidence))
                : undefined,
          };
        })
        .filter((item): item is NonNullable<AiResult["highlights"]>[number] => Boolean(item))
        .slice(0, 20);
    };

    const normalizeRepairSteps = (input: unknown): AiResult["repair_steps"] => {
      if (!Array.isArray(input)) return [];
      return input
        .map((item) => {
          if (!item || typeof item !== "object") return null;
          const obj = item as Record<string, unknown>;
          return {
            id: typeof obj.id === "string" ? obj.id : undefined,
            highlight_id: typeof obj.highlight_id === "string" ? obj.highlight_id : undefined,
            step_type: typeof obj.step_type === "string" ? obj.step_type : undefined,
            title: typeof obj.title === "string" ? obj.title : undefined,
            instruction: typeof obj.instruction === "string" ? obj.instruction : undefined,
            source_field: typeof obj.source_field === "string" ? obj.source_field : undefined,
            done_criteria: typeof obj.done_criteria === "string" ? obj.done_criteria : undefined,
            evidence: typeof obj.evidence === "string" ? obj.evidence : undefined,
          };
        })
        .filter((item): item is NonNullable<AiResult["repair_steps"]>[number] =>
          Boolean(item && (item.title || item.instruction || item.evidence))
        )
        .slice(0, 20);
    };

    return {
      task_understanding: typeof value.task_understanding === "string" ? value.task_understanding : "",
      submission_read: typeof value.submission_read === "string" ? value.submission_read : "",
      alignment: normalizedAlignment,
      what_is_working: Array.isArray(value.what_is_working) ? value.what_is_working.map(String) : [],
      what_is_missing: Array.isArray(value.what_is_missing) ? value.what_is_missing.map(String) : [],
      grammar_fixes: repartitionedFixes.grammar,
      punctuation_fixes: repartitionedFixes.punctuation,
      natural_phrase_upgrades: normalizePhraseUpgrades(value.natural_phrase_upgrades),
      style_tone_feedback: normalizeStyleTone(value.style_tone_feedback),
      next_move: typeof value.next_move === "string" ? value.next_move : "",
      example_revision_start:
        typeof value.example_revision_start === "string" ? value.example_revision_start : "",
      strengths: Array.isArray(value.strengths) ? value.strengths.map(String) : [],
      weaknesses: Array.isArray(value.weaknesses) ? value.weaknesses.map(String) : [],
      weakness_tags: weaknessTags,
      next_steps: Array.isArray(value.next_steps) ? value.next_steps.map(String) : [],
      monthly_report_summary:
        typeof value.monthly_report_summary === "string" ? value.monthly_report_summary : "",
      anchor_version: typeof value.anchor_version === "string" ? value.anchor_version : undefined,
      highlights: normalizeHighlights(value.highlights),
      repair_steps: normalizeRepairSteps(value.repair_steps),
    };
  }

  if (mode === "plan_assist") {
    return {
      focus: typeof value.focus === "string" ? value.focus : "",
      drills: Array.isArray(value.drills) ? value.drills.map(String) : [],
      checkpoints: Array.isArray(value.checkpoints) ? value.checkpoints.map(String) : [],
      coaching_points: Array.isArray(value.coaching_points) ? value.coaching_points.map(String) : [],
      rewritten_prompt: typeof value.rewritten_prompt === "string" ? value.rewritten_prompt : "",
      daily_task: typeof value.daily_task === "string" ? value.daily_task : "",
    };
  }

  if (mode === "prompt_rewrite") {
    return {
      rewritten_prompt:
        typeof value.rewritten_prompt === "string"
          ? value.rewritten_prompt
          : typeof value.prompt === "string"
          ? value.prompt
          : "",
    };
  }

  return null;
};

const buildUserPrompt = (payload: Payload): string => {
  const grade = normalizeGrade(payload.grade) ?? "unknown";
  const genre = payload.genre?.trim() || "unknown";

  if (payload.mode === "feedback") {
    return [
      `Grade: ${grade}`,
      `Genre: ${genre}`,
      `Task prompt: ${payload.promptText}`,
      `Student response: ${payload.studentResponse ?? ""}`,
      `Known weaknesses from recent work: ${JSON.stringify(payload.weaknesses ?? [])}`,
      "Return strict JSON only with keys:",
      '- task_understanding: one short explanation written directly to the student (use "you"), starting with "You were asked to..."',
      '- submission_read: one short summary written directly to the student about what they actually wrote, including "You answered this by..."',
      '- alignment: exactly one of on_task | partly_on_task | partially_on_task | off_topic | too_short | underdeveloped | mostly_correct_but_needs_polish',
      '- what_is_working: 2 evidence-based wins that reference exact student wording when useful',
      '- what_is_missing: 2 evidence-based missing content points that matter most for task completion',
      '- grammar_fixes: up to 3 objects with keys original, issue, better_version',
      '- punctuation_fixes: up to 3 objects with keys original, issue, better_version',
      '- natural_phrase_upgrades: up to 3 objects with keys original, better_version, why_it_helps',
      '- style_tone_feedback: up to 2 objects with keys evidence, issue, suggestion',
      '- next_move: one best next revision move',
      '- example_revision_start: one concrete improved sentence/starter when useful',
      "- strengths: 2 short specific positives",
      "- weaknesses: 2 short plain-English weakness summaries",
      "- weakness_tags: every detected weakness as canonical machine-readable tags selected only from missed_content_point | partial_content_coverage | irrelevant_detail | under_length | wrong_tone | weak_register_control | weak_genre_convention | weak_audience_awareness | weak_paragraphing | poor_sequencing | weak_linking | repetitive_flow | tense_error | agreement_error | article_error | preposition_error | fragment | run_on | weak_word_choice | spelling_error | punctuation_error",
      "- next_steps: 2 or 3 clear actionable next steps",
      "- monthly_report_summary: 1 short progress summary sentence",
      "- Optional future-safe keys when confidence is high: anchor_version, highlights[], repair_steps[]",
      "  - highlights item keys: id, polarity(strong|weak), category, start_char, end_char, sentence_index?, paragraph_index?, exact_text, confidence(0-1).",
      "  - repair_steps item keys: id, highlight_id?, step_type, title, instruction, source_field, done_criteria, evidence.",
      "Quality rules:",
      "- Always write directly to the student using 'you' and 'your'.",
      "- Never use third-person framing like 'the student', 'the response', or 'the story'.",
      "- Use direct evidence from the student response. Quote short snippets where useful.",
      "- Never invent evidence or errors that are not present.",
      "- Separate content/task issues from language issues and style/tone issues.",
      "- Prioritize the most important truth first. If task alignment is weak, say that clearly before language polish.",
      "- Alignment workflow: decide task coverage first, then decide quality/development.",
      "- Alignment decision logic:",
      "  - Use on_task when all required task parts are present, even if ideas are brief or somewhat weak.",
      "  - Use partially_on_task when at least one required task part is missing, only partly answered, or clearly undercovered.",
      "  - Use off_topic only when the response clearly does not match the assigned task.",
      "  - Use too_short only when there is not enough writing to judge task completion.",
      "  - Use underdeveloped only as an explanatory quality judgment when development is extremely thin; do not use it as a substitute for coverage logic.",
      "  - Use mostly_correct_but_needs_polish when the task is answered well overall but language/style still needs refinement.",
      "  - If every required part is present but weakly developed, choose on_task (not partially_on_task) and explain that development is the issue.",
      "  - Clearly distinguish 'missing task element' from 'present but weakly developed task element'.",
      "  - Required check order: (1) list required task parts, (2) mark each part present/missing, (3) choose alignment label, (4) describe quality/development.",
      "- Grammar and punctuation classification rules:",
      "  - Put subject-verb agreement, verb tense, plural/singular noun, article, pronoun, word form, and grammatical sentence structure issues in grammar_fixes.",
      "  - Put commas, periods, apostrophes, quotation punctuation, capitalization conventions, and missing/incorrect punctuation marks in punctuation_fixes.",
      "  - Do not place grammar issues inside punctuation_fixes just because a corrected sentence also improves punctuation.",
      "  - If clear grammar issues exist, include them in grammar_fixes and do not claim there are no grammar fixes.",
      "  - If one sentence has both grammar and punctuation issues, classify by the core issue: grammar_fixes for grammar, punctuation_fixes for punctuation.",
      "  - Be conservative and accurate. Do not invent errors.",
      "- what_is_working should sound encouraging and specific, like a coach noticing real wins.",
      "- what_is_missing should sound constructive and revision-focused, not harsh.",
      "- In grammar_fixes issue text, use supportive wording like 'This sentence needs a small grammar fix.' when accurate.",
      "- In style_tone_feedback issue text, use natural coaching language (e.g., 'This part sounds a bit informal...').",
      "- next_move must be direct and actionable, starting naturally with 'Next, ...' when possible.",
      "- monthly_report_summary must be a short natural recap, not a checklist, and should avoid repeating the same strengths/weaknesses already listed.",
      "- If off-topic: explicitly state the response does not answer the assigned task yet.",
      "- If off-topic: do not over-praise irrelevant ideas. Briefly note language strengths only if they are real, then redirect to task content quickly.",
      "- If off-topic: make what_is_missing and next_move focus on fixing task mismatch first.",
      "- Do not give vague advice like 'be clearer' without naming exactly what to change.",
      "- Write like a smart writing coach texting a student: warm, direct, natural, and academic.",
      "- Use second person ('you') and avoid stiff phrasing such as 'The student wrote' or 'The response demonstrates'.",
      "- Prefer natural student-facing phrasing such as 'You were asked to...', 'In your answer, you...', 'You included...', and 'You could strengthen this by...'.",
      "- Avoid rubric-like labels in full sentences (for example, avoid 'This response demonstrates...'). Keep wording conversational and specific.",
      "- Be encouraging, but honest. Be clear before being polite.",
      "- Vary sentence openings and phrasing to avoid template feel and repetition.",
      "Keep tone supportive, smart, specific, natural, and revision-focused.",
    ].join("\n");
  }

  if (payload.mode === "plan_assist") {
    return [
      `Grade: ${grade}`,
      `Genre: ${genre}`,
      `Known weaknesses: ${JSON.stringify(payload.weaknesses ?? [])}`,
      `Current task/prompt: ${payload.promptText}`,
      "Return strict JSON only with keys:",
      "- focus: short weekly focus title",
      "- coaching_points: 2 or 3 plain-English weekly coaching points",
      "- drills: 2 realistic short practice ideas",
      "- checkpoints: 2 short success checks",
      "- rewritten_prompt: clearer, fuller version of the task prompt",
      "- daily_task: one short student-friendly task instruction",
      "Keep it grade-appropriate, natural, and non-technical.",
    ].join("\n");
  }

  return [
    `Grade: ${grade}`,
    `Genre: ${genre}`,
    `Current prompt: ${payload.promptText}`,
    "Return strict JSON only with key:",
    "- rewritten_prompt: rewrite the task so it is clearer and easier for a student to understand without changing the task itself",
    "Keep it natural, concise, and student-friendly.",
  ].join("\n");
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json(405, { error: "Method not allowed" });
  }

  const authHeader = req.headers.get("authorization");
  if (!authHeader) {
    return json(401, { error: "Missing authorization" });
  }

  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) {
    return json(401, { error: "Missing authorization token" });
  }

  const { data: authData, error: authError } = await supabase.auth.getUser(token);
  if (authError || !authData?.user) {
    return json(401, { error: "Unauthorized" });
  }

  const payload = (await req.json().catch(() => null)) as Payload | null;
  const payloadError = validatePayload(payload);
  if (payloadError) {
    return json(400, { error: payloadError });
  }

  // Authenticated students are allowed for all current modes.
  // Keep role lookup for future admin-only expansion, but do not block student-safe modes.
  await getUserRole(
    authData.user.id,
    authData.user.app_metadata?.role,
    authData.user.app_metadata?.is_admin,
  );

  const userPrompt = buildUserPrompt(payload!);

  try {
    const completion = await withTimeout(
      openai.chat.completions.create({
        model: "gpt-4o-mini",
        response_format: { type: "json_object" },
        temperature: 0.2,
        messages: [
          {
            role: "system",
            content:
              "You are an expert writing coach for Brains Heist students. Sound like a real human coach: supportive, direct, student-friendly, and academically credible. Always address the student as 'you'/'your'. Never use third-person framing like 'the student' or 'the response'. Be clear before polite. Avoid robotic rubric language and repetitive templates. Prioritize the most important truth first. If the answer is off-topic or misaligned, state that clearly and early, avoid over-praising irrelevant content, and redirect to the required task focus. Judge alignment in order: first coverage (which required parts are present/missing), then quality. If all required parts are present but weak, keep alignment on_task and explain the development gap; do not mark partially_on_task just for weak development. Keep grammar fixes and punctuation fixes strictly separated: grammar errors belong in grammar_fixes, punctuation/convention errors belong in punctuation_fixes. If a sentence has both issue types, classify each issue in the correct list and do not hide grammar issues in punctuation_fixes. Use evidence from the student's actual words with short snippets where useful. Never invent evidence, grammar mistakes, punctuation mistakes, or style issues. If uncertain, be conservative and name what is missing. Distinguish content/task issues, language issues, and style/tone issues clearly. Keep coaching language natural and actionable. Return strict JSON only. No markdown.",
          },
          {
            role: "user",
            content: userPrompt,
          },
        ],
      }),
      25000,
    );

    const content = completion.choices?.[0]?.message?.content;
    if (!content) {
      return json(502, { error: "No model response" });
    }

    const parsed = JSON.parse(content);
    const normalized = normalizeAiResult(payload!.mode, parsed);
    if (!normalized) {
      return json(502, { error: "Model response schema invalid" });
    }
    const normalizedWithFingerprint =
      payload!.mode === "feedback"
        ? {
            ...normalized,
            // Trust boundary: fingerprint must be derived from canonical request payload, never model output.
            text_fingerprint: buildDeterministicTextFingerprint(payload!.studentResponse ?? ""),
          }
        : normalized;

    const usage = completion.usage
      ? {
          prompt_tokens: completion.usage.prompt_tokens ?? null,
          completion_tokens: completion.usage.completion_tokens ?? null,
          total_tokens: completion.usage.total_tokens ?? null,
        }
      : null;
    const openAiRequestId =
      completion.id ??
      (typeof (completion as Record<string, unknown>)._request_id === "string"
        ? ((completion as Record<string, unknown>)._request_id as string)
        : null);

    console.info("[bh_writing_ai] completion metadata", {
      mode: payload!.mode,
      openai_request_id: openAiRequestId,
      usage,
    });

    return json(200, {
      mode: payload!.mode,
      result: normalizedWithFingerprint,
      meta: {
        openai_request_id: openAiRequestId,
        usage,
      },
    });
  } catch (error) {
    console.error("[bh_writing_ai] request failed", error);
    return json(502, {
      error: error instanceof Error ? error.message : "AI request failed",
    });
  }
});
