import React, { ReactNode, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

// @ts-expect-error - Vite raw SVG imports
import territoryMapSvgRaw from "../assets/territory_map.svg?raw";
// @ts-expect-error - Vite raw SVG imports
import kyrgyzstanMapSvgRaw from "../assets/kyrgyzstanHigh.svg?raw";

// Lazy maps
let cityMapSvgRaw = "";
let usaMapSvgRaw = "";

import { ClanId, ClanMetadata, ZoneId, ZoneState, getClanColor } from "../clanTerritoryTypes";

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
    svg: kyrgyzstanMapSvgRaw,
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
    import("../assets/usa.svg?raw")
      .then((m) => {
        usaMapSvgRaw = m.default;
        setUsaLoaded(true);
      })
      .catch((e) => console.error("Failed to load USA map:", e));
  }, [mapId]);

  const mapConfig = useMemo(() => {
    let cfg = MAP_CONFIGS[mapId] || MAP_CONFIGS.default;

    if (mapId === "city") cfg = { ...cfg, svg: cityMapSvgRaw || cfg.svg };
    if (mapId === "usa") cfg = { ...cfg, svg: usaMapSvgRaw || cfg.svg };

    return cfg;
  }, [mapId, cityLoaded, usaLoaded]);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  // Cache region lookups so we don't querySelector every render
  const regionCacheRef = useRef<Map<string, SVGElement[]>>(new Map());
  const lastStyleKeyRef = useRef<Record<string, string>>({});

  // IMPORTANT: inject SVG ONLY when svg changes (prevents style wipe)
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const svgText = mapConfig.svg || "";
    container.innerHTML = svgText;

    const svg = container.querySelector("svg") as SVGSVGElement | null;
    svgRef.current = svg;

    regionCacheRef.current = new Map();
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

  // Apply colors based on zones/clans without re-injecting SVG
  useLayoutEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;

    const zoneToRegion = mapConfig.zoneToRegion;

    const resolveElementsForRegion = (regionId: string): SVGElement[] => {
      const cache = regionCacheRef.current;
      if (cache.has(regionId)) return cache.get(regionId)!;

      const node = svg.querySelector<SVGElement>(`#${CSS.escape(regionId)}`);
      if (!node) {
        cache.set(regionId, []);
        return [];
      }

      if (node.tagName.toLowerCase() === "g") {
        const shapes = Array.from(
          node.querySelectorAll<SVGElement>("path, rect, circle, ellipse, polygon, polyline, line")
        );
        cache.set(regionId, shapes);
        return shapes;
      }

      cache.set(regionId, [node]);
      return [node];
    };

    const applyStyle = (el: SVGElement, style: any, styleKey: string) => {
      // Use per-element key to avoid repaint spam
      const anyEl = el as any;
      if (anyEl.__territoryStyleKey === styleKey) return;
      anyEl.__territoryStyleKey = styleKey;

      el.style.fill = style.fill;
      el.style.stroke = style.stroke;
      el.style.strokeWidth = style.strokeWidth;
      el.style.opacity = String(style.opacity);
      el.style.fillOpacity = String(style.opacity);
      el.style.filter = style.filter || "";
      el.style.strokeDasharray = style.dashArray || "";
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
        const els = resolveElementsForRegion(rid);
        if (!els.length) return;

        const styleKey = `${fill}|${stroke}|${strokeWidth}|${opacity}|${dashArray}|${filter}`;
        if (lastStyleKeyRef.current[rid] === styleKey) return;
        lastStyleKeyRef.current[rid] = styleKey;

        for (const el of els) {
          applyStyle(el, { fill, stroke, strokeWidth, opacity, dashArray, filter }, styleKey);
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

      {/* Flat map container: no zoom/pan transforms */}
      <div className="w-full h-[70vh] overflow-hidden">
        <div ref={containerRef} className="w-full h-full" />
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