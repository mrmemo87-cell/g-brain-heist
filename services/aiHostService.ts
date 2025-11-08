import { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import { supabase } from './supabaseClient';

type MatchEventPayload = {
  id: string;
  match_id?: string;
  event_type: string;
  summary?: string;
  metadata?: Record<string, any> | null;
  created_at: string;
};

const SAFETY_BLOCKLIST = [
  'blood',
  'gore',
  'kill',
  'murder',
  'die',
  'dead',
  'suicide',
  'nsfw',
  'curse',
  'hate',
];

const HYPE_LIBRARY: Record<string, string[]> = {
  match_start: [
    '🎮 {player_one} vs {player_two}! The arena lights are blazing and I am HERE for it!',
    '🔥 Systems online and hype levels rising—{player_one} just booted into a showdown with {player_two}!'
  ],
  score_update: [
    '📊 Score flash: {player_one} leads {score}! Can {player_two} answer back?',
    '⚡ Momentum swing detected! {highlight}—the crowd (and my circuits) are buzzing!'
  ],
  clutch: [
    '😱 {winner} just pulled off a clutch that defied my probability tables! {highlight}',
    '🤖 Processing...processing...yup, that was LEGEND status from {winner}!'
  ],
  match_point: [
    '🚨 Match point! {winner} is one play away from sealing it. {loser}, now is the moment!',
    '🎯 Victory is in sight for {winner}. Hold your breath, team!'
  ],
  match_end: [
    '🏁 {winner} takes it! Final reckoning: {score}. GG to {loser} for the fight!',
    '👏 Systems applauding! {winner} just wrapped the match {score}. Respect to both operatives.'
  ],
  upset: [
    '🤯 Alert! {winner} just toppled the favorite {loser}. That upset registered on every sensor I have!',
    '⚠️ Massive upset! {winner} rewrote the script against {loser}—believe the hype!'
  ],
};

const DEFAULT_LINES = [
  '🎤 Your AI Host reporting: {highlight}',
  '🤖 Hype alert! {highlight}',
  '🔥 Another big moment in the arena: {highlight}'
];

const ENABLED = import.meta.env.VITE_ENABLE_AI_HOST === 'true';
const THROTTLE_MS = Number(import.meta.env.VITE_AI_HOST_THROTTLE_MS || 60000);

class AIHostService {
  private channel: RealtimeChannel | null = null;
  private lastPostedAt = 0;
  private processedEvents = new Set<string>();
  private readonly enabled = ENABLED;
  private readonly throttleMs = THROTTLE_MS;

  init() {
    if (!this.enabled) {
      console.info('[AI Host] Disabled via environment variable.');
      return;
    }

    if (this.channel) {
      return;
    }

    this.channel = supabase
      .channel('ai-host-match-events')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'match_events',
      }, (payload: RealtimePostgresChangesPayload<MatchEventPayload>) => {
        this.handleMatchEvent(payload.new as MatchEventPayload);
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.info('[AI Host] Listening for match events.');
        }
      });
  }

  stop() {
    if (this.channel) {
      supabase.removeChannel(this.channel);
      this.channel = null;
    }
  }

  private handleMatchEvent(event: MatchEventPayload) {
    if (!event || this.processedEvents.has(event.id)) {
      return;
    }

    const now = Date.now();
    if (now - this.lastPostedAt < this.throttleMs) {
      console.debug('[AI Host] Throttled event skipped.', { eventId: event.id });
      return;
    }

    const hypeLine = this.generateHypeLine(event);
    if (!hypeLine) {
      return;
    }

    this.publishToNewsFeed(event, hypeLine)
      .then((published) => {
        if (published) {
          this.lastPostedAt = now;
          this.processedEvents.add(event.id);
        }
      })
      .catch((error) => {
        console.error('[AI Host] Failed to publish hype line:', error);
      });
  }

  private generateHypeLine(event: MatchEventPayload): string | null {
    const metadata = event.metadata || {};
    const players = this.extractPlayers(metadata);
    const score = metadata.score || metadata.current_score || metadata.final_score || 'N/A';
    const highlight = metadata.highlight || event.summary || metadata.description || 'Big plays unfolding!';

    const templatePool = HYPE_LIBRARY[event.event_type] || DEFAULT_LINES;
    const template = templatePool[Math.floor(Math.random() * templatePool.length)];

    const replacements: Record<string, string> = {
      player_one: players.playerOne,
      player_two: players.playerTwo,
      winner: players.winner,
      loser: players.loser,
      score,
      highlight,
    };

    let line = template;
    Object.entries(replacements).forEach(([key, value]) => {
      line = line.replace(new RegExp(`{${key}}`, 'g'), value || 'their opponent');
    });

    if (!this.isSafe(line)) {
      console.warn('[AI Host] Generated line failed safety filter.', { line });
      return null;
    }

    return line;
  }

  private extractPlayers(metadata: Record<string, any>) {
    const playerOne = metadata.player_one || metadata.attacker || metadata.team_a || 'Player One';
    const playerTwo = metadata.player_two || metadata.defender || metadata.team_b || 'Player Two';
    const winner = metadata.winner || metadata.victor || playerOne;
    const loser = metadata.loser || metadata.defeated || playerTwo;

    return { playerOne, playerTwo, winner, loser };
  }

  private isSafe(text: string): boolean {
    const lowerText = text.toLowerCase();
    return !SAFETY_BLOCKLIST.some((term) => lowerText.includes(term));
  }

  private async publishToNewsFeed(event: MatchEventPayload, line: string): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('activities')
        .insert({
          kind: 'ai_host',
          actor_id: null,
          actor_username: 'AI Host',
          target_id: null,
          target_username: null,
          data: {
            details: line,
            event_type: event.event_type,
            match_id: event.match_id || event.id,
            highlight: event.summary || event.metadata?.highlight,
          },
        });

      if (error) {
        console.error('[AI Host] Supabase insert error:', error);
        return false;
      }

      return true;
    } catch (error) {
      console.error('[AI Host] Unexpected error publishing activity:', error);
      return false;
    }
  }
}

export const aiHostService = new AIHostService();

