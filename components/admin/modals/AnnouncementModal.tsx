import React from 'react';
import { useAdmin } from '../AdminContext';

const AUDIENCE_OPTIONS = [
  { value: 'all', label: '🌍 Everyone', desc: 'All users across the platform' },
  { value: 'school', label: '🏫 Specific School', desc: 'All members of a chosen school' },
  { value: 'school_admins', label: '🛡️ All School Admins', desc: 'Every school admin across all schools' },
  { value: 'school_admins_school', label: '🛡️ School Admins (School)', desc: 'Admins of a specific school' },
  { value: 'grade', label: '📚 Grade (All Schools)', desc: 'Everyone in a grade across all schools' },
  { value: 'grade_school', label: '📚 Grade at School', desc: 'A specific grade at a specific school' },
  { value: 'class', label: '📋 Specific Class', desc: 'Students in a particular class' },
  { value: 'teachers', label: '👩‍🏫 All Teachers', desc: 'Every teacher across the platform' },
] as const;

const selectClass = "w-full rounded-lg border border-green-400/40 bg-black/60 px-3 py-2 text-sm text-white focus:outline-none focus:border-green-300";

const AnnouncementModal: React.FC = () => {
  const {
    announcementExpiry, announcementText, customAnnouncementExpiry, isSendingAnnouncement,
    sendAnnouncement, setAnnouncementExpiry, setAnnouncementText, setCustomAnnouncementExpiry,
    setShowAnnouncementComposer, showAnnouncementComposer,
    announcementAudience, setAnnouncementAudience,
    announcementTargetSchoolId, setAnnouncementTargetSchoolId,
    announcementTargetGrade, setAnnouncementTargetGrade,
    announcementTargetClassId, setAnnouncementTargetClassId,
    targetSchoolClasses, loadClassesForSchool,
    schoolOptions, gradeOptions,
  } = useAdmin();

  const needsSchool = ['school', 'school_admins_school', 'grade_school', 'class'].includes(announcementAudience);
  const needsGrade = ['grade', 'grade_school'].includes(announcementAudience);
  const needsClass = announcementAudience === 'class';

  const handleSchoolChange = (schoolId: string) => {
    setAnnouncementTargetSchoolId(schoolId);
    setAnnouncementTargetClassId('');
    if (needsClass && schoolId) {
      loadClassesForSchool(schoolId);
    }
  };

  const handleAudienceChange = (audience: string) => {
    setAnnouncementAudience(audience);
    setAnnouncementTargetSchoolId('');
    setAnnouncementTargetGrade('');
    setAnnouncementTargetClassId('');
  };

  const handleCancel = () => {
    setShowAnnouncementComposer(false);
    setAnnouncementText('');
    setAnnouncementExpiry('never');
    setCustomAnnouncementExpiry('');
    setAnnouncementAudience('all');
    setAnnouncementTargetSchoolId('');
    setAnnouncementTargetGrade('');
    setAnnouncementTargetClassId('');
  };

  const currentAudienceInfo = AUDIENCE_OPTIONS.find(o => o.value === announcementAudience);

  return (
    <>
      {showAnnouncementComposer && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 p-4" role="dialog" aria-modal="true" aria-labelledby="announcement-title">
          <div className="bg-gray-900 border border-green-400/60 rounded-2xl max-w-2xl w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <h3 id="announcement-title" className="text-2xl font-heading text-green-300">📢 Broadcast Announcement</h3>

            {/* Audience Targeting */}
            <div className="space-y-2">
              <label className="text-sm text-gray-300 font-semibold">Target Audience</label>
              <select
                value={announcementAudience}
                onChange={(e) => handleAudienceChange(e.target.value)}
                className={selectClass}
              >
                {AUDIENCE_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
              {currentAudienceInfo && (
                <p className="text-xs text-gray-400">{currentAudienceInfo.desc}</p>
              )}
            </div>

            {/* School Picker — shown when audience needs a school */}
            {needsSchool && (
              <div className="space-y-1">
                <label className="text-sm text-gray-300 font-semibold">School</label>
                <select
                  value={announcementTargetSchoolId}
                  onChange={(e) => handleSchoolChange(e.target.value)}
                  className={selectClass}
                >
                  <option value="">— Select a school —</option>
                  {schoolOptions.map((s: any) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Grade Picker — shown when audience needs a grade */}
            {needsGrade && (
              <div className="space-y-1">
                <label className="text-sm text-gray-300 font-semibold">Grade</label>
                <select
                  value={announcementTargetGrade}
                  onChange={(e) => setAnnouncementTargetGrade(e.target.value)}
                  className={selectClass}
                >
                  <option value="">— Select a grade —</option>
                  {gradeOptions.map((g: number) => (
                    <option key={g} value={g}>Grade {g}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Class Picker — shown when audience is 'class' and school is selected */}
            {needsClass && announcementTargetSchoolId && (
              <div className="space-y-1">
                <label className="text-sm text-gray-300 font-semibold">Class</label>
                {targetSchoolClasses.length === 0 ? (
                  <p className="text-xs text-yellow-400">No classes found for this school.</p>
                ) : (
                  <select
                    value={announcementTargetClassId}
                    onChange={(e) => setAnnouncementTargetClassId(e.target.value)}
                    className={selectClass}
                  >
                    <option value="">— Select a class —</option>
                    {targetSchoolClasses.map((c: any) => (
                      <option key={c.id} value={c.id}>{c.class_code}{c.class_name ? ` — ${c.class_name}` : ''}</option>
                    ))}
                  </select>
                )}
              </div>
            )}

            {/* Audience summary badge */}
            {announcementAudience !== 'all' && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-green-900/30 border border-green-400/30">
                <span className="text-green-300 text-sm font-semibold">Targeting:</span>
                <span className="text-green-200 text-sm">{currentAudienceInfo?.label || announcementAudience}</span>
                {needsSchool && announcementTargetSchoolId && (
                  <span className="text-green-200/70 text-xs">• {schoolOptions.find((s: any) => s.id === announcementTargetSchoolId)?.name}</span>
                )}
                {needsGrade && announcementTargetGrade && (
                  <span className="text-green-200/70 text-xs">• Grade {announcementTargetGrade}</span>
                )}
                {needsClass && announcementTargetClassId && (
                  <span className="text-green-200/70 text-xs">• {targetSchoolClasses.find((c: any) => c.id === announcementTargetClassId)?.class_code}</span>
                )}
              </div>
            )}

            {/* Message */}
            <div className="space-y-1">
              <label className="text-sm text-gray-300 font-semibold">Message</label>
              <textarea
                value={announcementText}
                onChange={(e) => setAnnouncementText(e.target.value)}
                rows={4}
                className="w-full bg-black/50 border border-green-400/40 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-green-300"
                placeholder="Share mission updates, tournament news, or urgent warnings..."
              />
            </div>

            {/* Expiration */}
            <div className="space-y-2">
              <label className="text-sm text-gray-300 font-semibold">Expiration</label>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <select
                  value={announcementExpiry}
                  onChange={(e) => setAnnouncementExpiry(e.target.value as typeof announcementExpiry)}
                  className={selectClass}
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
                    className={selectClass}
                  />
                )}
              </div>
              <p className="text-xs text-gray-400">
                When the expiration time is reached, the announcement will stop showing.
              </p>
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={handleCancel}
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
