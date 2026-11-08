/**
 * Claude-first text generation with OpenAI kept as the fallback.
 *
 * Every AI marking function asks Claude (Anthropic Messages API) first. If Claude is not configured, is switched off,
 * errors, times out or returns output the caller's own validator rejects, the caller runs its original OpenAI path.
 * Speech-to-text always stays on OpenAI because the Claude API does not accept audio.
 *
 * Environment:
 *   ANTHROPIC_API_KEY      Claude Console key (linked to the Max plan's monthly API credit).
 *   ANTHROPIC_MODEL        Claude model for all marking functions. Default: claude-sonnet-5-5.
 *   AI_PRIMARY_PROVIDER    "anthropic" (default) or "openai" to switch every function back to OpenAI instantly.
 *
 * Provenance (Diagnostic Bible 10.2): callers record the provider that actually produced the output as
 * `<provider>/<model>/<response id>` so Claude and OpenAI-fallback results stay distinguishable.
 */

export const DEFAULT_CLAUDE_MODEL = 'claude-sonnet-5-5';
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';

export type AiProvider = 'anthropic' | 'openai';

export const claudeModel = (): string => Deno.env.get('ANTHROPIC_MODEL')?.trim() || DEFAULT_CLAUDE_MODEL;

/** True when Claude should be tried first for this request. */
export const claudeEnabled = (): boolean =>
  Boolean(Deno.env.get('ANTHROPIC_API_KEY')?.trim()) &&
  (Deno.env.get('AI_PRIMARY_PROVIDER')?.trim().toLowerCase() || 'anthropic') !== 'openai';

/** The model a claim/audit row should name before generation starts (the provider tried first). */
export const primaryModel = (openAiModel: string): string => (claudeEnabled() ? claudeModel() : openAiModel);

/** Provenance string stored in existing provider-id columns (they truncate at 120-200 characters). */
export const providerTag = (provider: AiProvider, model: string, id: string | null | undefined): string =>
  `${provider}/${model}/${id ?? ''}`.slice(0, 120);

export class ClaudeError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string) {
    super(`claude_${status}:${code}`);
    this.name = 'ClaudeError';
    this.status = status;
    this.code = code;
  }
}

/**
 * Converts an OpenAI-style strict JSON schema into one Claude's structured outputs accept: every object closes with
 * additionalProperties false, and range/length keywords Claude does not enforce are dropped (the callers' validators
 * still enforce them after generation).
 */
const DROPPED_KEYWORDS = new Set([
  'minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum', 'multipleOf',
  'minLength', 'maxLength', 'maxItems', 'pattern', 'format', 'strict', '$schema',
]);
export function claudeSchema(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(claudeSchema);
  if (!schema || typeof schema !== 'object') return schema;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(schema as Record<string, unknown>)) {
    if (DROPPED_KEYWORDS.has(key)) continue;
    if (key === 'minItems') { if (value === 0 || value === 1) out[key] = value; continue; }
    out[key] = key === 'properties' && value && typeof value === 'object'
      ? Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, claudeSchema(v)]))
      : claudeSchema(value);
  }
  const type = out.type;
  if ((type === 'object' || (Array.isArray(type) && type.includes('object'))) && out.properties) out.additionalProperties = false;
  return out;
}

/** Removes code fences a model may wrap around JSON. */
export const stripJsonFences = (raw: string): string =>
  raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();

export type ClaudeRequest = {
  system: string;
  user: string;
  maxTokens: number;
  /** Optional JSON schema (OpenAI strict format is fine; it is converted). */
  schema?: unknown;
  temperature?: number;
  timeoutMs: number;
  model?: string;
};
export type ClaudeResult = { text: string; id: string; model: string; usage: { input_tokens: number | null; output_tokens: number | null } };

async function send(body: Record<string, unknown>, timeoutMs: number): Promise<Response> {
  return await fetch(ANTHROPIC_URL, {
    method: 'POST',
    signal: AbortSignal.timeout(timeoutMs),
    headers: {
      'x-api-key': Deno.env.get('ANTHROPIC_API_KEY')?.trim() ?? '',
      'anthropic-version': ANTHROPIC_VERSION,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}

/** Never keeps the provider message (it can echo student text); only status, error type and a credit flag. */
async function errorFrom(response: Response): Promise<ClaudeError> {
  const detail = await response.json().catch(() => null) as { error?: { type?: string; message?: string } } | null;
  const credit = /credit balance|billing/i.test(String(detail?.error?.message ?? ''));
  return new ClaudeError(response.status, credit ? 'credit_balance_low' : detail?.error?.type || 'unknown');
}

/**
 * Circuit breaker: after Claude fails for account/capacity reasons (bad key, no credit left, rate limit, outage or
 * timeout), skip it for a minute in this warm worker so multi-stage pipelines do not wait on it before every fallback.
 */
const CIRCUIT_MS = 60_000;
let claudeSkipUntil = 0;
const tripCircuit = (error: unknown) => {
  const accountLevel = error instanceof ClaudeError
    ? error.status !== 400 || error.code === 'credit_balance_low'
    : error instanceof DOMException || (error instanceof Error && /abort|timeout/i.test(error.name));
  if (accountLevel) claudeSkipUntil = Date.now() + CIRCUIT_MS;
};
export const claudeCircuitOpen = () => Date.now() < claudeSkipUntil;

/**
 * One Claude call returning text. Retries once on 429/5xx/overloaded. If Claude rejects the request shape (400, for
 * example an unsupported schema keyword or temperature), it retries once without the schema and temperature; the
 * caller's validator still checks the result. Throws ClaudeError (or a timeout) so callers can fall back to OpenAI.
 */
export async function claudeText(request: ClaudeRequest): Promise<ClaudeResult> {
  if (!claudeEnabled()) throw new ClaudeError(0, 'not_configured');
  if (claudeCircuitOpen()) throw new ClaudeError(0, 'skipped_recent_failure');
  try {
    return await claudeTextOnce(request);
  } catch (error) {
    if (!(error instanceof ClaudeError && error.status === 200)) tripCircuit(error);
    throw error;
  }
}

async function claudeTextOnce(request: ClaudeRequest): Promise<ClaudeResult> {
  const model = request.model || claudeModel();
  const started = Date.now();
  const remaining = () => Math.max(1000, request.timeoutMs - (Date.now() - started));
  let relaxed = false;
  for (let attempt = 0; attempt < 3; attempt++) {
    const body: Record<string, unknown> = {
      model,
      max_tokens: request.maxTokens,
      system: request.system,
      messages: [{ role: 'user', content: request.user }],
    };
    if (!relaxed && typeof request.temperature === 'number') body.temperature = request.temperature;
    if (!relaxed && request.schema) body.output_config = { format: { type: 'json_schema', schema: claudeSchema(request.schema) } };
    const response = await send(body, remaining());
    if (!response.ok) {
      const error = await errorFrom(response);
      if (response.status === 400 && error.code !== 'credit_balance_low' && !relaxed && (request.schema || typeof request.temperature === 'number')) { relaxed = true; continue; }
      if (attempt === 0 && (response.status === 429 || response.status === 529 || response.status >= 500)) continue;
      throw error;
    }
    const out = await response.json() as {
      id?: string; model?: string; stop_reason?: string;
      content?: Array<{ type?: string; text?: string }>;
      usage?: { input_tokens?: number; output_tokens?: number };
    };
    const text = (out.content ?? []).filter(part => part.type === 'text' && typeof part.text === 'string').map(part => part.text).join('');
    if (out.stop_reason !== 'end_turn' || !text.trim()) throw new ClaudeError(200, `incomplete_${out.stop_reason ?? 'unknown'}`);
    return {
      text: request.schema ? stripJsonFences(text) : text,
      id: String(out.id ?? ''),
      model: String(out.model ?? model),
      usage: { input_tokens: out.usage?.input_tokens ?? null, output_tokens: out.usage?.output_tokens ?? null },
    };
  }
  throw new ClaudeError(0, 'retries_exhausted');
}

/**
 * Claude first, validated: up to two Claude attempts (the second carries the caller's correction note), each checked by
 * the caller's own validator. Returns null when Claude is off, unavailable or keeps failing validation, so the caller
 * runs its OpenAI fallback. Logs only short codes.
 */
export async function claudeValidated<T>(
  label: string,
  build: (attempt: number) => ClaudeRequest,
  validate: (text: string) => T,
): Promise<{ value: T; tag: string; model: string; id: string } | null> {
  if (!claudeEnabled()) return null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const result = await claudeText(build(attempt));
      const value = validate(result.text);
      return { value, tag: providerTag('anthropic', result.model, result.id), model: result.model, id: result.id };
    } catch (error) {
      console.warn(JSON.stringify({ fn: label, stage: `claude_attempt_${attempt}`, reason: reasonOf(error), fallback: attempt === 1 || error instanceof ClaudeError || isTimeout(error) ? 'openai' : 'retry' }));
      // Provider/timeout failures go straight to the OpenAI fallback; only validation failures earn a second Claude try.
      if (error instanceof ClaudeError || isTimeout(error)) return null;
    }
  }
  return null;
}

const isTimeout = (error: unknown) => error instanceof DOMException || (error instanceof Error && /abort|timeout/i.test(error.name));

/** Short, content-free reason for logs (never student text). */
export const reasonOf = (error: unknown): string =>
  error instanceof ClaudeError ? error.message
    : error instanceof Error && /^[a-z_]+$/.test(error.message) ? error.message // validator codes such as invalid_quote
    : error instanceof Error ? error.name // JSON.parse messages can quote model output, so keep only the error type
    : 'unknown';
