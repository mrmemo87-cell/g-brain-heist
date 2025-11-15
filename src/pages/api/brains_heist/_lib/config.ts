const readEnv = (key: string): string | undefined => {
  if (typeof process === 'undefined') {
    return undefined;
  }
  return process.env[key] ?? process.env[`VITE_${key}`];
};

const requiredEnv = (key: string): string => {
  const value = readEnv(key);
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
};

export const getSupabaseServiceRoleKey = (): string => {
  return requiredEnv('SUPABASE_SERVICE_ROLE_KEY');
};

export const getSupabaseUrl = (): string => {
  return requiredEnv('SUPABASE_URL');
};
