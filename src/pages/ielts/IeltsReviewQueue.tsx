import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { rpcIeltsReviewQueue, type IeltsReviewQueueItem, type IeltsReviewSkill } from '../../../services/ieltsTeacherReviewService';
import { friendlyIeltsAdminError } from '../../lib/schoolAdminPresentation';

const badgeColor = (status: string) => status === 'finalized' ? '#16a34a' : status === 'in_review' ? '#f59e0b' : '#64748b';

interface IeltsReviewQueueProps {
  embedded?: boolean;
  onOpenReview?: (review: { skill: IeltsReviewSkill; attemptId: string }) => void;
}

const IeltsReviewQueue: React.FC<IeltsReviewQueueProps> = ({ embedded = false, onOpenReview }) => {
  const navigate = useNavigate();
  const [skill, setSkill] = useState<IeltsReviewSkill | ''>('writing');
  const [reviewStatus, setReviewStatus] = useState('pending');
  const [classId, setClassId] = useState('');
  const [studentId, setStudentId] = useState('');

  const filters = useMemo(() => ({ skill, reviewStatus, classId: classId || null, studentId: studentId || null }), [skill, reviewStatus, classId, studentId]);
  const { data: rows = [], isLoading, error, refetch } = useQuery({
    queryKey: ['ielts-review-queue', filters],
    queryFn: () => rpcIeltsReviewQueue(filters),
  });

  const openReview = (row: IeltsReviewQueueItem) => {
    if (onOpenReview) {
      onOpenReview({ skill: row.skill, attemptId: row.attempt_id });
      return;
    }
    navigate(`/ielts/reviews/${row.skill}/${encodeURIComponent(row.attempt_id)}`);
  };

  return (
    <main data-testid={embedded ? 'embedded-ielts-review-queue' : 'ielts-review-queue'} style={{ minHeight: embedded ? undefined : '100vh', background: '#f8fafc', padding: '2rem' }}>
      <section style={{ maxWidth: '72rem', margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'center', marginBottom: '1.5rem' }}>
          <div>
            <h1 style={{ margin: 0, color: '#0f172a', fontSize: '2rem' }}>IELTS Review Queue</h1>
            <p style={{ margin: '0.35rem 0 0', color: '#64748b' }}>Human teacher review for writing and speaking submissions.</p>
            <p style={{ margin: '0.35rem 0 0', color: '#475569', fontSize: '0.875rem' }}>Pending writing submissions are shown first.</p>
          </div>
          <button onClick={() => void refetch()} style={{ border: '1px solid #cbd5e1', borderRadius: '0.5rem', background: 'white', padding: '0.65rem 1rem', cursor: 'pointer' }}>Refresh</button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem', background: 'white', border: '1px solid #e2e8f0', borderRadius: '0.75rem', padding: '1rem', marginBottom: '1rem' }}>
          <label style={{ color: '#475569', fontSize: '0.875rem' }}>Skill
            <select value={skill} onChange={(e) => setSkill(e.target.value as IeltsReviewSkill | '')} style={{ width: '100%', marginTop: '0.25rem', padding: '0.55rem', border: '1px solid #cbd5e1', borderRadius: '0.5rem' }}>
              <option value="">All skills</option>
              <option value="writing">Writing</option>
              <option value="speaking">Speaking</option>
            </select>
          </label>
          <label style={{ color: '#475569', fontSize: '0.875rem' }}>Review status
            <select value={reviewStatus} onChange={(e) => setReviewStatus(e.target.value)} style={{ width: '100%', marginTop: '0.25rem', padding: '0.55rem', border: '1px solid #cbd5e1', borderRadius: '0.5rem' }}>
              <option value="">All statuses</option>
              <option value="pending">Pending</option>
              <option value="in_review">In review</option>
              <option value="finalized">Finalized</option>
            </select>
          </label>
          <label style={{ color: '#475569', fontSize: '0.875rem' }}>Class ID
            <input value={classId} onChange={(e) => setClassId(e.target.value)} placeholder="optional" style={{ width: '100%', marginTop: '0.25rem', padding: '0.55rem', border: '1px solid #cbd5e1', borderRadius: '0.5rem' }} />
          </label>
          <label style={{ color: '#475569', fontSize: '0.875rem' }}>Student ID
            <input value={studentId} onChange={(e) => setStudentId(e.target.value)} placeholder="optional" style={{ width: '100%', marginTop: '0.25rem', padding: '0.55rem', border: '1px solid #cbd5e1', borderRadius: '0.5rem' }} />
          </label>
        </div>

        {error ? <div style={{ background: '#fee2e2', color: '#991b1b', padding: '1rem', borderRadius: '0.75rem', marginBottom: '1rem' }}>{friendlyIeltsAdminError(error, 'Unable to load the review queue. Please try again.')}</div> : null}
        {isLoading ? <div style={{ color: '#475569' }}>Loading reviewable submissions…</div> : null}

        <div style={{ display: 'grid', gap: '0.75rem' }}>
          {rows.map((row) => (
            <button key={`${row.skill}-${row.attempt_id}`} onClick={() => openReview(row)} style={{ textAlign: 'left', background: 'white', border: '1px solid #e2e8f0', borderRadius: '0.75rem', padding: '1rem', cursor: 'pointer' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
                <div>
                  <strong style={{ color: '#0f172a', textTransform: 'capitalize' }}>{row.skill} review</strong>
                  <div style={{ color: '#475569', marginTop: '0.2rem' }}>{row.student_name ?? row.student_id} {row.class_name ? `• ${row.class_name}` : ''}</div>
                </div>
                <span style={{ alignSelf: 'start', color: 'white', background: badgeColor(row.review_status), borderRadius: '999px', padding: '0.2rem 0.65rem', fontSize: '0.75rem' }}>{row.review_status}</span>
              </div>
              <p style={{ color: '#334155', margin: '0.75rem 0 0' }}>{row.task_title ?? row.prompt ?? 'Untitled submission'}</p>
              <small style={{ color: '#64748b' }}>Submitted {row.submitted_at ? new Date(row.submitted_at).toLocaleString() : 'unknown'}{row.overall_band ? ` • Band ${row.overall_band}` : ''}</small>
            </button>
          ))}
          {!isLoading && rows.length === 0 ? <div style={{ background: 'white', border: '1px dashed #cbd5e1', borderRadius: '0.75rem', padding: '2rem', color: '#64748b', textAlign: 'center' }}>No submissions waiting for review</div> : null}
        </div>
      </section>
    </main>
  );
};

export default IeltsReviewQueue;
