import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchIeltsScreenerCatalog, type IeltsScreenerEntry } from '../../../services/ieltsScreenerLaunchService';

import { IeltsScreenerCard } from './IeltsScreenerCard';

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
  const writing = entries.find((entry) => entry.code === 'bh-writing-screener-a');
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
      : <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <IeltsScreenerCard skill="listening" entry={listening} onNavigate={navigate} />
        {writing && <IeltsScreenerCard skill="writing" entry={writing} onNavigate={navigate} />}
        {reading && <IeltsScreenerCard skill="reading" entry={reading} onNavigate={navigate} />}
      </div>}
  </section>;
};
export default IeltsScreenerHub;
