export interface IeltsExamScheduleValues {
  startsAt: string;
  endsAt: string;
  durationMinutes: number;
}

export const validateIeltsExamSchedule = ({
  startsAt,
  endsAt,
  durationMinutes,
}: IeltsExamScheduleValues): string | null => {
  const startMs = Date.parse(startsAt);
  const endMs = Date.parse(endsAt);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return 'Start and end time are required.';
  if (endMs <= startMs) return 'End time must be after start time.';
  if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) return 'Duration must be greater than zero.';
  if (durationMinutes * 60_000 > endMs - startMs) return 'Duration must fit within start and end times.';
  return null;
};

export const toIeltsLocalDateTimeInput = (
  value?: string | Date | null,
): string | null => {
  if (value === null || value === undefined || value === '') return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  try {
    const offsetMs = date.getTimezoneOffset() * 60_000;
    const localDate = new Date(date.getTime() - offsetMs);
    if (Number.isNaN(localDate.getTime())) return null;
    return localDate.toISOString().slice(0, 16);
  } catch {
    return null;
  }
};
