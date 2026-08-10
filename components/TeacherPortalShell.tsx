import React, { Suspense, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import TeacherPortal from './TeacherPortal';

const TeacherAcademicProfilesPage = React.lazy(() => import('./student-progress/TeacherAcademicProfilesPage'));
const TeacherInterventionIntelligencePage = React.lazy(() => import('./student-progress/TeacherInterventionIntelligencePage'));

type TeacherPortalShellProps = React.ComponentProps<typeof TeacherPortal>;
type AcademicTool = 'academic-profiles' | 'interventions';

const TOOL_LABELS: Record<AcademicTool, string> = {
  'academic-profiles': 'Academic Profiles',
  interventions: 'Interventions',
};

const resolveAcademicTool = (button: HTMLButtonElement | null): AcademicTool | null => {
  if (!button || button.disabled) return null;
  const label = button.getAttribute('aria-label') || button.textContent || '';
  if (/Academic Profiles/i.test(label)) return 'academic-profiles';
  if (/Interventions/i.test(label)) return 'interventions';
  return null;
};

const TeacherPortalShell: React.FC<TeacherPortalShellProps> = (props) => {
  const shellRef = useRef<HTMLDivElement>(null);
  const [activeTool, setActiveTool] = useState<AcademicTool | null>(null);
  const [portalHost, setPortalHost] = useState<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!activeTool) {
      setPortalHost(null);
      return;
    }

    const shell = shellRef.current;
    const panel = shell?.querySelector<HTMLElement>('.teacher-main-panel');
    if (!panel) return;

    const host = document.createElement('div');
    host.className = 'teacher-academic-tool-host';
    host.setAttribute('data-academic-tool', activeTool);
    panel.classList.add('teacher-main-panel--academic-tool');
    panel.appendChild(host);
    setPortalHost(host);

    const navButtons = Array.from(shell.querySelectorAll<HTMLButtonElement>('button'));
    const navState = navButtons.map((button) => ({
      button,
      className: button.className,
      ariaCurrent: button.getAttribute('aria-current'),
    }));
    const activeLabel = TOOL_LABELS[activeTool];

    navButtons.forEach((button) => {
      const label = button.getAttribute('aria-label') || '';
      if (label === activeLabel) {
        button.classList.add('active', 'is-active');
        button.setAttribute('aria-current', 'page');
      } else if (button.classList.contains('teacher-nav-btn') || button.classList.contains('is-active')) {
        button.classList.remove('active', 'is-active');
        button.removeAttribute('aria-current');
      }
    });

    panel.scrollTo({ top: 0, left: 0, behavior: 'auto' });

    return () => {
      setPortalHost(null);
      navState.forEach(({ button, className, ariaCurrent }) => {
        button.className = className;
        if (ariaCurrent == null) button.removeAttribute('aria-current');
        else button.setAttribute('aria-current', ariaCurrent);
      });
      panel.classList.remove('teacher-main-panel--academic-tool');
      host.remove();
    };
  }, [activeTool]);

  const handleClickCapture = (event: React.MouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    const button = target.closest<HTMLButtonElement>('button');
    const tool = resolveAcademicTool(button);

    if (tool) {
      event.preventDefault();
      event.stopPropagation();
      setActiveTool(tool);
      return;
    }

    if (activeTool && button && (button.classList.contains('teacher-nav-btn') || button.closest('.teacher-nav-container'))) {
      setActiveTool(null);
    }
  };

  const closeAcademicTool = () => setActiveTool(null);

  return (
    <div
      ref={shellRef}
      className="teacher-academic-tool-shell"
      data-active-academic-tool={activeTool || undefined}
      onClickCapture={handleClickCapture}
    >
      <style>{`
        .teacher-main-panel.teacher-main-panel--academic-tool > *:not(.teacher-academic-tool-host) {
          display: none !important;
        }
        .teacher-academic-tool-host {
          display: block;
          width: 100%;
          min-width: 0;
          min-height: 100%;
        }
        .teacher-academic-tool-host > .sap-shell,
        .teacher-academic-tool-host > .intervention-page {
          max-width: none;
          margin: 0;
          padding: 0;
        }
      `}</style>
      <TeacherPortal {...props} />
      {activeTool && portalHost
        ? createPortal(
          <Suspense fallback={<div className="p-6 text-sm text-slate-500">Loading academic workspace…</div>}>
            {activeTool === 'academic-profiles'
              ? <TeacherAcademicProfilesPage onBack={closeAcademicTool} />
              : <TeacherInterventionIntelligencePage onBack={closeAcademicTool} />}
          </Suspense>,
          portalHost,
        )
        : null}
    </div>
  );
};

export default TeacherPortalShell;
