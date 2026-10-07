import React from 'react';
import { IELTS_WRITING_CRITERIA, type WritingCriterion, type WritingEvidenceSpan, type WritingObservations, type WritingObservationStatus, type WritingScreenerResult } from '../../../services/ieltsWritingScreener';
import { getWritingReviewReadiness, isWritingObservationComplete } from '../../../services/ieltsWritingReviewUx';

type Props = {
  result: WritingScreenerResult; observations: WritingObservations; activeCriterion: WritingCriterion;
  onCriterion: (key: WritingCriterion) => void;
  onEdit: (key: WritingCriterion, patch: Partial<WritingObservations[WritingCriterion]>) => void;
  selected: WritingEvidenceSpan | null; onSelect: (span: WritingEvidenceSpan | null) => void;
  nextStep: string; onNextStep: (value: string) => void; delivery: string; onDelivery: (value: string) => void;
  saving: boolean; saved: boolean; onSave: () => void;
};
const choices: { status: WritingObservationStatus; label: string; hint: string }[] = [
  { status: 'observed', label: 'Demonstrated', hint: 'Working well in this essay' },
  { status: 'developing', label: 'Develop in practice', hint: 'A useful focus for practice' },
  { status: 'insufficient_evidence', label: 'More evidence needed', hint: 'This essay does not show enough' },
];
export const IeltsWritingReviewWorkspace: React.FC<Props> = (props) => {
  const { result, observations, activeCriterion, selected, saving, saved } = props;
  const index = IELTS_WRITING_CRITERIA.findIndex(item => item.key === activeCriterion);
  const criterion = IELTS_WRITING_CRITERIA[index];
  const observation = observations[activeCriterion];
  const readiness = getWritingReviewReadiness(observations, props.nextStep, props.delivery, result.incident_count);
  return <div className="wr-workspace">
    <section className="wr-card wr-essay" aria-labelledby="original-heading">
      <div className="wr-card-heading"><div><p className="wr-eyebrow">Read & select</p><h2 id="original-heading">The student’s essay</h2></div><span className="wr-pill">Original · Read only</span></div>
      <div className="wr-meta"><span>{result.word_count} words</span><span>{result.evidence_kind === 'same_prompt_practice' ? 'Same-prompt practice' : 'First sitting'}</span></div>
      <details className="wr-task"><summary>View the writing task</summary><p>{result.prompt}</p></details>
      <label htmlFor="review-original" className="wr-help">Select words from the essay, then attach the excerpt to your observation.</label>
      <textarea id="review-original" readOnly value={result.response_text} spellCheck={false} className="wr-original" onSelect={(event: { currentTarget: HTMLTextAreaElement }) => {
        const field = event.currentTarget; const start = field.selectionStart; const end = field.selectionEnd;
        props.onSelect(end > start ? { quote: field.value.slice(start, end), start_char: Array.from(field.value.slice(0, start)).length, end_char: Array.from(field.value.slice(0, end)).length } : null);
      }} />
      <div className={`wr-selection ${selected ? 'wr-selection-ready' : ''}`} role="status" aria-live="polite">
        <strong>{selected ? (observation.evidence.some(span => span.start_char === selected.start_char && span.end_char === selected.end_char) ? 'Excerpt attached to this criterion' : 'Excerpt ready to attach') : 'Start with the essay'}</strong>
        <p>{selected ? `“${selected.quote.length > 180 ? `${selected.quote.slice(0, 180)}…` : selected.quote}”` : 'Choose a short excerpt that supports what you want to say.'}</p>
        {selected && <button type="button" className="wr-secondary" disabled={saving} onClick={() => props.onEdit(activeCriterion, { evidence: [selected] })}>Attach to {criterion.label}</button>}
      </div>
    </section>
    <div className="wr-feedback">
      <section className="wr-card" aria-labelledby="feedback-heading">
        <div className="wr-card-heading"><div><p className="wr-eyebrow">Notice & explain</p><h2 id="feedback-heading">Your feedback</h2></div><span className="wr-pill">{readiness.completed} of 4 ready</span></div>
        <nav className="wr-criteria" aria-label="Writing feedback criteria">{IELTS_WRITING_CRITERIA.map(({ key, label }, i) => <button key={key} type="button" disabled={saving} aria-current={key === activeCriterion ? 'step' : undefined} onClick={() => props.onCriterion(key)}><span className={`wr-step ${isWritingObservationComplete(observations[key]) ? 'wr-step-complete' : ''}`}>{isWritingObservationComplete(observations[key]) ? '✓' : i + 1}</span><span>{label}{isWritingObservationComplete(observations[key]) && <small>Ready</small>}</span></button>)}</nav>
        <fieldset disabled={saving} className="wr-observation"><legend>{criterion.label}</legend><p className="wr-help">{criterion.focus}</p>
          <fieldset className="wr-choice"><legend>What did you notice?</legend>{choices.map(choice => <label key={choice.status} className={observation.status === choice.status ? 'wr-choice-selected' : ''}><input type="radio" name={`observation-${activeCriterion}`} value={choice.status} checked={observation.status === choice.status} onChange={() => props.onEdit(activeCriterion, { status: choice.status })} /><span><strong>{choice.label}</strong><small>{choice.hint}</small></span></label>)}</fieldset>
          <label className="wr-label" htmlFor={`note-${activeCriterion}`}>Explain it to the student</label><textarea id={`note-${activeCriterion}`} value={observation.comment} maxLength={2000} placeholder="Describe what you noticed and why it matters." className="wr-note" onChange={(event: { target: HTMLTextAreaElement }) => props.onEdit(activeCriterion, { comment: event.target.value })} />
          <p className="wr-help">Give a short, specific note the student can act on.</p>
          <div className="wr-evidence"><div className="wr-card-heading"><h3>Supporting excerpt</h3><button type="button" className="wr-secondary" disabled={!selected} onClick={() => selected && props.onEdit(activeCriterion, { evidence: [selected] })}>{observation.evidence.length ? 'Replace excerpt' : 'Attach excerpt'}</button></div>
            {observation.evidence.length ? observation.evidence.map((span, i) => <div key={`${span.start_char}-${i}`}><blockquote>“{span.quote}”</blockquote><button type="button" className="wr-text-button" onClick={() => props.onEdit(activeCriterion, { evidence: observation.evidence.filter((_, position) => position !== i) })}>Remove excerpt</button></div>) : <p className="wr-help">{observation.status === 'insufficient_evidence' ? 'An excerpt is optional when more evidence is needed.' : 'Select an excerpt in the essay and attach it here.'}</p>}
          </div>
          <div className="wr-criterion-actions"><button type="button" className="wr-text-button" disabled={index === 0} onClick={() => props.onCriterion(IELTS_WRITING_CRITERIA[index - 1].key)}>Previous criterion</button>{index < 3 && <button type="button" className="wr-secondary" onClick={() => props.onCriterion(IELTS_WRITING_CRITERIA[index + 1].key)}>Next criterion →</button>}</div>
        </fieldset>
      </section>
      <section className="wr-card wr-next" aria-labelledby="next-heading"><p className="wr-eyebrow">Guide the next step</p><h2 id="next-heading">Make practice feel achievable</h2>
        <fieldset disabled={saving}><legend className="sr-only">Next step and assessment conditions</legend><label className="wr-label" htmlFor="review-next-step">One practical next step</label><textarea id="review-next-step" value={props.nextStep} maxLength={2000} placeholder="Choose one focused action the student can try in their next essay." className="wr-note" onChange={(event: { target: HTMLTextAreaElement }) => props.onNextStep(event.target.value)} />
          <details className="wr-task" open={result.incident_count > 0 || undefined}><summary>Assessment conditions{result.incident_count > 0 ? ` · ${result.incident_count} interruption${result.incident_count === 1 ? '' : 's'} · Note required` : ' · Optional'}</summary><label className="wr-label" htmlFor="review-delivery">Explain any effect on this essay</label><textarea id="review-delivery" value={props.delivery} maxLength={2000} className="wr-note" onChange={(event: { target: HTMLTextAreaElement }) => props.onDelivery(event.target.value)} /></details>
          <div className="wr-share"><p>{saved ? 'Feedback shared. The original essay is preserved.' : readiness.message ?? 'Ready to share. The student will see your four observations and next step.'}</p><button type="button" className="wr-primary" disabled={saving || saved} onClick={props.onSave}>{saving ? 'Sharing…' : saved ? 'Feedback shared ✓' : 'Share feedback with student'}</button></div>
          <p className="wr-help">Feedback refers to this essay only. One Task 2 essay does not establish a full Writing band. Corrections preserve earlier reviews.</p>
          {saved && <p role="status" className="wr-success">Your feedback is now available to the student.</p>}
        </fieldset>
      </section>
    </div>
  </div>;
};
