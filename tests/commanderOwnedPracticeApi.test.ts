import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { webcrypto } from "node:crypto";
import ts from "typescript";
import * as engine from "../supabase/functions/commander_practice/engine";
const source = ts.transpileModule(
  readFileSync("supabase/functions/commander_practice/index.ts", "utf8"),
  {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  },
).outputText;
const owned = () => ({
  version: 1,
  profileVersion: 3,
  hp: 92,
  shield: 12,
  bolt: 32,
  focus: 9,
  guard: 18,
  shieldCap: 30,
  weaponName: "Rift Blade",
  shieldName: "Aegis Shield",
  units: [
    { id: "player_guard", name: "Neon Bulwark", hp: 82, shield: 10, attack: 5 },
    {
      id: "player_archer",
      name: "Shade Archer",
      hp: 54,
      shield: 0,
      attack: 10,
    },
  ],
});
function setup(
  options: { unavailable?: boolean; banned?: boolean; role?: string } = {},
) {
  let handler: ((request: Request) => Promise<Response>) | undefined;
  const calls: Array<{ name: string; args: unknown }> = [];
  const client = {
    auth: {
      getUser: async (token: string) => ({
        data: { user: token === "valid" ? { id: "student-a" } : null },
        error: null,
      }),
    },
    from: (table: string) => {
      assert.equal(table, "users");
      return {
        select: () => ({
          eq: (_column: string, id: string) => {
            assert.equal(id, "student-a");
            return {
              maybeSingle: async () => ({
                data: {
                  role: options.role ?? "student",
                  is_banned: options.banned ?? false,
                  banned_until: null,
                },
                error: null,
              }),
            };
          },
        }),
      };
    },
    rpc: async (name: string, args: unknown) => {
      calls.push({ name, args });
      return {
        data: options.unavailable ? null : owned(),
        error: options.unavailable ? { message: "missing" } : null,
      };
    },
  };
  const requireDependency = (specifier: string) => {
    if (specifier === "./engine.ts") return engine;
    if (specifier.includes("http/server.ts"))
      return {
        serve: (h: typeof handler) => {
          handler = h;
        },
      };
    if (specifier.includes("supabase-js"))
      return { createClient: () => client };
    throw Error(specifier);
  };
  new Function("require", "exports", "Deno", "crypto", source)(
    requireDependency,
    {},
    {
      env: {
        get: (key: string) =>
          (
            ({
              SUPABASE_URL: "https://test.invalid",
              SUPABASE_SERVICE_ROLE_KEY: "test",
              COMMANDER_PREVIEW_SIGNING_SECRET:
                "test-owned-loadout-secret-over-thirty-two-characters",
            }) as Record<string, string>
          )[key],
      },
    },
    webcrypto,
  );
  return {
    calls,
    request: (body: unknown, token = "valid") =>
      handler!(
        new Request("https://test.invalid", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: JSON.stringify(body),
        }),
      ),
  };
}
test("owned practice fetches only the verified student army and ignores forged browser stats", async () => {
  const api = setup();
  const response = await api.request({
    action: "start",
    loadout: "owned",
    user_id: "other-student",
    hp: 999999,
    units: [],
  });
  assert.equal(response.status, 200);
  const session = await response.json();
  assert.deepEqual(api.calls, [
    { name: "rpc_commander_owned_loadout", args: { p_user_id: "student-a" } },
  ]);
  assert.equal(session.battle.combatants[0].maxHp, 92);
  assert.equal(session.battle.playerTactics.bolt, 32);
  assert.equal(session.battle.loadoutVersion, 3);
  const next = await (
    await api.request({
      action: "turn",
      transcript: session.transcript,
      move: "guard",
    })
  ).json();
  assert.equal(next.battle.combatants[0].maxHp, 92);
  assert.equal(next.expiresAt, session.expiresAt);
  assert.equal(api.calls.length, 1, "loadout stays frozen during turns");
});
test("owned practice fails closed when the owned loadout is unavailable", async () => {
  const api = setup({ unavailable: true });
  const response = await api.request({ action: "start", loadout: "owned" });
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error, "commander_loadout_unavailable");
});
test("fixed practice remains independent of headquarters availability", async () => {
  const api = setup({ unavailable: true });
  const response = await api.request({ action: "start" });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).battle.combatants[0].maxHp, 100);
  assert.equal(api.calls.length, 0);
});
test("owned practice denies non-students, banned students, and invalid tokens before loading an army", async () => {
  for (const options of [{ role: "teacher" }, { banned: true }]) {
    const api = setup(options);
    assert.equal(
      (await api.request({ action: "start", loadout: "owned" })).status,
      403,
    );
    assert.equal(api.calls.length, 0);
  }
  const api = setup();
  assert.equal(
    (await api.request({ action: "start", loadout: "owned" }, "invalid"))
      .status,
    401,
  );
  assert.equal(api.calls.length, 0);
});
