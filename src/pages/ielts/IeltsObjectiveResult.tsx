import React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../../services/supabaseClient';

const IeltsObjectiveResult: React.FC = () => {
  const navigate = useNavigate();
  const { skill, attemptId } = useParams<{ skill: string; attemptId: string }>();

  const { data, isLoading, error } = useQuery({
    queryKey: ['ielts-objective-result', skill, attemptId],
    queryFn: async () => {
      if (!attemptId || (skill !== 'reading' && skill !== 'listening')) throw new Error('Invalid result route.');
      const table = skill === 'reading' ? 'ielts_reading_attempts' : 'ielts_listening_attempts';
      const { data: row, error: qErr } = await supabase.from(table).select('id, raw_score, total_questions, percent, est_band, completed_at').eq('id', attemptId).single();
      if (qErr) throw qErr;
      return row;
    },
  });

  const total = data?.total_questions ?? 0;
  const correct = data?.raw_score ?? 0;
  const incorrect = Math.max(0, total - correct);
  return <main style={{ minHeight: '100vh', background: '#f8fafc', padding: '1.2rem' }}>
    <section style={{ maxWidth: 760, margin: '0 auto', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '1rem', padding: '1.25rem' }}>
      <button type="button" onClick={() => navigate('/ielts/journey')} style={{ border: 'none', background: 'none', color: '#2563eb', cursor: 'pointer', marginBottom: '1rem', fontWeight: 700 }}>← Back to My IELTS Journey</button>
      <h1 style={{ marginTop: 0 }}>{skill === 'reading' ? 'Reading' : 'Listening'} Objective Result</h1>
      <p style={{ marginTop: '-0.3rem', color: '#64748b' }}>This page shows machine-scored objective performance only.</p>
      {isLoading ? <p style={{ color: '#64748b' }}>Loading content…</p> : null}
      {error ? <div style={{ color: '#991b1b', background: '#fee2e2', border: '1px solid #fecaca', borderRadius: '0.75rem', padding: '0.85rem' }}>Result not ready, unavailable, or permission denied for this attempt.</div> : null}
      {data ? <div style={{ display: 'grid', gap: '0.8rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.7rem' }}>
          <div style={{ background: '#eff6ff', borderRadius: '0.7rem', padding: '0.8rem' }}><div style={{ color: '#475569', fontSize: '0.82rem' }}>Score summary</div><strong style={{ fontSize: '1.5rem', color: '#1d4ed8' }}>{correct}/{total}</strong></div>
          <div style={{ background: '#f8fafc', borderRadius: '0.7rem', padding: '0.8rem' }}><div style={{ color: '#475569', fontSize: '0.82rem' }}>Answered / Total</div><strong style={{ fontSize: '1.2rem' }}>{correct + incorrect}/{total}</strong></div>
          <div style={{ background: '#f8fafc', borderRadius: '0.7rem', padding: '0.8rem' }}><div style={{ color: '#475569', fontSize: '0.82rem' }}>Correct / Incorrect</div><strong style={{ fontSize: '1.2rem' }}>{correct} / {incorrect}</strong></div>
        </div>
        <p style={{ margin: 0, color: '#334155' }}>Objective result: <strong>{data.percent ?? 0}% correct</strong>. Estimated readiness band: <strong>{data.est_band ?? 'Not enough data'}</strong>.</p>
      </div> : null}
    </section>
  </main>;
};

export default IeltsObjectiveResult;
