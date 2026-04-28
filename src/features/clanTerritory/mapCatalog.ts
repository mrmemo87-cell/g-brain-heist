/**
 * Single source of truth for every playable territory map.
 * Both ClanTerritoryManager (UI) and other consumers derive their
 * per-map metadata from this catalog instead of duplicating values.
 */

/** Internal validation shape — keeps id as string so literal types are preserved by `as const`. */
type MapEntryShape = {
  readonly id: string;
  readonly category: "countries" | "blueprints";
  readonly label: string;
  readonly emoji: string;
  /** Short human-readable description shown in the map-selection card */
  readonly desc: string;
  /** Number of distinct zones / territories on this map */
  readonly zoneCount: number;
  /**
   * Present (and `true`) on maps whose SVG is bundled at build-time via Vite
   * `?raw` imports (default, city, usa).  Absent on maps fetched from /public/maps/.
   */
  readonly assetMap?: true;
};

export const MAP_REGISTRY = {
  countries: {
    default:       { id: 'default',       category: 'countries', emoji: '🗺️',  label: 'Default',         desc: 'Standard 8-zone battlefield',      zoneCount: 8,  assetMap: true as const },
    city:          { id: 'city',          category: 'countries', emoji: '🏙️',  label: 'City',            desc: 'Urban warfare, 10 districts',       zoneCount: 10, assetMap: true as const },
    kyrgyzstan:    { id: 'kyrgyzstan',    category: 'countries', emoji: '🇰🇬', label: 'Kyrgyzstan',      desc: 'Regional conquest, 7 oblasts',      zoneCount: 7  },
    usa:           { id: 'usa',           category: 'countries', emoji: '🇺🇸', label: 'USA',             desc: 'States + DC, 51 zones',             zoneCount: 51, assetMap: true as const },
    unitedkingdom: { id: 'unitedkingdom', category: 'countries', emoji: '🇬🇧', label: 'United Kingdom',  desc: 'UK regions + isles, 16 zones',      zoneCount: 16 },
    bahrain:       { id: 'bahrain',       category: 'countries', emoji: '🇧🇭', label: 'Bahrain',         desc: '5 governorates',                    zoneCount: 5  },
    belgium:       { id: 'belgium',       category: 'countries', emoji: '🇧🇪', label: 'Belgium',         desc: '11 provinces',                      zoneCount: 11 },
    china:         { id: 'china',         category: 'countries', emoji: '🇨🇳', label: 'China',           desc: '34 provinces & regions',            zoneCount: 34 },
    egypt:         { id: 'egypt',         category: 'countries', emoji: '🇪🇬', label: 'Egypt',           desc: '28 governorates',                   zoneCount: 28 },
    france:        { id: 'france',        category: 'countries', emoji: '🇫🇷', label: 'France',          desc: '22 historic regions',               zoneCount: 22 },
    indonesia:     { id: 'indonesia',     category: 'countries', emoji: '🇮🇩', label: 'Indonesia',       desc: '34 provinces',                      zoneCount: 34 },
    italy:         { id: 'italy',         category: 'countries', emoji: '🇮🇹', label: 'Italy',           desc: '19 regions',                        zoneCount: 19 },
    japan:         { id: 'japan',         category: 'countries', emoji: '🇯🇵', label: 'Japan',           desc: '47 prefectures',                    zoneCount: 47 },
    kazakhstan:    { id: 'kazakhstan',    category: 'countries', emoji: '🇰🇿', label: 'Kazakhstan',      desc: '14 regions',                        zoneCount: 14 },
    malaysia:      { id: 'malaysia',      category: 'countries', emoji: '🇲🇾', label: 'Malaysia',        desc: '14 states',                         zoneCount: 14 },
    netherlands:   { id: 'netherlands',   category: 'countries', emoji: '🇳🇱', label: 'Netherlands',     desc: '12 provinces',                      zoneCount: 12 },
    oman:          { id: 'oman',          category: 'countries', emoji: '🇴🇲', label: 'Oman',            desc: '11 governorates',                   zoneCount: 11 },
    qatar:         { id: 'qatar',         category: 'countries', emoji: '🇶🇦', label: 'Qatar',           desc: '7 municipalities',                  zoneCount: 7  },
    russia:        { id: 'russia',        category: 'countries', emoji: '🇷🇺', label: 'Russia',          desc: '83 federal subjects',               zoneCount: 83 },
    "saudi-arabia":{ id: 'saudi-arabia',  category: 'countries', emoji: '🇸🇦', label: 'Saudi Arabia',    desc: '13 regions',                        zoneCount: 13 },
    spain:         { id: 'spain',         category: 'countries', emoji: '🇪🇸', label: 'Spain',           desc: '17 autonomous communities',         zoneCount: 17 },
  },
  blueprints: {
    "blueprints/school_rooms": {
      id: "blueprints/school_rooms",
      category: "blueprints",
      emoji: "🏫",
      label: "School Rooms",
      desc: "School blueprint, 10 rooms",
      zoneCount: 10,
    },
  },
} as const satisfies {
  readonly countries: Record<string, MapEntryShape>;
  readonly blueprints: Record<string, MapEntryShape>;
};

export const MAP_CATALOG = [
  ...Object.values(MAP_REGISTRY.countries),
  ...Object.values(MAP_REGISTRY.blueprints),
] as const;

/** Union of every valid map id, derived directly from MAP_CATALOG so it never drifts. */
export type MapId = (typeof MAP_CATALOG)[number]['id'];

/** Full entry type inferred from the catalog (includes literal id types). */
export type MapEntry = (typeof MAP_CATALOG)[number];

/** Lookup table: mapId → zone count.  Derived from MAP_CATALOG so it never drifts. */
export const MAP_ZONE_COUNTS = Object.fromEntries(
  MAP_CATALOG.map((e) => [e.id, e.zoneCount])
) as Record<MapId, number>;
