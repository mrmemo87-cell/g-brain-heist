import React, { useEffect, useRef } from 'react';
import gsap from 'gsap';
import type { IeltsJourneyAssignmentItem } from '../../../../services/ieltsJourneyService';

type SkillKey = 'reading' | 'listening' | 'writing' | 'speaking';
const orderedSkills: SkillKey[] = ['reading', 'listening', 'writing', 'speaking'];
const skillIcons: Record<SkillKey, string> = { reading: '📖', listening: '🎧', writing: '✍️', speaking: '🎤' };

const taskState = (item: IeltsJourneyAssignmentItem, skill: SkillKey): string => {
  if (skill === 'reading' || skill === 'listening') {
    return item.objective_result_link ? 'Result available' : item.completed_at ? 'Submitted' : item.started_at ? 'In progress' : 'Not started';
  }
  if (item.has_finalized_review) return 'Feedback ready';
  if (item.completed_at || item.feedback_status === 'awaiting_feedback') return 'Review pending';
  return item.started_at ? 'In progress' : 'Not started';
};

const formatDate = (value?: string | null, empty = 'No due date') => {
  if (!value) return empty;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return empty;
  return parsed.toLocaleDateString(undefined, { dateStyle: 'medium' });
};

const humanizeStatus = (status?: string | null): string => {
  const v = (status ?? '').trim().toLowerCase();
  if (!v) return 'Not started';
  if (v === 'in_progress') return 'In progress';
  return v.replace(/_/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase());
};

const statusStyle = (status: string): { dot: string; badge: string; text: string } => {
  const s = status.toLowerCase();
  if (s === 'completed') return { dot: '#059669', badge: '#dcfce7', text: '#166534' };
  if (s === 'in_progress') return { dot: '#0891b2', badge: '#dbeafe', text: '#1d4ed8' };
  if (s === 'overdue') return { dot: '#dc2626', badge: '#fee2e2', text: '#991b1b' };
  return { dot: '#cbd5e1', badge: '#f1f5f9', text: '#94a3b8' };
};

interface AssignmentCardProps {
  item: IeltsJourneyAssignmentItem;
  onViewResult?: (link: string) => void;
  onViewFeedback?: (link: string) => void;
  onOpenAssigned?: () => void;
  isCompleted?: boolean;
  animDelay?: number;
  animate?: boolean;
}

const AssignmentCard: React.FC<AssignmentCardProps> = ({
  item,
  onViewResult,
  onViewFeedback,
  onOpenAssigned,
  isCompleted = false,
  animDelay = 0,
  animate = true,
}) => {
  const ref = useRef<HTMLDivElement>(null);
  const st = statusStyle(item.status ?? '');
  const skills = orderedSkills.filter((s) => (item.skills ?? []).includes(s));
  const doneCount = skills.filter((s) => ['Result available', 'Feedback ready', 'Submitted'].includes(taskState(item, s))).length;

  useEffect(() => {
    if (!ref.current || !animate) return;
    const reduced = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) return;
    gsap.fromTo(ref.current, { opacity: 0, x: -12 }, { opacity: 1, x: 0, duration: 0.38, ease: 'power2.out', delay: animDelay });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div
      ref={ref}
      style={{
        background: '#ffffff',
        border: `1px solid ${st.dot}44`,
        borderLeft: `3px solid ${st.dot}`,
        borderRadius: '0.85rem',
        padding: '1rem',
        opacity: 1,
        boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.75rem', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 800, color: '#0f172a', lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {item.title}
          </h3>
          <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.35rem', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>
              Due: <strong style={{ color: '#475569' }}>{formatDate(item.due_at)}</strong>
            </span>
            {!isCompleted && skills.length > 0 && (
              <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>
                {doneCount}/{skills.length} done
              </span>
            )}
          </div>
        </div>
        <span style={{
          fontSize: '0.68rem',
          fontWeight: 800,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          padding: '0.25rem 0.6rem',
          borderRadius: '9999px',
          background: st.badge,
          color: st.text,
          whiteSpace: 'nowrap',
          flexShrink: 0,
        }}>
          {humanizeStatus(item.status)}
        </span>
      </div>

      {/* Skill rows */}
      {skills.length > 0 && (
        <div style={{ marginTop: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
          {skills.map((skill) => {
            const state = taskState(item, skill);
            const canResult = (skill === 'reading' || skill === 'listening') && !!item.objective_result_link;
            const canFeedback = (skill === 'writing' || skill === 'speaking') && !!item.review_result_link && !!item.has_finalized_review;
            const isPending = (skill === 'writing' || skill === 'speaking') && !item.has_finalized_review && !!item.completed_at;

            return (
              <div key={skill} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', fontSize: '0.78rem', padding: '0.3rem 0', borderTop: '1px solid #f1f5f9' }}>
                <span style={{ color: '#64748b', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  {skillIcons[skill]} {skill.charAt(0).toUpperCase() + skill.slice(1)}
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <span style={{ color: state.includes('available') || state.includes('ready') ? '#0891b2' : state.includes('pending') ? '#ea580c' : '#94a3b8', fontWeight: 700 }}>
                    {state}
                  </span>
                  {canResult && onViewResult && (
                    <button type="button" onClick={() => onViewResult(item.objective_result_link as string)} style={{ background: '#eff6ff', border: '1px solid #bfdbfe', color: '#1d4ed8', borderRadius: '0.4rem', padding: '0.2rem 0.55rem', fontSize: '0.7rem', fontWeight: 700, cursor: 'pointer' }}>
                      View →
                    </button>
                  )}
                  {canFeedback && onViewFeedback && (
                    <button type="button" onClick={() => onViewFeedback(item.review_result_link as string)} style={{ background: '#f5f3ff', border: '1px solid #ddd6fe', color: '#6d28d9', borderRadius: '0.4rem', padding: '0.2rem 0.55rem', fontSize: '0.7rem', fontWeight: 700, cursor: 'pointer' }}>
                      Feedback →
                    </button>
                  )}
                  {isPending && (
                    <span style={{ color: '#ea580c', fontSize: '0.68rem', fontStyle: 'italic' }}>Review pending</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

    </div>
  );
};

interface IeltsAssignmentTimelineProps {
  assigned: IeltsJourneyAssignmentItem[];
  completed: IeltsJourneyAssignmentItem[];
  activeTab: 'current' | 'completed';
  onTabChange: (tab: 'current' | 'completed') => void;
  onOpenAssigned: () => void;
  navigate: (path: string) => void;
  animate?: boolean;
}

const IeltsAssignmentTimeline: React.FC<IeltsAssignmentTimelineProps> = ({
  assigned,
  completed,
  activeTab,
  onTabChange,
  onOpenAssigned,
  navigate,
  animate = true,
}) => {
  const items = activeTab === 'current' ? assigned : completed;

  return (
    <div>
      {/* Tab bar */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.85rem', background: '#f1f5f9', borderRadius: '0.75rem', padding: '0.3rem' }}>
        {(['current', 'completed'] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => onTabChange(tab)}
            style={{
              flex: 1,
              padding: '0.5rem',
              borderRadius: '0.55rem',
              border: 'none',
              fontWeight: 800,
              fontSize: '0.82rem',
              cursor: 'pointer',
              transition: 'all 0.2s',
              background: activeTab === tab ? '#ffffff' : 'transparent',
              color: activeTab === tab ? '#0891b2' : '#64748b',
              boxShadow: activeTab === tab ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
            }}
          >
            {tab === 'current' ? `Active (${assigned.length})` : `Completed (${completed.length})`}
          </button>
        ))}
      </div>

      {/* Cards */}
      {items.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '2rem', color: '#94a3b8', fontSize: '0.875rem', border: '1px dashed #cbd5e1', borderRadius: '0.85rem' }}>
          {activeTab === 'current' ? 'No active IELTS assignments right now.' : 'No completed assignments yet.'}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.7rem' }}>
          {activeTab === 'current' && (
            <button
              type="button"
              onClick={onOpenAssigned}
              style={{
                padding: '0.7rem 1rem',
                background: 'linear-gradient(90deg, #0891b2, #7c3aed)',
                border: 'none',
                borderRadius: '0.7rem',
                color: '#fff',
                fontWeight: 800,
                fontSize: '0.875rem',
                cursor: 'pointer',
                textAlign: 'center',
                letterSpacing: '0.02em',
                boxShadow: '0 2px 8px rgba(8,145,178,0.28)',
              }}
            >
              Open assigned practice →
            </button>
          )}
          {items.map((item, idx) => (
            <AssignmentCard
              key={item.assignment_id}
              item={item}
              isCompleted={activeTab === 'completed'}
              onOpenAssigned={activeTab === 'current' ? onOpenAssigned : undefined}
              onViewResult={(link) => navigate(link)}
              onViewFeedback={(link) => navigate(link)}
              animDelay={idx * 0.05}
              animate={animate}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default IeltsAssignmentTimeline;
