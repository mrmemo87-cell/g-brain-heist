import React, { useEffect, useMemo, useState } from 'react';
import {
  Profile,
  TournamentSeason,
  TournamentSignup,
  TournamentBracketRound,
  TournamentSignupPayload
} from '../types';
import BackButton from './BackButton';
import * as TournamentService from '../services/tournamentService';

interface TournamentHubProps {
  profile: Profile;
  onClose: () => void;
  addToast: (message: string, type: 'success' | 'error' | 'info') => void;
}

const TournamentHub: React.FC<TournamentHubProps> = ({ profile, onClose, addToast }) => {
  const [seasons, setSeasons] = useState<TournamentSeason[]>([]);
  const [selectedSeasonId, setSelectedSeasonId] = useState<string | null>(null);
  const [signups, setSignups] = useState<TournamentSignup[]>([]);
  const [bracket, setBracket] = useState<TournamentBracketRound[]>([]);
  const [isLoadingSeasons, setIsLoadingSeasons] = useState(true);
  const [isLoadingSeasonData, setIsLoadingSeasonData] = useState(false);
  const [signupForm, setSignupForm] = useState<Omit<TournamentSignupPayload, 'season_id'>>({
    school_name: '',
    school_code: '',
    contact_name: profile.username,
    contact_email: ''
  });
  const [isSubmittingSignup, setIsSubmittingSignup] = useState(false);

  const selectedSeason = useMemo(
    () => seasons.find(season => season.id === selectedSeasonId) || null,
    [selectedSeasonId, seasons]
  );

  const canRegister = profile.role === 'teacher' || profile.role === 'admin';

  useEffect(() => {
    const load = async () => {
      try {
        setIsLoadingSeasons(true);
        const fetchedSeasons = await TournamentService.listSeasons();
        setSeasons(fetchedSeasons);
        if (fetchedSeasons.length > 0) {
          setSelectedSeasonId(fetchedSeasons[0].id);
        }
      } catch (error: any) {
        console.error('Failed to load tournament seasons', error);
        addToast('Could not load tournament seasons', 'error');
      } finally {
        setIsLoadingSeasons(false);
      }
    };

    load();
  }, [addToast]);

  useEffect(() => {
    const loadSeasonData = async () => {
      if (!selectedSeasonId) return;
      try {
        setIsLoadingSeasonData(true);
        const [seasonSignups, seasonBracket] = await Promise.all([
          TournamentService.listSignups(selectedSeasonId),
          TournamentService.getBracket(selectedSeasonId)
        ]);
        setSignups(seasonSignups);
        setBracket(seasonBracket);
      } catch (error: any) {
        console.error('Failed to load season details', error);
        addToast('Could not load season details', 'error');
      } finally {
        setIsLoadingSeasonData(false);
      }
    };

    loadSeasonData();
  }, [selectedSeasonId, addToast]);

  const handleSignupSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedSeasonId) return;

    try {
      setIsSubmittingSignup(true);
      await TournamentService.registerSchool({
        season_id: selectedSeasonId,
        ...signupForm,
        roster: signupForm.roster || []
      });
      addToast('Signup submitted for review ✅', 'success');
      setSignupForm({
        school_name: '',
        school_code: '',
        contact_name: profile.username,
        contact_email: ''
      });
      const updatedSignups = await TournamentService.listSignups(selectedSeasonId);
      setSignups(updatedSignups);
    } catch (error: any) {
      console.error('Failed to submit signup', error);
      addToast(error.message || 'Unable to submit signup', 'error');
    } finally {
      setIsSubmittingSignup(false);
    }
  };

  const renderBracket = () => {
    if (isLoadingSeasonData) {
      return <div className="text-center text-white/70">Loading bracket…</div>;
    }

    if (bracket.length === 0) {
      return <div className="text-center text-white/60">Bracket has not been generated yet.</div>;
    }

    return (
      <div className="flex flex-col md:flex-row gap-6 md:items-start overflow-x-auto pb-4">
        {bracket.map(round => (
          <div key={round.roundNumber} className="min-w-[240px] bg-black/40 border border-white/10 rounded-xl p-4 backdrop-blur-sm">
            <h3 className="text-lg font-heading text-ion-blue mb-3">Round {round.roundNumber}</h3>
            <div className="space-y-3">
              {round.matches.map(match => (
                <div key={match.id} className="bg-white/5 rounded-lg p-3 border border-white/10">
                  <div className="text-xs text-white/50 mb-1">Match {match.matchNumber}</div>
                  <div className="space-y-1">
                    <div className="flex justify-between">
                      <span className="text-sm text-white font-semibold">{match.teamA?.name || 'TBD'}</span>
                      {match.teamA?.code && <span className="text-xs text-white/50">{match.teamA.code}</span>}
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-white font-semibold">{match.teamB?.name || 'TBD'}</span>
                      {match.teamB?.code && <span className="text-xs text-white/50">{match.teamB.code}</span>}
                    </div>
                  </div>
                  <div className="mt-2 text-xs text-white/70">
                    {match.scheduledAt ? new Date(match.scheduledAt).toLocaleString() : 'Scheduling TBD'}
                  </div>
                  {match.location && <div className="text-xs text-white/50">{match.location}</div>}
                  <div className="mt-2 text-xs text-plasma-pink font-semibold uppercase tracking-wide">
                    {match.status}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="min-h-screen relative overflow-hidden">
      <div className="fixed inset-0 pointer-events-none bg-gradient-to-br from-[#120027]/80 via-[#001527]/80 to-[#101010]/80" />
      <div className="relative z-10 p-6 space-y-6">
        <BackButton onClick={onClose} />
        <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-heading text-white">Tournament Command Center</h1>
            <p className="text-white/70 max-w-2xl">
              Follow the current season, scout the bracket, and help your school dominate the leaderboard.
            </p>
          </div>
          {canRegister && (
            <div className="bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white/80">
              <div className="text-sm uppercase tracking-wide text-plasma-pink font-semibold">Coaches</div>
              <div className="text-xs text-white/60">Use your invite code to lock in your school&apos;s roster.</div>
            </div>
          )}
        </header>

        <section className="bg-white/5 border border-white/10 rounded-xl p-4 md:p-6 backdrop-blur">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div>
              <h2 className="text-xl font-heading text-ion-blue">Seasons</h2>
              <p className="text-white/60 text-sm">Select a season to explore the bracket and schedule.</p>
            </div>
            <select
              className="bg-black/40 border border-white/20 text-white rounded-lg px-4 py-2"
              value={selectedSeasonId || ''}
              onChange={event => setSelectedSeasonId(event.target.value || null)}
              disabled={isLoadingSeasons}
            >
              {isLoadingSeasons && <option value="">Loading…</option>}
              {!isLoadingSeasons && seasons.length === 0 && <option value="">No seasons yet</option>}
              {seasons.map(season => (
                <option key={season.id} value={season.id}>
                  {season.name}
                </option>
              ))}
            </select>
          </div>
          {selectedSeason && (
            <div className="mt-4 text-white/70 text-sm space-y-1">
              {selectedSeason.description && <p>{selectedSeason.description}</p>}
              <p>
                Registration closes{' '}
                {selectedSeason.registration_closes
                  ? new Date(selectedSeason.registration_closes).toLocaleDateString()
                  : 'TBD'}
              </p>
            </div>
          )}
        </section>

        {canRegister && selectedSeason && (
          <section className="grid md:grid-cols-[2fr,3fr] gap-4">
            <form
              onSubmit={handleSignupSubmit}
              className="bg-black/50 border border-white/10 rounded-xl p-4 md:p-6 space-y-4"
            >
              <div>
                <h2 className="text-lg font-heading text-ion-blue">Sign up your school</h2>
                <p className="text-xs text-white/60">
                  Enter the code provided by the tournament ops team. Submissions stay pending until approved by admins.
                </p>
              </div>
              <div className="space-y-2">
                <label className="text-xs uppercase tracking-wide text-white/60">School name</label>
                <input
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white"
                  required
                  value={signupForm.school_name}
                  onChange={event => setSignupForm(prev => ({ ...prev, school_name: event.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs uppercase tracking-wide text-white/60">Invite code</label>
                <input
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white"
                  required
                  value={signupForm.school_code}
                  onChange={event => setSignupForm(prev => ({ ...prev, school_code: event.target.value.trim() }))}
                />
              </div>
              <div className="grid md:grid-cols-2 gap-3">
                <div className="space-y-2">
                  <label className="text-xs uppercase tracking-wide text-white/60">Coach name</label>
                  <input
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white"
                    value={signupForm.contact_name || ''}
                    onChange={event => setSignupForm(prev => ({ ...prev, contact_name: event.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs uppercase tracking-wide text-white/60">Contact email</label>
                  <input
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white"
                    type="email"
                    value={signupForm.contact_email || ''}
                    onChange={event => setSignupForm(prev => ({ ...prev, contact_email: event.target.value }))}
                  />
                </div>
              </div>
              <button
                type="submit"
                className="bg-ion-blue/80 hover:bg-ion-blue text-white font-semibold px-4 py-2 rounded-lg transition"
                disabled={isSubmittingSignup}
              >
                {isSubmittingSignup ? 'Submitting…' : 'Submit signup'}
              </button>
            </form>

            <div className="bg-black/50 border border-white/10 rounded-xl p-4 md:p-6">
              <h2 className="text-lg font-heading text-ion-blue mb-4">Signups</h2>
              {signups.length === 0 ? (
                <div className="text-white/60 text-sm">No signups yet.</div>
              ) : (
                <ul className="space-y-3 max-h-80 overflow-y-auto pr-1">
                  {signups.map(signup => (
                    <li key={signup.id} className="flex items-start justify-between bg-white/5 border border-white/10 rounded-lg px-3 py-2">
                      <div>
                        <div className="text-white font-semibold">{signup.school_name}</div>
                        <div className="text-xs text-white/60">Code: {signup.school_code}</div>
                        <div className="text-xs text-white/50">Coach: {signup.contact_name || 'Unknown'}</div>
                      </div>
                      <span className="text-xs uppercase tracking-wide text-plasma-pink font-bold">
                        {signup.status}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        )}

        <section className="bg-white/5 border border-white/10 rounded-xl p-4 md:p-6 backdrop-blur">
          <h2 className="text-xl font-heading text-ion-blue mb-4">Bracket</h2>
          {renderBracket()}
        </section>
      </div>
    </div>
  );
};

export default TournamentHub;

