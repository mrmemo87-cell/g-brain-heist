import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  activateCommanderElixir,
  commanderElixirError,
  getCommanderElixirs,
  purchaseCommanderElixir,
  type CommanderElixirSnapshot,
  type CommanderElixirStat,
} from "../../../services/commanderElixirService";
import { getCommanderElixirArt } from "./commanderElixirAssets";
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
const STAT_INDEX = new Map(STAT_ORDER.map((stat, index) => [stat, index]));

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
    eyebrow: "FORCE CATALYST",
    effect: "+2 Death Bolt and +1 Focus per effective rank",
    glyph: "ϟ",
    accent: "#ff5a45",
    glow: "rgba(255,86,54,.28)",
  },
  defense: {
    label: "Defense",
    eyebrow: "DEFENSE CATALYST",
    effect: "+2 Shield, Guard and Shield Capacity per effective rank",
    glyph: "⬡",
    accent: "#36c8ff",
    glow: "rgba(54,200,255,.28)",
  },
  dexterity: {
    label: "Dexterity",
    eyebrow: "REFLEX CATALYST",
    effect: "+1 ATK to each deployed unit per effective rank",
    glyph: "⌁",
    accent: "#c85cff",
    glow: "rgba(200,92,255,.28)",
  },
  stamina: {
    label: "Stamina",
    eyebrow: "VITALITY CATALYST",
    effect: "+6 Commander HP per effective rank",
    glyph: "✧",
    accent: "#45de6b",
    glow: "rgba(69,222,107,.28)",
  },
  omni: {
    label: "Commander",
    eyebrow: "OMNI CATALYST",
    effect: "Applies all four +1-rank Commander combat effects",
    glyph: "♛",
    accent: "#f6c85f",
    glow: "rgba(246,200,95,.3)",
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

const powerLabel = (stat: CommanderElixirStat, boostRanks: number, uppercase = true) => {
  const text = stat === "omni"
    ? `+${boostRanks} all Commander stats`
    : `+${boostRanks} effective ${META[stat].label}`;
  return uppercase ? text.toUpperCase() : text;
};

const GemIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden>
    <path d="m7 4-4 6 9 11 9-11-4-6H7Z" />
    <path d="m3 10 9 3 9-3M7 4l5 9 5-9" />
  </svg>
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

  const catalog = useMemo(() => [...(snapshot?.catalog ?? [])].sort((a, b) => {
    const statDiff = (STAT_INDEX.get(a.statKey) ?? 99) - (STAT_INDEX.get(b.statKey) ?? 99);
    if (statDiff !== 0) return statDiff;
    return a.durationMinutes - b.durationMinutes;
  }), [snapshot?.catalog]);

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
      setNotice(current.kind === "purchase"
        ? "Elixir added to Supplies."
        : "Combat elixir activated. Future battles will use the boosted trusted loadout.");
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
  const activeArt = snapshot?.active ? getCommanderElixirArt(snapshot.active.id) : null;

  if (loading && !snapshot) {
    return <div className="cc-elixir-loading"><span /> Calibrating Commander Supplies…</div>;
  }

  return (
    <section className="cc-elixirs" aria-labelledby="cc-elixirs-title">
      <div className="cc-elixir-topbar">
        <div className="cc-elixir-heading">
          <span className="cc-hq-eyebrow">TACTICAL CONSUMABLES</span>
          <h2 id="cc-elixirs-title">Commander Elixirs</h2>
          <p>Temporary combat catalysts. Gemstones only. Permanent training ranks never change.</p>
        </div>
        <div className="cc-elixir-wallet" title="Available Gemstones" aria-label={`${gems} Gemstones available`}>
          <span className="cc-elixir-wallet-gem"><GemIcon /></span>
          <div><small>GEMSTONE RESERVE</small><strong>{gems.toLocaleString("en-US")}</strong></div>
        </div>
      </div>

      <div className="cc-elixir-rule-strip" aria-label="Commander elixir rules">
        <span><strong>ONE ACTIVE</strong><small>Only one combat elixir can be active.</small></span>
        <span><strong>NO POWER STACKING</strong><small>Using the same elixir extends its duration.</small></span>
        <span><strong>PVP SNAPSHOT</strong><small>The active boost is frozen when the battle begins.</small></span>
      </div>

      {snapshot?.active ? (
        <div
          className={`cc-elixir-active is-${snapshot.active.statKey}`}
          style={{ "--elixir-accent": META[snapshot.active.statKey].accent, "--elixir-glow": META[snapshot.active.statKey].glow } as React.CSSProperties}
        >
          <div className="cc-elixir-active-pulse" />
          <div className="cc-elixir-active-art">
            {activeArt ? (
              <img src={activeArt} alt="" loading="eager" decoding="async" />
            ) : (
              <span aria-hidden>{META[snapshot.active.statKey].glyph}</span>
            )}
          </div>
          <div className="cc-elixir-active-copy">
            <small>ACTIVE COMBAT CATALYST</small>
            <strong>{snapshot.active.name}</strong>
            <span>{powerLabel(snapshot.active.statKey, snapshot.active.boostRanks, false)}</span>
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
        {catalog.map((item) => {
          const meta = META[item.statKey];
          const art = getCommanderElixirArt(item.id);
          const qty = Math.max(0, Number(snapshot?.inventory[item.id] ?? 0));
          const affordable = gems >= item.gemstonePrice;
          const shortfall = Math.max(0, item.gemstonePrice - gems);
          const sameActive = snapshot?.active?.id === item.id;
          const otherActive = Boolean(snapshot?.active && !sameActive);
          const working = busyId === item.id;
          const rarity = item.rarity.toLowerCase();
          const activateLabel = sameActive
            ? `EXTEND +${item.durationMinutes} MIN`
            : otherActive
              ? "ANOTHER ELIXIR ACTIVE"
              : "ACTIVATE";
          const buyLabel = working
            ? "WORKING…"
            : affordable
              ? qty > 0 ? `RESTOCK · ${item.gemstonePrice}` : `BUY · ${item.gemstonePrice}`
              : `NEED ${shortfall} MORE`;

          return (
            <article
              key={item.id}
              className={`cc-elixir-card is-${item.statKey} is-rarity-${rarity}`}
              style={{ "--elixir-accent": meta.accent, "--elixir-glow": meta.glow } as React.CSSProperties}
            >
              <div className="cc-elixir-card-header">
                <span className="cc-elixir-eyebrow">{meta.eyebrow}</span>
                <div className="cc-elixir-card-tags">
                  <span className="cc-elixir-card-rarity">{item.rarity.toUpperCase()}</span>
                  <span className="cc-elixir-duration">{item.durationMinutes} MIN</span>
                </div>
              </div>

              <div className="cc-elixir-card-stage">
                <div className="cc-elixir-card-grid" />
                <div className="cc-elixir-card-orbit" />
                {art ? (
                  <img
                    className="cc-elixir-art"
                    src={art}
                    alt={`${item.name} artwork`}
                    loading="lazy"
                    decoding="async"
                  />
                ) : (
                  <span className="cc-elixir-art-fallback" role="img" aria-label={`${item.name} artwork unavailable`}>
                    {meta.glyph}
                  </span>
                )}
              </div>

              <div className="cc-elixir-card-body">
                <div className="cc-elixir-title-block">
                  <h3>{item.name}</h3>
                  <strong className="cc-elixir-power">{powerLabel(item.statKey, item.boostRanks)}</strong>
                </div>

                <div className="cc-elixir-combat-effect">
                  <small>COMBAT EFFECT</small>
                  <p>{meta.effect}</p>
                </div>

                <div className="cc-elixir-stock-row">
                  <span className="cc-elixir-owned">OWNED <strong>×{qty}</strong></span>
                  <span className="cc-elixir-price" aria-label={`${item.gemstonePrice} Gemstones`}><GemIcon /><strong>{item.gemstonePrice}</strong></span>
                </div>

                <div className={`cc-elixir-actions ${qty < 1 ? "is-buy-first" : "is-owned"}`}>
                  {qty > 0 && (
                    <button
                      className={`cc-elixir-activate is-primary ${sameActive ? "is-extend" : ""}`}
                      disabled={disabled || working || otherActive}
                      onClick={() => start("activate", item.id)}
                      title={otherActive ? "Another elixir is active" : undefined}
                    >
                      {working ? "WORKING…" : activateLabel}
                    </button>
                  )}
                  <button
                    className={`cc-elixir-buy ${qty < 1 ? "is-primary" : ""}`}
                    disabled={disabled || working || !affordable}
                    onClick={() => start("purchase", item.id)}
                  >
                    <GemIcon />
                    <span>{buyLabel}</span>
                  </button>
                </div>
              </div>
            </article>
          );
        })}
      </div>

      <div className="cc-elixir-footnote">
        <strong>SERVER-AUTHORITATIVE EFFECTS</strong>
        <span>Force modifies Bolt/Focus · Defense modifies Shield/Guard/Capacity · Dexterity modifies deployed unit ATK · Stamina modifies Commander HP. Elixir effects are calculated only by the trusted combat loadout.</span>
      </div>
    </section>
  );
}
