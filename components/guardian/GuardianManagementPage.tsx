import React, { useEffect, useMemo, useState } from 'react';
import {
  createGuardianInvitation,
  getGuardianManagementSnapshot,
  revokeGuardianInvitation,
  revokeGuardianRelationship,
  type GuardianManagementSnapshot,
} from '../../services/guardianService';
import { getAcademicProgressExperienceContext, type AcademicProgressExperienceContext } from '../../services/academicProgressExperienceService';
import { AcademicProgressHeader, AcademicStudentPicker, selectionFromStudent } from '../student-progress/AcademicProgressSuite';
import './GuardianManagementPage.css';

const GuardianManagementPage: React.FC = () => {
  const initialStudentId = useMemo(() => new URLSearchParams(window.location.search).get('student') || '', []);
  const [data, setData] = useState<GuardianManagementSnapshot | null>(null);
  const [context, setContext] = useState<AcademicProgressExperienceContext | null>(null);
  const [grade, setGrade] = useState('');
  const [className, setClassName] = useState('');
  const [studentId, setStudentId] = useState('');
  const [email, setEmail] = useState('');
  const [relationship, setRelationship] = useState('Parent / Guardian');
  const [generatedLink, setGeneratedLink] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = async () => {
    setBusy(true); setError(null);
    try {
      const [snapshot, nextContext] = await Promise.all([
        getGuardianManagementSnapshot(),
        getAcademicProgressExperienceContext(),
      ]);
      setData(snapshot); setContext(nextContext);
      if (initialStudentId && !studentId) {
        const selection = selectionFromStudent(snapshot.students, initialStudentId);
        if (selection) { setGrade(selection.grade); setClassName(selection.className); setStudentId(initialStudentId); }
      }
    } catch (e) { setError(e instanceof Error ? e.message : 'Parent access could not be loaded.'); }
    finally { setBusy(false); }
  };
  useEffect(() => { void load(); }, []);

  useEffect(() => {
    if (!data || !studentId) return;
    if (!data.students.some((student) => student.student_id === studentId)) {
      setStudentId(''); setGrade(''); setClassName('');
      setError('The selected student is not available in your active school roster.');
    }
  }, [data, studentId]);

  const selectedStudent = data?.students.find((student) => student.student_id === studentId) || null;

  const createInvite = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); setError(null); setMessage(null); setGeneratedLink(null);
    try {
      const result = await createGuardianInvitation({ studentId, email, relationshipLabel: relationship });
      const url = new URL('/parent-portal.html', window.location.origin); url.searchParams.set('invite', result.token);
      setGeneratedLink(url.toString());
      setMessage(`Secure parent invitation created for ${result.invited_email}.`);
      setEmail('');
      const refreshed = await getGuardianManagementSnapshot(); setData(refreshed);
    } catch (e) { setError(e instanceof Error ? e.message : 'The parent invitation could not be created.'); }
    finally { setBusy(false); }
  };

  return <main className="guardian-admin">
    <AcademicProgressHeader
      context={context}
      eyebrow="Parent Communication"
      title="Parent Access"
      subtitle="Connect each parent or guardian to the correct child so they can follow marks, strengths, areas for development and progress over time."
      backLabel="Back to School Administration"
    />

    {error ? <div className="guardian-admin-alert error">{error}</div> : null}
    {message ? <div className="guardian-admin-alert">{message}</div> : null}

    <AcademicStudentPicker
      students={data?.students || []}
      grade={grade}
      className={className}
      studentId={studentId}
      showSubject={false}
      onGradeChange={(value) => { setGrade(value); setClassName(''); setStudentId(''); setGeneratedLink(null); }}
      onClassChange={(value) => { setClassName(value); setStudentId(''); setGeneratedLink(null); }}
      onStudentChange={(value) => { setStudentId(value); setGeneratedLink(null); }}
    />

    <section className="guardian-admin-grid">
      <article>
        <h2>Invite a parent or guardian</h2>
        <p className="guardian-admin-note">The account is not created by the school. The school verifies the relationship, then the parent signs in or creates their own secure account using the invited email address.</p>
        <form onSubmit={createInvite}>
          <label>Selected student<input readOnly value={selectedStudent ? `${selectedStudent.student_name} · ${selectedStudent.grade ? `Grade ${selectedStudent.grade} · ` : ''}Class ${selectedStudent.class_name || '—'}` : 'Choose the student above'} /></label>
          <label>Parent / guardian email<input required type="email" disabled={!studentId} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="parent@example.com" /></label>
          <label>Relationship<select value={relationship} disabled={!studentId} onChange={(e) => setRelationship(e.target.value)}><option>Parent / Guardian</option><option>Mother</option><option>Father</option><option>Guardian</option><option>Carer</option></select></label>
          <button disabled={busy || !studentId}>{busy ? 'Working…' : 'Create secure invitation'}</button>
        </form>
        {generatedLink ? <div className="guardian-link-box"><small>Send this link only to the invited email owner. They will use it to verify access to this child.</small><input readOnly value={generatedLink} /><button onClick={() => navigator.clipboard.writeText(generatedLink)}>Copy invitation link</button></div> : null}
      </article>

      <article>
        <h2>What the parent experiences</h2>
        <ol><li>The school chooses the correct student and enters the parent’s email.</li><li>The parent opens the secure invitation and signs in or creates an account with that same email.</li><li>After email verification, <strong>My Children</strong> opens with only the child or children explicitly linked to that parent.</li></ol>
        <p className="guardian-admin-note">Parents see marks, subject performance, strengths, recurring areas for development, improvement, resolved areas, overdue work and a simple progress timeline. Private teacher notes and raw internal evidence stay hidden.</p>
      </article>
    </section>

    <section className="guardian-admin-panel"><div><h2>Verified parents & guardians</h2><span>{data?.relationships.filter((x) => x.status === 'active').length || 0} active</span></div><div className="guardian-admin-table"><table><thead><tr><th>Student</th><th>Parent / Guardian</th><th>Relationship</th><th>Status</th><th>Verified</th><th></th></tr></thead><tbody>{(data?.relationships || []).map((r) => <tr key={r.id}><td>{r.student_name}</td><td><strong>{r.guardian_name || 'Guardian'}</strong><small>{r.guardian_email || '—'}</small></td><td>{r.relationship_label}</td><td>{r.status}</td><td>{new Date(r.verified_at).toLocaleDateString()}</td><td>{r.status === 'active' ? <button onClick={async () => { if (!confirm('Remove this parent or guardian’s access to the student?')) return; setBusy(true); try { await revokeGuardianRelationship(r.id); await load(); } catch (e) { setError(e instanceof Error ? e.message : 'Access could not be removed.'); } finally { setBusy(false); } }}>Revoke</button> : null}</td></tr>)}</tbody></table></div></section>

    <section className="guardian-admin-panel"><div><h2>Invitation history</h2><span>{data?.invitations.length || 0} invitations</span></div><div className="guardian-admin-table"><table><thead><tr><th>Student</th><th>Email</th><th>Status</th><th>Expires</th><th></th></tr></thead><tbody>{(data?.invitations || []).map((i) => <tr key={i.id}><td>{i.student_name}</td><td>{i.invited_email}</td><td>{i.status}</td><td>{new Date(i.expires_at).toLocaleDateString()}</td><td>{i.status === 'pending' ? <button onClick={async () => { setBusy(true); try { await revokeGuardianInvitation(i.id); await load(); } catch (e) { setError(e instanceof Error ? e.message : 'Invitation could not be revoked.'); } finally { setBusy(false); } }}>Revoke</button> : null}</td></tr>)}</tbody></table></div></section>
  </main>;
};

export default GuardianManagementPage;
