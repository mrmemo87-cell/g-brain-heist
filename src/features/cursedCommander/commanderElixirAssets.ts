import bastion30Art from "../../assets/Elixir/Bastion Elixir — 30 min.png";
import omni30Art from "../../assets/Elixir/Commander : Omni Elixir — 30 min.png";
import force30Art from "../../assets/Elixir/Force Elixir — 30 min.png";
import bastion60Art from "../../assets/Elixir/Greater Bastion — 60 min.png";
import force60Art from "../../assets/Elixir/Greater Force — 60 min.png";
import reflex60Art from "../../assets/Elixir/Greater Reflex — 60 min.png";
import vitality60Art from "../../assets/Elixir/Greater Vitality — 60 min.png";
import reflex30Art from "../../assets/Elixir/Reflex Elixir — 30 min.png";
import vitality30Art from "../../assets/Elixir/Vitality Elixir — 30 min.png";

export const COMMANDER_ELIXIR_CATALOG_IDS = [
  "force_30",
  "force_60",
  "defense_30",
  "defense_60",
  "dexterity_30",
  "dexterity_60",
  "stamina_30",
  "stamina_60",
  "omni_30",
] as const;

export type CommanderElixirCatalogId = (typeof COMMANDER_ELIXIR_CATALOG_IDS)[number];

export const COMMANDER_ELIXIR_ART: Record<CommanderElixirCatalogId, string> = {
  force_30: force30Art,
  force_60: force60Art,
  defense_30: bastion30Art,
  defense_60: bastion60Art,
  dexterity_30: reflex30Art,
  dexterity_60: reflex60Art,
  stamina_30: vitality30Art,
  stamina_60: vitality60Art,
  omni_30: omni30Art,
};

export const getCommanderElixirArt = (elixirId: string): string | null => {
  if (!Object.prototype.hasOwnProperty.call(COMMANDER_ELIXIR_ART, elixirId)) return null;
  return COMMANDER_ELIXIR_ART[elixirId as CommanderElixirCatalogId];
};
