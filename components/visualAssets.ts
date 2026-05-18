// ============================================================================
// Visual Assets — Centralised path map for all `/public/visuals/` assets.
// Pattern follows rivalryAssets.ts: single source of truth, no hardcoded paths.
// ============================================================================

const V = '/visuals';
const ICONS = `${V}/neon_cyber_icon_pack/icon_pack`;

// ── Illustration PNGs ──────────────────────────────────────────────────────

export const visualAssets = {
  streak: {
    day1:  `${V}/1-day.png`,
    day3:  `${V}/3-day.png`,
    day5:  `${V}/5-day.png`,
    day7:  `${V}/7-day.png`,
    day14: `${V}/14-day.png`,
    day30: `${V}/30-day.png`,
  },
  engagement: {
    dailyReward:  `${V}/Daily-Reward.png`,
    mondayBoost:  `${V}/Monday-Boost.png`,
    midweekChallenge: `${V}/Midweek-Challenge.png`,
    fridayBattle: `${V}/Friday-School-Battle-Teaser.png`,
  },
  mission: {
    quickQuest:      `${V}/Quick-Quest-card-illustration.png`,
    postCelebration: `${V}/Post-quest-celebration-background.png`,
  },
  social: {
    inviteFriend:      `${V}/Invite-Friend-social-action-illustration.png`,
    teacherInviteHero: `${V}/Teacher-invite-hero-visual.png`,
    activateClass:     `${V}/We-need-our-teacher-to-activate-class.png`,
  },
  share: {
    missionComplete: `${V}/I-completed-today's-mission.png`,
    streakBrag:      `${V}/My-streak-is-X-days.png`,
  },
  schoolUnlock: {
    leaderboards:  `${V}/Unlock-School-Leaderboards.png`,
    clans:         `${V}/Unlock-School-Clans.png`,
    competitions:  `${V}/Unlock-School-Competitions.png`,
    assignments:   `${V}/Unlock-Teacher-Assignments.png`,
  },
  prime: {
    onlyPrime:  `${V}/Only-Prime-Users.png`,
    upgrade:    `${V}/Upgrade-to-Prime.png`,
    softLock:   `${V}/Locked-feature-without-frustration.png`,
  },
  badges: {
    classBuilder:     `${V}/class_builder.png`,
    recruiterI:       `${V}/recruiter_i.png`,
    recruiterII:      `${V}/recruiter_ii.png`,
    recruiterIII:     `${V}/recruiter_iii.png`,
    teacherConnector: `${V}/teacher_connector.png`,
  },
} as const;

// ── Neon Cyber Icon Pack ───────────────────────────────────────────────────

export type NeonIconName =
  | 'assignment' | 'clan' | 'invite_friend' | 'invite_teacher'
  | 'leaderboard' | 'premium' | 'quest' | 'reward_chest'
  | 'school_unlock' | 'streak';

export type NeonVariant = 'accent' | 'white';
export type NeonFormat = 'png' | 'svg';

/** Build the path to a neon icon. Defaults to accent SVG. */
export const neonIcon = (
  name: NeonIconName,
  variant: NeonVariant = 'accent',
  format: NeonFormat = 'svg',
): string => `${ICONS}/${format}/${variant}/${name}.${format}`;
