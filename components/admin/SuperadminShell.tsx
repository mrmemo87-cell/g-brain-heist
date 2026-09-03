import React, { useMemo, useState } from 'react';
import type { Profile } from '../../types';
import './SuperadminShell.css';

type NavItem = {
  id: string;
  label: string;
  description: string;
  icon: NavIconName;
};

type NavGroup = {
  label: string;
  items: NavItem[];
};

type NavIconName =
  | 'dashboard'
  | 'users'
  | 'schools'
  | 'questions'
  | 'applications'
  | 'identity'
  | 'appointments'
  | 'billing'
  | 'game'
  | 'clans'
  | 'analytics'
  | 'cambridge'
  | 'ielts'
  | 'system';

interface SuperadminShellProps {
  profile: Profile;
  activeTab: string;
  availableTabs: readonly string[];
  onTabChange: (tab: string) => void;
  applicationsUnreadTotal: number;
  isSuperadmin: boolean;
  adminVisible: boolean;
  onToggleAdminVisibility: () => void;
  onRefresh: () => Promise<void> | void;
  onLogout: () => void;
  isLoggingOut: boolean;
  children: React.ReactNode;
}

const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Core Management',
    items: [
      { id: 'dashboard', label: 'Dashboard', description: 'Platform overview and admin actions', icon: 'dashboard' },
      { id: 'users', label: 'Users', description: 'Accounts, roles, access and player state', icon: 'users' },
      { id: 'schools', label: 'Schools', description: 'School administration and memberships', icon: 'schools' },
      { id: 'question-bank', label: 'Question Bank', description: 'Protected platform question governance', icon: 'questions' },
    ],
  },
  {
    label: 'Operations',
    items: [
      { id: 'applications', label: 'Applications', description: 'School onboarding and requests', icon: 'applications' },
      { id: 'identity-requests', label: 'Identity Requests', description: 'Review identity and account requests', icon: 'identity' },
      { id: 'booked-appointments', label: 'Booked Appointments', description: 'Manage scheduled platform appointments', icon: 'appointments' },
      { id: 'billing', label: 'Billing', description: 'Programme access and billing controls', icon: 'billing' },
    ],
  },
  {
    label: 'Product & Learning',
    items: [
      { id: 'game', label: 'Game', description: 'Game economy and platform mechanics', icon: 'game' },
      { id: 'clans', label: 'Clans', description: 'Clan governance and membership', icon: 'clans' },
      { id: 'cambridge', label: 'Cambridge', description: 'Cambridge assessment administration', icon: 'cambridge' },
      { id: 'ielts', label: 'IELTS', description: 'IELTS product administration', icon: 'ielts' },
    ],
  },
  {
    label: 'Insights',
    items: [
      { id: 'analytics', label: 'Analytics', description: 'Operational and product analytics', icon: 'analytics' },
    ],
  },
  {
    label: 'Platform',
    items: [
      { id: 'system', label: 'System', description: 'Feature controls and platform settings', icon: 'system' },
    ],
  },
];

const NavIcon: React.FC<{ name: NavIconName }> = ({ name }) => {
  const common = {
    width: 18,
    height: 18,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  };

  switch (name) {
    case 'dashboard':
      return <svg {...common}><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></svg>;
    case 'users':
      return <svg {...common}><circle cx="9" cy="8" r="3" /><path d="M3.5 19c.6-3.2 2.4-5 5.5-5s4.9 1.8 5.5 5" /><path d="M15 5.7a3 3 0 0 1 0 5.6" /><path d="M16 14c2.6.3 4 2 4.5 5" /></svg>;
    case 'schools':
      return <svg {...common}><path d="M3 21h18" /><path d="M5 21V9l7-4 7 4v12" /><path d="M9 13h2v3H9zM14 13h2v3h-2z" /><path d="M10 21v-3h4v3" /></svg>;
    case 'questions':
      return <svg {...common}><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H11v16H6.5A2.5 2.5 0 0 0 4 21.5z" /><path d="M20 5.5A2.5 2.5 0 0 0 17.5 3H13v16h4.5a2.5 2.5 0 0 1 2.5 2.5z" /></svg>;
    case 'applications':
      return <svg {...common}><path d="M7 3h7l4 4v14H7z" /><path d="M14 3v5h5" /><path d="M10 12h5M10 16h5" /></svg>;
    case 'identity':
      return <svg {...common}><path d="M12 3l7 3v5c0 4.8-2.9 8.3-7 10-4.1-1.7-7-5.2-7-10V6z" /><circle cx="12" cy="10" r="2" /><path d="M8.8 15c.8-1.6 1.8-2.4 3.2-2.4s2.4.8 3.2 2.4" /></svg>;
    case 'appointments':
      return <svg {...common}><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M7 3v4M17 3v4M3 9h18" /><path d="M8 13h3M8 17h6" /></svg>;
    case 'billing':
      return <svg {...common}><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 10h18" /><path d="M7 15h4" /></svg>;
    case 'game':
      return <svg {...common}><path d="M7.5 8h9a4.5 4.5 0 0 1 4.2 6.1l-1.1 2.8a2.3 2.3 0 0 1-3.8.8L14.4 16H9.6l-1.4 1.7a2.3 2.3 0 0 1-3.8-.8l-1.1-2.8A4.5 4.5 0 0 1 7.5 8z" /><path d="M8 11v4M6 13h4" /><circle cx="16.5" cy="12" r=".7" fill="currentColor" stroke="none" /><circle cx="18.5" cy="14" r=".7" fill="currentColor" stroke="none" /></svg>;
    case 'clans':
      return <svg {...common}><path d="M12 3l7 3v5c0 4.6-2.8 8.2-7 10-4.2-1.8-7-5.4-7-10V6z" /><path d="M9 13l2 2 4-5" /></svg>;
    case 'analytics':
      return <svg {...common}><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></svg>;
    case 'cambridge':
      return <svg {...common}><path d="M3 9l9-5 9 5-9 5z" /><path d="M7 12v5c3 2 7 2 10 0v-5" /><path d="M21 9v6" /></svg>;
    case 'ielts':
      return <svg {...common}><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.4 2.5 3.6 5.5 3.6 9S14.4 18.5 12 21c-2.4-2.5-3.6-5.5-3.6-9S9.6 5.5 12 3z" /></svg>;
    case 'system':
      return <svg {...common}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6V21h-4v-.1a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H3v-4h.1a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3A1.7 1.7 0 0 0 10 3V3h4v.1a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.1v4H21a1.7 1.7 0 0 0-1.6 1z" /></svg>;
  }
};

const formatFreshness = (updatedAt: Date) => {
  const seconds = Math.max(0, Math.floor((Date.now() - updatedAt.getTime()) / 1000));
  if (seconds < 15) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  return updatedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

const SuperadminShell: React.FC<SuperadminShellProps> = ({
  profile,
  activeTab,
  availableTabs,
  onTabChange,
  applicationsUnreadTotal,
  isSuperadmin,
  adminVisible,
  onToggleAdminVisibility,
  onRefresh,
  onLogout,
  isLoggingOut,
  children,
}) => {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [sectionSearch, setSectionSearch] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState(() => new Date());

  const allowed = useMemo(() => new Set(availableTabs), [availableTabs]);
  const groups = useMemo(
    () => NAV_GROUPS.map((group) => ({ ...group, items: group.items.filter((item) => allowed.has(item.id)) })).filter((group) => group.items.length > 0),
    [allowed]
  );
  const flatItems = useMemo(() => groups.flatMap((group) => group.items), [groups]);
  const currentItem = flatItems.find((item) => item.id === activeTab) ?? flatItems[0];
  const searchResults = sectionSearch.trim()
    ? flatItems.filter((item) => `${item.label} ${item.description}`.toLowerCase().includes(sectionSearch.trim().toLowerCase())).slice(0, 6)
    : [];

  const selectTab = (tab: string) => {
    onTabChange(tab);
    setSectionSearch('');
    setMobileNavOpen(false);
  };

  const refreshView = async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await onRefresh();
      setLastUpdatedAt(new Date());
    } finally {
      setRefreshing(false);
    }
  };

  const initials = (profile.username || profile.email || 'SA')
    .split(/\s+/)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="superadmin-shell min-h-screen bg-[#07111f] text-slate-100 lg:grid lg:grid-cols-[auto_minmax(0,1fr)]">
      {mobileNavOpen && (
        <button
          type="button"
          aria-label="Close admin navigation"
          className="fixed inset-0 z-40 bg-slate-950/70 backdrop-blur-sm lg:hidden"
          onClick={() => setMobileNavOpen(false)}
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex h-screen flex-col border-r border-slate-800/90 bg-[#081321]/98 shadow-2xl shadow-black/30 transition-all duration-200 lg:sticky lg:top-0 lg:z-20 ${
          sidebarCollapsed ? 'w-[84px]' : 'w-[284px]'
        } ${mobileNavOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}
      >
        <div className="flex h-[76px] items-center gap-3 border-b border-slate-800/80 px-4">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-cyan-400/30 bg-cyan-400/10 text-cyan-300 shadow-[0_0_24px_rgba(34,211,238,0.12)]">
            <span className="text-xl" aria-hidden="true">🧠</span>
          </div>
          {!sidebarCollapsed && (
            <div className="min-w-0 flex-1">
              <p className="truncate text-[15px] font-black tracking-[0.08em] text-white">BRAIN HEIST</p>
              <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-500">Superadmin</p>
            </div>
          )}
          <button
            type="button"
            onClick={() => setSidebarCollapsed((value) => !value)}
            className="hidden h-8 w-8 shrink-0 place-items-center rounded-lg border border-slate-700/80 text-slate-400 transition hover:border-slate-600 hover:bg-slate-800 hover:text-white lg:grid"
            aria-label={sidebarCollapsed ? 'Expand navigation' : 'Collapse navigation'}
          >
            {sidebarCollapsed ? '›' : '‹'}
          </button>
        </div>

        <nav className="superadmin-nav flex-1 overflow-y-auto px-3 py-4" aria-label="Superadmin navigation">
          {groups.map((group) => (
            <div key={group.label} className="mb-5 last:mb-0">
              {!sidebarCollapsed && (
                <p className="mb-2 px-2 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-600">{group.label}</p>
              )}
              <div className="space-y-1">
                {group.items.map((item) => {
                  const active = activeTab === item.id;
                  return (
                    <button
                      type="button"
                      key={item.id}
                      onClick={() => selectTab(item.id)}
                      aria-current={active ? 'page' : undefined}
                      title={sidebarCollapsed ? item.label : undefined}
                      className={`group relative flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition ${
                        active
                          ? 'border-cyan-400/25 bg-cyan-400/10 text-white shadow-[inset_3px_0_0_rgba(34,211,238,0.9),0_8px_24px_rgba(2,132,199,0.08)]'
                          : 'border-transparent text-slate-400 hover:border-slate-800 hover:bg-slate-900/80 hover:text-slate-100'
                      } ${sidebarCollapsed ? 'justify-center' : ''}`}
                    >
                      <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${active ? 'bg-cyan-400/10 text-cyan-300' : 'text-slate-500 group-hover:text-slate-300'}`}>
                        <NavIcon name={item.icon} />
                      </span>
                      {!sidebarCollapsed && <span className="min-w-0 flex-1 truncate text-sm font-semibold">{item.label}</span>}
                      {!sidebarCollapsed && item.id === 'applications' && applicationsUnreadTotal > 0 && (
                        <span className="inline-flex min-w-6 items-center justify-center rounded-full bg-rose-500/15 px-1.5 py-0.5 text-[10px] font-bold text-rose-300 ring-1 ring-rose-400/25">
                          {Math.min(applicationsUnreadTotal, 99)}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="border-t border-slate-800/80 p-3">
          <div className={`rounded-xl border border-slate-800 bg-slate-950/35 p-2 ${sidebarCollapsed ? 'flex justify-center' : ''}`}>
            <div className="flex items-center gap-3">
              <div className="relative grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-full border border-slate-700 bg-slate-800 text-xs font-black text-slate-200">
                {profile.avatar_url ? <img src={profile.avatar_url} alt="" className="h-full w-full object-cover" /> : initials}
                <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-[#081321] bg-emerald-400" />
              </div>
              {!sidebarCollapsed && (
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-bold text-slate-100">{profile.username || profile.email || 'Superadmin'}</p>
                  <p className="truncate text-[10px] text-slate-500">Platform administration</p>
                </div>
              )}
            </div>
            {!sidebarCollapsed && (
              <button
                type="button"
                onClick={onLogout}
                disabled={isLoggingOut}
                className="mt-2 w-full rounded-lg border border-slate-800 px-2.5 py-2 text-xs font-semibold text-slate-400 transition hover:border-slate-700 hover:bg-slate-900 hover:text-white disabled:opacity-50"
              >
                {isLoggingOut ? 'Logging out…' : 'Log out'}
              </button>
            )}
          </div>
        </div>
      </aside>

      <div className="min-w-0 bg-[radial-gradient(circle_at_20%_0%,rgba(14,165,233,0.07),transparent_30%),radial-gradient(circle_at_85%_5%,rgba(139,92,246,0.06),transparent_28%)]">
        <header className="sticky top-0 z-30 border-b border-slate-800/80 bg-[#07111f]/92 backdrop-blur-xl">
          <div className="flex min-h-[76px] items-center gap-3 px-4 md:px-6 xl:px-8">
            <button
              type="button"
              onClick={() => setMobileNavOpen(true)}
              className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-slate-800 bg-slate-900/70 text-slate-300 lg:hidden"
              aria-label="Open admin navigation"
            >
              ☰
            </button>

            <div className="min-w-0 shrink-0">
              <div className="flex items-center gap-2">
                <h1 className="truncate text-lg font-bold tracking-tight text-white md:text-xl">{currentItem?.label || 'Superadmin Portal'}</h1>
                {isSuperadmin && (
                  <span className="hidden rounded-full border border-cyan-400/20 bg-cyan-400/8 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.12em] text-cyan-300 sm:inline-flex">Verified superadmin</span>
                )}
              </div>
              <p className="hidden max-w-[360px] truncate text-xs text-slate-500 sm:block">{currentItem?.description || 'Platform operations and governance'}</p>
            </div>

            <div className="relative ml-auto hidden w-full max-w-[360px] md:block">
              <svg className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
              <input
                type="search"
                value={sectionSearch}
                onChange={(event) => setSectionSearch(event.target.value)}
                placeholder="Search admin sections…"
                className="h-10 w-full rounded-xl border border-slate-800 bg-slate-950/55 pl-10 pr-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-cyan-500/45 focus:ring-2 focus:ring-cyan-500/10"
              />
              {sectionSearch.trim() && (
                <div className="absolute left-0 right-0 top-[46px] z-50 overflow-hidden rounded-xl border border-slate-700 bg-[#0b1727] p-1.5 shadow-2xl shadow-black/50">
                  {searchResults.length > 0 ? searchResults.map((item) => (
                    <button
                      type="button"
                      key={item.id}
                      onClick={() => selectTab(item.id)}
                      className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition hover:bg-slate-800/80"
                    >
                      <span className="grid h-8 w-8 place-items-center rounded-lg bg-slate-800 text-slate-300"><NavIcon name={item.icon} /></span>
                      <span className="min-w-0"><span className="block text-sm font-semibold text-white">{item.label}</span><span className="block truncate text-xs text-slate-500">{item.description}</span></span>
                    </button>
                  )) : <p className="px-3 py-4 text-sm text-slate-500">No admin section matches “{sectionSearch}”.</p>}
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={onToggleAdminVisibility}
              className={`hidden h-10 items-center gap-2 rounded-xl border px-3 text-xs font-semibold transition xl:flex ${
                adminVisible
                  ? 'border-emerald-400/20 bg-emerald-400/8 text-emerald-300 hover:bg-emerald-400/12'
                  : 'border-slate-700 bg-slate-900/70 text-slate-400 hover:border-slate-600 hover:text-slate-200'
              }`}
              title="Controls whether the admin account appears in player-facing surfaces"
            >
              <span className={`h-2 w-2 rounded-full ${adminVisible ? 'bg-emerald-400' : 'bg-slate-500'}`} />
              {adminVisible ? 'Player-visible' : 'Hidden from players'}
            </button>

            <div className="hidden shrink-0 text-right xl:block">
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-600">Last updated</p>
              <p className="mt-0.5 text-xs font-medium text-slate-400">{formatFreshness(lastUpdatedAt)}</p>
            </div>

            <button
              type="button"
              onClick={() => void refreshView()}
              disabled={refreshing}
              className="inline-flex h-10 shrink-0 items-center gap-2 rounded-xl border border-cyan-400/25 bg-cyan-400/10 px-3.5 text-xs font-bold text-cyan-200 transition hover:border-cyan-400/40 hover:bg-cyan-400/15 disabled:cursor-wait disabled:opacity-60"
            >
              <svg className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M20 11a8 8 0 1 0-2.3 5.7" /><path d="M20 4v7h-7" /></svg>
              <span className="hidden sm:inline">{refreshing ? 'Refreshing' : 'Refresh'}</span>
            </button>
          </div>
        </header>

        <main className="px-3 py-4 sm:px-4 md:px-6 md:py-6 xl:px-8">
          <div className="mx-auto w-full max-w-[1640px]">{children}</div>
        </main>
      </div>
    </div>
  );
};

export default SuperadminShell;
