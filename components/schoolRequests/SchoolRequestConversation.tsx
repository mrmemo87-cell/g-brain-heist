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
  return (
    <div className="mt-3 space-y-2">
      {messages.map((message) => {
        const senderRole = resolveSenderRole(message.sender_role);
        const isMine =
          (viewerRole === 'admin' && senderRole === 'admin') ||
          (viewerRole === 'applicant' && senderRole === 'applicant');

        return (
          <div key={message.id} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[88%] rounded-xl border p-3 text-sm ${
                isMine
                  ? 'border-cyan-400/40 bg-cyan-500/10 text-cyan-50'
                  : 'border-white/10 bg-black/50 text-gray-100'
              }`}
            >
              <div className="flex items-center justify-between gap-4 text-xs opacity-80">
                <span>{isMine ? 'You' : getSenderLabel(senderRole)}</span>
                {message.created_at && <span>{new Date(message.created_at).toLocaleString()}</span>}
              </div>
              <p className="mt-2 whitespace-pre-wrap">{message.message}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default SchoolRequestConversation;
