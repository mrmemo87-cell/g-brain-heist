import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  fetchGuestResults,
  fetchGuestCandidates,
  linkGuest,
  type GuestResult,
  type GuestLinkCandidate,
} from "../../services/paperScanService";
import { guestBookletCode } from "../../src/lib/paperScan/layout";
type Props = {
  assignmentId: string;
  onOpen: (sheetId: string) => Promise<void>;
  onLinked: () => Promise<void>;
  onBusyChange: (busy: boolean) => void;
};
export default function GuestResultsPanel({
  assignmentId,
  onOpen,
  onLinked,
  onBusyChange,
}: Props) {
  const [items, setItems] = useState<GuestResult[]>([]),
    [candidates, setCandidates] = useState<GuestLinkCandidate[]>([]);
  const [active, setActive] = useState<GuestResult | null>(null),
    [studentId, setStudentId] = useState("");
  const [search, setSearch] = useState(""),
    [identity, setIdentity] = useState(false),
    [replace, setReplace] = useState(false);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const linking = useRef(false);
  useEffect(() => {
    onBusyChange(busy);
    return () => onBusyChange(false);
  }, [busy, onBusyChange]);
  const load = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      setItems(await fetchGuestResults(assignmentId));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load saved sheets.");
    } finally {
      setBusy(false);
    }
  }, [assignmentId]);
  useEffect(() => {
    void load();
  }, [load]);
  const selected = candidates.find((c) => c.id === studentId);
  const begin = async (item: GuestResult) => {
    setBusy(true);
    setError("");
    setStudentId("");
    setIdentity(false);
    setReplace(false);
    setSearch("");
    try {
      setCandidates(await fetchGuestCandidates(assignmentId));
      setActive(item);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const confirm = async () => {
    if (
      busy ||
      linking.current ||
      !active ||
      !selected ||
      !identity ||
      selected.completed ||
      (selected.existingAnswerCount > 0 && !replace)
    )
      return;
    setBusy(true);
    setError("");
    linking.current = true;
    try {
      await linkGuest(active.id, selected.id, replace);
      setMessage(
        `Linked to ${selected.name}. The original paper test date is preserved.`,
      );
      setActive(null);
      setItems(await fetchGuestResults(assignmentId));
      await onLinked();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      linking.current = false;
      setBusy(false);
    }
  };
  return (
    <section className="psc-guest-panel" aria-busy={busy}>
      <header className="psc-guest-heading">
        <div>
          <span className="paw-eyebrow">Saved paper booklets</span>
          <h3>Awaiting student link</h3>
          <p>Reviewed paper answers, ready when students join.</p>
        </div>
        <button
          className="paw-button"
          disabled={busy}
          onClick={() => void load()}
        >
          Refresh
        </button>
      </header>
      {error ? (
        <div className="paw-error" role="alert">
          {error}
        </div>
      ) : null}
      {message ? (
        <div className="psc-success" role="status">
          {message}
        </div>
      ) : null}
      {active ? (
        <div className="psc-card psc-link-card">
          <button
            className="psc-link"
            disabled={busy}
            onClick={() => setActive(null)}
          >
            ← All booklets
          </button>
          <h3>{active.name}</h3>
          <p>
            {guestBookletCode(active.id, active.number)} ·{" "}
            {active.reference || "No school reference"} ·{" "}
            {new Date(active.assessedAt).toLocaleDateString("en-GB", {
              day: "numeric",
              month: "short",
              year: "numeric",
            })}
          </p>
          <label className="psc-date">
            Find the registered account
            <input
              type="search"
              disabled={busy}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Name, username or class"
            />
          </label>
          <div
            className="psc-candidates"
            role="group"
            aria-label="Choose a student account"
          >
            {candidates
              .filter((c) =>
                `${c.name} ${c.username} ${c.className}`
                  .toLowerCase()
                  .includes(search.toLowerCase()),
              )
              .map((c) => (
                <button
                  className="psc-candidate"
                  key={c.id}
                  aria-pressed={studentId === c.id}
                  disabled={busy || c.completed}
                  onClick={() => {
                    setStudentId(c.id);
                    setIdentity(false);
                    setReplace(false);
                  }}
                >
                  <strong>{c.name}</strong>
                  <span>
                    @{c.username} · {c.className}
                    {c.completed ? " · Already completed" : ""}
                  </span>
                </button>
              ))}
          </div>
          {!candidates.length ? (
            <p>
              Ask the student to join your school and teaching roster, then
              refresh.
            </p>
          ) : null}
          {selected ? (
            <div className="psc-link-confirmation">
              <strong>
                {active.name} → {selected.name}
              </strong>
              <span>
                @{selected.username} · {selected.className}
              </span>
              <label className="psc-accept">
                <input
                  type="checkbox"
                  checked={identity}
                  disabled={busy}
                  onChange={(e) => setIdentity(e.target.checked)}
                />
                I checked this account belongs to the student who took this
                test.
              </label>
              {selected.existingAnswerCount > 0 ? (
                <label className="psc-replace">
                  <input
                    type="checkbox"
                    checked={replace}
                    disabled={busy}
                    onChange={(e) => setReplace(e.target.checked)}
                  />
                  Replace unfinished online answers; keep their audit history.
                </label>
              ) : null}
              <button
                className="paw-button primary psc-wide"
                disabled={
                  busy ||
                  !identity ||
                  (selected.existingAnswerCount > 0 && !replace)
                }
                onClick={() => void confirm()}
              >
                {busy ? "Linking…" : "Link result to student"}
              </button>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="psc-guest-list">
          {!busy && !items.length ? (
            <div className="paw-empty">
              No unnamed booklets yet. Create them from Print.
            </div>
          ) : null}
          {items.map((item) => (
            <article key={item.id} className="psc-guest-item">
              <div>
                <span
                  className={`psc-guest-state ${item.linkedAt ? "linked" : ""}`}
                >
                  {item.linkedAt
                    ? "Linked"
                    : item.heldAt
                      ? "Awaiting link"
                      : "Needs review"}
                </span>
                <h4>
                  {item.name ||
                    `Unnamed · ${guestBookletCode(item.id, item.number)}`}
                </h4>
                <p>
                  {item.reference ? `${item.reference} · ` : ""}
                  {new Date(item.assessedAt).toLocaleDateString("en-GB", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}{" "}
                  · {guestBookletCode(item.id, item.number)}
                </p>
                {!item.versionMatches ? (
                  <span className="psc-hint">
                    Assignment changed. Saved evidence is preserved; linking is
                    blocked.
                  </span>
                ) : null}
              </div>
              {!item.linkedAt ? (
                <button
                  className="paw-button"
                  disabled={busy || !item.versionMatches}
                  onClick={() => {
                    if (item.heldAt) void begin(item);
                    else {
                      setBusy(true);
                      void onOpen(item.firstSheetId)
                        .catch((e) => setError((e as Error).message))
                        .finally(() => setBusy(false));
                    }
                  }}
                >
                  {item.heldAt ? "Link student" : "Review booklet"} →
                </button>
              ) : null}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
