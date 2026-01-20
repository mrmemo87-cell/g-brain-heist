import React, { useEffect, useMemo, useState } from 'react';
import type {
  IELTSSectionKey,
  IELTSUserProfile,
  IELTSReadingSet,
  IELTSListeningSet,
  IELTSWritingTask,
  IELTSSpeakingTask,
  IELTSMockTest,
  IELTSRecentAttempts,
} from '../../types';
import {
  ensureIeltsProfile,
  fetchActiveListeningSets,
  fetchActiveMockTests,
  fetchActiveReadingSets,
  fetchActiveSpeakingTasks,
  fetchActiveWritingTasks,
  fetchRecentAttempts,
  getUserTier,
  isIeltsPrime,
} from '../../services/ieltsService';
import * as IELTSAuthService from '../../services/ieltsAuthService';
import '../../src/styles/ielts.css';

interface IELTSAppProps {
  onLogout?: () => void;
}

type SectionMeta = {
  id: IELTSSectionKey;
  label: string;
  blurb: string;
};

interface StudyPlanItem {
  section: string;
  title: string;
}

const SECTIONS: SectionMeta[] = [
  { id: 'dashboard', label: 'Overview', blurb: 'Track your readiness and stay aligned with the study plan.' },
  { id: 'reading', label: 'Reading', blurb: 'Academic readings with band-aligned comprehension drills.' },
  { id: 'listening', label: 'Listening', blurb: 'Exam-style audio practice with guided note taking.' },
  { id: 'writing', label: 'Writing', blurb: 'Task 1 and Task 2 prompts with model responses and criteria.' },
  { id: 'speaking', label: 'Speaking', blurb: 'Part 1–3 speaking banks for interview simulations.' },
  { id: 'mock-tests', label: 'Mock Tests', blurb: 'Full-length simulated exams to rehearse exam conditions.' },
  { id: 'progress', label: 'Progress Journal', blurb: 'Review your attempts and plan the next study block.' },
];

const formatBandRange = (min: number | null, max: number | null): string => {
  if (min && max) return `${min.toFixed(1)}–${max.toFixed(1)}`;
  if (min) return `${min.toFixed(1)}+`;
  if (max) return `≤ ${max.toFixed(1)}`;
  return 'Not set';
};

const IELTSApp: React.FC<IELTSAppProps> = ({ onLogout }) => {
  const [profile, setProfile] = useState<IELTSUserProfile | null>(null);
  const [activeSection, setActiveSection] = useState<IELTSSectionKey>('dashboard');
  const [readingSets, setReadingSets] = useState<IELTSReadingSet[]>([]);
  const [listeningSets, setListeningSets] = useState<IELTSListeningSet[]>([]);
  const [writingTasks, setWritingTasks] = useState<IELTSWritingTask[]>([]);
  const [speakingTasks, setSpeakingTasks] = useState<IELTSSpeakingTask[]>([]);
  const [mockTests, setMockTests] = useState<IELTSMockTest[]>([]);
  const [attempts, setAttempts] = useState<IELTSRecentAttempts>({
    reading: [],
    listening: [],
    writing: [],
    speaking: [],
    mock: [],
  });
  const [studyPlan, setStudyPlan] = useState<StudyPlanItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [userTier, setUserTier] = useState('free');
  const isPrimeUser = isIeltsPrime({ tier: userTier });
  const canAccessRequiredTier = (requiredTier?: string | null) => !requiredTier || requiredTier === 'free' || isPrimeUser;

  useEffect(() => {
    document.body.classList.add('ielts-theme');
    return () => {
      document.body.classList.remove('ielts-theme');
    };
  }, []);

  useEffect(() => {
    document.title = activeSection === 'dashboard'
      ? 'IELTS Prep Hub'
      : `IELTS Prep Hub | ${SECTIONS.find((section) => section.id === activeSection)?.label ?? 'Study'}`;
  }, [activeSection]);

  const loadData = async (silent = false) => {
    try {
      if (silent) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }
      setError(null);

      const [profileData, readingData, listeningData, writingData, speakingData, mockData, attemptData, tier] = await Promise.all([
        ensureIeltsProfile(),
        fetchActiveReadingSets(),
        fetchActiveListeningSets(),
        fetchActiveWritingTasks(),
        fetchActiveSpeakingTasks(),
        fetchActiveMockTests(),
        fetchRecentAttempts(),
        getUserTier(),
      ]);

      setProfile(profileData);
      setReadingSets(readingData);
      setListeningSets(listeningData);
      setWritingTasks(writingData);
      setSpeakingTasks(speakingData);
      setMockTests(mockData);
      setAttempts(attemptData);
      setUserTier(tier);
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : 'Failed to load study data.';
      setError(message);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const totalCompletedAttempts = useMemo(() => {
    return (
      attempts.reading.filter((attempt) => attempt.completed_at).length +
      attempts.listening.filter((attempt) => attempt.completed_at).length +
      attempts.writing.length +
      attempts.speaking.length +
      attempts.mock.filter((attempt) => attempt.completed_at).length
    );
  }, [attempts]);

  const latestMockBand = useMemo(() => {
    return attempts.mock.find((attempt) => attempt.overall_band_est !== null)?.overall_band_est ?? null;
  }, [attempts.mock]);

  const addToStudyPlan = (sectionLabel: string, title: string) => {
    setStudyPlan((current) => {
      const entry: StudyPlanItem = { section: sectionLabel, title };
      const exists = current.some((item) => item.section === entry.section && item.title === entry.title);
      if (exists) {
        return current;
      }
      return [...current, entry];
    });
    setActiveSection('progress');
  };

  const handleLogout = async () => {
    try {
      await IELTSAuthService.logout();
    } finally {
      onLogout?.();
    }
  };

  const renderEmptyState = (message: string) => (
    <div className="ielts-empty-state">
      <p>{message}</p>
    </div>
  );

  const renderReading = () => {
    if (readingSets.length === 0) {
      return renderEmptyState('No reading sets are published yet. Teachers can enable them from the admin console.');
    }

    return (
      <div className="ielts-card-grid">
        {readingSets.map((set) => (
          <article key={set.id} className="ielts-card">
            <header className="ielts-card__header">
              <div>
                <h3>{set.title}</h3>
                <p className="ielts-card__support">{set.description || 'Academic reading practice aligned with IELTS question types.'}</p>
              </div>
              <span className="ielts-tag">Band {formatBandRange(set.est_band_min, set.est_band_max)}</span>
            </header>
            <dl className="ielts-card__meta">
              <div>
                <dt>Duration</dt>
                <dd>{set.duration_minutes} minutes</dd>
              </div>
              <div>
                <dt>Level</dt>
                <dd>{set.level}</dd>
              </div>
            </dl>
            <button
              type="button"
              className="ielts-secondary-btn"
              onClick={() => {
                if (!canAccessRequiredTier(set.required_tier)) {
                  window.location.href = '/ielts/apply-prime';
                  return;
                }
                addToStudyPlan('Reading', set.title);
              }}
              disabled={!canAccessRequiredTier(set.required_tier)}
            >
              {canAccessRequiredTier(set.required_tier) ? 'Add to study session plan' : 'Prime required'}
            </button>
          </article>
        ))}
      </div>
    );
  };

  const renderListening = () => {
    if (listeningSets.length === 0) {
      return renderEmptyState('Listening practice sets will appear here once uploaded.');
    }

    return (
      <div className="ielts-card-grid">
        {listeningSets.map((set) => (
          <article key={set.id} className="ielts-card">
            <header className="ielts-card__header">
              <div>
                <h3>{set.title}</h3>
                <p className="ielts-card__support">{set.description || 'Exam-style audio recordings with structured questions.'}</p>
              </div>
              <span className="ielts-tag">Band {formatBandRange(set.est_band_min, set.est_band_max)}</span>
            </header>
            <dl className="ielts-card__meta">
              <div>
                <dt>Audio length</dt>
                <dd>{set.duration_minutes} minutes</dd>
              </div>
              <div>
                <dt>Audio source</dt>
                <dd>{set.audio_url ? 'Ready' : 'Pending upload'}</dd>
              </div>
            </dl>
            <button
              type="button"
              className="ielts-secondary-btn"
              onClick={() => {
                if (!isPrimeUser) {
                  window.location.href = '/ielts/apply-prime';
                  return;
                }
                addToStudyPlan('Listening', set.title);
              }}
              disabled={!isPrimeUser}
            >
              {isPrimeUser ? 'Schedule listening drill' : 'Prime required'}
            </button>
          </article>
        ))}
      </div>
    );
  };

  const renderWriting = () => {
    if (writingTasks.length === 0) {
      return renderEmptyState('Writing prompts will appear here once prepared by instructors.');
    }

    return (
      <div className="ielts-card-grid">
        {writingTasks.map((task) => (
          <article key={task.id} className="ielts-card">
            <header className="ielts-card__header">
              <div>
                <h3>{task.title || task.slug}</h3>
                <span className="ielts-subtle-tag">Task {task.task_type === 'task2' ? '2' : '1'}</span>
              </div>
            </header>
            <p className="ielts-card__support">{task.prompt}</p>
            <dl className="ielts-card__meta">
              <div>
                <dt>Band focus</dt>
                <dd>{task.bands_target || 'General training'}</dd>
              </div>
              <div>
                <dt>Model answer</dt>
                <dd>{task.sample_answer ? 'Available' : 'Pending'}</dd>
              </div>
            </dl>
            <button
              type="button"
              className="ielts-secondary-btn"
              onClick={() => {
                if (!isPrimeUser) {
                  window.location.href = '/ielts/apply-prime';
                  return;
                }
                addToStudyPlan('Writing', task.title || task.slug);
              }}
              disabled={!isPrimeUser}
            >
              {isPrimeUser ? 'Add to writing queue' : 'Prime required'}
            </button>
          </article>
        ))}
      </div>
    );
  };

  const renderSpeaking = () => {
    if (speakingTasks.length === 0) {
      return renderEmptyState('Speaking drills will be added here for interview simulations.');
    }

    return (
      <div className="ielts-card-grid">
        {speakingTasks.map((task) => (
          <article key={task.id} className="ielts-card">
            <header className="ielts-card__header">
              <div>
                <h3>Part {task.part}: {task.slug}</h3>
                <p className="ielts-card__support">{task.prompt}</p>
              </div>
              <span className="ielts-subtle-tag">Speaking</span>
            </header>
            <div className="ielts-follow-ups">
              {task.follow_ups ? Object.values(task.follow_ups).slice(0, 3).map((followUp, index) => (
                <span key={index} className="ielts-pill">{String(followUp)}</span>
              )) : <span className="ielts-card__support">Follow-up prompts will appear once prepared.</span>}
            </div>
            <button
              type="button"
              className="ielts-secondary-btn"
              onClick={() => {
                if (!isPrimeUser) {
                  window.location.href = '/ielts/apply-prime';
                  return;
                }
                addToStudyPlan('Speaking', task.slug);
              }}
              disabled={!isPrimeUser}
            >
              {isPrimeUser ? 'Add to speaking practice plan' : 'Prime required'}
            </button>
          </article>
        ))}
      </div>
    );
  };

  const renderMockTests = () => {
    if (mockTests.length === 0) {
      return renderEmptyState('Mock tests will be listed here once released.');
    }

    return (
      <div className="ielts-card-grid">
        {mockTests.map((test) => (
          <article key={test.id} className="ielts-card">
            <header className="ielts-card__header">
              <div>
                <h3>{test.title}</h3>
                <p className="ielts-card__support">{test.description || 'Full-length IELTS rehearsal including all four skills.'}</p>
              </div>
              <span className="ielts-tag">{test.duration_minutes ?? 0} minutes</span>
            </header>
            <dl className="ielts-card__meta">
              <div>
                <dt>Includes</dt>
                <dd>Reading, listening, writing, speaking</dd>
              </div>
              <div>
                <dt>Recent score</dt>
                <dd>{latestMockBand ? `Band ${latestMockBand.toFixed(1)}` : 'Not attempted yet'}</dd>
              </div>
            </dl>
            <button
              type="button"
              className="ielts-secondary-btn"
              onClick={() => {
                if (!isPrimeUser) {
                  window.location.href = '/ielts/apply-prime';
                  return;
                }
                addToStudyPlan('Mock Test', test.title);
              }}
              disabled={!isPrimeUser}
            >
              {isPrimeUser ? 'Plan full mock exam' : 'Prime required'}
            </button>
          </article>
        ))}
      </div>
    );
  };

  const renderProgress = () => (
    <div className="ielts-progress">
      <section className="ielts-progress__panel">
        <h2>Recent attempts</h2>
        <div className="ielts-progress__grid">
          <div>
            <h3>Reading</h3>
            {attempts.reading.length === 0 ? renderEmptyState('Reading attempts will be listed here once completed.') : (
              <ul className="ielts-progress__list">
                {attempts.reading.map((attempt) => (
                  <li key={attempt.id}>
                    <span>{new Date(attempt.started_at).toLocaleDateString()}</span>
                    <span>{attempt.percent ? `${attempt.percent.toFixed(1)}% accuracy` : 'In progress'}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <h3>Listening</h3>
            {attempts.listening.length === 0 ? renderEmptyState('Listening attempts will appear after your first practice.') : (
              <ul className="ielts-progress__list">
                {attempts.listening.map((attempt) => (
                  <li key={attempt.id}>
                    <span>{new Date(attempt.started_at).toLocaleDateString()}</span>
                    <span>{attempt.percent ? `${attempt.percent.toFixed(1)}%` : 'In progress'}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <h3>Writing</h3>
            {attempts.writing.length === 0 ? renderEmptyState('Submit your first writing task to see feedback here.') : (
              <ul className="ielts-progress__list">
                {attempts.writing.map((attempt) => (
                  <li key={attempt.id}>
                    <span>{new Date(attempt.submitted_at).toLocaleDateString()}</span>
                    <span>{attempt.band_overall ? `Band ${attempt.band_overall.toFixed(1)}` : 'Awaiting feedback'}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <h3>Speaking</h3>
            {attempts.speaking.length === 0 ? renderEmptyState('Upload speaking recordings to unlock personalised notes.') : (
              <ul className="ielts-progress__list">
                {attempts.speaking.map((attempt) => (
                  <li key={attempt.id}>
                    <span>{new Date(attempt.submitted_at).toLocaleDateString()}</span>
                    <span>{attempt.band_overall ? `Band ${attempt.band_overall.toFixed(1)}` : 'Pending review'}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>

      <section className="ielts-progress__panel">
        <h2>Upcoming study plan</h2>
        {studyPlan.length === 0 ? (
          renderEmptyState('Add activities from any skill tab to build your study block for the week.')
        ) : (
          <ul className="ielts-plan">
            {studyPlan.map((item, index) => (
              <li key={`${item.section}-${item.title}-${index}`}>
                <span className="ielts-plan__section">{item.section}</span>
                <span className="ielts-plan__title">{item.title}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );

  const activeMeta = SECTIONS.find((section) => section.id === activeSection) ?? SECTIONS[0];

  const content = () => {
    switch (activeSection) {
      case 'reading':
        return renderReading();
      case 'listening':
        return renderListening();
      case 'writing':
        return renderWriting();
      case 'speaking':
        return renderSpeaking();
      case 'mock-tests':
        return renderMockTests();
      case 'progress':
        return renderProgress();
      default:
        return (
          <div className="ielts-dashboard">
            <section className="ielts-dashboard__welcome">
              <h2>Welcome back{profile?.full_name ? `, ${profile.full_name}` : ''}.</h2>
              <p>
                This is a distraction-free space for IELTS test preparation. Your progress, attempts, and study plans here
                are completely separate from Brains Heist.
              </p>
            </section>
            <section className="ielts-dashboard__grid">
              <article className="ielts-metric">
                <h3>Study resources ready</h3>
                <p className="ielts-metric__value">{readingSets.length + listeningSets.length + writingTasks.length + speakingTasks.length}</p>
                <span className="ielts-metric__hint">Reading, listening, writing, and speaking modules published</span>
              </article>
              <article className="ielts-metric">
                <h3>Completed attempts</h3>
                <p className="ielts-metric__value">{totalCompletedAttempts}</p>
                <span className="ielts-metric__hint">Track each submission in the progress journal</span>
              </article>
              <article className="ielts-metric">
                <h3>Latest mock band</h3>
                <p className="ielts-metric__value">{latestMockBand ? latestMockBand.toFixed(1) : '—'}</p>
                <span className="ielts-metric__hint">Use full mocks monthly to benchmark your readiness</span>
              </article>
            </section>
            <section className="ielts-dashboard__next-steps">
              <h3>Next study block</h3>
              {studyPlan.length === 0 ? (
                <p>Add tasks from any skill tab to plan your next study session.</p>
              ) : (
                <ul>
                  {studyPlan.map((item, index) => (
                    <li key={`${item.section}-${item.title}-${index}`}>
                      <strong>{item.section}:</strong> {item.title}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        );
    }
  };

  return (
    <div className="ielts-shell">
      <aside className="ielts-shell__sidebar">
        <div className="ielts-shell__brand">IELTS Prep Hub</div>
        <nav className="ielts-shell__nav">
          {SECTIONS.map((section) => (
            <button
              key={section.id}
              type="button"
              className={`ielts-shell__nav-btn ${activeSection === section.id ? 'ielts-shell__nav-btn--active' : ''}`}
              onClick={() => setActiveSection(section.id)}
            >
              {section.label}
            </button>
          ))}
        </nav>
        <div className="ielts-shell__sidebar-footer">
          <div className="ielts-shell__profile">
            <span className="ielts-shell__profile-name">{profile?.full_name || profile?.username || 'Learner'}</span>
            <span className="ielts-shell__profile-username">@{profile?.username}</span>
          </div>
          <button type="button" className="ielts-ghost-btn" onClick={handleLogout}>
            Sign out
          </button>
        </div>
      </aside>

      <main className="ielts-shell__main">
        <header className="ielts-shell__header">
          <div>
            <h1>{activeMeta.label}</h1>
            <p>{activeMeta.blurb}</p>
          </div>
          <div className="ielts-shell__actions">
            <button
              type="button"
              className="ielts-secondary-btn"
              onClick={() => loadData(true)}
              disabled={isRefreshing}
            >
              {isRefreshing ? 'Refreshing…' : 'Refresh data'}
            </button>
          </div>
        </header>

        <section className="ielts-shell__content">
          {isLoading ? (
            <div className="ielts-loading-state">
              <div className="ielts-loading-spinner" />
              <p>Loading structured practice materials…</p>
            </div>
          ) : error ? (
            <div className="ielts-error">
              <p>{error}</p>
              <button type="button" className="ielts-secondary-btn" onClick={() => loadData()}>
                Try again
              </button>
            </div>
          ) : (
            content()
          )}
        </section>
      </main>
    </div>
  );
};

export default IELTSApp;
