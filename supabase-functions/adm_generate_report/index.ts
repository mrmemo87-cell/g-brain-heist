import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Edge Function: adm_generate_report
 * 
 * This function grades writing tasks using OpenAI and generates a personalized
 * AI report for admission test candidates.
 * 
 * Input: { attempt_id: string }
 * Output: { ai_summary: string, answers: [...updated answers with ai_feedback] }
 */

serve(async (req) => {
  // Handle CORS
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { attempt_id } = await req.json();

    if (!attempt_id) {
      return new Response(
        JSON.stringify({ error: "Missing attempt_id" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Initialize Supabase client with service role
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch attempt with candidate info
    const { data: attempt, error: attemptError } = await supabase
      .from('adm_attempts')
      .select(`
        *,
        candidate:adm_candidates(*),
        form:adm_test_forms(form_code, blueprint:adm_blueprints(*))
      `)
      .eq('id', attempt_id)
      .single();

    if (attemptError || !attempt) {
      return new Response(
        JSON.stringify({ error: "Attempt not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch all answers with questions
    const { data: answers, error: answersError } = await supabase
      .from('adm_answers')
      .select(`
        *,
        question:adm_questions(*)
      `)
      .eq('attempt_id', attempt_id);

    if (answersError) throw answersError;

    // Get OpenAI API key
    const openaiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openaiKey) {
      return new Response(
        JSON.stringify({ error: "OPENAI_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Separate writing tasks from other questions
    const writingAnswers = answers?.filter(a => 
      a.question?.question_type === 'email_writing' || 
      a.question?.question_type === 'essay_writing'
    ) || [];

    const otherAnswers = answers?.filter(a => 
      a.question?.question_type !== 'email_writing' && 
      a.question?.question_type !== 'essay_writing'
    ) || [];

    // Grade writing tasks with OpenAI
    const gradedWriting: any[] = [];
    let totalWritingMarks = 0;
    let totalWritingMax = 0;

    for (const wa of writingAnswers) {
      const q = wa.question;
      const text = typeof wa.response === 'object' ? wa.response?.text : wa.response;
      
      if (!text || text.trim().length < 20) {
        // Too short to grade
        gradedWriting.push({
          ...wa,
          ai_feedback: "Response too short to evaluate.",
          marks_awarded: 0,
        });
        totalWritingMax += wa.marks_possible;
        continue;
      }

      const isEmail = q.question_type === 'email_writing';
      const gradingPrompt = `
You are an expert Cambridge English examiner grading a ${isEmail ? 'email writing' : 'essay writing'} task for a school admission test.

**Task prompt given to student:**
${q.stem}

**Student's response:**
${text}

**Marking criteria (out of ${wa.marks_possible} marks):**
- Content & Task Achievement (40%): Does it address all parts of the task?
- Organization (20%): Is it well-structured with clear paragraphs?
- Language (30%): Vocabulary, grammar, and accuracy
- Communicative Achievement (10%): Is the register and tone appropriate?

Evaluate the response and provide:
1. A score out of ${wa.marks_possible} marks (be fair but rigorous)
2. Brief constructive feedback (2-3 sentences max)

Respond in JSON format:
{"score": <number>, "feedback": "<string>"}
`;

      try {
        const gradeResponse = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${openaiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "gpt-4o-mini",
            messages: [
              { role: "system", content: "You are a strict but fair examiner. Return only valid JSON." },
              { role: "user", content: gradingPrompt }
            ],
            temperature: 0.3,
            max_tokens: 300,
          }),
        });

        const gradeData = await gradeResponse.json();
        const gradeText = gradeData.choices?.[0]?.message?.content || '{}';
        
        // Parse JSON from response
        const gradeJson = JSON.parse(gradeText.replace(/```json\n?|\n?```/g, '').trim());
        const score = Math.min(Math.max(0, gradeJson.score || 0), wa.marks_possible);
        
        gradedWriting.push({
          ...wa,
          ai_feedback: gradeJson.feedback || "Evaluated by AI.",
          marks_awarded: score,
        });
        
        totalWritingMarks += score;
        totalWritingMax += wa.marks_possible;

        // Update the answer in DB
        await supabase
          .from('adm_answers')
          .update({ 
            marks_awarded: score, 
            is_correct: score >= wa.marks_possible * 0.5,
          })
          .eq('id', wa.id);

      } catch (e) {
        console.error("Writing grading error:", e);
        gradedWriting.push({
          ...wa,
          ai_feedback: "AI grading temporarily unavailable.",
          marks_awarded: 0,
        });
        totalWritingMax += wa.marks_possible;
      }
    }

    // Calculate updated totals
    const otherScore = otherAnswers.reduce((sum, a) => sum + (a.marks_awarded || 0), 0);
    const otherMax = otherAnswers.reduce((sum, a) => sum + (a.marks_possible || 0), 0);
    const newTotalScore = otherScore + totalWritingMarks;
    const newMaxScore = otherMax + totalWritingMax;
    const newPercentage = newMaxScore > 0 ? Math.round((newTotalScore / newMaxScore) * 100 * 100) / 100 : 0;

    // Update attempt with new scores
    await supabase
      .from('adm_attempts')
      .update({
        total_score: newTotalScore,
        max_score: newMaxScore,
        percentage: newPercentage,
      })
      .eq('id', attempt_id);

    // Generate personalized AI report
    const candidateName = attempt.candidate?.full_name || "Candidate";
    const appliedGrade = attempt.candidate?.applied_grade || "unknown";

    const answerSummary = [...gradedWriting, ...otherAnswers].map(a => ({
      type: a.question?.question_type,
      topic: a.question?.topic,
      isCorrect: a.is_correct,
      marksAwarded: a.marks_awarded,
      marksPossible: a.marks_possible,
      hasWritingFeedback: !!a.ai_feedback,
    }));

    const strongTopics = [...new Set(answerSummary.filter(a => a.isCorrect).map(a => a.topic))];
    const weakTopics = [...new Set(answerSummary.filter(a => !a.isCorrect && a.topic).map(a => a.topic))];

    const reportPrompt = `
You are an educational consultant writing a brief but insightful admission assessment for a school.

**Candidate:** ${candidateName}
**Applied Grade:** ${appliedGrade}
**Test Performance:** ${newTotalScore}/${newMaxScore} (${newPercentage}%)

**Answer Summary:**
${JSON.stringify(answerSummary, null, 2)}

**Strong topics:** ${strongTopics.join(', ') || 'None identified'}
**Weak topics:** ${weakTopics.join(', ') || 'None identified'}

Write a personalized 3-4 paragraph assessment report that:
1. Summarizes overall performance with specific observations
2. Highlights strengths with examples from their answers
3. Identifies areas needing development
4. Provides a recommendation regarding admission readiness

Keep the tone professional, encouraging, and constructive. Be specific and data-driven.
Write in third person (use "${candidateName}" or "the candidate").
`;

    const reportResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${openaiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: "You are an experienced school admission assessor. Write clear, professional reports." },
          { role: "user", content: reportPrompt }
        ],
        temperature: 0.7,
        max_tokens: 800,
      }),
    });

    const reportData = await reportResponse.json();
    const aiSummary = reportData.choices?.[0]?.message?.content || "AI report generation failed.";

    // Prepare final response
    const updatedAnswers = [...gradedWriting, ...otherAnswers].map(a => ({
      question_id: a.question_id,
      question_type: a.question?.question_type,
      stem: a.question?.stem,
      topic: a.question?.topic,
      response: a.response,
      correct_answer: a.question?.correct_answer,
      is_correct: a.is_correct,
      marks_awarded: a.marks_awarded || 0,
      marks_possible: a.marks_possible || 0,
      explanation: a.question?.explanation,
      ai_feedback: a.ai_feedback || null,
    }));

    // Log to audit
    await supabase
      .from('adm_audit_log')
      .insert({
        school_id: attempt.school_id,
        action: 'ai_report_generated',
        target_type: 'attempt',
        target_id: attempt_id,
        details: { 
          candidate: candidateName,
          writing_tasks_graded: gradedWriting.length,
          new_percentage: newPercentage,
        },
      });

    return new Response(
      JSON.stringify({
        success: true,
        ai_summary: aiSummary,
        answers: updatedAnswers,
        updated_score: {
          total_score: newTotalScore,
          max_score: newMaxScore,
          percentage: newPercentage,
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err: any) {
    console.error("Edge function error:", err);
    return new Response(
      JSON.stringify({ error: err.message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
