import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchIeltsScreenerCatalog, type IeltsScreenerEntry } from '../../../services/ieltsScreenerLaunchService';

type Skill = 'listening' | 'reading';
type CardProps = { skill: Skill; entry?: IeltsScreenerEntry; onNavigate: (route: string) => void };
const cardStyle: React.CSSProperties = { background: '#fff', border: '1px solid #cbd5e1', borderRadius: '1.25rem', padding: 'clamp(1.2rem,3vw,1.6rem)', display: 'flex', flexDirection: 'column', gap: '.8rem', minWidth: 0 };
const actionClass = 'min-h-11 rounded-xl bg-slate-900 px-5 py-3 font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-700';

export const IeltsScreenerCard: React.FC<CardProps> = ({ skill, entry, onNavigate }) => {
  const title = skill === 'reading' ? 'Reading' : 'Listening';
  const discoveryRoute = `/ielts/${skill}-screener`;
  const completed = entry?.status === 'completed';
  const resume = entry?.status === 'in_progress';
  const expired = entry?.status === 'expired';
  const savedRoute = entry?.assignment_id ? `/ielts/exam/${entry.exam_event_id}` : discoveryRoute;
  const status = completed ? 'Completed' : resume ? 'In progress' : expired ? 'Time ended'
    : entry?.status === 'ready' ? 'Ready to start' : entry?.status === 'paused' ? 'Paused'
    : entry?.status === 'scheduled' ? 'Scheduled' : 'Not available';
  const action = completed ? 'View saved result' : resume ? 'Resume check' : expired ? 'Open saved attempt'
    : entry?.status === 'ready' ? `Start ${title} check` : 'Check availability';
  return <article aria-label={`${title} screener`} style={cardStyle}>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h3 className="m-0 text-2xl font-bold text-slate-950">{title}</h3>
      <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-semibold text-slate-700">{status}</span>
    </div>
    <p className="m-0 leading-7 text-slate-600">{skill === 'reading'
      ? 'Two passages · 12 questions · Academic Reading'
      : 'Three recordings · 12 questions · Pause and replay available'}</p>
    {entry && <p className="m-0 text-sm font-semibold text-slate-700">{entry.duration_minutes} minutes</p>}
    <p className="m-0 text-sm leading-6 text-slate-600">{completed ? 'Your answers and result are saved.'
      : resume ? 'Continue your saved attempt with its remaining time.'
      : expired ? 'Open your attempt to finish saving and see its result.'
      : 'A short starting-point check with a raw score and low confidence.'}</p>
    <button type="button" className={`mt-auto ${actionClass}`}
      onClick={() => onNavigate(completed || resume || expired ? savedRoute : discoveryRoute)}>{action}</button>
    {completed && <div className="border-t border-slate-200 pt-3">
      <button type="button" className="min-h-11 font-semibold text-blue-800 underline focus-visible:outline focus-visible:outline-2"
        onClick={() => onNavigate(discoveryRoute)}>Repeat for practice</button>
      <p className="m-0 text-sm leading-6 text-slate-600">Repeats use the same questions and do not measure improvement.</p>
    </div>}
  </article>;
};

const IeltsScreenerHub: React.FC = () => {
  const navigate = useNavigate();
  const [entries, setEntries] = useState<IeltsScreenerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    fetchIeltsScreenerCatalog().then((value) => { if (active) setEntries(value); })
      .catch(() => { if (active) setError('We could not check your screeners. Your saved work is safe.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [retry]);
  const listening = entries.find((entry) => entry.code === 'bh-listening-screener-a');
  const reading = entries.find((entry) => entry.code === 'bh-reading-screener-a');
  return <section aria-labelledby="ielts-screeners-heading" className="space-y-4">
    <div>
      <h2 id="ielts-screeners-heading" className="m-0 text-2xl font-bold text-slate-950">Your starting-point checks</h2>
      <p className="mt-2 mb-0 leading-7 text-slate-600">Start a check, continue saved work or review a result. These short checks do not give an IELTS band.</p>
    </div>
    {loading ? <div role="status" className="rounded-xl border border-slate-200 bg-white p-5 text-slate-600">Checking your saved screeners…</div>
      : error ? <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-slate-900">
        <p className="m-0">{error}</p><button type="button" onClick={() => setRetry((value) => value + 1)} className="mt-3 min-h-11 font-semibold text-blue-800 underline">Try again</button>
      </div>
      : <div className="grid gap-4 md:grid-cols-2">
        <IeltsScreenerCard skill="listening" entry={listening} onNavigate={navigate} />
        {reading && <IeltsScreenerCard skill="reading" entry={reading} onNavigate={navigate} />}
      </div>}
  </section>;
};
export default IeltsScreenerHub;
