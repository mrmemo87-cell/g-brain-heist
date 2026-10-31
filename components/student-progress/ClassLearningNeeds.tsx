import React, { useEffect, useMemo, useState } from 'react';
import { getClassLearningNeeds, type ClassLearningNeed, type ClassLearningNeeds as ClassNeedsPayload } from '../../services/studentInterventionService';
import './ClassLearningNeeds.css';

interface ClassLearningNeedsProps {
  classLabel: string;
  studentIds: string[];
  subject: string;
  onSelectStudent: (studentId: string) => void;
}

type TeachingMove = 'whole-class' | 'small-group' | 'individual';

const moveFor = (share: number): TeachingMove => (share >= 0.5 ? 'whole-class' : share >= 0.25 ? 'small-group' : 'individual');
const moveLabel: Record<TeachingMove, string> = { 'whole-class': 'Whole-class starter', 'small-group': 'Small group', individual: 'Individual practice' };
const moveHint: Record<TeachingMove, string> = {
  'whole-class': 'Half the class or more. Worth five minutes with everyone.',
  'small-group': 'A quarter to half the class. Pull them together while others work.',
  individual: 'A few students. Targeted practice from their own page.',
};
const statusLabel: Record<string, string> = { new_focus: 'new', recurring: 'repeated', persistent: 'long-running', improving: 'improving' };
const fmtDate = (value?: string | null) => (value ? new Date(value).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : '');

interface SkillGroup { key: string; skill: string; needs: ClassLearningNeed[]; students: number; move: TeachingMove }

const ClassLearningNeeds: React.FC<ClassLearningNeedsProps> = ({ classLabel, studentIds, subject, onSelectStudent }) => {
  const [data, setData] = useState<ClassNeedsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [filter, setFilter] = useState<TeachingMove | 'all'>('all');

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError(null); setOpen(null);
    getClassLearningNeeds(studentIds, subject)
      .then((payload) => { if (!cancelled) setData(payload); })
      .catch((cause) => { if (!cancelled) setError(cause instanceof Error ? cause.message : 'Class needs could not be loaded.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [studentIds, subject]);

  const total = data?.students_considered || 0;

  const groups = useMemo<SkillGroup[]>(() => {
    if (!data) return [];
    const bySkill = new Map<string, ClassLearningNeed[]>();
    data.needs.forEach((need) => {
      const key = (need.topic || need.skill || '').trim().toLocaleLowerCase();
      bySkill.set(key, [...(bySkill.get(key) || []), need]);
    });
    return [...bySkill.entries()].map(([key, needs]) => {
      const students = new Set(needs.flatMap((need) => need.students.map((student) => student.id))).size;
      return { key, skill: needs[0].topic || needs[0].skill, needs, students, move: moveFor(total ? students / total : 0) };
    }).sort((a, b) => b.students - a.students || a.skill.localeCompare(b.skill));
  }, [data, total]);

  const counts = useMemo(() => ({
    'whole-class': groups.filter((group) => group.move === 'whole-class').length,
    'small-group': groups.filter((group) => group.move === 'small-group').length,
    individual: groups.filter((group) => group.move === 'individual').length,
  }), [groups]);

  const visible = filter === 'all' ? groups : groups.filter((group) => group.move === filter);
  const withNeeds = data ? data.students.filter((student) => student.need_count > 0).length : 0;
  const secure = data ? data.students.filter((student) => student.need_count === 0 && student.has_evidence) : [];
  const unassessed = data ? data.students.filter((student) => !student.has_evidence) : [];

  if (loading) return <section className="cln"><div className="cln-state">Reading {classLabel}’s {subject} evidence…</div></section>;
  if (error) return <section className="cln"><div className="cln-state is-error"><strong>Class needs could not be loaded.</strong><span>{error}</span></div></section>;
  if (!data) return null;

  return <section className="cln" aria-label={`Shared learning needs in ${classLabel}`}>
    <header className="cln-head">
      <div>
        <h2>{classLabel} · {subject}</h2>
        <p>{withNeeds} of {total} students have current needs · {data.needs.length} need{data.needs.length === 1 ? '' : 's'} across {groups.length} skill{groups.length === 1 ? '' : 's'}{unassessed.length ? ` · ${unassessed.length} without assessed ${subject} work yet` : ''}{data.students_excluded ? ` · ${data.students_excluded} not in your ${subject} allocation` : ''}</p>
      </div>
      <div className="cln-filter" role="tablist" aria-label="Teaching move">
        {(['all', 'whole-class', 'small-group', 'individual'] as const).map((value) => <button key={value} type="button" role="tab" aria-selected={filter === value} className={`is-${value}${filter === value ? ' is-active' : ''}`} onClick={() => setFilter(value)}>
          {value === 'all' ? 'All' : moveLabel[value]}<b>{value === 'all' ? groups.length : counts[value]}</b>
        </button>)}
      </div>
    </header>

    {!groups.length ? <div className="cln-state"><strong>No current learning needs in {subject}.</strong><span>Brains Heist will show shared needs here as assessed work comes in.</span></div> : null}

    <div className="cln-groups">
      {visible.map((group) => {
        const share = total ? group.students / total : 0;
        const isOpen = open === group.key;
        return <article key={group.key} className={`cln-group is-${group.move}${isOpen ? ' is-open' : ''}`}>
          <button type="button" className="cln-group-head" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : group.key)}>
            <div className="cln-group-title">
              <h3>{group.skill}</h3>
              <span className="cln-move">{moveLabel[group.move]}</span>
            </div>
            <div className="cln-share" aria-label={`${group.students} of ${total} students`}>
              <div className="cln-share-bar"><i style={{ width: `${Math.max(4, Math.round(share * 100))}%` }} /></div>
              <strong>{group.students}<small>/{total}</small></strong>
            </div>
            <ul className="cln-leaves" aria-label="Sub-skills">
              {group.needs.map((need) => <li key={need.skill_key}><span>{need.subskill || need.skill}</span><b>{need.student_count}</b></li>)}
            </ul>
          </button>

          {isOpen ? <div className="cln-group-body">
            <p className="cln-hint">{moveHint[group.move]}</p>
            {group.needs.map((need) => <div key={need.skill_key} className="cln-need">
              <div className="cln-need-head">
                <strong>{need.subskill || need.skill}</strong>
                <span>{need.student_count} student{need.student_count === 1 ? '' : 's'}{need.recurring_count ? ` · ${need.recurring_count} repeated` : ''}{need.confirmed_count ? ` · ${need.confirmed_count} confirmed` : ''}{need.plan_count ? ` · ${need.plan_count} plan${need.plan_count === 1 ? '' : 's'}` : ''}</span>
              </div>
              <div className="cln-students">
                {need.students.map((student) => <button key={student.id} type="button" className={`cln-student is-${student.status}${student.plan_open ? ' has-plan' : student.confirmed ? ' is-confirmed' : ''}`} onClick={() => onSelectStudent(student.id)} title={`Open ${student.name}’s support page`}>
                  <span>{student.name}</span>
                  <small>{student.plan_open ? 'plan' : student.confirmed ? 'confirmed' : statusLabel[student.status] || student.status} · {student.evidence_items}</small>
                </button>)}
              </div>
            </div>)}
          </div> : null}
        </article>;
      })}
    </div>

    {secure.length ? <footer className="cln-quiet">
      <strong>No current needs</strong>
      <div>{secure.map((student) => <button key={student.id} type="button" onClick={() => onSelectStudent(student.id)}>{student.name}</button>)}</div>
    </footer> : null}
    {unassessed.length ? <footer className="cln-quiet is-unassessed">
      <strong>No assessed {subject} work yet</strong>
      <div>{unassessed.map((student) => <button key={student.id} type="button" onClick={() => onSelectStudent(student.id)}>{student.name}</button>)}</div>
    </footer> : null}
  </section>;
};

export default ClassLearningNeeds;
