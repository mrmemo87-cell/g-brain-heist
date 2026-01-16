import React, { ReactNode, useEffect, useRef, useState } from "react";
// @ts-expect-error - Vite injects raw SVG strings for ?raw imports
import territoryMapSvgRaw from "../assets/territory_map.svg?raw";
// @ts-expect-error - Kyrgyzstan map is much smaller and commonly used
import kyrgyzstanMapSvgRaw from "../assets/kyrgyzstanHigh.svg?raw";
// City map is 2.7MB - don't import eagerly to avoid startup lag
let cityMapSvgRaw = "";
// USA map is served from public and loaded on demand
let usaMapSvgRaw = "";

import {
  ClanId,
  ClanMetadata,
  ZoneId,
  ZoneState,
} from "../clanTerritoryTypes";

// Map configurations for different map layouts
type MapConfig = {
  svg: string;
  zoneToRegion: Record<ZoneId, string | string[]>;
  regionAliases: Record<string, string[]>;
  maxZones?: number; // Optional: specify how many zones this map has
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
    svg: kyrgyzstanMapSvgRaw,
    maxZones: 7,
    zoneToRegion: {
      "zone-1": "KG-B", // Batken
      "zone-2": "KG-C", // Chü (Chuy)
      "zone-3": "KG-J", // Jalal-Abad
      "zone-4": "KG-N", // Naryn
      "zone-5": "KG-O", // Osh
      "zone-6": "KG-T", // Talas
      "zone-7": "KG-Y", // Ysyk-Köl
    },
    regionAliases: {},
  },
  usa: {
    svg: usaMapSvgRaw,
    maxZones: 51,
    zoneToRegion: {
      "zone-1": "US-AL",
      "zone-2": "US-AK",
      "zone-3": "US-AZ",
      "zone-4": "US-AR",
      "zone-5": "US-CA",
      "zone-6": "US-CO",
      "zone-7": "US-CT",
      "zone-8": "US-DE",
      "zone-9": "US-FL",
      "zone-10": "US-GA",
      "zone-11": "US-HI",
      "zone-12": "US-ID",
      "zone-13": "US-IL",
      "zone-14": "US-IN",
      "zone-15": "US-IA",
      "zone-16": "US-KS",
      "zone-17": "US-KY",
      "zone-18": "US-LA",
      "zone-19": "US-ME",
      "zone-20": "US-MD",
      "zone-21": "US-MA",
      "zone-22": "US-MI",
      "zone-23": "US-MN",
      "zone-24": "US-MS",
      "zone-25": "US-MO",
      "zone-26": "US-MT",
      "zone-27": "US-NE",
      "zone-28": "US-NV",
      "zone-29": "US-NH",
      "zone-30": "US-NJ",
      "zone-31": "US-NM",
      "zone-32": "US-NY",
      "zone-33": "US-NC",
      "zone-34": "US-ND",
      "zone-35": "US-OH",
      "zone-36": "US-OK",
      "zone-37": "US-OR",
      "zone-38": "US-PA",
      "zone-39": "US-RI",
      "zone-40": "US-SC",
      "zone-41": "US-SD",
      "zone-42": "US-TN",
      "zone-43": "US-TX",
      "zone-44": "US-UT",
      "zone-45": "US-VT",
      "zone-46": "US-VA",
      "zone-47": "US-WA",
      "zone-48": "US-WV",
      "zone-49": "US-WI",
      "zone-50": "US-WY",
      "zone-51": "US-DC",
    },
    regionAliases: {
      "US-DC": ["DC", "District of Columbia"],
    },
  },
};

// Neutral territory visuals
const NEUTRAL_TERRITORY_SHADE = "#1f2937";
const NEUTRAL_TERRITORY_STROKE = "#475569";

const getZoneControl = (
  state: ZoneState | undefined
): { clanId: ClanId | null; contested: boolean } => {
  if (!state) {
    return { clanId: null, contested: false };
  }

  const legacyClanId = (state as ZoneState & { clanId?: ClanId | null }).clanId;
  if (legacyClanId) {
    return { clanId: legacyClanId, contested: false };
  }

  const entries = Object.entries(state.influence || {}).filter(([, value]) => value > 0);
  if (entries.length === 0) {
    return { clanId: null, contested: false };
  }

  entries.sort((a, b) => b[1] - a[1]);
  const [leader, leaderScore] = entries[0];
  const runnerUp = entries[1];
  if (!leader) {
    return { clanId: null, contested: false };
  }

  const contested =
    !!runnerUp &&
    Math.abs(leaderScore - runnerUp[1]) / Math.max(leaderScore, 1) <= 0.1;

  return { clanId: leader as ClanId, contested };
};

const adjustViewBoxToContent = (svgEl: SVGSVGElement) => {
  const safeBBox = (el: SVGGraphicsElement) => {
    try {
      const b = el.getBBox();
      if (b && b.width > 0 && b.height > 0) return b;
    } catch {
      // getBBox can throw if element isn't rendered yet
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

    // Keep fit behavior even if SVG had something else originally
    if (!svgEl.getAttribute("preserveAspectRatio")) {
      svgEl.setAttribute("preserveAspectRatio", "xMidYMid meet");
    }

    return viewBox;
  } catch (error) {
    console.warn("[ClanTerritoryMap] Failed to adjust viewBox", error);
  }

  return null;
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
  const [cityMapLoaded, setCityMapLoaded] = useState(false);
  const [usaMapLoaded, setUsaMapLoaded] = useState(false);
  const clanEntries = Object.values(clans);
  const maxLegendEntries = 6;
  const visibleClans = clanEntries.slice(0, maxLegendEntries);
  const hiddenClanCount = Math.max(0, clanEntries.length - visibleClans.length);

  // Lazy-load the large city map (2.7MB) on first use to prevent startup lag
  useEffect(() => {
    if (mapId !== "city") return;
    if (cityMapSvgRaw) {
      if (!cityMapLoaded) setCityMapLoaded(true);
      return;
    }
    if (!cityMapLoaded) {
      import("../assets/city_map.svg?raw")
        .then((module) => {
          cityMapSvgRaw = module.default;
          setCityMapLoaded(true);
        })
        .catch((e) => console.error("Failed to load city map:", e));
    }
  }, [mapId, cityMapLoaded]);

  // Lazy-load USA map from public folder
  useEffect(() => {
    if (mapId !== "usa") return;
    if (usaMapSvgRaw) {
      if (!usaMapLoaded) setUsaMapLoaded(true);
      return;
    }
    if (!usaMapLoaded) {
      fetch("/USA.svg")
        .then((r) => r.text())
        .then((svg) => {
          usaMapSvgRaw = svg;
          setUsaMapLoaded(true);
        })
        .catch((e) => console.error("Failed to load USA map:", e));
    }
  }, [mapId, usaMapLoaded]);

  // Get the appropriate map configuration based on mapId
  let mapConfig = MAP_CONFIGS[mapId] || MAP_CONFIGS.default;

  // Update city config if city map just loaded
  if (mapId === "city" && cityMapSvgRaw) {
    mapConfig = {
      ...MAP_CONFIGS.city,
      svg: cityMapSvgRaw,
    };
  }

  if (mapId === "usa" && usaMapSvgRaw) {
    mapConfig = {
      ...MAP_CONFIGS.usa,
      svg: usaMapSvgRaw,
    };
  }

  const containerRef = useRef<HTMLDivElement>(null);
  const [mapMarkup, setMapMarkup] = useState("");
  const mapConfigRef = useRef(mapConfig);

  // Update mapConfigRef when mapConfig changes
  useEffect(() => {
    mapConfigRef.current = mapConfig;
  }, [mapConfig]);

  const mapSvg = mapConfig.svg;
  useEffect(() => {
    setMapMarkup(mapSvg);
  }, [mapSvg]);

  useEffect(() => {
    if (!mapMarkup || !containerRef.current) return;
    const svg = containerRef.current.querySelector("svg");
    if (!svg) return;

    const originalWidth = svg.getAttribute("width");
    const originalHeight = svg.getAttribute("height");

    svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
    svg.setAttribute("width", "100%");
    svg.setAttribute("height", "100%");
    svg.style.width = "100%";
    svg.style.height = "100%";
    svg.style.display = "block";

    const existingViewBox = svg.getAttribute("viewBox");
    if (!existingViewBox) {
      const adjusted = adjustViewBoxToContent(svg);
      if (!adjusted) {
        if (originalWidth && originalHeight) {
          const w = parseFloat(originalWidth);
          const h = parseFloat(originalHeight);
          if (!Number.isNaN(w) && !Number.isNaN(h) && h !== 0) {
            svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
          }
        }
      }
    }
  }, [mapMarkup, mapId]);

  useEffect(() => {
    const svg = containerRef.current?.querySelector("svg");
    if (!svg) return;

    const currentConfig = mapConfigRef.current;
    const ZONE_TO_REGION = currentConfig.zoneToRegion;

    Object.entries(ZONE_TO_REGION).forEach(([zoneId, regionIds]) => {
      const state = zones[zoneId as ZoneId];
      if (!state) return;

      const regionIdList = Array.isArray(regionIds) ? regionIds : [regionIds];
      const expandedRegionIds = regionIdList.flatMap((regionId) => [
        regionId,
        ...(currentConfig.regionAliases[regionId] ?? []),
      ]);

      const { clanId, contested } = getZoneControl(state);
      const clan = clanId ? clans[clanId] : null;

      let fill = NEUTRAL_TERRITORY_SHADE;
      let stroke = NEUTRAL_TERRITORY_STROKE;
      let strokeWidth = "2";
      let opacity = 0.85;

      if (clan) {
        fill = clan.color;
        stroke = clan.color;
        strokeWidth = contested ? "4" : "3";
        opacity = contested ? 0.92 : 0.88;
      }

      const applyStyle = (element: SVGElement) => {
        element.style.fill = fill;
        element.style.stroke = stroke;
        element.style.strokeWidth = strokeWidth;
        element.style.opacity = `${opacity}`;
        element.style.fillOpacity = `${opacity}`;
        element.style.filter = clan
          ? `drop-shadow(0 0 ${contested ? 16 : 10}px ${stroke})`
          : "";
      };

      expandedRegionIds.forEach((regionId) => {
        const regionElement = svg.querySelector<SVGElement>(
          `#${CSS.escape(regionId)}`
        );
        if (!regionElement) return;

        if (regionElement.tagName.toLowerCase() === "g") {
          const shapes = regionElement.querySelectorAll<SVGElement>(
            "path, rect, circle, ellipse, polygon, polyline, line"
          );
          shapes.forEach(applyStyle);
        } else {
          applyStyle(regionElement);
        }
      });
    });
  }, [zones, clans, mapId]);

  if (!mapMarkup) {
    return (
      <div className="w-full h-full min-h-[200px] flex items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-black rounded-xl">
        <img
          src="/BRAINS.svg"
          alt="Loading..."
          className="w-16 h-16 animate-pulse"
          style={{ filter: "drop-shadow(0 0 20px rgba(0, 212, 255, 0.6))" }}
        />
      </div>
    );
  }

  return (
    <div className="relative bg-gradient-to-br from-slate-950 via-slate-900 to-black w-full rounded-2xl border border-slate-800 overflow-hidden">
      {!hideHeader && (
        <div className="px-4 pt-4 pb-2">
          <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400">
            Territory Control
          </h3>
        </div>
      )}

      <div className="w-full h-[70vh] overflow-hidden">
        <div
          key={`territory-map-${mapId}`}
          ref={containerRef}
          className="w-full h-full"
          dangerouslySetInnerHTML={{ __html: mapMarkup }}
        />
      </div>

      {!hideLegend && (
        <div className="absolute top-4 right-4 bg-slate-900/90 backdrop-blur rounded-xl border border-slate-700 p-3 space-y-2 max-h-60 w-44 overflow-y-auto z-10">
          <h4 className="text-xs font-bold text-white uppercase tracking-wide">
            Active Clans
          </h4>
          {visibleClans.map((clan) => (
            <div key={clan.id} className="flex items-center gap-2 text-xs">
              <div
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: clan.color }}
              />
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
