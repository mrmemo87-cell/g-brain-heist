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
import { IeltsScreenerCard } from './IeltsScreenerCard';
const IeltsScreenerHub: React.FC<{ data?: IeltsStartingPoint }> = ({
  data,
}) => {
  const navigate = useNavigate();
  const [loaded, setLoaded] = useState<IeltsStartingPoint | null>(null);
  const [loading, setLoading] = useState(!data),
    [error, setError] = useState(''),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    if (data) return;
    let active = true;
    setLoading(true);
    setError('');
    setLoaded(null);
    fetchIeltsStartingPoint()
      .then((value) => {
        if (active) setLoaded(value);
      })
      .catch(() => {
        if (active)
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
  const completed = record
    ? startingPointSkills.filter((s) => startingPointCompleted(record, s))
        .length
    : 0;
  return (
    <section aria-labelledby="ielts-screeners-heading" className="ij-checks">
      <div className="ij-section-heading">
        <div>
          <p className="ij-eyebrow">Four skills. One starting point.</p>
          <h2 id="ielts-screeners-heading">Your starting-point checks</h2>
          <p>Start a check, continue saved work or review a result.</p>
        </div>
        {record && (
          <span className="ij-status">{completed} of 4 completed</span>
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
            {startingPointSkills.map((skill) => (
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
            These checks show your starting point. Completing all four does not
            give an IELTS band.
          </p>
        </>
      ) : null}
    </section>
  );
};
export default IeltsScreenerHub;
