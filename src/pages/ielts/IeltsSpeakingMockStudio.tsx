// Diagnostic Bible 2.7.0 section 10.12: the owner checks every examiner line by listening to the exact
// file, approves or rejects it, approves the package, releases a script version and publishes the mock.
// Nothing here generates audio or spends credits.
import React, { useCallback, useEffect, useState } from "react";
import {
  approveMockPackage,
  examinerAudioUrl,
  ownerOverview,
  ownerScript,
  publishMock,
  releaseScript,
  reviewAudio,
  type MockOwnerPackage,
  type MockScript,
} from "../../../services/ieltsSpeakingMockService";
import "../../styles/ielts-speaking-pilot.css";
import "../../styles/ielts-speaking-mock.css";

const KIND: Record<string, string> = { sound_check: "Sound check", say: "Examiner says", question: "Question", prepare: "Preparation", long_turn: "Long turn" };
const REVIEW_KEYS = [
  ["editorial", "Wording is clear, neutral and age-appropriate"],
  ["task_design", "Questions follow the three-part Speaking format"],
  ["taxonomy", "Topics and criteria are mapped"],
  ["difficulty_timing", "Difficulty and answer times suit the students"],
  ["rights", "Brains Heist owns or may use all content and audio"],
  ["originality", "Checked against screeners and practice: no copies (15E, 15F)"],
] as const;

function Line({ line, onReview, busy }: { line: MockScript["lines"][number]; onReview: (id: string, sha: string, ok: boolean, note: string) => void; busy: boolean }) {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [note, setNote] = useState("");
  const [failed, setFailed] = useState(false);
  const listen = async (id: string, path: string) => {
    setFailed(false);
    try {
      const url = await examinerAudioUrl(path);
      setUrls((u) => ({ ...u, [id]: url }));
    } catch {
      setFailed(true);
    }
  };
  const pending = line.candidates.filter((c) => !c.rejected);
  return (
    <li className="sms-line">
      <p className="sms-line-head"><strong>{line.position}. {KIND[line.kind] ?? line.kind}</strong> · Part {line.part}
        {line.answer_seconds ? ` · answer up to ${line.answer_seconds} s` : ""}{line.replay_allowed ? " · one replay" : ""}</p>
      <p className="sms-body">{line.body}</p>
      {line.approved_audio ? (
        <p className="sp-note">Approved audio · {Number(line.approved_audio.duration_seconds).toFixed(1)} s</p>
      ) : pending.length === 0 ? (
        <p className="sp-note">No audio yet.</p>
      ) : (
        pending.map((c) => (
          <div key={c.id} className="sms-candidate">
            {urls[c.id] ? <audio controls autoPlay src={urls[c.id]} /> : <button type="button" className="sp-secondary" onClick={() => void listen(c.id, c.path)}>Listen ({Number(c.duration_seconds).toFixed(1)} s)</button>}
            <input aria-label="Note if you reject" placeholder="Note if you reject" value={note} onChange={(e) => setNote(e.target.value)} />
            <button type="button" className="sp-primary" disabled={busy || !urls[c.id]} onClick={() => onReview(c.id, c.sha256, true, "")}>Approve</button>
            <button type="button" className="sp-secondary" disabled={busy || note.trim().length < 3} onClick={() => onReview(c.id, c.sha256, false, note)}>Reject</button>
          </div>
        ))
      )}
      {failed && <p className="sp-note" role="alert">This audio could not be opened. Check your connection and try again.</p>}
    </li>
  );
}

export default function IeltsSpeakingMockStudio() {
  const [packages, setPackages] = useState<MockOwnerPackage[] | null>(null);
  const [script, setScript] = useState<MockScript | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [review, setReview] = useState<Record<string, boolean>>({});
  const [notes, setNotes] = useState("");
  const [publishNote, setPublishNote] = useState("");

  const load = useCallback(async () => {
    try {
      setPackages(await ownerOverview());
    } catch {
      setMessage("Only the Brains Heist owner can open this page.");
      setPackages([]);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const act = async (fn: () => Promise<unknown>, done: string) => {
    setBusy(true);
    setMessage("");
    try {
      await fn();
      setMessage(done);
      await load();
    } catch {
      setMessage("That step was refused or the connection failed. Nothing was changed.");
    } finally {
      setBusy(false);
    }
  };

  const pkg = script ? packages?.find((p) => p.code === script.package_code) : undefined;
  return (
    <main className="sp-page sms-page">
      <header className="sp-hero"><div>
        <a className="sp-back" href="/ielts">← IELTS dashboard</a>
        <span className="sp-eyebrow">Owner · Speaking practice mock</span>
        <h1>Examiner voice lines</h1>
        <p>Listen to every line and approve the exact file. A script version can be used only when every line is approved.</p>
      </div></header>
      {message && <p className="sp-note" role="status">{message}</p>}
      {packages === null ? <p role="status">Loading…</p> : packages.length === 0 ? <section className="sp-card"><p>No practice mock packages yet.</p></section> : (
        <section className="sp-card">
          <h2>Mock packages</h2>
          <ul className="sm-list">{packages.map((p) => (
            <li key={p.code}><span><strong>{p.title}</strong><br /><span className="sm-meta">{p.code} · {p.approved ? "package approved" : "package not approved"} · {p.published ? "published" : "not published"}</span></span>
              <span>{p.scripts.filter((s, i) => i === 0 || s.released_at).map((s) => (
                <button key={s.id} type="button" className="sp-secondary" onClick={async () => setScript(await ownerScript(s.id))}>
                  Version {s.version}{s.released_at ? " · in use" : ""}</button>))}</span></li>))}</ul>
        </section>
      )}
      {script && pkg && (
        <>
          <section className="sp-card">
            <h2>{pkg.title} · script version {script.version}</h2>
            <p><strong>Still needing a voice:</strong> {script.needs_audio.lines} {script.needs_audio.lines === 1 ? "line" : "lines"} · {script.needs_audio.characters} characters.
              {script.needs_audio.lines > 0 && " Ask Claude for the exact list and credit cost; nothing is generated until you agree."}</p>
            <p className="sp-note">Voice: {String(script.voice['voice'])} · {String(script.voice['model'])}</p>
            <ol className="sms-lines">{script.lines.map((l) => (
              <Line key={l.position} line={l} busy={busy}
                onReview={(id, sha, ok, note) => void act(async () => setScript(await reviewAudio(id, sha, ok, note)), ok ? "Line approved." : "Line rejected.")} />
            ))}</ol>
            {!script.released_at && (
              <button type="button" className="sp-primary" disabled={busy || script.lines.some((l) => !l.approved_audio) || !pkg.approved}
                onClick={() => void act(async () => setScript(await releaseScript(script.id)), "This version is now the one students take.")}>
                Use this version for students</button>
            )}
            {!pkg.approved && <p className="sp-note">Approve the package below before using a version.</p>}
          </section>
          {!pkg.approved && (
            <section className="sp-card">
              <h2>Approve the package</h2>
              {REVIEW_KEYS.map(([k, label]) => (
                <label key={k} className="sp-check"><input type="checkbox" checked={!!review[k]} onChange={(e) => setReview({ ...review, [k]: e.target.checked })} /> {label}</label>
              ))}
              <label>Notes<textarea value={notes} onChange={(e) => setNotes(e.target.value)} /></label>
              <button type="button" className="sp-primary" disabled={busy || REVIEW_KEYS.some(([k]) => !review[k]) || notes.trim().length < 10}
                onClick={() => void act(() => approveMockPackage(pkg.code, pkg.content_hash, { ...review, notes: notes.trim() }), "Package approved.")}>
                Approve this exact package</button>
            </section>
          )}
          {pkg.approved && !pkg.published && script.released_at && (
            <section className="sp-card">
              <h2>Publish to all eligible students</h2>
              <p>Until you publish, only the pilot student can be assigned this mock.</p>
              <label>Publication note<textarea value={publishNote} onChange={(e) => setPublishNote(e.target.value)} /></label>
              <button type="button" className="sp-primary" disabled={busy || publishNote.trim().length < 10}
                onClick={() => void act(() => publishMock(pkg.code, pkg.content_hash, publishNote.trim()), "Published.")}>Publish</button>
            </section>
          )}
        </>
      )}
    </main>
  );
}
