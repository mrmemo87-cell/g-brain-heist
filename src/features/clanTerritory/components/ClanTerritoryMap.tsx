import React, { ReactNode, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

// @ts-expect-error - Vite raw SVG imports
import territoryMapSvgRaw from "../assets/territory_map.svg?raw";
import { MAP_CATALOG } from "../mapCatalog";

// Lazy maps (loaded via Vite dynamic import)
let cityMapSvgRaw = "";
let usaMapSvgRaw = "";

// Cache for country maps fetched from /maps/*.svg at runtime
const publicMapCache: Record<string, string> = {};

// IDs of maps served from /public/maps/ — derived from MAP_CATALOG so the list
// never drifts from the catalog.  Asset-loaded maps (default, city, usa) are excluded.
// Typed as Set<string> so .has(mapId) accepts a plain string argument.
const PUBLIC_MAP_IDS = new Set<string>(
  MAP_CATALOG.filter((m) => !(m as { assetMap?: true }).assetMap).map((m) => m.id)
);

import { ClanId, ClanMetadata, ZoneId, ZoneState } from "../clanTerritoryTypes";
import { getClanColor } from "../../../utils/clanColors";

type MapConfig = {
  svg: string;
  zoneToRegion: Record<ZoneId, string | string[]>;
  regionAliases: Record<string, string[]>;
  maxZones?: number;
};

const MAP_CONFIGS: Record<string, MapConfig> = {
  default: {
    svg: territoryMapSvgRaw,
    zoneToRegion: {
      "zone-1": "region_5",
      "zone-2": "region_7",
      "zone-3": "region_6",
      "zone-4": "region_4",
      "zone-5": "region_8",
      "zone-6": "region_3",
      "zone-7": "region_2",
      "zone-8": "region_1",
    },
    regionAliases: {
      region_1: ["signalchamber"],
      region_2: ["quantumnexus", "regio_2"],
    },
  },
  city: {
    svg: cityMapSvgRaw,
    maxZones: 10,
    zoneToRegion: {
      "zone-1": "district_1",
      "zone-2": "district_2",
      "zone-3": "district_3",
      "zone-4": "district_4",
      "zone-5": "district_5",
      "zone-6": "district_6",
      "zone-7": "district_7",
      "zone-8": "district_8",
      "zone-9": "district_9",
      "zone-10": "district_10",
    },
    regionAliases: {},
  },
  kyrgyzstan: {
    svg: "", // fetched from /maps/kyrgyzstan.svg
    maxZones: 7,
    zoneToRegion: {
      "zone-1": "KG-B", // Batken
      "zone-2": "KG-C", // Chuy
      "zone-3": "KG-J", // Jalal-Abad
      "zone-4": "KG-N", // Naryn
      "zone-5": "KG-O", // Osh
      "zone-6": "KG-T", // Talas
      "zone-7": "KG-Y", // Ysyk-Köl
    },
    regionAliases: {},
  },
  unitedkingdom: {
    svg: "", // fetched from /maps/unitedkingdom.svg
    maxZones: 16,
    zoneToRegion: {
      "zone-1": "zone-1",
      "zone-2": "zone-2",
      "zone-3": "zone-3",
      "zone-4": "zone-4",
      "zone-5": "zone-5",
      "zone-6": "zone-6",
      "zone-7": "zone-7",
      "zone-8": "zone-8",
      "zone-9": "zone-9",
      "zone-10": "zone-10",
      "zone-11": "zone-11",
      "zone-12": "zone-12",
      "zone-13": "zone-13",
      "zone-14": "zone-14",
      "zone-15": "zone-15",
      "zone-16": "zone-16",
    },
    regionAliases: {},
  },
  // ── Country maps (SVG fetched from /maps/*.svg) ──────────────────────────
  bahrain: {
    svg: "",
    maxZones: 5,
    zoneToRegion: {
      "zone-1": "BH-13", "zone-2": "BH-14", "zone-3": "BH-15",
      "zone-4": "BH-16", "zone-5": "BH-17",
    },
    regionAliases: {},
  },
  belgium: {
    svg: "",
    maxZones: 11,
    zoneToRegion: {
      "zone-1": "BE-VAN", "zone-2": "BE-WBR", "zone-3": "BE-BRU",
      "zone-4": "BE-WHT", "zone-5": "BE-WLG", "zone-6": "BE-VLI",
      "zone-7": "BE-WLX", "zone-8": "BE-WNA", "zone-9": "BE-VOV",
      "zone-10": "BE-VBR", "zone-11": "BE-VWV",
    },
    regionAliases: {},
  },
  china: {
    svg: "",
    maxZones: 34,
    zoneToRegion: {
      "zone-1": "CN-34",  "zone-2": "CN-11",  "zone-3": "CN-50",
      "zone-4": "CN-35",  "zone-5": "CN-44",  "zone-6": "CN-62",
      "zone-7": "CN-45",  "zone-8": "CN-52",  "zone-9": "CN-46",
      "zone-10": "CN-13", "zone-11": "CN-41", "zone-12": "CN-91",
      "zone-13": "CN-23", "zone-14": "CN-43", "zone-15": "CN-42",
      "zone-16": "CN-22", "zone-17": "CN-32", "zone-18": "CN-36",
      "zone-19": "CN-21", "zone-20": "CN-92", "zone-21": "CN-15",
      "zone-22": "CN-64", "zone-23": "CN-63", "zone-24": "CN-61",
      "zone-25": "CN-51", "zone-26": "CN-37", "zone-27": "CN-31",
      "zone-28": "CN-14", "zone-29": "CN-12", "zone-30": "CN-71",
      "zone-31": "CN-65", "zone-32": "CN-54", "zone-33": "CN-53",
      "zone-34": "CN-33",
    },
    regionAliases: {},
  },
  egypt: {
    svg: "",
    maxZones: 28,
    zoneToRegion: {
      "zone-1":  "EG-ALX", "zone-2":  "EG-ASN", "zone-3":  "EG-AST",
      "zone-4":  "EG-BA",  "zone-5":  "EG-BH",  "zone-6":  "EG-BNS",
      "zone-7":  "EG-C",   "zone-8":  "EG-DK",  "zone-9":  "EG-DT",
      "zone-10": "EG-FYM", "zone-11": "EG-GH",  "zone-12": "EG-GZ",
      "zone-13": "EG-IS",  "zone-14": "EG-JS",  "zone-15": "EG-KB",
      "zone-16": "EG-KFS", "zone-17": "EG-KN",  "zone-18": "EG-LX",
      "zone-19": "EG-MN",  "zone-20": "EG-MNF", "zone-21": "EG-MT",
      "zone-22": "EG-PTS", "zone-23": "EG-SHG", "zone-24": "EG-SHR",
      "zone-25": "EG-SIN", "zone-26": "EG-TER", "zone-27": "EG-SUZ",
      "zone-28": "EG-WAD",
    },
    regionAliases: {},
  },
  france: {
    svg: "",
    maxZones: 22,
    zoneToRegion: {
      "zone-1": "FR-A",  "zone-2": "FR-B",  "zone-3": "FR-C",
      "zone-4": "FR-D",  "zone-5": "FR-E",  "zone-6": "FR-F",
      "zone-7": "FR-G",  "zone-8": "FR-H",  "zone-9": "FR-I",
      "zone-10": "FR-J", "zone-11": "FR-K", "zone-12": "FR-L",
      "zone-13": "FR-M", "zone-14": "FR-N", "zone-15": "FR-O",
      "zone-16": "FR-P", "zone-17": "FR-Q", "zone-18": "FR-R",
      "zone-19": "FR-S", "zone-20": "FR-T", "zone-21": "FR-U",
      "zone-22": "FR-V",
    },
    regionAliases: {},
  },
  indonesia: {
    svg: "",
    maxZones: 34,
    zoneToRegion: {
      "zone-1": "ID-AC",  "zone-2": "ID-BA",  "zone-3": "ID-BB",
      "zone-4": "ID-BE",  "zone-5": "ID-BT",  "zone-6": "ID-GO",
      "zone-7": "ID-JA",  "zone-8": "ID-JB",  "zone-9": "ID-JI",
      "zone-10": "ID-JK", "zone-11": "ID-JT", "zone-12": "ID-KB",
      "zone-13": "ID-KI", "zone-14": "ID-KR", "zone-15": "ID-KS",
      "zone-16": "ID-KT", "zone-17": "ID-KU", "zone-18": "ID-LA",
      "zone-19": "ID-MA", "zone-20": "ID-MU", "zone-21": "ID-NB",
      "zone-22": "ID-NT", "zone-23": "ID-PA", "zone-24": "ID-PB",
      "zone-25": "ID-RI", "zone-26": "ID-SA", "zone-27": "ID-SB",
      "zone-28": "ID-SG", "zone-29": "ID-SN", "zone-30": "ID-SR",
      "zone-31": "ID-SS", "zone-32": "ID-ST", "zone-33": "ID-SU",
      "zone-34": "ID-YO",
    },
    regionAliases: {},
  },
  italy: {
    svg: "",
    maxZones: 19,
    zoneToRegion: {
      "zone-1": "IT-77",  "zone-2": "IT-78",  "zone-3": "IT-72",
      "zone-4": "IT-45",  "zone-5": "IT-36",  "zone-6": "IT-62",
      "zone-7": "IT-42",  "zone-8": "IT-25",  "zone-9": "IT-57",
      "zone-10": "IT-67", "zone-11": "IT-21", "zone-12": "IT-75",
      "zone-13": "IT-88", "zone-14": "IT-82", "zone-15": "IT-52",
      "zone-16": "IT-32", "zone-17": "IT-55", "zone-18": "IT-23",
      "zone-19": "IT-34",
    },
    regionAliases: {},
  },
  japan: {
    svg: "",
    maxZones: 47,
    zoneToRegion: {
      "zone-1": "JP-23",  "zone-2": "JP-05",  "zone-3": "JP-02",
      "zone-4": "JP-12",  "zone-5": "JP-38",  "zone-6": "JP-18",
      "zone-7": "JP-40",  "zone-8": "JP-07",  "zone-9": "JP-21",
      "zone-10": "JP-10", "zone-11": "JP-28", "zone-12": "JP-01",
      "zone-13": "JP-34", "zone-14": "JP-08", "zone-15": "JP-17",
      "zone-16": "JP-03", "zone-17": "JP-39", "zone-18": "JP-37",
      "zone-19": "JP-43", "zone-20": "JP-14", "zone-21": "JP-46",
      "zone-22": "JP-26", "zone-23": "JP-24", "zone-24": "JP-04",
      "zone-25": "JP-45", "zone-26": "JP-15", "zone-27": "JP-20",
      "zone-28": "JP-29", "zone-29": "JP-42", "zone-30": "JP-47",
      "zone-31": "JP-27", "zone-32": "JP-33", "zone-33": "JP-44",
      "zone-34": "JP-41", "zone-35": "JP-25", "zone-36": "JP-32",
      "zone-37": "JP-11", "zone-38": "JP-22", "zone-39": "JP-09",
      "zone-40": "JP-13", "zone-41": "JP-36", "zone-42": "JP-31",
      "zone-43": "JP-16", "zone-44": "JP-30", "zone-45": "JP-35",
      "zone-46": "JP-19", "zone-47": "JP-06",
    },
    regionAliases: {},
  },
  kazakhstan: {
    svg: "",
    maxZones: 14,
    zoneToRegion: {
      "zone-1": "KZ-AKM", "zone-2": "KZ-AKT",  "zone-3": "KZ-ALM",
      "zone-4": "KZ-ATY", "zone-5": "KZ-KAR",  "zone-6": "KZ-KUS",
      "zone-7": "KZ-KZY", "zone-8": "KZ-MAN",  "zone-9": "KZ-PAV",
      "zone-10": "KZ-SEV","zone-11": "KZ-VOS", "zone-12": "KZ-YUZ",
      "zone-13": "KZ-ZAP","zone-14": "KZ-ZHA",
    },
    regionAliases: {},
  },
  malaysia: {
    svg: "",
    maxZones: 14,
    zoneToRegion: {
      "zone-1": "MY-01",  "zone-2": "MY-02",  "zone-3": "MY-03",
      "zone-4": "MY-04",  "zone-5": "MY-05",  "zone-6": "MY-06",
      "zone-7": "MY-07",  "zone-8": "MY-08",  "zone-9": "MY-09",
      "zone-10": "MY-10", "zone-11": "MY-11", "zone-12": "MY-12",
      "zone-13": "MY-13", "zone-14": "MY-15",
    },
    regionAliases: {},
  },
  netherlands: {
    svg: "",
    maxZones: 12,
    zoneToRegion: {
      "zone-1": "NL-DR",  "zone-2": "NL-FL",  "zone-3": "NL-FR",
      "zone-4": "NL-GE",  "zone-5": "NL-GR",  "zone-6": "NL-LI",
      "zone-7": "NL-NB",  "zone-8": "NL-NH",  "zone-9": "NL-OV",
      "zone-10": "NL-UT", "zone-11": "NL-ZE", "zone-12": "NL-ZH",
    },
    regionAliases: {},
  },
  oman: {
    svg: "",
    maxZones: 11,
    zoneToRegion: {
      "zone-1": "OM-BAN",  "zone-2": "OM-BAS",  "zone-3": "OM-BU",
      "zone-4": "OM-DA",   "zone-5": "OM-MA",   "zone-6": "OM-MU",
      "zone-7": "OM-SHN",  "zone-8": "OM-SHS",  "zone-9": "OM-WU",
      "zone-10": "OM-ZA",  "zone-11": "OM-ZU",
    },
    regionAliases: {},
  },
  qatar: {
    svg: "",
    maxZones: 7,
    zoneToRegion: {
      "zone-1": "QA-DA", "zone-2": "QA-KH", "zone-3": "QA-MS",
      "zone-4": "QA-RA", "zone-5": "QA-US", "zone-6": "QA-WA",
      "zone-7": "QA-ZA",
    },
    regionAliases: {},
  },
  russia: {
    svg: "",
    maxZones: 83,
    zoneToRegion: {
      "zone-1":  "RU-AD",  "zone-2":  "RU-ALT", "zone-3":  "RU-AMU",
      "zone-4":  "RU-ARK", "zone-5":  "RU-AST", "zone-6":  "RU-BA",
      "zone-7":  "RU-BEL", "zone-8":  "RU-BRY", "zone-9":  "RU-BU",
      "zone-10": "RU-CE",  "zone-11": "RU-CHE", "zone-12": "RU-CHU",
      "zone-13": "RU-CU",  "zone-14": "RU-DA",  "zone-15": "RU-AL",
      "zone-16": "RU-IN",  "zone-17": "RU-IRK", "zone-18": "RU-IVA",
      "zone-19": "RU-KB",  "zone-20": "RU-KC",  "zone-21": "RU-KDA",
      "zone-22": "RU-KEM", "zone-23": "RU-KLU", "zone-24": "RU-KHA",
      "zone-25": "RU-KR",  "zone-26": "RU-KK",  "zone-27": "RU-KL",
      "zone-28": "RU-KHM", "zone-29": "RU-KGD", "zone-30": "RU-KO",
      "zone-31": "RU-KAM", "zone-32": "RU-KRS", "zone-33": "RU-KOS",
      "zone-34": "RU-KGN", "zone-35": "RU-KIR", "zone-36": "RU-KYA",
      "zone-37": "RU-LEN", "zone-38": "RU-LIP", "zone-39": "RU-MOW",
      "zone-40": "RU-ME",  "zone-41": "RU-MAG", "zone-42": "RU-MUR",
      "zone-43": "RU-MO",  "zone-44": "RU-MOS", "zone-45": "RU-NGR",
      "zone-46": "RU-NEN", "zone-47": "RU-SE",  "zone-48": "RU-NVS",
      "zone-49": "RU-NIZ", "zone-50": "RU-ORE", "zone-51": "RU-ORL",
      "zone-52": "RU-OMS", "zone-53": "RU-PER", "zone-54": "RU-PRI",
      "zone-55": "RU-PSK", "zone-56": "RU-PNZ", "zone-57": "RU-ROS",
      "zone-58": "RU-RYA", "zone-59": "RU-SAM", "zone-60": "RU-SA",
      "zone-61": "RU-SAK", "zone-62": "RU-SMO", "zone-63": "RU-SPE",
      "zone-64": "RU-SAR", "zone-65": "RU-STA", "zone-66": "RU-SVE",
      "zone-67": "RU-TAM", "zone-68": "RU-TOM", "zone-69": "RU-TUL",
      "zone-70": "RU-TA",  "zone-71": "RU-TY",  "zone-72": "RU-TVE",
      "zone-73": "RU-TYU", "zone-74": "RU-UD",  "zone-75": "RU-ULY",
      "zone-76": "RU-VGG", "zone-77": "RU-VLA", "zone-78": "RU-YAN",
      "zone-79": "RU-VLG", "zone-80": "RU-VOR", "zone-81": "RU-YAR",
      "zone-82": "RU-YEV", "zone-83": "RU-ZAB",
    },
    regionAliases: {},
  },
  "saudi-arabia": {
    svg: "",
    maxZones: 13,
    zoneToRegion: {
      "zone-1": "SA-01",  "zone-2": "SA-02",  "zone-3": "SA-03",
      "zone-4": "SA-04",  "zone-5": "SA-05",  "zone-6": "SA-06",
      "zone-7": "SA-07",  "zone-8": "SA-08",  "zone-9": "SA-09",
      "zone-10": "SA-10", "zone-11": "SA-11", "zone-12": "SA-12",
      "zone-13": "SA-14",
    },
    regionAliases: {},
  },
  spain: {
    svg: "",
    maxZones: 17,
    zoneToRegion: {
      "zone-1": "ES-AN",  "zone-2": "ES-AR",  "zone-3": "ES-AS",
      "zone-4": "ES-CB",  "zone-5": "ES-CL",  "zone-6": "ES-CM",
      "zone-7": "ES-CN",  "zone-8": "ES-CT",  "zone-9": "ES-EX",
      "zone-10": "ES-GA", "zone-11": "ES-RI", "zone-12": "ES-MD",
      "zone-13": "ES-MC", "zone-14": "ES-NC", "zone-15": "ES-IB",
      "zone-16": "ES-PV", "zone-17": "ES-VC",
    },
    regionAliases: {},
  },
  usa: {
    svg: usaMapSvgRaw,
    maxZones: 51,
    zoneToRegion: {
      "zone-1": "zone-1",
      "zone-2": "zone-2",
      "zone-3": "zone-3",
      "zone-4": "zone-4",
      "zone-5": "zone-5",
      "zone-6": "zone-6",
      "zone-7": "zone-7",
      "zone-8": "zone-8",
      "zone-9": "zone-9",
      "zone-10": "zone-10",
      "zone-11": "zone-11",
      "zone-12": "zone-12",
      "zone-13": "zone-13",
      "zone-14": "zone-14",
      "zone-15": "zone-15",
      "zone-16": "zone-16",
      "zone-17": "zone-17",
      "zone-18": "zone-18",
      "zone-19": "zone-19",
      "zone-20": "zone-20",
      "zone-21": "zone-21",
      "zone-22": "zone-22",
      "zone-23": "zone-23",
      "zone-24": "zone-24",
      "zone-25": "zone-25",
      "zone-26": "zone-26",
      "zone-27": "zone-27",
      "zone-28": "zone-28",
      "zone-29": "zone-29",
      "zone-30": "zone-30",
      "zone-31": "zone-31",
      "zone-32": "zone-32",
      "zone-33": "zone-33",
      "zone-34": "zone-34",
      "zone-35": "zone-35",
      "zone-36": "zone-36",
      "zone-37": "zone-37",
      "zone-38": "zone-38",
      "zone-39": "zone-39",
      "zone-40": "zone-40",
      "zone-41": "zone-41",
      "zone-42": "zone-42",
      "zone-43": "zone-43",
      "zone-44": "zone-44",
      "zone-45": "zone-45",
      "zone-46": "zone-46",
      "zone-47": "zone-47",
      "zone-48": "zone-48",
      "zone-49": "zone-49",
      "zone-50": "zone-50",
      "zone-51": "zone-51",
    },
    regionAliases: {},
  },
};

const NEUTRAL_TERRITORY_SHADE = "#1f2937";
const NEUTRAL_TERRITORY_STROKE = "#475569";

const getZoneControl = (
  state: ZoneState | undefined
): { clanId: ClanId | null; contested: boolean } => {
  if (!state) return { clanId: null, contested: false };

  // Legacy support
  const legacyClanId = (state as ZoneState & { clanId?: ClanId | null }).clanId;
  if (legacyClanId) return { clanId: legacyClanId, contested: false };

  const entries = Object.entries(state.influence || {}).filter(([, v]) => v > 0);
  if (entries.length === 0) return { clanId: null, contested: false };

  entries.sort((a, b) => b[1] - a[1]);
  const [leader, leaderScore] = entries[0];
  const runnerUp = entries[1];

  const contested =
    !!runnerUp && Math.abs(leaderScore - runnerUp[1]) / Math.max(leaderScore, 1) <= 0.1;

  return { clanId: (leader as ClanId) ?? null, contested };
};

const adjustViewBoxToContent = (svgEl: SVGSVGElement) => {
  const safeBBox = (el: SVGGraphicsElement) => {
    try {
      const b = el.getBBox();
      if (b && b.width > 0 && b.height > 0) return b;
    } catch {
      // getBBox can throw before paint
    }
    return null;
  };

  try {
    const graphics = Array.from(
      svgEl.querySelectorAll<SVGGraphicsElement>(
        "path, rect, circle, ellipse, polygon, polyline, line, image, use, g"
      )
    );

    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;

    for (const element of graphics) {
      const b = safeBBox(element);
      if (!b) continue;

      minX = Math.min(minX, b.x);
      minY = Math.min(minY, b.y);
      maxX = Math.max(maxX, b.x + b.width);
      maxY = Math.max(maxY, b.y + b.height);
    }

    if (!Number.isFinite(minX) || !Number.isFinite(minY)) return null;

    const padding = 8;
    const viewBox = [
      minX - padding,
      minY - padding,
      maxX - minX + padding * 2,
      maxY - minY + padding * 2,
    ].join(" ");

    svgEl.setAttribute("viewBox", viewBox);
    svgEl.setAttribute("preserveAspectRatio", "xMidYMid meet");
    return viewBox;
  } catch (e) {
    console.warn("[ClanTerritoryMap] adjustViewBoxToContent failed", e);
    return null;
  }
};

export type ClanTerritoryMapProps = {
  zones: Record<ZoneId, ZoneState>;
  clans: Record<ClanId, ClanMetadata>;
  hideHeader?: boolean;
  hideLegend?: boolean;
  overlay?: ReactNode;
  mapId?: string;
};

export const ClanTerritoryMap: React.FC<ClanTerritoryMapProps> = ({
  zones,
  clans,
  hideHeader = false,
  hideLegend = false,
  overlay,
  mapId = "default",
}) => {
  const [cityLoaded, setCityLoaded] = useState(false);
  const [usaLoaded, setUsaLoaded] = useState(false);
  // Version counter that increments whenever a public country map finishes loading
  const [publicMapVersion, setPublicMapVersion] = useState(0);
  // Non-null when the most recent fetch for the current mapId failed
  const [publicMapLoadError, setPublicMapLoadError] = useState<string | null>(null);

  // Lazy-load city map
  useEffect(() => {
    if (mapId !== "city") return;
    if (cityMapSvgRaw) {
      setCityLoaded(true);
      return;
    }
    import("../assets/city_map.svg?raw")
      .then((m) => {
        cityMapSvgRaw = m.default;
        setCityLoaded(true);
      })
      .catch((e) => console.error("Failed to load city map:", e));
  }, [mapId]);

  // Lazy-load USA map (from assets)
  useEffect(() => {
    if (mapId !== "usa") return;
    if (usaMapSvgRaw) {
      setUsaLoaded(true);
      return;
    }
    import("../assets/USA.svg?raw")
      .then((m) => {
        usaMapSvgRaw = m.default;
        setUsaLoaded(true);
      })
      .catch((e) => console.error("Failed to load USA map:", e));
  }, [mapId]);

  // Fetch any country map SVG from /maps/*.svg (all maps in public/maps/)
  // publicMapVersion in deps makes Retry (which increments it) trigger a refetch.
  useEffect(() => {
    if (!PUBLIC_MAP_IDS.has(mapId)) {
      // Switched away from a public-map — clear any stale error immediately
      setPublicMapLoadError(null);
      return;
    }

    if (publicMapCache[mapId]) {
      // Already cached — just clear any stale error; useMemo reads the cache directly.
      // Do NOT touch publicMapVersion here: it is a dep of this effect, so calling
      // setPublicMapVersion here would re-trigger the effect and cause an infinite loop.
      setPublicMapLoadError(null);
      return;
    }

    const controller = new AbortController();
    // Abort the fetch after 10 s so hung requests don't block the UI indefinitely.
    let timeoutTriggered = false;
    const timeoutId = setTimeout(() => { timeoutTriggered = true; controller.abort(); }, 10_000);

    setPublicMapLoadError(null);
    fetch(`/maps/${mapId}.svg`, { signal: controller.signal })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.text();
      })
      .then((svg) => {
        clearTimeout(timeoutId);
        if (controller.signal.aborted) {
          if (timeoutTriggered) setPublicMapLoadError(`Could not load map "${mapId}" (timeout)`);
          return;
        }

        // Sanitize the SVG before caching to prevent XSS via malicious content.
        const parser = new DOMParser();
        const doc = parser.parseFromString(svg, "image/svg+xml");
        if (doc.querySelector("parsererror")) {
          setPublicMapLoadError(`Could not load map "${mapId}" (invalid SVG)`);
          return;
        }
        const root = doc.documentElement;
        if (
          root.localName.toLowerCase() !== "svg" ||
          root.namespaceURI !== "http://www.w3.org/2000/svg"
        ) {
          setPublicMapLoadError(`Could not load map "${mapId}" (invalid root element)`);
          return;
        }
        // Remove elements that can execute code.
        doc.querySelectorAll("script, foreignObject, iframe, object, embed").forEach((el) => { el.remove(); });
        // Remove event-handler attributes and javascript: URIs.
        doc.querySelectorAll("*").forEach((el) => {
          for (const attr of Array.from(el.attributes)) {
            if (/^on/i.test(attr.name)) {
              el.removeAttribute(attr.name);
            } else if (
              (attr.name === "href" || attr.name === "xlink:href" || attr.name === "src") &&
              /^\s*javascript:/i.test(attr.value)
            ) {
              el.removeAttribute(attr.name);
            }
          }
        });
        const sanitized = new XMLSerializer().serializeToString(doc.documentElement);
        if (!sanitized) {
          setPublicMapLoadError(`Could not load map "${mapId}" (sanitization produced empty output)`);
          return;
        }

        publicMapCache[mapId] = sanitized;
        setPublicMapLoadError(null);
        setPublicMapVersion((v) => v + 1);
      })
      .catch((e) => {
        clearTimeout(timeoutId);
        if ((e instanceof DOMException && e.name === 'AbortError') || controller.signal.aborted) {
          if (timeoutTriggered) setPublicMapLoadError(`Could not load map "${mapId}" (timeout)`);
          return;
        }
        // Remove any partial/stale entry so a retry triggers a fresh fetch
        delete publicMapCache[mapId];
        const msg = e instanceof Error ? e.message : String(e);
        console.error(`[ClanTerritoryMap] Failed to load /maps/${mapId}.svg:`, msg);
        setPublicMapLoadError(`Could not load map "${mapId}" (${msg})`);
      });

    return () => {
      clearTimeout(timeoutId);
      controller.abort();
    };
  // publicMapVersion is intentionally included so Retry (which increments it) triggers a refetch
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapId, publicMapVersion]);

  const mapConfig = useMemo(() => {
    let cfg = MAP_CONFIGS[mapId] || MAP_CONFIGS.default;

    if (mapId === "city") cfg = { ...cfg, svg: cityMapSvgRaw || cfg.svg };
    else if (mapId === "usa") cfg = { ...cfg, svg: usaMapSvgRaw || cfg.svg };
    else if (PUBLIC_MAP_IDS.has(mapId)) cfg = { ...cfg, svg: publicMapCache[mapId] || cfg.svg };

    return cfg;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapId, cityLoaded, usaLoaded, publicMapVersion]);

  // True when the loaded SVG actually contains at least one expected zone element.
  // False means the SVG is a placeholder (no geographic paths), so we show an overlay.
  const svgHasZones = useMemo(() => {
    const svgContent = mapConfig.svg;
    if (!svgContent) return false;
    
    // Collect all expected region IDs from both zoneToRegion and regionAliases
    const zoneIds = (Object.values(mapConfig.zoneToRegion) as Array<string | string[]>).flat();
    const aliasIds = Object.keys(mapConfig.regionAliases || {});
    const expandedAliasIds = Object.values(mapConfig.regionAliases || {}).flat();
    const allIds = new Set([...zoneIds, ...aliasIds, ...expandedAliasIds]);
    
    // Check if SVG contains any of these IDs
    return Array.from(allIds).some((id) => svgContent.includes(`id="${id}"`));
  }, [mapConfig]);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  const lastStyleKeyRef = useRef<Record<string, string>>({});

  // IMPORTANT: inject SVG ONLY when svg changes (prevents style wipe)
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const svgText = mapConfig.svg || "";
    container.innerHTML = svgText;

    const svg = container.querySelector("svg") as SVGSVGElement | null;
    svgRef.current = svg;

    lastStyleKeyRef.current = {};

    if (!svg) return;

    // Make SVG fit container
    svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
    svg.setAttribute("width", "100%");
    svg.setAttribute("height", "100%");
    svg.style.width = "100%";
    svg.style.height = "100%";
    svg.style.display = "block";

    // Normalize viewBox after paint (double RAF + retry)
    const normalize = () => {
      const ok = adjustViewBoxToContent(svg);
      if (!ok) setTimeout(() => adjustViewBoxToContent(svg), 50);
    };
    requestAnimationFrame(() => requestAnimationFrame(normalize));
  }, [mapConfig.svg, mapId]);

  // Re-normalize viewBox when container size changes (fixes iOS "blank until interaction")
  useEffect(() => {
    const container = containerRef.current;
    const svg = svgRef.current;
    if (!container || !svg) return;

    let raf1 = 0;
    let raf2 = 0;

    const normalize = () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);

      raf1 = requestAnimationFrame(() => {
        raf2 = requestAnimationFrame(() => {
          const ok = adjustViewBoxToContent(svg);
          if (!ok) setTimeout(() => adjustViewBoxToContent(svg), 50);
        });
      });
    };

    // run once immediately
    normalize();

    // run whenever container size changes (address bar collapse, flex resize, etc.)
    const ro = new ResizeObserver(() => normalize());
    ro.observe(container);

    // run when returning to tab / phone wakes up
    const onVis = () => {
      if (!document.hidden) normalize();
    };

    window.addEventListener("resize", normalize, { passive: true });
    window.addEventListener("orientationchange", normalize, { passive: true });
    document.addEventListener("visibilitychange", onVis);

    return () => {
      ro.disconnect();
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
      window.removeEventListener("resize", normalize);
      window.removeEventListener("orientationchange", normalize);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [mapConfig.svg, mapId]);

  // Apply colors based on zones/clans without re-injecting SVG
  useLayoutEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;

    const zoneToRegion = mapConfig.zoneToRegion;

    const paint = (
      el: SVGElement,
      fill: string,
      stroke: string,
      strokeWidth: string,
      opacity: number,
      filter: string
    ) => {
      // Remove SVG classes that bring their own fill
      el.removeAttribute("class");

      // Force style with !important so nothing in <style> can override it
      el.style.setProperty("fill", fill, "important");
      el.style.setProperty("stroke", stroke, "important");
      el.style.setProperty("stroke-width", strokeWidth, "important");
      el.style.setProperty("opacity", String(opacity), "important");
      el.style.setProperty("fill-opacity", String(opacity), "important");
      el.style.setProperty("filter", filter || "none", "important");

      // Also set attributes (helps some SVGs / browsers)
      el.setAttribute("fill", fill);
      el.setAttribute("stroke", stroke);
      el.setAttribute("stroke-width", strokeWidth);
      el.setAttribute("opacity", String(opacity));
      el.setAttribute("fill-opacity", String(opacity));
    };

    const applyDashArray = (el: SVGElement, dashArray: string) => {
      if (!dashArray) {
        el.style.removeProperty("stroke-dasharray");
        el.removeAttribute("stroke-dasharray");
        return;
      }
      el.style.setProperty("stroke-dasharray", dashArray, "important");
      el.setAttribute("stroke-dasharray", dashArray);
    };

    Object.entries(zoneToRegion).forEach(([zoneId, regionIds]) => {
      const state = zones[zoneId as ZoneId];
      const { clanId, contested } = getZoneControl(state);
      const clan = clanId ? clans[clanId] : null;
      const clanColor = clanId ? (clan?.color ?? getClanColor(clanId)) : null;

      let fill = NEUTRAL_TERRITORY_SHADE;
      let stroke = NEUTRAL_TERRITORY_STROKE;
      let strokeWidth = "2";
      let opacity = 0.85;
      let dashArray = "";

      if (clanColor) {
        fill = clanColor;
        stroke = clanColor;
        strokeWidth = contested ? "4" : "3";
        opacity = contested ? 0.92 : 0.88;
        dashArray = contested ? "8 6" : "";
      }

      const filter = clanColor ? `drop-shadow(0 0 ${contested ? 16 : 10}px ${stroke})` : "";

      const baseList = Array.isArray(regionIds) ? regionIds : [regionIds];
      const expandedIds = baseList.flatMap((rid) => [rid, ...(mapConfig.regionAliases[rid] ?? [])]);

      expandedIds.forEach((rid) => {
        const styleKey = `${fill}|${stroke}|${strokeWidth}|${opacity}|${dashArray}|${filter}`;
        if (lastStyleKeyRef.current[rid] === styleKey) return;
        lastStyleKeyRef.current[rid] = styleKey;

        const region = svg.querySelector<SVGElement>(`#${CSS.escape(rid)}`);
        if (!region) return;

        region.removeAttribute("class");

        if (region.tagName.toLowerCase() === "g") {
          region
            .querySelectorAll<SVGElement>(
              "path, rect, circle, ellipse, polygon, polyline, line"
            )
            .forEach((child) => {
              paint(child, fill, stroke, strokeWidth, opacity, filter);
              applyDashArray(child, dashArray);
            });
        } else {
          paint(region, fill, stroke, strokeWidth, opacity, filter);
          applyDashArray(region, dashArray);
        }
      });
    });
  }, [zones, clans, mapId, mapConfig]);

  const clanEntries = Object.values(clans);
  const maxLegendEntries = 6;
  const visibleClans = clanEntries.slice(0, maxLegendEntries);
  const hiddenClanCount = Math.max(0, clanEntries.length - visibleClans.length);

  return (
    <div className="relative bg-gradient-to-br from-slate-950 via-slate-900 to-black w-full rounded-2xl border border-slate-800 overflow-hidden">
      {!hideHeader && (
        <div className="px-4 pt-4 pb-2">
          <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400">
            Territory Control
          </h3>
        </div>
      )}

      {/* Fetch-error banner with Retry for public country maps */}
      {publicMapLoadError && PUBLIC_MAP_IDS.has(mapId) && (
        <div className="mx-4 mb-2 flex items-center justify-between gap-3 rounded-xl border border-rose-500/40 bg-rose-900/30 px-4 py-3">
          <span className="text-sm text-rose-300">{publicMapLoadError}</span>
          <button
            type="button"
            onClick={() => {
              // Wipe error + cached entry to force a fresh fetch on next effect run
              delete publicMapCache[mapId];
              setPublicMapLoadError(null);
              setPublicMapVersion((v) => v + 1);
            }}
            className="shrink-0 rounded-lg border border-rose-500/50 bg-rose-800/50 px-3 py-1 text-xs font-bold text-rose-200 transition hover:bg-rose-700/60"
          >
            Retry
          </button>
        </div>
      )}

      {/* Flat map container: no zoom/pan transforms */}
      <div className="relative w-full overflow-hidden aspect-[4/3] max-h-[55svh] sm:max-h-[70vh]">
        <div ref={containerRef} className="w-full h-full" />
        {/* Overlay when the SVG loaded but contains no recognisable zone paths */}
        {!publicMapLoadError && PUBLIC_MAP_IDS.has(mapId) && mapConfig.svg && !svgHasZones && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900/80 z-20 pointer-events-none">
            <span className="text-4xl mb-3">🚧</span>
            <p className="text-slate-200 font-semibold text-sm">Map coming soon</p>
            <p className="text-slate-500 text-xs mt-1">Zone data is not yet available for this map</p>
          </div>
        )}
      </div>

      {!hideLegend && (
        <div className="absolute top-4 right-4 bg-slate-900/90 backdrop-blur rounded-xl border border-slate-700 p-3 space-y-2 max-h-60 w-44 overflow-y-auto z-10">
          <h4 className="text-xs font-bold text-white uppercase tracking-wide">
            Active Clans
          </h4>
          {visibleClans.map((clan) => (
            <div key={clan.id} className="flex items-center gap-2 text-xs">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: clan.color }} />
              <span className="text-white font-semibold">{clan.name}</span>
            </div>
          ))}
          {hiddenClanCount > 0 && (
            <div className="text-[11px] text-slate-400 font-semibold">
              +{hiddenClanCount} more clans
            </div>
          )}
        </div>
      )}

      {overlay}
    </div>
  );
};
