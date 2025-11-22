import React, { useEffect, useMemo, useRef, useState } from "react";
import { RegionStats } from "./lockdownTypes";
// @ts-expect-error - Vite injects raw SVG strings for ?raw imports
import lockdownMapSvgRaw from "./assets/lockdown_map.svg?raw";

// Placeholder SVG until lockdown_map.svg is supplied
const placeholderMap = `
<svg viewBox="0 0 800 600" xmlns="http://www.w3.org/2000/svg">
  <rect width="800" height="600" fill="#0f172a"/>
  <g id="region_1"><rect x="50" y="50" width="150" height="150" fill="#1e293b" stroke="#475569" stroke-width="2"/><text x="125"
 y="125" text-anchor="middle" fill="#94a3b8" font-size="14">Region 1</text></g>
  <g id="region_2"><rect x="220" y="50" width="150" height="150" fill="#1e293b" stroke="#475569" stroke-width="2"/><text x="295"
  y="125" text-anchor="middle" fill="#94a3b8" font-size="14">Region 2</text></g>
  <g id="region_3"><rect x="390" y="50" width="150" height="150" fill="#1e293b" stroke="#475569" stroke-width="2"/><text x="465"
  y="125" text-anchor="middle" fill="#94a3b8" font-size="14">Region 3</text></g>
  <g id="region_4"><rect x="560" y="50" width="150" height="150" fill="#1e293b" stroke="#475569" stroke-width="2"/><text x="635"
  y="125" text-anchor="middle" fill="#94a3b8" font-size="14">Region 4</text></g>
  <g id="region_5"><rect x="50" y="220" width="150" height="150" fill="#1e293b" stroke="#475569" stroke-width="2"/><text x="125"
  y="295" text-anchor="middle" fill="#94a3b8" font-size="14">Region 5</text></g>
  <g id="region_6"><rect x="220" y="220" width="150" height="150" fill="#1e293b" stroke="#475569" stroke-width="2"/><text x="295"
  y="295" text-anchor="middle" fill="#94a3b8" font-size="14">Region 6</text></g>
  <g id="region_7"><rect x="390" y="220" width="150" height="150" fill="#1e293b" stroke="#475569" stroke-width="2"/><text x="465"
  y="295" text-anchor="middle" fill="#94a3b8" font-size="14">Region 7</text></g>
  <g id="region_8"><rect x="560" y="220" width="150" height="150" fill="#1e293b" stroke="#475569" stroke-width="2"/><text x="635"
  y="295" text-anchor="middle" fill="#94a3b8" font-size="14">Region 8</text></g>
  <text x="400" y="450" text-anchor="middle" fill="#64748b" font-size="16">Add your lockdown_map.svg to src/features/lockdown/assets/</text>
</svg>
`;

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

interface LockdownMapProps {
  regionStats?: Record<string, RegionStats>;
  className?: string;
}

// Color palette for clans (can be extended)
const CLAN_COLORS: Record<string, string> = {
  default: "#10b981", // emerald-500
  clan1: "#3b82f6", // blue-500
  clan2: "#ef4444", // red-500
  clan3: "#f59e0b", // amber-500
  clan4: "#8b5cf6", // violet-500
  clan5: "#ec4899", // pink-500
  clan6: "#06b6d4", // cyan-500
  clan7: "#f97316", // orange-500
};

const getColorForClan = (clanId: string): string => {
  const hash = clanId.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const colors = Object.values(CLAN_COLORS).slice(1); // Exclude default
  return colors[hash % colors.length] || CLAN_COLORS.default;
};

export const LockdownMap: React.FC<LockdownMapProps> = ({ regionStats, className = "" }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  const lastRegionStyleKeyRef = useRef<Record<string, string>>({});

  const mapMarkup = useMemo(() => {
    const rawSvg = lockdownMapSvgRaw || placeholderMap;
    if (typeof DOMParser === "undefined") return rawSvg;
    return normalizeSvgMarkup(rawSvg);
  }, []);

  useEffect(() => {
    const styleId = "lockdown-map-region-style";
    if (document.getElementById(styleId)) return;

    const style = document.createElement("style");
    style.id = styleId;
    style.textContent = `
      /* Base region styles - child elements get CSS variables via setAttribute */
      .lockdown-map-region {
        cursor: pointer;
        transition: filter 0.3s ease;
      }
      
      /* Child elements use CSS variables set via setAttribute */
      .lockdown-map-region path,
      .lockdown-map-region rect,
      .lockdown-map-region circle,
      .lockdown-map-region ellipse,
      .lockdown-map-region polygon,
      .lockdown-map-region polyline {
        transition: fill 0.25s linear, opacity 0.35s ease, stroke 0.3s ease;
        pointer-events: none;
      }
      
      .lockdown-map-region:hover path,
      .lockdown-map-region:hover rect,
      .lockdown-map-region:hover circle,
      .lockdown-map-region:hover ellipse,
      .lockdown-map-region:hover polygon,
      .lockdown-map-region:hover polyline {
        opacity: 1 !important;
      }
    `;

    document.head.appendChild(style);

    return () => {
      style.remove();
    };
  }, []);

  useEffect(() => {
    if (containerRef.current && mapMarkup) {
      setMounted(true);
    }
  }, [mapMarkup]);

  useEffect(() => {
    if (!mounted || !containerRef.current || !regionStats) return;

    const svg = containerRef.current.querySelector("svg");
    if (!svg) return;

    // Update each region based on clan statistics
    // Clean SVG with no inline styles means CSS variables work perfectly via inheritance
    Object.entries(regionStats).forEach(([regionId, stats]) => {
      const regionGroup = svg.querySelector(`#${regionId}`) as SVGGElement | null;
      if (!regionGroup) return;

      // Add class for CSS inheritance
      if (!regionGroup.classList.contains("lockdown-map-region")) {
        regionGroup.classList.add("lockdown-map-region");
      }

      const topClan = stats.topClan;
      if (!topClan) {
        // No data - set to neutral colors
        const neutralKey = `neutral|#1f2937|0.5|#475569`;
        if (lastRegionStyleKeyRef.current[regionId] === neutralKey) {
          return;
        }
        lastRegionStyleKeyRef.current[regionId] = neutralKey;
        
        // Set CSS variables on parent for reference
        regionGroup.style.setProperty("--region-base-fill", "#1f2937");
        regionGroup.style.setProperty("--region-base-opacity", "0.5");
        regionGroup.style.setProperty("--region-base-stroke", "#475569");
        
        // Apply CSS variables to all child elements via setAttribute
        const childElements = regionGroup.querySelectorAll<SVGElement>("path, rect, circle, ellipse, polygon, polyline");
        childElements.forEach((child) => {
          child.setAttribute("fill", "var(--region-base-fill)");
          child.setAttribute("opacity", "var(--region-base-opacity)");
          child.setAttribute("stroke", "var(--region-base-stroke)");
        });
        return;
      }

      // Set color based on top clan
      const clanColor = topClan.color || getColorForClan(topClan.clanId);
      const opacity = Math.max(0.3, topClan.percentage / 100); // Scale opacity by percentage

      // Memoization: skip if style unchanged
      const styleKey = `${topClan.clanId}|${clanColor}|${opacity.toFixed(3)}`;
      if (lastRegionStyleKeyRef.current[regionId] === styleKey) {
        return;
      }
      lastRegionStyleKeyRef.current[regionId] = styleKey;

      // Set CSS variables on parent for reference
      regionGroup.style.setProperty("--region-base-fill", clanColor);
      regionGroup.style.setProperty("--region-base-opacity", opacity.toString());
      regionGroup.style.setProperty("--region-base-stroke", clanColor);
      
      // Apply CSS variables to all child elements via setAttribute
      // This works perfectly with cleaned SVG that has no inline fill/stroke styles
      const childElements = regionGroup.querySelectorAll<SVGElement>("path, rect, circle, ellipse, polygon, polyline");
      childElements.forEach((child) => {
        child.setAttribute("fill", "var(--region-base-fill)");
        child.setAttribute("opacity", "var(--region-base-opacity)");
        child.setAttribute("stroke", "var(--region-base-stroke)");
      });
    });
  }, [mounted, regionStats, mapMarkup]);

  return (
    <div className={`relative ${className}`}>
      <div
        ref={containerRef}
        className="w-full h-full flex items-center justify-center"
        dangerouslySetInnerHTML={{ __html: mapMarkup }}
      />
      {regionStats && (
        <div className="absolute top-4 right-4 bg-slate-900/90 backdrop-blur rounded-xl border border-slate-700 p-4 space-y-2 max-h-96 overflow-y-auto">
          <h3 className="text-sm font-bold text-white uppercase tracking-wide">Region Control</h3>
          {Object.entries(regionStats).map(([regionId, stats]) => {
            const topClan = stats.topClan;
            if (!topClan) return null;

            return (
              <div
                key={regionId}
                className="flex items-center gap-2 text-xs p-2 rounded-lg bg-slate-800/50"
              >
                <div
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: topClan.color || getColorForClan(topClan.clanId) }}
                />
                <div className="flex-1">
                  <p className="text-white font-semibold">{regionId.replace(/_/g, " ")}</p>
                  <p className="text-slate-400">
                    {topClan.clanName} - {topClan.percentage.toFixed(0)}%
                  </p>
                </div>
                {topClan.avatarUrl && (
                  <img
                    src={topClan.avatarUrl}
                    alt={topClan.clanName}
                    className="w-6 h-6 rounded-full border border-slate-600"
                  />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
