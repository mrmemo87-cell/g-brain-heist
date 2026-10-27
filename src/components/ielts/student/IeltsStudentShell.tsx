import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useSmartCollapsedNavigation } from '../../../hooks/useSmartCollapsedNavigation';
import { openSet, openTargeted, useIeltsStudentWork } from './useIeltsStudentWork';
import '../../../styles/ielts-navigation.css';
import '../../../styles/ielts-student-shell.css';

/** Browsers without matchMedia (old webviews, test DOMs) keep a plain, always-visible bar. */
const useNavMotion: typeof useSmartCollapsedNavigation = typeof window !== 'undefined' && typeof window.matchMedia === 'function'
  ? useSmartCollapsedNavigation
  : () => ({ navigationRef: React.useRef<HTMLElement | null>(null), revealNavigation: () => undefined }) as unknown as ReturnType<typeof useSmartCollapsedNavigation>;

export type IeltsStudentTab = 'home' | 'assigned' | 'targeted' | 'journey';

const TABS: { id: IeltsStudentTab; route: string; label: string; icon: string; hint: string }[] = [
  { id: 'home', route: '/ielts', label: 'Home', icon: '🏠', hint: 'What is new for you' },
  { id: 'assigned', route: '/ielts/practice/assigned', label: 'Assignments', icon: '📋', hint: 'Practice sets from your teachers' },
  { id: 'targeted', route: '/ielts/practice/targeted', label: 'Targeted', icon: '🎯', hint: 'Short tasks chosen for you' },
  { id: 'journey', route: '/ielts/journey', label: 'Journey', icon: '🧭', hint: 'Checks, feedback and your record' },
];

/**
 * The IELTS student navigation, styled like the Brains Heist student bar: a bottom bar with badges on phones and
 * tablets (it slides away while scrolling down and returns when scrolling up), a sticky tab bar on desktop.
 */
function IeltsStudentNav({ active }: { active: IeltsStudentTab }) {
  const navigate = useNavigate();
  const work = useIeltsStudentWork();
  const { navigationRef, revealNavigation } = useNavMotion(active, '(max-width: 1024px)');
  const badges: Partial<Record<IeltsStudentTab, number>> = {
    assigned: (work.sets ?? []).filter(openSet).length,
    targeted: (work.tasks ?? []).filter(openTargeted).length,
  };
  const index = TABS.findIndex((t) => t.id === active);
  return (
    <nav
      ref={navigationRef}
      aria-label="IELTS navigation"
      className="isn-nav"
      style={{ ['--isn-i' as string]: Math.max(0, index) } as React.CSSProperties}
      onFocus={revealNavigation}
    >
      <button type="button" className="smart-mobile-nav-reveal isn-reveal" onClick={revealNavigation} aria-label="Show IELTS navigation"><span aria-hidden="true" /></button>
      <span className="isn-indicator" aria-hidden="true" />
      {TABS.map((tab) => {
        const badge = badges[tab.id] ?? 0;
        return (
          <a
            key={tab.id}
            href={tab.route}
            title={tab.hint}
            aria-current={tab.id === active ? 'page' : undefined}
            className={'isn-link' + (tab.id === active ? ' is-active' : '')}
            onClick={(event) => {
              if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
              event.preventDefault();
              revealNavigation();
              navigate(tab.route);
            }}
          >
            <span className="isn-icon" aria-hidden="true">
              {tab.icon}
              {badge > 0 && <span className="isn-badge" aria-hidden="true">{badge > 9 ? '9+' : badge}</span>}
            </span>
            <span className="isn-label">{tab.label}{badge > 0 && <span className="il-sr-only"> ({badge} to do)</span>}</span>
            {badge > 0 && <span className="isn-badge isn-badge--inline" aria-hidden="true">{badge > 9 ? '9+' : badge}</span>}
          </a>
        );
      })}
    </nav>
  );
}

type ShellProps = {
  /** The tab this page belongs to. Omit together with `focus` while a student is inside a task. */
  active?: IeltsStudentTab;
  /** Inside a task: hide the navigation and show one clear way back instead. */
  focus?: { label: string; to: string };
  eyebrow?: string;
  title?: React.ReactNode;
  lead?: React.ReactNode;
  children: React.ReactNode;
};

export default function IeltsStudentShell({ active, focus, eyebrow, title, lead, children }: ShellProps) {
  const navigate = useNavigate();
  const showNav = !focus && active;
  return (
    <div className={'isn-page' + (showNav ? ' has-nav' : ' is-focus')} data-ielts-student-shell="">
      <div className="isn-glow" aria-hidden="true" />
      <header className="isn-top">
        <button type="button" className="isn-back" onClick={() => navigate(focus ? focus.to : '/')}>
          <span aria-hidden="true">←</span> {focus ? focus.label : 'Brains Heist'}
        </button>
        <span className="isn-brand" aria-label="Brains Heist IELTS"><span className="isn-mark" aria-hidden="true">IELTS</span><span className="isn-brand-text">Brains Heist</span></span>
      </header>
      {showNav && <IeltsStudentNav active={active} />}
      <main className="isn-main">
        {(title || eyebrow) && (
          <div className="isn-head">
            {eyebrow && <p className="isn-eyebrow">{eyebrow}</p>}
            {title && <h1>{title}</h1>}
            {lead && <p className="isn-lead">{lead}</p>}
          </div>
        )}
        {children}
      </main>
    </div>
  );
}

/** A collapsible group of cards with a count: open groups for what needs doing, closed ones for history. */
export function IeltsCardGroup({ title, count, tone = 'default', defaultOpen = true, children, id }: {
  title: string; count: number | string; tone?: 'todo' | 'feedback' | 'waiting' | 'done' | 'default'; defaultOpen?: boolean; children: React.ReactNode; id?: string;
}) {
  return (
    <details className={'isn-group isn-tone-' + tone} open={defaultOpen} id={id}>
      <summary>
        <span className="isn-group-title">{title}</span>
        <span className="isn-count">{count}</span>
        <span className="isn-chevron" aria-hidden="true" />
      </summary>
      <div className="isn-group-body">{children}</div>
    </details>
  );
}
