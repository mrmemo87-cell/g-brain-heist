declare global {
  // Compatibility guard for the legacy moderation-status loader in SchoolAdminPortal.
  // The loading flag is not rendered anywhere, so keep the old setter harmless until
  // the legacy call sites are removed from the large portal component.
  var setModTargetLoading: ((loading: boolean) => void) | undefined;
}

if (typeof globalThis.setModTargetLoading !== 'function') {
  globalThis.setModTargetLoading = () => {};
}

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

const IELTS_ADMIN_ERROR_MESSAGES: ReadonlyArray<readonly [string, string]> = [
  ['exactly_one_active_form_required', 'Keep exactly one exam form active before launch.'],
  ['active_form_required', 'Add and activate an exam form before launch.'],
  ['assignments_required', 'Assign at least one student before launch.'],
  ['invalid_exam_assignments', 'Some assignments no longer match this school, class, or active form. Review them before launch.'],
  ['launch_confirmation_required', 'Confirm the final launch check before making the exam available.'],
  ['invalid_launch_state', 'Only a scheduled exam can be launched. Refresh the page and check its current status.'],
  ['invalid_schedule_state', 'Only a draft exam can be scheduled. Refresh the page and check its current status.'],
  ['exam_not_started', 'This exam cannot be launched before its scheduled start time.'],
  ['exam_window_expired', 'The scheduled exam window has ended. Create a new schedule before launch.'],
  ['invalid_exam_window', 'Choose a valid start and end time for this exam.'],
  ['invalid_duration', 'Choose a valid exam duration.'],
  ['enabled_value_required', 'Choose whether Extra Practice should be enabled or disabled.'],
  ['school_not_found', 'This school is no longer available. Refresh the workspace and try again.'],
  ['not_authenticated', 'Your session has expired. Sign in again, then retry this action.'],
  ['title_required', 'Enter an exam title before saving.'],
  ['school_required', 'A current school is required for this action. Refresh the workspace and try again.'],
  ['reason_too_long', 'Keep the note under 500 characters.'],
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

export function friendlyIeltsAdminError(
  message: unknown,
  fallback = 'The IELTS workspace could not complete this request. Please try again.',
): string {
  const raw = message instanceof Error ? message.message : String(message ?? '').trim();
  const normalized = raw.toLowerCase();
  let knownMessage: readonly [string, string] | null = null;
  for (const entry of IELTS_ADMIN_ERROR_MESSAGES) {
    if (
      normalized.includes(entry[0])
      && (knownMessage === null || entry[0].length > knownMessage[0].length)
    ) {
      knownMessage = entry;
    }
  }
  if (knownMessage) return knownMessage[1];

  if (/^[a-z][a-z0-9_]*$/.test(normalized)) return fallback;
  return friendlySchoolAdminError(message, fallback);
}

export function formatAdminDate(value?: string | null): string {
  if (!value) return 'Not recorded';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not recorded';
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(date);
}
