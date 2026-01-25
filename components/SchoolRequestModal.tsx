import React, { useMemo, useState } from 'react';
import * as SchoolRequestService from '../services/schoolRequestService';

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

const SchoolRequestModal: React.FC<SchoolRequestModalProps> = ({
  isOpen,
  onClose,
  requesterRole,
  onUseSuggestion,
}) => {
  const [schoolName, setSchoolName] = useState('');
  const [city, setCity] = useState('');
  const [country, setCountry] = useState('');
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

  const isFormValid = useMemo(
    () => schoolName.trim().length > 2 && city.trim().length > 1 && country.trim().length > 1,
    [schoolName, city, country]
  );

  const resetForm = () => {
    setSchoolName('');
    setCity('');
    setCountry('');
    setWebsite('');
    setNotes('');
    setSuggestions([]);
    setMessage(null);
    setError(null);
    setRequestId(null);
    setRequestStatus('pending');
    setStatusView(false);
    setMoreInfoMessage('');
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

    const response = await SchoolRequestService.requestSchool({
      schoolName,
      city,
      country,
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

  const suggestionButtons = suggestions.filter((suggestion) => suggestion?.name);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-slate-900/90 p-6 shadow-2xl">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-xl font-semibold text-white">Apply to add your school</h2>
            <p className="text-sm text-slate-300">We will review your request and email you once it is approved.</p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="rounded-full border border-white/10 px-3 py-1 text-xs text-white/70 hover:text-white"
          >
            ✕
          </button>
        </div>

        {statusView ? (
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
              <button
                type="submit"
                disabled={!isFormValid || isSubmitting}
                className="rounded-lg bg-cyan-400 px-4 py-2 text-sm font-semibold text-black disabled:opacity-60"
              >
                {isSubmitting ? 'Submitting...' : 'Submit request'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

export default SchoolRequestModal;
