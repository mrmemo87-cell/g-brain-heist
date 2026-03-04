/**
 * Single source of truth for every playable territory map.
 * Both ClanTerritoryManager (UI) and other consumers derive their
 * per-map metadata from this catalog instead of duplicating values.
 */

export type MapEntry = {
  id: string;
  label: string;
  emoji: string;
  /** Short human-readable description shown in the map-selection card */
  desc: string;
  /** Number of distinct zones / territories on this map */
  zoneCount: number;
};

export const MAP_CATALOG: readonly MapEntry[] = [
  { id: 'default',       emoji: '🗺️',  label: 'Default',         desc: 'Standard 8-zone battlefield',      zoneCount: 8  },
  { id: 'city',          emoji: '🏙️',  label: 'City',            desc: 'Urban warfare, 10 districts',       zoneCount: 10 },
  { id: 'kyrgyzstan',    emoji: '🇰🇬', label: 'Kyrgyzstan',      desc: 'Regional conquest, 7 oblasts',      zoneCount: 7  },
  { id: 'usa',           emoji: '🇺🇸', label: 'USA',             desc: 'States + DC, 51 zones',             zoneCount: 51 },
  { id: 'unitedkingdom', emoji: '🇬🇧', label: 'United Kingdom',  desc: 'UK regions + isles, 16 zones',      zoneCount: 16 },
  { id: 'bahrain',       emoji: '🇧🇭', label: 'Bahrain',         desc: '5 governorates',                    zoneCount: 5  },
  { id: 'belgium',       emoji: '🇧🇪', label: 'Belgium',         desc: '11 provinces',                      zoneCount: 11 },
  { id: 'china',         emoji: '🇨🇳', label: 'China',           desc: '34 provinces & regions',            zoneCount: 34 },
  { id: 'egypt',         emoji: '🇪🇬', label: 'Egypt',           desc: '28 governorates',                   zoneCount: 28 },
  { id: 'france',        emoji: '🇫🇷', label: 'France',          desc: '22 historic regions',               zoneCount: 22 },
  { id: 'indonesia',     emoji: '🇮🇩', label: 'Indonesia',       desc: '34 provinces',                      zoneCount: 34 },
  { id: 'italy',         emoji: '🇮🇹', label: 'Italy',           desc: '19 regions',                        zoneCount: 19 },
  { id: 'japan',         emoji: '🇯🇵', label: 'Japan',           desc: '47 prefectures',                    zoneCount: 47 },
  { id: 'kazakhstan',    emoji: '🇰🇿', label: 'Kazakhstan',      desc: '14 regions',                        zoneCount: 14 },
  { id: 'malaysia',      emoji: '🇲🇾', label: 'Malaysia',        desc: '14 states',                         zoneCount: 14 },
  { id: 'netherlands',   emoji: '🇳🇱', label: 'Netherlands',     desc: '12 provinces',                      zoneCount: 12 },
  { id: 'oman',          emoji: '🇴🇲', label: 'Oman',            desc: '11 governorates',                   zoneCount: 11 },
  { id: 'qatar',         emoji: '🇶🇦', label: 'Qatar',           desc: '7 municipalities',                  zoneCount: 7  },
  { id: 'russia',        emoji: '🇷🇺', label: 'Russia',          desc: '83 federal subjects',               zoneCount: 83 },
  { id: 'saudi-arabia',  emoji: '🇸🇦', label: 'Saudi Arabia',    desc: '13 regions',                        zoneCount: 13 },
  { id: 'spain',         emoji: '🇪🇸', label: 'Spain',           desc: '17 autonomous communities',         zoneCount: 17 },
];

/** Lookup table: mapId → zone count.  Derived from MAP_CATALOG so it never drifts. */
export const MAP_ZONE_COUNTS: Record<string, number> = Object.fromEntries(
  MAP_CATALOG.map((e) => [e.id, e.zoneCount])
);
