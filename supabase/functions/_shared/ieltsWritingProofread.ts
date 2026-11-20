/**
 * Second AI pass for Writing highlights (Diagnostic Bible 2.6.0 section 10.9): looks only for errors the first pass
 * left unmarked. Claude first, then one OpenAI try. Best effort: when both fail it returns null and the first pass plus
 * the deterministic checks are still used, so feedback is never lost because of this pass. Logs only short codes.
 */
import { claudeEnabled, claudeText, reasonOf } from './aiProvider.ts';
import { writingProofreadInstructions, writingProofreadSchema, writingProofreadUserContent, type WritingHighlight } from './ieltsWritingHighlights.ts';

export async function proofreadWritingEssay(input: {
  label: string; task: 1 | 2; prompt: string; essay: string; marked: WritingHighlight[]; openAiKey?: string | null; openAiModel: string;
}): Promise<unknown[] | null> {
  const system = writingProofreadInstructions(input.task);
  const user = writingProofreadUserContent(input.prompt, input.essay, input.marked);
  const schema = writingProofreadSchema(input.task);
  const read = (text: string) => {
    const value = JSON.parse(text) as { fixes?: unknown };
    if (!value || !Array.isArray(value.fixes)) throw new Error('invalid_proofread');
    return value.fixes;
  };
  if (claudeEnabled()) {
    try {
      return read((await claudeText({ system, user, maxTokens: 5000, schema, timeoutMs: 50000 })).text);
    } catch (error) {
      console.warn(JSON.stringify({ fn: input.label, stage: 'proofread_claude', reason: reasonOf(error) }));
    }
  }
  if (!input.openAiKey) return null;
  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST', signal: AbortSignal.timeout(50000),
      headers: { Authorization: `Bearer ${input.openAiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: input.openAiModel, store: false, max_completion_tokens: 5000,
        messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
        response_format: { type: 'json_schema', json_schema: { name: 'writing_proofread', strict: true, schema } } }),
    });
    if (!response.ok) throw new Error(`status_${response.status}`);
    const output = await response.json();
    const choice = output.choices?.[0];
    if (choice?.finish_reason !== 'stop' || !choice.message?.content) throw new Error('incomplete');
    return read(choice.message.content);
  } catch (error) {
    console.warn(JSON.stringify({ fn: input.label, stage: 'proofread_openai', reason: reasonOf(error) }));
    return null;
  }
}
