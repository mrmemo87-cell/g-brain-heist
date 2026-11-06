import React, { useEffect, useState } from 'react';
import { fetchArenaAdminSettings, updateArenaSchoolSettings, updateArenaClassSettings, type ArenaAdminSettings } from '../../services/arenaService';

interface ArenaSettingsSectionProps {
  schoolId: string;
  addToast: (message: string, type?: 'info' | 'success' | 'error' | 'warning') => void;
}

/** School-wide switch, daily cap and play window for the Proving Grounds arena. Off until an admin turns it on. */
const ArenaSettingsSection: React.FC<ArenaSettingsSectionProps> = ({ schoolId, addToast }) => {
  const [settings, setSettings] = useState<ArenaAdminSettings | null>(null);
  const [failed, setFailed] = useState(false);
  const [draft, setDraft] = useState({ enabled: false, daily_cap: 5, window_start: '15:00', window_end: '23:59', weekend_all_day: true });
  const [saving, setSaving] = useState(false);
  const [classBusy, setClassBusy] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetchArenaAdminSettings(schoolId)
      .then((value) => { if (!active) return; setSettings(value); setDraft({ enabled: value.enabled, daily_cap: value.daily_cap, window_start: value.window_start, window_end: value.window_end, weekend_all_day: value.weekend_all_day }); })
      .catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, [schoolId]);

  const save = async () => {
    setSaving(true);
    try {
      const next = await updateArenaSchoolSettings(schoolId, draft);
      setSettings(next);
      addToast(next.enabled ? 'The arena is on for your school.' : 'The arena is off for your school.', 'success');
    } catch (error) {
      const msg = error instanceof Error ? error.message : '';
      addToast(msg.includes('INVALID_WINDOW') ? 'The opening time must be before the closing time.' : msg.includes('INVALID_CAP') ? 'The daily cap must be between 0 and 20.' : 'Arena settings could not be saved.', 'error');
    } finally { setSaving(false); }
  };

  const toggleClass = async (classId: string, enabled: boolean, requireAssignment: boolean) => {
    setClassBusy(classId);
    try {
      await updateArenaClassSettings(classId, enabled, requireAssignment);
      setSettings((cur) => cur ? { ...cur, classes: cur.classes.map((c) => (c.class_id === classId ? { ...c, enabled, require_assignment: requireAssignment } : c)) } : cur);
    } catch { addToast('The class setting could not be saved.', 'error'); }
    finally { setClassBusy(null); }
  };

  return (
    <section className="admin-form-card" data-testid="arena-settings">
      <div className="admin-card-heading"><div><h3>Proving Grounds arena</h3><p>A 3-vs-3 battle game students unlock by studying. Every match costs a ticket earned from quests, quizzes and assignments. Off until you turn it on.</p></div>{settings ? <span className="admin-locked-pill">{settings.enabled ? 'On' : 'Off'}</span> : null}</div>
      {failed ? <div className="admin-inline-warning" role="alert"><strong>Arena settings could not be loaded</strong><span>Refresh the page or try again later.</span></div> : null}
      {settings ? <>
        <div className="registration-rule-list">
          <label><input type="checkbox" checked={draft.enabled} onChange={(event) => setDraft((d) => ({ ...d, enabled: event.target.checked }))} /><span><strong>Open the arena for this school</strong><small>Students see the Arena tab and can play inside the hours below. Teachers can still switch it off for their own class.</small></span></label>
          <label><input type="checkbox" checked={draft.weekend_all_day} onChange={(event) => setDraft((d) => ({ ...d, weekend_all_day: event.target.checked }))} /><span><strong>Open all day on Saturday and Sunday</strong><small>On weekdays the hours below apply.</small></span></label>
        </div>
        <div className="admin-form-grid admin-form-grid-three" style={{ padding: '0 1.25rem 1rem' }}>
          <label className="admin-field"><span>Daily match cap per student</span><input type="number" min={0} max={20} value={draft.daily_cap} onChange={(event) => setDraft((d) => ({ ...d, daily_cap: Number(event.target.value) }))} /></label>
          <label className="admin-field"><span>Opens at (weekdays)</span><input type="time" value={draft.window_start} onChange={(event) => setDraft((d) => ({ ...d, window_start: event.target.value }))} /></label>
          <label className="admin-field"><span>Closes at (weekdays)</span><input type="time" value={draft.window_end} onChange={(event) => setDraft((d) => ({ ...d, window_end: event.target.value }))} /></label>
        </div>
        <div className="admin-form-actions"><span style={{ marginRight: 'auto', color: '#64748b', fontSize: '.74rem' }}>{settings.matches_this_week} matches played this week</span><button type="button" className="admin-button-primary" disabled={saving} onClick={() => void save()}>{saving ? 'Saving…' : 'Save arena settings'}</button></div>
        {settings.classes.length ? <div className="registration-rule-list" style={{ paddingTop: 0 }}>
          <strong style={{ color: '#17243b', fontSize: '.8rem' }}>Per class</strong>
          {settings.classes.map((c) => (
            <div key={c.class_id} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '.75rem', padding: '.65rem .85rem', border: '1px solid #dbe4ee', borderRadius: '.7rem' }}>
              <strong style={{ color: '#17243b', fontSize: '.8rem', flex: '1 1 120px' }}>{c.class_name}</strong>
              <label style={{ display: 'flex', alignItems: 'center', gap: '.4rem', fontSize: '.74rem', color: '#334155' }}><input type="checkbox" checked={c.enabled} disabled={classBusy === c.class_id} onChange={(event) => void toggleClass(c.class_id, event.target.checked, c.require_assignment)} />Arena on</label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '.4rem', fontSize: '.74rem', color: '#334155' }}><input type="checkbox" checked={c.require_assignment} disabled={classBusy === c.class_id} onChange={(event) => void toggleClass(c.class_id, c.enabled, event.target.checked)} />Assignments first</label>
            </div>
          ))}
        </div> : null}
      </> : null}
    </section>
  );
};

export default ArenaSettingsSection;
