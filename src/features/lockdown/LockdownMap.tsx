import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { RegionStats } from "./lockdownTypes";
import { REGION_NAMES } from "./regionCalculator";
import { getClanColor, NEUTRAL_COLOR } from "../../utils/clanColors";
// @ts-expect-error - Vite injects raw SVG strings for ?raw imports
import territoryMapSvgRaw from "./assets/territory_map.svg?raw";

// Placeholder SVG until territory_map.svg is supplied
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
  <text x="400" y="450" text-anchor="middle" fill="#64748b" font-size="16">Add your territory_map.svg to src/features/lockdown/assets/</text>
</svg>
`;

const normalizeRegionKey = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");

const LEGACY_REGION_KEYS: Record<string, string[]> = {
  region_1: ["signalchamber"],
  region_2: ["quantumnexus"],
};

const normalizeSvgMarkup = (svgContent: string) => {
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgContent, "image/svg+xml");
  const svgElement = doc.querySelector("svg");

  if (!svgElement) return svgContent;

  const widthAttribute = svgElement.getAttribute("width");
  const heightAttribute = svgElement.getAttribute("height");
  const viewBoxAttribute = svgElement.getAttribute("viewBox");
  if (!viewBoxAttribute && widthAttribute && heightAttribute) {
    const widthValue = parseFloat(widthAttribute);
    const heightValue = parseFloat(heightAttribute);
    if (!Number.isNaN(widthValue) && !Number.isNaN(heightValue)) {
      svgElement.setAttribute("viewBox", `0 0 ${widthValue} ${heightValue}`);
    }
  }

  svgElement.removeAttribute("width");
  svgElement.removeAttribute("height");
  svgElement.setAttribute("width", "100%");
  svgElement.setAttribute("height", "100%");
  svgElement.setAttribute("preserveAspectRatio", "xMidYMid meet");
  svgElement.style.width = "100%";
  svgElement.style.height = "100%";
  svgElement.style.maxWidth = "100%";
  svgElement.style.maxHeight = "100%";
  svgElement.style.transformOrigin = "center center";
  svgElement.style.transform = "none";
  svgElement.removeAttribute("transform");
  svgElement.style.display = "block";

  return svgElement.outerHTML;
};

interface LockdownMapProps {
  regionStats?: Record<string, RegionStats>;
  className?: string;
  mapId?: string;
}

// Color resolution: prefer session-assigned color from state, fallback to shared utility
const resolveClanColor = (stats: RegionStats, topClan?: RegionStats["topClan"]) => {
  if (!topClan) return NEUTRAL_COLOR;
  return (
    topClan.color
    ?? stats.clanStats.find((clan) => clan.clanId === topClan.clanId)?.color
    ?? getClanColor(topClan.clanId)
  );
};

// Map configurations
const MAP_CONFIGS: Record<string, { label: string; description: string }> = {
  default: { label: 'Default', description: 'Standard 8-region layout' },
  downtown: { label: 'Downtown', description: 'Urban grid with 12 sectors' },
  compound: { label: 'Compound', description: 'Facility with 6 zones' },
  vault: { label: 'Vault', description: 'High security, 4 chambers' },
};

export const LockdownMap: React.FC<LockdownMapProps> = ({ regionStats, className = "", mapId = 'default' }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  const lastRegionStyleKeyRef = useRef<Record<string, string>>({});
  const resolveRegionElement = (svg: SVGSVGElement, regionId: string): SVGElement | null => {
    const direct = svg.querySelector<SVGElement>(`#${regionId}`);
    if (direct) return direct;

    const normalizedTargets = new Set<string>([normalizeRegionKey(regionId)]);
    (LEGACY_REGION_KEYS[regionId] ?? []).forEach((key) => normalizedTargets.add(normalizeRegionKey(key)));

    const candidates = svg.querySelectorAll<SVGElement>("[id]");
    for (const element of candidates) {
      if (normalizedTargets.has(normalizeRegionKey(element.id))) {
        if (element.id !== regionId) {
          element.id = regionId;
        }
        return element;
      }
    }

    return null;
  };
  const paintElement = (element: SVGElement, fill: string, stroke: string, opacity: string) => {
    element.setAttribute("fill", fill);
    element.setAttribute("stroke", stroke);
    element.setAttribute("opacity", opacity);
    element.style.fill = fill;
    element.style.stroke = stroke;
    element.style.opacity = opacity;
  };
  const applyRegionColors = (
    regionElement: Element,
    fill: string,
    stroke: string,
    opacity: string
  ) => {
    if (regionElement instanceof SVGElement) {
      paintElement(regionElement, fill, stroke, opacity);
    }
    const childElements = regionElement.querySelectorAll<SVGElement>(
      "path, rect, circle, ellipse, polygon, polyline, line"
    );
    childElements.forEach((child) => paintElement(child, fill, stroke, opacity));
    
    // Preserve text color but update opacity
    const textElements = regionElement.querySelectorAll<SVGTextElement>("text");
    textElements.forEach((text) => {
      text.style.opacity = opacity;
      text.setAttribute("opacity", opacity);
    });
  };

  const mapMarkup = useMemo(() => {
    const rawSvg = territoryMapSvgRaw || placeholderMap;
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
      .lockdown-map-region polyline,
      .lockdown-map-region line {
        transition: fill 0.25s linear, opacity 0.35s ease, stroke 0.3s ease;
        pointer-events: auto;
      }
      
      .lockdown-map-region text {
        transition: opacity 0.35s ease;
        pointer-events: none;
      }
      
      .lockdown-map-region:hover path,
      .lockdown-map-region:hover rect,
      .lockdown-map-region:hover circle,
      .lockdown-map-region:hover ellipse,
      .lockdown-map-region:hover polygon,
      .lockdown-map-region:hover polyline,
      .lockdown-map-region:hover line {
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
      const regionGroup = resolveRegionElement(svg, regionId);
      if (!regionGroup) {
        console.warn(`LockdownMap: Region element not found for ID: ${regionId}`);
        return;
      }

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
        applyRegionColors(regionGroup, "#1f2937", "#475569", "0.5");
        return;
      }

      // Set color based on top clan
      const clanColor = resolveClanColor(stats, topClan);
      const opacity = Math.max(0.3, topClan.percentage / 100); // Scale opacity by percentage

      // Memoization: skip if style unchanged
      const styleKey = `${topClan.clanId}|${clanColor}|${opacity.toFixed(3)}`;
      if (lastRegionStyleKeyRef.current[regionId] === styleKey) {
        return;
      }
      lastRegionStyleKeyRef.current[regionId] = styleKey;

      applyRegionColors(
        regionGroup,
        clanColor,
        clanColor,
        opacity.toString()
      );
    });
  }, [mounted, regionStats, mapMarkup]);

  useLayoutEffect(() => {
    if (!mounted || !containerRef.current) return;

    const svg = containerRef.current.querySelector<SVGSVGElement>("svg");
    if (!svg) return;

    const normalizeViewBoxToContent = () => {
      try {
        const elements = svg.querySelectorAll<SVGGraphicsElement>(
          "path, rect, circle, ellipse, polygon, polyline, line, g"
        );
        if (!elements.length) return;

        let minX = Number.POSITIVE_INFINITY;
        let minY = Number.POSITIVE_INFINITY;
        let maxX = Number.NEGATIVE_INFINITY;
        let maxY = Number.NEGATIVE_INFINITY;

        elements.forEach((element) => {
          const box = element.getBBox();
          if (!Number.isFinite(box.x) || !Number.isFinite(box.y) || box.width <= 0 || box.height <= 0) return;
          minX = Math.min(minX, box.x);
          minY = Math.min(minY, box.y);
          maxX = Math.max(maxX, box.x + box.width);
          maxY = Math.max(maxY, box.y + box.height);
        });

        if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) return;

        const width = Math.max(1, maxX - minX);
        const height = Math.max(1, maxY - minY);
        const padding = Math.max(width, height) * 0.04;
        svg.setAttribute(
          "viewBox",
          `${minX - padding} ${minY - padding} ${width + padding * 2} ${height + padding * 2}`
        );
      } catch (error) {
        console.warn("LockdownMap: unable to normalize SVG viewBox", error);
      }
    };

    normalizeViewBoxToContent();

    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => normalizeViewBoxToContent());
    observer.observe(containerRef.current);

    return () => observer.disconnect();
  }, [mounted, mapMarkup, mapId]);

  return (
    <div className={`relative ${className}`}>
      <div
        ref={containerRef}
        className="w-full h-full flex items-center justify-center overflow-hidden"
        dangerouslySetInnerHTML={{ __html: mapMarkup }}
      />
      {regionStats && (
        <div className="absolute top-4 right-4 bg-slate-900/90 backdrop-blur rounded-xl border border-slate-700 p-4 space-y-2 max-h-96 overflow-y-auto">
          <h3 className="text-sm font-bold text-white uppercase tracking-wide">Region Control</h3>
          {Object.entries(regionStats).map(([regionId, stats]) => {
            const topClan = stats.topClan;
            if (!topClan) return null;
            const regionLabel = REGION_NAMES[regionId] ?? regionId.replace(/_/g, " ");

            return (
              <div
                key={regionId}
                className="flex items-center gap-2 text-xs p-2 rounded-lg bg-slate-800/50"
              >
                <div
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: resolveClanColor(stats, topClan) }}
                />
                <div className="flex-1">
                  <p className="text-white font-semibold">{regionLabel}</p>
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
