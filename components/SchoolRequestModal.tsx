import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import * as SchoolRequestService from '../services/schoolRequestService';
import { supabase, type Session } from '../services/supabaseClient';

interface SchoolRequestModalProps {
  isOpen: boolean;
  onClose: () => void;
  requesterRole: 'student' | 'teacher';
  onUseSuggestion?: (inviteCode: string) => void;
}

const statusLabels: Record<SchoolRequestService.SchoolRequestStatus, string> = {
  pending: 'Pending review',
  needs_more_info: 'Needs more info',
  approved: 'Approved',
  rejected: 'Rejected',
  duplicate: 'Duplicate',
};
const statusTextStyles: Record<SchoolRequestService.SchoolRequestStatus, string> = {
  pending: 'text-slate-100',
  needs_more_info: 'text-amber-200',
  approved: 'text-emerald-200',
  rejected: 'text-rose-200',
  duplicate: 'text-purple-200',
};

const SchoolRequestModal: React.FC<SchoolRequestModalProps> = ({
  isOpen,
  onClose,
  requesterRole,
  onUseSuggestion,
}) => {
  const [activeView, setActiveView] = useState<'apply' | 'applications'>('apply');
  const [schoolName, setSchoolName] = useState('');
  const [city, setCity] = useState('');
  const [country, setCountry] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [website, setWebsite] = useState('');
  const [notes, setNotes] = useState('');
  const [statusView, setStatusView] = useState(false);
  const [requestStatus, setRequestStatus] = useState<SchoolRequestService.SchoolRequestStatus>('pending');
  const [requestId, setRequestId] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<SchoolRequestService.SchoolRequestSuggestion[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [moreInfoMessage, setMoreInfoMessage] = useState('');
  const [sendingMoreInfo, setSendingMoreInfo] = useState(false);
  const [requestsLoading, setRequestsLoading] = useState(false);
  const [requestsError, setRequestsError] = useState<string | null>(null);
  const [requests, setRequests] = useState<SchoolRequestService.SchoolRequestRecord[]>([]);
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);
  const [requestMessages, setRequestMessages] = useState<SchoolRequestService.SchoolRequestMessage[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [messagesUnavailable, setMessagesUnavailable] = useState(false);
  const [replyMessage, setReplyMessage] = useState('');
  const [replySending, setReplySending] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [sessionChecked, setSessionChecked] = useState(false);

  const isContactEmailValid = useMemo(() => /\S+@\S+\.\S+/.test(contactEmail.trim()), [contactEmail]);
  const isFormValid = useMemo(
    () =>
      schoolName.trim().length > 2 &&
      city.trim().length > 1 &&
      country.trim().length > 1 &&
      isContactEmailValid,
    [schoolName, city, country, isContactEmailValid]
  );

  const resetForm = () => {
    setActiveView('apply');
    setSchoolName('');
    setCity('');
    setCountry('');
    setContactEmail('');
    setWebsite('');
    setNotes('');
    setSuggestions([]);
    setMessage(null);
    setError(null);
    setRequestId(null);
    setRequestStatus('pending');
    setStatusView(false);
    setMoreInfoMessage('');
    setRequests([]);
    setRequestsError(null);
    setSelectedRequestId(null);
    setRequestMessages([]);
    setMessagesUnavailable(false);
    setReplyMessage('');
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!isFormValid) return;

    setIsSubmitting(true);
    setError(null);
    setMessage(null);

    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData?.session) {
      setIsSubmitting(false);
      setError('Please log in to submit a school request.');
      return;
    }

    const response = await SchoolRequestService.requestSchool({
      schoolName,
      city,
      country,
      contactEmail: contactEmail.trim(),
      website: website.trim() || undefined,
      notes: notes.trim() || undefined,
      requesterRole,
    });

    setIsSubmitting(false);
    setSuggestions(response.suggestions ?? []);
    setRequestId(response.requestId ?? null);

    if (response.success) {
      setRequestStatus((response.status as SchoolRequestService.SchoolRequestStatus) || 'pending');
      setMessage(response.message || 'Your request has been submitted.');
      setStatusView(true);
      return;
    }

    if (response.existingSchool) {
      setRequestStatus('duplicate');
      setMessage(response.error || 'This school already exists.');
      setStatusView(true);
      return;
    }

    if (response.requestId) {
      setRequestStatus((response.status as SchoolRequestService.SchoolRequestStatus) || 'pending');
      setMessage(response.error || 'Your request is already in the queue.');
      setStatusView(true);
      return;
    }

    setError(response.error || 'Unable to submit your request.');
  };

  const handleSendMoreInfo = async () => {
    if (!requestId || !moreInfoMessage.trim()) return;
    setSendingMoreInfo(true);
    const result = await SchoolRequestService.sendSchoolRequestMessage(requestId, moreInfoMessage.trim());
    setSendingMoreInfo(false);
    if (!result.success) {
      setError(result.error || 'Failed to send additional info.');
      return;
    }
    setMessage('Additional details sent. We will review your request.');
    setMoreInfoMessage('');
  };

  const loadMyRequests = useCallback(async () => {
    setRequestsLoading(true);
    setRequestsError(null);
    const result = await SchoolRequestService.listMySchoolRequests();
    setRequestsLoading(false);

    if (!result.success) {
      setRequestsError(result.error || 'Unable to load applications.');
      setRequests([]);
      return;
    }

    setRequests(result.requests);
    setSelectedRequestId(result.requests[0]?.id ?? null);
  }, []);

  const loadRequestMessages = useCallback(async (requestIdToLoad: string) => {
    setMessagesLoading(true);
    setMessagesUnavailable(false);
    const result = await SchoolRequestService.listSchoolRequestMessages(requestIdToLoad);
    setMessagesLoading(false);

    if (!result.success) {
      setRequestMessages([]);
      setMessagesUnavailable(false);
      setRequestsError(result.error || 'Unable to load request messages.');
      return;
    }

    setRequestMessages(result.messages);
    setMessagesUnavailable(Boolean(result.unavailable));
  }, []);

  const handleReply = async () => {
    if (!selectedRequestId || !replyMessage.trim()) return;
    setReplySending(true);
    const result = await SchoolRequestService.sendSchoolRequestMessage(selectedRequestId, replyMessage.trim());
    setReplySending(false);

    if (!result.success) {
      setRequestsError(result.error || 'Failed to send reply.');
      return;
    }

    setReplyMessage('');
    await Promise.all([loadRequestMessages(selectedRequestId), loadMyRequests()]);
  };

  useEffect(() => {
    if (!isOpen) return;
    setSessionChecked(false);
    supabase.auth.getSession().then(({ data }) => {
      setSession(data?.session ?? null);
      setSessionChecked(true);
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setSessionChecked(true);
    });
    void supabase.auth.getUser().then(({ data }) => {
      if (data?.user?.email) {
        setContactEmail(data.user.email);
      }
    });
    return () => subscription.unsubscribe();
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || activeView !== 'applications') return;
    if (!session && sessionChecked) {
      setRequests([]);
      setRequestsError('Log in to view your applications.');
      return;
    }
    void loadMyRequests();
  }, [activeView, isOpen, loadMyRequests, session, sessionChecked]);

  useEffect(() => {
    if (!selectedRequestId) {
      setRequestMessages([]);
      setMessagesUnavailable(false);
      return;
    }
    void loadRequestMessages(selectedRequestId);
  }, [loadRequestMessages, selectedRequestId]);

  const suggestionButtons = suggestions.filter((suggestion) => suggestion?.name);
  const selectedRequest = requests.find((request) => request.id === selectedRequestId) ?? requests[0] ?? null;
  const latestAdminMessage = useMemo(() => {
    return [...requestMessages]
      .reverse()
      .find((threadMessage) => (threadMessage.sender_role || '').toLowerCase() === 'admin');
  }, [requestMessages]);
  const isAuthenticated = Boolean(session);
  const formatSenderLabel = (senderRole?: string | null) => {
    if (!senderRole) return 'Update';
    return senderRole.toLowerCase() === 'admin' ? 'Admin' : 'You';
  };

  if (!isOpen) return null;
  if (typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-2xl border border-white/10 bg-slate-900/90 p-6 shadow-2xl overscroll-contain">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-xl font-semibold text-white">
              {activeView === 'applications' ? 'My school applications' : 'Apply to add your school'}
            </h2>
            <p className="text-sm text-slate-300">
              {activeView === 'applications'
                ? 'Track status updates and respond if we need more info.'
                : 'We will review your request and email you once it is approved.'}
            </p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="rounded-full border border-white/10 px-3 py-1 text-xs text-white/70 hover:text-white"
          >
            ✕
          </button>
        </div>

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={() => setActiveView('apply')}
            className={`rounded-full px-4 py-1 text-xs font-semibold ${
              activeView === 'apply'
                ? 'bg-cyan-400 text-black'
                : 'border border-white/10 text-white/70 hover:text-white'
            }`}
          >
            Apply
          </button>
          <button
            type="button"
            onClick={() => setActiveView('applications')}
            className={`rounded-full px-4 py-1 text-xs font-semibold ${
              activeView === 'applications'
                ? 'bg-cyan-400 text-black'
                : 'border border-white/10 text-white/70 hover:text-white'
            }`}
          >
            My applications
          </button>
        </div>

        {activeView === 'applications' ? (
          <div className="mt-6 space-y-4">
            {requestsLoading ? (
              <div className="rounded-lg border border-white/10 bg-black/30 p-4 text-sm text-slate-300">
                Loading your applications...
              </div>
            ) : requestsError ? (
              <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-300">
                {requestsError}
              </div>
            ) : requests.length === 0 ? (
              <div className="rounded-lg border border-white/10 bg-black/30 p-4 text-sm text-slate-300">
                No applications yet. Submit a request to get started.
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  {requests.map((request) => (
                    <button
                      key={request.id}
                      type="button"
                      onClick={() => setSelectedRequestId(request.id)}
                      className={`w-full rounded-lg border px-3 py-3 text-left text-sm transition ${
                        selectedRequestId === request.id
                          ? 'border-cyan-400/70 bg-cyan-400/10 text-white'
                          : 'border-white/10 bg-black/30 text-slate-300 hover:border-cyan-400/40'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-semibold">{request.requested_name}</span>
                        <span
                          className={`text-xs font-semibold ${
                            statusTextStyles[(request.status as SchoolRequestService.SchoolRequestStatus) || 'pending'] ||
                            'text-slate-100'
                          }`}
                        >
                          {statusLabels[(request.status as SchoolRequestService.SchoolRequestStatus) || 'pending'] ||
                            request.status ||
                            'Pending'}
                        </span>
                      </div>
                      {request.created_at && (
                        <p className="mt-1 text-xs text-slate-400">
                          Submitted {new Date(request.created_at).toLocaleDateString()}
                        </p>
                      )}
                    </button>
                  ))}
                </div>

                {selectedRequest && (
                  <div className="rounded-lg border border-white/10 bg-black/30 p-4">
                    <div className="flex items-center justify-between">
                      <p className="text-sm uppercase tracking-[0.2em] text-cyan-300">Latest status</p>
                      <button
                        type="button"
                        onClick={loadMyRequests}
                        className="text-xs text-cyan-200 hover:text-cyan-100"
                      >
                        Refresh
                      </button>
                    </div>
                    <p className="mt-2 text-lg font-semibold text-white">
                      {statusLabels[(selectedRequest.status as SchoolRequestService.SchoolRequestStatus) || 'pending'] ||
                        selectedRequest.status ||
                        'Pending'}
                    </p>
                    {selectedRequest.admin_notes && (
                      <p className="mt-2 text-sm text-slate-300">{selectedRequest.admin_notes}</p>
                    )}
                  </div>
                )}

                {selectedRequest && (
                  <div className="rounded-lg border border-white/10 bg-black/30 p-4">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold text-white">Conversation</p>
                      {messagesUnavailable && (
                        <span className="text-xs text-slate-400">Messaging unavailable</span>
                      )}
                    </div>
                    {selectedRequest.status === 'needs_more_info' && latestAdminMessage && (
                      <div className="mt-3 rounded-lg border border-amber-400/40 bg-amber-500/10 p-3 text-sm text-amber-100">
                        <div className="flex items-center justify-between text-xs text-amber-200">
                          <span>Latest from Admin</span>
                          {latestAdminMessage.created_at && (
                            <span>{new Date(latestAdminMessage.created_at).toLocaleString()}</span>
                          )}
                        </div>
                        <p className="mt-2 whitespace-pre-wrap text-amber-50">
                          {latestAdminMessage.message}
                        </p>
                      </div>
                    )}
                    {messagesLoading ? (
                      <p className="mt-3 text-sm text-slate-400">Loading messages...</p>
                    ) : requestMessages.length === 0 ? (
                      <p className="mt-3 text-sm text-slate-400">
                        {messagesUnavailable ? 'No message history available.' : 'No messages yet.'}
                      </p>
                    ) : (
                      <div className="mt-3 space-y-2">
                        {requestMessages.map((threadMessage) => (
                          <div
                            key={threadMessage.id}
                            className="rounded-lg border border-white/10 bg-black/40 p-3 text-sm text-slate-200"
                          >
                            <div className="flex items-center justify-between text-xs text-slate-400">
                              <span>{formatSenderLabel(threadMessage.sender_role)}</span>
                              {threadMessage.created_at && (
                                <span>{new Date(threadMessage.created_at).toLocaleString()}</span>
                              )}
                            </div>
                            <p className="mt-2 whitespace-pre-wrap">{threadMessage.message}</p>
                          </div>
                        ))}
                      </div>
                    )}

                    {selectedRequest.status === 'needs_more_info' && (
                      <div className="mt-4 space-y-3">
                        <textarea
                          value={replyMessage}
                          onChange={(event) => setReplyMessage(event.target.value)}
                          rows={3}
                          className="w-full rounded-lg border border-amber-400/30 bg-black/30 p-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-amber-300"
                          placeholder="Reply with the details we requested."
                        />
                        <button
                          type="button"
                          onClick={handleReply}
                          disabled={replySending || !replyMessage.trim()}
                          className="rounded-lg bg-amber-400 px-4 py-2 text-sm font-semibold text-black disabled:opacity-60"
                        >
                          {replySending ? 'Sending...' : 'Send reply'}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        ) : statusView ? (
          <div className="mt-6 space-y-4">
            <div className="rounded-lg border border-white/10 bg-black/30 p-4">
              <p className="text-sm uppercase tracking-[0.2em] text-cyan-300">Status</p>
              <p className="mt-2 text-lg font-semibold text-white">{statusLabels[requestStatus] ?? 'Pending'}</p>
              {message && <p className="mt-2 text-sm text-slate-300">{message}</p>}
            </div>

            {requestStatus === 'needs_more_info' && requestId && (
              <div className="space-y-3 rounded-lg border border-amber-400/40 bg-amber-500/10 p-4">
                <p className="text-sm font-semibold text-amber-200">We need a little more detail.</p>
                <textarea
                  value={moreInfoMessage}
                  onChange={(event) => setMoreInfoMessage(event.target.value)}
                  rows={3}
                  className="w-full rounded-lg border border-amber-400/30 bg-black/30 p-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-amber-300"
                  placeholder="Share any additional info to help us verify this school."
                />
                <button
                  type="button"
                  onClick={handleSendMoreInfo}
                  disabled={sendingMoreInfo || !moreInfoMessage.trim()}
                  className="rounded-lg bg-amber-400 px-4 py-2 text-sm font-semibold text-black disabled:opacity-60"
                >
                  {sendingMoreInfo ? 'Sending...' : 'Send info'}
                </button>
              </div>
            )}

            {suggestionButtons.length > 0 && (
              <div className="rounded-lg border border-cyan-400/20 bg-cyan-500/10 p-4">
                <p className="text-sm font-semibold text-cyan-200">Similar schools found</p>
                <p className="text-xs text-cyan-100/70">
                  If your school is already listed, use the invite code to join instead.
                </p>
                <div className="mt-3 space-y-2">
                  {suggestionButtons.map((suggestion) => (
                    <button
                      key={`${suggestion.name}-${suggestion.invite_code ?? 'code'}`}
                      type="button"
                      onClick={() => {
                        if (suggestion.invite_code && onUseSuggestion) {
                          onUseSuggestion(suggestion.invite_code);
                        }
                        handleClose();
                      }}
                      className="flex w-full items-center justify-between rounded-lg border border-cyan-400/30 bg-black/40 px-3 py-2 text-left text-sm text-white hover:border-cyan-300"
                    >
                      <span>{suggestion.name}</span>
                      <span className="text-xs text-cyan-200">
                        {suggestion.invite_code ? `Use code ${suggestion.invite_code}` : 'View'}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {error && <p className="text-sm text-red-400">{error}</p>}

            <div className="flex justify-end">
              <button
                type="button"
                onClick={handleClose}
                className="rounded-lg border border-white/10 px-4 py-2 text-sm text-white/80 hover:text-white"
              >
                Close
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            {!isAuthenticated && (
              <div className="rounded-lg border border-amber-400/40 bg-amber-500/10 p-3 text-sm text-amber-200">
                Please log in to submit a school request.
              </div>
            )}
            <div>
              <label className="text-sm font-medium text-slate-200">School name</label>
              <input
                value={schoolName}
                onChange={(event) => setSchoolName(event.target.value)}
                className="mt-1 w-full rounded-lg border border-white/10 bg-black/40 p-3 text-white focus:outline-none focus:ring-2 focus:ring-cyan-400"
                placeholder="e.g. Bright Future Academy"
                required
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="text-sm font-medium text-slate-200">City</label>
                <input
                  value={city}
                  onChange={(event) => setCity(event.target.value)}
                  className="mt-1 w-full rounded-lg border border-white/10 bg-black/40 p-3 text-white focus:outline-none focus:ring-2 focus:ring-cyan-400"
                  placeholder="City"
                  required
                />
              </div>
              <div>
                <label className="text-sm font-medium text-slate-200">Country</label>
                <input
                  value={country}
                  onChange={(event) => setCountry(event.target.value)}
                  className="mt-1 w-full rounded-lg border border-white/10 bg-black/40 p-3 text-white focus:outline-none focus:ring-2 focus:ring-cyan-400"
                  placeholder="Country"
                  required
                />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium text-slate-200">School admin email</label>
              <input
                type="email"
                value={contactEmail}
                onChange={(event) => setContactEmail(event.target.value)}
                className="mt-1 w-full rounded-lg border border-white/10 bg-black/40 p-3 text-white focus:outline-none focus:ring-2 focus:ring-cyan-400"
                placeholder="you@school.edu"
                required
              />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-200">Website or domain (optional)</label>
              <input
                value={website}
                onChange={(event) => setWebsite(event.target.value)}
                className="mt-1 w-full rounded-lg border border-white/10 bg-black/40 p-3 text-white focus:outline-none focus:ring-2 focus:ring-cyan-400"
                placeholder="https://school.edu"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-200">Notes (optional)</label>
              <textarea
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                className="mt-1 w-full rounded-lg border border-white/10 bg-black/40 p-3 text-white focus:outline-none focus:ring-2 focus:ring-cyan-400"
                placeholder="Anything else we should know?"
                rows={3}
              />
            </div>
            {error && <p className="text-sm text-red-400">{error}</p>}
            <div className="flex items-center justify-between pt-2">
              <button
                type="button"
                onClick={handleClose}
                className="text-sm text-slate-400 hover:text-white"
              >
                Cancel
              </button>
              <div className="flex items-center gap-3">
                {!isAuthenticated && (
                  <button
                    type="button"
                    onClick={() => {
                      handleClose();
                      window.location.assign('/');
                    }}
                    className="text-sm font-semibold text-cyan-200 hover:text-cyan-100"
                  >
                    Log in to apply
                  </button>
                )}
                <button
                  type="submit"
                  disabled={!isFormValid || isSubmitting || !isAuthenticated}
                  className="rounded-lg bg-cyan-400 px-4 py-2 text-sm font-semibold text-black disabled:opacity-60"
                >
                  {isSubmitting ? 'Submitting...' : 'Submit request'}
                </button>
              </div>
            </div>
          </form>
        )}
      </div>
    </div>,
    document.body
  );
};

export default SchoolRequestModal;
