import React, { Suspense, useMemo } from 'react';
import type { ConquestClass } from '../../src/lib/classConquest';

// Borrowed from Clan Wars: the same Kyrgyzstan oblast map, loaded only when needed.
const ClanTerritoryMap = React.lazy(() =>
  import('../../src/features/clanTerritory/components/ClanTerritoryMap').then((m) => ({ default: m.ClanTerritoryMap })),
);

interface ConquestMapProps {
  classes: ConquestClass[];
  owners: Record<string, string | null>;
  colors: Record<string, string>;
  label: string;
}

const ConquestMap: React.FC<ConquestMapProps> = ({ classes, owners, colors, label }) => {
  const zones = useMemo(() => Object.fromEntries(Object.entries(owners).map(([zoneId, owner]) => [
    zoneId, { id: zoneId, influence: owner ? { [owner]: 1 } : {} },
  ])), [owners]);
  const clans = useMemo(() => Object.fromEntries(classes.map((c) => [
    c.class_id, { id: c.class_id, name: c.label, color: colors[c.class_id] },
  ])), [classes, colors]);

  return (
    <div className="conquest-map" role="img" aria-label={label}>
      <Suspense fallback={<div className="conquest-map-loading" aria-hidden="true" />}>
        <ClanTerritoryMap mapId="kyrgyzstan" zones={zones} clans={clans} hideHeader hideLegend />
      </Suspense>
    </div>
  );
};

export default ConquestMap;
