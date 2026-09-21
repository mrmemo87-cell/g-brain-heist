import { readFileSync, writeFileSync } from "node:fs";

const path = "src/features/clanTerritory/components/ClanTerritoryStudentView.tsx";
let source = readFileSync(path, "utf8");

const importNeedle = 'import { ClanTerritoryMap } from "./ClanTerritoryMap";';
const importLine = 'import { NeonMegacityV6StudentExperience } from "./NeonMegacityV6StudentExperience";';
if (!source.includes(importLine)) {
  if (!source.includes(importNeedle)) throw new Error("ClanTerritoryMap import anchor not found");
  source = source.replace(importNeedle, `${importNeedle}\n${importLine}`);
}

const marker = "  // 2. Active Phase - Zone Selection\n";
const exactExperienceBlock = `  // City map: keep the approved V6 shader-lab interaction as the actual ACTIVE experience.\n  // The map never collapses into the legacy card picker/combat split: clicking a district\n  // immediately retargets the player, the map stays live, and questions resolve in the V6 side rail.\n  if (gameState.phase === "ACTIVE" && (gameState.mapId || "default") === "city" && !hasStickyDebrief) {\n    return (\n      <NeonMegacityV6StudentExperience\n        gameState={gameState}\n        player={hydratedPlayer}\n        clans={clansWithColors}\n        selectedZoneId={effectiveZoneId}\n        currentQuestion={currentQuestion}\n        shuffledAnswers={shuffledAnswers}\n        feedback={feedback}\n        onSelectZone={(zoneId) => {\n          applyLocalZoneOverride(zoneId);\n          onSelectZone(zoneId);\n        }}\n        onAnswer={handleAnswerClick}\n      />\n    );\n  }\n\n`;

if (!source.includes("<NeonMegacityV6StudentExperience")) {
  if (!source.includes(marker)) throw new Error("ACTIVE zone-selection anchor not found");
  source = source.replace(marker, exactExperienceBlock + marker);
}

writeFileSync(path, source);
