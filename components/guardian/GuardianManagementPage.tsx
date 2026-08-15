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
import { PRODUCT_LOGO_URL, PRODUCT_NAME } from '../../src/lib/schoolBranding';
import './GuardianManagementPage.css';

const safeMessage = (err: unknown, fallback: string) => err instanceof Error && err.message ? err.message : fallback;

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
  const [generatedEmail, setGeneratedEmail] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = async () => {
    setBusy(true); setError(null);
    try {
      const [snapshot, nextContext] = await Promise.all([getGuardianManagementSnapshot(), getAcademicProgressExperienceContext()]);
      setData(snapshot); setContext(nextContext);
      if (initialStudentId && !studentId) {
        const selection = selectionFromStudent(snapshot.students, initialStudentId);
        if (selection) { setGrade(selection.grade); setClassName(selection.className); setStudentId(initialStudentId); }
      }
    } catch (e) { setError(safeMessage(e, 'Parent access is temporarily unavailable. Please try again.')); }
    finally { setBusy(false); }
  };
  useEffect(() => { void load(); }, []);

  useEffect(() => {
    if (!data || !studentId) return;
    if (!data.students.some((student) => student.student_id === studentId)) {
      setStudentId(''); setGrade(''); setClassName('');
      setError('That student is no longer in the active school roster. Please choose another student.');
    }
  }, [data, studentId]);

  const selectedStudent = data?.students.find((student) => student.student_id === studentId) || null;
  const schoolName = context?.school.name || 'Your school';

  const createInvite = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); setError(null); setMessage(null); setGeneratedLink(null); setGeneratedEmail(null);
    try {
      const result = await createGuardianInvitation({ studentId, email, relationshipLabel: relationship });
      const url = new URL('/parent-portal.html', window.location.origin); url.searchParams.set('invite', result.token);
      const link = url.toString();
      const studentName = selectedStudent?.student_name || 'your child';
      const invitationMessage = `${schoolName} has invited you to securely follow ${studentName}’s academic progress through ${PRODUCT_NAME}.\n\nYou’ll be able to see school-approved marks, subject progress, strengths and areas where support may be needed. Private staff notes are never shared.\n\nOpen your secure invitation:\n${link}\n\nPlease use the same email address this invitation was sent to: ${result.invited_email}\n\nThis invitation is time-limited and can be withdrawn by ${schoolName}.`;
      setGeneratedLink(link);
      setGeneratedEmail(invitationMessage);
      setMessage(`Secure ${schoolName} × ${PRODUCT_NAME} invitation queued for email to ${result.invited_email}. The copy buttons below are a backup if you also want to share it manually.`);
      setEmail('');
      const refreshed = await getGuardianManagementSnapshot(); setData(refreshed);
    } catch (e) { setError(safeMessage(e, 'We could not create or queue the parent invitation just now. Please check the details and try again.')); }
    finally { setBusy(false); }
  };

  return <main className="guardian-admin">
    <AcademicProgressHeader
      context={context}
      eyebrow="Parent Communication"
      title="Parent & Guardian Access"
      subtitle="Create secure, school-approved parent access to marks, strengths, areas for development and progress over time."
      backLabel="Back to School Administration"
      actions={<span className="guardian-product-badge"><img src={PRODUCT_LOGO_URL} alt={`${PRODUCT_NAME} logo`} /><span><strong>{PRODUCT_NAME}</strong><small>Secure parent progress</small></span></span>}
    />

    {error ? <div className="guardian-admin-alert error"><strong>We couldn’t complete that step</strong><span>{error}</span><button type="button" onClick={() => void load()}>Try again</button></div> : null}
    {message ? <div className="guardian-admin-alert"><strong>Email queued</strong><span>{message}</span></div> : null}

    <AcademicStudentPicker
      students={data?.students || []}
      grade={grade}
      className={className}
      studentId={studentId}
      showSubject={false}
      onGradeChange={(value) => { setGrade(value); setClassName(''); setStudentId(''); setGeneratedLink(null); setGeneratedEmail(null); }}
      onClassChange={(value) => { setClassName(value); setStudentId(''); setGeneratedLink(null); setGeneratedEmail(null); }}
      onStudentChange={(value) => { setStudentId(value); setGeneratedLink(null); setGeneratedEmail(null); }}
    />

    <section className="guardian-admin-grid">
      <article className="guardian-invite-card">
        <span className="guardian-card-eyebrow">1 · Create access</span>
        <h2>Email a secure parent invitation</h2>
        <p className="guardian-admin-note">The school approves who may see a child. When you create the invitation, a school × {PRODUCT_NAME} email is queued automatically. The parent then creates or signs into their own secure account with the exact invited email address.</p>
        <form onSubmit={createInvite}>
          <label>Selected student<input readOnly value={selectedStudent ? `${selectedStudent.student_name} · ${selectedStudent.grade ? `Grade ${selectedStudent.grade} · ` : ''}Class ${selectedStudent.class_name || '—'}` : 'Choose the student above'} /></label>
          <label>Parent / guardian email<input required type="email" disabled={!studentId} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="parent@example.com" /></label>
          <label>Relationship<select value={relationship} disabled={!studentId} onChange={(e) => setRelationship(e.target.value)}><option>Parent / Guardian</option><option>Mother</option><option>Father</option><option>Guardian</option><option>Carer</option></select></label>
          <button disabled={busy || !studentId}>{busy ? 'Creating & queuing email…' : 'Create & email secure invitation'}</button>
        </form>
      </article>

      <article className="guardian-experience-card">
        <span className="guardian-card-eyebrow">2 · Parent experience</span>
        <h2>What the family will see</h2>
        <div className="guardian-co-brand-preview"><span className="guardian-school-preview"><span>{schoolName.slice(0,1).toUpperCase()}</span><strong>{schoolName}</strong></span><i /><span className="guardian-brains-preview"><img src={PRODUCT_LOGO_URL} alt="" /><strong>{PRODUCT_NAME}</strong></span></div>
        <ol><li>The email and invitation open with <strong>{schoolName}</strong> and {PRODUCT_NAME} branding.</li><li>The parent signs in or creates an account using the same invited email.</li><li><strong>My Children</strong> shows only children explicitly connected by the school.</li></ol>
        <p className="guardian-admin-note">Parents see marks, subject performance, strengths, recurring areas for development, improvement, resolved areas, overdue work and a clear progress timeline. Private teacher notes and raw internal evidence stay hidden.</p>
      </article>
    </section>

    {generatedLink && generatedEmail ? <section className="guardian-share-pack">
      <div className="guardian-share-heading"><div><span>Email queued automatically</span><h2>Manual sharing backup</h2><p>The official invitation is already queued for email. Use these controls only if you also need to share the same secure child-specific invitation manually.</p></div><div className="guardian-share-brand"><span>{schoolName}</span><b>×</b><img src={PRODUCT_LOGO_URL} alt={`${PRODUCT_NAME} logo`} /><strong>{PRODUCT_NAME}</strong></div></div>
      <div className="guardian-share-message"><pre>{generatedEmail}</pre></div>
      <div className="guardian-share-actions"><button type="button" className="primary" onClick={async () => { await navigator.clipboard.writeText(generatedEmail); setMessage('Backup branded invitation message copied.'); }}>Copy backup message</button><button type="button" onClick={async () => { await navigator.clipboard.writeText(generatedLink); setMessage('Backup secure invitation link copied.'); }}>Copy backup secure link</button></div>
      <small>The secure link is intended only for the invited parent or guardian and still requires the exact invited email address.</small>
    </section> : null}

    <section className="guardian-admin-panel"><div><h2>Verified parents & guardians</h2><span>{data?.relationships.filter((x) => x.status === 'active').length || 0} active</span></div><div className="guardian-admin-table"><table><thead><tr><th>Student</th><th>Parent / Guardian</th><th>Relationship</th><th>Status</th><th>Verified</th><th></th></tr></thead><tbody>{(data?.relationships || []).map((r) => <tr key={r.id}><td>{r.student_name}</td><td><strong>{r.guardian_name || 'Guardian'}</strong><small>{r.guardian_email || '—'}</small></td><td>{r.relationship_label}</td><td>{r.status}</td><td>{new Date(r.verified_at).toLocaleDateString()}</td><td>{r.status === 'active' ? <button onClick={async () => { if (!confirm('Remove this parent or guardian’s access to the student?')) return; setBusy(true); try { await revokeGuardianRelationship(r.id); await load(); } catch (e) { setError(safeMessage(e, 'We could not remove this access just now. Please try again.')); } finally { setBusy(false); } }}>Revoke</button> : null}</td></tr>)}</tbody></table></div></section>

    <section className="guardian-admin-panel"><div><h2>Invitation history</h2><span>{data?.invitations.length || 0} invitations</span></div><div className="guardian-admin-table"><table><thead><tr><th>Student</th><th>Email</th><th>Status</th><th>Expires</th><th></th></tr></thead><tbody>{(data?.invitations || []).map((i) => <tr key={i.id}><td>{i.student_name}</td><td>{i.invited_email}</td><td>{i.status}</td><td>{new Date(i.expires_at).toLocaleDateString()}</td><td>{i.status === 'pending' ? <button onClick={async () => { setBusy(true); try { await revokeGuardianInvitation(i.id); await load(); } catch (e) { setError(safeMessage(e, 'We could not cancel this invitation just now. Please try again.')); } finally { setBusy(false); } }}>Revoke</button> : null}</td></tr>)}</tbody></table></div></section>
  </main>;
};

export default GuardianManagementPage;