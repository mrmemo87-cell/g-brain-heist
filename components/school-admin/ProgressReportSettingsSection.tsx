import React, { useEffect, useState } from 'react';
import { fetchProgressExpectedLevel, setProgressExpectedLevel } from '../../services/classProgressReportService';

interface Props {
  schoolId: string;
  addToast: (message: string, type?: 'info' | 'success' | 'error' | 'warning') => void;
}

/** The school's expected level for every class progress report (40–95%, default 70%). */
const ProgressReportSettingsSection: React.FC<Props> = ({ schoolId, addToast }) => {
  const [level, setLevel] = useState<number>(70);
  const [saved, setSaved] = useState<{ level: number; set: boolean } | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    fetchProgressExpectedLevel(schoolId)
      .then((value) => { if (active) { setSaved(value); setLevel(value.level); } })
      .catch(() => { if (active) setSaved({ level: 70, set: false }); });
    return () => { active = false; };
  }, [schoolId]);

  const save = async () => {
    setSaving(true);
    try {
      const next = await setProgressExpectedLevel(schoolId, level);
      setSaved({ level: next, set: true });
      addToast(`Class progress reports now use a ${next}% expected level.`, 'success');
    } catch (error) {
      addToast(error instanceof Error ? error.message : 'The expected level could not be saved.', 'error');
    } finally { setSaving(false); }
  };

  return (
    <section className="admin-form-card" data-testid="progress-report-settings">
      <div className="admin-card-heading"><div><h3>Class progress reports</h3><p>The expected level every class is measured against. Reports show students below, working towards, at or above it (15 points either side), and the class status uses it.</p></div>{saved ? <span className="admin-locked-pill">{saved.level}%{saved.set ? '' : ' · default'}</span> : null}</div>
      <div className="admin-form-grid" style={{ padding: '0 1.25rem 1rem' }}>
        <label className="admin-field"><span>Expected level (%)</span><input type="number" min={40} max={95} step={1} value={level} onChange={(event) => setLevel(Number(event.target.value))} /><small>Between 40% and 95%. Used for every class in the school.</small></label>
      </div>
      <div className="admin-form-actions"><button type="button" className="admin-button-primary" disabled={saving || !saved || level < 40 || level > 95} onClick={() => void save()}>{saving ? 'Saving…' : 'Save expected level'}</button></div>
    </section>
  );
};

export default ProgressReportSettingsSection;
