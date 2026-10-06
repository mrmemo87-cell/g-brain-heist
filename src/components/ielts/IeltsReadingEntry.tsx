import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchIeltsScreenerCatalog } from '../../../services/ieltsScreenerLaunchService';

const IeltsReadingEntry: React.FC = () => {
  const navigate = useNavigate();
  const [available, setAvailable] = useState(false);
  useEffect(() => {
    let active = true;
    fetchIeltsScreenerCatalog().then((entries) => {
      if (active) setAvailable(entries.some((entry) => entry.code === 'bh-reading-screener-a'));
    }).catch(() => { /* The discovery page has an explicit retry action. */ });
    return () => { active = false; };
  }, []);
  if (!available) return null;
  return <button type="button" onClick={() => navigate('/ielts/reading-screener')}
    className="min-h-11 rounded-xl border border-teal-300 bg-white px-5 py-3 font-semibold text-teal-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-teal-700">
    Open Reading screener
  </button>;
};
export default IeltsReadingEntry;
