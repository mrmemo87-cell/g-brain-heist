import React from 'react';
import { BattleIcon, TrophyIcon } from './icons';

const silkRoadLogoPath = '/schools/silk_road/silk_road_logo.jpg';

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
  onOpenTournament?: () => void;
  onOpenTournamentAdmin?: () => void;
  onOpenCompetitionPlay?: () => void;
  onOpenCompetitionLeaderboard?: () => void;
  onOpenCompetitionAdmin?: () => void;
  onOpenIeltsPrep?: () => void;
  onOpenLockdown?: () => void;
  hasPendingAssignment?: boolean;
  clanBadgeCount?: number;
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
        <span className="absolute -top-2 -right-2 rounded-full bg-amber-400 px-2 py-0.5 text-xs font-bold text-slate-950 shadow-lg shadow-amber-400/40">
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
  onOpenTournament,
  onOpenTournamentAdmin,
  onOpenCompetitionPlay,
  onOpenCompetitionLeaderboard,
  onOpenCompetitionAdmin,
  onOpenIeltsPrep,
  onOpenLockdown,
  hasPendingAssignment,
  clanBadgeCount,
}) => {
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
              src={silkRoadLogoPath}
              alt="Silk Road school logo"
              className="h-8 w-8 rounded-full object-cover"
            />
            <div className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-slate-100">
              <span aria-hidden>🏺✨</span>
              <span>Silk Road School</span>
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
                      src={silkRoadLogoPath}
                      alt="Silk Road play"
                      className="h-9 w-9 rounded-lg object-cover shadow-md shadow-slate-950/40"
                    />
                    <span aria-hidden className="absolute -bottom-2 -right-2 text-xl">🎭</span>
                  </div>
                }
                label="Silk Road Play"
                subtitle="Jump into Silk Road story missions"
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
                      src={silkRoadLogoPath}
                      alt="Silk Road rankings"
                      className="h-9 w-9 rounded-lg object-cover shadow-md shadow-slate-950/40"
                    />
                    <span aria-hidden className="absolute -bottom-2 -right-2 text-xl">🏁</span>
                  </div>
                }
                label="Silk Road Rankings"
                subtitle="Track your house on the leaderboard"
                color="0, 160, 255"
                glowClass="glow-ion"
                className={onOpenCompetitionPlay ? 'col-span-2' : ''}
              />
            )}
            <ActionButton
              onClick={onStartQuest}
              icon={<span aria-hidden className="text-3xl">📜</span>}
              label={hasPendingAssignment ? 'Assignment Required ⚠️' : 'Start Quest'}
              subtitle={hasPendingAssignment ? 'Complete your assignment first' : undefined}
              badgeText={hasPendingAssignment ? '!' : undefined}
              color="0, 208, 232"
              glowClass={hasPendingAssignment ? 'glow-warn animate-pulse-glow' : 'glow-ion animate-pulse-glow'}
              className={hasPendingAssignment ? 'ring-2 ring-amber-300 shadow-lg shadow-amber-300/40' : ''}
            />
            <ActionButton
              onClick={onStartPvp}
              icon={<BattleIcon className="w-8 h-8" aria-hidden />}
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
              icon={<span aria-hidden className="text-3xl">🤝</span>}
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
                      src={silkRoadLogoPath}
                      alt="Silk Road admin"
                      className="h-9 w-9 rounded-lg object-cover shadow-md shadow-slate-950/40"
                    />
                    <span aria-hidden className="absolute -bottom-2 -right-2 text-xl">📊</span>
                  </div>
                }
                label="Silk Road Admin"
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
