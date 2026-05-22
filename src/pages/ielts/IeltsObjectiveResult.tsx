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
      const { data: row, error: qErr } = await supabase.from(table).select('id, raw_score, total_questions, percent, est_band, estimated_band, completed_at').eq('id', attemptId).single();
      if (qErr) throw qErr;
      return row;
    },
  });

  return <div style={{ padding: '1rem', maxWidth: 720, margin: '0 auto' }}>
    <button type="button" onClick={() => navigate('/ielts/journey')} style={{ border: 'none', background: 'none', color: '#2563eb', cursor: 'pointer', marginBottom: '1rem' }}>← Back to My IELTS Journey</button>
    <h1>{skill === 'reading' ? 'Reading' : 'Listening'} Result</h1>
    {isLoading ? <p>Loading result…</p> : null}
    {error ? <p style={{ color: '#b91c1c' }}>This result is unavailable or you do not have access.</p> : null}
    {data ? <div>
      <p>Score: <strong>{data.raw_score ?? 0}/{data.total_questions ?? 0}</strong></p>
      <p>Percent: <strong>{data.percent ?? 0}%</strong></p>
      <p>Estimated band/readiness: <strong>{data.est_band ?? data.estimated_band ?? 'Not enough data'}</strong></p>
    </div> : null}
  </div>;
};

export default IeltsObjectiveResult;
