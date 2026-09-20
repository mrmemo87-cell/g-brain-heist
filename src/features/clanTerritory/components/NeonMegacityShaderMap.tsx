import React, { ReactNode, useEffect, useMemo, useRef, useState } from "react";
import type { ClanId, ClanMetadata, ZoneId, ZoneState } from "../clanTerritoryTypes";
import {
  NEON_MEGACITY_HEIGHT,
  NEON_MEGACITY_TERRITORIES,
  NEON_MEGACITY_WIDTH,
} from "../neonMegacityTerritories";
import {
  getZoneVisual,
  RENDER_HEIGHT,
  RENDER_WIDTH,
  territoryAtPoint,
  type ZoneVisual,
} from "./neonMegacityShader";
import { useNeonMegacityShader } from "./useNeonMegacityShader";

// @ts-expect-error - Vite raw asset import
import cityArtPart01 from "../assets/neon_megacity_base.part01.b64?raw";
// @ts-expect-error - Vite raw asset import
import cityArtPart02 from "../assets/neon_megacity_base.part02.b64?raw";
// @ts-expect-error - Vite raw asset import
import cityArtPart03 from "../assets/neon_megacity_base.part03.b64?raw";
// @ts-expect-error - Vite raw asset import
import cityArtPart04 from "../assets/neon_megacity_base.part04.b64?raw";
// @ts-expect-error - Vite raw asset import
import cityArtPart05 from "../assets/neon_megacity_base.part05.b64?raw";
// @ts-expect-error - Vite raw asset import
import cityArtPart06 from "../assets/neon_megacity_base.part06.b64?raw";
// @ts-expect-error - Vite raw asset import
import cityArtPart07 from "../assets/neon_megacity_base.part07.b64?raw";
// @ts-expect-error - Vite raw asset import
import cityArtPart08 from "../assets/neon_megacity_base.part08.b64?raw";
// @ts-expect-error - Vite raw asset import
import cityArtPart09 from "../assets/neon_megacity_base.part09.b64?raw";
// @ts-expect-error - Vite raw asset import
import cityArtPart10 from "../assets/neon_megacity_base.part10.b64?raw";
// @ts-expect-error - Vite raw asset import
import cityArtPart11 from "../assets/neon_megacity_base.part11.b64?raw";
// @ts-expect-error - Vite raw asset import
import cityArtPart12 from "../assets/neon_megacity_base.part12.b64?raw";

const cityArtUrl = `data:image/webp;base64,${cityArtPart01}${cityArtPart02}${cityArtPart03}${cityArtPart04}${cityArtPart05}${cityArtPart06}${cityArtPart07}${cityArtPart08}${cityArtPart09}${cityArtPart10}${cityArtPart11}${cityArtPart12}`;

export type NeonMegacityShaderMapProps = {
  zones: Record<ZoneId, ZoneState>;
  clans: Record<ClanId, ClanMetadata>;
  hideHeader?: boolean;
  hideLegend?: boolean;
  overlay?: ReactNode;
  selectedZoneId?: ZoneId | null;
  onZoneSelect?: (zoneId: ZoneId) => void;
  containerClassName?: string;
};

type PointerStart = {
  pointerId: number;
  x: number;
  y: number;
};

export const NeonMegacityShaderMap: React.FC<NeonMegacityShaderMapProps> = ({
  zones,
  clans,
  hideHeader = false,
  hideLegend = false,
  overlay,
  selectedZoneId = null,
  onZoneSelect,
  containerClassName = "",
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const startTimeRef = useRef<number>(performance.now() / 1000);
  const selectAtRef = useRef<number>(-999);
  const previousLeaderRef = useRef<Record<ZoneId, ClanId | null>>({});
  const captureAtRef = useRef<Record<ZoneId, number>>({});
  const pointerStartRef = useRef<PointerStart | null>(null);
  const [hoveredZoneId, setHoveredZoneId] = useState<ZoneId | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [shaderReady, setShaderReady] = useState(false);

  const zoneVisuals = useMemo(() => {
    const result: Record<ZoneId, ZoneVisual> = {};
    for (const territory of NEON_MEGACITY_TERRITORIES) {
      result[territory.zoneId] = getZoneVisual(zones[territory.zoneId], clans);
    }
    return result;
  }, [zones, clans]);

  const selectedVisual = selectedZoneId ? zoneVisuals[selectedZoneId] : undefined;
  const selectedTerritory = selectedZoneId
    ? NEON_MEGACITY_TERRITORIES.find((territory) => territory.zoneId === selectedZoneId)
    : undefined;

  const zoneVisualsRef = useRef(zoneVisuals);
  const selectedZoneRef = useRef<ZoneId | null>(selectedZoneId);
  const hoveredZoneRef = useRef<ZoneId | null>(hoveredZoneId);
  zoneVisualsRef.current = zoneVisuals;
  selectedZoneRef.current = selectedZoneId;
  hoveredZoneRef.current = hoveredZoneId;

  useEffect(() => {
    selectAtRef.current = performance.now() / 1000 - startTimeRef.current;
  }, [selectedZoneId]);

  useEffect(() => {
    const elapsed = performance.now() / 1000 - startTimeRef.current;
    for (const territory of NEON_MEGACITY_TERRITORIES) {
      const leader = zoneVisuals[territory.zoneId].entries[0]?.clanId ?? null;
      const previous = previousLeaderRef.current[territory.zoneId];
      if (leader && leader !== previous) captureAtRef.current[territory.zoneId] = elapsed;
      previousLeaderRef.current[territory.zoneId] = leader;
    }
  }, [zoneVisuals]);

  useNeonMegacityShader({
    canvasRef,
    cityArtUrl,
    zoneVisualsRef,
    selectedZoneRef,
    hoveredZoneRef,
    selectAtRef,
    captureAtRef,
    startTimeRef,
    onReady: setShaderReady,
    onError: setLoadError,
  });

  const territoryFromPointer = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    const x = ((event.clientX - rect.left) / rect.width) * NEON_MEGACITY_WIDTH;
    const y = ((event.clientY - rect.top) / rect.height) * NEON_MEGACITY_HEIGHT;
    return territoryAtPoint(x, y);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    // Touch does not have a useful hover state and retaining one after a tap can
    // make the map look selected when it is not.
    if (event.pointerType === "touch") return;
    setHoveredZoneId(territoryFromPointer(event)?.zoneId ?? null);
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!onZoneSelect) return;
    pointerStartRef.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!onZoneSelect) return;
    const start = pointerStartRef.current;
    pointerStartRef.current = null;

    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture?.(event.pointerId);
    }

    if (!start || start.pointerId !== event.pointerId) return;
    const movement = Math.hypot(event.clientX - start.x, event.clientY - start.y);
    if (movement > 14) return;

    const territory = territoryFromPointer(event);
    if (!territory) return;
    event.preventDefault();
    setHoveredZoneId(event.pointerType === "touch" ? null : territory.zoneId);
    onZoneSelect(territory.zoneId);
  };

  const handlePointerCancel = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (pointerStartRef.current?.pointerId === event.pointerId) {
      pointerStartRef.current = null;
    }
    setHoveredZoneId(null);
  };

  const activeClanIds = useMemo(() => {
    const ids = new Set<ClanId>();
    Object.values(zones).forEach((zone) => {
      Object.entries(zone.influence ?? {}).forEach(([clanId, influence]) => {
        if (influence > 0) ids.add(clanId);
      });
    });
    return ids;
  }, [zones]);
  const visibleClans = Object.values(clans).filter((clan) => activeClanIds.has(clan.id)).slice(0, 6);

  return (
    <div className={`relative w-full overflow-hidden rounded-2xl border border-cyan-950/60 bg-slate-950 ${containerClassName}`}>
      {!hideHeader && (
        <div className="flex items-center justify-between gap-3 border-b border-cyan-950/40 bg-slate-950/90 px-3 py-2.5 sm:px-4 sm:py-3">
          <div>
            <h3 className="text-xs font-black uppercase tracking-[0.18em] text-cyan-100 sm:text-sm">Neon Megacity</h3>
            <p className="mt-0.5 text-[10px] text-slate-400 sm:text-[11px]">Live occupation · dynamic clan lighting</p>
          </div>
          {selectedTerritory && selectedVisual && (
            <div className="text-right">
              <div className="text-[11px] font-bold text-white sm:text-xs">{selectedTerritory.name}</div>
              <div className="text-[10px] text-slate-400 sm:text-[11px]">{Math.round(selectedVisual.occupation)}% occupied</div>
            </div>
          )}
        </div>
      )}

      <div className="relative aspect-[16/9] w-full overflow-hidden bg-black">
        <img src={cityArtUrl} alt="Neon Megacity" className="pointer-events-none absolute inset-0 h-full w-full select-none object-cover" draggable={false} />
        <canvas
          ref={canvasRef}
          width={RENDER_WIDTH}
          height={RENDER_HEIGHT}
          aria-label="Interactive Neon Megacity territory map"
          className={`relative z-[1] block h-full w-full select-none transition-opacity duration-300 ${shaderReady ? "opacity-100" : "opacity-0"} ${onZoneSelect ? "cursor-crosshair" : "cursor-default"}`}
          style={{ touchAction: onZoneSelect ? "pan-y" : "auto" }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerCancel}
          onPointerLeave={() => setHoveredZoneId(null)}
        />

        {NEON_MEGACITY_TERRITORIES.map((territory) => {
          const visual = zoneVisuals[territory.zoneId];
          if (!visual || visual.rawTotal <= 0) return null;
          return (
            <div
              key={territory.zoneId}
              className={`pointer-events-none absolute z-[2] hidden -translate-x-1/2 -translate-y-1/2 rounded-md border px-1.5 py-1 shadow-lg backdrop-blur-sm sm:block ${selectedZoneId === territory.zoneId ? "border-yellow-300/70 bg-slate-950/88" : "border-cyan-200/10 bg-slate-950/68"}`}
              style={{ left: `${(territory.badgeAnchor[0] / NEON_MEGACITY_WIDTH) * 100}%`, top: `${(territory.badgeAnchor[1] / NEON_MEGACITY_HEIGHT) * 100}%` }}
            >
              <div className="max-w-[86px] truncate whitespace-nowrap text-[8px] font-black tracking-wide text-slate-100 lg:max-w-[104px] lg:text-[9px]">{territory.name}</div>
              <div className="mt-1 flex h-1 min-w-14 overflow-hidden rounded-full bg-slate-700/80">
                {visual.entries.map((entry) => <span key={entry.clanId} style={{ width: `${entry.territoryPct}%`, backgroundColor: entry.color }} />)}
                {visual.neutralPct > 0 && <span className="bg-slate-500/80" style={{ width: `${visual.neutralPct}%` }} />}
              </div>
            </div>
          );
        })}

        {onZoneSelect && (
          <div className="pointer-events-none absolute bottom-2 left-1/2 z-[2] -translate-x-1/2 rounded-full border border-cyan-300/15 bg-slate-950/72 px-2.5 py-1 text-[9px] font-bold text-cyan-100 backdrop-blur sm:hidden">
            Tap a district
          </div>
        )}

        {loadError && <div className="pointer-events-none absolute inset-0 z-[3] flex items-end justify-center px-6 pb-3 text-center text-xs text-amber-200">{loadError}</div>}
      </div>

      {overlay}

      {selectedTerritory && selectedVisual && (
        <div className="border-t border-slate-800/80 bg-slate-950/95 px-3 py-2.5 sm:px-4 sm:py-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-xs font-black text-white">{selectedTerritory.name}</div>
              <div className="text-[9px] uppercase tracking-[0.16em] text-slate-500 sm:text-[10px]">{selectedTerritory.type}</div>
            </div>
            <div className="text-right">
              <div className="text-[9px] uppercase tracking-wider text-slate-500 sm:text-[10px]">Occupation</div>
              <div className="text-base font-black text-white sm:text-lg">{Math.round(selectedVisual.occupation)}%</div>
            </div>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-1.5 lg:grid-cols-4">
            {selectedVisual.entries.map((entry) => (
              <div key={entry.clanId} className="rounded-lg bg-slate-900/80 px-2.5 py-2 text-[10px] sm:text-[11px]">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-bold" style={{ color: entry.color }}>{entry.name}</span>
                  <span className="font-black text-white">{Math.round(entry.territoryPct)}%</span>
                </div>
              </div>
            ))}
            {selectedVisual.neutralPct > 0 && (
              <div className="rounded-lg bg-slate-900/80 px-2.5 py-2 text-[10px] sm:text-[11px]"><div className="flex items-center justify-between gap-2"><span className="font-bold text-slate-400">Neutral</span><span className="font-black text-white">{Math.round(selectedVisual.neutralPct)}%</span></div></div>
            )}
          </div>
        </div>
      )}

      {!hideLegend && visibleClans.length > 0 && (
        <div className="border-t border-slate-800/80 bg-slate-900/70 px-3 py-2.5 sm:px-4 sm:py-3">
          <div className="flex flex-wrap gap-2">
            {visibleClans.map((clan) => (
              <div key={clan.id} className="flex items-center gap-2 rounded-lg bg-slate-800/50 px-2 py-1.5 text-[11px] sm:text-xs">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: clan.color }} />
                <span className="font-semibold text-white">{clan.name}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};