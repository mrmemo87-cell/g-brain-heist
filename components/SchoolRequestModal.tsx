import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import * as SchoolRequestService from '../services/schoolRequestService';
import { supabase, type Session } from '../services/supabaseClient';
import SchoolRequestConversation from './schoolRequests/SchoolRequestConversation';

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
  const [decisionMakerName, setDecisionMakerName] = useState('');
  const [decisionMakerTitle, setDecisionMakerTitle] = useState('');
  const [decisionMakerPhone, setDecisionMakerPhone] = useState('');
  const [estimatedStudents, setEstimatedStudents] = useState('');
  const [estimatedTeachers, setEstimatedTeachers] = useState('');
  const [requestedModules, setRequestedModules] = useState<Array<'core' | 'cambridge' | 'ielts' | 'writing' | 'admissions'>>(['core']);
  const [preferredPaymentMethod, setPreferredPaymentMethod] = useState<'card' | 'cash' | 'bank_transfer' | 'invoice' | 'undecided'>('undecided');
  const [billingContactEmail, setBillingContactEmail] = useState('');
  const [authorityConfirmed, setAuthorityConfirmed] = useState(false);
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
  const [requestUnreadCounts, setRequestUnreadCounts] = useState<Record<string, number>>({});

  const isContactEmailValid = useMemo(() => /\S+@\S+\.\S+/.test(contactEmail.trim()), [contactEmail]);
  const isFormValid = useMemo(
    () =>
      schoolName.trim().length > 2 &&
      city.trim().length > 1 &&
      country.trim().length > 1 &&
      isContactEmailValid &&
      decisionMakerName.trim().length > 2 &&
      decisionMakerTitle.trim().length > 1 &&
      authorityConfirmed,
    [schoolName, city, country, isContactEmailValid, decisionMakerName, decisionMakerTitle, authorityConfirmed]
  );

  const resetForm = () => {
    setActiveView('apply');
    setSchoolName('');
    setCity('');
    setCountry('');
    setContactEmail('');
    setWebsite('');
    setNotes('');
    setDecisionMakerName('');
    setDecisionMakerTitle('');
    setDecisionMakerPhone('');
    setEstimatedStudents('');
    setEstimatedTeachers('');
    setRequestedModules(['core']);
    setPreferredPaymentMethod('undecided');
    setBillingContactEmail('');
    setAuthorityConfirmed(false);
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
    setRequestUnreadCounts({});
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
      decisionMakerName: decisionMakerName.trim(),
      decisionMakerTitle: decisionMakerTitle.trim(),
      decisionMakerPhone: decisionMakerPhone.trim() || undefined,
      authorityConfirmed,
      estimatedStudents: estimatedStudents ? Number(estimatedStudents) : null,
      estimatedTeachers: estimatedTeachers ? Number(estimatedTeachers) : null,
      requestedModules,
      preferredPaymentMethod,
      billingContactEmail: billingContactEmail.trim() || contactEmail.trim(),
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

    const unreadPairs = await Promise.all(
      result.requests.map(async (request) => {
        const threadResult = await SchoolRequestService.listSchoolRequestMessages(request.id);
        if (!threadResult.success || threadResult.unavailable) {
          return [request.id, 0] as const;
        }
        const lastSeenAt = SchoolRequestService.getSchoolRequestLastSeenAt(request.id, 'applicant');
        const unreadCount = SchoolRequestService.getUnreadSchoolRequestMessageCount(
          threadResult.messages,
          'applicant',
          lastSeenAt
        );
        return [request.id, unreadCount] as const;
      })
    );

    setRequestUnreadCounts(Object.fromEntries(unreadPairs));
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

    SchoolRequestService.markSchoolRequestThreadSeen(requestIdToLoad, 'applicant');
    setRequestUnreadCounts((prev) => ({ ...prev, [requestIdToLoad]: 0 }));
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
        setBillingContactEmail((current) => current || data.user.email || '');
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

  useEffect(() => {
    if (!isOpen || activeView !== 'applications' || !session) return;

    const channel = SchoolRequestService.subscribeToSchoolRequestMessageChanges(
      `applicant-school-request-messages-${session?.user?.id ?? 'anon'}`,
      async (payload) => {
        const changedRequestId = payload.new?.request_id ?? payload.old?.request_id ?? null;
        if (!changedRequestId) return;

        const threadResult = await SchoolRequestService.listSchoolRequestMessages(changedRequestId);
        if (!threadResult.success || threadResult.unavailable) return;

        if (selectedRequestId === changedRequestId) {
          setRequestMessages(threadResult.messages);
          SchoolRequestService.markSchoolRequestThreadSeen(changedRequestId, 'applicant');
          setRequestUnreadCounts((prev) => ({ ...prev, [changedRequestId]: 0 }));
        } else {
          const lastSeenAt = SchoolRequestService.getSchoolRequestLastSeenAt(changedRequestId, 'applicant');
          const unreadCount = SchoolRequestService.getUnreadSchoolRequestMessageCount(
            threadResult.messages,
            'applicant',
            lastSeenAt
          );
          setRequestUnreadCounts((prev) => ({ ...prev, [changedRequestId]: unreadCount }));
        }

        void loadMyRequests();
      }
    );

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [activeView, isOpen, loadMyRequests, selectedRequestId, session]);

  const suggestionButtons = suggestions.filter((suggestion) => suggestion?.name);
  const selectedRequest = requests.find((request) => request.id === selectedRequestId) ?? requests[0] ?? null;
  const totalUnreadCount = useMemo(
    () => Object.values(requestUnreadCounts).reduce((sum, count) => sum + count, 0),
    [requestUnreadCounts]
  );
  const latestAdminMessage = useMemo(() => {
    return [...requestMessages]
      .reverse()
      .find((threadMessage) => (threadMessage.sender_role || '').toLowerCase() === 'admin');
  }, [requestMessages]);
  const isAuthenticated = Boolean(session);

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
            className={`relative rounded-full px-4 py-1 text-xs font-semibold ${
              activeView === 'applications'
                ? 'bg-cyan-400 text-black'
                : 'border border-white/10 text-white/70 hover:text-white'
            }`}
          >
            My applications
            {totalUnreadCount > 0 && (
              <span className="absolute -right-2 -top-2 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white shadow-lg">
                {Math.min(totalUnreadCount, 99)}
              </span>
            )}
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
                      {(requestUnreadCounts[request.id] ?? 0) > 0 && (
                        <span className="mt-2 inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white shadow-lg">
                          {Math.min(requestUnreadCounts[request.id], 99)}
                        </span>
                      )}
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
                      <div>
                        <p className="text-sm font-semibold text-white">Conversation</p>
                        <p className="text-xs text-slate-400">Live updates. New replies appear automatically.</p>
                      </div>
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
                      <SchoolRequestConversation messages={requestMessages} viewerRole="applicant" />
                    )}

                    {(selectedRequest.status === 'pending' || selectedRequest.status === 'needs_more_info') && (
                      <div className="mt-4 space-y-3">
                        <textarea
                          value={replyMessage}
                          onChange={(event) => setReplyMessage(event.target.value)}
                          rows={3}
                          className="w-full rounded-lg border border-amber-400/30 bg-black/30 p-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-amber-300"
                          placeholder="Type your reply to continue the conversation."
                        />
                        <button
                          type="button"
                          onClick={handleReply}
                          disabled={replySending || !replyMessage.trim()}
                          className="rounded-lg bg-amber-400 px-4 py-2 text-sm font-semibold text-black disabled:opacity-60"
                        >
                          {replySending ? 'Sending...' : 'Send message'}
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
            <div className="rounded-xl border border-cyan-400/20 bg-cyan-400/5 p-4">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-cyan-200">Authorised decision-maker</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label className="text-sm text-slate-200">Full name
                  <input value={decisionMakerName} onChange={(event) => setDecisionMakerName(event.target.value)} className="mt-1 w-full rounded-lg border border-white/10 bg-black/40 p-3 text-white focus:outline-none focus:ring-2 focus:ring-cyan-400" placeholder="Owner, principal or director" required />
                </label>
                <label className="text-sm text-slate-200">Job title
                  <input value={decisionMakerTitle} onChange={(event) => setDecisionMakerTitle(event.target.value)} className="mt-1 w-full rounded-lg border border-white/10 bg-black/40 p-3 text-white focus:outline-none focus:ring-2 focus:ring-cyan-400" placeholder="Principal" required />
                </label>
                <label className="text-sm text-slate-200">Phone (optional)
                  <input type="tel" value={decisionMakerPhone} onChange={(event) => setDecisionMakerPhone(event.target.value)} className="mt-1 w-full rounded-lg border border-white/10 bg-black/40 p-3 text-white focus:outline-none focus:ring-2 focus:ring-cyan-400" placeholder="+996…" />
                </label>
                <label className="text-sm text-slate-200">Billing email
                  <input type="email" value={billingContactEmail} onChange={(event) => setBillingContactEmail(event.target.value)} className="mt-1 w-full rounded-lg border border-white/10 bg-black/40 p-3 text-white focus:outline-none focus:ring-2 focus:ring-cyan-400" placeholder="billing@school.edu" />
                </label>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm text-slate-200">Estimated students
                <input type="number" min="1" value={estimatedStudents} onChange={(event) => setEstimatedStudents(event.target.value)} className="mt-1 w-full rounded-lg border border-white/10 bg-black/40 p-3 text-white focus:outline-none focus:ring-2 focus:ring-cyan-400" placeholder="250" />
              </label>
              <label className="text-sm text-slate-200">Estimated teachers
                <input type="number" min="1" value={estimatedTeachers} onChange={(event) => setEstimatedTeachers(event.target.value)} className="mt-1 w-full rounded-lg border border-white/10 bg-black/40 p-3 text-white focus:outline-none focus:ring-2 focus:ring-cyan-400" placeholder="25" />
              </label>
            </div>

            <fieldset className="rounded-xl border border-white/10 bg-black/20 p-4">
              <legend className="px-1 text-sm font-medium text-slate-200">Programmes your school needs</legend>
              <p className="mt-1 text-xs text-slate-400">Core is included. Optional programmes are activated only when included in the school agreement.</p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {([
                  ['core', 'Brain Heist Core'], ['cambridge', 'Cambridge'], ['ielts', 'IELTS'], ['writing', 'Writing Hub'], ['admissions', 'Admission Hub'],
                ] as const).map(([moduleKey, label]) => (
                  <label key={moduleKey} className="flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-sm text-slate-200">
                    <input type="checkbox" checked={requestedModules.includes(moduleKey)} disabled={moduleKey === 'core'} onChange={(event) => setRequestedModules((current) => event.target.checked ? [...current, moduleKey] : current.filter((item) => item !== moduleKey))} />
                    {label}
                  </label>
                ))}
              </div>
            </fieldset>

            <label className="block text-sm text-slate-200">Preferred payment method
              <select value={preferredPaymentMethod} onChange={(event) => setPreferredPaymentMethod(event.target.value as typeof preferredPaymentMethod)} className="mt-1 w-full rounded-lg border border-white/10 bg-slate-950 p-3 text-white focus:outline-none focus:ring-2 focus:ring-cyan-400">
                <option value="undecided">Not decided yet</option>
                <option value="card">Card / Paddle</option>
                <option value="cash">Cash</option>
                <option value="bank_transfer">Bank transfer</option>
                <option value="invoice">Invoice</option>
              </select>
            </label>

            <label className="flex items-start gap-3 rounded-xl border border-amber-400/30 bg-amber-400/10 p-4 text-sm leading-relaxed text-amber-50">
              <input type="checkbox" checked={authorityConfirmed} onChange={(event) => setAuthorityConfirmed(event.target.checked)} className="mt-1" required />
              <span>I confirm that I am the school owner, principal, director, or another authorised decision-maker permitted to register this school.</span>
            </label>
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
