import React from 'react';
import { Profile } from '../types';
import { useLightMode } from '../src/contexts/LightModeContext';
import { getXpProgress } from '../src/lib/leveling';
import { TrophyIcon, SyndicateRune } from './icons';

// Default school icon as SVG data URL
const defaultSchoolIcon = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9IiNmZmYiIHN0cm9rZS13aWR0aD0iMiIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIj48cGF0aCBkPSJNMjIgMTBWNkwxMiAyIDIgNnY0Yy4zNC0uMDguNjUtLjEgMS0uMWg1LjFsMi40NSAzLjA2YTEgMSAwIDAgMCAxLjU2IDBMMTQuNTUgOS45SDE5Ljljey4zNSAwIC42Ny4wMiAxIC4xWiIvPjxwYXRoIGQ9Ik0xMiAyMnYtNiIvPjxwYXRoIGQ9Ik00IDEwdjEwYzAgLjU1LjQ1IDEgMSAxaDE0Yy41NSAwIDEtLjQ1IDEtMVYxMCIvPjwvc3ZnPg==';

interface MainActionsProps {
  onStartQuest: () => void;
  onStartPvp: () => void;
  onOpenRaid?: () => void;
  onVisitShop: () => void;
  onGoToClan: () => void;
  onVisitInventory: () => void;
  onViewLeaderboard: () => void;
  onViewAchievements: () => void;
  onOpenRaidAdmin?: () => void;
  onOpenTeacherPortal?: () => void;
  onOpenAdminPortal?: () => void;
  onOpenSchoolAdmin?: () => void;
  onOpenTournament?: () => void;
  onOpenTournamentAdmin?: () => void;
  onOpenCompetitionPlay?: () => void;
  onOpenCompetitionLeaderboard?: () => void;
  onOpenCompetitionAdmin?: () => void;
  onOpenIeltsPrep?: () => void;
  onOpenLockdown?: () => void;
  onOpenCambridgeTests?: () => void;
  profile?: Profile | null;
  hasPendingAssignment?: boolean;
  clanBadgeCount?: number;
  schoolName?: string | null;
  schoolLogoUrl?: string | null;
}

type ActionButtonProps = {
  icon: React.ReactNode;
  label: string;
  color: string;
  glowClass: string;
  onClick?: () => void;
  className?: string;
  badgeText?: string;
  subtitle?: string;
};

const ActionButton: React.FC<ActionButtonProps> = ({
  icon,
  label,
  color,
  glowClass,
  onClick,
  className,
  badgeText,
  subtitle,
}) => {
  const accent = `rgba(${color}, 1)`;
  const panel = `rgba(${color}, 0.2)`;
  const border = `rgba(${color}, 0.5)`;
  const iconPanel = `linear-gradient(135deg, rgba(${color}, 0.6), rgba(${color}, 0.22))`;

  return (
    <button
      type="button"
      onClick={onClick}
      className={`dashboard-action group relative flex h-full w-full flex-col items-center justify-center overflow-hidden rounded-2xl border px-4 py-5 text-center transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 hover:-translate-y-0.5 hover:shadow-[0_18px_38px_-22px_rgba(0,0,0,0.75)] active:scale-[0.99] sm:px-5 sm:py-6 ${glowClass} ${className ?? ''}`}
      style={{
        background: `radial-gradient(circle at 18% 16%, rgba(255,255,255,0.06), transparent 30%), radial-gradient(circle at 82% 12%, rgba(255,255,255,0.05), transparent 26%), linear-gradient(150deg, ${panel}, rgba(15, 23, 42, 0.7))`,
        borderColor: border,
        boxShadow: `0 18px 30px -22px ${accent}`,
      }}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-50 transition-opacity duration-500 group-hover:opacity-80"
        style={{
          background:
            'radial-gradient(circle at 20% 40%, rgba(255,255,255,0.04) 0 30%, transparent 45%), radial-gradient(circle at 80% 60%, rgba(255,255,255,0.04) 0 26%, transparent 50%)',
        }}
      />
      {badgeText && (
        <span className="absolute top-0 right-0 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-xs font-bold text-white shadow-lg animate-pulse">
          {badgeText}
        </span>
      )}
      <div
        className="dashboard-action__icon relative z-[1] mb-2 flex h-12 w-12 items-center justify-center rounded-2xl text-3xl shadow-inner shadow-slate-950/60 ring-1 ring-white/10 sm:h-14 sm:w-14"
        style={{
          background: iconPanel,
          color: '#030712',
          boxShadow: `inset 0 1px 0 rgba(255, 255, 255, 0.08), 0 12px 22px -14px ${accent}`,
        }}
      >
        {icon}
      </div>
      <span className="dashboard-action__label relative z-[1] font-heading text-sm font-semibold tracking-wide text-white sm:text-base">
        {label}
      </span>
      {subtitle && (
        <span className="dashboard-action__subtitle relative z-[1] mt-2 max-w-[160px] text-[0.7rem] leading-snug text-slate-200/90 sm:text-xs">
          {subtitle}
        </span>
      )}
    </button>
  );
};

type QuestPlayButtonProps = {
  onClick: () => void;
  hasPendingAssignment?: boolean;
  className?: string;
};

const QuestPlayButton: React.FC<QuestPlayButtonProps> = ({
  onClick,
  hasPendingAssignment,
  className = '',
}) => {
  const classes = ['quest-play-button', hasPendingAssignment ? 'quest-play-button--locked' : '', className]
    .filter(Boolean)
    .join(' ');

  return (
    <button type="button" onClick={onClick} className={classes}>
      <div className="quest-play-button__copy">
        <span className="quest-play-button__text">PLAY</span>
        <span className="quest-play-button__status">
          {hasPendingAssignment ? 'Complete your assignment first' : 'Launch a new quest'}
        </span>
      </div>
      <span className="quest-play-button__arrow" aria-hidden>
        ▶
      </span>
      {hasPendingAssignment && (
        <span className="quest-play-button__warning">Assignment Required</span>
      )}
    </button>
  );
};

const MainActions: React.FC<MainActionsProps> = ({
  onStartQuest,
  onStartPvp,
  onOpenRaid,
  onVisitShop,
  onGoToClan,
  onVisitInventory,
  onViewLeaderboard,
  onViewAchievements,
  onOpenRaidAdmin,
  onOpenTeacherPortal,
  onOpenAdminPortal,
  onOpenSchoolAdmin,
  onOpenTournament,
  onOpenTournamentAdmin,
  onOpenCompetitionPlay,
  onOpenCompetitionLeaderboard,
  onOpenCompetitionAdmin,
  onOpenIeltsPrep,
  onOpenLockdown,
  onOpenCambridgeTests,
  hasPendingAssignment,
  clanBadgeCount,
  schoolName,
  schoolLogoUrl,
}) => {
  const { isLightMode: isLiteMode } = useLightMode();
  const displaySchoolName = schoolName || 'My School';
  const displaySchoolLogo = schoolLogoUrl || defaultSchoolIcon;
  const xpProgress = getXpProgress(profile?.xp ?? 0, profile?.level ?? 1);
  const xpPercent = Math.min(100, Math.round(xpProgress.progress * 100));
  const streakCount = profile?.streak ?? 0;
  const coins = profile?.coins ?? 0;
  const shieldActive = profile?.has_shield ?? false;

  // If Full Mode is active, render the Neon Glass themed full-mode action panel
  if (!isLiteMode) {
    const circleActions = [
      { key: 'attack', label: 'ATTACK', icon: '⚔️', onClick: onStartPvp },
      { key: 'shop', label: 'SHOP', icon: '🛍️', onClick: onVisitShop },
      { key: 'inventory', label: 'INVENTORY', icon: '🎒', onClick: onVisitInventory },
      { key: 'leaderboard', label: 'LEADERBOARD', icon: '🏆', onClick: onViewLeaderboard },
    ].filter((action) => Boolean(action.onClick));

    return (
      <section className="fullMode-dashboard theme-neon-glass" aria-label="Full Mode mission console">
        <div className="fullMode-dashboard-glow" aria-hidden />

        <div className="fullMode-statusRow">
          <div className="fullMode-agentBlock">
            <div className="fullMode-avatarWrap">
              <span className="fullMode-avatarHalo" aria-hidden />
              <img
                src={profile?.avatar_url || displaySchoolLogo}
                alt={profile?.username || 'Agent avatar'}
                className="fullMode-avatarImage"
                onError={(e) => { (e.target as HTMLImageElement).src = defaultSchoolIcon; }}
              />
              <span className="fullMode-levelBadge">LV {xpProgress.effectiveLevel}</span>
            </div>
            <div className="fullMode-agentMeta">
              <p className="fullMode-agentLabel">ACTIVE OPERATIVE</p>
              <h3 className="fullMode-agentName">{profile?.username || 'Agent'}</h3>
              <div className="fullMode-xpTrack">
                <div className="fullMode-xpMeter" role="progressbar" aria-valuenow={xpPercent} aria-valuemin={0} aria-valuemax={100}>
                  <span className="fullMode-xpFill" style={{ width: `${xpPercent}%` }} />
                </div>
                <span className="fullMode-xpText">
                  {xpProgress.xpIntoLevel.toLocaleString()} / {xpProgress.xpForNextLevel} XP
                </span>
              </div>
            </div>
          </div>
          <div className="fullMode-indicators" aria-label="Status indicators">
            <div className="fullMode-indicator">
              <span className="fullMode-indicatorIcon">🪙</span>
              <div className="fullMode-indicatorLabel">Coins</div>
              <div className="fullMode-indicatorValue">{coins.toLocaleString()}</div>
            </div>
            <div className="fullMode-indicator">
              <span className="fullMode-indicatorIcon">🔥</span>
              <div className="fullMode-indicatorLabel">Streak</div>
              <div className="fullMode-indicatorValue">{streakCount}</div>
            </div>
            <div className={`fullMode-indicator ${shieldActive ? 'is-active' : 'is-idle'}`}>
              <span className="fullMode-indicatorIcon">🛡️</span>
              <div className="fullMode-indicatorLabel">Shield</div>
              <div className="fullMode-indicatorValue">{shieldActive ? 'ONLINE' : 'OFFLINE'}</div>
            </div>
          </div>
        </div>

        <div className="fullMode-actionsShell">
          <div className="fullMode-heroAction">
            <div className="fullMode-heroAurora" aria-hidden />
            <button className="fullMode-questPrimary" onClick={onStartQuest} aria-label="Launch Quest">
              <span className="fullMode-questGlow" aria-hidden />
              <span className="fullMode-questLabel">QUEST</span>
              <span className="fullMode-questSub">Primary objective</span>
            </button>
            {hasPendingAssignment && (
              <span className="fullMode-warningPill">Complete assignment to unlock</span>
            )}
          </div>
          <div className="fullMode-circleGrid">
            {circleActions.map((action) => (
              <button
                key={action.key}
                type="button"
                className="fullMode-circleAction"
                onClick={action.onClick}
              >
                <span className="fullMode-circleIcon" aria-hidden>{action.icon}</span>
                <span className="fullMode-circleLabel">{action.label}</span>
              </button>
            ))}
          </div>

          {(onViewAchievements || onGoToClan) && (
            <div className="fullMode-rowActions" aria-label="Progress and clan actions">
              {onViewAchievements && (
                <button type="button" className="fullMode-rectAction" onClick={onViewAchievements}>
                  <span className="fullMode-rectIcon" aria-hidden>🎖️</span>
                  <div className="fullMode-rectCopy">
                    <span className="fullMode-rectLabel">Achievements</span>
                    <span className="fullMode-rectSub">View medals and milestones</span>
                  </div>
                </button>
              )}

              {onGoToClan && (
                <button type="button" className="fullMode-rectAction" onClick={onGoToClan}>
                  <span className="fullMode-rectIcon" aria-hidden>🛡️</span>
                  <div className="fullMode-rectCopy">
                    <span className="fullMode-rectLabel">Clan</span>
                    <span className="fullMode-rectSub">Coordinate with your squad</span>
                  </div>
                </button>
              )}
            </div>
          )}

          {(onOpenLockdown || onOpenCambridgeTests) && (
            <div className="fullMode-footerActions" aria-label="Special operations">
              {onOpenLockdown && (
                <button type="button" className="fullMode-footerAction" onClick={onOpenLockdown}>
                  <div className="fullMode-footerGlow" aria-hidden />
                  <div className="fullMode-footerContent">
                    <span className="fullMode-footerIcon" aria-hidden>🔒</span>
                    <div className="fullMode-footerCopy">
                      <span className="fullMode-footerLabel">Lockdown</span>
                      <span className="fullMode-footerSub">Clan territory defenses</span>
                    </div>
                  </div>
                </button>
              )}
              {onOpenCambridgeTests && (
                <button type="button" className="fullMode-footerAction" onClick={onOpenCambridgeTests}>
                  <div className="fullMode-footerGlow" aria-hidden />
                  <div className="fullMode-footerContent">
                    <span className="fullMode-footerIcon" aria-hidden>📚</span>
                    <div className="fullMode-footerCopy">
                      <span className="fullMode-footerLabel">Cambridge Tests</span>
                      <span className="fullMode-footerSub">Reading & grammar drills</span>
                    </div>
                  </div>
                </button>
              )}
            </div>
          )}
        </div>
      </section>
    );
  }

  // Lightweight / existing UI preserved below
  return (
    <section className="dashboard-panel relative overflow-hidden rounded-3xl border border-slate-800/70 bg-slate-950/60 p-4 shadow-2xl shadow-slate-950/50 backdrop-blur sm:p-6">
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-80"
        style={{
          background:
            'radial-gradient(circle at 15% 25%, rgba(16, 185, 129, 0.08), transparent 30%), radial-gradient(circle at 85% 15%, rgba(14, 165, 233, 0.08), transparent 28%), radial-gradient(closest-side at 50% 120%, rgba(255, 255, 255, 0.04), transparent)',
        }}
      />
      <div className="relative flex flex-col gap-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-slate-800 bg-slate-900/70 shadow-inner shadow-slate-900/60">
              <span aria-hidden className="text-3xl">🚀</span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-heading text-lg font-bold text-white sm:text-xl">Mission Console</h2>
                <span className="rounded-full border border-cyan-300/40 bg-cyan-500/10 px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-cyan-100">
                  🎯 Ready
                </span>
              </div>
              <p className="text-sm text-slate-400">Pick your next move. Everything fits comfortably on phones.</p>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-full border border-slate-800 bg-slate-900/70 px-3 py-1 shadow-inner shadow-slate-900/40">
            <img
              src={displaySchoolLogo}
              alt={`${displaySchoolName} logo`}
              className="h-8 w-8 rounded-full object-cover bg-slate-800"
              onError={(e) => { (e.target as HTMLImageElement).src = defaultSchoolIcon; }}
            />
            <div className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-slate-100">
              <span aria-hidden>✨</span>
              <span>{displaySchoolName}</span>
            </div>
          </div>
          {hasPendingAssignment && (
            <span className="inline-flex items-center justify-center rounded-full border border-amber-400/70 bg-amber-500/15 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-amber-100 shadow shadow-amber-400/20">
              Assignment Required
            </span>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
            {onOpenCompetitionPlay && (
              <ActionButton
                onClick={onOpenCompetitionPlay}
                icon={
                  <div className="relative flex items-center justify-center">
                    <img
                      src={displaySchoolLogo}
                      alt={`${displaySchoolName} play`}
                      className="h-9 w-9 rounded-lg object-cover shadow-md shadow-slate-950/40 bg-slate-800"
                      onError={(e) => { (e.target as HTMLImageElement).src = defaultSchoolIcon; }}
                    />
                    <span aria-hidden className="absolute -bottom-2 -right-2 text-xl">🎭</span>
                  </div>
                }
                label={`${displaySchoolName} Play`}
                subtitle={`Jump into ${displaySchoolName} story missions`}
                color="0, 255, 200"
                glowClass="glow-success animate-pulse-glow"
                className="col-span-2"
              />
            )}
            {onOpenCompetitionLeaderboard && (
              <ActionButton
                onClick={onOpenCompetitionLeaderboard}
                icon={
                  <div className="relative flex items-center justify-center">
                    <img
                      src={displaySchoolLogo}
                      alt={`${displaySchoolName} rankings`}
                      className="h-9 w-9 rounded-lg object-cover shadow-md shadow-slate-950/40 bg-slate-800"
                      onError={(e) => { (e.target as HTMLImageElement).src = defaultSchoolIcon; }}
                    />
                    <span aria-hidden className="absolute -bottom-2 -right-2 text-xl">🏁</span>
                  </div>
                }
                label={`${displaySchoolName} Rankings`}
                subtitle="Track your house on the leaderboard"
                color="0, 160, 255"
                glowClass="glow-ion"
                className={onOpenCompetitionPlay ? 'col-span-2' : ''}
              />
            )}
            <QuestPlayButton
              onClick={onStartQuest}
              hasPendingAssignment={hasPendingAssignment}
              className="col-span-2 sm:col-span-3"
            />
            <ActionButton
              onClick={onStartPvp}
              icon={<span aria-hidden className="text-3xl">⚔️</span>}
              label="Launch Attack"
              color="255, 45, 145"
              glowClass="glow-plasma animate-pulse-glow"
            />
            {onOpenRaid && (
              <ActionButton
                onClick={onOpenRaid}
                icon={<span aria-hidden className="text-3xl">🚀</span>}
                label="Raids"
                color="72, 61, 139"
                glowClass="glow-purple"
              />
            )}
            {onOpenLockdown && (
              <ActionButton
                onClick={onOpenLockdown}
                icon={<span aria-hidden className="text-3xl">🔒</span>}
                label="Lockdown Mode"
                color="255, 69, 58"
                glowClass="glow-plasma"
                subtitle="Countdown ops sandbox"
                className="col-span-2"
              />
            )}
            <ActionButton
              onClick={onVisitShop}
              icon={<span aria-hidden className="text-3xl">🛍️</span>}
              label="Visit Shop"
              color="22, 226, 161"
              glowClass="glow-success"
            />
            {onOpenTournament && (
              <ActionButton
                onClick={onOpenTournament}
                icon={<span aria-hidden className="text-3xl animate-bounce">🥇</span>}
                label="Tournament"
                color="255, 140, 0"
                glowClass="glow-warn"
              />
            )}
            <ActionButton
              onClick={onGoToClan}
              icon={<SyndicateRune className="w-8 h-8 text-amber-400" aria-hidden />}
              label="Clan"
              color="255, 176, 32"
              glowClass="glow-warn"
              badgeText={clanBadgeCount && clanBadgeCount > 0 ? String(Math.min(clanBadgeCount, 99)) : undefined}
            />
            <ActionButton
              onClick={onVisitInventory}
              icon={<span aria-hidden className="text-3xl">🎒</span>}
              label="Inventory"
              color="158, 93, 255"
              glowClass="glow-purple"
            />
            <ActionButton
              onClick={onViewLeaderboard}
              icon={<TrophyIcon className="w-8 h-8 animate-float" aria-hidden />}
              label="Leaderboard"
              color="255, 215, 0"
              glowClass="glow-warn"
            />
            <ActionButton
              onClick={onViewAchievements}
              icon={<span aria-hidden className="text-3xl animate-float">🎖️</span>}
              label="Achievements"
              color="255, 100, 200"
              glowClass="glow-plasma"
            />
            {onOpenIeltsPrep && (
              <ActionButton
                onClick={onOpenIeltsPrep}
                icon={<span aria-hidden className="text-3xl">🎯</span>}
                label="IELTS Prep"
                color="0, 191, 255"
                glowClass="glow-ion"
                className="col-span-2"
              />
            )}
            {onOpenCambridgeTests && (
              <ActionButton
                onClick={onOpenCambridgeTests}
                icon={<span aria-hidden className="text-3xl">📚</span>}
                label="Cambridge Tests"
                subtitle="Practice reading & grammar"
                color="102, 126, 234"
                glowClass="glow-ion"
                className="col-span-2"
              />
            )}
            {onOpenAdminPortal && (
              <ActionButton
                onClick={onOpenAdminPortal}
                icon={<span aria-hidden className="text-4xl animate-spin-slow">⚡</span>}
                label="ADMIN"
                color="255, 215, 0"
                glowClass="glow-warn"
                className="col-span-2 animate-pulse-glow"
              />
            )}
            {onOpenSchoolAdmin && (
              <ActionButton
                onClick={onOpenSchoolAdmin}
                icon={<span aria-hidden className="text-4xl">🏫</span>}
                label="School Admin"
                subtitle="Manage your school"
                color="168, 85, 247"
                glowClass="glow-ion"
                className="col-span-2"
              />
            )}
            {onOpenRaidAdmin && (
              <ActionButton
                onClick={onOpenRaidAdmin}
                icon={<span aria-hidden className="text-3xl">🛡️</span>}
                label="Raid Admin"
                color="0, 191, 255"
                glowClass="glow-ion"
              />
            )}
            {onOpenCompetitionAdmin && (
              <ActionButton
                onClick={onOpenCompetitionAdmin}
                icon={
                  <div className="relative flex items-center justify-center">
                    <img
                      src={displaySchoolLogo}
                      alt={`${displaySchoolName} admin`}
                      className="h-9 w-9 rounded-lg object-cover shadow-md shadow-slate-950/40 bg-slate-800"
                      onError={(e) => { (e.target as HTMLImageElement).src = defaultSchoolIcon; }}
                    />
                    <span aria-hidden className="absolute -bottom-2 -right-2 text-xl">📊</span>
                  </div>
                }
                label={`${displaySchoolName} Admin`}
                color="0, 191, 255"
                glowClass="glow-ion"
                className="col-span-2"
              />
            )}
            {onOpenTournamentAdmin && (
              <ActionButton
                onClick={onOpenTournamentAdmin}
                icon={<span aria-hidden className="text-3xl animate-float">🎮🛰️</span>}
                label="Tournament Ops"
                color="135, 206, 250"
                glowClass="glow-ion"
                className="col-span-2"
              />
            )}
            {onOpenTeacherPortal && (
              <ActionButton
                onClick={onOpenTeacherPortal}
                icon={<span aria-hidden className="text-3xl animate-bounce">🧑‍🏫📘</span>}
                label="Teacher"
                color="100, 200, 255"
                glowClass="glow-ion"
              />
            )}
          </div>
        </div>
      </section>
    );
  };

export default MainActions;
