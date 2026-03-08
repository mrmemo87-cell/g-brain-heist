const DEVELOPER_USER_IDS = new Set([
  // Add user IDs here to show a visual "DEV" badge next to their name.
  'a45aa76c-52a0-419d-be98-d6c87b80fe69',
]);

export const isDeveloperBadgeUser = (userId?: string | null): boolean => {
  if (!userId) return false;
  return DEVELOPER_USER_IDS.has(userId.trim().toLowerCase());
};
