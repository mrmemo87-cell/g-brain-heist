import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  activateCommanderElixir,
  commanderElixirError,
  getCommanderElixirs,
  purchaseCommanderElixir,
  type CommanderElixirCatalogItem,
  type CommanderElixirSnapshot,
  type CommanderElixirStat,
} from "../../../services/commanderElixirService";
import "./commanderElixirs.css";

type PendingAction = {
  kind: "purchase" | "activate";
  elixirId: string;
  requestId: string;
};

type Props = {
  disabled?: boolean;
};

const STAT_ORDER: CommanderElixirStat[] = ["force", "defense", "dexterity", "stamina", "omni"];

const META: Record<CommanderElixirStat, {
  label: string;
  eyebrow: string;
  effect: string;
  glyph: string;
  accent: string;
  glow: string;
}> = {
  force: {
    label: "Force",
    eyebrow: "OFFENSIVE CATALYST",
    effect: "+2 Death Bolt · +1 Focus per effective rank",
    glyph: "ϟ",
    accent: "#fb7185",
    glow: "rgba(251,113,133,.28)",
  },
  defense: {
    label: "Defense",
    eyebrow: "BASTION CATALYST",
    effect: "+2 Shield · Guard · Shield Cap per effective rank",
    glyph: "⬡",
    accent: "#22d3ee",
    glow: "rgba(34,211,238,.28)",
  },
  dexterity: {
    label: "Dexterity",
    eyebrow: "REFLEX CATALYST",
    effect: "+1 ATK to each deployed unit per effective rank",
    glyph: "⌁",
    accent: "#c084fc",
    glow: "rgba(192,132,252,.28)",
  },
  stamina: {
    label: "Stamina",
    eyebrow: "VITALITY CATALYST",
    effect: "+6 Commander HP per effective rank",
    glyph: "✧",
    accent: "#34d399",
    glow: "rgba(52,211,153,.28)",
  },
  omni: {
    label: "Commander",
    eyebrow: "OMNI CATALYST",
    effect: "+1 effective rank to all four Commander training stats",
    glyph: "◈",
    accent: "#fbbf24",
    glow: "rgba(251,191,36,.3)",
  },
};

const formatDuration = (ms: number) => {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
    : `${minutes}:${String(seconds).padStart(2, "0")}`;
};

const GemIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden>
    <path d="m7 4-4 6 9 11 9-11-4-6H7Z" />
    <path d="m3 10 9 3 9-3M7 4l5 9 5-9" />
  </svg>
);

const Flask = ({ stat }: { stat: CommanderElixirStat }) => (
  <div className="cc-elixir-flask" aria-hidden>
    <svg viewBox="0 0 120 150">
      <path className="cc-elixir-glass" d="M46 12h28v12l-7 7v27l28 48c9 16-2 32-20 32H45c-18 0-29-16-20-32l28-48V31l-7-7V12Z" />
      <path className="cc-elixir-liquid" d="M36 92h48l12 21c6 11-2 20-15 20H39c-13 0-21-9-15-20l12-21Z" />
      <path className="cc-elixir-shine" d="M51 36v27L34 94" />
      <circle className="cc-elixir-bubble" cx="49" cy="111" r="4" />
      <circle className="cc-elixir-bubble" cx="66" cy="102" r="3" />
    </svg>
    <span>{META[stat].glyph}</span>
  </div>
);

export default function CommanderElixirsPanel({ disabled = false }: Props) {
  const [snapshot, setSnapshot] = useState<CommanderElixirSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const pending = useRef<PendingAction | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setSnapshot(await getCommanderElixirs());
      setError("");
    } catch (cause) {
      setError(commanderElixirError(cause));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!snapshot?.active) return undefined;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [snapshot?.active]);

  useEffect(() => {
    const expiresAt = snapshot?.active?.expiresAt;
    if (!expiresAt) return undefined;
    const delay = Math.max(0, new Date(expiresAt).getTime() - Date.now()) + 300;
    const timer = window.setTimeout(() => void load(), delay);
    return () => window.clearTimeout(timer);
  }, [load, snapshot?.active?.expiresAt]);

  const grouped = useMemo(() => {
    const map = new Map<CommanderElixirStat, CommanderElixirCatalogItem[]>();
    for (const stat of STAT_ORDER) map.set(stat, []);
    for (const item of snapshot?.catalog ?? []) map.get(item.statKey)?.push(item);
    for (const variants of map.values()) variants.sort((a, b) => a.durationMinutes - b.durationMinutes);
    return map;
  }, [snapshot?.catalog]);

  const run = async (action: PendingAction, retry = false) => {
    if (busyId) return;
    if (!retry) pending.current = action;
    const current = retry ? pending.current : action;
    if (!current) return;
    setBusyId(current.elixirId);
    setError("");
    setNotice("");
    try {
      const next = current.kind === "purchase"
        ? await purchaseCommanderElixir(current.elixirId, current.requestId)
        : await activateCommanderElixir(current.elixirId, current.requestId);
      setSnapshot(next);
      setNow(Date.now());
      setNotice(current.kind === "purchase" ? "Elixir added to Supplies." : "Combat elixir activated. Future battles will use the boosted trusted loadout.");
      pending.current = null;
    } catch (cause) {
      setError(commanderElixirError(cause));
    } finally {
      setBusyId(null);
    }
  };

  const start = (kind: PendingAction["kind"], elixirId: string) =>
    void run({ kind, elixirId, requestId: crypto.randomUUID() });

  const activeRemaining = snapshot?.active
    ? Math.max(0, new Date(snapshot.active.expiresAt).getTime() - now)
    : 0;
  const gems = snapshot?.wallet.gemstones ?? 0;

  if (loading && !snapshot) {
    return <div className="cc-elixir-loading"><span /> Calibrating Commander Supplies…</div>;
  }

  return (
    <section className="cc-elixirs" aria-labelledby="cc-elixirs-title">
      <div className="cc-elixir-topbar">
        <div>
          <span className="cc-hq-eyebrow">TACTICAL CONSUMABLES</span>
          <h2 id="cc-elixirs-title">Commander Elixirs</h2>
          <p>Temporary combat catalysts. Gemstones only. Permanent training ranks never change.</p>
        </div>
        <div className="cc-elixir-wallet" title="Available Gemstones">
          <span><GemIcon /></span>
          <div><small>GEMSTONE RESERVE</small><strong>{gems.toLocaleString("en-US")}</strong></div>
        </div>
      </div>

      <div className="cc-elixir-rule-strip">
        <span><strong>ONE ACTIVE</strong> combat elixir at a time</span>
        <span><strong>NO POWER STACKING</strong> · same elixir extends time</span>
        <span><strong>PVP SNAPSHOT</strong> freezes the boost when battle starts</span>
      </div>

      {snapshot?.active ? (
        <div className="cc-elixir-active" style={{ "--elixir-accent": META[snapshot.active.statKey].accent, "--elixir-glow": META[snapshot.active.statKey].glow } as React.CSSProperties}>
          <div className="cc-elixir-active-pulse" />
          <span className="cc-elixir-active-glyph">{META[snapshot.active.statKey].glyph}</span>
          <div className="cc-elixir-active-copy">
            <small>ACTIVE COMBAT CATALYST</small>
            <strong>{snapshot.active.name}</strong>
            <span>+{snapshot.active.boostRanks} effective {snapshot.active.statKey === "omni" ? "rank to all skills" : `${META[snapshot.active.statKey].label} rank${snapshot.active.boostRanks === 1 ? "" : "s"}`}</span>
          </div>
          <div className="cc-elixir-timer"><small>TIME REMAINING</small><strong>{formatDuration(activeRemaining)}</strong></div>
        </div>
      ) : (
        <div className="cc-elixir-no-active"><span>◇</span><div><strong>No combat elixir active</strong><small>Activate one from your Supplies before entering battle.</small></div></div>
      )}

      {error && (
        <div className="cc-elixir-message is-error" role="alert">
          <span>{error}</span>
          {pending.current && <button onClick={() => void run(pending.current!, true)} disabled={Boolean(busyId)}>Retry same action</button>}
          <button onClick={() => void load()} disabled={Boolean(busyId)}>Refresh</button>
        </div>
      )}
      {notice && <div className="cc-elixir-message is-success" role="status">✓ {notice}</div>}

      <div className="cc-elixir-grid">
        {STAT_ORDER.map((stat) => {
          const variants = grouped.get(stat) ?? [];
          if (!variants.length) return null;
          const meta = META[stat];
          return (
            <article
              key={stat}
              className={`cc-elixir-card is-${stat}`}
              style={{ "--elixir-accent": meta.accent, "--elixir-glow": meta.glow } as React.CSSProperties}
            >
              <div className="cc-elixir-card-stage">
                <div className="cc-elixir-card-grid" />
                <Flask stat={stat} />
                <span className="cc-elixir-card-rarity">{variants.some((item) => item.rarity === "epic") ? "EPIC" : variants.some((item) => item.rarity === "rare") ? "TACTICAL" : "COMMON"}</span>
              </div>
              <div className="cc-elixir-card-body">
                <small className="cc-elixir-eyebrow">{meta.eyebrow}</small>
                <h3>{meta.label} Elixirs</h3>
                <p className="cc-elixir-effect">{meta.effect}</p>

                <div className="cc-elixir-variants">
                  {variants.map((item) => {
                    const qty = Math.max(0, Number(snapshot?.inventory[item.id] ?? 0));
                    const affordable = gems >= item.gemstonePrice;
                    const sameActive = snapshot?.active?.id === item.id;
                    const otherActive = Boolean(snapshot?.active && !sameActive);
                    const working = busyId === item.id;
                    return (
                      <div className="cc-elixir-variant" key={item.id}>
                        <div className="cc-elixir-variant-head">
                          <div><strong>{item.durationMinutes} MIN</strong><span>+{item.boostRanks} effective rank{item.boostRanks === 1 ? "" : "s"}</span></div>
                          <span className="cc-elixir-owned">OWNED · {qty}</span>
                        </div>
                        <div className="cc-elixir-variant-actions">
                          <button
                            className="cc-elixir-buy"
                            disabled={disabled || working || !affordable}
                            onClick={() => start("purchase", item.id)}
                          >
                            <GemIcon />
                            {working ? "Working…" : affordable ? `Buy · ${item.gemstonePrice}` : `${item.gemstonePrice - gems} more`}
                          </button>
                          <button
                            className={`cc-elixir-activate ${sameActive ? "is-extend" : ""}`}
                            disabled={disabled || working || qty < 1 || otherActive}
                            onClick={() => start("activate", item.id)}
                            title={otherActive ? "Another elixir is active" : undefined}
                          >
                            {sameActive ? `Extend +${item.durationMinutes}m` : otherActive ? "Active type locked" : "Activate"}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </article>
          );
        })}
      </div>

      <div className="cc-elixir-footnote">
        <strong>SERVER-AUTHORITATIVE EFFECTS</strong>
        <span>Force modifies Bolt/Focus · Defense modifies Shield/Guard/Cap · Dexterity modifies deployed unit ATK · Stamina modifies Commander HP. Elixir effects are calculated only by the trusted combat loadout.</span>
      </div>
    </section>
  );
}
