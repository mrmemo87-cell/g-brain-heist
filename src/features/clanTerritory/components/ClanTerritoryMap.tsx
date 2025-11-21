import React, { useEffect, useRef, useState } from "react";
// @ts-expect-error - Vite injects raw SVG strings for ?raw imports
import territoryMapSvgRaw from "../assets/territory_map.svg?raw";
import {
  ClanId,
  ClanMetadata,
  ZoneId,
  ZoneState,
  ZONES,
} from "../clanTerritoryTypes";

interface ClanTerritoryMapProps {
  zones: Record<ZoneId, ZoneState>;
  clans: Record<ClanId, ClanMetadata>;
}

// Map zone IDs to region IDs in your SVG
// Adjust these mappings to match your actual SVG group names
const ZONE_TO_REGION: Record<ZoneId, string | string[]> = {
  "zone-1": "region_5", // Server Room
  "zone-2": "region_7", // Mainframe
  "zone-3": "region_6", // Security Hub
  "zone-4": "region_4", // Data Vault
  "zone-5": "region_8", // Power Grid
  "zone-6": "region_3", // Control Room
};

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

const hexToRgb = (hexColor: string) => {
  const normalized = hexColor.replace("#", "");
  const expanded = normalized.length === 3
    ? normalized.split("").map((char) => char + char).join("")
    : normalized.padStart(6, "0");
  const value = parseInt(expanded, 16);
  if (Number.isNaN(value)) {
    return { r: 0, g: 0, b: 0 };
  }
  return {
    r: (value >> 16) & 255,
    g: (value >> 8) & 255,
    b: value & 255,
  };
};

const rgbToHex = (r: number, g: number, b: number) =>
  `#${[r, g, b]
    .map((channel) => Math.max(0, Math.min(255, Math.round(channel))).toString(16).padStart(2, "0"))
    .join("")}`;

const blendHexColors = (baseHex: string, targetHex: string, weight: number) => {
  const mix = clamp01(weight);
  const base = hexToRgb(baseHex);
  const target = hexToRgb(targetHex);
  return rgbToHex(
    base.r + (target.r - base.r) * mix,
    base.g + (target.g - base.g) * mix,
    base.b + (target.b - base.b) * mix
  );
};

const NEUTRAL_TERRITORY_SHADE = "#1e293b";

const normalizeSvgMarkup = (svgContent: string) => {
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgContent, "image/svg+xml");
  const svgElement = doc.querySelector("svg");

  if (!svgElement) return svgContent;

  svgElement.removeAttribute("width");
  svgElement.removeAttribute("height");
  svgElement.setAttribute("width", "100%");
  svgElement.setAttribute("height", "100%");
  svgElement.setAttribute("preserveAspectRatio", "xMidYMid meet");
  svgElement.style.width = "100%";
  svgElement.style.height = "100%";
  svgElement.style.display = "block";

  return svgElement.outerHTML;
};

const getZoneController = (zoneState?: ZoneState, clans?: Record<ClanId, ClanMetadata>) => {
  if (!zoneState) return { clan: null, dominance: 0, contested: false };

  const entries = Object.entries(zoneState.influence)
    .filter(([, influence]) => influence > 0)
    .sort((a, b) => b[1] - a[1]);

  if (entries.length === 0) return { clan: null, dominance: 0, contested: false };

  const [leaderId, leaderInfluence] = entries[0];
  const total = entries.reduce((sum, [, val]) => sum + val, 0);
  const dominance = total > 0 ? leaderInfluence / total : 0;

  const runnerUp = entries[1];
  const contested = !!runnerUp && Math.abs(leaderInfluence - runnerUp[1]) / Math.max(leaderInfluence, 1) <= 0.15;

  return {
    clan: clans?.[leaderId as ClanId],
    dominance,
    contested,
  };
};

export const ClanTerritoryMap: React.FC<ClanTerritoryMapProps> = ({ zones, clans }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [mapMarkup, setMapMarkup] = useState<string>("");

  useEffect(() => {
    if (typeof territoryMapSvgRaw === "string" && territoryMapSvgRaw.trim()) {
      setMapMarkup(normalizeSvgMarkup(territoryMapSvgRaw));
    } else {
      console.error("territory_map.svg failed to load via Vite raw import");
    }
  }, []);

  useEffect(() => {
    if (!mapMarkup) return;
    if (!containerRef.current) return;

    const svg = containerRef.current.querySelector("svg");
    if (!svg) return;

    svg.style.pointerEvents = "none";
    svg.querySelectorAll("path").forEach((path) => {
      if (!path.id?.startsWith("region_")) {
        const element = path as SVGElement;
        element.style.pointerEvents = "none";
      }
    });

    // Update each region based on zone control
    Object.entries(ZONE_TO_REGION).forEach(([zoneId, regionIds]) => {
      const ids = Array.isArray(regionIds) ? regionIds : [regionIds];
      
      ids.forEach(regionId => {
        const regionGroup = svg.querySelector(`#${regionId}`) as SVGGElement | null;
        if (!regionGroup) return;

        regionGroup.style.pointerEvents = "none";
        regionGroup.style.cursor = "default";
        regionGroup.style.transition = "fill 0.35s ease, stroke-width 0.3s ease, filter 0.4s ease, opacity 0.25s ease";

        const zoneState = zones[zoneId as ZoneId];
        const { clan, dominance, contested } = getZoneController(zoneState, clans);

        if (!clan) {
          regionGroup.style.fill = NEUTRAL_TERRITORY_SHADE;
          regionGroup.style.stroke = "#475569";
          regionGroup.style.strokeWidth = "2";
          regionGroup.style.strokeDasharray = "none";
          regionGroup.style.opacity = "0.6";
          regionGroup.style.filter = "none";
          return;
        }

        // Claimed by a clan
        const baseOpacity = Math.max(0.45, dominance);
        const baseStrokeWidth = contested ? "4" : "3";
        const hoverStrokeWidth = contested ? "5.5" : "4";
        const hoverFill = blendHexColors(clan.color, "#ffffff", contested ? 0.3 : 0.18);
        const baseFilter = `drop-shadow(0 0 ${contested ? 16 : 10}px ${clan.color})`;
        const hoverFilter = `drop-shadow(0 0 22px ${clan.color})`;

        regionGroup.style.fill = clan.color;
        regionGroup.style.stroke = clan.color;
        regionGroup.style.strokeWidth = baseStrokeWidth;
        regionGroup.style.strokeDasharray = contested ? "8 4" : "none";
        regionGroup.style.opacity = baseOpacity.toString();
        regionGroup.style.filter = baseFilter;
      });
    });
  }, [zones, clans, mapMarkup]);

  if (!mapMarkup) {
    return (
      <div className="relative rounded-3xl border border-slate-800/70 bg-gradient-to-br from-slate-950 via-slate-900 to-black p-6 shadow-2xl flex items-center justify-center h-96">
        <p className="text-slate-400">Loading map...</p>
      </div>
    );
  }

  return (
    <div className="relative rounded-3xl border border-slate-800/70 bg-gradient-to-br from-slate-950 via-slate-900 to-black p-6 shadow-2xl max-h-[450px] overflow-hidden">
      <div className="mb-3">
        <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400">Territory Control</h3>
      </div>
      
      <div
        ref={containerRef}
        className="w-full h-[340px] flex items-center justify-center overflow-hidden"
        dangerouslySetInnerHTML={{ __html: mapMarkup }}
      />

      {/* Legend */}
      <div className="absolute top-4 right-4 bg-slate-900/90 backdrop-blur rounded-xl border border-slate-700 p-3 space-y-2 max-h-72 overflow-y-auto z-10">
        <h4 className="text-xs font-bold text-white uppercase tracking-wide">Active Clans</h4>
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
    </div>
  );
};
