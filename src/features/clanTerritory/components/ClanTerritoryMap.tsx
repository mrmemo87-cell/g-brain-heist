import React, { useEffect, useRef, useState } from "react";
// @ts-expect-error - Vite injects raw SVG strings for ?raw imports
import territoryMapSvgRaw from "../assets/territory_map.svg?raw";
import {
  ClanId,
  ClanMetadata,
  ZoneId,
  ZoneState,
} from "../clanTerritoryTypes";

interface ClanTerritoryMapProps {
  zones: Record<ZoneId, ZoneState>;
  clans: Record<ClanId, ClanMetadata>;
}

const ZONE_TO_REGION: Record<ZoneId, string | string[]> = {
  "zone-1": "region_5",
  "zone-2": "region_7",
  "zone-3": "region_6",
  "zone-4": "region_4",
  "zone-5": "region_8",
  "zone-6": "region_3",
};

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

const hexToRgb = (hexColor: string) => {
  const normalized = hexColor.replace("#", "");
  const expanded =
    normalized.length === 3
      ? normalized.split("").map((c) => c + c).join("")
      : normalized.padStart(6, "0");
  const value = parseInt(expanded, 16);
  if (Number.isNaN(value)) return { r: 0, g: 0, b: 0 };
  return {
    r: (value >> 16) & 255,
    g: (value >> 8) & 255,
    b: value & 255,
  };
};

const rgbToHex = (r: number, g: number, b: number) =>
  `#${[r, g, b]
    .map((c) => Math.max(0, Math.min(255, Math.round(c))).toString(16).padStart(2, "0"))
    .join("")}`;

const blendHexColors = (baseHex: string, targetHex: string, weight: number) => {
  const mix = clamp01(weight);
  const b = hexToRgb(baseHex);
  const t = hexToRgb(targetHex);
  return rgbToHex(
    b.r + (t.r - b.r) * mix,
    b.g + (t.g - b.g) * mix,
    b.b + (t.b - b.b) * mix
  );
};

const NEUTRAL_TERRITORY_SHADE = "#1e293b";

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
  svgEl.style.display = "block";

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

  return {
    clan: clans?.[leaderId as ClanId] ?? null,
    dominance,
    contested: !!contested,
  };
};

export const ClanTerritoryMap: React.FC<ClanTerritoryMapProps> = ({
  zones,
  clans,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [mapMarkup, setMapMarkup] = useState("");
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
    element.setAttribute("fill", fill);
    element.setAttribute("stroke", stroke);
    element.setAttribute("stroke-width", strokeWidth);
    element.setAttribute("stroke-dasharray", dashArray);
    element.setAttribute("opacity", opacity.toString());

    element.style.fill = fill;
    element.style.stroke = stroke;
    element.style.strokeWidth = strokeWidth;
    element.style.setProperty("stroke-dasharray", dashArray);
    element.style.opacity = opacity.toString();
  };

  useEffect(() => {
    if (typeof territoryMapSvgRaw === "string" && territoryMapSvgRaw.trim()) {
      setMapMarkup(normalizeSvgMarkup(territoryMapSvgRaw));
    }
  }, []);

  useEffect(() => {
    if (!mapMarkup) return;
    if (!containerRef.current) return;

    const svg = containerRef.current.querySelector("svg");
    if (!svg) return;

    svg.style.pointerEvents = "none";

    Object.entries(ZONE_TO_REGION).forEach(([zoneId, regionIds]) => {
      const ids = Array.isArray(regionIds) ? regionIds : [regionIds];

      ids.forEach((regionId) => {
        const regionPath = svg.querySelector(
          `#${regionId}`
        ) as SVGPathElement | null;
        if (!regionPath) return;

        const zoneState = zones[zoneId as ZoneId];
        const { clan, dominance, contested } = getZoneController(
          zoneState,
          clans
        );

        // Neutral region
        if (!clan) {
          applyRegionVisuals(regionPath, {
            fill: NEUTRAL_TERRITORY_SHADE,
            stroke: "#475569",
            strokeWidth: "2",
            dashArray: "none",
            opacity: 0.6,
          });
          regionPath.style.filter = "none";
          return;
        }

        // Clan-owned
        const dominanceStrength = clamp01(dominance);
        const baseOpacity = dominanceStrength >= 0.75 ? 1 : 0.85;
        const baseStrokeWidth = contested ? "4" : "3";

        applyRegionVisuals(regionPath, {
          fill: clan.color,
          stroke: clan.color,
          strokeWidth: baseStrokeWidth,
          dashArray: contested ? "8 4" : "none",
          opacity: baseOpacity,
        });

        regionPath.style.filter = `drop-shadow(0 0 ${
          contested ? 16 : 10
        }px ${clan.color})`;
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
        <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400">
          Territory Control
        </h3>
      </div>

      <div
        ref={containerRef}
        className="w-full h-[340px] flex items-center justify-center overflow-hidden"
        dangerouslySetInnerHTML={{ __html: mapMarkup }}
      />

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
    </div>
  );
};
