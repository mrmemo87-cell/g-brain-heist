import React from 'react';
import { useAdmin } from '../AdminContext';

const AnnouncementModal: React.FC = () => {
  const {
    announcementExpiry, announcementText, customAnnouncementExpiry, isSendingAnnouncement, 
    sendAnnouncement, setAnnouncementExpiry, setAnnouncementText, setCustomAnnouncementExpiry, 
    setShowAnnouncementComposer, showAnnouncementComposer,
  } = useAdmin();

  return (
    <>
      {showAnnouncementComposer && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 p-4" role="dialog" aria-modal="true" aria-labelledby="announcement-title">
          <div className="bg-gray-900 border border-green-400/60 rounded-2xl max-w-xl w-full p-6 space-y-4">
            <h3 id="announcement-title" className="text-2xl font-heading text-green-300">📢 Broadcast Announcement</h3>
            <p className="text-sm text-gray-400">
              This message appears for every player until they dismiss it or it expires.
            </p>
            <textarea
              value={announcementText}
              onChange={(e) => setAnnouncementText(e.target.value)}
              rows={5}
              className="w-full bg-black/50 border border-green-400/40 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-green-300"
              placeholder="Share mission updates, tournament news, or urgent warnings..."
            />
            <div className="space-y-2">
              <label className="text-sm text-gray-300 font-semibold">Expiration</label>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <select
                  value={announcementExpiry}
                  onChange={(e) => setAnnouncementExpiry(e.target.value as typeof announcementExpiry)}
                  className="w-full rounded-lg border border-green-400/40 bg-black/60 px-3 py-2 text-sm text-white focus:outline-none focus:border-green-300"
                >
                  <option value="never">Never expire</option>
                  <option value="1d">Expires in 24 hours</option>
                  <option value="7d">Expires in 7 days</option>
                  <option value="30d">Expires in 30 days</option>
                  <option value="custom">Custom date/time</option>
                </select>
                {announcementExpiry === 'custom' && (
                  <input
                    type="datetime-local"
                    value={customAnnouncementExpiry}
                    onChange={(e) => setCustomAnnouncementExpiry(e.target.value)}
                    className="w-full rounded-lg border border-green-400/40 bg-black/60 px-3 py-2 text-sm text-white focus:outline-none focus:border-green-300"
                  />
                )}
              </div>
              <p className="text-xs text-gray-400">
                When the expiration time is reached, the announcement will stop showing for everyone.
              </p>
            </div>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowAnnouncementComposer(false);
                  setAnnouncementText('');
                  setAnnouncementExpiry('never');
                  setCustomAnnouncementExpiry('');
                }}
                className="px-4 py-2 rounded-lg border border-gray-500 text-gray-300 hover:bg-gray-800/80"
              >
                Cancel
              </button>
              <button
                onClick={sendAnnouncement}
                disabled={isSendingAnnouncement}
                className={`px-5 py-2 rounded-lg border border-green-400 text-white font-semibold transition-all ${
                  isSendingAnnouncement
                    ? 'bg-green-600/30 cursor-not-allowed'
                    : 'bg-green-600/40 hover:bg-green-600/60 hover:shadow-[0_0_20px_rgba(34,197,94,0.6)]'
                }`}
              >
                {isSendingAnnouncement ? 'Sending...' : 'Send Broadcast'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default AnnouncementModal;
