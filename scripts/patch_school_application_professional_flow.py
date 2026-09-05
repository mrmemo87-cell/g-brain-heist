from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def replace(path: str, old: str, new: str, count: int = 1) -> None:
    target = ROOT / path
    text = target.read_text(encoding='utf-8')
    if old not in text:
        raise SystemExit(f'Expected block not found in {path}: {old[:120]!r}')
    target.write_text(text.replace(old, new, count), encoding='utf-8')


# Applicant-facing school application flow.
replace(
    'components/SchoolRequestModal.tsx',
    "setSelectedRequestId(result.requests[0]?.id ?? null);",
    """const preferredRequest = result.requests.find((request) =>
      request.status === 'pending' || request.status === 'needs_more_info'
    ) ?? result.requests[0] ?? null;
    setSelectedRequestId(preferredRequest?.id ?? null);""",
)

replace(
    'components/SchoolRequestModal.tsx',
    """  useEffect(() => {
    if (!isOpen || activeView !== 'applications') return;
    if (!session && sessionChecked) {
      setRequests([]);
      setRequestsError('Log in to view your applications.');
      return;
    }
    void loadMyRequests();
  }, [activeView, isOpen, loadMyRequests, session, sessionChecked]);""",
    """  useEffect(() => {
    if (!isOpen) return;
    if (!session && sessionChecked) {
      setRequests([]);
      setRequestsError('Log in to view your school application.');
      return;
    }
    if (!session) return;
    void loadMyRequests();
  }, [isOpen, loadMyRequests, session, sessionChecked]);

  useEffect(() => {
    if (!isOpen || requests.length === 0) return;
    const preferredRequest = requests.find((request) =>
      request.status === 'pending' || request.status === 'needs_more_info'
    ) ?? requests[0];
    if (!preferredRequest) return;
    setSelectedRequestId(preferredRequest.id);
    setActiveView('applications');
    setStatusView(false);
  }, [isOpen, requests]);""",
)

replace(
    'components/SchoolRequestModal.tsx',
    "{activeView === 'applications' ? 'My school applications' : 'Apply to add your school'}",
    "{activeView === 'applications' ? 'Your school application' : 'Apply to add your school'}",
)
replace(
    'components/SchoolRequestModal.tsx',
    "? 'Track status updates and respond if we need more info.'",
    "? 'Track the review and respond only if we ask for more information.'",
)
replace(
    'components/SchoolRequestModal.tsx',
    '<div className="mt-4 flex gap-2">',
    '<div className="hidden" aria-hidden="true">',
)
replace(
    'components/SchoolRequestModal.tsx',
    "No applications yet. Submit a request to get started.",
    "No school application is on file yet. Submit one request to get started.",
)
replace(
    'components/SchoolRequestModal.tsx',
    """                    {selectedRequest.admin_notes && (
                      <p className="mt-2 text-sm text-slate-300">{selectedRequest.admin_notes}</p>
                    )}""",
    """                    {selectedRequest.status === 'pending' && (
                      <div className="mt-3 rounded-lg border border-cyan-400/25 bg-cyan-400/5 p-3 text-sm leading-relaxed text-cyan-50">
                        <p className="font-semibold">No action required right now.</p>
                        <p className="mt-1 text-cyan-100/80">Most applications are reviewed within 24 hours. We will email your verified Brains Heist address as soon as there is an update.</p>
                      </div>
                    )}
                    {selectedRequest.status === 'approved' && (
                      <div className="mt-3 rounded-lg border border-emerald-400/30 bg-emerald-400/10 p-3 text-sm leading-relaxed text-emerald-50">
                        <p className="font-semibold">Your school workspace is active.</p>
                        <p className="mt-1 text-emerald-100/80">You have been provisioned as the School Admin and School Head for this school. Continue in Brains Heist to finish the school setup.</p>
                      </div>
                    )}
                    {selectedRequest.admin_notes && selectedRequest.status !== 'pending' && (
                      <p className="mt-2 text-sm text-slate-300">{selectedRequest.admin_notes}</p>
                    )}
                    {(selectedRequest.status === 'rejected' || selectedRequest.status === 'duplicate') && (
                      <button
                        type="button"
                        onClick={() => {
                          setActiveView('apply');
                          setSelectedRequestId(null);
                          setStatusView(false);
                          setRequestsError(null);
                        }}
                        className="mt-4 rounded-lg border border-white/15 px-4 py-2 text-sm font-semibold text-white hover:border-cyan-300/50"
                      >
                        Submit a different school application
                      </button>
                    )}""",
)
replace(
    'components/SchoolRequestModal.tsx',
    """                {selectedRequest && (
                  <div className="rounded-lg border border-white/10 bg-black/30 p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-semibold text-white">Conversation</p>""",
    """                {selectedRequest && selectedRequest.status === 'needs_more_info' && (
                  <div className="rounded-lg border border-white/10 bg-black/30 p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-semibold text-white">Review conversation</p>""",
)
replace(
    'components/SchoolRequestModal.tsx',
    "{(selectedRequest.status === 'pending' || selectedRequest.status === 'needs_more_info') && (",
    "{selectedRequest.status === 'needs_more_info' && (",
)
replace(
    'components/SchoolRequestModal.tsx',
    "Live updates. New replies appear automatically.",
    "Replies are available only when the reviewer asks for more information.",
)
replace(
    'components/SchoolRequestModal.tsx',
    "placeholder=\"Type your reply to continue the conversation.\"",
    "placeholder=\"Reply with the requested information.\"",
)
replace(
    'components/SchoolRequestModal.tsx',
    "{replySending ? 'Sending...' : 'Send message'}",
    "{replySending ? 'Sending...' : 'Send requested information'}",
)
replace(
    'components/SchoolRequestModal.tsx',
    """              {message && <p className="mt-2 text-sm text-slate-300">{message}</p>}
              <p className="mt-3 text-xs text-slate-400">""",
    """              {message && <p className="mt-2 text-sm text-slate-300">{message}</p>}
              {requestStatus === 'pending' && (
                <div className="mt-3 rounded-lg border border-cyan-400/25 bg-cyan-400/5 p-3 text-sm text-cyan-50">
                  <p className="font-semibold">No action required.</p>
                  <p className="mt-1 text-cyan-100/80">Most applications are reviewed within 24 hours. We will email you when the review changes.</p>
                </div>
              )}
              <p className="mt-3 text-xs text-slate-400">""",
)

# Service copy and richer application detail loading.
replace(
    'services/schoolRequestService.ts',
    'The request was saved, but the email update could not be sent. The current status is still available in My applications.',
    'The request was saved, but the email update could not be sent. The current status is still available in your school application.',
    count=2,
)
replace(
    'services/schoolRequestService.ts',
    """        message: email.sent
          ? 'Your request has been submitted. A confirmation is queued for your verified Brains Heist email, and future superadmin updates will be queued there too.'
          : 'Your request has been submitted. Track it in My applications while email delivery is temporarily unavailable.',""",
    """        message: email.sent
          ? 'Application submitted. No action is required right now. Most applications are reviewed within 24 hours, and we will email your verified Brains Heist address when the status changes.'
          : 'Application submitted. No action is required right now. Your status remains available here while email delivery retries in the background.',""",
)
replace(
    'services/schoolRequestService.ts',
    ".select('id, requested_name, requester_email, requester_role, status, created_at, admin_notes, approved_school_id')",
    ".select('id, requested_name, requester_email, requester_role, status, created_at, admin_notes, approved_school_id, city, country, website, contact_email, decision_maker_name, decision_maker_title')",
)

# Superadmin success copy: reflect what the backend really provisioned.
replace(
    'components/AdminPortal.tsx',
    """      const inviteLabel = result.inviteCode || 'generated';
      const schoolIdLabel = result.schoolId || 'created';
      addToast(
        `Approved request. Invite code: ${inviteLabel} • School ID: ${schoolIdLabel}. Requester joined as student/teacher. Assign a school admin separately.`,
        'success'
      );""",
    """      addToast(
        'School approved. The workspace is active and the requester has been provisioned as School Admin and School Head. An approval email has been queued.',
        'success'
      );""",
)

replace(
    'components/JoinSchoolCard.tsx',
    'Open my applications / request school',
    'Open school application',
)

# Keep regression coverage close to the workflow.
test_path = ROOT / 'tests/schoolApplicationProfessionalFlow.test.ts'
test_path.write_text(r'''import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const modal = readFileSync('components/SchoolRequestModal.tsx', 'utf8');
const service = readFileSync('services/schoolRequestService.ts', 'utf8');
const admin = readFileSync('components/AdminPortal.tsx', 'utf8');
const migration = readFileSync('supabase/migrations/20260905060000_professional_school_application_flow.sql', 'utf8');

test('pending applicants have a passive single-application experience', () => {
  assert.match(modal, /Your school application/);
  assert.match(modal, /No action required right now/);
  assert.match(modal, /reviewed within 24 hours/);
  assert.match(modal, /selectedRequest\.status === 'needs_more_info'/);
  assert.doesNotMatch(modal, /selectedRequest\.status === 'pending' \|\| selectedRequest\.status === 'needs_more_info'/);
});

test('approval messaging reflects automatic school leadership provisioning', () => {
  assert.match(admin, /requester has been provisioned as School Admin and School Head/);
  assert.doesNotMatch(admin, /Requester joined as student\/teacher/);
  assert.match(modal, /School Admin and School Head/);
});

test('backend allows one active application and applicant replies only when requested', () => {
  assert.match(migration, /school_requests_one_active_per_requester_uidx/);
  assert.match(migration, /status in \('pending', 'needs_more_info'\)/i);
  assert.match(migration, /v_status <> 'needs_more_info'/);
  assert.match(migration, /owner-school-request-/);
});

test('submission copy is customer-facing rather than queue-internal', () => {
  assert.match(service, /Application submitted\. No action is required right now/);
  assert.doesNotMatch(service, /A confirmation is queued/);
});
''', encoding='utf-8')
