import { useLanguage } from '../src/contexts/LanguageContext';
import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSmartCollapsedNavigation } from '../src/hooks/useSmartCollapsedNavigation';
import type { MessageKey } from '../src/i18n/messages';
import CollapsedNavTooltip from './CollapsedNavTooltip';

export type StudentDashboardDestination =
  | 'home'
  | 'learn'
  | 'game'
  | 'tournaments'
  | 'tasks'
  | 'clan'
  | 'leaderboard'
  | 'more';

type StudentDashboardNavigationProps = {
  username: string;
  level: number;
  avatarUrl?: string | null;
  assignmentCount: number;
  clanBadgeCount: number;
  activeDestination: StudentDashboardDestination;
  onNavigate: (destination: StudentDashboardDestination) => void;
};

const destinations: Array<{ id: StudentDashboardDestination; icon: string; label: MessageKey }> = [
  { id: 'home', icon: '🏠', label: 'Home' },
  { id: 'learn', icon: '📚', label: 'Learn' },
  { id: 'game', icon: '🎮', label: 'Game' },
  { id: 'tournaments', icon: '🏅', label: 'Tournaments' },
  { id: 'tasks', icon: '✅', label: 'Tasks' },
  { id: 'clan', icon: '🛡️', label: 'Clan' },
  { id: 'leaderboard', icon: '🏆', label: 'Leaderboard' },
  { id: 'more', icon: '☰', label: 'More' },
];

const mobileDestinations = destinations.filter(({ id }) => ['home', 'learn', 'game', 'clan', 'more'].includes(id));
const STUDENT_SIDEBAR_STORAGE_KEY = 'brains-heist:student-sidebar-collapsed';
const STUDENT_MOBILE_NAV_QUERY = '(max-width: 1024px)';
const STUDENT_SIDEBAR_COMPACT_QUERY = '(min-width: 1025px) and (max-width: 1279px)';

const getInitialSidebarCollapsed = () => {
  if (typeof window === 'undefined') return false;

  const savedPreference = window.localStorage.getItem(STUDENT_SIDEBAR_STORAGE_KEY);
  if (savedPreference !== null) return savedPreference === 'true';

  return window.matchMedia(STUDENT_SIDEBAR_COMPACT_QUERY).matches;
};

const badgeFor = (
  destination: StudentDashboardDestination,
  assignmentCount: number,
  clanBadgeCount: number,
) => {
  if (destination === 'tasks' && assignmentCount > 0) return assignmentCount;
  if (destination === 'clan' && clanBadgeCount > 0) return clanBadgeCount;
  return 0;
};

type StudentMobileBottomNavigationProps = Pick<StudentDashboardNavigationProps,
  'assignmentCount' | 'clanBadgeCount' | 'activeDestination' | 'onNavigate'
>;

const StudentMobileBottomNavigation: React.FC<StudentMobileBottomNavigationProps> = ({
  assignmentCount,
  clanBadgeCount,
  activeDestination,
  onNavigate,
}) => {
  const { t, language, direction } = useLanguage();
  const {
    navigationRef,
    revealNavigation,
  } = useSmartCollapsedNavigation(activeDestination, STUDENT_MOBILE_NAV_QUERY);

  const navigate = (destination: StudentDashboardDestination) => {
    revealNavigation();
    onNavigate(destination);
  };

  const activeIndex = Math.max(
    0,
    mobileDestinations.findIndex(({ id }) => id === activeDestination),
  );

  return (
    <nav
      ref={navigationRef}
      data-testid="dashboard-navigation-mobile"
      className="student-dashboard-bottom-nav localized-ui" lang={language} dir={direction}
      style={{ '--student-nav-active-index': direction === 'rtl' ? mobileDestinations.length - 1 - activeIndex : activeIndex } as React.CSSProperties}
      onFocus={revealNavigation}
      aria-label={t("Student dashboard mobile navigation")}
    >
      <button
        type="button"
        className="smart-mobile-nav-reveal"
        onClick={revealNavigation}
        aria-label={t("Show student navigation")}
      >
        <span aria-hidden="true" />
      </button>
      {mobileDestinations.map((destination) => {
        const badge = badgeFor(destination.id, assignmentCount, clanBadgeCount);
        return (
          <button
            key={destination.id}
            type="button"
            className={`student-dashboard-bottom-link ${destination.id === activeDestination ? 'is-active' : ''}`}
            onClick={() => navigate(destination.id)}
            aria-label={t(destination.label)}
            aria-current={destination.id === activeDestination ? 'page' : undefined}
          >
            <span className="student-dashboard-bottom-icon" aria-hidden>
              {destination.icon}
              {badge > 0 && <span className="student-dashboard-bottom-badge">{Math.min(badge, 9)}{badge > 9 ? '+' : ''}</span>}
            </span>
            <span className="student-dashboard-bottom-label">{t(destination.label)}</span>
          </button>
        );
      })}
    </nav>
  );
};

const StudentDashboardNavigation: React.FC<StudentDashboardNavigationProps> = ({
  username,
  level,
  avatarUrl,
  assignmentCount,
  clanBadgeCount,
  activeDestination,
  onNavigate,
}) => {
  const { t, language, direction } = useLanguage();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(getInitialSidebarCollapsed);
  const [navTooltip, setNavTooltip] = useState<{ label: string; anchor: HTMLElement } | null>(null);

  useEffect(() => { setNavTooltip(null); }, [language]);

  useEffect(() => {
    const compactViewport = window.matchMedia(STUDENT_SIDEBAR_COMPACT_QUERY);
    const adaptSidebarToViewport = (event: MediaQueryListEvent) => {
      if (window.localStorage.getItem(STUDENT_SIDEBAR_STORAGE_KEY) === null) {
        setSidebarCollapsed(event.matches);
      }
    };

    compactViewport.addEventListener('change', adaptSidebarToViewport);
    return () => compactViewport.removeEventListener('change', adaptSidebarToViewport);
  }, []);

  const toggleSidebar = () => {
    setSidebarCollapsed((collapsed) => {
      const nextCollapsed = !collapsed;
      window.localStorage.setItem(STUDENT_SIDEBAR_STORAGE_KEY, String(nextCollapsed));
      return nextCollapsed;
    });
  };

  const bottomNavigation = (
    <StudentMobileBottomNavigation
      assignmentCount={assignmentCount}
      clanBadgeCount={clanBadgeCount}
      activeDestination={activeDestination}
      onNavigate={onNavigate}
    />
  );

  return (
    <>
      <aside data-testid="dashboard-navigation-desktop" lang={language} dir={direction} className={`localized-ui student-dashboard-rail ${sidebarCollapsed ? 'is-collapsed' : ''}`} aria-label={t("Student dashboard navigation")}>
        <button
          type="button"
          className="student-dashboard-sidebar-toggle"
          onClick={toggleSidebar}
          aria-label={sidebarCollapsed ? t("Expand side navigation") : t("Collapse side navigation")}
          aria-expanded={!sidebarCollapsed}
          aria-controls="student-primary-navigation"
          title={sidebarCollapsed ? t("Expand navigation") : t("Collapse navigation")}
        >
          <span className="student-dashboard-sidebar-toggle__icon" aria-hidden>{(sidebarCollapsed !== (direction === 'rtl')) ? '›' : '‹'}</span>
          <span>{sidebarCollapsed ? t("Expand") : t("Collapse")}</span>
        </button>

        <button type="button" className="student-dashboard-identity" onClick={() => onNavigate('more')} title={sidebarCollapsed ? username : undefined}>
          <span className="student-dashboard-avatar" aria-hidden>
            {avatarUrl ? <img src={avatarUrl} alt="" /> : username.slice(0, 1).toUpperCase()}
          </span>
          <span className="min-w-0">
            <strong className="block truncate text-sm text-white">{username}</strong>
            <span className="block text-xs text-slate-400">{t('Level {level} agent', { level })}</span>
          </span>
        </button>

        <nav id="student-primary-navigation" className="student-dashboard-rail-links">
          {destinations.map((destination) => {
            const badge = badgeFor(destination.id, assignmentCount, clanBadgeCount);
            return (
              <button
                key={destination.id}
                type="button"
                className={`student-dashboard-nav-link ${destination.id === activeDestination ? 'is-active' : ''}`}
                onClick={() => onNavigate(destination.id)}
                aria-current={destination.id === activeDestination ? 'page' : undefined}
                aria-label={t(destination.label)}
                title={sidebarCollapsed ? t(destination.label) : undefined}
                data-label={t(destination.label)}
                onMouseEnter={(event) => sidebarCollapsed && setNavTooltip({ label: t(destination.label), anchor: event.currentTarget })}
                onMouseLeave={() => setNavTooltip(null)}
                onFocus={(event) => sidebarCollapsed && setNavTooltip({ label: t(destination.label), anchor: event.currentTarget })}
                onBlur={() => setNavTooltip(null)}
              >
                <span className="student-dashboard-nav-icon" aria-hidden>{destination.icon}</span>
                <span className="student-dashboard-nav-label">{t(destination.label)}</span>
                {badge > 0 && <span className="student-dashboard-nav-badge">{Math.min(badge, 99)}</span>}
              </button>
            );
          })}
        </nav>
      </aside>

      {typeof document !== 'undefined' && createPortal(bottomNavigation, document.body)}
      {navTooltip && <CollapsedNavTooltip label={navTooltip.label} anchor={navTooltip.anchor} />}
    </>
  );
};

export const StudentDashboardBottomNavigation: React.FC<Pick<StudentDashboardNavigationProps,
  'assignmentCount' | 'clanBadgeCount' | 'activeDestination' | 'onNavigate'
>> = ({ assignmentCount, clanBadgeCount, activeDestination, onNavigate }) => {
  if (typeof document === 'undefined') return null;

  return createPortal(
    <StudentMobileBottomNavigation
      assignmentCount={assignmentCount}
      clanBadgeCount={clanBadgeCount}
      activeDestination={activeDestination}
      onNavigate={onNavigate}
    />,
    document.body,
  );
};

export default React.memo(StudentDashboardNavigation);
