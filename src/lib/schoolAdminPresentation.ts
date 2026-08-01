const TECHNICAL_ERROR_MARKERS = [
  'duplicate key value',
  'unique constraint',
  'violates foreign key',
  'row-level security',
  'permission denied',
  'postgres',
  'supabase',
  'rpc',
  'sqlstate',
];

export function friendlySchoolAdminError(message: unknown, fallback: string): string {
  const raw = message instanceof Error ? message.message : String(message ?? '').trim();
  const normalized = raw.toLowerCase();

  if (!raw) return fallback;
  if (
    normalized.includes('classes_school_classcode_uniq')
    || (normalized.includes('duplicate key value') && normalized.includes('class'))
  ) {
    return 'A class with this code already exists. Choose a different class code and try again.';
  }
  if (normalized.includes('duplicate key value') && normalized.includes('subject')) {
    return 'A subject with this name or code already exists. Check the existing curriculum list and try again.';
  }
  if (normalized.includes('not authenticated') || normalized.includes('jwt')) {
    return 'Your session has expired. Sign in again, then retry this action.';
  }
  if (normalized.includes('forbidden') || normalized.includes('permission denied') || normalized.includes('row-level security')) {
    return 'You do not have permission to make this change for this school.';
  }
  if (normalized.includes('not found')) {
    return 'This record is no longer available. Refresh the page and try again.';
  }
  if (normalized.includes('network') || normalized.includes('fetch')) {
    return 'The school service could not be reached. Check your connection and try again.';
  }
  if (TECHNICAL_ERROR_MARKERS.some((marker) => normalized.includes(marker))) return fallback;
  return raw.length <= 180 ? raw : fallback;
}

export function formatAdminDate(value?: string | null): string {
  if (!value) return 'Not recorded';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not recorded';
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(date);
}
