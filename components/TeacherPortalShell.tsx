import React, { Suspense, useEffect, useRef, useState } from 'react';
import { withPortalLocalization } from '../src/components/PortalLocalizationBoundary';
import { createPortal } from 'react-dom';
import TeacherPortal from './TeacherPortal';
import { supabase } from '../services/supabaseClient';

const TeacherAcademicProfilesPage = React.lazy(() => import('./student-progress/TeacherAcademicProfilesPage'));
const TeacherInterventionIntelligencePage = React.lazy(() => import('./student-progress/TeacherInterventionIntelligencePage'));
const InterventionTargetedPracticeWorkspace = React.lazy(() => import('./student-progress/InterventionTargetedPracticeWorkspace'));
import type { TargetedPracticeContext } from './student-progress/TeacherInterventionIntelligencePageV2';

type TeacherPortalShellProps = React.ComponentProps<typeof TeacherPortal>;
type AcademicTool = 'academic-profiles' | 'interventions';

type TeacherDashboardAssignmentMetrics = {
  assignment_count: number;
  active_assignment_count: number;
  submission_count: number;
  answered_question_count: number;
  correct_answer_count: number;
};

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

const toDashboardMetricNumber = (value: unknown): number => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

const normalizeDashboardAssignmentMetrics = (value: unknown): TeacherDashboardAssignmentMetrics | null => {
  const row = (Array.isArray(value) ? value[0] : value) as Record<string, unknown> | null;
  if (!row || typeof row !== 'object') return null;

  return {
    assignment_count: toDashboardMetricNumber(row.assignment_count),
    active_assignment_count: toDashboardMetricNumber(row.active_assignment_count),
    submission_count: toDashboardMetricNumber(row.submission_count),
    answered_question_count: toDashboardMetricNumber(row.answered_question_count),
    correct_answer_count: toDashboardMetricNumber(row.correct_answer_count),
  };
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
  const accuracy = metrics.answered_question_count > 0
    ? (metrics.correct_answer_count * 100) / metrics.answered_question_count
    : 0;

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
      setDashboardText(subtitle, 'Student submissions received');
      card.setAttribute('aria-label', 'Open Completed Submissions reports');
      return;
    }

    if (currentTitle === 'Assignment Success' || currentTitle === 'Answer Accuracy') {
      setDashboardText(title, 'Answer Accuracy');
      setDashboardText(value, `${accuracy.toFixed(1)}%`);
      setDashboardText(
        subtitle,
        `${numberFormat.format(metrics.correct_answer_count)} / ${numberFormat.format(metrics.answered_question_count)} answers correct`,
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
    let cancelled = false;

    const loadDashboardAssignmentMetrics = async () => {
      const { data, error } = await supabase.rpc('rpc_teacher_assignment_success_summary');
      if (cancelled) return;

      if (error) {
        console.warn('[teacher-dashboard] Current-year assignment metrics unavailable:', error.message);
        return;
      }

      setDashboardAssignmentMetrics(normalizeDashboardAssignmentMetrics(data));
    };

    void loadDashboardAssignmentMetrics();
    return () => {
      cancelled = true;
    };
  }, []);

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

    const navButtons = Array.from(shell.querySelectorAll<HTMLButtonElement>('button'));
    const navState = navButtons.map((button) => ({
      button,
      className: button.className,
      ariaCurrent: button.getAttribute('aria-current'),
    }));
    const activeLabel = targetedPractice ? 'Assignments' : activeTool ? TOOL_LABELS[activeTool] : null;

    navButtons.forEach((button) => {
      const label = button.getAttribute('aria-label') || '';
      if (activeLabel && label === activeLabel) {
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
  }, [activeTool, overlayActive, targetedPractice]);

  const handleClickCapture = (event: React.MouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    const button = target.closest<HTMLButtonElement>('button');
    const tool = resolveAcademicTool(button);

    if (tool) {
      event.preventDefault();
      event.stopPropagation();
      setTargetedPractice(null);
      setActiveTool(tool);
      return;
    }

    if (overlayActive && button && (button.classList.contains('teacher-nav-btn') || button.closest('.teacher-nav-container'))) {
      setActiveTool(null);
      setTargetedPractice(null);
    }
  };

  const closeAcademicTool = () => {
    setActiveTool(null);
    setTargetedPractice(null);
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
        .teacher-academic-tool-host > .intervention-targeted-workspace {
          max-width: none;
          margin: 0;
          padding: 0;
        }
      `}</style>
      <TeacherPortal {...props} />
      {overlayActive && portalHost
        ? createPortal(
          <Suspense fallback={<div className="p-6 text-sm text-slate-500">Preparing Brains Heist workspace…</div>}>
            {targetedPractice
              ? <InterventionTargetedPracticeWorkspace context={targetedPractice} onBack={returnToInterventions} onComplete={returnToInterventions} />
              : activeTool === 'academic-profiles'
                ? <TeacherAcademicProfilesPage onBack={closeAcademicTool} />
                : <TeacherInterventionIntelligencePage onBack={closeAcademicTool} onCreateTargetedPractice={openTargetedPractice} />}
          </Suspense>,
          portalHost,
        )
        : null}
    </div>
  );
};

export default withPortalLocalization(TeacherPortalShell, 'Teacher Portal');
