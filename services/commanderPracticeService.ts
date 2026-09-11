import { supabase } from './supabaseClient';

export type CommanderPracticeSide = 'player' | 'enemy';
export type CommanderPracticeStatus = 'active' | 'victory' | 'defeat' | 'draw';
export type CommanderPracticeMove = 'focus_target' | 'death_bolt' | 'guard';

export type CommanderPracticeCombatant = {
  id: string;
  side: CommanderPracticeSide;
  role: 'commander' | 'unit';
  name: string;
  hp: number;
  maxHp: number;
  shield: number;
  attack: number;
};

export type CommanderPracticeEvent = {
  id: string;
  turn: number;
  side: CommanderPracticeSide | 'system';
  code:
    | 'battle_started'
    | 'focus_target'
    | 'death_bolt'
    | 'guard'
    | 'unit_attack'
    | 'shield_absorb'
    | 'combatant_defeated'
    | 'battle_victory'
    | 'battle_defeat'
    | 'battle_draw';
  actorName?: string;
  targetName?: string;
  amount?: number;
};

export type CommanderPracticeBattle = {
  version: 1;
  seed: number;
  turn: number;
  maxTurns: number;
  status: CommanderPracticeStatus;
  playerFocusTarget: string | null;
  enemyFocusTarget: string | null;
  playerDeathBoltCooldown: number;
  enemyDeathBoltCooldown: number;
  combatants: CommanderPracticeCombatant[];
  events: CommanderPracticeEvent[];
};

export type CommanderPracticeSession = {
  transcript: string;
  expiresAt: string;
  battle: CommanderPracticeBattle;
};

type PracticeApiResponse = {
  ok?: boolean;
  error?: string;
  transcript?: string;
  expiresAt?: string;
  battle?: CommanderPracticeBattle;
};

const extractFunctionError = async (error: unknown, data: PracticeApiResponse | null) => {
  if (data?.error) return data.error;

  if (error && typeof error === 'object' && 'context' in error) {
    const context = (error as { context?: unknown }).context;
    if (context instanceof Response) {
      try {
        const payload = await context.clone().json() as { error?: unknown };
        if (typeof payload?.error === 'string' && payload.error) return payload.error;
      } catch {
        // Fall through to the connector error below.
      }
    }
  }

  if (error instanceof Error && error.message) return error.message;
  return 'commander_preview_unavailable';
};

const requireSession = async (
  data: PracticeApiResponse | null,
  error: unknown,
): Promise<CommanderPracticeSession> => {
  if (error || !data?.ok) throw new Error(await extractFunctionError(error, data));
  if (!data.transcript || !data.expiresAt || !data.battle) {
    throw new Error('invalid_commander_preview_response');
  }
  return {
    transcript: data.transcript,
    expiresAt: data.expiresAt,
    battle: data.battle,
  };
};

export async function startCommanderPractice(signal?: AbortSignal): Promise<CommanderPracticeSession> {
  const { data, error } = await supabase.functions.invoke<PracticeApiResponse>('commander_practice', {
    signal,
    body: { action: 'start' },
  });
  return requireSession(data, error);
}

export async function submitCommanderPracticeTurn(
  transcript: string,
  move: CommanderPracticeMove,
  targetId?: string | null,
  signal?: AbortSignal,
): Promise<CommanderPracticeSession> {
  const { data, error } = await supabase.functions.invoke<PracticeApiResponse>('commander_practice', {
    signal,
    body: {
      action: 'turn',
      transcript,
      move,
      targetId: targetId ?? null,
    },
  });
  return requireSession(data, error);
}
