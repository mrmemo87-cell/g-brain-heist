import React from 'react';
import type { IeltsScreenerEntry } from '../../../services/ieltsScreenerLaunchService';
import {
  startingPointRoute,
  type StartingPointEvidence,
  type StartingPointSkill,
} from '../../../services/ieltsStartingPointService';
import IeltsSkillIcon from './IeltsSkillIcon';
type CardProps = {
  skill: StartingPointSkill;
  entry?: IeltsScreenerEntry;
  evidence?: StartingPointEvidence | null;
  speakingAvailable?: boolean;
  recordLoaded?: boolean;
  onNavigate: (route: string) => void;
};
export const IeltsScreenerCard: React.FC<CardProps> = ({
  skill,
  entry,
  evidence,
  speakingAvailable,
  recordLoaded = false,
  onNavigate,
}) => {
  const title = skill[0].toUpperCase() + skill.slice(1);
  const speaking = skill === 'speaking';
  const completed = speaking
    ? evidence?.status === 'submitted'
    : entry?.status === 'completed';
  const resume = speaking
    ? evidence?.status === 'in_progress'
    : entry?.status === 'in_progress';
  const expired = entry?.status === 'expired';
  const productive = skill === 'writing' || speaking;
  const discoveryRoute = startingPointRoute(skill);
  const savedRoute = evidence
    ? startingPointRoute(skill, evidence)
    : entry?.attempt_id && completed
      ? startingPointRoute(skill, {
          attempt_id: entry.attempt_id,
        } as StartingPointEvidence)
      : entry?.assignment_id
        ? `/ielts/exam/${entry.exam_event_id}`
        : discoveryRoute;
  const status = completed
    ? productive
      ? evidence?.review
        ? 'Feedback ready'
        : 'Awaiting review'
      : 'Completed'
    : resume
      ? 'In progress'
      : expired
        ? 'Time ended'
        : entry?.status === 'ready'
          ? 'Ready to start'
          : speaking && speakingAvailable
            ? 'Arrange interview'
            : entry?.status === 'paused'
              ? 'Paused'
              : entry?.status === 'scheduled'
                ? 'Scheduled'
                : 'Not available';
  const resultPending = completed && !productive && recordLoaded && !evidence;
  const action = resultPending
    ? 'View saved work'
    : completed
      ? productive
        ? evidence?.review
          ? 'View teacher feedback'
          : 'View saved work'
        : 'View saved result'
      : resume
        ? speaking
          ? 'Open saved interview'
          : 'Resume check'
        : expired
          ? 'Open saved attempt'
          : speaking && speakingAvailable
            ? 'Open Speaking interview'
            : entry?.status === 'ready'
              ? `Start ${title} check`
              : 'Check availability';
  const route =
    resultPending && entry
      ? `/ielts/exam/${entry.exam_event_id}`
      : completed
        ? savedRoute
        : resume || expired
          ? speaking
            ? savedRoute
            : `/ielts/exam/${entry!.exam_event_id}`
          : discoveryRoute;
  return (
    <article aria-label={`${title} screener`} className="ij-skill-card">
      <div className="ij-card-heading">
        <span className={`ij-icon ij-${skill}`}>
          <IeltsSkillIcon skill={skill} />
        </span>
        <span className={`ij-status ${completed ? 'ij-status-saved' : ''}`}>
          {resultPending ? 'Result pending' : status}
        </span>
      </div>
      <h3>{title}</h3>
      <p>
        {skill === 'writing'
          ? 'One essay · Academic Task 2 · Minimum 250 words'
          : skill === 'reading'
            ? 'Two passages · 12 questions · Academic Reading'
            : speaking
              ? 'Three parts · A recorded interview with your teacher'
              : 'Three recordings · 12 questions · Pause and replay available'}
      </p>
      <span className="ij-meta">
        {speaking
          ? 'Teacher-led'
          : entry
            ? `${entry.duration_minutes} minutes`
            : 'Short check'}
        {completed && ' · Saved'}
        {productive && completed && ' · Confidence: low'}
      </span>
      {evidence && (skill === 'listening' || skill === 'reading') && (
        <strong className="ij-result">
          {evidence.raw_score} / {evidence.total}
          <small>Screener score · Confidence: low</small>
        </strong>
      )}
      <p className="ij-card-note">
        {completed
          ? productive
            ? evidence?.review
              ? 'Your teacher’s comments and next practice step are ready.'
              : 'Your work is saved. Your teacher will share feedback after review.'
            : resultPending
              ? 'Your answers are saved. Your result is not available yet.'
              : 'Your answers are saved. Open your record to see the result.'
          : resume
            ? speaking
              ? 'Continue this interview with your teacher.'
              : 'Continue your saved attempt with its remaining time.'
            : expired
              ? 'Open your attempt to finish saving and see its result.'
              : 'Build your starting point and find a useful practice focus.'}
      </p>
      {evidence?.conditions_need_review && (
        <p className="ij-conditions">
          Assessment conditions need teacher attention. Your saved record has
          the details.
        </p>
      )}
      <button
        type="button"
        className="ij-primary"
        onClick={() => onNavigate(route)}
      >
        {action}
      </button>
      {completed && (
        <details className="ij-repeat">
          <summary>
            {speaking ? 'About further practice' : 'Repeat for practice'}
          </summary>
          <p>
            Repeats use the same task and do not measure improvement. A fresh
            check is needed to compare progress.
          </p>
          {!speaking && (
            <button
              type="button"
              className="ij-link"
              onClick={() => onNavigate(discoveryRoute)}
            >
              Open practice repeat
            </button>
          )}
          {speaking && <p>Arrange further practice with your teacher.</p>}
        </details>
      )}
    </article>
  );
};
