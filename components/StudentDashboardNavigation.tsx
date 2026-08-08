import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSmartCollapsedNavigation } from '../src/hooks/useSmartCollapsedNavigation';
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

const destinations: Array<{ id: StudentDashboardDestination; icon: string; label: string }> = [
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
  const {
    navigationRef,
    revealNavigation,
  } = useSmartCollapsedNavigation(activeDestination, STUDENT_MOBILE_NAV_QUERY);

  const navigate = (destination: StudentDashboardDestination) => {
    revealNavigation();
    onNavigate(destination);
  };

  return (
    <nav
      ref={navigationRef}
      className="student-dashboard-bottom-nav"
      onFocus={revealNavigation}
      aria-label="Student dashboard mobile navigation"
    >
      <button
        type="button"
        className="smart-mobile-nav-reveal"
        onClick={revealNavigation}
        aria-label="Show student navigation"
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
            aria-label={destination.label}
            aria-current={destination.id === activeDestination ? 'page' : undefined}
          >
            <span className="student-dashboard-bottom-icon" aria-hidden>
              {destination.icon}
              {badge > 0 && <span className="student-dashboard-bottom-badge">{Math.min(badge, 9)}{badge > 9 ? '+' : ''}</span>}
            </span>
            <span className="student-dashboard-bottom-label">{destination.label}</span>
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
  const [sidebarCollapsed, setSidebarCollapsed] = useState(getInitialSidebarCollapsed);
  const [navTooltip, setNavTooltip] = useState<{ label: string; anchor: HTMLElement } | null>(null);

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
      <aside className={`student-dashboard-rail ${sidebarCollapsed ? 'is-collapsed' : ''}`} aria-label="Student dashboard navigation">
        <button
          type="button"
          className="student-dashboard-sidebar-toggle"
          onClick={toggleSidebar}
          aria-label={sidebarCollapsed ? 'Expand side navigation' : 'Collapse side navigation'}
          aria-expanded={!sidebarCollapsed}
          aria-controls="student-primary-navigation"
          title={sidebarCollapsed ? 'Expand navigation' : 'Collapse navigation'}
        >
          <span className="student-dashboard-sidebar-toggle__icon" aria-hidden>{sidebarCollapsed ? '›' : '‹'}</span>
          <span>{sidebarCollapsed ? 'Expand' : 'Collapse'}</span>
        </button>

        <button type="button" className="student-dashboard-identity" onClick={() => onNavigate('more')} title={sidebarCollapsed ? username : undefined}>
          <span className="student-dashboard-avatar" aria-hidden>
            {avatarUrl ? <img src={avatarUrl} alt="" /> : username.slice(0, 1).toUpperCase()}
          </span>
          <span className="min-w-0">
            <strong className="block truncate text-sm text-white">{username}</strong>
            <span className="block text-xs text-slate-400">Level {level} agent</span>
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
                aria-label={destination.label}
                title={sidebarCollapsed ? destination.label : undefined}
                data-label={destination.label}
                onMouseEnter={(event) => sidebarCollapsed && setNavTooltip({ label: destination.label, anchor: event.currentTarget })}
                onMouseLeave={() => setNavTooltip(null)}
                onFocus={(event) => sidebarCollapsed && setNavTooltip({ label: destination.label, anchor: event.currentTarget })}
                onBlur={() => setNavTooltip(null)}
              >
                <span className="student-dashboard-nav-icon" aria-hidden>{destination.icon}</span>
                <span className="student-dashboard-nav-label">{destination.label}</span>
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
