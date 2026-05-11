export const EMAIL_ALREADY_REGISTERED_MESSAGE = 'This email is already registered. Please log in instead.';

const DUPLICATE_EMAIL_PATTERNS = [
  /users_email_key/i,
  /duplicate key value violates unique constraint.*email/i,
  /email.*already (?:registered|exists|in use)/i,
  /user already registered/i,
  /already been registered/i,
  /already exists/i,
];

export const isDuplicateEmailError = (error: unknown): boolean => {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return DUPLICATE_EMAIL_PATTERNS.some((pattern) => pattern.test(message));
};

export const toAuthSafeErrorMessage = (error: unknown): string => {
  if (isDuplicateEmailError(error)) {
    return EMAIL_ALREADY_REGISTERED_MESSAGE;
  }

  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  const message = String(error ?? '').trim();
  return message || 'Authentication failed. Please try again.';
};
