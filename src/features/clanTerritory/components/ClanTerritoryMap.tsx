import React, { ReactNode, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

// @ts-expect-error - Vite injects raw SVG strings for ?raw imports
import territoryMapSvgRaw from "../assets/territory_map.svg?raw";
// @ts-expect-error - Kyrgyzstan map is much smaller and commonly used
import kyrgyzstanMapSvgRaw from "../assets/kyrgyzstanHigh.svg?raw";

// Large maps: lazy-load to avoid startup lag
let cityMapSvgRaw = "";
let usaMapSvgRaw = "";

import {
  ClanId,
  ClanMetadata,
  ZoneId,
  ZoneState,
  getClanColor,
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
  if (!state) return { clanId: null, contested: false };

  const legacyClanId = (state as ZoneState & { clanId?: ClanId | null }).clanId;
  if (legacyClanId) return { clanId: legacyClanId, contested: false };

  const entries = Object.entries(state.influence || {}).filter(([, value]) => value > 0);
  if (entries.length === 0) return { clanId: null, contested: false };

  entries.sort((a, b) => b[1] - a[1]);
  const [leader, leaderScore] = entries[0];
  const runnerUp = entries[1];
  if (!leader) return { clanId: null, contested: false };

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
  containerClassName?: string;
  showControls?: boolean;
};

export const ClanTerritoryMap: React.FC<ClanTerritoryMapProps> = ({
  zones,
  clans,
  hideHeader = false,
  hideLegend = false,
  overlay,
  mapId = "default",
  containerClassName,
  showControls,
}) => {
  const DEBUG = import.meta.env.DEV;
  const [cityMapLoaded, setCityMapLoaded] = useState(false);
  const [usaMapLoaded, setUsaMapLoaded] = useState(false);
  const [missingRegions, setMissingRegions] = useState<string[]>([]);

  const containerRef = useRef<HTMLDivElement>(null);
  const svgElementRef = useRef<SVGSVGElement | null>(null);
  const regionCacheRef = useRef<{
    mapId: string | null;
    svg: SVGSVGElement | null;
    elements: Map<string, SVGElement[]>;
  }>({ mapId: null, svg: null, elements: new Map() });
  const regionStyleKeyRef = useRef<Map<string, string>>(new Map());
  const warnedOscillationRef = useRef(false);
  const zonesEmptyTransitionsRef = useRef(0);
  const lastZonesEmptyRef = useRef<boolean | null>(null);

  // Lazy-load the large city map (from assets now)
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

  // Lazy-load the USA map (from assets now)
  useEffect(() => {
    if (mapId !== "usa") return;
    if (usaMapSvgRaw) {
      if (!usaMapLoaded) setUsaMapLoaded(true);
      return;
    }
    if (!usaMapLoaded) {
      import("../assets/USA.svg?raw")
        .then((module) => {
          usaMapSvgRaw = module.default;
          setUsaMapLoaded(true);
        })
        .catch((e) => console.error("Failed to load USA map:", e));
    }
  }, [mapId, usaMapLoaded]);

  const mapConfig = useMemo<MapConfig | null>(() => {
    const base = MAP_CONFIGS[mapId];

    if (!base) {
      if (DEBUG) {
        console.warn(`[ClanTerritoryMap] Missing map configuration for mapId="${mapId}"`);
      }
      return null;
    }

    if (mapId === "city" && cityMapSvgRaw) {
      return { ...MAP_CONFIGS.city, svg: cityMapSvgRaw };
    }
    if (mapId === "usa" && usaMapSvgRaw) {
      return { ...MAP_CONFIGS.usa, svg: usaMapSvgRaw };
    }

    return base;
  }, [mapId, cityMapLoaded, usaMapLoaded]);

  const mapMarkup = mapConfig?.svg ?? "";

  useEffect(() => {
    if (!DEBUG) return;
    console.debug("[ClanTerritoryMap] mapId changed", mapId);
  }, [mapId, DEBUG]);

  useEffect(() => {
    regionCacheRef.current = { mapId, svg: null, elements: new Map() };
    regionStyleKeyRef.current = new Map();
  }, [mapId]);

  useEffect(() => {
    if (!DEBUG) return;
    const role = showControls === false ? "student" : "teacher";
    console.debug("[ClanTerritoryMap] Zones count", role, Object.keys(zones).length);
  }, [zones, showControls, DEBUG]);

  useEffect(() => {
    if (!DEBUG) return;
    const isEmpty = Object.keys(zones).length === 0;
    if (lastZonesEmptyRef.current !== null && lastZonesEmptyRef.current !== isEmpty) {
      zonesEmptyTransitionsRef.current += 1;
      if (zonesEmptyTransitionsRef.current >= 2 && !warnedOscillationRef.current) {
        console.warn(
          `[ClanTerritoryMap] Zones oscillating between empty and non-empty for mapId="${mapId}".`
        );
        warnedOscillationRef.current = true;
      }
    }
    lastZonesEmptyRef.current = isEmpty;
  }, [zones, mapId, DEBUG]);

  // Normalize injected SVG sizing + ensure viewBox exists
  useEffect(() => {
    if (!mapMarkup || !containerRef.current) return;

    const svg = containerRef.current.querySelector("svg");
    if (!svg) return;

    if (DEBUG && svgElementRef.current && svgElementRef.current !== svg) {
      console.debug("[ClanTerritoryMap] SVG element replaced", mapId);
    }

    if (svgElementRef.current !== svg) {
      svgElementRef.current = svg;
      regionCacheRef.current = { mapId, svg, elements: new Map() };
      regionStyleKeyRef.current = new Map();
    }

    const originalWidth = svg.getAttribute("width");
    const originalHeight = svg.getAttribute("height");

    svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
    svg.setAttribute("width", "100%");
    svg.setAttribute("height", "100%");
    svg.style.width = "100%";
    svg.style.height = "100%";
    svg.style.display = "block";

    const existingViewBox = svg.getAttribute("viewBox");
    const applyFallbackViewBox = () => {
      if (existingViewBox || !originalWidth || !originalHeight) return;
      const w = parseFloat(originalWidth);
      const h = parseFloat(originalHeight);
      if (!Number.isNaN(w) && !Number.isNaN(h) && h !== 0) {
        svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
      }
    };

    let rafId: number | null = null;
    let rafId2: number | null = null;
    let timeoutId: number | null = null;
    let cancelled = false;

    rafId = window.requestAnimationFrame(() => {
      rafId2 = window.requestAnimationFrame(() => {
        if (cancelled) return;
        const adjusted = adjustViewBoxToContent(svg);
        if (adjusted) return;

        timeoutId = window.setTimeout(() => {
          if (cancelled) return;
          const retryAdjusted = adjustViewBoxToContent(svg);
          if (!retryAdjusted) {
            applyFallbackViewBox();
          }
        }, 50);
      });
    });
    if (mapConfig) {
      const svgIds = Array.from(svg.querySelectorAll<SVGElement>("[id]"))
        .map((element) => element.id)
        .filter(Boolean);
      const svgIdSet = new Set(svgIds);
      const regionIds = new Set<string>();

      Object.values(mapConfig.zoneToRegion).forEach((regionEntry) => {
        const regionList = Array.isArray(regionEntry) ? regionEntry : [regionEntry];
        regionList.forEach((regionId) => {
          regionIds.add(regionId);
          (mapConfig.regionAliases[regionId] ?? []).forEach((alias) => regionIds.add(alias));
        });
      });

      const missingRegionIds = Array.from(regionIds).filter((regionId) => !svgIdSet.has(regionId));
      const zonesWithNoMappedRegion = Object.keys(zones).filter(
        (zoneId) => !mapConfig.zoneToRegion[zoneId as ZoneId]
      );

      setMissingRegions(missingRegionIds);
      if (DEBUG && missingRegionIds.length > 0) {
        console.warn(
          `[ClanTerritoryMap] Missing region IDs in SVG for mapId="${mapId}": ${missingRegionIds.join(", ")}`
        );
      }

      if (DEBUG && zonesWithNoMappedRegion.length > 0) {
        console.warn(
          `[ClanTerritoryMap] Zones with no mapped region for mapId="${mapId}": ${zonesWithNoMappedRegion.join(", ")}`
        );
      }

      if (DEBUG) {
        console.debug("[ClanTerritoryMap] Active mapId", mapId);
        console.debug("[ClanTerritoryMap] Regions found", svgIds);
        console.debug("[ClanTerritoryMap] Missing regions", missingRegionIds);
        console.debug("[ClanTerritoryMap] Zones with no mapped region", zonesWithNoMappedRegion);
      }
    } else {
      setMissingRegions([]);
    }

    return () => {
      cancelled = true;
      if (rafId !== null) window.cancelAnimationFrame(rafId);
      if (rafId2 !== null) window.cancelAnimationFrame(rafId2);
      if (timeoutId !== null) window.clearTimeout(timeoutId);
    };
  }, [mapMarkup, mapId, mapConfig, zones, DEBUG]);

  // Apply territory styles (scoped to this SVG)
  useLayoutEffect(() => {
    const svg = containerRef.current?.querySelector("svg");
    if (!svg) return;

    if (!mapConfig) return;
    const ZONE_TO_REGION = mapConfig.zoneToRegion;

    if (
      regionCacheRef.current.mapId !== mapId ||
      regionCacheRef.current.svg !== svg
    ) {
      regionCacheRef.current = { mapId, svg, elements: new Map() };
      regionStyleKeyRef.current = new Map();
    }

    const getRegionElements = (regionId: string) => {
      const cached = regionCacheRef.current.elements.get(regionId);
      if (cached) return cached;

      const regionElement = svg.querySelector<SVGElement>(`#${CSS.escape(regionId)}`);
      if (!regionElement) {
        const empty: SVGElement[] = [];
        regionCacheRef.current.elements.set(regionId, empty);
        return empty;
      }

      const elements =
        regionElement.tagName.toLowerCase() === "g"
          ? Array.from(
              regionElement.querySelectorAll<SVGElement>(
                "path, rect, circle, ellipse, polygon, polyline, line"
              )
            )
          : [regionElement];

      regionCacheRef.current.elements.set(regionId, elements);
      return elements;
    };

    Object.entries(ZONE_TO_REGION).forEach(([zoneId, regionIds]) => {
      const state = zones[zoneId as ZoneId];
      if (!state) return;

      const regionIdList = Array.isArray(regionIds) ? regionIds : [regionIds];
      const expandedRegionIds = regionIdList.flatMap((regionId) => [
        regionId,
        ...(mapConfig.regionAliases[regionId] ?? []),
      ]);

      const { clanId, contested } = getZoneControl(state);
      const clan = clanId ? clans[clanId] : null;
      const clanColor = clanId ? (clan?.color ?? getClanColor(clanId)) : null;

      let fill = NEUTRAL_TERRITORY_SHADE;
      let stroke = NEUTRAL_TERRITORY_STROKE;
      let strokeWidth = "2";
      let opacity = 0.85;

      if (clanColor) {
        fill = clanColor;
        stroke = clanColor;
        strokeWidth = contested ? "4" : "3";
        opacity = contested ? 0.92 : 0.88;
      }

      const filter = clanColor
        ? `drop-shadow(0 0 ${contested ? 16 : 10}px ${stroke})`
        : "";
      const styleKey = [fill, stroke, strokeWidth, opacity, filter].join("|");

      expandedRegionIds.forEach((regionId) => {
        const previousStyleKey = regionStyleKeyRef.current.get(regionId);
        if (previousStyleKey === styleKey) return;

        const elements = getRegionElements(regionId);
        if (elements.length === 0) return;

        elements.forEach((element) => {
          element.style.fill = fill;
          element.style.stroke = stroke;
          element.style.strokeWidth = strokeWidth;
          element.style.opacity = `${opacity}`;
          element.style.fillOpacity = `${opacity}`;
          element.style.filter = filter;
        });
        regionStyleKeyRef.current.set(regionId, styleKey);
      });
    });
  }, [zones, clans, mapId, mapConfig]);

  const clanEntries = Object.values(clans);
  const maxLegendEntries = 6;
  const visibleClans = clanEntries.slice(0, maxLegendEntries);
  const hiddenClanCount = Math.max(0, clanEntries.length - visibleClans.length);

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
      {!mapConfig && (
        <div className="m-4 rounded-xl border border-rose-500/50 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          Missing map configuration for <span className="font-semibold">{mapId}</span>. Please
          update MAP_CONFIGS to include this map.
        </div>
      )}
      {!hideHeader && (
        <div className="px-4 pt-4 pb-2">
          <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400">
            Territory Control
          </h3>
        </div>
      )}
      {import.meta.env.DEV && missingRegions.length > 0 && (
        <div className="px-4 pb-2">
          <button
            type="button"
            onClick={() =>
              console.debug(
                `[ClanTerritoryMap] Missing region IDs for mapId="${mapId}":`,
                missingRegions
              )
            }
            className="rounded-md border border-amber-400/60 bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-200 hover:bg-amber-500/20"
          >
            Print missing region IDs
          </button>
        </div>
      )}

      <div className="w-full h-[70vh] overflow-hidden">
        <div
          key={`territory-map-${mapId}`}
          ref={containerRef}
          className={["w-full h-full", containerClassName].filter(Boolean).join(" ")}
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
