import { supabase } from './supabaseClient';

export type DemoRequestPayload = {
  name: string;
  school_name: string;
  email: string;
  country?: string;
  student_count?: number | null;
  website?: string;
  notes?: string;
};

type DemoRequestResponse = {
  ok?: boolean;
  error?: string;
};

export const submitDemoRequest = async (payload: DemoRequestPayload): Promise<void> => {
  const { data, error } = await supabase.functions.invoke<DemoRequestResponse>('demo_request', {
    body: payload,
  });

  if (error) {
    throw new Error(error.message || 'We could not send your demo request right now.');
  }

  if (!data?.ok) {
    throw new Error(data?.error || 'We could not send your demo request right now.');
  }
};
