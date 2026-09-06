import { useLanguage } from '../src/contexts/LanguageContext';
import React from 'react';
import { Caps } from '../types';
import type { Profile } from '../types';
import { isBrainsMasterActive, BM_CAP_BOOST_FACTOR } from '../src/utils/premiumHelpers';

interface ProgressBarProps {
    label: string;
    remaining: number;
    total: number;
    color: string;
    glowClass: string;
}

const ProgressBar: React.FC<ProgressBarProps> = ({ label, remaining, total, color, glowClass }) => {
    const { t, language } = useLanguage();
    const safeRemaining = Math.max(0, remaining);
    const used = Math.max(0, total - safeRemaining);
    const percent = total > 0 ? Math.min(100, (used / total) * 100) : 0;
    const atCap = remaining <= 0;

    return (
        <div className="student-cap-row">
            <div className="student-cap-row__heading">
                <span className="student-cap-row__label">{label}</span>
                <span className="student-cap-row__remaining" style={{ color: atCap ? 'var(--danger)' : undefined }}>
                  {atCap ? t("Limit reached") : t('{count} remaining', { count: safeRemaining.toLocaleString(language) })}
                </span>
            </div>
            <div className="student-cap-row__usage">
              <span>{t('{count} used', { count: used.toLocaleString(language) })}</span>
              <span>{t('{count} total', { count: total.toLocaleString(language) })}</span>
            </div>
            <div className="student-cap-row__track" role="progressbar" aria-label={t('{label}: {used} of {total} used', { label, used, total })} aria-valuemin={0} aria-valuemax={total} aria-valuenow={used}>
                <div className={`student-cap-row__fill ${glowClass}`} style={{ width: `${percent}%`, backgroundColor: color }}></div>
            </div>
        </div>
    );
};

interface CapTrackerProps {
  caps: Caps;
  profile?: Pick<Profile, 'brains_master_until'> | null;
}

const CapTracker: React.FC<CapTrackerProps> = ({ caps, profile }) => {
  const { t, language, direction } = useLanguage();
  const bmActive = profile ? isBrainsMasterActive(profile) : false;
  const totalRemaining = caps.xp_daily_remaining + caps.coins_daily_remaining + caps.xp_weekly_remaining + caps.coins_weekly_remaining;
  return (
    <details className="student-cap-card localized-ui" lang={language} dir={direction}>
      <summary className="student-cap-card__summary">
        <span className="student-cap-card__icon" aria-hidden>◫</span>
        <span className="student-cap-card__copy">
          <strong>{t("Resource limits")}</strong>
          <small>{totalRemaining > 0 ? t("Your daily and weekly allowances") : t("Allowances refresh automatically")}</small>
        </span>
        {bmActive && (
          <span className="student-cap-card__boost">⚡ {BM_CAP_BOOST_FACTOR}×</span>
        )}
        <span className="student-cap-card__chevron" aria-hidden>⌄</span>
      </summary>
      <div className="student-cap-card__body">
        <ProgressBar label={t("Daily XP")} remaining={caps.xp_daily_remaining} total={caps.daily_xp_cap} color="var(--ion-blue)" glowClass="progress-bar-glow-ion"/>
        <ProgressBar label={t("Daily Coins")} remaining={caps.coins_daily_remaining} total={caps.daily_coins_cap} color="var(--amber-warn)" glowClass="progress-bar-glow-warn"/>
        <ProgressBar label={t("Weekly XP")} remaining={caps.xp_weekly_remaining} total={caps.weekly_xp_cap} color="var(--ion-blue)" glowClass="progress-bar-glow-ion"/>
        <ProgressBar label={t("Weekly Coins")} remaining={caps.coins_weekly_remaining} total={caps.weekly_coins_cap} color="var(--amber-warn)" glowClass="progress-bar-glow-warn"/>
      </div>
    </details>
  );
};

export default CapTracker;
