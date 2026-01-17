import React, { ReactNode, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

// @ts-expect-error - Vite raw SVG imports
import territoryMapSvgRaw from "../assets/territory_map.svg?raw";
// @ts-expect-error - Vite raw SVG imports
import kyrgyzstanMapSvgRaw from "../assets/kyrgyzstanHigh.svg?raw";
// @ts-expect-error - Vite raw SVG imports
import unitedKingdomMapSvgRaw from "../assets/unitedkingdom.svg?raw";

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
  unitedkingdom: {
    svg: unitedKingdomMapSvgRaw,
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

  const mapConfig = useMemo(() => {
    let cfg = MAP_CONFIGS[mapId] || MAP_CONFIGS.default;

    if (mapId === "city") cfg = { ...cfg, svg: cityMapSvgRaw || cfg.svg };
    if (mapId === "usa") cfg = { ...cfg, svg: usaMapSvgRaw || cfg.svg };

    return cfg;
  }, [mapId, cityLoaded, usaLoaded]);

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
