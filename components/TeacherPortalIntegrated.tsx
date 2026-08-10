import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import TeacherPortal from './TeacherPortal.tsx';
import TeacherAcademicProfilesPage from './student-progress/TeacherAcademicProfilesPage';
import TeacherInterventionIntelligencePage from './student-progress/TeacherInterventionIntelligencePage';
import './student-progress/TeacherAcademicProfilesPage.css';

type AcademicTool = 'academic-profiles' | 'interventions' | null;
type TeacherPortalProps = React.ComponentProps<typeof TeacherPortal>;

const toolFromButton = (button: HTMLButtonElement | null): AcademicTool => {
  if (!button) return null;
  const label = (button.getAttribute('aria-label') || button.querySelector('strong')?.textContent || button.textContent || '').trim();
  if (label === 'Academic Profiles' || label.startsWith('Academic Profiles')) return 'academic-profiles';
  if (label === 'Interventions' || label.startsWith('Interventions')) return 'interventions';
  return null;
};

const isTeacherNavigationButton = (button: HTMLButtonElement | null) => Boolean(
  button?.closest('.teacher-nav-grid, .teacher-mobile-menu-grid, .teacher-mobile-bottom-nav'),
);

const TeacherPortalIntegrated: React.FC<TeacherPortalProps> = (props) => {
  const [activeTool, setActiveTool] = useState<AcademicTool>(null);
  const [portalHost, setPortalHost] = useState<HTMLDivElement | null>(null);
  const hiddenChildrenRef = useRef<Array<{ node: HTMLElement; display: string }>>([]);

  const handleNavigationCapture = (event: React.MouseEvent<HTMLDivElement>) => {
    const button = (event.target as HTMLElement).closest('button') as HTMLButtonElement | null;
    if (!isTeacherNavigationButton(button)) return;

    const requestedTool = toolFromButton(button);
    if (requestedTool) {
      event.preventDefault();
      event.stopPropagation();
      setActiveTool(requestedTool);
      window.requestAnimationFrame(() => window.scrollTo({ top: 0, left: 0, behavior: 'auto' }));
      return;
    }

    if (activeTool) setActiveTool(null);
  };

  useLayoutEffect(() => {
    const mainPanel = document.querySelector<HTMLElement>('.teacher-main-panel');
    if (!activeTool || !mainPanel) {
      setPortalHost(null);
      return;
    }

    const existingHost = mainPanel.querySelector<HTMLDivElement>('[data-teacher-academic-tool-host="true"]');
    const host = existingHost || document.createElement('div');
    if (!existingHost) {
      host.dataset.teacherAcademicToolHost = 'true';
      host.className = 'teacher-academic-tool-host';
      mainPanel.appendChild(host);
    }

    hiddenChildrenRef.current = Array.from(mainPanel.children)
      .filter((node): node is HTMLElement => node instanceof HTMLElement && node !== host)
      .map((node) => ({ node, display: node.style.display }));
    hiddenChildrenRef.current.forEach(({ node }) => { node.style.display = 'none'; });
    mainPanel.dataset.academicToolActive = activeTool;
    setPortalHost(host);

    return () => {
      hiddenChildrenRef.current.forEach(({ node, display }) => { node.style.display = display; });
      hiddenChildrenRef.current = [];
      delete mainPanel.dataset.academicToolActive;
      if (host.parentElement === mainPanel) host.remove();
      setPortalHost(null);
    };
  }, [activeTool]);

  useEffect(() => {
    if (!activeTool) return;
    const sidebarButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('.teacher-nav-btn'));
    sidebarButtons.forEach((button) => button.classList.toggle('active', toolFromButton(button) === activeTool));

    const mobileButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('.teacher-mobile-menu-grid button'));
    mobileButtons.forEach((button) => button.classList.toggle('is-active', toolFromButton(button) === activeTool));
  }, [activeTool, portalHost]);

  return (
    <div className="teacher-portal-integrated-root" onClickCapture={handleNavigationCapture}>
      <TeacherPortal {...props} />
      {activeTool && portalHost ? createPortal(
        <div className="teacher-academic-tool-embedded" data-tool={activeTool}>
          {activeTool === 'academic-profiles' ? <TeacherAcademicProfilesPage /> : <TeacherInterventionIntelligencePage />}
        </div>,
        portalHost,
      ) : null}
    </div>
  );
};

export default TeacherPortalIntegrated;
