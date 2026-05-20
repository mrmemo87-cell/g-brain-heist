import React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { rpcIeltsReviewDetail, type IeltsReviewSkill } from '../../../services/ieltsTeacherReviewService';

const label = (key: string) => key.split('_').map((part) => part[0]?.toUpperCase() + part.slice(1)).join(' ');

const IeltsReviewResult: React.FC = () => {
  const navigate = useNavigate();
  const params = useParams<{ skill: string; attemptId: string }>();
  const skill = (params.skill === 'speaking' ? 'speaking' : 'writing') as IeltsReviewSkill;
  const attemptId = decodeURIComponent(params.attemptId ?? '');
  const { data, isLoading, error } = useQuery({
    queryKey: ['ielts-review-result', skill, attemptId],
    queryFn: () => rpcIeltsReviewDetail(skill, attemptId),
    enabled: !!attemptId,
  });

  return (
    <main style={{ minHeight: '100vh', background: '#f8fafc', padding: '2rem' }}>
      <section style={{ maxWidth: '54rem', margin: '0 auto', background: 'white', border: '1px solid #e2e8f0', borderRadius: '1rem', padding: '1.5rem' }}>
        <button onClick={() => navigate('/ielts')} style={{ border: 'none', background: 'transparent', color: '#2563eb', cursor: 'pointer', marginBottom: '1rem' }}>← Back to IELTS Home</button>
        <h1 style={{ color: '#0f172a', marginTop: 0 }}>IELTS {skill} reviewed feedback</h1>
        {isLoading ? <p style={{ color: '#64748b' }}>Loading review…</p> : null}
        {error ? <div style={{ background: '#fee2e2', color: '#991b1b', padding: '1rem', borderRadius: '0.75rem' }}>{error instanceof Error ? error.message : 'Unable to load review.'}</div> : null}
        {data ? (
          <>
            {data.review_status !== 'finalized' ? (
              <div style={{ background: '#fef3c7', color: '#92400e', padding: '1rem', borderRadius: '0.75rem', marginBottom: '1rem' }}>Your submission is still awaiting finalized IELTS feedback.</div>
            ) : null}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.75rem', marginBottom: '1rem' }}>
              <div style={{ background: '#eff6ff', borderRadius: '0.75rem', padding: '1rem' }}>
                <div style={{ color: '#475569', fontSize: '0.85rem' }}>Reviewed band</div>
                <strong style={{ color: '#1d4ed8', fontSize: '2rem' }}>{data.overall_band ?? '—'}</strong>
              </div>
              <div style={{ background: '#f8fafc', borderRadius: '0.75rem', padding: '1rem' }}>
                <div style={{ color: '#475569', fontSize: '0.85rem' }}>Reviewed timestamp</div>
                <strong style={{ color: '#334155' }}>{data.reviewed_at ? new Date(data.reviewed_at).toLocaleString() : 'Not finalized'}</strong>
              </div>
            </div>
            <h2 style={{ color: '#0f172a' }}>Rubric breakdown</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem' }}>
              {Object.entries(data.rubric ?? {}).map(([key, value]) => (
                <div key={key} style={{ border: '1px solid #e2e8f0', borderRadius: '0.75rem', padding: '0.9rem' }}>
                  <div style={{ color: '#64748b', fontSize: '0.85rem' }}>{label(key)}</div>
                  <strong style={{ color: '#0f172a', fontSize: '1.35rem' }}>{value ?? '—'}</strong>
                </div>
              ))}
            </div>
            <h2 style={{ color: '#0f172a' }}>Teacher feedback</h2>
            {[
              ['Strengths', data.strengths],
              ['Improvements', data.improvements],
              ['Next steps', data.next_steps],
              ['Feedback', data.teacher_feedback],
            ].map(([title, value]) => (
              <section key={String(title)} style={{ marginBottom: '0.9rem' }}>
                <h3 style={{ color: '#334155', marginBottom: '0.25rem' }}>{String(title)}</h3>
                <div style={{ whiteSpace: 'pre-wrap', color: '#0f172a', background: '#f8fafc', borderRadius: '0.5rem', padding: '0.85rem' }}>{String(value || 'No feedback provided yet.')}</div>
              </section>
            ))}
          </>
        ) : null}
      </section>
    </main>
  );
};

export default IeltsReviewResult;
