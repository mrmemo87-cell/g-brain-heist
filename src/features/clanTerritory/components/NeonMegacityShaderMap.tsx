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

  const handlePointer = (event: React.PointerEvent<HTMLCanvasElement>, select: boolean) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * NEON_MEGACITY_WIDTH;
    const y = ((event.clientY - rect.top) / rect.height) * NEON_MEGACITY_HEIGHT;
    const territory = territoryAtPoint(x, y);
    setHoveredZoneId(territory?.zoneId ?? null);
    if (select && territory && onZoneSelect) onZoneSelect(territory.zoneId);
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
        <div className="flex items-center justify-between gap-3 border-b border-cyan-950/40 bg-slate-950/90 px-4 py-3">
          <div>
            <h3 className="text-sm font-black uppercase tracking-[0.18em] text-cyan-100">Neon Megacity</h3>
            <p className="mt-0.5 text-[11px] text-slate-400">Live occupation · dynamic clan lighting</p>
          </div>
          {selectedTerritory && selectedVisual && (
            <div className="text-right">
              <div className="text-xs font-bold text-white">{selectedTerritory.name}</div>
              <div className="text-[11px] text-slate-400">{Math.round(selectedVisual.occupation)}% occupied</div>
            </div>
          )}
        </div>
      )}

      <div className="relative aspect-[16/9] w-full overflow-hidden bg-black">
        <img src={cityArtUrl} alt="Neon Megacity" className="absolute inset-0 h-full w-full object-cover" draggable={false} />
        <canvas
          ref={canvasRef}
          width={RENDER_WIDTH}
          height={RENDER_HEIGHT}
          aria-label="Interactive Neon Megacity territory map"
          className={`relative z-[1] block h-full w-full transition-opacity duration-300 ${shaderReady ? "opacity-100" : "opacity-0"} ${onZoneSelect ? "cursor-crosshair" : "cursor-default"}`}
          onPointerMove={(event) => handlePointer(event, false)}
          onPointerLeave={() => setHoveredZoneId(null)}
          onClick={(event) => handlePointer(event, true)}
        />

        {NEON_MEGACITY_TERRITORIES.map((territory) => {
          const visual = zoneVisuals[territory.zoneId];
          if (!visual || visual.rawTotal <= 0) return null;
          return (
            <div
              key={territory.zoneId}
              className={`pointer-events-none absolute z-[2] -translate-x-1/2 -translate-y-1/2 rounded-lg border px-2 py-1.5 text-[9px] shadow-xl backdrop-blur-md ${selectedZoneId === territory.zoneId ? "border-yellow-300/70 bg-slate-950/90" : "border-cyan-200/15 bg-slate-950/80"}`}
              style={{ left: `${(territory.badgeAnchor[0] / NEON_MEGACITY_WIDTH) * 100}%`, top: `${(territory.badgeAnchor[1] / NEON_MEGACITY_HEIGHT) * 100}%` }}
            >
              <div className="mb-1 whitespace-nowrap font-black tracking-wide text-slate-100">{territory.name}</div>
              <div className="flex max-w-40 flex-wrap items-center gap-x-1.5 gap-y-0.5 font-black">
                {visual.entries.map((entry) => (
                  <span key={entry.clanId} style={{ color: entry.color }}>{entry.name.slice(0, 1).toUpperCase()} {Math.round(entry.territoryPct)}%</span>
                ))}
                {visual.neutralPct > 0 && <span className="text-slate-400">N {Math.round(visual.neutralPct)}%</span>}
              </div>
              <div className="mt-1 flex h-1 overflow-hidden rounded-full bg-slate-800">
                {visual.entries.map((entry) => <span key={entry.clanId} style={{ width: `${entry.territoryPct}%`, backgroundColor: entry.color }} />)}
                {visual.neutralPct > 0 && <span className="bg-slate-600" style={{ width: `${visual.neutralPct}%` }} />}
              </div>
            </div>
          );
        })}

        {loadError && <div className="absolute inset-0 z-[3] flex items-end justify-center px-6 pb-3 text-center text-xs text-amber-200">{loadError}</div>}
      </div>

      {overlay}

      {selectedTerritory && selectedVisual && (
        <div className="border-t border-slate-800/80 bg-slate-950/90 px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-xs font-black text-white">{selectedTerritory.name}</div>
              <div className="text-[10px] uppercase tracking-[0.16em] text-slate-500">{selectedTerritory.type}</div>
            </div>
            <div className="text-right">
              <div className="text-[10px] uppercase tracking-wider text-slate-500">Occupation</div>
              <div className="text-lg font-black text-white">{Math.round(selectedVisual.occupation)}%</div>
            </div>
          </div>
          <div className="mt-2 grid gap-1.5 sm:grid-cols-2 lg:grid-cols-4">
            {selectedVisual.entries.map((entry) => (
              <div key={entry.clanId} className="rounded-lg bg-slate-900/80 px-2.5 py-2 text-[11px]">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-bold" style={{ color: entry.color }}>{entry.name}</span>
                  <span className="font-black text-white">{Math.round(entry.territoryPct)}%</span>
                </div>
              </div>
            ))}
            {selectedVisual.neutralPct > 0 && (
              <div className="rounded-lg bg-slate-900/80 px-2.5 py-2 text-[11px]"><div className="flex items-center justify-between gap-2"><span className="font-bold text-slate-400">Neutral</span><span className="font-black text-white">{Math.round(selectedVisual.neutralPct)}%</span></div></div>
            )}
          </div>
        </div>
      )}

      {!hideLegend && visibleClans.length > 0 && (
        <div className="border-t border-slate-800/80 bg-slate-900/70 px-4 py-3">
          <div className="flex flex-wrap gap-2">
            {visibleClans.map((clan) => (
              <div key={clan.id} className="flex items-center gap-2 rounded-lg bg-slate-800/50 px-2 py-1.5 text-xs">
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
