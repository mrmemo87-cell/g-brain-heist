import React from 'react';
import type { SchoolRequestMessage, SchoolRequestViewerRole } from '../../services/schoolRequestService';

interface SchoolRequestConversationProps {
  messages: SchoolRequestMessage[];
  viewerRole: SchoolRequestViewerRole;
}

const resolveSenderRole = (senderRole?: string | null) => {
  if (!senderRole) return 'applicant';
  return senderRole.toLowerCase() === 'admin' ? 'admin' : 'applicant';
};

const getSenderLabel = (senderRole: 'admin' | 'applicant') => {
  return senderRole === 'admin' ? 'Admin' : 'Applicant';
};

const SchoolRequestConversation: React.FC<SchoolRequestConversationProps> = ({ messages, viewerRole }) => {
  const sortedMessages = [...messages].sort((a, b) => {
    const left = Date.parse(a.created_at || '');
    const right = Date.parse(b.created_at || '');
    if (Number.isNaN(left) && Number.isNaN(right)) return 0;
    if (Number.isNaN(left)) return -1;
    if (Number.isNaN(right)) return 1;
    return left - right;
  });

  return (
    <div className="mt-3 space-y-3">
      {sortedMessages.map((message, index) => {
        const senderRole = resolveSenderRole(message.sender_role);
        const isMine =
          (viewerRole === 'admin' && senderRole === 'admin') ||
          (viewerRole === 'applicant' && senderRole === 'applicant');
        const previous = sortedMessages[index - 1];
        const previousSenderRole = resolveSenderRole(previous?.sender_role);
        const isFirstFromSender = !previous || previousSenderRole !== senderRole;

        return (
          <div key={message.id} className={`flex ${isMine ? 'justify-end' : 'justify-start'} ${isFirstFromSender ? 'pt-1' : ''}`}>
            <div
              className={`max-w-[90%] rounded-xl border p-3 text-sm shadow-[0_6px_20px_rgba(0,0,0,0.25)] ${
                isMine
                  ? 'border-cyan-400/50 bg-cyan-500/15 text-cyan-50'
                  : 'border-white/10 bg-black/50 text-gray-100'
              }`}
            >
              <div className="flex items-center justify-between gap-4 text-xs opacity-80">
                <span className="inline-flex items-center gap-2">
                  <span
                    className={`inline-flex h-2 w-2 rounded-full ${senderRole === 'admin' ? 'bg-amber-300' : 'bg-cyan-300'}`}
                    aria-hidden
                  />
                  {isMine ? 'You' : getSenderLabel(senderRole)}
                </span>
                {message.created_at && <span>{new Date(message.created_at).toLocaleString()}</span>}
              </div>
              <p className="mt-2 whitespace-pre-wrap text-base leading-relaxed">{message.message}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default SchoolRequestConversation;
