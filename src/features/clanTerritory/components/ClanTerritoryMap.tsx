import React, { useEffect, useRef, useState } from "react";
// @ts-expect-error - Vite injects raw SVG strings for ?raw imports
import territoryMapSvgRaw from "../assets/territory_map.svg?raw";
import {
  ClanId,
  ClanMetadata,
  ZoneId,
  ZoneState,
  getClanColor,
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
}) => {
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
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    setMapMarkup(normalizeSvgMarkup(territoryMapSvgRaw));
  }, []);

  useEffect(() => {
    if (!mapMarkup || !containerRef.current) return;

    const svg = containerRef.current.querySelector("svg");
    if (!svg) return;

    svg.style.pointerEvents = "none";

    const ensureInitialAttributes = (element: SVGPathElement) => {
      if (!element.getAttribute("data-initial-fill")) {
        const initialFill =
          element.getAttribute("fill") ||
          element.style.fill ||
          NEUTRAL_TERRITORY_SHADE;
        element.setAttribute("data-initial-fill", initialFill);
      }
      if (!element.getAttribute("data-initial-stroke")) {
        const initialStroke =
          element.getAttribute("stroke") ||
          element.style.stroke ||
          "#475569";
        element.setAttribute("data-initial-stroke", initialStroke);
      }
      if (!element.getAttribute("data-initial-stroke-width")) {
        const initialStrokeWidth =
          element.getAttribute("stroke-width") ||
          element.style.strokeWidth ||
          "2";
        element.setAttribute("data-initial-stroke-width", initialStrokeWidth);
      }
      if (!element.getAttribute("data-initial-dasharray")) {
        const initialDash =
          element.getAttribute("stroke-dasharray") ||
          element.style.getPropertyValue("stroke-dasharray") ||
          "none";
        element.setAttribute("data-initial-dasharray", initialDash);
      }
      if (!element.getAttribute("data-initial-opacity")) {
        const initialOpacity =
          element.getAttribute("opacity") ||
          element.style.opacity ||
          "1";
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
      if (element.getAttribute("fill") !== fill) {
        element.setAttribute("fill", fill);
      }
      if (element.getAttribute("stroke") !== stroke) {
        element.setAttribute("stroke", stroke);
      }
      if (element.getAttribute("stroke-width") !== strokeWidth) {
        element.setAttribute("stroke-width", strokeWidth);
      }
      if (element.getAttribute("stroke-dasharray") !== dashArray) {
        element.setAttribute("stroke-dasharray", dashArray);
      }
      const opacityValue = opacity.toString();
      if (element.getAttribute("opacity") !== opacityValue) {
        element.setAttribute("opacity", opacityValue);
      }
    };

    const updateRegions = () => {
      Object.entries(ZONE_TO_REGION).forEach(([zoneId, regionIds]) => {
        const ids = Array.isArray(regionIds) ? regionIds : [regionIds];

        ids.forEach((regionId) => {
          const regionPath = svg.querySelector(`#${regionId}`) as
            | SVGPathElement
            | null;
          if (!regionPath) return;

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
              opacity: Number.isNaN(capturedOpacity) ? 1 : capturedOpacity,
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

    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
    }

    rafRef.current = requestAnimationFrame(updateRegions);

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
