import React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../../services/supabaseClient';

type ObjectiveResultRow = {
  id: string;
  raw_score: number | null;
  total_questions: number | null;
  percent: number | null;
  est_band: number | null;
  completed_at: string | null;
};

const isNoRowsSupabaseError = (error: { code?: string; message?: string } | null | undefined): boolean => (
  error?.code === 'PGRST116' || /0 rows|single json object/i.test(error?.message ?? '')
);

const IeltsObjectiveResult: React.FC = () => {
  const navigate = useNavigate();
  const { skill, attemptId } = useParams<{ skill: string; attemptId: string }>();

  const { data, isLoading, error } = useQuery<ObjectiveResultRow | null>({
    queryKey: ['ielts-objective-result', skill, attemptId],
    queryFn: async () => {
      if (!attemptId || (skill !== 'reading' && skill !== 'listening')) throw new Error('Invalid result route.');
      const table = skill === 'reading' ? 'ielts_reading_attempts' : 'ielts_listening_attempts';
      const { data: row, error: qErr } = await supabase
        .from(table).select('id, raw_score, total_questions, percent, est_band, completed_at')
        .eq('id', attemptId)
        .maybeSingle();

      // maybeSingle() should return null for inaccessible/missing rows. Keep this
      // guard so older Supabase/PostgREST clients that still surface PGRST116 do
      // not crash the result page for a not-yet-created attempt.
      if (isNoRowsSupabaseError(qErr)) return null;
      if (qErr) throw qErr;
      return row as ObjectiveResultRow | null;
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
      {error ? <div style={{ color: '#991b1b', background: '#fee2e2', border: '1px solid #fecaca', borderRadius: '0.75rem', padding: '0.85rem' }}>Unable to load this result: {error instanceof Error ? error.message : 'Unexpected result error.'}</div> : null}
      {!isLoading && !error && data === null ? (
        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '0.85rem', padding: '1rem', color: '#334155' }}>
          <h2 style={{ margin: '0 0 0.4rem', color: '#0f172a', fontSize: '1rem' }}>Result not available yet.</h2>
          <p style={{ margin: 0, color: '#64748b' }}>This result may not have been completed, or you may not have permission to view it.</p>
          <button type="button" onClick={() => navigate('/ielts/journey')} style={{ marginTop: '0.85rem', background: '#2563eb', color: '#ffffff', border: 'none', borderRadius: '0.55rem', padding: '0.55rem 0.85rem', fontWeight: 800, cursor: 'pointer' }}>
            Back to My IELTS Journey
          </button>
        </div>
      ) : null}
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
