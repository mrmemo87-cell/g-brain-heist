import React from 'react';
import type { SpeakingAiEstimates, SpeakingBandKey, SpeakingBands } from '../../../services/ieltsSpeakingPilotService';
import '../../styles/ielts-review-result.css';

/**
 * Step 3 of the interview review: the teacher's bands (Diagnostic Bible 2.3.0 section 10.8; Visual & UX Bible 1.9.0 13.9).
 * Every band is the teacher's choice. The plain average of the four criterion bands is shown as a number to consider.
 * Teacher-only AI estimates (section 10.10) sit beside each picker; "Use the AI estimates" copies them in for the
 * teacher to check and change. Nothing is shared until the teacher confirms and presses Share.
 */
export const BAND_OPTIONS = Array.from({ length: 19 }, (_, i) => i / 2);
export const CRITERION_BANDS: Array<{ key: SpeakingBandKey; label: string; short: string; tone: string }> = [
  { key: 'fluency_coherence', label: 'Fluency and coherence', short: 'FC', tone: 'fc' },
  { key: 'lexical_resource', label: 'Lexical resource', short: 'LR', tone: 'lr' },
  { key: 'grammar_range_accuracy', label: 'Grammatical range and accuracy', short: 'GR', tone: 'gr' },
  { key: 'pronunciation', label: 'Pronunciation', short: 'P', tone: 'pr' },
];
export const PART_BANDS: Array<{ key: SpeakingBandKey; part: number }> = [
  { key: 'part_1', part: 1 }, { key: 'part_2', part: 2 }, { key: 'part_3', part: 3 },
];
export const BAND_LABEL: Record<SpeakingBandKey, string> = {
  fluency_coherence: 'Fluency and coherence', lexical_resource: 'Lexical resource',
  grammar_range_accuracy: 'Grammatical range and accuracy', pronunciation: 'Pronunciation',
  part_1: 'Part 1', part_2: 'Part 2', part_3: 'Part 3', overall: 'Teacher Speaking band',
};

/** Plain mean of the teacher's four criterion bands, or null until all four are set. Never rounded (section 10.8). */
export function criterionAverage(b: SpeakingBands): number | null {
  const v = CRITERION_BANDS.map(c => b[c.key]);
  if (v.some(x => x === null)) return null;
  return (v as number[]).reduce((a, x) => a + x, 0) / 4;
}

type PickerProps = { id: string; label: string; value: number | null; onChange: (v: number | null) => void; big?: boolean; disabled?: boolean };
/** A band picker: − / + nudges by half a band, or tap the number to choose directly. */
export function BandPicker({ id, label, value, onChange, big, disabled }: PickerProps) {
  const step = (d: number) => {
    const start = value ?? 5;
    const next = value === null ? start : Math.min(9, Math.max(0, start + d));
    onChange(next);
  };
  return (
    <div className={`spb-picker${big ? ' spb-picker--big' : ''}${value === null ? ' is-empty' : ''}`}>
      <button type="button" className="spb-nudge" aria-label={`Lower ${label} by half a band`} disabled={disabled || value === 0} onClick={() => step(-0.5)}>−</button>
      <select id={id} aria-label={label} value={value ?? ''} disabled={disabled}
        onChange={e => onChange(e.target.value === '' ? null : Number(e.target.value))}>
        <option value="">Set</option>
        {BAND_OPTIONS.map(b => <option key={b} value={b}>{b.toFixed(1)}</option>)}
      </select>
      <button type="button" className="spb-nudge" aria-label={`Raise ${label} by half a band`} disabled={disabled || value === 9} onClick={() => step(0.5)}>+</button>
    </div>
  );
}

type Props = {
  estimates?: SpeakingAiEstimates | null;
  estimating?: boolean;
  estimateError?: string;
  onUseEstimates?: () => void;
  bands: SpeakingBands;
  onChange: (key: SpeakingBandKey, value: number | null) => void;
  partTitles: Record<number, string>;
  studentName: string;
  disabled?: boolean;
};

function AiChip({ estimates, k, bands }: { estimates?: SpeakingAiEstimates | null; k: SpeakingBandKey; bands: SpeakingBands }) {
  if (!estimates) return null;
  const v = estimates.bands[k];
  if (v === null || v === undefined) return <span className="spb-ai spb-ai--none">AI: not estimated</span>;
  const differs = bands[k] !== null && bands[k] !== v;
  return <span className={`spb-ai${differs ? ' spb-ai--differs' : ''}`} title={differs ? 'Your band differs from the AI estimate' : undefined}>AI estimate {v.toFixed(1)}</span>;
}

export default function SpeakingBandsPanel({ estimates, estimating, estimateError, onUseEstimates, bands, onChange, partTitles, studentName, disabled }: Props) {
  const avg = criterionAverage(bands);
  const hasAny = !!estimates && Object.values(estimates.bands).some(v => v !== null);
  return (
    <div className="spb-panel">
      <div className="spb-ai-bar" role="status">
        {estimating ? (
          <><span className="spb-spinner" aria-hidden="true" /> <span>AI is estimating the bands from the transcripts and the Part 2 audio…</span></>
        ) : estimates && hasAny ? (
          <>
            <span><b>AI estimates are ready.</b> They lean cautious and are only for you; {studentName} never sees them. {estimates.basis}</span>
            {onUseEstimates && <button type="button" className="sp-secondary spb-use" disabled={disabled} onClick={onUseEstimates}>Use the AI estimates</button>}
          </>
        ) : estimateError ? (
          <span>{estimateError}</span>
        ) : (
          <span>AI estimates appear here once the transcripts are ready.</span>
        )}
      </div>
      <div className="spb-group">
        <h3>Criteria <small>whole interview</small></h3>
        <div className="spb-grid">
          {CRITERION_BANDS.map(c => (
            <div key={c.key} className={`spb-tile rr-tone-${c.tone}`}>
              <span className="spb-tag" aria-hidden="true">{c.short}</span>
              <label htmlFor={`spb-${c.key}`}>{c.label}</label>
              <BandPicker id={`spb-${c.key}`} label={c.label} value={bands[c.key]} disabled={disabled} onChange={v => onChange(c.key, v)} />
              <AiChip estimates={estimates} k={c.key} bands={bands} />
              {estimates?.reasons[c.key as 'pronunciation'] && <small className="spb-reason">{estimates.reasons[c.key as 'pronunciation']}</small>}
            </div>
          ))}
        </div>
      </div>
      <div className="spb-group">
        <h3>Parts</h3>
        <div className="spb-grid spb-grid--3">
          {PART_BANDS.map(p => (
            <div key={p.key} className="spb-tile">
              <label htmlFor={`spb-${p.key}`}>Part {p.part}<small>{partTitles[p.part] ?? ''}</small></label>
              <BandPicker id={`spb-${p.key}`} label={`Part ${p.part} band`} value={bands[p.key]} disabled={disabled} onChange={v => onChange(p.key, v)} />
              <AiChip estimates={estimates} k={p.key} bands={bands} />
            </div>
          ))}
        </div>
      </div>
      <div className="spb-overall">
        <div>
          <span className="spb-overall-eyebrow">The headline {studentName} sees</span>
          <label htmlFor="spb-overall" className="spb-overall-label">Teacher Speaking band</label>
          <p className="spb-avg" aria-live="polite">
            {avg === null
              ? 'Set the four criterion bands to see their average.'
              : <>Average of your criterion bands: <b>{avg.toFixed(2)}</b>. Each criterion is worth 25%. The final band is your call.</>}
          </p>
          {estimates && (
            <p className="spb-avg">
              {estimates.bands.overall === null
                ? 'AI estimate: not available (Pronunciation could not be estimated from the audio).'
                : <>AI estimate: <b>{estimates.bands.overall.toFixed(1)}</b></>}
            </p>
          )}
        </div>
        <BandPicker id="spb-overall" label="Teacher Speaking band" big value={bands.overall} disabled={disabled} onChange={v => onChange('overall', v)} />
      </div>
    </div>
  );
}
