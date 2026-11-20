import React from 'react';
import type { WritingStartingPoint } from '../../../services/ieltsWritingScreener';

/**
 * Writing screener starting point (Diagnostic Bible 2.6.0 section 10.11, Visual & UX Bible 13.10).
 * The AI works out a starting band from its criterion ranges; the teacher confirms or changes it; the student sees the
 * teacher's band with its likely range, "Checked by your teacher" and "Not an official IELTS result".
 */
export const STARTING_BANDS = Array.from({ length: 17 }, (_, i) => 1 + i * 0.5);
const fmt = (n: number) => n.toFixed(1);
type Estimate = { band: number; low: number; high: number };

export function WritingStartingBandPicker({ estimate, value, saved, disabled, onChange, onSaveOnly, savingOnly }: {
  estimate?: Estimate | null; value: number | null; saved?: WritingStartingPoint | null; disabled?: boolean;
  onChange: (band: number | null) => void; onSaveOnly?: () => void; savingOnly?: boolean;
}) {
  return (
    <section className="wr-card wr-start" aria-labelledby="start-heading">
      <p className="wr-eyebrow">Starting point · Task 2</p>
      <h2 id="start-heading">Starting band</h2>
      {estimate ? (
        <div className="pf-band" role="group" aria-label="AI starting band">
          <div className="pf-band-main">
            <p className="pf-band-label">AI starting band · Task 2</p>
            <p className="pf-band-num"><span className="pf-sr">AI starting band about </span>{fmt(estimate.band)}</p>
            <p className="pf-band-range">Likely range {fmt(estimate.low)}–{fmt(estimate.high)}</p>
          </div>
          <div className="pf-band-meta">
            <span className="pf-band-chip">Suggestion only · you confirm or change it</span>
            <span className="pf-band-chip pf-band-chip--quiet">Not an official IELTS result</span>
          </div>
        </div>
      ) : <p className="wr-help">{estimate === null ? 'The AI could not judge every criterion, so it gave no starting band. Choose one yourself.' : 'Draft with AI for a suggested starting band, or choose one yourself.'}</p>}
      <label className="wr-label" htmlFor="start-band">Your starting band for this essay</label>
      <div className="wr-start-row">
        <select id="start-band" className="wr-start-select" disabled={disabled} value={value == null ? '' : String(value)}
          onChange={(event: { target: HTMLSelectElement }) => onChange(event.target.value ? Number(event.target.value) : null)}>
          <option value="">Choose a band</option>
          {STARTING_BANDS.map(b => <option key={b} value={String(b)}>{fmt(b)}</option>)}
        </select>
        {estimate && <button type="button" className="wr-secondary" disabled={disabled || value === estimate.band} onClick={() => onChange(estimate.band)}>Use AI band {fmt(estimate.band)}</button>}
        {onSaveOnly && <button type="button" className="wr-primary" disabled={disabled || savingOnly || value == null} onClick={onSaveOnly}>{savingOnly ? 'Saving…' : 'Save starting band'}</button>}
      </div>
      {estimate && value != null && value !== estimate.band && <p className="wr-help">You changed the AI band ({fmt(estimate.band)} → {fmt(value)}). Your band is the one the student sees.</p>}
      <p className="wr-help">The student sees your band with a range of ±0.5, “Checked by your teacher” and “Not an official IELTS result”. One Task 2 essay is a starting point, not a full Writing band.{saved ? ` Currently shared: ${fmt(saved.band)}.` : ''}</p>
    </section>
  );
}

export function WritingStartingBandCard({ point, pending }: { point?: WritingStartingPoint | null; pending: boolean }) {
  if (!point) {
    return pending ? <p className="mt-4 rounded-xl bg-blue-50 p-4 text-sm text-blue-900">Your starting band will appear here after your teacher checks your essay.</p> : null;
  }
  return (
    <div className="pf-band" role="group" aria-label="Your Writing starting band">
      <div className="pf-band-main">
        <p className="pf-band-label">Writing starting point · Task 2</p>
        <p className="pf-band-num"><span className="pf-sr">Starting band </span>{fmt(point.band)}</p>
        <p className="pf-band-range">Likely range {fmt(point.low)}–{fmt(point.high)}</p>
      </div>
      <div className="pf-band-meta">
        <span className="pf-band-chip pf-band-chip--ok">Checked by your teacher</span>
        <span className="pf-band-chip pf-band-chip--quiet">Not an official IELTS result</span>
        <span className="pf-band-chip pf-band-chip--quiet">One Task 2 essay · Confidence: low</span>
      </div>
    </div>
  );
}
