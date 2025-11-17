import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  createPack,
  fetchRecentSessions,
  fetchActiveReadingSets,
  getByReference,
  IeltsModuleType,
  IeltsSessionSummary,
} from '@/services/ieltsService';

const moduleLabels: Record<IeltsModuleType, string> = {
  general: 'General Training',
  academic: 'Academic',
};

const formatDate = (value: string) => {
  try {
    return new Date(value).toLocaleDateString();
  } catch (error) {
    return value;
  }
};

const resolveModuleLabel = (session: IeltsSessionSummary) => {
  const moduleKey = session.module ?? session.module_type ?? 'general';
  return moduleLabels[moduleKey as IeltsModuleType];
};

const IeltsHome: React.FC = () => {
  const [moduleType, setModuleType] = useState<IeltsModuleType>('general');
  const [targetBandInput, setTargetBandInput] = useState('');
  const [referenceCode, setReferenceCode] = useState('');
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: recentSessions, isLoading: isSessionsLoading, error: sessionsError } = useQuery({
    queryKey: ['ielts-sessions', 'recent'],
    queryFn: fetchRecentSessions,
  });

  const { data: readingSets, isLoading: isReadingSetsLoading } = useQuery({
    queryKey: ['reading-sets'],
    queryFn: fetchActiveReadingSets,
  });

  const createPackMutation = useMutation({
    mutationFn: (payload: { moduleType: IeltsModuleType; targetBand?: number }) =>
      createPack(payload.moduleType, payload.targetBand),
    onSuccess: (session) => {
      queryClient.setQueryData(['ielts-session', session.id], session);
      queryClient.invalidateQueries(['ielts-sessions', 'recent']);
      navigate(`/ielts/session/${session.id}`);
    },
    onError: (error: Error) => {
      setFormError(error.message || 'Unable to create session.');
    },
  });

  const lookupMutation = useMutation({
    mutationFn: (code: string) => getByReference(code),
    onSuccess: (session) => {
      setLookupError(null);
      queryClient.setQueryData(['ielts-session', session.id], session);
      navigate(`/ielts/session/${session.id}`);
    },
    onError: (lookupErrorResponse: Error) => {
      const message = lookupErrorResponse.message?.toLowerCase().includes('not found')
        ? 'No report found for this code.'
        : 'Unable to retrieve the report. Please verify the code and try again.';
      setLookupError(message);
    },
  });

  const handleStartSession = (event: React.FormEvent) => {
    event.preventDefault();
    setFormError(null);

    let parsedBand: number | undefined;
    if (targetBandInput.trim()) {
      parsedBand = Number(targetBandInput);
      if (Number.isNaN(parsedBand)) {
        setFormError('Please enter a valid band number (e.g., 6.5).');
        return;
      }
    }

    createPackMutation.mutate({ moduleType, targetBand: parsedBand });
  };

  const handleLookup = (event: React.FormEvent) => {
    event.preventDefault();
    setLookupError(null);

    const code = referenceCode.trim();
    if (!code) {
      setLookupError('Enter a reference code to continue.');
      return;
    }

    lookupMutation.mutate(code);
  };

  const sessions = useMemo(() => recentSessions ?? [], [recentSessions]);

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="border-b bg-white">
        <div className="max-w-4xl mx-auto px-4 py-10">
          <p className="text-sm uppercase tracking-[0.3em] text-slate-400">Study mode</p>
          <h1 className="text-4xl font-semibold text-slate-900">IELTS Prep Center</h1>
          <p className="mt-2 text-slate-600">Serious practice for General & Academic modules.</p>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-8 space-y-10">
        <section className="bg-white border border-slate-200 shadow-sm rounded-2xl p-6 space-y-6">
          <div>
            <h2 className="text-2xl font-semibold text-slate-900">Start a new practice pack</h2>
            <p className="text-sm text-slate-500">Guided Reading, Listening, and Writing tasks in one session.</p>
          </div>
          <form onSubmit={handleStartSession} className="grid gap-4 sm:grid-cols-2">
            <label className="flex flex-col text-sm font-medium text-slate-700">
              Module
              <select
                value={moduleType}
                onChange={(event) => setModuleType(event.target.value as IeltsModuleType)}
                className="mt-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-base focus:border-sky-500 focus:outline-none"
              >
                <option value="general">General Training</option>
                <option value="academic">Academic</option>
              </select>
            </label>
            <label className="flex flex-col text-sm font-medium text-slate-700">
              Target band (optional)
              <input
                type="text"
                inputMode="decimal"
                value={targetBandInput}
                onChange={(event) => setTargetBandInput(event.target.value)}
                placeholder="e.g. 7.5"
                className="mt-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-base focus:border-sky-500 focus:outline-none"
              />
            </label>
            <div className="sm:col-span-2 flex flex-col gap-2">
              {formError && <p className="text-sm text-red-600">{formError}</p>}
              <button
                type="submit"
                disabled={createPackMutation.isPending}
                className="inline-flex items-center justify-center rounded-lg bg-sky-700 px-5 py-3 text-white font-medium shadow disabled:opacity-70"
              >
                {createPackMutation.isPending ? 'Preparing session…' : 'Start guided session'}
              </button>
            </div>
          </form>
        </section>

        <section className="bg-white border border-slate-200 shadow-sm rounded-2xl p-6 space-y-4">
          <div>
            <h2 className="text-2xl font-semibold text-slate-900">Lookup past report</h2>
            <p className="text-sm text-slate-500">Re-open any report with its reference code.</p>
          </div>
          <form onSubmit={handleLookup} className="flex flex-col gap-3 sm:flex-row">
            <input
              type="text"
              value={referenceCode}
              onChange={(event) => setReferenceCode(event.target.value)}
              placeholder="Reference code"
              className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-base focus:border-sky-500 focus:outline-none"
            />
            <button
              type="submit"
              disabled={lookupMutation.isPending}
              className="rounded-lg bg-slate-900 px-5 py-2 text-white font-medium shadow disabled:opacity-70"
            >
              {lookupMutation.isPending ? 'Searching…' : 'Find report'}
            </button>
          </form>
          {lookupError && <p className="text-sm text-red-600">{lookupError}</p>}
        </section>

        <section className="bg-white border border-slate-200 shadow-sm rounded-2xl p-6">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-semibold text-slate-900">Recent sessions</h2>
              <p className="text-sm text-slate-500">Last five practice packs for your account.</p>
            </div>
            <span className="text-sm text-slate-500">Updated in real time</span>
          </div>
          {isSessionsLoading && <p className="text-sm text-slate-500">Loading sessions…</p>}
          {sessionsError && <p className="text-sm text-red-600">Unable to load sessions.</p>}
          {!isSessionsLoading && sessions.length === 0 && (
            <p className="text-sm text-slate-500">No sessions yet. Launch your first practice pack above.</p>
          )}
          {sessions.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="text-slate-500">
                    <th className="py-2 font-medium">Date</th>
                    <th className="py-2 font-medium">Module</th>
                    <th className="py-2 font-medium">Reference code</th>
                    <th className="py-2 font-medium">Status</th>
                    <th className="py-2 font-medium">Overall band</th>
                    <th className="py-2 font-medium text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {sessions.map((session) => (
                    <tr key={session.id} className="border-t border-slate-100 text-slate-700">
                      <td className="py-2">{formatDate(session.created_at)}</td>
                      <td className="py-2">{resolveModuleLabel(session)}</td>
                      <td className="py-2 font-mono text-xs text-slate-500">{session.reference_code}</td>
                      <td className="py-2">{session.status === 'completed' ? 'Completed' : 'In progress'}</td>
                      <td className="py-2">{session.band_overall ?? '—'}</td>
                      <td className="py-2 text-right">
                        <button
                          type="button"
                          className="text-sky-700 font-medium"
                          onClick={() => navigate(`/ielts/session/${session.id}`)}
                        >
                          Open
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
};

export default IeltsHome;
