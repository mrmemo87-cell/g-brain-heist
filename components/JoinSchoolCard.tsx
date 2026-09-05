import React, { useEffect, useState } from 'react';
import * as AuthService from '../services/authService';
import * as SchoolRequestService from '../services/schoolRequestService';
import { supabase } from '../services/supabaseClient';
import SchoolRequestModal from './SchoolRequestModal';
import { visualAssets, neonIcon } from './visualAssets';

interface JoinSchoolCardProps {
  onJoined?: () => void;
  initialRole?: 'student' | 'teacher';
}

const JoinSchoolCard: React.FC<JoinSchoolCardProps> = ({ onJoined, initialRole = 'student' }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [inviteCode, setInviteCode] = useState('');
  const [joinRole, setJoinRole] = useState<'student' | 'teacher'>(initialRole);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [requestUnreadCount, setRequestUnreadCount] = useState(0);

  const normalizeInviteCode = (code: string) => code.replace(/\s+/g, '').toUpperCase();
  const inviteCodeNormalized = normalizeInviteCode(inviteCode);
  const inviteCodeReady = inviteCodeNormalized.length >= 6;

  const handleJoin = async () => {
    if (!inviteCodeReady) {
      setError('Please enter a valid invite code');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Check email verification first
      const verificationStatus = await AuthService.checkEmailVerification();
      if (!verificationStatus.isVerified) {
        setError('Please verify your email before joining a school. Check your inbox for the verification link.');
        setIsLoading(false);
        return;
      }

      // Validate the code first
      const validateResult = await AuthService.validateInviteCode(inviteCodeNormalized);
      
      if (!validateResult.valid) {
        setError('Invalid or expired invite code');
        return;
      }

      const joinResult = await AuthService.joinSchoolByCode(inviteCodeNormalized, joinRole);
      
      if (!joinResult.success) {
        setError(joinResult.error || 'Failed to join school');
        return;
      }

      // Success!
      setInviteCode('');
      setIsExpanded(false);
      onJoined?.();
    } catch (err) {
      setError('Failed to join school. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    let isDisposed = false;

    const refreshUnreadCount = async () => {
      const requestsResult = await SchoolRequestService.listMySchoolRequests();
      if (!requestsResult.success || isDisposed) {
        if (!isDisposed) setRequestUnreadCount(0);
        return;
      }

      const unreadByRequest = await Promise.all(
        requestsResult.requests.map(async (request) => {
          const messagesResult = await SchoolRequestService.listSchoolRequestMessages(request.id);
          if (!messagesResult.success || messagesResult.unavailable) return 0;
          const lastSeenAt = SchoolRequestService.getSchoolRequestLastSeenAt(request.id, 'applicant');
          return SchoolRequestService.getUnreadSchoolRequestMessageCount(
            messagesResult.messages,
            'applicant',
            lastSeenAt
          );
        })
      );

      if (!isDisposed) {
        setRequestUnreadCount(unreadByRequest.reduce((total, count) => total + count, 0));
      }
    };

    void refreshUnreadCount();

    const handleThreadSeen = (event: Event) => {
      const customEvent = event as CustomEvent<{ viewerRole?: string }>;
      if (customEvent.detail?.viewerRole === 'applicant') {
        void refreshUnreadCount();
      }
    };

    if (typeof window !== 'undefined') {
      window.addEventListener(SchoolRequestService.SCHOOL_REQUEST_THREAD_SEEN_EVENT, handleThreadSeen);
    }

    const channel = SchoolRequestService.subscribeToSchoolRequestMessageChanges(
      'join-school-card-unread',
      (payload) => {
        const incomingMessage = payload.new;
        if (incomingMessage && incomingMessage.request_id) {
          const senderRole = (incomingMessage.sender_role || '').toLowerCase();
          const isIncomingForApplicant = senderRole !== 'applicant';
          const lastSeenAt = SchoolRequestService.getSchoolRequestLastSeenAt(incomingMessage.request_id, 'applicant');
          const createdAtMs = Date.parse(incomingMessage.created_at || '');
          const lastSeenMs = lastSeenAt ? Date.parse(lastSeenAt) : 0;
          const isUnread = Number.isNaN(createdAtMs) ? true : createdAtMs > lastSeenMs;

          if (isIncomingForApplicant && isUnread && !isDisposed) {
            setRequestUnreadCount((prev) => prev + 1);
          }
        }

        void refreshUnreadCount();
      }
    );

    return () => {
      isDisposed = true;
      if (typeof window !== 'undefined') {
        window.removeEventListener(SchoolRequestService.SCHOOL_REQUEST_THREAD_SEEN_EVENT, handleThreadSeen);
      }
      void supabase.removeChannel(channel);
    };
  }, []);

  const hasUnreadAdminMessage = requestUnreadCount > 0;

  return (
    <>
      <div
        className={`relative mb-4 overflow-hidden rounded-xl border shadow-lg backdrop-blur-sm transition-all duration-300 ${
          hasUnreadAdminMessage
            ? 'border-orange-400/70 bg-gradient-to-br from-orange-900/45 via-amber-800/40 to-slate-900/95 hover:border-orange-300/80'
            : 'border-cyan-500/30 bg-gradient-to-br from-slate-900/95 to-slate-800/95 hover:border-cyan-400/50'
        }`}
      >
        {hasUnreadAdminMessage && (
          <span className="absolute right-2 top-2 z-10 inline-flex h-6 min-w-[1.5rem] items-center justify-center rounded-full bg-red-500 px-1 text-xs font-bold text-white shadow-lg ring-2 ring-slate-900">
            {Math.min(requestUnreadCount, 99)}
          </span>
        )}
        {/* Collapsed state */}
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="w-full p-4 flex items-center justify-between text-left transition-all duration-200 hover:bg-white/5"
        >
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center border p-1.5 ${hasUnreadAdminMessage ? 'bg-orange-500/20 border-orange-300/60' : 'bg-cyan-500/20 border-cyan-500/40'}`}>
              <img src={neonIcon('school_unlock')} alt="" className="w-full h-full object-contain" />
            </div>
            <div>
              <h3 className="font-semibold text-white text-sm">Join Your School</h3>
              <p className={`text-xs ${hasUnreadAdminMessage ? 'text-orange-200/90' : 'text-gray-400'}`}>
                {isExpanded ? 'Click to collapse' : 'Get full access to school features'}
              </p>
            </div>
          </div>
          
          <svg 
            className={`w-5 h-5 transition-transform duration-300 ${hasUnreadAdminMessage ? 'text-orange-300' : 'text-cyan-400'} ${isExpanded ? 'rotate-180' : ''}`} 
            fill="none" 
            viewBox="0 0 24 24" 
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {/* Expanded content */}
        <div 
          className={`transition-all duration-300 ease-in-out ${
            isExpanded ? 'max-h-[1200px] opacity-100' : 'max-h-0 opacity-0'
          }`}
        >
          <div className="p-4 pt-0 space-y-4 border-t border-gray-800/50">
            <div className="rounded-xl border border-cyan-400/30 bg-gradient-to-r from-cyan-500/10 via-blue-500/10 to-purple-500/10 p-3">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan-200/90">
                Unlock school privileges
              </p>
              <p className="mt-1 text-sm text-white/90">
                Join with your class code to activate every school feature below.
              </p>
            </div>

            {/* Benefits list */}
            <div className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
              {[
                { img: visualAssets.schoolUnlock.leaderboards, label: 'School leaderboards' },
                { img: visualAssets.schoolUnlock.clans, label: 'Join school clans' },
                { img: visualAssets.schoolUnlock.competitions, label: 'School competitions' },
                { img: visualAssets.schoolUnlock.assignments, label: 'Teacher assignments' },
              ].map((b) => (
                <div
                  key={b.label}
                  className="flex items-center gap-2.5 rounded-xl border border-cyan-400/25 bg-slate-900/70 p-2.5 text-cyan-100 shadow-[0_0_18px_rgba(34,211,238,0.12)]"
                >
                  <img src={b.img} alt="" className="h-10 w-10 flex-shrink-0 rounded-lg object-cover ring-1 ring-cyan-300/30" loading="lazy" />
                  <span className="text-sm font-semibold leading-tight text-white">{b.label}</span>
                </div>
              ))}
            </div>

            {/* Invite code input */}
            <div className="space-y-2">
              <label className="block text-xs font-medium text-gray-300">
                Join as
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setJoinRole('student')}
                  className={`rounded-lg border px-3 py-2 text-xs font-semibold transition-colors ${
                    joinRole === 'student'
                      ? 'border-cyan-400 bg-cyan-500/15 text-cyan-200'
                      : 'border-gray-700 bg-gray-900/50 text-gray-300 hover:border-gray-600'
                  }`}
                  disabled={isLoading}
                >
                  Student
                </button>
                <button
                  type="button"
                  onClick={() => setJoinRole('teacher')}
                  className={`rounded-lg border px-3 py-2 text-xs font-semibold transition-colors ${
                    joinRole === 'teacher'
                      ? 'border-purple-400 bg-purple-500/15 text-purple-200'
                      : 'border-gray-700 bg-gray-900/50 text-gray-300 hover:border-gray-600'
                  }`}
                  disabled={isLoading}
                >
                  Teacher
                </button>
              </div>
              <label className="block text-xs font-medium text-gray-300">
                Enter class code
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={inviteCode}
                  onChange={(e) => {
                    setInviteCode(normalizeInviteCode(e.target.value));
                    setError(null);
                  }}
                  placeholder="Enter class code"
                  className="flex-1 rounded-lg border border-cyan-400/35 bg-gray-900/80 px-3 py-2 text-sm uppercase tracking-wider text-white placeholder:text-gray-500 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-cyan-400 transition-all"
                  maxLength={10}
                  disabled={isLoading}
                />
                <button
                  onClick={handleJoin}
                  disabled={!inviteCodeReady || isLoading}
                  className="px-4 py-2 rounded-lg font-semibold text-sm bg-cyan-500 text-gray-900 hover:bg-cyan-400 disabled:bg-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed transition-all"
                >
                  {isLoading ? '...' : 'Join'}
                </button>
              </div>
              
              {error && (
                <p className="text-xs text-red-400">{error}</p>
              )}
            </div>

            {/* Request school option */}
            <div className="pt-2 border-t border-gray-800/50">
              <button
                onClick={() => setShowRequestModal(true)}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-purple-400/40 bg-purple-500/15 px-3 py-2 text-sm font-semibold text-purple-100 transition-colors hover:border-purple-300 hover:bg-purple-500/25"
              >
                <img src={neonIcon('invite_teacher')} alt="" className="h-4 w-4 object-contain" />
                Open school application
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* School Request Modal */}
      {showRequestModal && (
        <SchoolRequestModal
          isOpen={showRequestModal}
          onClose={() => setShowRequestModal(false)}
          requesterRole={joinRole}
        />
      )}
    </>
  );
};

export default JoinSchoolCard;
