import { useLanguage } from '../src/contexts/LanguageContext';
import React, { useState, useEffect } from 'react';
import { fetchPilotQuotas, getQuotaForFeature, QUOTA_LABELS, FEATURE_TO_QUOTA, type PilotQuotaStatus, type PilotQuota } from '../services/tierService';
import { visualAssets, neonIcon } from './visualAssets';

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
  isIndividual?: boolean;
  profile?: import('../types').Profile | null;
  onUpgrade?: (featureLabel?: string) => void;
  onJoinSchool?: () => void;
}

type ActionButtonProps = {
  icon: React.ReactNode;
  iconBare?: boolean;
  label: string;
  hideLabel?: boolean;
  ariaLabel?: string;
  containerBare?: boolean;
  circleIcon?: boolean;
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
  containerBare: requestedContainerBare = false,
  circleIcon = false,
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
  // Keep every console in a clear, consistently sized premium card.
  const containerBare = false;
  void requestedContainerBare;
  const quotaExhausted = quotaInfo?.exhausted === true;
  const isLocked = locked || quotaExhausted;
  const accent = `rgba(${color}, 1)`;
  const panel = isLocked ? 'rgba(100, 116, 139, 0.15)' : `rgba(${color}, 0.2)`;
  const border = isLocked ? 'rgba(100, 116, 139, 0.3)' : `rgba(${color}, 0.5)`;
  const iconPanel = isLocked
    ? 'linear-gradient(135deg, rgba(100, 116, 139, 0.4), rgba(100, 116, 139, 0.15))'
    : `linear-gradient(135deg, rgba(${color}, 0.6), rgba(${color}, 0.22))`;
  const containerBackground = containerBare
    ? 'rgba(15, 23, 42, 0.38)'
    : `radial-gradient(circle at 18% 16%, rgba(255,255,255,0.06), transparent 30%), radial-gradient(circle at 82% 12%, rgba(255,255,255,0.05), transparent 26%), linear-gradient(150deg, ${panel}, rgba(15, 23, 42, 0.7))`;
  const containerBoxShadow = containerBare ? 'none' : `0 18px 30px -22px ${accent}`;

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel ?? label}
      className={`dashboard-action group relative flex h-full w-full flex-col items-center justify-center overflow-hidden text-center transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 active:scale-[0.99] ${containerBare ? 'rounded-none border-0 bg-transparent px-0 py-0 shadow-none hover:translate-y-0 hover:shadow-none sm:px-0 sm:py-0' : 'rounded-2xl border px-4 py-5 hover:-translate-y-0.5 hover:shadow-[0_18px_38px_-22px_rgba(0,0,0,0.75)] sm:px-5 sm:py-6'} ${isLocked ? 'opacity-60' : glowClass} ${className ?? ''}`}
      style={{
        background: containerBare ? 'transparent' : containerBackground,
        borderColor: containerBare ? 'transparent' : border,
        boxShadow: containerBare ? 'none' : containerBoxShadow,
      }}
    >
      {!containerBare && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-50 transition-opacity duration-500 group-hover:opacity-80"
          style={{
            background:
              'radial-gradient(circle at 20% 40%, rgba(255,255,255,0.04) 0 30%, transparent 45%), radial-gradient(circle at 80% 60%, rgba(255,255,255,0.04) 0 26%, transparent 50%)',
          }}
        />
      )}
      {/* PRO lock badge (not on pilot — pilot users see quota badge instead) */}
      {locked && !quotaInfo && (
          <span className="absolute top-2 right-2 z-10 inline-flex items-center gap-1 rounded-full border border-amber-400/40 bg-gradient-to-r from-amber-500/20 to-yellow-500/20 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider text-amber-300 shadow-sm shadow-amber-400/10">
            <img src={neonIcon('premium', 'accent', 'svg')} alt="" className="h-3.5 w-3.5" /> PRO
          </span>
      )}
      {/* Soft-lock dim overlay for locked cards */}
      {locked && (
        <img
          src={visualAssets.prime.softLock}
          alt=""
          className="pointer-events-none absolute inset-0 z-[1] h-full w-full rounded-2xl object-cover opacity-[0.08]"
        />
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
        className={`dashboard-action__icon relative z-[1] flex items-center justify-center ${circleIcon ? 'h-full w-full mb-0' : 'mb-2 h-12 w-12 text-3xl sm:h-14 sm:w-14'} ${iconBare ? '' : 'rounded-2xl shadow-inner shadow-slate-950/60 ring-1 ring-white/10'}`}
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
    <button type="button" onClick={onClick} className={classes} data-testid="dashboard-start-quest">
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
  isIndividual = false,
  profile: _profile,
  onUpgrade,
}) => {
  const { t } = useLanguage();
  const [pilotQuotas, setPilotQuotas] = useState<PilotQuotaStatus | null>(null);

  // Fetch pilot quotas on mount (only if on pilot plan)
  useEffect(() => {
    if (!isPilotPlan) { setPilotQuotas(null); return; }
    let cancelled = false;
    fetchPilotQuotas().then((q) => { if (!cancelled) setPilotQuotas(q); });
    return () => { cancelled = true; };
  }, [isPilotPlan]);

  // Individuals (no school) get free access to core competitive features
  const locked = !isProUser && !isIndividual;

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

  // Pilot quotas are usage signals only; access lasts for the full 30 days.
  const handlePilotClick = (featureLabel: string, realHandler?: () => void) => () => {
    realHandler?.();
  };
  const displaySchoolName = schoolName || 'My School';
  const displaySchoolLogo = schoolLogoUrl || defaultSchoolIcon;
  const missionCardClass = 'min-h-[10rem] sm:min-h-[11rem]';
  const missionIconClass = 'h-24 w-24 object-contain drop-shadow-[0_0_22px_rgba(255,255,255,0.35)] brightness-110 contrast-110 saturate-125 sm:h-28 sm:w-28';
  
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
      <div className="relative grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
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
              label={t("Launch Attack")}
              circleIcon
              hideLabel
              className={missionCardClass}
              containerBare
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
                label={t("Raids")}
                color="72, 61, 139"
                glowClass="glow-purple"
              />
            )}
            <ActionButton
              onClick={locked ? handleLocked('Visit Shop') : handlePilotClick('Visit Shop', onVisitShop)}
              icon={<img src="/mission-console-images/shop.webp" alt="" className={missionIconClass} loading="eager" decoding="sync" fetchPriority="high" aria-hidden />}
              iconBare
              label={t("Visit Shop")}
              circleIcon
              hideLabel
              className={missionCardClass}
              containerBare
              color="22, 226, 161"
              glowClass="glow-success"
              locked={locked}
              quotaInfo={q('Visit Shop')}
              quotaLabel={ql('Visit Shop')}
            />
            <ActionButton
              onClick={locked ? handleLocked('Leaderboard') : handlePilotClick('Leaderboard', onViewLeaderboard)}
              icon={<img src="/mission-console-images/leaderboard.webp" alt="" className={missionIconClass} loading="eager" decoding="sync" fetchPriority="high" aria-hidden />}
              iconBare
              label={t("Leaderboard")}
              circleIcon
              hideLabel
              className={missionCardClass}
              containerBare
              ariaLabel={t("Leaderboard")}
              color="255, 215, 0"
              glowClass="glow-warn"
              locked={locked}
              quotaInfo={q('Leaderboard')}
              quotaLabel={ql('Leaderboard')}
            />
            <ActionButton
              onClick={locked ? handleLocked('Clans') : handlePilotClick('Clan', onGoToClan)}
              icon={<img src="/mission-console-images/clan.webp" alt="" className={missionIconClass} loading="eager" decoding="sync" fetchPriority="high" aria-hidden />}
              iconBare
              label={t("Clan")}
              circleIcon
              hideLabel
              className={missionCardClass}
              containerBare
              ariaLabel={t("Clan")}
              color="255, 176, 32"
              glowClass="glow-warn"
              badgeText={!locked && clanBadgeCount && clanBadgeCount > 0 ? String(Math.min(clanBadgeCount, 99)) : undefined}
              locked={locked}
              quotaInfo={q('Clan')}
              quotaLabel={ql('Clan')}
            />
            <ActionButton
              onClick={locked ? handleLocked('Inventory') : handlePilotClick('Inventory', onVisitInventory)}
              icon={<img src="/mission-console-images/inventory.webp" alt="" className={missionIconClass} loading="eager" decoding="sync" fetchPriority="high" aria-hidden />}
              iconBare
              label={t("Inventory")}
              circleIcon
              hideLabel
              className={missionCardClass}
              containerBare
              ariaLabel={t("Inventory")}
              color="158, 93, 255"
              glowClass="glow-purple"
              locked={locked}
              quotaInfo={q('Inventory')}
              quotaLabel={ql('Inventory')}
            />
            <ActionButton
              onClick={locked ? handleLocked('Achievements') : handlePilotClick('Achievements', onViewAchievements)}
              icon={<img src="/mission-console-images/achievements.webp" alt="" className={missionIconClass} loading="eager" decoding="sync" fetchPriority="high" aria-hidden />}
              iconBare
              label={t("Achievements")}
              circleIcon
              hideLabel
              className={missionCardClass}
              containerBare
              ariaLabel={t("Achievements")}
              color="255, 100, 200"
              glowClass="glow-plasma"
              locked={locked}
              quotaInfo={q('Achievements')}
              quotaLabel={ql('Achievements')}
            />
            {onOpenLockdown && (
              <ActionButton
                onClick={handlePilotClick('Lockdown Mode', onOpenLockdown)}
                icon={<img src="/mission-console-images/lockdown.webp" alt="" className={missionIconClass} loading="eager" decoding="sync" fetchPriority="high" aria-hidden />}
                iconBare
                label={t("Lockdown Mode")}
                circleIcon
                hideLabel
                className={`${missionCardClass} col-span-2 w-[calc(50%-0.375rem)] justify-self-center sm:col-span-1 sm:col-start-2 sm:w-full`}
                containerBare
                color="255, 69, 58"
                glowClass="glow-plasma"
                quotaInfo={q('Lockdown Mode')}
                quotaLabel={ql('Lockdown Mode')}
              />
            )}
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
                label={t("Teacher")}
                color="100, 200, 255"
                glowClass="glow-ion"
              />
            )}
        </div>
      </section>
    );
  };

export default React.memo(MainActions);
