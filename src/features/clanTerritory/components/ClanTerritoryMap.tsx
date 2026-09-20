import React from "react";
import {
  ClanTerritoryMap as LegacyClanTerritoryMap,
  type ClanTerritoryMapProps as LegacyClanTerritoryMapProps,
} from "./LegacyClanTerritoryMap";
import { NeonMegacityShaderMap } from "./NeonMegacityShaderMap";

export type ClanTerritoryMapProps = LegacyClanTerritoryMapProps & {
  containerClassName?: string;
  showControls?: boolean;
};

export const ClanTerritoryMap: React.FC<ClanTerritoryMapProps> = (props) => {
  if (props.mapId === "city") {
    return (
      <NeonMegacityShaderMap
        zones={props.zones}
        clans={props.clans}
        hideHeader={props.hideHeader}
        hideLegend={props.hideLegend}
        overlay={props.overlay}
        selectedZoneId={props.selectedZoneId}
        onZoneSelect={props.onZoneSelect}
        containerClassName={props.containerClassName}
      />
    );
  }

  const { containerClassName: _containerClassName, showControls: _showControls, ...legacyProps } = props;
  return <LegacyClanTerritoryMap {...legacyProps} />;
};
