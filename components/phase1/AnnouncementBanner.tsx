import React from 'react';
import type { Announcement } from '../../types';

interface AnnouncementBannerProps {
  announcement: Announcement;
  onDismiss?: () => void;
}

const AnnouncementBanner: React.FC<AnnouncementBannerProps> = ({ announcement, onDismiss }) => {
  return (
    <div className="fixed top-0 left-0 right-0 z-[60] flex justify-center px-4">
      <div className="mt-4 max-w-3xl w-full bg-gradient-to-r from-cyan-500/90 to-purple-500/90 text-white px-6 py-4 rounded-2xl shadow-lg border border-white/20">
        <div className="flex items-start gap-4">
          <div className="text-3xl">📢</div>
          <div className="flex-1">
            <div className="font-heading text-lg mb-1">Broadcast from Control</div>
            <div className="text-sm sm:text-base whitespace-pre-line">{announcement.text}</div>
            <div className="text-xs text-white/70 mt-2">
              {new Date(announcement.created_at).toLocaleString(undefined, {
                timeZone: 'Asia/Bishkek',
              })}
            </div>
          </div>
          {onDismiss && (
            <button
              onClick={onDismiss}
              className="text-white/80 hover:text-white text-sm font-semibold"
            >
              ✕
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default AnnouncementBanner;
