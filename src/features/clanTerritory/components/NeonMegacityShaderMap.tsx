import React, { ReactNode } from "react";
import type { ClanId, ClanMetadata, ZoneId, ZoneState } from "../clanTerritoryTypes";
import { ExactNeonMegacityV6 } from "./ExactNeonMegacityV6";

export type NeonMegacityShaderMapProps = {
  zones: Record<ZoneId, ZoneState>;
  clans: Record<ClanId, ClanMetadata>;
  hideHeader?: boolean;
  hideLegend?: boolean;
  overlay?: ReactNode;
  selectedZoneId?: ZoneId | null;
  onZoneSelect?: (zoneId: ZoneId) => void;
  containerClassName?: string;
};

export const NeonMegacityShaderMap: React.FC<NeonMegacityShaderMapProps> = ({
  zones,
  clans,
  overlay,
  selectedZoneId = null,
  onZoneSelect,
  containerClassName = "",
}) => (
  <div className="relative w-full">
    <ExactNeonMegacityV6
      zones={zones}
      clans={clans}
      selectedZoneId={selectedZoneId}
      onZoneSelect={onZoneSelect}
      className={containerClassName}
    />
    {overlay}
  </div>
);
