import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  journeyNextStep,
  startingPointCompleted,
  startingPointRoute,
  startingPointSkills,
  type IeltsStartingPoint,
  type StartingPointSkill,
} from '../../../../services/ieltsStartingPointService';
import type { IeltsStudentJourney } from '../../../../services/ieltsJourneyService';
import { IELTS_WRITING_CRITERIA } from '../../../../services/ieltsWritingScreener';
import { SPEAKING_CRITERIA } from '../../../../services/ieltsSpeakingPilot';
import IeltsScreenerHub from '../../../components/ielts/IeltsScreenerHub';
import IeltsSkillIcon from '../../../components/ielts/IeltsSkillIcon';
import '../../../styles/ielts-journey.css';
const title = (s: string) => s[0].toUpperCase() + s.slice(1);
const date = (v?: string | null) =>
  v && Number.isFinite(Date.parse(v))
    ? new Date(v).toLocaleDateString(undefined, { dateStyle: 'medium' })
    : 'Date unavailable';
const observationLabels = {
  observed: 'Shown in this task',
  developing: 'Practise this next',
  insufficient_evidence: 'More evidence needed',
};
export default function IeltsStudentJourney({
  journey,
  startingPoint,
  onSetTargetBand,
}: {
  journey: IeltsStudentJourney;
  startingPoint: IeltsStartingPoint;
  onSetTargetBand?: () => void;
}) {
  const navigate = useNavigate();
  const completed = startingPointSkills.filter((s) =>
    startingPointCompleted(startingPoint, s),
  ).length;
  const reviews = (['writing', 'speaking'] as const).filter(
    (s) => startingPoint.results[s]?.review,
  );
  const next = journeyNextStep(startingPoint, journey);
  const continueTo = (route: string) => {
    if (!route.startsWith('#')) {
      navigate(route);
      return;
    }
    const heading = document.getElementById('teacher-feedback-heading');
    heading?.focus({ preventScroll: true });
    heading?.scrollIntoView({ block: 'start' });
  };
  const trail = startingPointSkills
    .flatMap((skill) => {
      const evidence = startingPoint.results[skill];
      if (!evidence) return [];
      const source = {
        key: `${skill}-work`,
        skill,
        occurred: evidence.occurred_at,
        label:
          skill === 'speaking' && evidence.status === 'in_progress'
            ? 'Interview in progress'
            : evidence.evidence_kind?.startsWith('same_')
              ? 'Practice repeat saved'
              : skill === 'listening' || skill === 'reading'
                ? 'Screener result saved'
                : 'Starting-point work saved',
        route: startingPointRoute(skill, evidence),
      };
      return evidence.review
        ? [
            source,
            {
              key: `${skill}-review`,
              skill,
              occurred: evidence.review.reviewed_at,
              label: `Feedback shared by ${evidence.review.reviewer_name}`,
              route: source.route,
            },
          ]
        : [source];
    })
    .sort((a, b) => Date.parse(b.occurred) - Date.parse(a.occurred));
  return (
    <div className="ij-student">
      <header className="ij-hero">
        <div>
          <p className="ij-eyebrow">Brains Heist · Your learning journey</p>
          <h1>
            {completed === 4
              ? 'Your starting point is in.'
              : 'Build your IELTS starting point.'}
          </h1>
          <p>
            {startingPoint.student_name
              ? `${startingPoint.student_name}, `
              : ''}
            {completed === 4
              ? 'you have completed all four checks. Use your feedback to choose a focused practice step.'
              : 'each check adds a part of the picture. Your saved work stays connected here.'}
          </p>
        </div>
        <div
          className="ij-progress"
          aria-label={`${completed} of 4 starting-point checks completed`}
        >
          <strong>
            {completed}
            <span>/ 4</span>
          </strong>
          <span>checks completed</span>
          <div className="ij-progress-segments" aria-hidden="true">
            {startingPointSkills.map((s) => (
              <i
                key={s}
                className={
                  startingPointCompleted(startingPoint, s) ? 'ij-done' : ''
                }
              />
            ))}
          </div>
          <small>{reviews.length} of 2 teacher reviews shared</small>
        </div>
      </header>
      <section className="ij-next" aria-labelledby="next-step-heading">
        <div>
          <p className="ij-eyebrow">Your next step</p>
          <h2 id="next-step-heading">{next.title}</h2>
          <p>{next.description}</p>
        </div>
        <button
          type="button"
          className="ij-primary"
          onClick={() => continueTo(next.route)}
        >
          {next.label}
          <span aria-hidden="true"> →</span>
        </button>
      </section>
      <IeltsScreenerHub data={startingPoint} />
      <section className="ij-band ij-panel" aria-labelledby="band-heading">
        <div className="ij-section-heading">
          <div>
            <p className="ij-eyebrow">From starting point to fuller evidence</p>
            <h2 id="band-heading">What about my estimated band?</h2>
          </div>
          <span className="ij-status">More evidence needed</span>
        </div>
        <p>
          You have useful starting-point evidence. We cannot give a reliable
          overall band from these checks yet.
        </p>
        <details>
          <summary>What is needed for a band estimate?</summary>
          <ul>
            <li>
              <strong>Listening and Reading:</strong> fuller reviewed tests with
              a validated score-to-band method. These 12-question checks are not
              calibrated for a band.
            </li>
            <li>
              <strong>Writing:</strong> reviewed Task 1 and Task 2 work. This
              screener covers one Task 2 essay.
            </li>
            <li>
              <strong>Speaking:</strong> recorded, reviewed work rated through a
              validated readiness method. The current interview gives teacher
              observations.
            </li>
          </ul>
          <p>
            Your teacher can help plan the next assessments. Any future estimate
            must show its evidence and confidence; it will not be an official
            IELTS result.
          </p>
        </details>
        <div className="ij-goal">
          <span>
            <strong>Your goal:</strong>{' '}
            {journey.target_band != null
              ? `Band ${journey.target_band.toFixed(1)}`
              : 'Agree a target with your teacher'}
            <small>A target is a goal, not your current level.</small>
          </span>
          {onSetTargetBand && (
            <button type="button" className="ij-link" onClick={onSetTargetBand}>
              Set target band
            </button>
          )}
        </div>
      </section>
      <section
        id="teacher-feedback"
        aria-labelledby="teacher-feedback-heading"
        className="ij-feedback-section"
      >
        <div className="ij-section-heading">
          <div>
            <p className="ij-eyebrow">Read. Choose a focus. Practise.</p>
            <h2 id="teacher-feedback-heading" tabIndex={-1}>
              Teacher feedback
            </h2>
            <p>
              These comments refer to the saved task. They help you decide what
              to do next.
            </p>
          </div>
        </div>
        {reviews.length ? (
          <div className="ij-two-columns">
            {reviews.map((skill) => {
              const e = startingPoint.results[skill]!,
                r = e.review!;
              const criteria =
                skill === 'writing'
                  ? IELTS_WRITING_CRITERIA
                  : SPEAKING_CRITERIA;
              return (
                <article className="ij-feedback ij-panel" key={skill}>
                  <div className="ij-card-heading">
                    <span className="ij-icon">
                      <IeltsSkillIcon skill={skill} />
                    </span>
                    <span className="ij-status ij-status-saved">
                      Teacher reviewed
                    </span>
                  </div>
                  <h3>
                    {title(skill)} ·{' '}
                    {skill === 'writing' ? 'Your essay' : 'Your interview'}
                  </h3>
                  <p className="ij-meta">
                    Shared by {r.reviewer_name} · {date(r.reviewed_at)} ·
                    Confidence: low
                  </p>
                  <div className="ij-teacher-note">
                    <p className="ij-eyebrow">★ Teacher’s next practice step</p>
                    <p>{r.next_step}</p>
                  </div>
                  <details>
                    <summary>Read the teacher’s observations</summary>
                    {criteria.map((c) => {
                      const o = r.observations[c.key];
                      return o ? (
                        <div className="ij-observation" key={c.key}>
                          <h4>{c.label}</h4>
                          <span className="ij-meta">
                            {observationLabels[o.status]}
                          </span>
                          <p>{o.comment}</p>
                        </div>
                      ) : null;
                    })}
                    {r.conditions_note && (
                      <div className="ij-observation">
                        <h4>Teacher’s note on assessment conditions</h4>
                        <p>{r.conditions_note}</p>
                      </div>
                    )}
                  </details>
                  <button
                    className="ij-link"
                    type="button"
                    onClick={() => navigate(startingPointRoute(skill, e))}
                  >
                    Open full feedback and original work →
                  </button>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="ij-panel">
            <h3>Your feedback will appear here</h3>
            <p>
              After you submit your essay or finish your interview, your teacher
              will review it and share comments. Pending review does not mean a
              low score.
            </p>
          </div>
        )}
        {journey.teacher_feedback.length > 0 && (
          <details className="ij-panel">
            <summary>Feedback from other reviewed tasks</summary>
            {journey.teacher_feedback.map((r) => (
              <div key={r.review_id} className="ij-observation">
                <h3>{title(r.skill)}</h3>
                <p>
                  {r.feedback_preview ||
                    r.rubric_summary ||
                    'Your reviewed feedback is available.'}
                </p>
                <button
                  type="button"
                  className="ij-link"
                  onClick={() => navigate(r.review_result_link)}
                >
                  View feedback
                </button>
              </div>
            ))}
          </details>
        )}
      </section>
      <section aria-labelledby="practice-heading" className="ij-panel">
        <div className="ij-section-heading">
          <div>
            <p className="ij-eyebrow">Purposeful practice</p>
            <h2 id="practice-heading">Your practice plan</h2>
            <button type="button" className="ij-primary" onClick={() => navigate('/ielts/practice/targeted')}>Open your next targeted task →</button>
          </div>
          <button
            type="button"
            className="ij-link"
            onClick={() => navigate('/ielts/practice/assigned')}
          >
            Open assigned practice →
          </button>
        </div>
        {journey.assigned_practice.length ? (
          journey.assigned_practice.map((a) => (
            <article className="ij-assignment" key={a.assignment_id}>
              <div>
                <h3>{a.title}</h3>
                <p>
                  {a.started_at ? 'In progress' : 'Assigned'}
                  {a.skills?.length
                    ? ` · ${a.skills
                        .filter((s) =>
                          startingPointSkills.includes(s as StartingPointSkill),
                        )
                        .map(title)
                        .join(', ')}`
                    : ''}
                  {a.due_at ? ` · Due ${date(a.due_at)}` : ''}
                </p>
              </div>
              <button
                type="button"
                className="ij-link"
                onClick={() => navigate('/ielts/practice/assigned')}
              >
                {a.started_at ? 'Continue task' : 'Open task'}
              </button>
            </article>
          ))
        ) : (
          <p>
            {startingPoint.school_managed
              ? 'No active IELTS assignments right now. Agree one practice focus with your teacher using the feedback above.'
              : 'No assigned tasks yet. Use the teacher’s next step as a practice focus.'}
          </p>
        )}
        <p className="ij-caption">
          Completing practice records your work. A fresh, comparable task is
          needed to check improvement.
        </p>
      </section>
      <section aria-labelledby="learning-trail-heading" className="ij-panel">
        <p className="ij-eyebrow">Your work stays connected</p>
        <h2 id="learning-trail-heading">Your learning trail</h2>
        <p>
          Saved checks, shared feedback and completed practice. Open a record to
          see its evidence.
        </p>
        {trail.length ? (
          <ol className="ij-trail">
            {trail.map((t) => (
              <li key={t.key}>
                <IeltsSkillIcon skill={t.skill as StartingPointSkill} />
                <div>
                  <strong>{title(t.skill)}</strong>
                  <p>{t.label}</p>
                  <time dateTime={t.occurred}>{date(t.occurred)}</time>
                </div>
                <button
                  type="button"
                  className="ij-link"
                  aria-label={`Open ${t.skill} ${t.label}`}
                  onClick={() => navigate(t.route)}
                >
                  View record
                </button>
              </li>
            ))}
          </ol>
        ) : (
          <p>Your first saved check will start your learning trail.</p>
        )}
        {journey.completed_practice.length > 0 && (
          <details>
            <summary>
              Completed practice · {journey.completed_practice.length}
            </summary>
            {journey.completed_practice.map((a) => (
              <div className="ij-observation" key={a.assignment_id}>
                <h3>{a.title}</h3>
                <p>Practice completed · {date(a.completed_at)}</p>
                {a.objective_result_link && (
                  <button
                    type="button"
                    className="ij-link"
                    onClick={() => navigate(a.objective_result_link!)}
                  >
                    View result
                  </button>
                )}
                {a.has_finalized_review && a.review_result_link && (
                  <button
                    type="button"
                    className="ij-link"
                    onClick={() => navigate(a.review_result_link!)}
                  >
                    View feedback
                  </button>
                )}
              </div>
            ))}
          </details>
        )}
        {journey.recent_exam_mode_submissions.length > 0 && (
          <details>
            <summary>Other assessment submissions</summary>
            {journey.recent_exam_mode_submissions.map((a) => (
              <div className="ij-observation" key={a.submission_id}>
                <h3>{a.title || 'Saved assessment'}</h3>
                <p>Submitted · {date(a.submitted_at)}</p>
                {a.objective_result_link && (
                  <button
                    type="button"
                    className="ij-link"
                    onClick={() => navigate(a.objective_result_link!)}
                  >
                    View result
                  </button>
                )}
                {a.has_finalized_review && a.review_result_link ? (
                  <button
                    type="button"
                    className="ij-link"
                    onClick={() => navigate(a.review_result_link!)}
                  >
                    View feedback
                  </button>
                ) : a.productive_skill_count ? (
                  <p>Review pending</p>
                ) : !a.objective_result_link ? (
                  <p>
                    Your submission is saved. Its result is not available yet.
                  </p>
                ) : null}
              </div>
            ))}
          </details>
        )}
        <details>
          <summary>How will we know I am improving?</summary>
          <p>
            Your teacher will compare fresh tasks that assess the same area
            under suitable conditions, then check again later. Repeating these
            screeners or correcting the same essay is useful practice, but does
            not prove independent improvement.
          </p>
          <p>
            One task cannot establish a lasting strength or persistent
            difficulty. Until enough suitable evidence is available, your record
            shows what was observed in that task.
          </p>
        </details>
      </section>
    </div>
  );
}
