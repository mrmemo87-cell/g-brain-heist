import React from 'react';
import ClanTerritoryManager from '../clanTerritory/ClanTerritoryManager';

interface LockdownManagerProps {
  onExit: () => void;
  isTeacher?: boolean;
  playerName?: string;
  clanId?: string | null;
  clanName?: string | null;
  clanAvatarUrl?: string | null;
}

/**
 * Lockdown and Clan Wars share the class-aware live classroom arena.
 *
 * This intentionally delegates to ClanTerritoryManager instead of maintaining a
 * second room-code-only transport. The class-aware manager is the established
 * school flow: teachers select their allocated classes/students and students in
 * those classes discover the live operation automatically without typing a room
 * code. It also keeps the continuously-broadcast discovery/reconnect behavior
 * used by classroom events across devices and networks.
 *
 * Keeping one live-operations transport prevents the two teacher/student entry
 * points from drifting into incompatible room protocols again.
 */
export const LockdownManager: React.FC<LockdownManagerProps> = ({
  onExit,
  isTeacher = false,
  playerName = 'Agent',
  clanId = null,
  clanName = null,
}) => (
  <ClanTerritoryManager
    onExit={onExit}
    isTeacher={isTeacher}
    canHost={isTeacher}
    playerName={playerName}
    clanId={clanId}
    clanName={clanName}
  />
);

export default LockdownManager;
