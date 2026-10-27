import React, { useEffect, useRef, useState } from 'react';
import { useSmartCollapsedNavigation } from '../../../hooks/useSmartCollapsedNavigation';

/** Browsers without matchMedia (old webviews, test DOMs) keep a plain, always-visible bar. */
const useNavMotion: typeof useSmartCollapsedNavigation = typeof window !== 'undefined' && typeof window.matchMedia === 'function'
  ? useSmartCollapsedNavigation
  : () => ({ navigationRef: React.useRef<HTMLElement | null>(null), revealNavigation: () => undefined }) as unknown as ReturnType<typeof useSmartCollapsedNavigation>;

export type IeltsTeacherTab = 'today' | 'reviews' | 'students' | 'batches' | 'practice' | 'lessons' | 'exams' | 'team';

type Tab = { id: IeltsTeacherTab; label: string; icon: string; hint: string; manageOnly?: boolean; phone?: boolean };
const TABS: Tab[] = [
  { id: 'today', label: 'Today', icon: '🏠', hint: 'What needs you now', phone: true },
  { id: 'reviews', label: 'Reviews', icon: '✍️', hint: 'Writing and Speaking waiting for feedback', phone: true },
  { id: 'students', label: 'Students', icon: '👥', hint: 'Progress, plans and reports', phone: true },
  { id: 'batches', label: 'Batches', icon: '🗂️', hint: 'Course batches and their practice', manageOnly: true, phone: true },
  { id: 'lessons', label: 'Lessons', icon: '📚', hint: 'Lesson packs, slides and audio', manageOnly: true },
  { id: 'practice', label: 'Practice', icon: '📋', hint: 'Assignments and practice history', manageOnly: true },
  { id: 'exams', label: 'Exams', icon: '⏱️', hint: 'Schedule and monitor exam sessions', manageOnly: true },
  { id: 'team', label: 'Team', icon: '🤝', hint: 'Programme lead and access' },
];

/**
 * The IELTS teacher navigation, in the same style as the student bar. Desktop: one sticky bar with every destination.
 * Phones and tablets: a bottom bar with the four everyday tabs and "More" for the rest (it slides away while
 * scrolling down and returns when scrolling up).
 */
export default function IeltsTeacherNav({ active, onNavigate, canManage, reviewCount = 0, disabled = false }: {
  active: IeltsTeacherTab;
  onNavigate: (tab: IeltsTeacherTab) => void;
  canManage: boolean;
  reviewCount?: number;
  disabled?: boolean;
}) {
  const { navigationRef, revealNavigation } = useNavMotion(active, '(max-width: 1024px)');
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement | null>(null);
  const tabs = TABS.filter((t) => canManage || !t.manageOnly);
  // Without management rights every tab fits on the phone bar, so there is no "More".
  const phoneTabs = canManage ? tabs.filter((t) => t.phone) : tabs;
  const moreTabs = tabs.filter((t) => !phoneTabs.includes(t));
  const hasMore = moreTabs.length > 0;
  const activeInMore = moreTabs.find((t) => t.id === active);
  const phoneIndex = activeInMore ? phoneTabs.length : Math.max(0, phoneTabs.findIndex((t) => t.id === active));

  useEffect(() => {
    if (!moreOpen) return;
    const close = (event: Event) => {
      if (event instanceof KeyboardEvent ? event.key === 'Escape' : !moreRef.current?.contains(event.target as Node)) setMoreOpen(false);
    };
    document.addEventListener('keydown', close);
    document.addEventListener('pointerdown', close);
    return () => { document.removeEventListener('keydown', close); document.removeEventListener('pointerdown', close); };
  }, [moreOpen]);

  const go = (tab: IeltsTeacherTab) => { setMoreOpen(false); revealNavigation(); onNavigate(tab); };
  const badge = (tab: Tab) => (tab.id === 'reviews' ? reviewCount : 0);
  const label = (tab: Tab) => {
    const n = badge(tab);
    return <>
      <span className="isn-icon" aria-hidden="true">{tab.icon}{n > 0 && <span className="isn-badge">{n > 9 ? '9+' : n}</span>}</span>
      <span className="isn-label">{tab.label}{n > 0 && <span className="il-sr-only"> ({n} waiting)</span>}</span>
      {n > 0 && <span className="isn-badge isn-badge--inline" aria-hidden="true">{n > 9 ? '9+' : n}</span>}
    </>;
  };

  return (
    <nav
      ref={navigationRef}
      aria-label="IELTS teacher workspace"
      className={'isn-nav itn-nav' + (hasMore ? ' has-more' : '')}
      style={{
        ['--isn-cols' as string]: tabs.length,
        ['--isn-i' as string]: Math.max(0, tabs.findIndex((t) => t.id === active)),
        ['--itn-phone-cols' as string]: phoneTabs.length + (hasMore ? 1 : 0),
        ['--itn-phone-i' as string]: phoneIndex,
      } as React.CSSProperties}
      onFocus={revealNavigation}
    >
      <button type="button" className="smart-mobile-nav-reveal isn-reveal" onClick={revealNavigation} aria-label="Show IELTS teacher navigation"><span aria-hidden="true" /></button>
      <span className="isn-indicator" aria-hidden="true" />
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          title={tab.hint}
          disabled={disabled}
          aria-current={tab.id === active ? 'page' : undefined}
          className={'isn-link itn-link' + (tab.id === active ? ' is-active' : '') + (phoneTabs.includes(tab) ? '' : ' itn-desktop-only')}
          onClick={() => go(tab.id)}
        >
          {label(tab)}
        </button>
      ))}
      {hasMore && (
        <div className="itn-more" ref={moreRef}>
          <button
            type="button"
            className={'isn-link itn-link itn-more-button' + (activeInMore ? ' is-active' : '')}
            aria-expanded={moreOpen}
            aria-haspopup="true"
            disabled={disabled}
            onClick={() => setMoreOpen((open) => !open)}
          >
            <span className="isn-icon" aria-hidden="true">{activeInMore?.icon ?? '☰'}</span>
            <span className="isn-label">{activeInMore?.label ?? 'More'}</span>
          </button>
          {moreOpen && (
            <div className="itn-sheet" role="group" aria-label="More teaching tools">
              {moreTabs.map((tab) => (
                <button key={tab.id} type="button" className={'itn-sheet-item' + (tab.id === active ? ' is-active' : '')} aria-current={tab.id === active ? 'page' : undefined} onClick={() => go(tab.id)}>
                  <span className="itn-sheet-icon" aria-hidden="true">{tab.icon}</span>
                  <span><strong>{tab.label}</strong><small>{tab.hint}</small></span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </nav>
  );
}
