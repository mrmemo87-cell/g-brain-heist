import React from 'react';
import { createPortal } from 'react-dom';

export type StudentDashboardDestination =
  | 'home'
  | 'learn'
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
  { id: 'tasks', icon: '✅', label: 'Tasks' },
  { id: 'clan', icon: '🛡️', label: 'Clan' },
  { id: 'leaderboard', icon: '🏆', label: 'Rankings' },
  { id: 'more', icon: '☰', label: 'More' },
];

const badgeFor = (
  destination: StudentDashboardDestination,
  assignmentCount: number,
  clanBadgeCount: number,
) => {
  if (destination === 'tasks' && assignmentCount > 0) return assignmentCount;
  if (destination === 'clan' && clanBadgeCount > 0) return clanBadgeCount;
  return 0;
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
  const bottomNavigation = (
    <nav className="student-dashboard-bottom-nav" aria-label="Student dashboard mobile navigation">
      {destinations.slice(0, 4).concat(destinations.slice(-1)).map((destination) => {
        const badge = badgeFor(destination.id, assignmentCount, clanBadgeCount);
        return (
          <button
            key={destination.id}
            type="button"
            className={`student-dashboard-bottom-link ${destination.id === activeDestination ? 'is-active' : ''}`}
            onClick={() => onNavigate(destination.id)}
            aria-current={destination.id === activeDestination ? 'page' : undefined}
          >
            <span className="student-dashboard-bottom-icon" aria-hidden>
              {destination.icon}
              {badge > 0 && <span className="student-dashboard-bottom-badge">{Math.min(badge, 9)}{badge > 9 ? '+' : ''}</span>}
            </span>
            <span>{destination.label}</span>
          </button>
        );
      })}
    </nav>
  );

  return (
    <>
      <aside className="student-dashboard-rail" aria-label="Student dashboard navigation">
        <button type="button" className="student-dashboard-identity" onClick={() => onNavigate('more')}>
          <span className="student-dashboard-avatar" aria-hidden>
            {avatarUrl ? <img src={avatarUrl} alt="" /> : username.slice(0, 1).toUpperCase()}
          </span>
          <span className="min-w-0">
            <strong className="block truncate text-sm text-white">{username}</strong>
            <span className="block text-xs text-slate-400">Level {level} agent</span>
          </span>
        </button>

        <nav className="student-dashboard-rail-links">
          {destinations.map((destination) => {
            const badge = badgeFor(destination.id, assignmentCount, clanBadgeCount);
            return (
              <button
                key={destination.id}
                type="button"
                className={`student-dashboard-nav-link ${destination.id === activeDestination ? 'is-active' : ''}`}
                onClick={() => onNavigate(destination.id)}
                aria-current={destination.id === activeDestination ? 'page' : undefined}
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
    </>
  );
};

export default React.memo(StudentDashboardNavigation);
