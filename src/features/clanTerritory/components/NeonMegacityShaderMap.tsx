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

const shortClanName = (name: string) => name.trim().slice(0, 1).toUpperCase() || "?";

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
  const viewportRef = useRef<HTMLDivElement | null>(null);
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

  const selectedTerritory = selectedZoneId
    ? NEON_MEGACITY_TERRITORIES.find((territory) => territory.zoneId === selectedZoneId)
    : undefined;
  const selectedVisual = selectedZoneId ? zoneVisuals[selectedZoneId] : undefined;

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
      const previousLeader = previousLeaderRef.current[territory.zoneId];
      if (leader && leader !== previousLeader) {
        captureAtRef.current[territory.zoneId] = elapsed;
      }
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

  const territoryFromClientPoint = (clientX: number, clientY: number) => {
    const viewport = viewportRef.current;
    if (!viewport) return null;
    const rect = viewport.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    const x = Math.max(
      0,
      Math.min(NEON_MEGACITY_WIDTH - 1, ((clientX - rect.left) / rect.width) * NEON_MEGACITY_WIDTH),
    );
    const y = Math.max(
      0,
      Math.min(NEON_MEGACITY_HEIGHT - 1, ((clientY - rect.top) / rect.height) * NEON_MEGACITY_HEIGHT),
    );
    return territoryAtPoint(x, y);
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!onZoneSelect) return;
    pointerStartRef.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
    };
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "touch") return;
    const territory = territoryFromClientPoint(event.clientX, event.clientY);
    setHoveredZoneId(territory?.zoneId ?? null);
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!onZoneSelect) return;
    const start = pointerStartRef.current;
    pointerStartRef.current = null;
    if (!start || start.pointerId !== event.pointerId) return;
    if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > 20) return;
    const territory = territoryFromClientPoint(event.clientX, event.clientY);
    if (!territory) return;
    event.preventDefault();
    setHoveredZoneId(event.pointerType === "touch" ? null : territory.zoneId);
    onZoneSelect(territory.zoneId);
  };

  const handlePointerCancel = () => {
    pointerStartRef.current = null;
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
    <div
      data-neon-megacity-v6-map
      className={`relative w-full overflow-hidden rounded-[18px] border border-cyan-200/20 bg-[#020611] shadow-[0_22px_80px_rgba(0,0,0,.48)] ${containerClassName}`}
    >
      {!hideHeader && (
        <div className="flex items-center justify-between gap-3 border-b border-cyan-200/15 bg-[#020710]/95 px-3 py-2.5 sm:px-4 sm:py-3">
          <div>
            <h3 className="text-xs font-black uppercase tracking-[0.18em] text-cyan-100 sm:text-sm">Neon Megacity</h3>
            <p className="mt-0.5 text-[10px] text-[#8aa8ba] sm:text-[11px]">V6 pure clan-color lighting</p>
          </div>
          {selectedTerritory && selectedVisual && (
            <div className="text-right">
              <div className="text-[11px] font-bold text-white sm:text-xs">{selectedTerritory.name}</div>
              <div className="text-[10px] text-[#8aa8ba] sm:text-[11px]">{Math.round(selectedVisual.occupation)}% occupied</div>
            </div>
          )}
        </div>
      )}

      <div
        ref={viewportRef}
        data-v6-map-viewport
        className="relative w-full overflow-hidden bg-[#020611]"
        style={{
          aspectRatio: `${NEON_MEGACITY_WIDTH} / ${NEON_MEGACITY_HEIGHT}`,
          cursor: onZoneSelect ? "pointer" : "default",
          touchAction: onZoneSelect ? "manipulation" : "auto",
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        onPointerLeave={() => setHoveredZoneId(null)}
      >
        <img
          src={cityArtUrl}
          alt="Neon Megacity"
          className="pointer-events-none absolute inset-0 h-full w-full select-none object-fill"
          draggable={false}
        />
        <canvas
          ref={canvasRef}
          width={RENDER_WIDTH}
          height={RENDER_HEIGHT}
          aria-label="Neon Megacity V6 pure clan-color shader"
          className={`pointer-events-none absolute inset-0 z-[1] block h-full w-full select-none ${shaderReady ? "opacity-100" : "opacity-0"}`}
        />

        <div className="pointer-events-none absolute inset-0 z-[2]">
          {NEON_MEGACITY_TERRITORIES.map((territory) => {
            const visual = zoneVisuals[territory.zoneId];
            if (!visual || visual.rawTotal <= 0) return null;
            const isSelected = selectedZoneId === territory.zoneId;
            return (
              <div
                key={territory.zoneId}
                data-v6-territory-badge={territory.zoneId}
                className="absolute min-w-[92px] max-w-[128px] -translate-x-1/2 -translate-y-1/2 rounded-[9px] border bg-[#030913]/85 px-[7px] py-[5px] text-center text-[#eefbff] shadow-[0_7px_20px_rgba(0,0,0,.30)] backdrop-blur-[7px]"
                style={{
                  left: `${(territory.badgeAnchor[0] / NEON_MEGACITY_WIDTH) * 100}%`,
                  top: `${(territory.badgeAnchor[1] / NEON_MEGACITY_HEIGHT) * 100}%`,
                  borderColor: isSelected ? "rgba(250,204,21,.68)" : "rgba(145,205,230,.16)",
                }}
              >
                <div className="mb-1 text-[8px] font-black tracking-[0.08em] text-[#b9ddec]">
                  {territory.id} · {territory.name}
                </div>
                <div className="flex flex-wrap justify-center gap-x-[5px] gap-y-[2px]">
                  {visual.entries.map((entry) => (
                    <span key={entry.clanId} className="text-[9px] font-black" style={{ color: entry.color }}>
                      {shortClanName(entry.name)}{Math.round(entry.territoryPct)}
                    </span>
                  ))}
                  {visual.neutralPct > 0 && (
                    <span className="text-[9px] font-black text-slate-400">Ø{Math.round(visual.neutralPct)}</span>
                  )}
                </div>
                <div className="mt-[5px] flex h-1 overflow-hidden rounded-full bg-[#101b2a]">
                  {visual.entries.map((entry) => (
                    <span
                      key={entry.clanId}
                      className="h-full"
                      style={{ width: `${entry.territoryPct}%`, backgroundColor: entry.color }}
                    />
                  ))}
                  {visual.neutralPct > 0 && (
                    <span className="h-full bg-[#475569]" style={{ width: `${visual.neutralPct}%` }} />
                  )}
                </div>
                {visual.contested && (
                  <div className="mt-1 text-[8px] font-black tracking-[0.11em] text-fuchsia-200">CONTESTED</div>
                )}
              </div>
            );
          })}
        </div>

        {loadError && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[4] bg-slate-950/90 px-3 py-1 text-center text-[9px] text-amber-200">
            Enhanced V6 lighting unavailable — direct district selection remains active.
          </div>
        )}
      </div>

      {overlay}

      {!hideHeader && selectedTerritory && selectedVisual && (
        <div className="border-t border-cyan-200/10 bg-[#020710]/95 px-3 py-2.5 sm:px-4 sm:py-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="text-xs font-black text-white">{selectedTerritory.name}</div>
              <div className="text-[9px] uppercase tracking-[0.16em] text-[#8aa8ba]">{selectedTerritory.type}</div>
            </div>
            <div className="text-right">
              <div className="text-[9px] uppercase text-[#8aa8ba]">Occupation</div>
              <div className="text-base font-black text-white">{Math.round(selectedVisual.occupation)}%</div>
            </div>
          </div>
        </div>
      )}

      {!hideLegend && visibleClans.length > 0 && (
        <div className="border-t border-cyan-200/10 bg-[#07111f]/90 px-3 py-2.5">
          <div className="flex flex-wrap gap-2">
            {visibleClans.map((clan) => (
              <div key={clan.id} className="flex items-center gap-2 rounded-lg bg-[#0d1729] px-2 py-1.5 text-[11px]">
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
