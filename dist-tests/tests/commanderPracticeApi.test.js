import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHmac, webcrypto } from 'node:crypto';
import test from 'node:test';
import ts from 'typescript';
import * as engine from '../supabase/functions/commander_practice/engine.js';
// Execute the actual Edge entry point with only its platform/auth dependencies replaced.
// The real engine, HTTP parsing and WebCrypto signing/verification all run here.
const source = readFileSync('supabase/functions/commander_practice/index.ts', 'utf8');
const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const secret = 'commander-test-secret-never-use-in-production';
function setup(options = {}) {
    const env = {
        SUPABASE_URL: 'https://example.invalid', SUPABASE_SERVICE_ROLE_KEY: 'test-only',
        COMMANDER_PREVIEW_SIGNING_SECRET: secret,
        ...options.env,
    };
    const users = options.users ?? { a: { id: 'tester-a' }, b: { id: 'tester-b' }, outsider: { id: 'outsider' } };
    let handler;
    let authCalls = 0;
    let roleReads = 0;
    const client = new Proxy({}, {
        get(_target, property) {
            if (property === 'auth') {
                return { getUser: async (token) => {
                        authCalls++;
                        if (options.authThrows)
                            throw new Error('Auth network failed');
                        return { data: { user: users[token] ?? null }, error: null };
                    } };
            }
            if (property === 'from') {
                return (table) => {
                    assert.equal(table, 'users');
                    return {
                        select: (columns) => {
                            assert.equal(columns, 'role,is_banned,banned_until');
                            return {
                                eq: (column, id) => {
                                    assert.equal(column, 'id');
                                    roleReads++;
                                    return {
                                        maybeSingle: async () => ({
                                            data: id === 'outsider'
                                                ? { role: 'teacher', is_banned: false, banned_until: null }
                                                : { role: 'student', is_banned: false, banned_until: null },
                                            error: null,
                                        }),
                                    };
                                },
                            };
                        },
                    };
                };
            }
            throw new Error(`Preview attempted forbidden client access: ${String(property)}`);
        },
    });
    const requireDependency = (specifier) => {
        if (specifier === './engine.ts')
            return engine;
        if (specifier === 'https://deno.land/std@0.224.0/http/server.ts') {
            return { serve: (value) => { handler = value; } };
        }
        if (specifier === 'https://esm.sh/@supabase/supabase-js@2.78.0') {
            return { createClient: () => client };
        }
        throw new Error(`Unexpected Edge import: ${specifier}`);
    };
    new Function('require', 'exports', 'Deno', 'crypto', 'fetch', compiled)(requireDependency, {}, { env: { get: (key) => env[key] } }, webcrypto, () => { throw new Error('Raw network access is forbidden in the practice handler'); });
    assert.ok(handler);
    return {
        authCalls: () => authCalls,
        roleReads: () => roleReads,
        request: (body, token = 'a', method = 'POST') => handler(new Request('https://example.invalid/commander_practice', {
            method, headers: token ? { Authorization: 'Bearer ' + token } : {},
            ...(method === 'POST' ? { body: JSON.stringify(body) } : {}),
        })),
    };
}
const signed = (payload) => {
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
    return `${body}.${createHmac('sha256', secret).update(body).digest('base64url')}`;
};
test('practice endpoint fails closed for missing setup, auth, and student permission', async () => {
    for (const env of [{ SUPABASE_SERVICE_ROLE_KEY: '' }, { COMMANDER_PREVIEW_SIGNING_SECRET: '' }]) {
        const api = setup({ env });
        assert.equal((await api.request({ action: 'start' })).status, 503);
        assert.equal(api.authCalls(), 0);
        assert.equal(api.roleReads(), 0);
    }
    const api = setup();
    for (const [token, status] of [[null, 401], ['invalid', 401], ['outsider', 403]]) {
        assert.equal((await api.request({ action: 'start' }, token)).status, status);
    }
    assert.equal((await setup({ authThrows: true }).request({ action: 'start' })).status, 401);
});
test('practice start performs one role lookup for an authenticated student', async () => {
    const api = setup();
    assert.equal((await api.request({ action: 'start' })).status, 200);
    assert.equal(api.authCalls(), 1);
    assert.equal(api.roleReads(), 1);
});
test('real practice HTTP flow signs turns, preserves expiry, and accesses auth plus one role lookup per request', async () => {
    const api = setup();
    const started = await api.request({ action: 'start' });
    assert.equal(started.status, 200);
    assert.equal(started.headers.get('cache-control'), 'no-store');
    const session = await started.json();
    assert.equal(session.practice, true);
    assert.equal(session.persistentWrites, false);
    assert.equal(session.battle.turn, 1);
    const response = await api.request({ action: 'turn', transcript: session.transcript, move: 'guard' });
    assert.equal(response.status, 200);
    const next = await response.json();
    assert.deepEqual(next.battle, engine.applyPracticeTurn(session.battle, { move: 'guard', targetId: null }));
    assert.equal(next.expiresAt, session.expiresAt);
    assert.notEqual(next.transcript, session.transcript);
    assert.equal(api.authCalls(), 2);
    assert.equal(api.roleReads(), 2);
});
test('practice rejects tampered, expired, malformed, and other-player transcripts', async () => {
    const api = setup();
    const session = await (await api.request({ action: 'start' })).json();
    const payload = JSON.parse(Buffer.from(session.transcript.split('.')[0], 'base64url').toString());
    const expired = signed({ ...payload, exp: Date.now() - 1000 });
    const tamperedBody = Buffer.from(JSON.stringify({ ...payload, state: { ...payload.state, turn: 10 } })).toString('base64url');
    for (const [transcript, token, status, error] of [
        [`${tamperedBody}.${session.transcript.split('.')[1]}`, 'a', 400, 'invalid_transcript_signature'],
        [expired, 'a', 401, 'transcript_expired'],
        [session.transcript, 'b', 400, 'invalid_transcript'],
        ['broken', 'a', 400, 'invalid_transcript'],
        ['x'.repeat(24001), 'a', 400, 'invalid_transcript'],
    ]) {
        const response = await api.request({ action: 'turn', transcript, move: 'guard' }, token);
        assert.equal(response.status, status);
        assert.equal((await response.json()).error, error);
    }
});
test('practice rejects invalid moves/targets and completed battles at the HTTP boundary', async () => {
    const api = setup();
    const session = await (await api.request({ action: 'start' })).json();
    for (const [move, targetId, expected] of [['reward', null, 'invalid_move'], ['death_bolt', 'player_commander', 'invalid_target']]) {
        const response = await api.request({ action: 'turn', transcript: session.transcript, move, targetId });
        assert.equal(response.status, 400);
        assert.equal((await response.json()).error, expected);
    }
    const completed = signed({ v: 1, sub: 'tester-a', exp: Date.now() + 60000, state: { ...engine.startPracticeBattle(1), status: 'victory' } });
    assert.equal((await api.request({ action: 'turn', transcript: completed, move: 'guard' })).status, 409);
    assert.equal((await api.request([], 'a')).status, 400);
    assert.equal((await api.request({ action: 'unknown' })).status, 400);
    assert.equal((await api.request(null, null, 'OPTIONS')).status, 204);
    assert.equal((await api.request(null, null, 'GET')).status, 405);
});
