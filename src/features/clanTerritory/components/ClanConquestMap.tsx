import React from "react";
import {
  ClanId,
  ClanMetadata,
  ZoneId,
  ZoneState,
  ZONES,
} from "../clanTerritoryTypes";

interface ClanConquestMapProps {
  zones: Record<ZoneId, ZoneState>;
  clans: Record<ClanId, ClanMetadata>;
  variant?: "full" | "mini";
}

interface RegionLayout {
  id: ZoneId;
  path: string;
  labelPosition: { x: number; y: number };
}

const REGION_LAYOUT: RegionLayout[] = [
  { id: "zone-1", path: "M40 40 H210 V140 H40 Z", labelPosition: { x: 70, y: 95 } },
  { id: "zone-2", path: "M240 30 H420 V130 H240 Z", labelPosition: { x: 260, y: 85 } },
  { id: "zone-3", path: "M440 60 H580 V180 H440 Z", labelPosition: { x: 470, y: 120 } },
  { id: "zone-4", path: "M60 180 H230 V330 H60 Z", labelPosition: { x: 85, y: 250 } },
  { id: "zone-5", path: "M260 170 H400 V330 H260 Z", labelPosition: { x: 280, y: 250 } },
  { id: "zone-6", path: "M420 200 H580 V340 H420 Z", labelPosition: { x: 445, y: 280 } },
  { id: "zone-7", path: "M40 360 H220 V480 H40 Z", labelPosition: { x: 80, y: 420 } },
  { id: "zone-8", path: "M260 360 H580 V480 H260 Z", labelPosition: { x: 380, y: 420 } },
];

const hexToRgba = (hex: string, alpha: number) => {
  const normalized = hex.replace("#", "");
  const bigint = parseInt(normalized, 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

const getZoneDetails = (zoneState?: ZoneState) => {
  if (!zoneState) {
    return { controllingClan: null as ClanId | null, dominance: 0, contested: false };
  }
  const entries = Object.entries(zoneState.influence);
  if (entries.length === 0) {
    return { controllingClan: null as ClanId | null, dominance: 0, contested: false };
  }

  const ordered = entries
    .filter(([, influence]) => influence > 0)
    .sort((a, b) => b[1] - a[1]);

  const leader = ordered[0];
  if (!leader) {
    return { controllingClan: null as ClanId | null, dominance: 0, contested: false };
  }

  const runnerUp = ordered[1];
  const total = ordered.reduce((sum, [, val]) => sum + val, 0);
  const dominance = total > 0 ? leader[1] / total : 0;
  const contested = !!runnerUp && Math.abs(leader[1] - runnerUp[1]) / Math.max(leader[1], 1) <= 0.1;

  return { controllingClan: leader[0] as ClanId, dominance, contested };
};

const ClanAvatarBadge: React.FC<{ clan?: ClanMetadata; x: number; y: number }> = ({ clan, x, y }) => {
  if (!clan) return null;
  const initials = clan.name
    .split(" ")
    .map((word) => word[0] || "")
    .join("")
    .slice(0, 2);

  return (
    <g>
      <circle cx={x} cy={y} r={18} fill={hexToRgba(clan.color, 0.95)} stroke={clan.color} strokeWidth={3} />
      <text
        x={x}
        y={y + 5}
        textAnchor="middle"
        fontSize={12}
        fontWeight="bold"
        fill="#05070d"
      >
        {initials.toUpperCase()}
      </text>
    </g>
  );
};

export const ClanConquestMap: React.FC<ClanConquestMapProps> = ({ zones, clans, variant = "full" }) => {
  const scale = variant === "full" ? 1 : 0.6;
  const viewBox = variant === "full" ? "0 0 640 380" : "0 0 640 380";

  return (
    <div
      className={`relative rounded-3xl border border-slate-800 overflow-hidden shadow-2xl bg-gradient-to-br from-slate-950 via-slate-900 to-black ${
        variant === "full" ? "p-5" : "p-3"
      }`}
    >
      <svg viewBox={viewBox} className="w-full" style={{ transform: `scale(${scale})`, transformOrigin: "top left" }}>
        <defs>
          <linearGradient id="map-grid" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#0f172a" stopOpacity="0.8" />
            <stop offset="100%" stopColor="#020617" stopOpacity="0.9" />
          </linearGradient>
          <pattern id="contested-stripes" width="8" height="8" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
            <rect width="4" height="8" fill="rgba(255,255,255,0.08)" />
          </pattern>
        </defs>

        <rect x={0} y={0} width={640} height={380} fill="url(#map-grid)" stroke="#1e293b" strokeWidth={2} />

        {REGION_LAYOUT.map((region) => {
          const zoneState = zones[region.id];
          const { controllingClan, dominance, contested } = getZoneDetails(zoneState);
          const clanMeta = controllingClan ? clans[controllingClan] : undefined;
          const fillColor = clanMeta ? hexToRgba(clanMeta.color, 0.65) : "rgba(15,23,42,0.5)";
          const strokeColor = clanMeta ? clanMeta.color : "#334155";

          return (
            <g key={region.id}>
              <path
                d={region.path}
                fill={fillColor}
                stroke={strokeColor}
                strokeWidth={contested ? 5 : 3}
                strokeDasharray={contested ? "10 6" : undefined}
                style={{ transition: "all 0.6s ease" }}
              />
              {contested && <path d={region.path} fill="url(#contested-stripes)" />}
              <text
                x={region.labelPosition.x}
                y={region.labelPosition.y}
                fill="#e2e8f0"
                fontSize={variant === "full" ? 16 : 12}
                fontWeight={600}
              >
                {ZONES.find((zone) => zone.id === region.id)?.name}
              </text>
              <text
                x={region.labelPosition.x}
                y={region.labelPosition.y + 20}
                fill="#94a3b8"
                fontSize={variant === "full" ? 12 : 10}
              >
                {clanMeta ? `${clanMeta.name}` : "Unclaimed"}
              </text>
              {clanMeta && (
                <ClanAvatarBadge clan={clanMeta} x={region.labelPosition.x + 95} y={region.labelPosition.y - 10} />
              )}
              {dominance > 0 && (
                <text
                  x={region.labelPosition.x + 95}
                  y={region.labelPosition.y + 20}
                  fill="#facc15"
                  fontSize={variant === "full" ? 14 : 11}
                  fontFamily="monospace"
                >
                  {(dominance * 100).toFixed(0)}%
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_top,rgba(248,250,252,0.08),transparent_45%)]" />
    </div>
  );
};
