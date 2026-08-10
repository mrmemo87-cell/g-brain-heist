export function userFacingError(raw: unknown, fallback: string): Error {
  const message = raw instanceof Error ? raw.message : String((raw as any)?.message || raw || '');
  const lower = message.toLowerCase();

  if (lower.includes('invalid login credentials')) return new Error('That email and password do not match. Please try again or use Google sign-in.');
  if (lower.includes('email not confirmed')) return new Error('Please confirm your email first, then return and try again.');
  if (lower.includes('already registered') || lower.includes('user already registered')) return new Error('An account already exists for this email. Please sign in instead.');
  if (lower.includes('expired')) return new Error('This invitation has expired. Please ask the school for a new invitation.');
  if (lower.includes('revoked')) return new Error('This access is no longer active. Please contact the school if you still need it.');
  if (lower.includes('email') && lower.includes('match')) return new Error('Please use the same email address the school invited.');
  if (lower.includes('not authorized') || lower.includes('not authorised') || lower.includes('permission') || lower.includes('row-level security')) return new Error('You do not currently have access to this information. Please contact your school administrator if this seems unexpected.');
  if (lower.includes('network') || lower.includes('fetch') || lower.includes('load failed') || lower.includes('failed to fetch') || lower.includes('timeout')) return new Error('We could not connect just now. Please check your connection and try again.');
  if (lower.includes('jwt') || lower.includes('session') || lower.includes('not authenticated')) return new Error('Your secure session has ended. Please sign in again.');
  if (lower.includes('duplicate') || lower.includes('already exists')) return new Error('That item is already in place. Refresh the page and continue from the existing record.');

  return new Error(fallback);
}
