import React, { ReactNode, useEffect, useMemo, useRef, useState } from "react";
import type { ClanId, ClanMetadata, ZoneId, ZoneState } from "../clanTerritoryTypes";
import {
  NEON_MEGACITY_HEIGHT,
  NEON_MEGACITY_TERRITORIES,
  NEON_MEGACITY_WIDTH,
} from "../neonMegacityTerritories";
import { getZoneVisual, RENDER_HEIGHT, RENDER_WIDTH, type ZoneVisual } from "./neonMegacityShader";
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

type PointerStart = { pointerId: number; x: number; y: number; zoneId: ZoneId };

const polygonPoints = (points: readonly (readonly [number, number])[]) =>
  points.map(([x, y]) => `${x},${y}`).join(" ");

const firstTerritoryId = NEON_MEGACITY_TERRITORIES[0]?.zoneId ?? ("zone-1" as ZoneId);

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
  const [immersiveOpen, setImmersiveOpen] = useState(false);
  const [focusedZoneId, setFocusedZoneId] = useState<ZoneId>(selectedZoneId ?? firstTerritoryId);

  const embeddedMode = hideHeader && hideLegend;
  const embeddedInteractive = embeddedMode && Boolean(onZoneSelect);

  const zoneVisuals = useMemo(() => {
    const result: Record<ZoneId, ZoneVisual> = {};
    for (const territory of NEON_MEGACITY_TERRITORIES) {
      result[territory.zoneId] = getZoneVisual(zones[territory.zoneId], clans);
    }
    return result;
  }, [zones, clans]);

  const displayZoneId = immersiveOpen ? focusedZoneId : selectedZoneId;
  const displayTerritory = NEON_MEGACITY_TERRITORIES.find((territory) => territory.zoneId === displayZoneId)
    ?? NEON_MEGACITY_TERRITORIES[0];
  const displayVisual = displayTerritory ? zoneVisuals[displayTerritory.zoneId] : undefined;

  const zoneVisualsRef = useRef(zoneVisuals);
  const selectedZoneRef = useRef<ZoneId | null>(displayZoneId ?? null);
  const hoveredZoneRef = useRef<ZoneId | null>(hoveredZoneId);
  zoneVisualsRef.current = zoneVisuals;
  selectedZoneRef.current = displayZoneId ?? null;
  hoveredZoneRef.current = hoveredZoneId;

  useEffect(() => {
    if (selectedZoneId) setFocusedZoneId(selectedZoneId);
  }, [selectedZoneId]);

  useEffect(() => {
    if (!embeddedInteractive) return;
    if (selectedZoneId === null) setImmersiveOpen(true);
  }, [embeddedInteractive, selectedZoneId]);

  useEffect(() => {
    selectAtRef.current = performance.now() / 1000 - startTimeRef.current;
  }, [displayZoneId]);

  useEffect(() => {
    const elapsed = performance.now() / 1000 - startTimeRef.current;
    for (const territory of NEON_MEGACITY_TERRITORIES) {
      const leader = zoneVisuals[territory.zoneId].entries[0]?.clanId ?? null;
      const previous = previousLeaderRef.current[territory.zoneId];
      if (leader && leader !== previous) captureAtRef.current[territory.zoneId] = elapsed;
      previousLeaderRef.current[territory.zoneId] = leader;
    }
  }, [zoneVisuals]);

  useEffect(() => {
    if (!immersiveOpen || typeof document === "undefined") return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [immersiveOpen]);

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

  const handleTerritoryPointerDown = (event: React.PointerEvent<SVGPolygonElement>, zoneId: ZoneId) => {
    if (!onZoneSelect) return;
    pointerStartRef.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      zoneId,
    };
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Safari may reject pointer capture if a scroll gesture has already started.
    }
  };

  const focusTerritory = (zoneId: ZoneId) => {
    setFocusedZoneId(zoneId);
    setHoveredZoneId(null);
    if (!immersiveOpen && embeddedInteractive) setImmersiveOpen(true);
  };

  const handleTerritoryPointerUp = (event: React.PointerEvent<SVGPolygonElement>, zoneId: ZoneId) => {
    if (!onZoneSelect) return;
    const start = pointerStartRef.current;
    pointerStartRef.current = null;
    if (!start || start.pointerId !== event.pointerId || start.zoneId !== zoneId) return;
    if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > 20) return;
    event.preventDefault();
    focusTerritory(zoneId);
  };

  const handleTerritoryPointerCancel = (event: React.PointerEvent<SVGPolygonElement>) => {
    if (pointerStartRef.current?.pointerId === event.pointerId) pointerStartRef.current = null;
    setHoveredZoneId(null);
  };

  const deployFocusedTerritory = () => {
    if (!onZoneSelect || !focusedZoneId) return;
    onZoneSelect(focusedZoneId);
    setImmersiveOpen(false);
  };

  const activeClanIds = useMemo(() => {
    const ids = new Set<ClanId>();
    Object.values(zones).forEach((zone) => {
      Object.entries(zone.influence ?? {}).forEach(([id, value]) => {
        if (value > 0) ids.add(id);
      });
    });
    return ids;
  }, [zones]);

  const visibleClans = Object.values(clans).filter((clan) => activeClanIds.has(clan.id)).slice(0, 6);

  const mapViewport = (
    <div
      className="relative w-full overflow-hidden bg-[#020611]"
      style={{ aspectRatio: `${NEON_MEGACITY_WIDTH} / ${NEON_MEGACITY_HEIGHT}` }}
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
        aria-label="Neon Megacity V6 shader layer"
        className={`pointer-events-none absolute inset-0 z-[1] block h-full w-full select-none ${shaderReady ? "opacity-100" : "opacity-0"}`}
      />

      <svg
        className="absolute inset-0 z-[2] h-full w-full select-none"
        viewBox={`0 0 ${NEON_MEGACITY_WIDTH} ${NEON_MEGACITY_HEIGHT}`}
        preserveAspectRatio="none"
        aria-label="Interactive Neon Megacity territory hit layer"
        style={{ touchAction: onZoneSelect ? "manipulation" : "auto" }}
      >
        {NEON_MEGACITY_TERRITORIES.map((territory) => (
          <polygon
            key={territory.zoneId}
            data-territory-hit={territory.zoneId}
            points={polygonPoints(territory.points)}
            fill="rgba(255,255,255,0.001)"
            stroke="rgba(255,255,255,0.001)"
            strokeWidth={12}
            vectorEffect="non-scaling-stroke"
            role={onZoneSelect ? "button" : undefined}
            tabIndex={onZoneSelect ? 0 : -1}
            aria-label={onZoneSelect ? `Focus ${territory.name}` : undefined}
            style={{
              pointerEvents: onZoneSelect ? "all" : "none",
              cursor: onZoneSelect ? "pointer" : "default",
              touchAction: onZoneSelect ? "manipulation" : "auto",
            }}
            onPointerDown={(event) => handleTerritoryPointerDown(event, territory.zoneId)}
            onPointerUp={(event) => handleTerritoryPointerUp(event, territory.zoneId)}
            onPointerCancel={handleTerritoryPointerCancel}
            onPointerEnter={(event) => {
              if (event.pointerType !== "touch") setHoveredZoneId(territory.zoneId);
            }}
            onPointerLeave={(event) => {
              if (event.pointerType !== "touch") setHoveredZoneId(null);
            }}
            onKeyDown={(event) => {
              if (!onZoneSelect) return;
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                focusTerritory(territory.zoneId);
              }
            }}
          />
        ))}
      </svg>

      {NEON_MEGACITY_TERRITORIES.map((territory) => {
        const visual = zoneVisuals[territory.zoneId];
        if (!visual || visual.rawTotal <= 0) return null;
        const shares = [...visual.entries];
        const isFocused = displayZoneId === territory.zoneId;
        return (
          <div
            key={`badge-${territory.zoneId}`}
            data-v6-territory-badge={territory.zoneId}
            className={`pointer-events-none absolute z-[3] min-w-[92px] max-w-[128px] -translate-x-1/2 -translate-y-1/2 rounded-[9px] border px-[7px] py-[5px] text-center shadow-[0_7px_20px_rgba(0,0,0,.30)] backdrop-blur-[7px] ${immersiveOpen ? "block" : "hidden sm:block"} ${isFocused ? "border-yellow-300/70 bg-[#030913]/95" : "border-cyan-100/15 bg-[#030913]/85"}`}
            style={{
              left: `${(territory.badgeAnchor[0] / NEON_MEGACITY_WIDTH) * 100}%`,
              top: `${(territory.badgeAnchor[1] / NEON_MEGACITY_HEIGHT) * 100}%`,
            }}
          >
            <div className="mb-1 text-[8px] font-black tracking-[0.08em] text-[#b9ddec]">
              {territory.id} · {territory.name}
            </div>
            <div className="flex flex-wrap justify-center gap-x-[5px] gap-y-[2px]">
              {shares.map((entry) => (
                <span key={entry.clanId} className="text-[9px] font-black" style={{ color: entry.color }}>
                  {entry.name.slice(0, 1).toUpperCase()}{Math.round(entry.territoryPct)}
                </span>
              ))}
              {visual.neutralPct > 0 && (
                <span className="text-[9px] font-black text-slate-400">Ø{Math.round(visual.neutralPct)}</span>
              )}
            </div>
            <div className="mt-[5px] flex h-1 overflow-hidden rounded-full bg-[#101b2a]">
              {shares.map((entry) => (
                <span key={entry.clanId} style={{ width: `${entry.territoryPct}%`, backgroundColor: entry.color }} />
              ))}
              {visual.neutralPct > 0 && (
                <span className="bg-slate-600" style={{ width: `${visual.neutralPct}%` }} />
              )}
            </div>
            {visual.contested && (
              <div className="mt-1 text-[8px] font-black tracking-[0.11em] text-fuchsia-200">CONTESTED</div>
            )}
          </div>
        );
      })}

      {embeddedInteractive && !immersiveOpen && (
        <button
          type="button"
          data-v6-open-tactical-map
          onClick={() => {
            setFocusedZoneId(selectedZoneId ?? focusedZoneId);
            setImmersiveOpen(true);
          }}
          className="absolute right-2 top-2 z-[5] rounded-lg border border-cyan-300/35 bg-[#030913]/90 px-2.5 py-2 text-[9px] font-black uppercase tracking-[0.12em] text-cyan-100 shadow-lg backdrop-blur sm:right-3 sm:top-3 sm:text-[10px]"
        >
          Tactical Map
        </button>
      )}

      {loadError && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[6] bg-slate-950/90 px-3 py-1 text-center text-[9px] text-amber-200">
          Enhanced V6 lighting unavailable — territory selection remains active.
        </div>
      )}
    </div>
  );

  if (immersiveOpen) {
    const leader = displayVisual?.entries[0];
    return (
      <div data-v6-immersive-map className="fixed inset-0 z-[9999] flex flex-col overflow-hidden bg-[#02060d] text-[#e8fbff]">
        <div className="flex shrink-0 flex-col gap-2 border-b border-cyan-900/30 bg-[#030913] px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between sm:px-4">
          <div>
            <div className="text-xs font-black uppercase tracking-[0.18em] text-cyan-100 sm:text-base">
              BRAIN HEIST · NEON MEGACITY · TACTICAL MAP
            </div>
            <div className="mt-0.5 text-[9px] text-[#8ba8ba] sm:text-[11px]">
              V6 pure clan-color lighting · tap a district to inspect it
            </div>
          </div>
          <div className="flex items-center gap-2">
            {selectedZoneId && (
              <button
                type="button"
                onClick={() => setImmersiveOpen(false)}
                className="rounded-lg border border-slate-600 bg-[#0b1728] px-3 py-2 text-[10px] font-black text-slate-200 sm:text-xs"
              >
                Resume battle
              </button>
            )}
            <button
              type="button"
              onClick={deployFocusedTerritory}
              className="rounded-lg border border-cyan-300/50 bg-cyan-400/15 px-3 py-2 text-[10px] font-black text-cyan-100 shadow-[0_0_18px_rgba(34,211,238,.10)] sm:text-xs"
            >
              {selectedZoneId === focusedZoneId ? "Stay in district" : "Deploy to district"}
            </button>
          </div>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-y-auto p-2.5 xl:grid-cols-[minmax(0,1fr)_315px] xl:overflow-hidden xl:p-3">
          <section className="min-w-0 overflow-hidden rounded-2xl border border-cyan-950/60 bg-[#030813] shadow-[0_20px_60px_rgba(0,0,0,.35)]">
            {mapViewport}
            <div className="flex items-center justify-between gap-3 border-t border-cyan-950/40 bg-[#030913]/95 px-3 py-2 text-[10px] text-[#b6d2df] sm:px-4 sm:text-[11px]">
              <span>Tap a district. Clan colors live inside the city lighting — territory polygons stay invisible.</span>
              <span className="hidden whitespace-nowrap font-black text-cyan-200 sm:inline">V6 LIVE</span>
            </div>
          </section>

          <aside className="min-h-0 space-y-3 xl:overflow-y-auto">
            <section className="rounded-2xl border border-cyan-950/60 bg-[#07111f]/95 p-3.5 shadow-[0_18px_40px_rgba(0,0,0,.28)]">
              <div className="text-[9px] font-black uppercase tracking-[0.2em] text-[#8ba8ba]">Selected territory</div>
              <div className="mt-1 flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-xl font-black text-white">{displayTerritory?.name ?? "District"}</h3>
                  <p className="text-[10px] text-[#8ba8ba]">
                    {displayTerritory ? `${displayTerritory.key} · ${displayTerritory.type}` : ""}
                  </p>
                </div>
                {displayVisual?.contested && (
                  <span className="rounded-full border border-fuchsia-300/30 bg-fuchsia-400/10 px-2 py-1 text-[8px] font-black tracking-[0.12em] text-fuchsia-200">
                    CONTESTED
                  </span>
                )}
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2">
                <div className="rounded-xl border border-slate-700/60 bg-[#0d1729] p-2.5">
                  <div className="text-[9px] text-[#8ba8ba]">Leader</div>
                  <div className="mt-0.5 truncate text-base font-black" style={{ color: leader?.color ?? "#94a3b8" }}>
                    {leader?.name ?? "Neutral"}
                  </div>
                </div>
                <div className="rounded-xl border border-slate-700/60 bg-[#0d1729] p-2.5">
                  <div className="text-[9px] text-[#8ba8ba]">Occupation</div>
                  <div className="mt-0.5 text-base font-black text-white">{Math.round(displayVisual?.occupation ?? 0)}%</div>
                </div>
              </div>

              <div className="mt-3 space-y-2">
                {Object.values(clans).map((clan) => {
                  const entry = displayVisual?.entries.find((candidate) => candidate.clanId === clan.id);
                  const pct = Math.round(entry?.territoryPct ?? 0);
                  return (
                    <div key={clan.id} className="grid grid-cols-[74px_1fr_34px] items-center gap-2 text-[10px]">
                      <span className="truncate text-slate-300">{clan.name}</span>
                      <div className="h-2 overflow-hidden rounded-full bg-[#111e31]">
                        <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: clan.color }} />
                      </div>
                      <b className="text-right text-white">{pct}%</b>
                    </div>
                  );
                })}
                {(displayVisual?.neutralPct ?? 0) > 0 && (
                  <div className="grid grid-cols-[74px_1fr_34px] items-center gap-2 text-[10px]">
                    <span className="text-slate-400">Neutral</span>
                    <div className="h-2 overflow-hidden rounded-full bg-[#111e31]">
                      <div className="h-full rounded-full bg-slate-600" style={{ width: `${displayVisual?.neutralPct ?? 0}%` }} />
                    </div>
                    <b className="text-right text-white">{Math.round(displayVisual?.neutralPct ?? 0)}%</b>
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={deployFocusedTerritory}
                className="mt-4 w-full rounded-xl border border-cyan-300/45 bg-cyan-400/15 px-3 py-3 text-xs font-black uppercase tracking-[0.1em] text-cyan-100 active:scale-[0.99]"
              >
                {selectedZoneId === focusedZoneId ? "Stay in this district" : `Deploy to ${displayTerritory?.name ?? "district"}`}
              </button>
            </section>

            <section className="rounded-2xl border border-cyan-950/60 bg-[#07111f]/95 p-3.5">
              <div className="mb-2 text-[9px] font-black uppercase tracking-[0.2em] text-[#8ba8ba]">Live occupation</div>
              <div className="space-y-1.5">
                {NEON_MEGACITY_TERRITORIES.map((territory) => {
                  const visual = zoneVisuals[territory.zoneId];
                  const top = visual.entries[0];
                  return (
                    <button
                      type="button"
                      key={territory.zoneId}
                      onClick={() => focusTerritory(territory.zoneId)}
                      className={`w-full rounded-lg border px-2.5 py-2 text-left transition ${focusedZoneId === territory.zoneId ? "border-yellow-300/45 bg-yellow-300/5" : "border-slate-800 bg-[#0b1525] hover:border-cyan-900/70"}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-[10px] font-black text-white">{territory.id}. {territory.name}</span>
                        <span className="text-[9px] font-black" style={{ color: top?.color ?? "#64748b" }}>
                          {visual.rawTotal > 0 ? `${Math.round(visual.occupation)}%` : "Neutral"}
                        </span>
                      </div>
                      <div className="mt-1.5 flex h-1 overflow-hidden rounded-full bg-[#101b2a]">
                        {visual.entries.map((entry) => (
                          <span key={entry.clanId} style={{ width: `${entry.territoryPct}%`, backgroundColor: entry.color }} />
                        ))}
                        {visual.neutralPct > 0 && <span className="bg-slate-600" style={{ width: `${visual.neutralPct}%` }} />}
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>
          </aside>
        </div>
      </div>
    );
  }

  const selectedTerritory = selectedZoneId
    ? NEON_MEGACITY_TERRITORIES.find((territory) => territory.zoneId === selectedZoneId)
    : undefined;
  const selectedVisual = selectedZoneId ? zoneVisuals[selectedZoneId] : undefined;

  return (
    <div className={`relative w-full overflow-hidden rounded-2xl border border-cyan-950/60 bg-[#020611] ${containerClassName}`}>
      {!hideHeader && (
        <div className="flex items-center justify-between gap-3 border-b border-cyan-950/40 bg-slate-950/90 px-3 py-2.5 sm:px-4 sm:py-3">
          <div>
            <h3 className="text-xs font-black uppercase tracking-[0.18em] text-cyan-100 sm:text-sm">Neon Megacity</h3>
            <p className="mt-0.5 text-[10px] text-slate-400 sm:text-[11px]">V6 pure clan-color tactical map</p>
          </div>
          {selectedTerritory && selectedVisual && (
            <div className="text-right">
              <div className="text-[11px] font-bold text-white sm:text-xs">{selectedTerritory.name}</div>
              <div className="text-[10px] text-slate-400 sm:text-[11px]">{Math.round(selectedVisual.occupation)}% occupied</div>
            </div>
          )}
        </div>
      )}

      {mapViewport}
      {overlay}

      {!embeddedMode && selectedTerritory && selectedVisual && (
        <div className="border-t border-slate-800/80 bg-slate-950/95 px-3 py-2.5 sm:px-4 sm:py-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="text-xs font-black text-white">{selectedTerritory.name}</div>
              <div className="text-[9px] uppercase tracking-[0.16em] text-slate-500">{selectedTerritory.type}</div>
            </div>
            <div className="text-right">
              <div className="text-[9px] uppercase text-slate-500">Occupation</div>
              <div className="text-base font-black text-white">{Math.round(selectedVisual.occupation)}%</div>
            </div>
          </div>
        </div>
      )}

      {!hideLegend && visibleClans.length > 0 && (
        <div className="border-t border-slate-800/80 bg-slate-900/70 px-3 py-2.5">
          <div className="flex flex-wrap gap-2">
            {visibleClans.map((clan) => (
              <div key={clan.id} className="flex items-center gap-2 rounded-lg bg-slate-800/50 px-2 py-1.5 text-[11px]">
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
