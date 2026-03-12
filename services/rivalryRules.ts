export const RIVALRY_RULES = {
  minClanSizeToDeclare: 5,
  declarationCapPer24h: 2,
  pairCooldownHours: 72,
  declarationRoles: ['Leader', 'Officer', 'Moderator'] as const,
} as const;

export const RIVALRY_DECLARATION_REQUIREMENTS: string[] = [
  `You must be in a clan and have ${RIVALRY_RULES.declarationRoles.join(', ')} permissions.`,
  `Both clans need at least ${RIVALRY_RULES.minClanSizeToDeclare} members to start a rivalry war.`,
  `Your clan can declare up to ${RIVALRY_RULES.declarationCapPer24h} wars per rolling 24-hour window.`,
  'Clans already in an active war cannot start another one.',
  `The same clan matchup has a ${RIVALRY_RULES.pairCooldownHours}-hour cooldown before it can be declared again.`,
];
