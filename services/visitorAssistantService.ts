import { supabase } from './supabaseClient';

export type VisitorAssistantRole = 'visitor' | 'assistant';

export type VisitorAssistantMessage = {
  role: VisitorAssistantRole;
  text: string;
};

type VisitorAssistantResponse = {
  reply?: string;
  model?: string;
  error?: string;
};

const MAX_CLIENT_MESSAGES = 10;

export const askVisitorAssistant = async (
  messages: VisitorAssistantMessage[],
): Promise<{ reply: string; model?: string }> => {
  const normalizedMessages = messages
    .filter((message) => message.text.trim())
    .slice(-MAX_CLIENT_MESSAGES)
    .map((message) => ({
      role: message.role,
      text: message.text.trim().slice(0, 1200),
    }));

  const { data, error } = await supabase.functions.invoke<VisitorAssistantResponse>('visitor_assistant', {
    body: { messages: normalizedMessages },
  });

  if (error) {
    throw new Error(error.message || 'The AI assistant is unavailable right now.');
  }

  if (!data?.reply) {
    throw new Error(data?.error || 'The AI assistant did not return a response.');
  }

  return { reply: data.reply, model: data.model };
};
