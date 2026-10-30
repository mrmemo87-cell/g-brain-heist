import React, { Suspense, useEffect, useRef, useState } from 'react';
import { withPortalLocalization } from '../src/components/PortalLocalizationBoundary';
import { createPortal } from 'react-dom';
import TeacherPortal, { type TeacherNavSection } from './TeacherPortal';
import './student-progress/AcademicProfileWorkspace.css';

const TeacherAcademicProfilesPage = React.lazy(() => import('./student-progress/TeacherAcademicProfilesPage'));
const TeacherInterventionIntelligencePage = React.lazy(() => import('./student-progress/TeacherInterventionIntelligencePage'));
const InterventionTargetedPracticeWorkspace = React.lazy(() => import('./student-progress/InterventionTargetedPracticeWorkspace'));
const TeacherWeeklyFollowUpsPage = React.lazy(() => import('./student-progress/TeacherWeeklyFollowUpsPage'));
const ClassConquestTeacherPage = React.lazy(() => import('./classConquest/ClassConquestTeacherPage'));
import type { TargetedPracticeContext } from './student-progress/TeacherInterventionIntelligencePageV2';

type TeacherPortalShellProps = React.ComponentProps<typeof TeacherPortal>;
type AcademicTool = 'academic-profiles' | 'interventions' | 'follow-ups' | 'class-conquest';

type TeacherDashboardAssignmentMetrics = {
  assignment_count: number;
  active_assignment_count: number;
  submission_count: number;
  answered_question_count: number;
  correct_answer_count: number;
};

const resolveAcademicTool = (button: HTMLButtonElement | null): AcademicTool | null => {
  if (!button || button.disabled) return null;
  const label = button.getAttribute('aria-label') || button.textContent || '';
  if (/Academic Profiles/i.test(label)) return 'academic-profiles';
  if (/Interventions/i.test(label)) return 'interventions';
  return null;
};

const setDashboardText = (element: Element | null, value: string) => {
  if (element && element.textContent !== value) element.textContent = value;
};

const applyCurrentYearDashboardMetrics = (
  root: HTMLElement,
  metrics: TeacherDashboardAssignmentMetrics,
) => {
  const cards = Array.from(root.querySelectorAll<HTMLButtonElement>('.teacher-dashboard-stat'));
  const numberFormat = new Intl.NumberFormat();
  const hasAnswerEvidence = metrics.answered_question_count > 0;
  const accuracy = hasAnswerEvidence
    ? (metrics.correct_answer_count * 100) / metrics.answered_question_count
    : null;

  cards.forEach((card) => {
    const title = card.querySelector('.teacher-dashboard-stat-info h4');
    const value = card.querySelector('.teacher-dashboard-stat-value');
    const subtitle = card.querySelector('.teacher-dashboard-stat-sub');
    const currentTitle = title?.textContent?.trim() || '';

    if (currentTitle === 'Assignments' || currentTitle === 'Active Assignments') {
      setDashboardText(title, 'Active Assignments');
      setDashboardText(value, numberFormat.format(metrics.active_assignment_count));
      setDashboardText(subtitle, `${numberFormat.format(metrics.assignment_count)} total assignments`);
      card.setAttribute('aria-label', 'Open Active Assignments');
      return;
    }

    if (currentTitle === 'Reports' || currentTitle === 'Completed Submissions') {
      setDashboardText(title, 'Completed Submissions');
      setDashboardText(value, numberFormat.format(metrics.submission_count));
      setDashboardText(
        subtitle,
        metrics.submission_count > 0 ? 'Student submissions received' : 'No current submissions yet',
      );
      card.setAttribute('aria-label', 'Open Completed Submissions reports');
      return;
    }

    if (currentTitle === 'Assignment Success' || currentTitle === 'Answer Accuracy') {
      setDashboardText(title, 'Answer Accuracy');
      setDashboardText(value, accuracy == null ? '—' : `${accuracy.toFixed(1)}%`);
      setDashboardText(
        subtitle,
        hasAnswerEvidence
          ? `${numberFormat.format(metrics.correct_answer_count)} / ${numberFormat.format(metrics.answered_question_count)} answers correct`
          : 'No current assignment answers yet',
      );
      card.setAttribute('aria-label', 'Open Answer Accuracy reports');
    }
  });
};

const TeacherPortalShell: React.FC<TeacherPortalShellProps> = (props) => {
  const shellRef = useRef<HTMLDivElement>(null);
  const [activeTool, setActiveTool] = useState<AcademicTool | null>(null);
  const [targetedPractice, setTargetedPractice] = useState<TargetedPracticeContext | null>(null);
  const [portalHost, setPortalHost] = useState<HTMLDivElement | null>(null);
  const [dashboardAssignmentMetrics, setDashboardAssignmentMetrics] = useState<TeacherDashboardAssignmentMetrics | null>(null);
  const overlayActive = Boolean(activeTool || targetedPractice);

  useEffect(() => {
    const shell = shellRef.current;
    if (!shell || !dashboardAssignmentMetrics) return;

    const applyMetrics = () => applyCurrentYearDashboardMetrics(shell, dashboardAssignmentMetrics);
    applyMetrics();

    const observer = new MutationObserver(applyMetrics);
    observer.observe(shell, { childList: true, subtree: true, characterData: true });

    return () => observer.disconnect();
  }, [dashboardAssignmentMetrics]);

  useEffect(() => {
    if (!overlayActive) {
      setPortalHost(null);
      return;
    }

    const shell = shellRef.current;
    const panel = shell?.querySelector<HTMLElement>('.teacher-main-panel');
    if (!panel) return;

    const host = document.createElement('div');
    host.className = 'teacher-academic-tool-host';
    host.setAttribute('data-academic-tool', targetedPractice ? 'targeted-practice' : activeTool || '');
    panel.classList.add('teacher-main-panel--academic-tool');
    panel.appendChild(host);
    setPortalHost(host);

    panel.scrollTo({ top: 0, left: 0, behavior: 'auto' });

    return () => {
      setPortalHost(null);
      panel.classList.remove('teacher-main-panel--academic-tool');
      host.remove();
    };
  }, [activeTool, overlayActive, targetedPractice]);

  const handleClickCapture = (event: React.MouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    const button = target.closest<HTMLButtonElement>('button');
    // Navigation buttons must reach the portal handler so the More sheet closes
    // and entitlement/discard checks run. Only contextual tool links use capture.
    if (button?.closest('.teacher-nav-container, .teacher-mobile-bottom-nav, .teacher-mobile-menu-grid')) return;
    const tool = resolveAcademicTool(button);

    if (tool) {
      event.preventDefault();
      event.stopPropagation();

      if (tool === 'interventions') {
        const params = new URLSearchParams(window.location.search);
        const studentId = button?.dataset.studentId || '';
        const subject = button?.dataset.subject || '';
        const focusCode = button?.dataset.focusCode || '';
        if (studentId) {
          params.set('student', studentId);
          if (subject) params.set('subject', subject);
          else params.delete('subject');
          if (focusCode) params.set('focus', focusCode);
          else params.delete('focus');
        } else {
          params.delete('student');
          params.delete('subject');
          params.delete('focus');
        }
        const query = params.toString();
        window.history.replaceState({}, '', `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`);
      }

      setTargetedPractice(null);
      setActiveTool(tool);
      return;
    }
  };

  const navigateSection = (section: TeacherNavSection) => {
    setTargetedPractice(null);
    if (section === 'academic-profiles' || section === 'interventions' || section === 'follow-ups' || section === 'class-conquest') {
      if (section === 'interventions') {
        const url = new URL(window.location.href);
        ['student', 'subject', 'focus'].forEach(key => url.searchParams.delete(key));
        window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
      }
      setActiveTool(section);
      return true;
    }
    setActiveTool(null);
    return false;
  };

  const closeAcademicTool = () => {
    setActiveTool(null);
    setTargetedPractice(null);
  };

  const openInterventionsForStudent = (studentId: string) => {
    const url = new URL(window.location.href);
    url.searchParams.set('student', studentId);
    ['subject', 'focus'].forEach(key => url.searchParams.delete(key));
    window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
    setTargetedPractice(null);
    setActiveTool('interventions');
  };

  const returnToInterventions = () => {
    setTargetedPractice(null);
    setActiveTool('interventions');
  };

  const openTargetedPractice = (context: TargetedPracticeContext) => {
    setActiveTool(null);
    setTargetedPractice(context);
  };

  return (
    <div
      ref={shellRef}
      className="teacher-academic-tool-shell"
      data-active-academic-tool={targetedPractice ? 'targeted-practice' : activeTool || undefined}
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
        .teacher-academic-tool-host > .intervention-page,
        .teacher-academic-tool-host > .tfu-page,
        .teacher-academic-tool-host > .ccq-teacher,
        .teacher-academic-tool-host > .intervention-targeted-workspace {
          max-width: none;
          margin: 0;
          padding: 0;
        }
      `}</style>
      <TeacherPortal {...props} onNavigateSection={navigateSection} activeNavigationSection={targetedPractice ? 'assignments' : activeTool || undefined} academicProfilePresentation={activeTool === 'academic-profiles' && !targetedPractice} onAssignmentSummary={setDashboardAssignmentMetrics} />
      {overlayActive && portalHost
        ? createPortal(
          <Suspense fallback={<div className="p-6 text-sm text-slate-500">Preparing Brains Heist workspace…</div>}>
            {targetedPractice
              ? <InterventionTargetedPracticeWorkspace context={targetedPractice} onBack={returnToInterventions} onComplete={returnToInterventions} />
              : activeTool === 'academic-profiles'
                ? <TeacherAcademicProfilesPage onBack={closeAcademicTool} />
                : activeTool === 'class-conquest'
                ? <ClassConquestTeacherPage onBack={closeAcademicTool} schoolId={props.profile.school_id} issuer={props.profile.school_name ?? undefined} schoolLogoUrl={props.profile.school_logo_url} />
                : activeTool === 'follow-ups'
                ? <TeacherWeeklyFollowUpsPage onBack={closeAcademicTool} onPlanPractice={openInterventionsForStudent} />
                : <TeacherInterventionIntelligencePage onBack={closeAcademicTool} onCreateTargetedPractice={openTargetedPractice} />}
          </Suspense>,
          portalHost,
        )
        : null}
    </div>
  );
};

export default withPortalLocalization(TeacherPortalShell, 'Teacher Portal');
