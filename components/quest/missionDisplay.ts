export const formatMissionTitleForDisplay = (rawTitle?: string | null): string => {
  if (!rawTitle) return 'Untitled Mission';

  const normalized = rawTitle
    .replace(/\\n/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)[0] ?? rawTitle.trim();

  const withoutImportPrefix = normalized.replace(/^csv\s*upload\s*:\s*/i, '');
  return withoutImportPrefix || 'Untitled Mission';
};

