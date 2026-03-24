/**
 * Quest Mode Node Asset Paths
 * All /public/nodes/ assets centralised here.
 */

export const NODE_ICONS = {
  start:          '/nodes/Start-Node-Icon.png',
  question:       '/nodes/Question-Node-Icon.png',
  reward:         '/nodes/Reward-Node-Icon.png',
  surprise:       '/nodes/Spin-Wheel-Node-Icon.png',
  elite_question: '/nodes/Riddle-Node-Icon.png',
  final_chest:    '/nodes/BossChest-Node-Icon.png',
} as const;

export const CHEST_IMAGES = {
  bronze: '/nodes/bronze-chest-static.png',
  silver: '/nodes/ice-chest-static.png',
  gold:   '/nodes/gold-chest-static.png',
} as const;

export const WHEEL_IMAGES = {
  pointer: '/nodes/Wheel-Pointer-arrow.png',
  center:  '/nodes/Wheel-Center-Button.png',
} as const;

export const QUEST_BACKGROUND = '/nodes/Quest-map-background.png';
