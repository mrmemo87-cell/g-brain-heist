import { supabase } from './supabaseClient';
import {
  TournamentSeason,
  TournamentSignup,
  TournamentMatch,
  TournamentBracketRound,
  TournamentSignupPayload,
  TournamentSchedulePayload
} from '../types';

type TournamentBracketRow = TournamentMatch & {
  match_id?: string;
  season_name?: string | null;
  team_a_name?: string | null;
  team_a_code?: string | null;
  team_b_name?: string | null;
  team_b_code?: string | null;
};

const SEASONS_TABLE = 'tournament_seasons';
const SIGNUPS_TABLE = 'tournament_school_signups';
const MATCHES_VIEW = 'tournament_public_bracket';

export async function listSeasons(): Promise<TournamentSeason[]> {
  const { data, error } = await supabase
    .from<TournamentSeason>(SEASONS_TABLE)
    .select('*')
    .order('start_date', { ascending: false });

  if (error) {
    throw error;
  }

  return data || [];
}

export async function createSeason(payload: Partial<TournamentSeason>): Promise<TournamentSeason> {
  const { data, error } = await supabase
    .from<TournamentSeason>(SEASONS_TABLE)
    .insert(payload)
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data;
}

export async function updateSeason(id: string, payload: Partial<TournamentSeason>): Promise<TournamentSeason> {
  const { data, error } = await supabase
    .from<TournamentSeason>(SEASONS_TABLE)
    .update(payload)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data;
}

export async function registerSchool(payload: TournamentSignupPayload): Promise<TournamentSignup> {
  const { data, error } = await supabase
    .from<TournamentSignup>(SIGNUPS_TABLE)
    .insert(payload)
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data;
}

export async function listSignups(seasonId: string): Promise<TournamentSignup[]> {
  const { data, error } = await supabase
    .from<TournamentSignup>(SIGNUPS_TABLE)
    .select('*')
    .eq('season_id', seasonId)
    .order('created_at', { ascending: true });

  if (error) {
    throw error;
  }

  return data || [];
}

export async function approveSignup(signupId: string): Promise<TournamentSignup> {
  const { data, error } = await supabase
    .rpc<TournamentSignup>('approve_tournament_signup', { signup_id: signupId });

  if (error) {
    throw error;
  }

  return data as TournamentSignup;
}

export async function generateBracket(seasonId: string): Promise<TournamentMatch[]> {
  const { data, error } = await supabase
    .rpc<TournamentMatch>('generate_season_bracket', { season_id: seasonId });

  if (error) {
    throw error;
  }

  return data || [];
}

export async function getBracket(seasonId: string): Promise<TournamentBracketRound[]> {
  const { data, error } = await supabase
    .from<TournamentBracketRow>(MATCHES_VIEW)
    .select('*')
    .eq('season_id', seasonId)
    .order('round_number', { ascending: true })
    .order('match_number', { ascending: true });

  if (error) {
    throw error;
  }

  const rounds: Record<number, TournamentBracketRound> = {};

  (data || []).forEach(match => {
    const round = match.round_number;
    if (!rounds[round]) {
      rounds[round] = {
        roundNumber: round,
        matches: []
      };
    }

    const matchId = match.match_id || match.id;

    rounds[round].matches.push({
      id: matchId,
      round: round,
      matchNumber: match.match_number,
      scheduledAt: match.scheduled_at || null,
      location: match.location || null,
      streamUrl: match.stream_url || null,
      status: match.status as TournamentMatch['status'],
      winnerId: match.winner_id || null,
      teamA: match.team_a_name ? {
        name: match.team_a_name,
        code: match.team_a_code || undefined
      } : null,
      teamB: match.team_b_name ? {
        name: match.team_b_name,
        code: match.team_b_code || undefined
      } : null
    });
  });

  return Object.values(rounds).sort((a, b) => a.roundNumber - b.roundNumber);
}

export async function listMatches(seasonId: string): Promise<TournamentMatch[]> {
  const { data, error } = await supabase
    .from<TournamentMatch>('tournament_matches')
    .select('*')
    .eq('season_id', seasonId)
    .order('round_number', { ascending: true })
    .order('match_number', { ascending: true });

  if (error) {
    throw error;
  }

  return data || [];
}

export async function updateSchedule(payload: TournamentSchedulePayload): Promise<TournamentMatch> {
  const { data, error } = await supabase
    .rpc<TournamentMatch>('update_match_schedule', {
      match_id: payload.matchId,
      scheduled_at: payload.scheduledAt,
      location: payload.location,
      stream_url: payload.streamUrl,
      metadata: payload.metadata || null
    });

  if (error) {
    throw error;
  }

  return data as TournamentMatch;
}

export async function recordWinner(matchId: string, winnerId: string): Promise<TournamentMatch> {
  const { data, error } = await supabase
    .rpc<TournamentMatch>('record_match_winner', {
      match_id: matchId,
      winner: winnerId
    });

  if (error) {
    throw error;
  }

  return data as TournamentMatch;
}

export async function getPublicBracket(): Promise<TournamentBracketRound[]> {
  const { data, error } = await supabase
    .from<TournamentBracketRow>(MATCHES_VIEW)
    .select('*')
    .order('season_id', { ascending: false })
    .order('round_number', { ascending: true })
    .order('match_number', { ascending: true });

  if (error) {
    throw error;
  }

  return getBracketRounds(data || []);
}

function getBracketRounds(matches: TournamentBracketRow[]): TournamentBracketRound[] {
  const rounds: Record<number, TournamentBracketRound> = {};

  matches.forEach(match => {
    const round = match.round_number;
    if (!rounds[round]) {
      rounds[round] = {
        roundNumber: round,
        matches: []
      };
    }

    const matchId = match.match_id || match.id;

    rounds[round].matches.push({
      id: matchId,
      round: round,
      matchNumber: match.match_number,
      scheduledAt: match.scheduled_at || null,
      location: match.location || null,
      streamUrl: match.stream_url || null,
      status: match.status as TournamentMatch['status'],
      winnerId: match.winner_id || null,
      teamA: match.team_a_name ? {
        name: match.team_a_name,
        code: match.team_a_code || undefined
      } : null,
      teamB: match.team_b_name ? {
        name: match.team_b_name,
        code: match.team_b_code || undefined
      } : null
    });
  });

  return Object.values(rounds).sort((a, b) => a.roundNumber - b.roundNumber);
}

