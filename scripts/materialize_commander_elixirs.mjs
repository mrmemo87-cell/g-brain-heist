import { readFileSync, writeFileSync } from 'node:fs';

const replaceIn = (input, needle, replacement, label) => {
  if (input.includes(replacement)) return input;
  if (!input.includes(needle)) throw new Error(`Commander elixir materializer could not find ${label}`);
  return input.replace(needle, replacement);
};

const path = 'src/features/cursedCommander/CommanderHeadquarters.tsx';
let source = readFileSync(path, 'utf8');
source = replaceIn(source, 'import CommanderCatalogCards from "./CommanderCatalogCards";\n', 'import CommanderCatalogCards from "./CommanderCatalogCards";\nimport CommanderElixirsPanel from "./CommanderElixirsPanel";\n', 'CommanderCatalogCards import');
source = replaceIn(source, 'type Tab = "overview" | "army" | "armory" | "training" | "records";', 'type Tab = "overview" | "army" | "armory" | "training" | "supplies" | "records";', 'Tab type');
source = replaceIn(source, '  ["training", "Training"],\n  ["records", "Records"],', '  ["training", "Training"],\n  ["supplies", "Supplies"],\n  ["records", "Records"],', 'Commander tabs');
source = replaceIn(source, `  if (tab === "training") {\n    return (\n      <svg viewBox="0 0 24 24" aria-hidden>\n        <path d="M5 18 18 5M11 5h7v7" />\n        <path d="M5 12v6h6" />\n      </svg>\n    );\n  }\n  return (`, `  if (tab === "training") {\n    return (\n      <svg viewBox="0 0 24 24" aria-hidden>\n        <path d="M5 18 18 5M11 5h7v7" />\n        <path d="M5 12v6h6" />\n      </svg>\n    );\n  }\n  if (tab === "supplies") {\n    return (\n      <svg viewBox="0 0 24 24" aria-hidden>\n        <path d="M9 3h6M10 3v6l-5 8c-1 2 .4 4 2.8 4h8.4c2.4 0 3.8-2 2.8-4l-5-8V3" />\n        <path d="M7.5 15h9" />\n      </svg>\n    );\n  }\n  return (`, 'Supplies icon branch');
source = replaceIn(source, '                <span>{format(coins)} Coins</span>\n', '                <span>{tab === "supplies" ? "Gemstones only" : `${format(coins)} Coins`}</span>\n', 'subpage currency label');
source = replaceIn(source, `                {tab === "records" && (\n`, `                {tab === "supplies" && (\n                  <CommanderElixirsPanel disabled={unavailable || !p} />\n                )}\n\n                {tab === "records" && (\n`, 'Supplies content slot');
source = replaceIn(source, '            <span>Practice is safe · Player Battles record the result · Unit development and Formation Command are server-authoritative · No Commander PvP Coin or account XP transfer.</span>', '            <span>Practice is safe · Player Battles record the result · Unit development, Formation Command, and Elixirs are server-authoritative · No Commander PvP Coin or account XP transfer.</span>', 'Commander footer authority copy');
writeFileSync(path, source);

const cssPath = 'src/features/cursedCommander/commanderHeadquartersCommandCenter.css';
let css = readFileSync(cssPath, 'utf8');
if (!css.includes('grid-template-columns: repeat(6, minmax(0, 1fr));')) {
  const oldNav = 'grid-template-columns: repeat(5, minmax(0, 1fr));';
  if (!css.includes(oldNav)) throw new Error('Commander elixir materializer could not find desktop nav columns');
  css = css.replace(oldNav, 'grid-template-columns: repeat(6, minmax(0, 1fr));');
  writeFileSync(cssPath, css);
}

const pvpServicePath = 'services/commanderPvpService.ts';
let pvpService = readFileSync(pvpServicePath, 'utf8');
pvpService = replaceIn(pvpService, 'export type CommanderPvpTarget = {', `export type CommanderPvpElixir = {\n  id: string;\n  name: string;\n  statKey: 'force' | 'defense' | 'dexterity' | 'stamina' | 'omni';\n  boostRanks: number;\n  expiresAt: string;\n};\n\nexport type CommanderPvpTarget = {`, 'PvP elixir type');
pvpService = replaceIn(pvpService, '  archer_school: string;\n  last_attacked_at: string | null;', '  archer_school: string;\n  active_elixir: CommanderPvpElixir | null;\n  last_attacked_at: string | null;', 'PvP target elixir field');
pvpService = replaceIn(pvpService, '  opponent_level: number;\n  created_at: string;', '  opponent_level: number;\n  opponent_elixir: CommanderPvpElixir | null;\n  created_at: string;', 'PvP active battle elixir field');
writeFileSync(pvpServicePath, pvpService);

const pvpLobbyPath = 'src/features/cursedCommander/CommanderPvpLobby.tsx';
let pvpLobby = readFileSync(pvpLobbyPath, 'utf8');
pvpLobby = replaceIn(pvpLobby, `                    <span className="rounded-full border border-slate-700 bg-slate-950/60 px-3 py-1.5 font-bold text-slate-300">Commander Level {lobby.activeBattle.opponent_level}</span>\n                    <span className="rounded-full border border-amber-300/25 bg-amber-300/10 px-3 py-1.5 font-black text-amber-200">Time remaining · {formatRemaining(activeRemainingMs)}</span>`, `                    <span className="rounded-full border border-slate-700 bg-slate-950/60 px-3 py-1.5 font-bold text-slate-300">Commander Level {lobby.activeBattle.opponent_level}</span>\n                    {lobby.activeBattle.opponent_elixir && (\n                      <span className="rounded-full border border-fuchsia-300/30 bg-fuchsia-300/10 px-3 py-1.5 font-black text-fuchsia-100">\n                        ⚗ Frozen boost · {lobby.activeBattle.opponent_elixir.name} · +{lobby.activeBattle.opponent_elixir.boostRanks} {lobby.activeBattle.opponent_elixir.statKey === 'omni' ? 'ALL SKILLS' : lobby.activeBattle.opponent_elixir.statKey.toUpperCase()}\n                      </span>\n                    )}\n                    <span className="rounded-full border border-amber-300/25 bg-amber-300/10 px-3 py-1.5 font-black text-amber-200">Time remaining · {formatRemaining(activeRemainingMs)}</span>`, 'active PvP elixir badge');
pvpLobby = replaceIn(pvpLobby, `                    </div>\n\n                    <button\n                      type="button"\n                      disabled={cooldown || Boolean(lobby?.activeBattle)}`, `                    </div>\n\n                    {target.active_elixir && (\n                      <div className="mt-2 rounded-xl border border-fuchsia-300/25 bg-fuchsia-400/[0.07] px-3 py-2">\n                        <span className="block text-[9px] font-black tracking-[0.12em] text-fuchsia-300">ACTIVE COMBAT ELIXIR</span>\n                        <strong className="mt-1 block text-xs text-fuchsia-50">⚗ {target.active_elixir.name} · +{target.active_elixir.boostRanks} {target.active_elixir.statKey === 'omni' ? 'ALL SKILLS' : target.active_elixir.statKey.toUpperCase()}</strong>\n                      </div>\n                    )}\n\n                    <button\n                      type="button"\n                      disabled={cooldown || Boolean(lobby?.activeBattle)}`, 'target PvP elixir badge');
writeFileSync(pvpLobbyPath, pvpLobby);

const pvpArenaPath = 'src/features/cursedCommander/CommanderPvpArena.tsx';
let pvpArena = readFileSync(pvpArenaPath, 'utf8');
pvpArena = replaceIn(pvpArena, "import CommanderCinematicBattlefield, { type CommanderPlaybackPhase } from './CommanderCinematicBattlefield';\n", "import CommanderCinematicBattlefield, { type CommanderPlaybackPhase } from './CommanderCinematicBattlefield';\nimport CommanderPvpElixirStatus from './CommanderPvpElixirStatus';\n", 'PvP elixir status import');
pvpArena = replaceIn(pvpArena, `      const [next] = await Promise.all([\n        launch.battleId\n          ? resumeCommanderPvp(launch.battleId, controller.signal)\n          : startCommanderPvp(launch.userId, controller.signal),\n        preloadCommanderSpriteAssets(),\n        preloadCommanderAudio(),\n      ]);`, `      const next = await (launch.battleId\n        ? resumeCommanderPvp(launch.battleId, controller.signal)\n        : startCommanderPvp(launch.userId, controller.signal));\n      // Asset warming is best-effort. Never hold battle entry behind mobile image decode/network latency.\n      void preloadCommanderSpriteAssets();\n      void preloadCommanderAudio();`, 'non-blocking PvP asset warmup');
pvpArena = replaceIn(pvpArena, `{session && <p className="rounded-xl border border-cyan-400/20 bg-cyan-400/5 px-3 py-2 text-xs text-cyan-100">Battle ID {session.battleId.slice(0, 8)} · Defender snapshot locked when this battle started · Equipment changes apply to your next battle.</p>}\n\n          {assetsReady`, `{session && <p className="rounded-xl border border-cyan-400/20 bg-cyan-400/5 px-3 py-2 text-xs text-cyan-100">Battle ID {session.battleId.slice(0, 8)} · Defender snapshot locked when this battle started · Equipment changes apply to your next battle.</p>}\n          {session && <CommanderPvpElixirStatus battleId={session.battleId} />}\n\n          {assetsReady`, 'PvP frozen elixir status');
writeFileSync(pvpArenaPath, pvpArena);

console.log('Commander Supplies navigation, resilient PvP assets, and elixir visibility materialized.');
