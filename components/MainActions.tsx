import React, { useState, useEffect } from 'react';
import { fetchPilotQuotas, getQuotaForFeature, QUOTA_LABELS, FEATURE_TO_QUOTA, type PilotQuotaStatus, type PilotQuota } from '../services/tierService';

// Default school icon as SVG data URL
const defaultSchoolIcon = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9IiNmZmYiIHN0cm9rZS13aWR0aD0iMiIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIj48cGF0aCBkPSJNMjIgMTBWNkwxMiAyIDIgNnY0Yy4zNC0uMDguNjUtLjEgMS0uMWg1LjFsMi40NSAzLjA2YTEgMSAwIDAgMCAxLjU2IDBMMTQuNTUgOS45SDE5Ljljey4zNSAwIC42Ny4wMiAxIC4xWiIvPjxwYXRoIGQ9Ik0xMiAyMnYtNiIvPjxwYXRoIGQ9Ik00IDEwdjEwYzAgLjU1LjQ1IDEgMSAxaDE0Yy41NSAwIDEtLjQ1IDEtMVYxMCIvPjwvc3ZnPg==';

interface MainActionsProps {
  onStartQuest: () => void;
  onStartPvp: () => void;
  onOpenRaid?: () => void;
  onVisitShop: () => void;
  onGoToClan: () => void;
  onOpenRivalry?: () => void;
  onVisitInventory: () => void;
  onViewLeaderboard: () => void;
  onViewAchievements: () => void;
  onOpenRaidAdmin?: () => void;
  onOpenTeacherPortal?: () => void;
  onOpenAdminPortal?: () => void;
  onOpenSchoolAdmin?: () => void;
  onOpenAdmissions?: () => void;
  onOpenTournament?: () => void;
  onOpenTournamentAdmin?: () => void;
  onOpenCompetitionPlay?: () => void;
  onOpenCompetitionLeaderboard?: () => void;
  onOpenCompetitionAdmin?: () => void;
  onOpenIeltsPrep?: () => void;
  onOpenLockdown?: () => void;
  onOpenCambridgeTests?: () => void;
  hasPendingAssignment?: boolean;
  clanBadgeCount?: number;
  schoolName?: string | null;
  schoolLogoUrl?: string | null;
  isPro?: boolean;
  isPilot?: boolean;
  onUpgrade?: (featureLabel?: string) => void;
}

type ActionButtonProps = {
  icon: React.ReactNode;
  iconBare?: boolean;
  label: string;
  hideLabel?: boolean;
  ariaLabel?: string;
  color: string;
  glowClass: string;
  onClick?: () => void;
  className?: string;
  badgeText?: string;
  subtitle?: string;
  locked?: boolean;
  quotaInfo?: PilotQuota | null;
  quotaLabel?: string;
};

const ActionButton: React.FC<ActionButtonProps> = ({
  icon,
  iconBare = false,
  label,
  hideLabel = false,
  ariaLabel,
  color,
  glowClass,
  onClick,
  className,
  badgeText,
  subtitle,
  locked,
  quotaInfo,
  quotaLabel,
}) => {
  const quotaExhausted = quotaInfo?.exhausted === true;
  const isLocked = locked || quotaExhausted;
  const accent = `rgba(${color}, 1)`;
  const panel = isLocked ? 'rgba(100, 116, 139, 0.15)' : `rgba(${color}, 0.2)`;
  const border = isLocked ? 'rgba(100, 116, 139, 0.3)' : `rgba(${color}, 0.5)`;
  const iconPanel = isLocked
    ? 'linear-gradient(135deg, rgba(100, 116, 139, 0.4), rgba(100, 116, 139, 0.15))'
    : `linear-gradient(135deg, rgba(${color}, 0.6), rgba(${color}, 0.22))`;

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel ?? label}
      className={`dashboard-action group relative flex h-full w-full flex-col items-center justify-center overflow-hidden rounded-2xl border px-4 py-5 text-center transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 hover:-translate-y-0.5 hover:shadow-[0_18px_38px_-22px_rgba(0,0,0,0.75)] active:scale-[0.99] sm:px-5 sm:py-6 ${isLocked ? 'opacity-60' : glowClass} ${className ?? ''}`}
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
      {/* PRO lock badge (not on pilot — pilot users see quota badge instead) */}
      {locked && !quotaInfo && (
          <span className="absolute top-2 right-2 z-10 inline-flex items-center gap-1 rounded-full border border-amber-400/40 bg-gradient-to-r from-amber-500/20 to-yellow-500/20 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider text-amber-300 shadow-sm shadow-amber-400/10">
            🔒 PRO
          </span>
      )}
      {/* Quota exhausted badge (pilot users who ran out) */}
      {quotaExhausted && (
          <span className="absolute top-2 right-2 z-10 inline-flex items-center gap-1 rounded-full border border-red-400/40 bg-gradient-to-r from-red-500/20 to-orange-500/20 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider text-red-300 shadow-sm shadow-red-400/10">
            ⚡ UPGRADE
          </span>
      )}
      {/* Quota remaining badge (pilot users with quota left) */}
      {quotaInfo && !quotaExhausted && (
        <span className="absolute top-2 right-2 z-10 inline-flex items-center gap-1 rounded-full border border-cyan-400/40 bg-gradient-to-r from-cyan-500/15 to-blue-500/15 px-2 py-0.5 text-[11px] font-bold tracking-wider text-cyan-300 shadow-sm shadow-cyan-400/10">
          {quotaInfo.remaining}/{quotaInfo.limit} {quotaLabel || ''}
        </span>
      )}
      {!isLocked && badgeText && (
        <span className="absolute top-0 right-0 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-xs font-bold text-white shadow-lg animate-pulse">
          {badgeText}
        </span>
      )}
      <div
        className={`dashboard-action__icon relative z-[1] mb-2 flex h-12 w-12 items-center justify-center text-3xl sm:h-14 sm:w-14 ${iconBare ? '' : 'rounded-2xl shadow-inner shadow-slate-950/60 ring-1 ring-white/10'}`}
        style={{
          background: iconBare ? 'transparent' : iconPanel,
          color: '#030712',
          boxShadow: iconBare ? 'none' : `inset 0 1px 0 rgba(255, 255, 255, 0.08), 0 12px 22px -14px ${accent}`,
        }}
      >
        {icon}
      </div>
      {!hideLabel && (
        <span className="dashboard-action__label relative z-[1] font-heading text-sm font-semibold tracking-wide text-white sm:text-base">
          {label}
        </span>
      )}
      {!hideLabel && subtitle && (
        <span className="dashboard-action__subtitle relative z-[1] mt-2 max-w-[160px] text-xs leading-snug text-slate-200/90 sm:text-sm">
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
          {hasPendingAssignment ? 'Assignments pending — choose now or play quests' : 'Launch a new quest'}
        </span>
      </div>
      <span className="quest-play-button__arrow" aria-hidden>
        ▶
      </span>
      {hasPendingAssignment && (
        <span className="quest-play-button__warning">Assignments Pending</span>
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
  onOpenRivalry,
  onVisitInventory,
  onViewLeaderboard,
  onViewAchievements,
  onOpenRaidAdmin,
  onOpenTeacherPortal,
  onOpenAdminPortal,
  onOpenSchoolAdmin,
  onOpenAdmissions,
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
  isPro: isProUser = false,
  isPilot: isPilotPlan = false,
  onUpgrade,
}) => {
  const [pilotQuotas, setPilotQuotas] = useState<PilotQuotaStatus | null>(null);
  const [showMore, setShowMore] = useState(false);

  // Fetch pilot quotas on mount (only if on pilot plan)
  useEffect(() => {
    if (!isPilotPlan) { setPilotQuotas(null); return; }
    let cancelled = false;
    fetchPilotQuotas().then((q) => { if (!cancelled) setPilotQuotas(q); });
    return () => { cancelled = true; };
  }, [isPilotPlan]);

  const locked = !isProUser;

  // Get quota info for a feature label (only relevant for pilot)
  const q = (featureLabel: string): PilotQuota | null => {
    if (!isPilotPlan || !pilotQuotas) return null;
    return getQuotaForFeature(featureLabel, pilotQuotas);
  };

  // Get short label for quota badge
  const ql = (featureLabel: string): string => {
    const fid = FEATURE_TO_QUOTA[featureLabel];
    return fid ? (QUOTA_LABELS[fid] || '') : '';
  };

  const handleLocked = (featureLabel: string) => () => {
    if (onUpgrade) onUpgrade(featureLabel);
  };

  // For pilot: if quota exhausted, show upgrade modal; otherwise allow through
  const handlePilotClick = (featureLabel: string, realHandler?: () => void) => () => {
    const quota = q(featureLabel);
    if (quota?.exhausted) {
      if (onUpgrade) onUpgrade(`${featureLabel} — usage limit reached on Pilot plan`);
      return;
    }
    realHandler?.();
  };
  const displaySchoolName = schoolName || 'My School';
  const displaySchoolLogo = schoolLogoUrl || defaultSchoolIcon;
  const missionIconClass = 'h-28 w-28 object-contain sm:h-32 sm:w-32';
  
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
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
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
            {/* ── Primary actions (always visible) ── */}
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
                className="col-span-2 sm:col-span-3"
              />
            )}
            <QuestPlayButton
              onClick={onStartQuest}
              hasPendingAssignment={hasPendingAssignment}
              className="col-span-2 sm:col-span-3"
            />
            <ActionButton
              onClick={locked ? handleLocked('Launch Attack') : handlePilotClick('Launch Attack', onStartPvp)}
              icon={<img src="/mission-console-images/attack.webp" alt="" className={missionIconClass} loading="eager" decoding="sync" fetchPriority="high" aria-hidden />}
              iconBare
              label="Launch Attack"
              color="255, 45, 145"
              glowClass="glow-plasma animate-pulse-glow"
              locked={locked}
              quotaInfo={q('Launch Attack')}
              quotaLabel={ql('Launch Attack')}
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
                onClick={handlePilotClick('Lockdown Mode', onOpenLockdown)}
                icon={<img src="/mission-console-images/lockdown.webp" alt="" className={missionIconClass} loading="eager" decoding="sync" fetchPriority="high" aria-hidden />}
                iconBare
                label="Lockdown Mode"
                color="255, 69, 58"
                glowClass="glow-plasma"
                className="col-span-2"
                quotaInfo={q('Lockdown Mode')}
                quotaLabel={ql('Lockdown Mode')}
              />
            )}
            <ActionButton
              onClick={locked ? handleLocked('Visit Shop') : handlePilotClick('Visit Shop', onVisitShop)}
              icon={<img src="/mission-console-images/shop.webp" alt="" className={missionIconClass} loading="eager" decoding="sync" fetchPriority="high" aria-hidden />}
              iconBare
              label="Visit Shop"
              color="22, 226, 161"
              glowClass="glow-success"
              locked={locked}
              quotaInfo={q('Visit Shop')}
              quotaLabel={ql('Visit Shop')}
            />
            <ActionButton
              onClick={locked ? handleLocked('Tournaments') : handlePilotClick('Tournament', onOpenTournament)}
              icon={<img src="/mission-console-images/tournament.webp" alt="" className={missionIconClass} loading="eager" decoding="sync" fetchPriority="high" aria-hidden />}
              iconBare
              label="Tournament"
              hideLabel
              ariaLabel="Tournament"
              color="255, 140, 0"
              glowClass="glow-warn"
              locked={locked}
              quotaInfo={q('Tournament')}
              quotaLabel={ql('Tournament')}
            />
            <ActionButton
              onClick={locked ? handleLocked('Clans') : handlePilotClick('Clan', onGoToClan)}
              icon={<img src="/mission-console-images/clan.webp" alt="" className={missionIconClass} loading="eager" decoding="sync" fetchPriority="high" aria-hidden />}
              iconBare
              label="Clan"
              hideLabel
              ariaLabel="Clan"
              color="255, 176, 32"
              glowClass="glow-warn"
              badgeText={!locked && clanBadgeCount && clanBadgeCount > 0 ? String(Math.min(clanBadgeCount, 99)) : undefined}
              locked={locked}
              quotaInfo={q('Clan')}
              quotaLabel={ql('Clan')}
            />
            {onOpenRivalry && (
              <ActionButton
                onClick={locked ? handleLocked('Rivalry Protocol') : handlePilotClick('Clan', onOpenRivalry)}
                icon={<span aria-hidden className="text-3xl">🛡️</span>}
                label="Rivalry"
                color="220, 38, 38"
                glowClass="glow-plasma"
                subtitle="Clan Wars V1"
                locked={locked}
                quotaInfo={q('Clan')}
                quotaLabel={ql('Clan')}
              />
            )}
          </div>

          {/* ── "More" collapsible section ── */}
          <button
            type="button"
            onClick={() => setShowMore((v) => !v)}
            className="group flex w-full items-center justify-center gap-2 rounded-xl border border-slate-800/60 bg-slate-900/40 px-4 py-2.5 text-sm font-semibold text-slate-300 transition-colors hover:border-slate-700 hover:bg-slate-800/50 hover:text-white"
          >
            {showMore ? '▲ Less' : '▼ More features'}
          </button>

          {showMore && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
            <ActionButton
              onClick={locked ? handleLocked('Inventory') : handlePilotClick('Inventory', onVisitInventory)}
              icon={<img src="/mission-console-images/inventory.webp" alt="" className={missionIconClass} loading="eager" decoding="sync" fetchPriority="high" aria-hidden />}
              iconBare
              label="Inventory"
              hideLabel
              ariaLabel="Inventory"
              color="158, 93, 255"
              glowClass="glow-purple"
              locked={locked}
              quotaInfo={q('Inventory')}
              quotaLabel={ql('Inventory')}
            />
            <ActionButton
              onClick={locked ? handleLocked('Leaderboard') : handlePilotClick('Leaderboard', onViewLeaderboard)}
              icon={<img src="/mission-console-images/leaderboard.webp" alt="" className={missionIconClass} loading="eager" decoding="sync" fetchPriority="high" aria-hidden />}
              iconBare
              label="Leaderboard"
              hideLabel
              ariaLabel="Leaderboard"
              color="255, 215, 0"
              glowClass="glow-warn"
              locked={locked}
              quotaInfo={q('Leaderboard')}
              quotaLabel={ql('Leaderboard')}
            />
            <ActionButton
              onClick={locked ? handleLocked('Achievements') : handlePilotClick('Achievements', onViewAchievements)}
              icon={<img src="/mission-console-images/achievements.webp" alt="" className={missionIconClass} loading="eager" decoding="sync" fetchPriority="high" aria-hidden />}
              iconBare
              label="Achievements"
              hideLabel
              ariaLabel="Achievements"
              color="255, 100, 200"
              glowClass="glow-plasma"
              locked={locked}
              quotaInfo={q('Achievements')}
              quotaLabel={ql('Achievements')}
            />
            <ActionButton
              onClick={locked ? handleLocked('IELTS Prep') : handlePilotClick('IELTS Prep', onOpenIeltsPrep)}
              icon={<img src="/mission-console-images/ielts-prep.webp" alt="" className={missionIconClass} loading="eager" decoding="sync" fetchPriority="high" aria-hidden />}
              iconBare
              label="IELTS Prep"
              hideLabel
              ariaLabel="IELTS Prep"
              color="0, 191, 255"
              glowClass="glow-ion"
              className="col-span-2"
              locked={locked}
              quotaInfo={q('IELTS Prep')}
              quotaLabel={ql('IELTS Prep')}
            />
            <ActionButton
              onClick={locked ? handleLocked('Cambridge Tests') : handlePilotClick('Cambridge Tests', onOpenCambridgeTests)}
              icon={<img src="/mission-console-images/cambridge-tests.webp" alt="" className={missionIconClass} loading="eager" decoding="sync" fetchPriority="high" aria-hidden />}
              iconBare
              label="Cambridge Tests"
              hideLabel
              ariaLabel="Cambridge Tests"
              subtitle="Practice reading & grammar"
              color="102, 126, 234"
              glowClass="glow-ion"
              className="col-span-2"
              locked={locked}
              quotaInfo={q('Cambridge Tests')}
              quotaLabel={ql('Cambridge Tests')}
            />

            {/* ── Admin / staff actions ── */}
            {onOpenAdminPortal && (
              <ActionButton
                onClick={onOpenAdminPortal}
                icon={<span aria-hidden className="text-4xl">⚡</span>}
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
            {onOpenAdmissions && (
              <ActionButton
                onClick={onOpenAdmissions}
                icon={<span aria-hidden className="text-4xl">🎓</span>}
                label="Admissions"
                subtitle="Entrance tests & placement"
                color="234, 179, 8"
                glowClass="glow-warn"
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
                icon={<span aria-hidden className="text-3xl">🎮🛰️</span>}
                label="Tournament Ops"
                color="135, 206, 250"
                glowClass="glow-ion"
                className="col-span-2"
              />
            )}
            {onOpenTeacherPortal && (
              <ActionButton
                onClick={onOpenTeacherPortal}
                icon={<span aria-hidden className="text-3xl">🧑‍🏫📘</span>}
                label="Teacher"
                color="100, 200, 255"
                glowClass="glow-ion"
              />
            )}
          </div>
          )}
        </div>
      </section>
    );
  };

export default React.memo(MainActions);
