import { readFileSync, writeFileSync } from 'node:fs';

const path = 'src/features/cursedCommander/CommanderHeadquarters.tsx';
let source = readFileSync(path, 'utf8');

const replaceOnce = (needle, replacement, label) => {
  if (source.includes(replacement)) return;
  if (!source.includes(needle)) throw new Error(`Commander elixir materializer could not find ${label}`);
  source = source.replace(needle, replacement);
};

replaceOnce(
  'import CommanderCatalogCards from "./CommanderCatalogCards";\n',
  'import CommanderCatalogCards from "./CommanderCatalogCards";\nimport CommanderElixirsPanel from "./CommanderElixirsPanel";\n',
  'CommanderCatalogCards import',
);

replaceOnce(
  'type Tab = "overview" | "army" | "armory" | "training" | "records";',
  'type Tab = "overview" | "army" | "armory" | "training" | "supplies" | "records";',
  'Tab type',
);

replaceOnce(
  '  ["training", "Training"],\n  ["records", "Records"],',
  '  ["training", "Training"],\n  ["supplies", "Supplies"],\n  ["records", "Records"],',
  'Commander tabs',
);

replaceOnce(
  `  if (tab === "training") {\n    return (\n      <svg viewBox="0 0 24 24" aria-hidden>\n        <path d="M5 18 18 5M11 5h7v7" />\n        <path d="M5 12v6h6" />\n      </svg>\n    );\n  }\n  return (`,
  `  if (tab === "training") {\n    return (\n      <svg viewBox="0 0 24 24" aria-hidden>\n        <path d="M5 18 18 5M11 5h7v7" />\n        <path d="M5 12v6h6" />\n      </svg>\n    );\n  }\n  if (tab === "supplies") {\n    return (\n      <svg viewBox="0 0 24 24" aria-hidden>\n        <path d="M9 3h6M10 3v6l-5 8c-1 2 .4 4 2.8 4h8.4c2.4 0 3.8-2 2.8-4l-5-8V3" />\n        <path d="M7.5 15h9" />\n      </svg>\n    );\n  }\n  return (`,
  'Supplies icon branch',
);

replaceOnce(
  '                <span>{format(coins)} Coins</span>\n',
  '                <span>{tab === "supplies" ? "Gemstones only" : `${format(coins)} Coins`}</span>\n',
  'subpage currency label',
);

replaceOnce(
  `                {tab === "records" && (\n`,
  `                {tab === "supplies" && (\n                  <CommanderElixirsPanel disabled={unavailable || !p} />\n                )}\n\n                {tab === "records" && (\n`,
  'Supplies content slot',
);

replaceOnce(
  '            <span>Practice is safe · Player Battles record the result · Unit development and Formation Command are server-authoritative · No Commander PvP Coin or account XP transfer.</span>',
  '            <span>Practice is safe · Player Battles record the result · Unit development, Formation Command, and Elixirs are server-authoritative · No Commander PvP Coin or account XP transfer.</span>',
  'Commander footer authority copy',
);

writeFileSync(path, source);
console.log('Commander Supplies navigation materialized.');
