import React from 'react';
import { Link } from 'react-router-dom';
import IeltsSkillIcon from '../IeltsSkillIcon';

export type IeltsWorkTone = 'new' | 'continue' | 'feedback' | 'waiting' | 'done' | 'closed';
const SKILLS = ['listening', 'reading', 'writing', 'speaking'] as const;
type Skill = (typeof SKILLS)[number];

/**
 * One compact card for a piece of work: skill tile, a status chip, the title and one line of detail. The teacher's
 * note folds away under "Teacher's note" so the list stays short; the action is always on the card.
 */
export default function IeltsWorkCard({ tone, chip, kicker, title, meta, note, action, skill, extra, index = 0 }: {
  tone: IeltsWorkTone;
  chip: string;
  kicker: string;
  title: React.ReactNode;
  meta?: React.ReactNode;
  note?: string | null;
  action?: { label: string; to: string; quiet?: boolean };
  skill?: string | null;
  extra?: React.ReactNode;
  index?: number;
}) {
  const known = SKILLS.includes(skill as Skill) ? (skill as Skill) : null;
  return (
    <article className={'it-task isn-card isn-card--' + tone} style={{ ['--n' as string]: index } as React.CSSProperties}>
      <span className={'isn-skill isn-skill--' + (known ?? 'set')} aria-hidden="true">{known ? <IeltsSkillIcon skill={known} /> : '📋'}</span>
      <div className="isn-card-body">
        <p className="isn-kicker"><span className={'isn-chip isn-chip--' + tone}>{chip}</span><span>{kicker}</span></p>
        <h3>{title}</h3>
        {meta && <p className="isn-meta">{meta}</p>}
        {extra}
        {note && (
          <details className="isn-note">
            <summary>Teacher’s note</summary>
            <p>{note}</p>
          </details>
        )}
      </div>
      {action && <Link className={'iw-action isn-action' + (action.quiet ? ' iw-action--quiet' : '')} to={action.to}>{action.label}</Link>}
    </article>
  );
}

export const skillName = (skill?: string | null) => (skill ? skill[0].toUpperCase() + skill.slice(1) : 'Practice');
export const dueText = (iso: string | null | undefined) => {
  if (!iso || !Number.isFinite(Date.parse(iso))) return '';
  const due = new Date(iso);
  const days = Math.ceil((due.getTime() - Date.now()) / 86400000);
  const day = due.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  return days < 0 ? `Was due ${day}` : days === 0 ? 'Due today' : days === 1 ? 'Due tomorrow' : `Due ${day}`;
};
