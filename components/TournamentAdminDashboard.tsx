import React, { useEffect, useMemo, useState } from 'react';
import {
  Profile,
  TournamentSeason,
  TournamentSignup,
  TournamentMatch,
  TournamentSchedulePayload
} from '../types';
import BackButton from './BackButton';
import * as TournamentService from '../services/tournamentService';

interface TournamentAdminDashboardProps {
  profile: Profile;
  onClose: () => void;
  addToast: (message: string, type: 'success' | 'error' | 'info') => void;
}

const defaultSeasonPayload: Partial<TournamentSeason> = {
  name: '',
  description: '',
  registration_opens: new Date().toISOString(),
  registration_closes: '',
  start_date: '',
  end_date: '',
  status: 'draft'
} as Partial<TournamentSeason>;

const TournamentAdminDashboard: React.FC<TournamentAdminDashboardProps> = ({ profile, onClose, addToast }) => {
  const [seasons, setSeasons] = useState<TournamentSeason[]>([]);
  const [selectedSeasonId, setSelectedSeasonId] = useState<string | null>(null);
  const [seasonForm, setSeasonForm] = useState<Partial<TournamentSeason>>(defaultSeasonPayload);
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingSeason, setIsSavingSeason] = useState(false);
  const [signups, setSignups] = useState<TournamentSignup[]>([]);
  const [matches, setMatches] = useState<TournamentMatch[]>([]);
  const [isGeneratingBracket, setIsGeneratingBracket] = useState(false);

  const selectedSeason = useMemo(
    () => seasons.find(season => season.id === selectedSeasonId) || null,
    [seasons, selectedSeasonId]
  );

  useEffect(() => {
    const load = async () => {
      try {
        setIsLoading(true);
        const fetched = await TournamentService.listSeasons();
        setSeasons(fetched);
        if (fetched.length > 0) {
          setSelectedSeasonId(fetched[0].id);
        }
      } catch (error) {
        console.error('Failed to load tournament seasons', error);
        addToast('Could not load seasons', 'error');
      } finally {
        setIsLoading(false);
      }
    };

    load();
  }, [addToast]);

  useEffect(() => {
    const hydrateSeasonDetails = async () => {
      if (!selectedSeasonId) return;

      try {
        const [signupList, matchList] = await Promise.all([
          TournamentService.listSignups(selectedSeasonId),
          TournamentService.listMatches(selectedSeasonId)
        ]);
        setSignups(signupList);
        setMatches(matchList);
      } catch (error) {
        console.error('Failed to load season data', error);
        addToast('Could not load season data', 'error');
      }
    };

    hydrateSeasonDetails();
  }, [selectedSeasonId, addToast]);

  const resetSeasonForm = () => setSeasonForm(defaultSeasonPayload);

  const handleCreateSeason = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      setIsSavingSeason(true);
      const created = await TournamentService.createSeason(seasonForm);
      setSeasons(prev => [created, ...prev]);
      setSelectedSeasonId(created.id);
      resetSeasonForm();
      addToast('Season created', 'success');
    } catch (error: any) {
      console.error('Failed to create season', error);
      addToast(error.message || 'Unable to create season', 'error');
    } finally {
      setIsSavingSeason(false);
    }
  };

  const handleApproveSignup = async (signupId: string) => {
    try {
      const approved = await TournamentService.approveSignup(signupId);
      setSignups(prev => prev.map(signup => (signup.id === approved.id ? approved : signup)));
      addToast('Signup approved', 'success');
    } catch (error: any) {
      console.error('Failed to approve signup', error);
      addToast(error.message || 'Unable to approve signup', 'error');
    }
  };

  const handleGenerateBracket = async () => {
    if (!selectedSeasonId) return;
    try {
      setIsGeneratingBracket(true);
      await TournamentService.generateBracket(selectedSeasonId);
      const newMatches = await TournamentService.listMatches(selectedSeasonId);
      setMatches(newMatches);
      addToast('Bracket generated', 'success');
    } catch (error: any) {
      console.error('Failed to generate bracket', error);
      addToast(error.message || 'Unable to generate bracket', 'error');
    } finally {
      setIsGeneratingBracket(false);
    }
  };

  const handleUpdateSchedule = async (payload: TournamentSchedulePayload) => {
    try {
      const updated = await TournamentService.updateSchedule(payload);
      setMatches(prev => prev.map(match => (match.id === updated.id ? updated : match)));
      addToast('Match schedule updated', 'success');
    } catch (error: any) {
      console.error('Failed to update schedule', error);
      addToast(error.message || 'Unable to update schedule', 'error');
    }
  };

  const handleRecordWinner = async (matchId: string, winnerId: string) => {
    try {
      const updated = await TournamentService.recordWinner(matchId, winnerId);
      setMatches(prev => prev.map(match => (match.id === updated.id ? updated : match)));
      addToast('Winner recorded', 'success');
    } catch (error: any) {
      console.error('Failed to record winner', error);
      addToast(error.message || 'Unable to record winner', 'error');
    }
  };

  const renderMatches = () => {
    if (!selectedSeason) {
      return <div className="text-white/60">Select a season to view matches.</div>;
    }

    if (matches.length === 0) {
      return <div className="text-white/60">Generate a bracket to populate matches.</div>;
    }

    return (
      <div className="space-y-4">
        {matches.map(match => (
          <div key={match.id} className="bg-white/5 border border-white/10 rounded-xl p-4">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 mb-2">
              <div>
                <div className="text-sm text-white/70 uppercase tracking-wide">Round {match.round_number}</div>
                <div className="text-lg text-white font-semibold">Match {match.match_number}</div>
              </div>
              <div className="text-xs text-plasma-pink uppercase tracking-wide">{match.status}</div>
            </div>
            <div className="grid md:grid-cols-3 gap-3">
              <div>
                <div className="text-xs text-white/60 uppercase">Team A</div>
                <div className="text-white font-semibold">{match.team_a_id || 'TBD'}</div>
              </div>
              <div>
                <div className="text-xs text-white/60 uppercase">Team B</div>
                <div className="text-white font-semibold">{match.team_b_id || 'TBD'}</div>
              </div>
              <div>
                <div className="text-xs text-white/60 uppercase">Scheduled</div>
                <div className="text-white/80 text-sm">
                  {match.scheduled_at ? new Date(match.scheduled_at).toLocaleString() : 'Not set'}
                </div>
              </div>
            </div>
            <div className="grid md:grid-cols-3 gap-3 mt-4">
              <ScheduleEditor match={match} onSave={handleUpdateSchedule} />
              <WinnerSelector
                match={match}
                signups={signups.filter(signup => signup.status === 'approved')}
                onSelectWinner={handleRecordWinner}
              />
            </div>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="min-h-screen relative overflow-hidden">
      <div className="fixed inset-0 pointer-events-none bg-gradient-to-br from-purple-950/90 via-slate-950/80 to-black/80" />
      <div className="relative z-10 p-6 space-y-6">
        <BackButton onClick={onClose} />
        <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-heading text-white">Tournament Operations</h1>
            <p className="text-white/70 max-w-2xl">
              Create seasons, approve school codes, and generate brackets. Only admins should see this surface.
            </p>
          </div>
          <div className="bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white/70">
            <div className="text-xs uppercase tracking-wide text-plasma-pink font-semibold">Signed in as</div>
            <div className="text-sm">{profile.username}</div>
          </div>
        </header>

        <section className="bg-white/5 border border-white/10 rounded-xl p-4 md:p-6 space-y-4 backdrop-blur">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div>
              <h2 className="text-xl font-heading text-ion-blue">Active seasons</h2>
              <p className="text-white/60 text-sm">Select a season to manage signups and matches.</p>
            </div>
            <select
              className="bg-black/60 border border-white/20 text-white rounded-lg px-4 py-2"
              value={selectedSeasonId || ''}
              onChange={event => setSelectedSeasonId(event.target.value || null)}
              disabled={isLoading}
            >
              {isLoading && <option value="">Loading…</option>}
              {!isLoading && seasons.length === 0 && <option value="">No seasons yet</option>}
              {seasons.map(season => (
                <option key={season.id} value={season.id}>
                  {season.name}
                </option>
              ))}
            </select>
          </div>
          <form onSubmit={handleCreateSeason} className="grid md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-xs uppercase tracking-wide text-white/60">Season name</label>
              <input
                className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-white"
                value={seasonForm.name || ''}
                onChange={event => setSeasonForm(prev => ({ ...prev, name: event.target.value }))}
                required
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs uppercase tracking-wide text-white/60">Status</label>
              <select
                className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-white"
                value={seasonForm.status || 'draft'}
                onChange={event => setSeasonForm(prev => ({ ...prev, status: event.target.value as TournamentSeason['status'] }))}
              >
                <option value="draft">Draft</option>
                <option value="registration">Registration</option>
                <option value="active">Active</option>
                <option value="completed">Completed</option>
                <option value="archived">Archived</option>
              </select>
            </div>
            <div className="space-y-2 md:col-span-2">
              <label className="text-xs uppercase tracking-wide text-white/60">Description</label>
              <textarea
                className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-white"
                rows={3}
                value={seasonForm.description || ''}
                onChange={event => setSeasonForm(prev => ({ ...prev, description: event.target.value }))}
              />
            </div>
            <div className="grid md:grid-cols-2 gap-4 md:col-span-2">
              <div className="space-y-2">
                <label className="text-xs uppercase tracking-wide text-white/60">Registration opens</label>
                <input
                  className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-white"
                  type="datetime-local"
                  value={seasonForm.registration_opens ? seasonForm.registration_opens.slice(0, 16) : ''}
                  onChange={event => setSeasonForm(prev => ({ ...prev, registration_opens: event.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs uppercase tracking-wide text-white/60">Registration closes</label>
                <input
                  className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-white"
                  type="datetime-local"
                  value={seasonForm.registration_closes ? seasonForm.registration_closes.slice(0, 16) : ''}
                  onChange={event => setSeasonForm(prev => ({ ...prev, registration_closes: event.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs uppercase tracking-wide text-white/60">Start date</label>
                <input
                  className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-white"
                  type="datetime-local"
                  value={seasonForm.start_date ? seasonForm.start_date.slice(0, 16) : ''}
                  onChange={event => setSeasonForm(prev => ({ ...prev, start_date: event.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs uppercase tracking-wide text-white/60">End date</label>
                <input
                  className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-white"
                  type="datetime-local"
                  value={seasonForm.end_date ? seasonForm.end_date.slice(0, 16) : ''}
                  onChange={event => setSeasonForm(prev => ({ ...prev, end_date: event.target.value }))}
                />
              </div>
            </div>
            <button
              type="submit"
              className="bg-plasma-pink/80 hover:bg-plasma-pink text-white font-semibold px-4 py-2 rounded-lg transition md:col-span-2"
              disabled={isSavingSeason}
            >
              {isSavingSeason ? 'Creating…' : 'Create season'}
            </button>
          </form>
        </section>

        <section className="grid md:grid-cols-[2fr,3fr] gap-4">
          <div className="bg-black/50 border border-white/10 rounded-xl p-4 md:p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-heading text-ion-blue">School signups</h2>
              <button
                className="bg-ion-blue/80 hover:bg-ion-blue text-white text-sm px-3 py-1 rounded-lg disabled:opacity-50"
                disabled={!selectedSeasonId || isGeneratingBracket}
                onClick={handleGenerateBracket}
              >
                {isGeneratingBracket ? 'Generating…' : 'Generate bracket'}
              </button>
            </div>
            {signups.length === 0 ? (
              <div className="text-white/60 text-sm">No signups yet.</div>
            ) : (
              <ul className="space-y-3 max-h-80 overflow-y-auto pr-1">
                {signups.map(signup => (
                  <li key={signup.id} className="bg-white/5 border border-white/10 rounded-lg px-3 py-2">
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                      <div>
                        <div className="text-white font-semibold">{signup.school_name}</div>
                        <div className="text-xs text-white/60">Code: {signup.school_code}</div>
                        <div className="text-xs text-white/50">Coach: {signup.contact_name || 'Unknown'}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs uppercase tracking-wide text-plasma-pink font-bold">{signup.status}</span>
                        {signup.status !== 'approved' && (
                          <button
                            className="text-xs text-ion-blue font-semibold px-3 py-1 border border-ion-blue/50 rounded"
                            onClick={() => handleApproveSignup(signup.id)}
                          >
                            Approve
                          </button>
                        )}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="bg-black/50 border border-white/10 rounded-xl p-4 md:p-6 space-y-4">
            <h2 className="text-lg font-heading text-ion-blue">Matches & scheduling</h2>
            {renderMatches()}
          </div>
        </section>
      </div>
    </div>
  );
};

interface ScheduleEditorProps {
  match: TournamentMatch;
  onSave: (payload: TournamentSchedulePayload) => void;
}

const ScheduleEditor: React.FC<ScheduleEditorProps> = ({ match, onSave }) => {
  const [scheduledAt, setScheduledAt] = useState<string | null>(match.scheduled_at || null);
  const [location, setLocation] = useState<string | null>(match.location || null);
  const [streamUrl, setStreamUrl] = useState<string | null>(match.stream_url || null);

  const handleSave = () => {
    onSave({
      matchId: match.id,
      scheduledAt,
      location,
      streamUrl,
      metadata: match.metadata || undefined
    });
  };

  return (
    <div className="space-y-2">
      <div className="text-xs text-white/60 uppercase tracking-wide">Scheduling</div>
      <input
        className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white"
        type="datetime-local"
        value={scheduledAt ? scheduledAt.slice(0, 16) : ''}
        onChange={event => setScheduledAt(event.target.value || null)}
      />
      <input
        className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white"
        placeholder="Location"
        value={location || ''}
        onChange={event => setLocation(event.target.value || null)}
      />
      <input
        className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white"
        placeholder="Stream URL"
        value={streamUrl || ''}
        onChange={event => setStreamUrl(event.target.value || null)}
      />
      <button
        className="bg-ion-blue/70 hover:bg-ion-blue text-white text-sm px-3 py-1 rounded-lg"
        type="button"
        onClick={handleSave}
      >
        Save
      </button>
    </div>
  );
};

interface WinnerSelectorProps {
  match: TournamentMatch;
  signups: TournamentSignup[];
  onSelectWinner: (matchId: string, winnerId: string) => void;
}

const WinnerSelector: React.FC<WinnerSelectorProps> = ({ match, signups, onSelectWinner }) => {
  const [winner, setWinner] = useState<string | ''>(match.winner_id || '');

  const handleSave = () => {
    if (!winner) return;
    onSelectWinner(match.id, winner);
  };

  return (
    <div className="space-y-2">
      <div className="text-xs text-white/60 uppercase tracking-wide">Winner</div>
      <select
        className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white"
        value={winner}
        onChange={event => setWinner(event.target.value)}
      >
        <option value="">Select winner</option>
        {signups.map(signup => (
          <option key={signup.id} value={signup.id}>
            {signup.school_name}
          </option>
        ))}
      </select>
      <button
        className="bg-plasma-pink/70 hover:bg-plasma-pink text-white text-sm px-3 py-1 rounded-lg"
        type="button"
        onClick={handleSave}
      >
        Save winner
      </button>
    </div>
  );
};

export default TournamentAdminDashboard;
