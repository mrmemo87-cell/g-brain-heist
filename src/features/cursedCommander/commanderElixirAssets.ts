import bastion30 from "../../assets/Elixir/Bastion Elixir — 30 min.png";
import commanderOmni30 from "../../assets/Elixir/Commander : Omni Elixir — 30 min.png";
import force30 from "../../assets/Elixir/Force Elixir — 30 min.png";
import greaterBastion60 from "../../assets/Elixir/Greater Bastion — 60 min.png";
import greaterForce60 from "../../assets/Elixir/Greater Force — 60 min.png";
import greaterReflex60 from "../../assets/Elixir/Greater Reflex — 60 min.png";
import greaterVitality60 from "../../assets/Elixir/Greater Vitality — 60 min.png";
import reflex30 from "../../assets/Elixir/Reflex Elixir — 30 min.png";
import vitality30 from "../../assets/Elixir/Vitality Elixir — 30 min.png";

export const COMMANDER_ELIXIR_ART = {
  force_30: force30,
  force_60: greaterForce60,
  defense_30: bastion30,
  defense_60: greaterBastion60,
  dexterity_30: reflex30,
  dexterity_60: greaterReflex60,
  stamina_30: vitality30,
  stamina_60: greaterVitality60,
  omni_30: commanderOmni30,
} as const;

export type CommanderElixirArtId = keyof typeof COMMANDER_ELIXIR_ART;

export const getCommanderElixirArt = (id: string): string | undefined =>
  COMMANDER_ELIXIR_ART[id as CommanderElixirArtId];
