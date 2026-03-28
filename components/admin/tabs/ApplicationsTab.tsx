import React, { useEffect, useMemo, useState } from 'react';
import { useAdmin } from '../AdminContext';
import * as SchoolRequestService from '../../../services/schoolRequestService';
import { supabase } from '../../../services/supabaseClient';
import SchoolRequestConversation from '../../schoolRequests/SchoolRequestConversation';

const ApplicationsTab: React.FC = () => {
  const {
    filteredSchoolRequests, handleSchoolRequestAction, loadSchoolRequestMessages, 
    loadSchoolRequests, requestStatusStyles, schoolOptions, schoolRequestActionLoading, 
    schoolRequestDuplicates, schoolRequestMessages, schoolRequestMessagesError, 
    schoolRequestMessagesLoading, schoolRequestMessagesOpen, schoolRequestMessagesUnavailable, 
    schoolRequestNotes, schoolRequestSearch, schoolRequestStatus, schoolRequestsError, 
    schoolRequestsLoading, setSchoolRequestDuplicates, setSchoolRequestMessagesOpen, 
    setSchoolRequestNotes, setSchoolRequestSearch, setSchoolRequestStatus, addToast,
  } = useAdmin();
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [replySendingByRequestId, setReplySendingByRequestId] = useState<Record<string, boolean>>({});

  const unreadTotal = useMemo(
    () => Object.values(unreadCounts).reduce((sum, value) => sum + value, 0),
    [unreadCounts]
  );

  useEffect(() => {
    const computeUnread = async () => {
      const pairs = await Promise.all(
        filteredSchoolRequests.map(async (request) => {
          const existingMessages = schoolRequestMessages[request.id];
          const messagesResult = existingMessages
            ? { success: true as const, messages: existingMessages, unavailable: false }
            : await SchoolRequestService.listSchoolRequestMessages(request.id);

          if (!messagesResult.success || messagesResult.unavailable) {
            return [request.id, 0] as const;
          }

          const lastSeenAt = SchoolRequestService.getSchoolRequestLastSeenAt(request.id, 'admin');
          const unread = SchoolRequestService.getUnreadSchoolRequestMessageCount(
            messagesResult.messages,
            'admin',
            lastSeenAt
          );
          return [request.id, unread] as const;
        })
      );

      setUnreadCounts(Object.fromEntries(pairs));
    };

    void computeUnread();
  }, [filteredSchoolRequests, schoolRequestMessages]);

  useEffect(() => {
    const channel = SchoolRequestService.subscribeToSchoolRequestMessageChanges(
      'admin-applications-thread-stream',
      (payload) => {
        const changedRequestId = payload.new?.request_id ?? payload.old?.request_id ?? null;
        if (!changedRequestId) return;

        const isThreadOpen = Boolean(schoolRequestMessagesOpen[changedRequestId]);
        if (isThreadOpen) {
          void loadSchoolRequestMessages(changedRequestId);
          SchoolRequestService.markSchoolRequestThreadSeen(changedRequestId, 'admin');
          setUnreadCounts((prev) => ({ ...prev, [changedRequestId]: 0 }));
          return;
        }

        void SchoolRequestService.listSchoolRequestMessages(changedRequestId).then((result) => {
          if (!result.success || result.unavailable) return;
          const lastSeenAt = SchoolRequestService.getSchoolRequestLastSeenAt(changedRequestId, 'admin');
          const unread = SchoolRequestService.getUnreadSchoolRequestMessageCount(
            result.messages,
            'admin',
            lastSeenAt
          );
          setUnreadCounts((prev) => ({ ...prev, [changedRequestId]: unread }));
        });
      }
    );

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [loadSchoolRequestMessages, schoolRequestMessagesOpen]);

  const handleAdminReply = async (requestId: string) => {
    const draft = replyDrafts[requestId]?.trim();
    if (!draft) return;

    setReplySendingByRequestId((prev) => ({ ...prev, [requestId]: true }));
    const result = await SchoolRequestService.sendSchoolRequestMessage(requestId, draft);
    setReplySendingByRequestId((prev) => ({ ...prev, [requestId]: false }));

    if (!result.success) {
      addToast(result.error || 'Failed to send reply.', 'error');
      return;
    }

    setReplyDrafts((prev) => ({ ...prev, [requestId]: '' }));
    SchoolRequestService.markSchoolRequestThreadSeen(requestId, 'admin');
    setUnreadCounts((prev) => ({ ...prev, [requestId]: 0 }));
    await loadSchoolRequestMessages(requestId);
    await loadSchoolRequests();
  };

  return (
    <div className="space-y-6">
      <div className="card-glass p-6 border-2 border-cyan-400/50">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h3 className="text-3xl font-heading font-bold text-cyan-300 flex items-center gap-2">
              🏫 School Applications
              {unreadTotal > 0 && (
                <span className="inline-flex h-6 min-w-[1.5rem] items-center justify-center rounded-full bg-red-500 px-1 text-xs font-bold text-white shadow-lg">
                  {Math.min(unreadTotal, 99)}
                </span>
              )}
            </h3>
            <p className="text-sm text-gray-400">Review school requests and keep duplicates down.</p>
          </div>
          <button
            onClick={loadSchoolRequests}
            className="rounded-lg border border-cyan-400/60 bg-cyan-500/20 px-4 py-2 text-sm font-semibold text-cyan-100 hover:bg-cyan-500/30"
          >
            🔄 Refresh
          </button>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <input
            type="text"
            value={schoolRequestSearch}
            onChange={(event) => setSchoolRequestSearch(event.target.value)}
            placeholder="Search by name or email..."
            className="w-full rounded-lg border border-cyan-400/30 bg-black/40 px-4 py-2 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-cyan-400"
          />
          <select
            value={schoolRequestStatus}
            onChange={(event) => setSchoolRequestStatus(event.target.value as typeof schoolRequestStatus)}
            className="w-full rounded-lg border border-cyan-400/30 bg-black/40 px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-cyan-400"
          >
            <option value="pending">Pending</option>
            <option value="needs_more_info">Needs more info</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
            <option value="duplicate">Duplicate</option>
            <option value="all">All statuses</option>
          </select>
          <div className="flex items-center justify-center rounded-lg border border-cyan-400/30 bg-black/40 px-4 py-2 text-sm text-cyan-100">
            Showing {filteredSchoolRequests.length} requests
          </div>
        </div>

        {schoolRequestsError && (
          <div className="mt-4 rounded-lg border border-red-400/40 bg-red-500/10 px-4 py-2 text-sm text-red-200">
            {schoolRequestsError}
          </div>
        )}
      </div>

      <div className="space-y-4">
        {schoolRequestsLoading && (
          <div className="rounded-lg border border-cyan-400/30 bg-black/40 p-6 text-center text-sm text-cyan-100">
            Loading applications...
          </div>
        )}

        {!schoolRequestsLoading && filteredSchoolRequests.length === 0 && (
          <div className="rounded-lg border border-white/10 bg-black/30 p-6 text-center text-sm text-gray-400">
            No school requests match your filters.
          </div>
        )}

        {filteredSchoolRequests.map((request) => {
          const status = request.status || 'pending';
          const isActionLoading = schoolRequestActionLoading === request.id;
          const noteValue = schoolRequestNotes[request.id] ?? request.admin_notes ?? '';
          const isMessagesOpen = Boolean(schoolRequestMessagesOpen[request.id]);
          const messages = schoolRequestMessages[request.id] ?? [];
          const isMessagesLoading = Boolean(schoolRequestMessagesLoading[request.id]);
          const messagesError = schoolRequestMessagesError[request.id];
          const messagesUnavailable = Boolean(schoolRequestMessagesUnavailable[request.id]);
          const canContinueConversation = status === 'pending' || status === 'needs_more_info';
          return (
            <div key={request.id} className="card-glass p-6 border border-white/10">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h4 className="text-xl font-semibold text-white">{request.requested_name}</h4>
                  <p className="text-xs text-gray-400">
                    Requested by {request.requester_email || 'Unknown'} • {request.requester_role || 'student'}
                  </p>
                  {request.created_at && (
                    <p className="text-xs text-gray-500">
                      {new Date(request.created_at).toLocaleString()}
                    </p>
                  )}
                </div>
                <span className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wide ${requestStatusStyles[status] || 'border-white/20 text-white/60'}`}>
                  {status.replace(/_/g, ' ')}
                </span>
              </div>

              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <div>
                  <label className="text-xs text-gray-400">Admin notes / message</label>
                  <textarea
                    value={noteValue}
                    onChange={(event) =>
                      setSchoolRequestNotes((prev) => ({ ...prev, [request.id]: event.target.value }))
                    }
                    rows={3}
                    className="mt-1 w-full rounded-lg border border-white/10 bg-black/40 p-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-cyan-400"
                    placeholder="Share reason or request more info..."
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-400">Duplicate school (if needed)</label>
                  <select
                    value={schoolRequestDuplicates[request.id] || ''}
                    onChange={(event) =>
                      setSchoolRequestDuplicates((prev) => ({ ...prev, [request.id]: event.target.value }))
                    }
                    className="mt-1 w-full rounded-lg border border-white/10 bg-black/40 p-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-cyan-400"
                  >
                    <option value="">Select existing school</option>
                    {schoolOptions.map((school) => (
                      <option key={school.id} value={school.id}>
                        {school.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  onClick={() => handleSchoolRequestAction(request.id, 'approve')}
                  disabled={isActionLoading}
                  className="rounded-lg border border-emerald-400/50 bg-emerald-500/20 px-4 py-2 text-sm font-semibold text-emerald-100 hover:bg-emerald-500/30 disabled:opacity-60"
                >
                  ✅ Approve
                </button>
                <button
                  onClick={() => handleSchoolRequestAction(request.id, 'reject')}
                  disabled={isActionLoading}
                  className="rounded-lg border border-red-400/50 bg-red-500/20 px-4 py-2 text-sm font-semibold text-red-100 hover:bg-red-500/30 disabled:opacity-60"
                >
                  ❌ Reject
                </button>
                <button
                  onClick={() => handleSchoolRequestAction(request.id, 'mark_duplicate')}
                  disabled={isActionLoading}
                  className="rounded-lg border border-purple-400/50 bg-purple-500/20 px-4 py-2 text-sm font-semibold text-purple-100 hover:bg-purple-500/30 disabled:opacity-60"
                >
                  🧩 Mark duplicate
                </button>
                <button
                  onClick={() => handleSchoolRequestAction(request.id, 'needs_more_info')}
                  disabled={isActionLoading}
                  className="rounded-lg border border-amber-400/50 bg-amber-500/20 px-4 py-2 text-sm font-semibold text-amber-100 hover:bg-amber-500/30 disabled:opacity-60"
                >
                  📩 Request more info
                </button>
                <button
                  onClick={() => {
                    const nextOpen = !isMessagesOpen;
                    setSchoolRequestMessagesOpen((prev) => ({ ...prev, [request.id]: nextOpen }));
                    if (nextOpen && !schoolRequestMessages[request.id] && !schoolRequestMessagesLoading[request.id]) {
                      void loadSchoolRequestMessages(request.id);
                    }
                    if (nextOpen) {
                      SchoolRequestService.markSchoolRequestThreadSeen(request.id, 'admin');
                      setUnreadCounts((prev) => ({ ...prev, [request.id]: 0 }));
                    }
                  }}
                  className="relative rounded-lg border border-cyan-400/50 bg-cyan-500/10 px-4 py-2 pr-7 text-sm font-semibold text-cyan-100 hover:bg-cyan-500/20"
                >
                  {isMessagesOpen ? 'Hide conversation' : 'View conversation'}
                  {(unreadCounts[request.id] ?? 0) > 0 && (
                    <span className="absolute -right-2 -top-2 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white shadow-lg">
                      {Math.min(unreadCounts[request.id], 99)}
                    </span>
                  )}
                </button>
              </div>

              {isMessagesOpen && (
                <div className="mt-4 rounded-lg border border-white/10 bg-black/40 p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-white">Conversation</p>
                      <p className="text-xs text-gray-400">Live thread. New replies appear automatically.</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        SchoolRequestService.markSchoolRequestThreadSeen(request.id, 'admin');
                        setUnreadCounts((prev) => ({ ...prev, [request.id]: 0 }));
                        void loadSchoolRequestMessages(request.id);
                      }}
                      className="text-xs text-cyan-200 hover:text-cyan-100"
                    >
                      Refresh
                    </button>
                  </div>
                  {messagesUnavailable ? (
                    <p className="mt-3 text-xs text-gray-400">Messaging is not available yet.</p>
                  ) : isMessagesLoading ? (
                    <p className="mt-3 text-sm text-gray-300">Loading messages...</p>
                  ) : messagesError ? (
                    <p className="mt-3 text-sm text-red-200">{messagesError}</p>
                  ) : messages.length === 0 ? (
                    <p className="mt-3 text-sm text-gray-400">No messages yet.</p>
                  ) : (
                    <SchoolRequestConversation messages={messages} viewerRole="admin" />
                  )}

                  {canContinueConversation && (
                    <div className="mt-4 space-y-2">
                      <textarea
                        value={replyDrafts[request.id] || ''}
                        onChange={(event) =>
                          setReplyDrafts((prev) => ({ ...prev, [request.id]: event.target.value }))
                        }
                        rows={3}
                        className="w-full rounded-lg border border-cyan-400/20 bg-black/30 p-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-cyan-400"
                        placeholder="Send a direct reply to keep this conversation moving."
                      />
                      <button
                        type="button"
                        onClick={() => void handleAdminReply(request.id)}
                        disabled={Boolean(replySendingByRequestId[request.id]) || !(replyDrafts[request.id] || '').trim()}
                        className="rounded-lg border border-cyan-400/40 bg-cyan-500/20 px-4 py-2 text-sm font-semibold text-cyan-100 hover:bg-cyan-500/30 disabled:opacity-60"
                      >
                        {replySendingByRequestId[request.id] ? 'Sending...' : 'Send message'}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

    </div>
  );
};

export default ApplicationsTab;
