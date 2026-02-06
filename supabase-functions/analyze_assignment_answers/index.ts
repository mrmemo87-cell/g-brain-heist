import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // Handle CORS
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Parse request
    const { assignmentId, studentId } = await req.json();

    if (!assignmentId || !studentId) {
      return new Response(
        JSON.stringify({ error: "Missing assignmentId or studentId" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch student answers for the assignment
    const { data: answers, error: answersError } = await supabase
      .from("student_assignment_answers")
      .select(
        `
        *,
        question:questions(question_text, correct_answer, topic_name)
        `
      )
      .eq("assignment_id", assignmentId)
      .eq("student_id", studentId);

    if (answersError) throw answersError;

    if (!answers || answers.length === 0) {
      return new Response(
        JSON.stringify({ error: "No answers found for this student and assignment" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Prepare data for OpenAI analysis
    const answerSummary = answers.map((answer) => ({
      question: answer.question?.question_text || "Unknown question",
      correctAnswer: answer.question?.correct_answer || "Unknown",
      studentAnswer: answer.student_answer,
      isCorrect: answer.is_correct,
      topic: answer.question?.topic_name || "Unknown topic",
    }));

    // Get OpenAI API key
    const openaiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openaiKey) {
      throw new Error("OPENAI_API_KEY not configured");
    }

    // Call OpenAI to analyze
    const analysisPrompt = `
You are an expert educational analyst. Analyze this student's assignment answers and provide a detailed assessment.

Student Answers:
${JSON.stringify(answerSummary, null, 2)}

Based on these answers, provide:
1. **Strengths** - List 2-3 specific areas where the student performed well or showed good understanding
2. **Areas for Improvement** - List 2-3 specific topics or skills they should focus on based on mistakes
3. **Recommendations** - Provide 3-4 specific, actionable recommendations for the student to improve
4. **Overall Assessment** - A 2-3 sentence summary of their performance level
5. **Topics Breakdown** - For each topic covered in the answers, rate their performance (Excellent/Good/Fair/Needs Work) and why

Format your response as a JSON object with these exact keys: strengths, improvements, recommendations, overallAssessment, topicsBreakdown

Make it encouraging, constructive, and specific to their answers. Use data from their actual responses to justify your feedback.
`;

    const analysisResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${openaiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content:
              "You are an expert educational tutor and assessment specialist. Provide detailed, constructive, and data-driven feedback on student assignments.",
          },
          {
            role: "user",
            content: analysisPrompt,
          },
        ],
        temperature: 0.7,
        max_tokens: 1500,
      }),
    });

    const analysisData = await analysisResponse.json();

    if (!analysisResponse.ok) {
      console.error("OpenAI API error:", analysisData);
      throw new Error(`OpenAI API error: ${analysisData.error?.message || "Unknown error"}`);
    }

    // Extract the response
    const analysisText = analysisData.choices[0]?.message?.content;
    if (!analysisText) {
      throw new Error("No analysis content returned from OpenAI");
    }

    // Parse JSON response
    let analysis;
    try {
      // Try to extract JSON from the response
      const jsonMatch = analysisText.match(/\{[\s\S]*\}/);
      analysis = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(analysisText);
    } catch (e) {
      // If JSON parsing fails, return the raw text
      analysis = {
        overallAssessment: analysisText,
        strengths: [],
        improvements: [],
        recommendations: [],
        topicsBreakdown: {},
      };
    }

    // Store analysis in database
    const { data: storedAnalysis, error: storeError } = await supabase
      .from("student_assignment_analyses")
      .upsert(
        {
          assignment_id: assignmentId,
          student_id: studentId,
          analysis: analysis,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "assignment_id,student_id" }
      );

    if (storeError) {
      console.error("Error storing analysis:", storeError);
      // Still return the analysis even if storage fails
    }

    return new Response(JSON.stringify({ analysis, answerCount: answers.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    console.error("Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
