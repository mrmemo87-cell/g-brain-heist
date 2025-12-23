import React, { ReactNode, useEffect, useRef, useState } from "react";
// @ts-expect-error - Vite injects raw SVG strings for ?raw imports
import territoryMapSvgRaw from "../assets/territory_map.svg?raw";
// Import additional maps when available:
// @ts-expect-error
import cityMapSvgRaw from "../assets/city_map.svg?raw";
// @ts-expect-error
import kyrgyzstanMapSvgRaw from "../assets/kyrgyzstanHigh.svg?raw";
// @ts-expect-error
// import fortressMapSvgRaw from "../assets/fortress_map.svg?raw";
// @ts-expect-error
// import islandsMapSvgRaw from "../assets/islands_map.svg?raw";

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
      "zone-1": "KG-B",  // Batken
      "zone-2": "KG-C",  // Chü (Chuy)
      "zone-3": "KG-J",  // Jalal-Abad
      "zone-4": "KG-N",  // Naryn
      "zone-5": "KG-O",  // Osh
      "zone-6": "KG-T",  // Talas
      "zone-7": "KG-Y",  // Ysyk-Köl
    },
    regionAliases: {},
  },
  fortress: {
    svg: territoryMapSvgRaw, // Use default until fortress_map.svg is created
    maxZones: 6,
    zoneToRegion: {
      "zone-1": "layer_1",
      "zone-2": "layer_2",
      "zone-3": "layer_3",
      "zone-4": "layer_4",
      "zone-5": "layer_5",
      "zone-6": "layer_6",
      "zone-7": "central_keep",
      "zone-8": "outer_wall",
    },
    regionAliases: {},
  },
  islands: {
    svg: territoryMapSvgRaw, // Use default until islands_map.svg is created
    maxZones: 12,
    zoneToRegion: {
      "zone-1": "island_1",
      "zone-2": "island_2",
      "zone-3": "island_3",
      "zone-4": "island_4",
      "zone-5": "island_5",
      "zone-6": "island_6",
      "zone-7": "island_7",
      "zone-8": "island_8",
      "zone-9": "island_9",
      "zone-10": "island_10",
      "zone-11": "island_11",
      "zone-12": "island_12",
    },
    regionAliases: {},
  },
};

interface ClanTerritoryMapProps {
  zones: Record<ZoneId, ZoneState>;
  clans: Record<ClanId, ClanMetadata>;
  hideHeader?: boolean;
  hideLegend?: boolean;
  overlay?: ReactNode;
  mapId?: string;
}

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

const NEUTRAL_TERRITORY_SHADE = "#1e293b";

const normalizeRegionKey = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");

const normalizeSvgMarkup = (svgContent: string) => {
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgContent, "image/svg+xml");
  const svgEl = doc.querySelector("svg");
  if (!svgEl) return svgContent;

  svgEl.removeAttribute("width");
  svgEl.removeAttribute("height");
  svgEl.setAttribute("width", "100%");
  svgEl.setAttribute("height", "100%");
  svgEl.setAttribute("preserveAspectRatio", "xMidYMid meet");
  svgEl.style.width = "100%";
  svgEl.style.height = "100%";
  svgEl.style.maxWidth = "100%";
  svgEl.style.maxHeight = "100%";
  svgEl.style.display = "block";
  svgEl.style.objectFit = "contain";

  return svgEl.outerHTML;
};

const getZoneController = (
  zoneState?: ZoneState,
  clans?: Record<ClanId, ClanMetadata>
) => {
  if (!zoneState) return { clan: null, dominance: 0, contested: false };

  const entries = Object.entries(zoneState.influence)
    .filter(([, inf]) => inf > 0)
    .sort((a, b) => b[1] - a[1]);

  if (entries.length === 0)
    return { clan: null, dominance: 0, contested: false };

  const [leaderId, leaderInf] = entries[0];
  const total = entries.reduce((s, [, v]) => s + v, 0);
  const dominance = total > 0 ? leaderInf / total : 0;

  const runnerUp = entries[1];
  const contested =
    runnerUp &&
    Math.abs(leaderInf - runnerUp[1]) / Math.max(leaderInf, 1) <= 0.15;

  const clanMeta =
    clans?.[leaderId as ClanId] ??
    ({
      id: leaderId as ClanId,
      name: leaderId,
      color: getClanColor(leaderId),
    } as ClanMetadata);

  return {
    clan: clanMeta,
    dominance,
    contested: !!contested,
  };
};

export const ClanTerritoryMap: React.FC<ClanTerritoryMapProps> = ({
  zones,
  clans,
  hideHeader = false,
  hideLegend = false,
  overlay,
  mapId = 'default',
}) => {
  // Get the appropriate map configuration based on mapId
  const mapConfig = MAP_CONFIGS[mapId] || MAP_CONFIGS.default;
  const ZONE_TO_REGION = mapConfig.zoneToRegion;
  const REGION_ALIAS_MAP = mapConfig.regionAliases;
  const mapSvg = mapConfig.svg;
  const containerRef = useRef<HTMLDivElement>(null);
  const [mapMarkup, setMapMarkup] = useState("");
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
  const resolveRegionElement = (svg: SVGSVGElement, targetId: string): SVGPathElement | null => {
    // Try direct ID query with multiple selector approaches
    let direct = svg.querySelector<SVGPathElement>(`#${targetId}`);
    if (direct) return direct;

    // Try without namespace issues
    direct = svg.querySelector<SVGPathElement>(`[id="${targetId}"]`);
    if (direct) return direct;

    // Try by inkscape:label attribute (Inkscape SVGs often have this)
    direct = svg.querySelector<SVGPathElement>(`[inkscape\\:label="${targetId}"]`);
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
    (REGION_ALIAS_MAP[targetId] ?? []).forEach((alias) => normalizedTargets.add(normalizeRegionKey(alias)));

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
  }, [mapId]);

  useEffect(() => {
    setMapMarkup(normalizeSvgMarkup(mapSvg));
  }, [mapSvg]);

  useEffect(() => {
    if (!mapMarkup || !containerRef.current) return;

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
          initialStroke = computedStyle.stroke || "#475569";
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
      if (!element.getAttribute("data-initial-dasharray")) {
        let initialDash = element.style.getPropertyValue("stroke-dasharray");
        if (!initialDash || initialDash === "") {
          const computedStyle = window.getComputedStyle(element);
          initialDash = computedStyle.getPropertyValue("stroke-dasharray") || "none";
        }
        element.setAttribute("data-initial-dasharray", initialDash);
      }
      if (!element.getAttribute("data-initial-opacity")) {
        let initialOpacity = element.style.opacity;
        if (!initialOpacity || initialOpacity === "") {
          const computedStyle = window.getComputedStyle(element);
          initialOpacity = computedStyle.opacity || "1";
        }
        element.setAttribute("data-initial-opacity", initialOpacity);
      }
    };

    const buildKey = (
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
      // Clear any existing inline style completely to ensure our styles take precedence
      // This is necessary for SVGs with inline styles like city_map.svg that have opacity:0.1
      element.removeAttribute("style");
      
      // Set ALL styles via direct attribute - this is more reliable for SVG
      element.setAttribute("fill", fill);
      element.setAttribute("stroke", stroke);
      element.setAttribute("stroke-width", strokeWidth);
      element.setAttribute("stroke-dasharray", dashArray);
      element.setAttribute("opacity", opacity.toString());
      
      // Also set via style property for browsers that prefer it
      element.style.cssText = `fill: ${fill} !important; stroke: ${stroke} !important; stroke-width: ${strokeWidth} !important; stroke-dasharray: ${dashArray}; opacity: ${opacity} !important; pointer-events: all;`;
      
      // Move element to front of its parent (SVG uses painter's algorithm - last drawn is on top)
      // This ensures the colored region appears above any background images
      const parent = element.parentElement;
      if (parent) {
        parent.appendChild(element);
      }
    };

    const updateRegions = () => {
      const svg = containerRef.current?.querySelector("svg");
      if (!svg) {
        console.log("[ClanTerritoryMap] No SVG found");
        return;
      }

      if (svgRef.current !== svg) {
        svgRef.current = svg;
        svg.style.pointerEvents = "none";
        defaultRegionStylesRef.current = {};
        lastRegionStyleKeyRef.current = {};
        console.log("[ClanTerritoryMap] New SVG detected, reset caches");
        
        // Debug: Log all available IDs in the SVG
        const allIds = Array.from(svg.querySelectorAll("[id]")).map(el => el.id);
        console.log("[ClanTerritoryMap] Available IDs in SVG:", allIds.filter(id => id.includes("district") || id.includes("region")));
      }

      Object.entries(ZONE_TO_REGION).forEach(([zoneId, regionIds]) => {
        const ids = Array.isArray(regionIds) ? regionIds : [regionIds];

        ids.forEach((regionId) => {
          const regionPath = resolveRegionElement(svg, regionId);
          if (!regionPath) {
            console.log(`[ClanTerritoryMap] Could not find region: ${regionId} for zone: ${zoneId}`);
            return;
          }

          ensureInitialAttributes(regionPath);

          if (!defaultRegionStylesRef.current[regionId]) {
            const capturedFill =
              regionPath.getAttribute("data-initial-fill") ||
              regionPath.getAttribute("fill") ||
              regionPath.style.fill ||
              NEUTRAL_TERRITORY_SHADE;
            const capturedStroke =
              regionPath.getAttribute("data-initial-stroke") ||
              regionPath.getAttribute("stroke") ||
              regionPath.style.stroke ||
              "#475569";
            const capturedOpacity = Number(
              regionPath.getAttribute("data-initial-opacity") ||
                regionPath.getAttribute("opacity") ||
                regionPath.style.opacity ||
                1
            );

            // Ensure minimum opacity of 0.7 for visibility (city_map.svg has 0.1 which is too low)
            const normalizedOpacity = Math.max(capturedOpacity, 0.7);

            defaultRegionStylesRef.current[regionId] = {
              fill: capturedFill,
              stroke: capturedStroke,
              strokeWidth:
                regionPath.getAttribute("stroke-width") ||
                regionPath.style.strokeWidth ||
                "2",
              dashArray:
                regionPath.getAttribute("stroke-dasharray") ||
                regionPath.style.getPropertyValue("stroke-dasharray") ||
                "none",
              opacity: Number.isNaN(normalizedOpacity) ? 1 : normalizedOpacity,
            };
          }

          const defaultStyle = defaultRegionStylesRef.current[regionId];
          const defaultKey = buildKey(
            defaultStyle.fill,
            defaultStyle.stroke,
            defaultStyle.strokeWidth,
            defaultStyle.dashArray,
            defaultStyle.opacity
          );

          const zoneState = zones[zoneId as ZoneId];
          const { clan, dominance, contested } = getZoneController(
            zoneState,
            clans
          );

          if (!clan) {
            if (lastRegionStyleKeyRef.current[regionId] !== defaultKey) {
              lastRegionStyleKeyRef.current[regionId] = defaultKey;
              applyRegionVisuals(regionPath, defaultStyle);
              regionPath.style.filter = "none";
            }
            return;
          }

          // Log when a clan controls a zone
          console.log(`[ClanTerritoryMap] Zone ${zoneId} (${regionId}) controlled by ${clan.name} with color ${clan.color}`);

          const dominanceStrength = clamp01(dominance);
          const baseOpacity = dominanceStrength >= 0.75 ? 1 : 0.85;
          const baseStrokeWidth = contested ? "4" : "3";
          const dashArray = contested ? "8 4" : "none";
          const styleKey = buildKey(
            clan.color,
            clan.color,
            baseStrokeWidth,
            dashArray,
            baseOpacity
          );

          if (lastRegionStyleKeyRef.current[regionId] === styleKey) {
            return;
          }

          console.log(`[ClanTerritoryMap] Applying color ${clan.color} to ${regionId}`);
          lastRegionStyleKeyRef.current[regionId] = styleKey;

          applyRegionVisuals(regionPath, {
            fill: clan.color,
            stroke: clan.color,
            strokeWidth: baseStrokeWidth,
            dashArray,
            opacity: baseOpacity,
          });

          regionPath.style.filter = `drop-shadow(0 0 ${
            contested ? 16 : 10
          }px ${clan.color})`;
        });
      });
    };

    const runLoop = () => {
      updateRegions();
      rafRef.current = requestAnimationFrame(runLoop);
    };

    runLoop();

    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [mapMarkup, zones, clans]);

  if (!mapMarkup) {
    return (
      <div className="relative rounded-3xl border border-slate-800/70 bg-gradient-to-br from-slate-950 via-slate-900 to-black p-6 shadow-2xl flex items-center justify-center h-96">
        <img src="/BRAINS.svg" alt="Loading..." className="w-24 h-24 animate-pulse" style={{ filter: 'drop-shadow(0 0 20px rgba(0, 212, 255, 0.6))' }} />
      </div>
    );
  }

  return (
    <div className="relative rounded-3xl border border-slate-800/70 bg-gradient-to-br from-slate-950 via-slate-900 to-black p-6 shadow-2xl overflow-hidden">
      {!hideHeader && (
        <div className="mb-3">
          <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400">
            Territory Control
          </h3>
        </div>
      )}

      <div
        ref={containerRef}
        className="w-full min-h-[300px] h-[50vh] sm:h-[55vh] md:h-[60vh] lg:h-[500px] xl:h-[600px] flex items-center justify-center overflow-visible [&>svg]:w-full [&>svg]:h-full [&>svg]:max-w-full [&>svg]:max-h-full [&>svg]:object-contain"
        dangerouslySetInnerHTML={{ __html: mapMarkup }}
      />

      {!hideLegend && (
        <div className="absolute top-4 right-4 bg-slate-900/90 backdrop-blur rounded-xl border border-slate-700 p-3 space-y-2 max-h-72 overflow-y-auto z-10">
          <h4 className="text-xs font-bold text-white uppercase tracking-wide">
            Active Clans
          </h4>
          {Object.values(clans).map((clan) => (
            <div key={clan.id} className="flex items-center gap-2 text-xs">
              <div
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: clan.color }}
              />
              <span className="text-white font-semibold">{clan.name}</span>
            </div>
          ))}
        </div>
      )}

      {overlay}
    </div>
  );
};
