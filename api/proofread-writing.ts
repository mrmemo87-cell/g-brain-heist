// Vercel Serverless Function for AI Writing Proofreading
// Types for Vercel
interface VercelRequest {
  method?: string;
  body?: any;
}

interface VercelResponse {
  status: (code: number) => VercelResponse;
  json: (data: any) => void;
}

// Types for the request/response
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

interface ProofreadResponse {
  part1?: PartFeedback;
  part2?: PartFeedback;
  overallComments?: string;
}

// Simple rule-based proofreading (fallback when no API key)
function simpleProofread(text: string, task: string, wordTarget: string, isPart1: boolean): PartFeedback {
  const words = text.trim().split(/\s+/).filter(w => w.length > 0);
  const wordCount = words.length;
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
  
  const issues: string[] = [];
  const suggestions: string[] = [];
  
  // Check word count
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
  
  // Check for common errors
  const commonErrors: [RegExp, string][] = [
    [/\bi\b(?![''])/g, "Capitalize 'I' when referring to yourself"],
    [/\s+,/g, "Remove space before comma"],
    [/,(?!\s)/g, "Add space after comma"],
    [/\s+\./g, "Remove space before period"],
    [/\.(?!\s|$)/g, "Add space after period"],
    [/\s{2,}/g, "Remove extra spaces"],
    [/becouse|beacuse|becuase/gi, "Spelling: 'because'"],
    [/definately|defintely/gi, "Spelling: 'definitely'"],
    [/intresting|intersting/gi, "Spelling: 'interesting'"],
    [/realy|reallly/gi, "Spelling: 'really'"],
    [/beautifull|beatiful/gi, "Spelling: 'beautiful'"],
    [/alot\b/gi, "Should be 'a lot' (two words)"],
    [/dont\b/gi, "Should be 'don't'"],
    [/cant\b/gi, "Should be 'can't'"],
    [/wont\b/gi, "Should be 'won't'"],
    [/didnt\b/gi, "Should be 'didn't'"],
    [/isnt\b/gi, "Should be 'isn't'"],
    [/arent\b/gi, "Should be 'aren't'"],
    [/your\s+(going|doing|making|coming|leaving)/gi, "Should be 'you're' (you are)"],
    [/there\s+(going|doing|making|coming|leaving)/gi, "Should be 'they're' (they are)"],
    [/its\s+(a\s+)?(good|great|nice|bad|important)/gi, "Should be 'it's' (it is)"],
  ];
  
  const foundErrors: string[] = [];
  commonErrors.forEach(([pattern, message]) => {
    if (pattern.test(text)) {
      foundErrors.push(`• ${message}`);
    }
  });
  
  if (foundErrors.length > 0) {
    issues.push('🔴 Grammar/Spelling issues found:\n' + foundErrors.join('\n'));
  }
  
  // Check sentence structure
  if (sentences.length < 2) {
    issues.push('⚠️ Try to write more complete sentences.');
  }
  
  // Check for paragraph structure (Part 2 only)
  if (!isPart1 && !text.includes('\n') && wordCount > 50) {
    suggestions.push('💡 Consider breaking your essay into paragraphs for better organisation.');
  }
  
  // Check if starts with capital
  if (text.length > 0 && text[0] !== text[0].toUpperCase()) {
    issues.push('⚠️ Start your writing with a capital letter.');
  }
  
  // Generate corrected version (basic fixes)
  let corrected = text
    .replace(/\bi\b(?![''])/g, 'I')
    .replace(/\s+,/g, ',')
    .replace(/,(?!\s)/g, ', ')
    .replace(/\s+\./g, '.')
    .replace(/\.(?!\s|$)/g, '. ')
    .replace(/\s{2,}/g, ' ')
    .replace(/becouse|beacuse|becuase/gi, 'because')
    .replace(/definately|defintely/gi, 'definitely')
    .replace(/intresting|intersting/gi, 'interesting')
    .replace(/realy|reallly/gi, 'really')
    .replace(/beautifull|beatiful/gi, 'beautiful')
    .replace(/alot\b/gi, 'a lot')
    .replace(/dont\b/gi, "don't")
    .replace(/cant\b/gi, "can't")
    .replace(/wont\b/gi, "won't")
    .replace(/didnt\b/gi, "didn't")
    .replace(/isnt\b/gi, "isn't")
    .replace(/arent\b/gi, "aren't")
    .trim();
  
  // Capitalize first letter
  if (corrected.length > 0) {
    corrected = corrected[0].toUpperCase() + corrected.slice(1);
  }
  
  // Calculate suggested marks based on issues
  let contentScore = 4;
  let organisationScore = 4;
  let languageScore = 4;
  
  // Reduce scores based on issues
  if (wordCount < (isPart1 ? 30 : 80)) {
    contentScore = Math.max(1, contentScore - 2);
  } else if (wordCount < (isPart1 ? 40 : 100)) {
    contentScore = Math.max(2, contentScore - 1);
  }
  
  if (foundErrors.length > 5) {
    languageScore = Math.max(1, languageScore - 2);
  } else if (foundErrors.length > 2) {
    languageScore = Math.max(2, languageScore - 1);
  }
  
  if (sentences.length < 3) {
    organisationScore = Math.max(2, organisationScore - 1);
  }
  
  const feedback = [
    ...issues,
    '',
    '💡 Suggestions:',
    ...suggestions,
    suggestions.length === 0 ? '• Keep practising to improve your writing!' : '',
  ].filter(Boolean).join('\n');
  
  const marks: Record<string, number> = isPart1
    ? { content: contentScore, organisation: organisationScore, language: languageScore }
    : { content: contentScore, communicativeAchievement: organisationScore, organisation: organisationScore, language: languageScore };
  
  return {
    feedback,
    correctedVersion: corrected !== text ? corrected : '',
    suggestedMarks: marks,
  };
}

// OpenAI-powered proofreading
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

Please provide:
1. FEEDBACK: Specific comments about errors (spelling, grammar, punctuation), missing content points, and areas for improvement. Be encouraging but thorough.

2. CORRECTED VERSION: Rewrite the student's text with corrections, maintaining their style and ideas but fixing all errors and improving clarity.

3. SUGGESTED MARKS (0-5 for each criterion where 5 is excellent):
${criteria.map(c => `- ${c}: [0-5]`).join('\n')}

Format your response as JSON:
{
  "feedback": "Your detailed feedback here...",
  "correctedVersion": "The corrected text here...",
  "suggestedMarks": {
    ${isPart1 
      ? '"content": 0, "organisation": 0, "language": 0' 
      : '"content": 0, "communicativeAchievement": 0, "organisation": 0, "language": 0'}
  }
}`;

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: 'You are an expert English teacher providing detailed, constructive feedback on student writing. Always respond with valid JSON.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.7,
        max_tokens: 1500,
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';
    
    // Parse the JSON response
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
  } catch (error) {
    console.error('AI proofreading error:', error);
    // Fall back to simple proofreading
    return simpleProofread(text, task, wordTarget, isPart1);
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const body = req.body as ProofreadRequest;
    const { part1, part2, markingCriteria } = body;
    
    const apiKey = process.env['OPENAI_API_KEY'] || '';
    const useAI = !!apiKey && apiKey.length > 10;
    
    const response: ProofreadResponse = {};
    
    // Process Part 1
    if (part1?.text?.trim()) {
      if (useAI) {
        response.part1 = await aiProofread(
          part1.text,
          part1.task,
          part1.wordTarget,
          markingCriteria.part1,
          true,
          apiKey
        );
      } else {
        response.part1 = simpleProofread(part1.text, part1.task, part1.wordTarget, true);
      }
    }
    
    // Process Part 2
    if (part2?.text?.trim()) {
      if (useAI) {
        response.part2 = await aiProofread(
          part2.text,
          part2.task,
          part2.wordTarget,
          markingCriteria.part2,
          false,
          apiKey
        );
      } else {
        response.part2 = simpleProofread(part2.text, part2.task, part2.wordTarget, false);
      }
    }
    
    // Generate overall comments
    if (response.part1 || response.part2) {
      const p1Marks = response.part1?.suggestedMarks || {};
      const p2Marks = response.part2?.suggestedMarks || {};
      
      const p1Total = Object.values(p1Marks).reduce((a, b) => a + (b as number), 0);
      const p2Total = Object.values(p2Marks).reduce((a, b) => a + (b as number), 0);
      const total = p1Total + p2Total;
      const maxScore = 35;
      const percentage = Math.round((total / maxScore) * 100);
      
      let overallMessage = '';
      if (percentage >= 80) {
        overallMessage = '🌟 Excellent work! Your writing shows strong language skills. Keep up the great effort!';
      } else if (percentage >= 70) {
        overallMessage = '👍 Good job! Your writing is clear and mostly accurate. Focus on the feedback to improve further.';
      } else if (percentage >= 50) {
        overallMessage = '📈 You\'re making progress! Review the corrections carefully and practise the suggested improvements.';
      } else {
        overallMessage = '💪 Keep practising! Focus on basic grammar and spelling. Read the corrected versions to learn from your mistakes.';
      }
      
      response.overallComments = overallMessage + (useAI ? '' : '\n\n(Note: This is automated feedback. Your teacher will review and adjust the marks.)');
    }
    
    return res.status(200).json(response);
    
  } catch (error) {
    console.error('Proofreading error:', error);
    return res.status(500).json({ error: 'Failed to process writing' });
  }
}
