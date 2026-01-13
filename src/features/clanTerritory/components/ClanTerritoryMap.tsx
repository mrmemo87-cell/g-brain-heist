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
      "zone-7": ["region_2", "regio_2"],
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

const normalizeRegionKey = (k: string) =>
  k
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/[^\w-]/g, "");

const getAspectRatioFromSvg = (svgContent: string): number | null => {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(svgContent, "image/svg+xml");
    const svgEl = doc.querySelector("svg");
    if (!svgEl) return null;

    const viewBox = svgEl.getAttribute("viewBox");
    if (viewBox) {
      const [, , w, h] = viewBox.split(/\s+/).map(Number);
      if (!Number.isNaN(w) && !Number.isNaN(h) && h !== 0) {
        return w / h;
      }
    }

    const widthAttr = svgEl.getAttribute("width");
    const heightAttr = svgEl.getAttribute("height");
    const width = widthAttr ? parseFloat(widthAttr) : NaN;
    const height = heightAttr ? parseFloat(heightAttr) : NaN;

    if (!Number.isNaN(width) && !Number.isNaN(height) && height !== 0) {
      return width / height;
    }
  } catch (error) {
    console.warn("[ClanTerritoryMap] Failed to parse SVG aspect ratio", error);
  }

  return null;
};

const normalizeSvgMarkup = (svgContent: string) => {
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgContent, "image/svg+xml");
  const svgEl = doc.querySelector("svg");
  if (!svgEl) return svgContent;

  // Get the viewBox if it exists, or try to compute from width/height
  let viewBox = svgEl.getAttribute("viewBox");
  if (!viewBox) {
    const originalWidth = svgEl.getAttribute("width");
    const originalHeight = svgEl.getAttribute("height");
    if (originalWidth && originalHeight) {
      // Parse numeric values, removing units like 'mm', 'px', etc.
      const w = parseFloat(originalWidth);
      const h = parseFloat(originalHeight);
      if (!Number.isNaN(w) && !Number.isNaN(h) && h !== 0) {
        viewBox = `0 0 ${w} ${h}`;
        svgEl.setAttribute("viewBox", viewBox);
      }
    }
  }

  // Remove any fixed dimensions and make SVG responsive
  svgEl.removeAttribute("width");
  svgEl.removeAttribute("height");
  svgEl.setAttribute("width", "100%");
  svgEl.setAttribute("height", "100%");

  // KEY: always fill the container (crop if needed)
  svgEl.setAttribute("preserveAspectRatio", "xMidYMid slice");

  // Apply inline styles to ensure proper rendering
  svgEl.style.cssText = `
    width: 100% !important;
    height: 100% !important;
    max-width: 100%;
    max-height: 100%;
    display: block;
  `.replace(/\s+/g, " ").trim();

  return svgEl.outerHTML;
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

    // Keep slice behavior even if SVG had something else originally
    if (!svgEl.getAttribute("preserveAspectRatio")) {
      svgEl.setAttribute("preserveAspectRatio", "xMidYMid slice");
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
    if (mapId === "city" && !cityMapLoaded) {
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
    if (mapId === "usa" && !usaMapLoaded) {
      fetch("/maps/usaHigh.svg")
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
  if (mapId === "city" && cityMapLoaded && cityMapSvgRaw) {
    mapConfig = {
      ...MAP_CONFIGS.city,
      svg: cityMapSvgRaw,
    };
  }

  if (mapId === "usa" && usaMapLoaded && usaMapSvgRaw) {
    mapConfig = {
      ...MAP_CONFIGS.usa,
      svg: usaMapSvgRaw,
    };
  }

  const ZONE_TO_REGION = mapConfig.zoneToRegion;
  const REGION_ALIAS_MAP = mapConfig.regionAliases;
  const mapSvg = mapConfig.svg;
  const containerRef = useRef<HTMLDivElement>(null);
  const [mapMarkup, setMapMarkup] = useState("");
  const [mapAspectRatio, setMapAspectRatio] = useState<number | null>(null);
  const viewBoxAdjustedRef = useRef<Record<string, boolean>>({});
  const defaultRegionStylesRef = useRef<
    Record<
      string,
      {
        fill: string;
        stroke: string;
        strokeWidth: string;
        dashArray: string;
        opacity: number;
      }
    >
  >({});
  const lastRegionStyleKeyRef = useRef<Record<string, string>>({});
  const svgRef = useRef<SVGSVGElement | null>(null);
  const rafRef = useRef<number | null>(null);

  const resolveRegionElement = (
    svg: SVGSVGElement,
    targetId: string
  ): SVGPathElement | null => {
    // Try direct ID query with multiple selector approaches
    let direct = svg.querySelector<SVGPathElement>(`#${targetId}`);
    if (direct) return direct;

    // Try without namespace issues
    direct = svg.querySelector<SVGPathElement>(`[id="${targetId}"]`);
    if (direct) return direct;

    // Try by inkscape:label attribute (Inkscape SVGs often have this)
    direct = svg.querySelector<SVGPathElement>(
      `[inkscape\\:label="${targetId}"]`
    );
    if (direct) {
      direct.id = targetId; // Set the id so future lookups are faster
      return direct;
    }

    // Try querySelectorAll with exact ID match as fallback
    const allElements = svg.querySelectorAll<SVGPathElement>("path, [id]");
    for (const elem of allElements) {
      if (elem.id === targetId) {
        return elem as SVGPathElement;
      }
      // Also check inkscape:label attribute
      const label = elem.getAttribute("inkscape:label");
      if (label === targetId) {
        elem.id = targetId;
        return elem as SVGPathElement;
      }
    }

    // Try normalized alias matching
    const normalizedTargets = new Set([normalizeRegionKey(targetId)]);
    (REGION_ALIAS_MAP[targetId] ?? []).forEach((alias) =>
      normalizedTargets.add(normalizeRegionKey(alias))
    );

    const candidates = svg.querySelectorAll<SVGPathElement>("[id]");
    for (const candidate of candidates) {
      if (normalizedTargets.has(normalizeRegionKey(candidate.id))) {
        if (candidate.id !== targetId) {
          candidate.id = targetId;
        }
        return candidate;
      }
    }

    return null;
  };

  // Reset caches when map changes
  useEffect(() => {
    defaultRegionStylesRef.current = {};
    lastRegionStyleKeyRef.current = {};
    svgRef.current = null;
    viewBoxAdjustedRef.current = {};
  }, [mapId]);

  useEffect(() => {
    setMapMarkup(normalizeSvgMarkup(mapSvg));
  }, [mapSvg]);

  useEffect(() => {
    const ratio = getAspectRatioFromSvg(mapSvg);
    setMapAspectRatio(ratio);
  }, [mapSvg]);

  useEffect(() => {
    if (!mapMarkup || !containerRef.current) return;
    const svgEl = containerRef.current.querySelector("svg");
    if (!svgEl) return;

    if (!viewBoxAdjustedRef.current[mapId]) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const viewBox = adjustViewBoxToContent(svgEl);
          if (viewBox) {
            const [, , width, height] = viewBox.split(/\s+/).map(Number);
            if (width && height) {
              setMapAspectRatio(width / height);
            }
          }
          viewBoxAdjustedRef.current[mapId] = true;
        });
      });
    }

    const ensureInitialAttributes = (element: SVGPathElement) => {
      if (!element.getAttribute("data-initial-fill")) {
        // Prioritize inline style first, then computed, then fallback
        let initialFill = element.style.fill;
        if (!initialFill || initialFill === "") {
          const computedStyle = window.getComputedStyle(element);
          initialFill = computedStyle.fill || NEUTRAL_TERRITORY_SHADE;
        }
        element.setAttribute("data-initial-fill", initialFill);
      }
      if (!element.getAttribute("data-initial-stroke")) {
        let initialStroke = element.style.stroke;
        if (!initialStroke || initialStroke === "") {
          const computedStyle = window.getComputedStyle(element);
          initialStroke = computedStyle.stroke || NEUTRAL_TERRITORY_STROKE;
        }
        element.setAttribute("data-initial-stroke", initialStroke);
      }
      if (!element.getAttribute("data-initial-stroke-width")) {
        let initialStrokeWidth = element.style.strokeWidth;
        if (!initialStrokeWidth || initialStrokeWidth === "") {
          const computedStyle = window.getComputedStyle(element);
          initialStrokeWidth = computedStyle.strokeWidth || "2";
        }
        element.setAttribute("data-initial-stroke-width", initialStrokeWidth);
      }
    };

    // Only capture initial styles once per SVG
    const maybeCaptureDefaultStyles = (regionId: string, el: SVGPathElement) => {
      if (!defaultRegionStylesRef.current[regionId]) {
        ensureInitialAttributes(el);
        defaultRegionStylesRef.current[regionId] = {
          fill: el.getAttribute("data-initial-fill") || NEUTRAL_TERRITORY_SHADE,
          stroke:
            el.getAttribute("data-initial-stroke") || NEUTRAL_TERRITORY_STROKE,
          strokeWidth: el.getAttribute("data-initial-stroke-width") || "2",
          dashArray: el.style.strokeDasharray || "",
          opacity: parseFloat(el.style.opacity || "1") || 1,
        };
      }
    };

    const getRegionStyleKey = (
      fill: string,
      stroke: string,
      strokeWidth: string,
      dashArray: string,
      opacity: number
    ) => `${fill}|${stroke}|${strokeWidth}|${dashArray}|${opacity}`;

    const applyRegionVisuals = (
      element: SVGPathElement,
      {
        fill,
        stroke,
        strokeWidth,
        dashArray,
        opacity,
      }: {
        fill: string;
        stroke: string;
        strokeWidth: string;
        dashArray: string;
        opacity: number;
      }
    ) => {
      element.style.fill = fill;
      element.style.stroke = stroke;
      element.style.strokeWidth = strokeWidth;
      element.style.strokeDasharray = dashArray;
      element.style.opacity = `${opacity}`;
    };

    const runLoop = () => {
      if (!containerRef.current) return;

      const svg =
        svgRef.current || containerRef.current.querySelector<SVGSVGElement>("svg");
      if (!svg) return;

      svgRef.current = svg;

      // Force slice on the live DOM svg too (just in case)
      svg.setAttribute("preserveAspectRatio", "xMidYMid slice");

      // Apply global SVG sizing just in case
      svg.style.width = "100%";
      svg.style.height = "100%";
      svg.style.display = "block";

      // Iterate zones and style regions
      Object.entries(ZONE_TO_REGION).forEach(([zoneId, regionIds]) => {
        const state = zones[zoneId as ZoneId];
        if (!state) return;

        const regionIdList = Array.isArray(regionIds) ? regionIds : [regionIds];

        regionIdList.forEach((regionId) => {
          const regionPath = resolveRegionElement(svg, regionId);
          if (!regionPath) return;

          maybeCaptureDefaultStyles(regionId, regionPath);

          // Determine owner clan
          const clan = state.clanId ? clans[state.clanId] : null;
          const contested = !!state.contested;

          // Default visuals
          let fill = NEUTRAL_TERRITORY_SHADE;
          let stroke = NEUTRAL_TERRITORY_STROKE;
          let baseStrokeWidth = "2";
          let dashArray = "";
          let baseOpacity = 0.85;

          if (clan) {
            fill = clan.color;
            stroke = clan.color;
            baseStrokeWidth = contested ? "4" : "3";
            dashArray = contested ? "8 6" : "";
            baseOpacity = contested ? 0.92 : 0.88;
          }

          const styleKey = getRegionStyleKey(
            fill,
            stroke,
            baseStrokeWidth,
            dashArray,
            baseOpacity
          );

          if (lastRegionStyleKeyRef.current[regionId] === styleKey) return;

          lastRegionStyleKeyRef.current[regionId] = styleKey;

          applyRegionVisuals(regionPath, {
            fill,
            stroke,
            strokeWidth: baseStrokeWidth,
            dashArray,
            opacity: baseOpacity,
          });

          regionPath.style.filter = `drop-shadow(0 0 ${
            contested ? 16 : 10
          }px ${stroke})`;
        });
      });

      rafRef.current = requestAnimationFrame(runLoop);
    };

    runLoop();

    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [mapMarkup, zones, clans, mapId, ZONE_TO_REGION, REGION_ALIAS_MAP]);

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

      <div
        ref={containerRef}
        className="w-full flex items-center justify-center px-4 pb-4 min-h-[240px] sm:min-h-[320px] lg:min-h-[420px]"
        style={{ aspectRatio: mapAspectRatio ? `${mapAspectRatio}` : "16 / 9" }}
      >
        <div className="w-full h-full" dangerouslySetInnerHTML={{ __html: mapMarkup }} />
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
