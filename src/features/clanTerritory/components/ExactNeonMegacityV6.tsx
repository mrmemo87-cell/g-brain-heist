import React, { useEffect, useMemo, useRef, useState } from "react";
import type { ClanId, ClanMetadata, ZoneId, ZoneState } from "../clanTerritoryTypes";

export type ExactNeonMegacityV6Props = {
  zones: Record<ZoneId, ZoneState>;
  clans: Record<ClanId, ClanMetadata>;
  selectedZoneId?: ZoneId | null;
  onZoneSelect?: (zoneId: ZoneId) => void;
  className?: string;
  title?: string;
};

type V6Message =
  | { source: "brain-heist-neon-v6"; type: "ready" }
  | { source: "brain-heist-neon-v6"; type: "zone-selected"; zoneId: ZoneId }
  | { source: "brain-heist-neon-v6"; type: "error"; message?: string };

const RUNTIME_URL = "/neon-megacity-v6/runtime.html";

export const ExactNeonMegacityV6: React.FC<ExactNeonMegacityV6Props> = ({
  zones,
  clans,
  selectedZoneId = null,
  onZoneSelect,
  className = "",
  title = "Neon Megacity V6",
}) => {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [ready, setReady] = useState(false);
  const clanSlots = useMemo(() => Object.values(clans).slice(0, 4), [clans]);

  const runtimeState = useMemo(() => {
    const mappedZones: Record<string, { inf: number[] }> = {};
    for (let district = 1; district <= 10; district += 1) {
      const zoneId = `zone-${district}` as ZoneId;
      const zone = zones[zoneId];
      mappedZones[district] = {
        inf: clanSlots.map((clan) => Number(zone?.influence?.[clan.id] ?? 0)),
      };
    }
    return { zones: mappedZones, selectedZoneId };
  }, [zones, clanSlots, selectedZoneId]);

  const runtimeClans = useMemo(
    () => clanSlots.map((clan) => ({
      name: clan.name,
      short: clan.name.trim().slice(0, 1).toUpperCase() || "?",
      hex: clan.color,
    })),
    [clanSlots],
  );

  const post = (message: unknown) => {
    iframeRef.current?.contentWindow?.postMessage(message, window.location.origin);
  };

  const syncRuntime = () => {
    post({ source: "brain-heist-neon-v6", type: "set-clans", clans: runtimeClans });
    post({ source: "brain-heist-neon-v6", type: "set-state", payload: runtimeState });
  };

  useEffect(() => {
    const handleMessage = (event: MessageEvent<V6Message>) => {
      if (event.origin !== window.location.origin) return;
      if (event.source !== iframeRef.current?.contentWindow) return;
      if (!event.data || event.data.source !== "brain-heist-neon-v6") return;

      if (event.data.type === "ready") {
        setReady(true);
        syncRuntime();
        return;
      }

      if (event.data.type === "zone-selected") {
        onZoneSelect?.(event.data.zoneId);
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  });

  useEffect(() => {
    if (!ready) return;
    syncRuntime();
  }, [ready, runtimeClans, runtimeState]);

  return (
    <div
      data-exact-neon-megacity-v6
      className={`relative w-full overflow-hidden rounded-[18px] border border-cyan-200/20 bg-[#020611] shadow-[0_22px_80px_rgba(0,0,0,.48)] ${className}`}
    >
      <iframe
        ref={iframeRef}
        src={RUNTIME_URL}
        title={title}
        className="block h-[min(900px,calc(100vh-96px))] min-h-[620px] w-full border-0 bg-[#020611]"
        sandbox="allow-scripts allow-same-origin"
        onLoad={() => {
          setReady(true);
          window.setTimeout(syncRuntime, 0);
        }}
      />
    </div>
  );
};
