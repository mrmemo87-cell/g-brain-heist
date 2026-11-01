import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  fetchIeltsStartingPoint,
  startingPointCompleted,
  startingPointEntry,
  startingPointSkills,
  type IeltsStartingPoint,
} from '../../../services/ieltsStartingPointService';
import '../../styles/ielts-journey.css';
import { createIeltsViewCache } from '../../lib/ieltsViewCache';
import { useIeltsAudience } from '../../lib/ieltsAudience';
import type { StartingPointSkill } from '../../../services/ieltsStartingPointService';
import { IeltsScreenerCard } from './IeltsScreenerCard';
/** Last summary read in this tab, so returning to Home does not flash a loading panel. */
const startingPointCache = createIeltsViewCache<IeltsStartingPoint>();

const IeltsScreenerHub: React.FC<{ data?: IeltsStartingPoint }> = ({
  data,
}) => {
  const navigate = useNavigate();
  const [loaded, setLoaded] = useState<IeltsStartingPoint | null>(() => startingPointCache.get());
  const [loading, setLoading] = useState(!data && !startingPointCache.get()),
    [error, setError] = useState(''),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    if (data) return;
    let active = true;
    const quiet = Boolean(startingPointCache.get()) && retry === 0;
    if (!quiet) {
      setLoading(true);
      setLoaded(null);
    }
    setError('');
    fetchIeltsStartingPoint()
      .then((value) => {
        startingPointCache.set(value);
        if (active) setLoaded(value);
      })
      .catch(() => {
        if (active && !quiet)
          setError(
            'We could not check your screeners. Your saved work is safe. Check your connection and try again.',
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [data, retry]);
  const record = data ?? loaded;
  const audience = useIeltsAudience();
  // Diagnostic Bible 2.1.0 section 10.6: Writing and Speaking checks need a teacher's review, so learners
  // without a school IELTS teacher see only the auto-scored checks, plus any check they already started.
  const skills: readonly StartingPointSkill[] = audience === 'school' || !record || record.school_managed
    ? startingPointSkills
    : startingPointSkills.filter((s) => s === 'listening' || s === 'reading'
      || Boolean(record.results[s]) || ['in_progress', 'completed'].includes(startingPointEntry(record, s)?.status ?? ''));
  const completed = record
    ? skills.filter((s) => startingPointCompleted(record, s)).length
    : 0;
  const total = skills.length;
  const numberWord = ['', 'One', 'Two', 'Three', 'Four'][total] ?? String(total);
  return (
    <section aria-labelledby="ielts-screeners-heading" className="ij-checks">
      <div className="ij-section-heading">
        <div>
          <p className="ij-eyebrow">{numberWord} {total === 1 ? 'skill' : 'skills'}. One starting point.</p>
          <h2 id="ielts-screeners-heading">Your starting-point checks</h2>
          <p>Start a check, continue saved work or review a result.</p>
        </div>
        {record && (
          <span className="ij-status">{completed} of {total} completed</span>
        )}
      </div>
      {!data && loading ? (
        <div role="status" className="ij-panel">
          Checking your saved screeners…
        </div>
      ) : error ? (
        <div role="alert" className="ij-panel ij-warning">
          <p>{error}</p>
          <button
            type="button"
            onClick={() => setRetry((value) => value + 1)}
            className="ij-link"
          >
            Try again
          </button>
        </div>
      ) : record ? (
        <>
          <div className="ij-skill-grid">
            {skills.map((skill) => (
              <IeltsScreenerCard
                key={skill}
                skill={skill}
                entry={startingPointEntry(record, skill)}
                evidence={record.results[skill]}
                speakingAvailable={record.speaking_available}
                recordLoaded
                onNavigate={navigate}
              />
            ))}
          </div>
          <p className="ij-caption">
            These checks show your starting point. Completing them does not
            give an IELTS band.
          </p>
        </>
      ) : null}
    </section>
  );
};
export default IeltsScreenerHub;
