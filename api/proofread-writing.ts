export const config = {
  runtime: 'edge',
};

interface ProofreadRequest {
  part1: {
    text: string;
    task: string;
    wordTarget: string;
  };
  part2: {
    text: string;
    task: string;
    wordTarget: string;
  };
  markingCriteria: {
    part1: string[];
    part2: string[];
  };
}

interface PartFeedback {
  feedback: string;
  correctedVersion: string;
  suggestedMarks: Record<string, number>;
}

// Simple rule-based proofreading (fallback)
function simpleProofread(text: string, wordTarget: string, isPart1: boolean): PartFeedback {
  const words = text.trim().split(/\s+/).filter(w => w.length > 0);
  const wordCount = words.length;
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
  
  const issues: string[] = [];
  const suggestions: string[] = [];
  
  const targetMatch = wordTarget.match(/(\d+)-(\d+)/);
  if (targetMatch) {
    const [, min, max] = targetMatch;
    if (wordCount < parseInt(min)) {
      issues.push(`⚠️ Word count (${wordCount}) is below the target (${wordTarget}). Add more detail.`);
    } else if (wordCount > parseInt(max)) {
      issues.push(`⚠️ Word count (${wordCount}) exceeds the target (${wordTarget}). Try to be more concise.`);
    } else {
      suggestions.push(`✓ Word count (${wordCount}) is within the target range.`);
    }
  }
  
  const commonErrors: [RegExp, string][] = [
    [/\bi\b(?![''])/g, "Capitalize 'I'"],
    [/becouse|beacuse|becuase/gi, "Spelling: 'because'"],
    [/definately|defintely/gi, "Spelling: 'definitely'"],
    [/alot\b/gi, "Should be 'a lot'"],
    [/dont\b/gi, "Should be 'don't'"],
    [/cant\b/gi, "Should be 'can't'"],
    [/wont\b/gi, "Should be 'won't'"],
  ];
  
  const foundErrors: string[] = [];
  commonErrors.forEach(([pattern, message]) => {
    if (pattern.test(text)) foundErrors.push(`• ${message}`);
  });
  
  if (foundErrors.length > 0) {
    issues.push('🔴 Issues found:\n' + foundErrors.join('\n'));
  }
  
  let corrected = text
    .replace(/\bi\b(?![''])/g, 'I')
    .replace(/becouse|beacuse|becuase/gi, 'because')
    .replace(/alot\b/gi, 'a lot')
    .replace(/dont\b/gi, "don't")
    .replace(/cant\b/gi, "can't")
    .trim();
  
  if (corrected.length > 0) {
    corrected = corrected[0].toUpperCase() + corrected.slice(1);
  }
  
  let contentScore = 4, organisationScore = 4, languageScore = 4;
  if (wordCount < (isPart1 ? 30 : 80)) contentScore = 2;
  if (foundErrors.length > 3) languageScore = 2;
  if (sentences.length < 3) organisationScore = 3;
  
  return {
    feedback: [...issues, '', '💡 Suggestions:', ...suggestions].filter(Boolean).join('\n'),
    correctedVersion: corrected,
    suggestedMarks: isPart1 
      ? { content: contentScore, organisation: organisationScore, language: languageScore }
      : { content: contentScore, communicativeAchievement: organisationScore, organisation: organisationScore, language: languageScore },
  };
}

// AI-powered proofreading with OpenAI
async function aiProofread(
  text: string, 
  task: string, 
  wordTarget: string, 
  criteria: string[],
  isPart1: boolean,
  apiKey: string
): Promise<PartFeedback> {
  const prompt = `You are an expert English teacher marking a Cambridge ESL writing test for Stage 9 students (ages 13-14).

TASK: ${task}
WORD TARGET: ${wordTarget}
MARKING CRITERIA: ${criteria.join(', ')}

STUDENT'S WRITING:
"""
${text}
"""

Provide detailed feedback. Format as JSON:
{
  "feedback": "Detailed comments about errors, strengths, and improvements needed...",
  "correctedVersion": "The student's text with all errors corrected...",
  "suggestedMarks": {
    ${isPart1 
      ? '"content": 0, "organisation": 0, "language": 0' 
      : '"content": 0, "communicativeAchievement": 0, "organisation": 0, "language": 0'}
  }
}

Each mark should be 0-5. Be encouraging but thorough.`;

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'You are an expert English teacher. Always respond with valid JSON only.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.7,
      max_tokens: 2000,
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI API error: ${response.status}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || '';
  
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    const parsed = JSON.parse(jsonMatch[0]);
    return {
      feedback: parsed.feedback || '',
      correctedVersion: parsed.correctedVersion || '',
      suggestedMarks: parsed.suggestedMarks || {},
    };
  }
  
  throw new Error('Could not parse AI response');
}

export default async function handler(request: Request) {
  // Handle CORS
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }

  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const body: ProofreadRequest = await request.json();
    const { part1, part2, markingCriteria } = body;
    
    const apiKey = process.env.OPENAI_API_KEY || '';
    const useAI = apiKey.length > 10;
    
    const response: { part1?: PartFeedback; part2?: PartFeedback; overallComments?: string } = {};
    
    // Process Part 1
    if (part1?.text?.trim()) {
      try {
        if (useAI) {
          response.part1 = await aiProofread(part1.text, part1.task, part1.wordTarget, markingCriteria.part1, true, apiKey);
        } else {
          response.part1 = simpleProofread(part1.text, part1.wordTarget, true);
        }
      } catch (e) {
        response.part1 = simpleProofread(part1.text, part1.wordTarget, true);
      }
    }
    
    // Process Part 2
    if (part2?.text?.trim()) {
      try {
        if (useAI) {
          response.part2 = await aiProofread(part2.text, part2.task, part2.wordTarget, markingCriteria.part2, false, apiKey);
        } else {
          response.part2 = simpleProofread(part2.text, part2.wordTarget, false);
        }
      } catch (e) {
        response.part2 = simpleProofread(part2.text, part2.wordTarget, false);
      }
    }
    
    // Overall comments
    const p1Marks = response.part1?.suggestedMarks || {};
    const p2Marks = response.part2?.suggestedMarks || {};
    const total = Object.values(p1Marks).reduce((a, b) => a + b, 0) + Object.values(p2Marks).reduce((a, b) => a + b, 0);
    const percentage = Math.round((total / 35) * 100);
    
    response.overallComments = percentage >= 70 
      ? '🌟 Great work! Keep it up!' 
      : percentage >= 50 
        ? '📈 Good progress! Focus on the feedback to improve.' 
        : '💪 Keep practising! Review the corrections carefully.';
    
    return new Response(JSON.stringify(response), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
    
  } catch (error) {
    console.error('Proofreading error:', error);
    return new Response(JSON.stringify({ error: 'Failed to process' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
