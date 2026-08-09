import React, { useEffect, useMemo, useState } from 'react';
import {
  createGuardianInvitation,
  getGuardianManagementSnapshot,
  revokeGuardianInvitation,
  revokeGuardianRelationship,
  type GuardianManagementSnapshot,
} from '../../services/guardianService';
import './GuardianManagementPage.css';

const GuardianManagementPage: React.FC = () => {
  const [data, setData] = useState<GuardianManagementSnapshot | null>(null);
  const [studentId, setStudentId] = useState('');
  const [email, setEmail] = useState('');
  const [relationship, setRelationship] = useState('Parent / Guardian');
  const [query, setQuery] = useState('');
  const [generatedLink, setGeneratedLink] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = async () => { setBusy(true); setError(null); try { setData(await getGuardianManagementSnapshot()); } catch (e) { setError(e instanceof Error ? e.message : 'Guardian management could not be loaded.'); } finally { setBusy(false); } };
  useEffect(() => { void load(); }, []);

  const students = useMemo(() => (data?.students || []).filter((s) => !query.trim() || `${s.student_name} ${s.class_name || ''}`.toLowerCase().includes(query.toLowerCase().trim())), [data, query]);

  const createInvite = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); setError(null); setMessage(null); setGeneratedLink(null);
    try {
      const result = await createGuardianInvitation({ studentId, email, relationshipLabel: relationship });
      const url = new URL('/parent-portal.html', window.location.origin); url.searchParams.set('invite', result.token);
      setGeneratedLink(url.toString()); setMessage(`Invitation created for ${result.invited_email}. The link expires automatically.`); setEmail('');
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : 'Invitation could not be created.'); } finally { setBusy(false); }
  };

  return <main className="guardian-admin"><header><div><span>BH</span><div><strong>Guardian Access</strong><small>School-verified parent relationships</small></div></div><button onClick={() => window.history.length > 1 ? window.history.back() : window.location.assign('/')}>Back</button></header>
    <section className="guardian-admin-hero"><div><span>Parent accounts</span><h1>Invite and verify guardians</h1><p>Guardian access is child-specific, email-bound and revocable. Parents do not become school members and cannot browse staff, classes or other students.</p></div><div><strong>{data?.relationships.filter((x) => x.status === 'active').length || 0}</strong><small>active guardian links</small></div></section>
    {error ? <div className="guardian-admin-alert error">{error}</div> : null}{message ? <div className="guardian-admin-alert">{message}</div> : null}
    <section className="guardian-admin-grid"><article><h2>Create invitation</h2><form onSubmit={createInvite}><label>Find student<input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name or class" /></label><label>Student<select required value={studentId} onChange={(e) => setStudentId(e.target.value)}><option value="">Choose student</option>{students.map((s) => <option key={s.student_id} value={s.student_id}>{s.student_name} · Class {s.class_name || '—'}</option>)}</select></label><label>Guardian email<input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></label><label>Relationship<select value={relationship} onChange={(e) => setRelationship(e.target.value)}><option>Parent / Guardian</option><option>Mother</option><option>Father</option><option>Guardian</option><option>Carer</option></select></label><button disabled={busy || !studentId}>{busy ? 'Working…' : 'Generate secure invitation'}</button></form>{generatedLink ? <div className="guardian-link-box"><small>Share this link only with the invited email owner.</small><input readOnly value={generatedLink} /><button onClick={() => navigator.clipboard.writeText(generatedLink)}>Copy link</button></div> : null}</article>
      <article><h2>How verification works</h2><ol><li>School selects the student and guardian email.</li><li>Brain Heist creates a one-time, expiring secure link.</li><li>The guardian signs in or creates an account using that same email.</li><li>Only after email confirmation does the child relationship activate.</li><li>The school can revoke the relationship at any time.</li></ol><p className="guardian-admin-note">The parent dashboard receives a deliberately smaller academic contract. Internal teacher observations and private evidence JSON are excluded.</p></article></section>
    <section className="guardian-admin-panel"><div><h2>Verified guardians</h2><span>{data?.relationships.length || 0} records</span></div><div className="guardian-admin-table"><table><thead><tr><th>Student</th><th>Guardian</th><th>Relationship</th><th>Status</th><th>Verified</th><th></th></tr></thead><tbody>{(data?.relationships || []).map((r) => <tr key={r.id}><td>{r.student_name}</td><td><strong>{r.guardian_name || 'Guardian'}</strong><small>{r.guardian_email || '—'}</small></td><td>{r.relationship_label}</td><td>{r.status}</td><td>{new Date(r.verified_at).toLocaleDateString()}</td><td>{r.status === 'active' ? <button onClick={async () => { if (!confirm('Revoke this guardian’s access to the student?')) return; setBusy(true); try { await revokeGuardianRelationship(r.id); await load(); } catch (e) { setError(e instanceof Error ? e.message : 'Could not revoke access.'); } finally { setBusy(false); } }}>Revoke</button> : null}</td></tr>)}</tbody></table></div></section>
    <section className="guardian-admin-panel"><div><h2>Invitation history</h2><span>{data?.invitations.length || 0} invitations</span></div><div className="guardian-admin-table"><table><thead><tr><th>Student</th><th>Email</th><th>Status</th><th>Expires</th><th></th></tr></thead><tbody>{(data?.invitations || []).map((i) => <tr key={i.id}><td>{i.student_name}</td><td>{i.invited_email}</td><td>{i.status}</td><td>{new Date(i.expires_at).toLocaleDateString()}</td><td>{i.status === 'pending' ? <button onClick={async () => { setBusy(true); try { await revokeGuardianInvitation(i.id); await load(); } catch (e) { setError(e instanceof Error ? e.message : 'Could not revoke invitation.'); } finally { setBusy(false); } }}>Revoke</button> : null}</td></tr>)}</tbody></table></div></section>
  </main>;
};
export default GuardianManagementPage;
