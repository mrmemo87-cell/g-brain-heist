import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.78.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY") || "";
const EXTRACTION_MODEL = Deno.env.get("OPENAI_QUESTION_EXTRACTION_MODEL") || "gpt-4.1-mini";
const SOURCE_BUCKET = "teacher-question-sources";
const MAX_FILE_BYTES = 6 * 1024 * 1024;
const MAX_PAGES = 60;
const MAX_QUESTIONS = 50;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  throw new Error("Missing required Supabase environment variables.");
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const jsonResponse = (status: number, data: unknown) => new Response(JSON.stringify(data), {
  status,
  headers: { "content-type": "application/json", ...corsHeaders },
});

const sha256Hex = async (value: Uint8Array | string) => {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value;
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
};

const bytesToBase64 = (bytes: Uint8Array) => {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
};

const parseBearerToken = (header: string | null) => {
  const match = header?.match(/^Bearer\s+(.+)$/i);
  return match?.[1] || null;
};

const cleanFileName = (value: unknown) => {
  if (typeof value !== "string") return "questions.pdf";
  const cleaned = value.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 255);
  return cleaned.toLowerCase().endsWith(".pdf") ? cleaned : `${cleaned || "questions"}.pdf`;
};

const approximatePageCount = (bytes: Uint8Array) => {
  const sample = new TextDecoder().decode(bytes);
  const count = sample.match(/\/Type\s*\/Page\b/g)?.length || 0;
  return count || null;
};

const extractResponseText = (payload: Record<string, unknown>) => {
  if (typeof payload.output_text === "string") return payload.output_text;
  const output = Array.isArray(payload.output) ? payload.output : [];
  for (const item of output) {
    if (!item || typeof item !== "object") continue;
    const content = Array.isArray((item as Record<string, unknown>).content)
      ? (item as Record<string, unknown>).content as unknown[]
      : [];
    for (const part of content) {
      if (!part || typeof part !== "object") continue;
      const record = part as Record<string, unknown>;
      if (record.type === "output_text" && typeof record.text === "string") return record.text;
    }
  }
  return null;
};

const AO_DEFINITIONS = {
  AO1: {
    name: "Knowledge and comprehension",
    definition: "Retrieve, recognize, identify, define, or understand explicit subject knowledge and information.",
    processes: new Set(["remember", "understand"]),
    fallback: "understand",
  },
  AO2: {
    name: "Application and procedure",
    definition: "Apply a rule, convention, method, algorithm, calculation, or classification in a familiar assessed context.",
    processes: new Set(["apply"]),
    fallback: "apply",
  },
  AO3: {
    name: "Analysis and interpretation",
    definition: "Connect evidence, infer, compare, explain, predict, interpret, or select a supported conclusion.",
    processes: new Set(["analyze"]),
    fallback: "analyze",
  },
  AO4: {
    name: "Evaluation and judgment",
    definition: "Judge credibility, validity, bias, limitations, trade-offs, or alternatives using explicit criteria and evidence.",
    processes: new Set(["evaluate"]),
    fallback: "evaluate",
  },
} as const;

const SUBJECTS = [
  "Maths", "Science", "Biology", "Chemistry", "Physics", "English",
  "Russian Language", "Kyrgyz Language", "German Language", "Geography",
  "Global Perspective", "Travel & Tourism", "ICT",
] as const;

const responseSchema = {
  type: "object",
  additionalProperties: false,
  required: ["document_title", "document_summary", "questions"],
  properties: {
    document_title: { type: "string" },
    document_summary: { type: "string" },
    questions: {
      type: "array",
      minItems: 1,
      maxItems: MAX_QUESTIONS,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "source_index", "source_page", "subject", "topic", "eligible_grade_levels",
          "difficulty", "question_type", "question_text", "options", "correct_answer",
          "explanation", "time_limit", "points", "taxonomy_proposal",
          "extraction_confidence", "needs_human_attention", "attention_reason", "visual_required",
        ],
        properties: {
          source_index: { type: "integer", minimum: 1, maximum: MAX_QUESTIONS },
          source_page: { type: ["integer", "null"], minimum: 1, maximum: MAX_PAGES },
          subject: { type: "string", enum: SUBJECTS },
          topic: { type: "string" },
          eligible_grade_levels: {
            type: "array",
            minItems: 1,
            maxItems: 12,
            items: { type: "integer", minimum: 1, maximum: 12 },
          },
          difficulty: { type: "string", enum: ["easy", "medium", "hard"] },
          question_type: { type: "string", enum: ["multiple_choice", "true_false", "short_answer"] },
          question_text: { type: "string" },
          options: { type: "array", maxItems: 6, items: { type: "string" } },
          correct_answer: { type: "string" },
          explanation: { type: "string" },
          time_limit: { type: "integer", minimum: 10, maximum: 1800 },
          points: { type: "integer", minimum: 1, maximum: 30 },
          taxonomy_proposal: {
            type: "object",
            additionalProperties: false,
            required: [
              "primary_skill_name", "atomic_subskill_name", "assessment_process_code",
              "assessment_process_name", "assessment_process_definition", "cognitive_process",
              "evidence_statement", "secondary_skill_names", "confidence_score", "review_reason",
            ],
            properties: {
              primary_skill_name: { type: "string" },
              atomic_subskill_name: { type: "string" },
              assessment_process_code: { type: "string", enum: ["AO1", "AO2", "AO3", "AO4"] },
              assessment_process_name: { type: "string" },
              assessment_process_definition: { type: "string" },
              cognitive_process: { type: "string", enum: ["remember", "understand", "apply", "analyze", "evaluate"] },
              evidence_statement: { type: "string" },
              secondary_skill_names: { type: "array", maxItems: 4, items: { type: "string" } },
              confidence_score: { type: "number", minimum: 0, maximum: 1 },
              review_reason: { type: "string" },
            },
          },
          extraction_confidence: { type: "number", minimum: 0, maximum: 1 },
          needs_human_attention: { type: "boolean" },
          attention_reason: { type: "string" },
          visual_required: { type: "boolean" },
        },
      },
    },
  },
};

const clamp = (value: unknown, minimum: number, maximum: number, fallback: number) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.min(maximum, Math.max(minimum, numeric)) : fallback;
};

const normalizeExtraction = (payload: Record<string, unknown>) => {
  const rawQuestions = Array.isArray(payload.questions) ? payload.questions.slice(0, MAX_QUESTIONS) : [];
  const questions = rawQuestions.map((value, index) => {
    const raw = value && typeof value === "object" ? value as Record<string, unknown> : {};
    const rawTaxonomy = raw.taxonomy_proposal && typeof raw.taxonomy_proposal === "object"
      ? raw.taxonomy_proposal as Record<string, unknown>
      : {};
    const ao = ["AO1", "AO2", "AO3", "AO4"].includes(String(rawTaxonomy.assessment_process_code))
      ? String(rawTaxonomy.assessment_process_code) as keyof typeof AO_DEFINITIONS
      : "AO1";
    const aoDefinition = AO_DEFINITIONS[ao];
    const requestedProcess = String(rawTaxonomy.cognitive_process || "").toLowerCase();
    const cognitiveProcess = aoDefinition.processes.has(requestedProcess as never)
      ? requestedProcess
      : aoDefinition.fallback;
    const questionType = ["multiple_choice", "true_false", "short_answer"].includes(String(raw.question_type))
      ? String(raw.question_type)
      : "short_answer";
    let options = Array.isArray(raw.options)
      ? raw.options.map((option) => String(option).trim()).filter(Boolean).slice(0, 6)
      : [];
    if (questionType === "true_false") options = ["True", "False"];
    if (questionType === "short_answer") options = [];
    const grades = [...new Set((Array.isArray(raw.eligible_grade_levels) ? raw.eligible_grade_levels : [])
      .map(Number)
      .filter((grade) => Number.isInteger(grade) && grade >= 1 && grade <= 12))].sort((a, b) => a - b);
    const visualRequired = raw.visual_required === true;
    const correctAnswer = String(raw.correct_answer || "").trim();
    const questionText = String(raw.question_text || "").trim();
    const hasAnswerIssue = !correctAnswer || (questionType === "multiple_choice"
      && !options.some((option) => option.toLowerCase() === correctAnswer.toLowerCase()));
    const needsAttention = raw.needs_human_attention === true
      || visualRequired
      || hasAnswerIssue
      || !questionText
      || grades.length === 0;

    return {
      source_index: index + 1,
      source_page: Number.isInteger(Number(raw.source_page))
        ? Math.min(MAX_PAGES, Math.max(1, Number(raw.source_page)))
        : null,
      subject: SUBJECTS.includes(raw.subject as typeof SUBJECTS[number]) ? raw.subject : "Science",
      topic: String(raw.topic || "General").trim().slice(0, 160) || "General",
      eligible_grade_levels: grades,
      difficulty: ["easy", "medium", "hard"].includes(String(raw.difficulty)) ? raw.difficulty : "medium",
      question_type: questionType,
      question_text: questionText.slice(0, 4000),
      options,
      correct_answer: correctAnswer.slice(0, 2000),
      explanation: String(raw.explanation || "").trim().slice(0, 5000),
      time_limit: Math.round(clamp(raw.time_limit, 10, 1800, 30)),
      points: Math.round(clamp(raw.points, 1, 30, raw.difficulty === "hard" ? 20 : raw.difficulty === "medium" ? 15 : 10)),
      taxonomy_proposal: {
        primary_skill_name: String(rawTaxonomy.primary_skill_name || "Needs professional classification").trim().slice(0, 160),
        atomic_subskill_name: String(rawTaxonomy.atomic_subskill_name || "Needs professional classification").trim().slice(0, 200),
        assessment_process_code: ao,
        assessment_process_name: aoDefinition.name,
        assessment_process_definition: aoDefinition.definition,
        cognitive_process: cognitiveProcess,
        evidence_statement: String(rawTaxonomy.evidence_statement || `A correct response provides evidence for the skill assessed by question ${index + 1}.`).trim().slice(0, 500),
        secondary_skill_names: [...new Set((Array.isArray(rawTaxonomy.secondary_skill_names) ? rawTaxonomy.secondary_skill_names : [])
          .map((skill) => String(skill).trim()).filter(Boolean))].slice(0, 4),
        confidence_score: clamp(rawTaxonomy.confidence_score, 0, 1, 0),
        review_reason: String(rawTaxonomy.review_reason || "AI-assisted proposal requires human review before governance approval.").trim().slice(0, 1000),
      },
      extraction_confidence: clamp(raw.extraction_confidence, 0, 1, 0),
      needs_human_attention: needsAttention,
      attention_reason: visualRequired
        ? "This item depends on a diagram or image. Rewrite it as self-contained text or remove it before submission."
        : hasAnswerIssue
          ? "Confirm the answer and answer options against the source PDF."
          : String(raw.attention_reason || "").trim().slice(0, 500),
      visual_required: visualRequired,
    };
  });

  return {
    document_title: String(payload.document_title || "Question paper").trim().slice(0, 240),
    document_summary: String(payload.document_summary || "Questions extracted for teacher review.").trim().slice(0, 1000),
    questions,
  };
};

serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return jsonResponse(405, { error: "Method not allowed." });

  try {
    const token = parseBearerToken(request.headers.get("authorization"));
    if (!token) return jsonResponse(401, { error: "Sign in again before uploading a question paper." });

    const { data: authData, error: authError } = await admin.auth.getUser(token);
    if (authError || !authData.user) return jsonResponse(401, { error: "Your session could not be verified." });
    const userId = authData.user.id;

    const body = await request.json().catch(() => null) as {
      objectPath?: unknown;
      fileName?: unknown;
      preferredSubject?: unknown;
      preferredTopic?: unknown;
    } | null;
    const objectPath = typeof body?.objectPath === "string" ? body.objectPath.trim() : "";
    const expectedPrefix = `${userId}/`;
    if (!objectPath.startsWith(expectedPrefix) || !objectPath.toLowerCase().endsWith(".pdf") || objectPath.length > 700) {
      return jsonResponse(400, { error: "The uploaded PDF path is invalid." });
    }

    const { data: teacher, error: teacherError } = await admin
      .from("teachers")
      .select("id, user_id")
      .eq("user_id", userId)
      .maybeSingle();
    if (teacherError || !teacher) return jsonResponse(403, { error: "A teacher profile is required." });

    const { data: userProfile } = await admin.from("users").select("school_id").eq("id", userId).maybeSingle();
    let schoolId = userProfile?.school_id || null;
    if (!schoolId) {
      const { data: membership } = await admin
        .from("school_members")
        .select("school_id")
        .eq("user_id", userId)
        .eq("status", "active")
        .order("joined_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      schoolId = membership?.school_id || null;
    }

    const { data: existing } = await admin
      .from("teacher_question_pdf_extractions")
      .select("id, extraction_payload, extraction_model, source_file_sha256, source_file_size, detected_page_count")
      .eq("teacher_user_id", userId)
      .eq("source_object_path", objectPath)
      .maybeSingle();
    if (existing) {
      return jsonResponse(200, {
        success: true,
        extractionId: existing.id,
        model: existing.extraction_model,
        sourceSha256: existing.source_file_sha256,
        sourceFileSize: existing.source_file_size,
        detectedPageCount: existing.detected_page_count,
        ...existing.extraction_payload,
      });
    }

    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count: recentCount } = await admin
      .from("teacher_question_pdf_extractions")
      .select("id", { count: "exact", head: true })
      .eq("teacher_id", teacher.id)
      .gte("completed_at", oneHourAgo);
    if ((recentCount || 0) >= 8) {
      return jsonResponse(429, { error: "You have reached the safe extraction limit for this hour. Please try again shortly." });
    }

    const { data: sourceBlob, error: downloadError } = await admin.storage.from(SOURCE_BUCKET).download(objectPath);
    if (downloadError || !sourceBlob) return jsonResponse(404, { error: "The uploaded PDF could not be read." });
    if (sourceBlob.size < 5 || sourceBlob.size > MAX_FILE_BYTES) {
      return jsonResponse(400, { error: "Use a PDF no larger than 6 MB." });
    }

    const bytes = new Uint8Array(await sourceBlob.arrayBuffer());
    const signature = new TextDecoder().decode(bytes.subarray(0, 5));
    if (signature !== "%PDF-") return jsonResponse(400, { error: "This file is not a valid PDF." });
    const pageCount = approximatePageCount(bytes);
    if (pageCount && pageCount > MAX_PAGES) {
      return jsonResponse(400, { error: `Use a PDF with ${MAX_PAGES} pages or fewer.` });
    }
    if (!OPENAI_API_KEY) return jsonResponse(503, { error: "PDF question extraction is not configured yet." });

    const preferredSubject = SUBJECTS.includes(body?.preferredSubject as typeof SUBJECTS[number])
      ? String(body?.preferredSubject)
      : "not supplied";
    const preferredTopic = typeof body?.preferredTopic === "string" && body.preferredTopic.trim()
      ? body.preferredTopic.trim().slice(0, 160)
      : "not supplied";

    const instructions = [
      "You are an expert assessment editor extracting classroom questions from a teacher-supplied PDF.",
      "Preserve the source meaning and exact mathematical/scientific notation. Never invent a missing answer, diagram, option, or fact.",
      "Extract only genuine student-facing questions, not headers, worked examples, instructions, page furniture, or answer-key commentary.",
      "Pair each question with its answer from the source when an answer key is present. If the answer is absent or ambiguous, leave correct_answer empty and set needs_human_attention true.",
      "For multiple-choice questions, keep 2-6 unique options and make correct_answer exactly equal to one option.",
      "If a question relies on a diagram, graph, image, map, table, or layout that cannot be represented in the text, set visual_required and needs_human_attention true. Do not guess the visual content.",
      "Infer the narrowest defensible primary skill and one atomic observable subskill. Do not use vague labels such as General Knowledge, Problem Solving, or Understanding.",
      "Choose exactly one Brains Heist assessment process: AO1 knowledge/comprehension, AO2 application/procedure, AO3 analysis/interpretation, or AO4 evaluation/judgment.",
      "The cognitive process must align: AO1=remember/understand, AO2=apply, AO3=analyze, AO4=evaluate.",
      "Write an evidence statement describing only what a correct response would actually demonstrate. Treat every taxonomy field as an AI proposal requiring human governance.",
      `Return at most ${MAX_QUESTIONS} questions. If the source contains more, extract the first ${MAX_QUESTIONS} in source order and explain the limit in document_summary.`,
    ].join("\n");

    const aiResponse = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "authorization": `Bearer ${OPENAI_API_KEY}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: EXTRACTION_MODEL,
        store: false,
        instructions,
        input: [{
          role: "user",
          content: [
            {
              type: "input_text",
              text: `Extract and classify this question paper. Teacher context — preferred subject: ${preferredSubject}; preferred topic: ${preferredTopic}. Use these only when supported by the PDF.`,
            },
            {
              type: "input_file",
              filename: cleanFileName(body?.fileName),
              file_data: bytesToBase64(bytes),
            },
          ],
        }],
        text: {
          format: {
            type: "json_schema",
            name: "teacher_question_batch",
            description: "Teacher-reviewable question extraction with proposed diagnostic taxonomy.",
            strict: true,
            schema: responseSchema,
          },
        },
        max_output_tokens: 20000,
      }),
    });

    const aiBody = await aiResponse.json().catch(() => ({})) as Record<string, unknown>;
    if (!aiResponse.ok) {
      console.error("teacher_question_pdf_extract provider error", aiResponse.status, aiBody.error);
      return jsonResponse(502, { error: "The PDF could not be analysed right now. Your file is safe; please try again." });
    }

    const outputText = extractResponseText(aiBody);
    if (!outputText) return jsonResponse(422, { error: "No questions could be read from this PDF." });
    const parsed = JSON.parse(outputText) as Record<string, unknown>;
    const extraction = normalizeExtraction(parsed);
    if (!extraction.questions.length) return jsonResponse(422, { error: "No usable questions were found in this PDF." });

    const extractionJson = JSON.stringify(extraction);
    const sourceHash = await sha256Hex(bytes);
    const payloadHash = await sha256Hex(extractionJson);
    const { data: stored, error: storeError } = await admin
      .from("teacher_question_pdf_extractions")
      .insert({
        teacher_id: teacher.id,
        teacher_user_id: userId,
        school_id: schoolId,
        source_bucket: SOURCE_BUCKET,
        source_object_path: objectPath,
        source_file_name: cleanFileName(body?.fileName),
        source_file_sha256: sourceHash,
        source_file_size: bytes.length,
        detected_page_count: pageCount,
        extraction_model: EXTRACTION_MODEL,
        extraction_schema_version: 1,
        extracted_question_count: extraction.questions.length,
        extraction_payload: extraction,
        extraction_payload_sha256: payloadHash,
      })
      .select("id")
      .single();
    if (storeError || !stored) {
      console.error("teacher_question_pdf_extract provenance error", storeError?.message);
      return jsonResponse(500, { error: "The extraction finished but could not be secured for review. Please try again." });
    }

    return jsonResponse(200, {
      success: true,
      extractionId: stored.id,
      model: EXTRACTION_MODEL,
      sourceSha256: sourceHash,
      sourceFileSize: bytes.length,
      detectedPageCount: pageCount,
      ...extraction,
    });
  } catch (error) {
    console.error("teacher_question_pdf_extract failed", error instanceof Error ? error.message : "unknown_error");
    return jsonResponse(500, { error: "The PDF could not be processed safely. Please try again." });
  }
});
