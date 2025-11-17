import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  createPack,
  fetchRecentSessions,
  fetchActiveReadingSets,
  fetchActiveListeningSets,
  fetchActiveWritingTasks,
  fetchActiveSpeakingTasks,
  getByReference,
  IeltsModuleType,
  IeltsSessionSummary,
} from '../../../services/ieltsService';
import { BookOpen, Headphones, PenTool, Mic } from 'lucide-react';

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

  const { data: listeningSets, isLoading: isListeningSetsLoading } = useQuery({
    queryKey: ['listening-sets'],
    queryFn: fetchActiveListeningSets,
  });

  const { data: writingTasks, isLoading: isWritingTasksLoading } = useQuery({
    queryKey: ['writing-tasks'],
    queryFn: fetchActiveWritingTasks,
  });

  const { data: speakingTasks, isLoading: isSpeakingTasksLoading } = useQuery({
    queryKey: ['speaking-tasks'],
    queryFn: fetchActiveSpeakingTasks,
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
        {/* NEW: 4-Skill Practice System */}
        <section className="space-y-4">
          <div>
            <h2 className="text-2xl font-semibold text-slate-900">Practice by Skill</h2>
            <p className="text-sm text-slate-500">Free sample exercises to build your confidence. Upgrade to Prime for full mock tests.</p>
          </div>

          {/* Reading */}
          <div className="bg-white border border-slate-200 shadow-sm rounded-2xl p-6">
            <div className="flex items-start gap-4">
              <div className="p-3 bg-blue-100 rounded-lg">
                <BookOpen className="w-6 h-6 text-blue-700" />
              </div>
              <div className="flex-1">
                <h3 className="text-xl font-semibold text-slate-900">Reading</h3>
                <p className="text-sm text-slate-600 mt-1">Academic passages with comprehension questions</p>
                {isReadingSetsLoading ? (
                  <p className="text-sm text-slate-500 mt-3">Loading exercises...</p>
                ) : (
                  <div className="mt-4 space-y-2">
                    {readingSets?.map((set) => (
                      <button
                        key={set.id}
                        onClick={() => navigate(`/ielts/reading/${set.id}`)}
                        className="w-full text-left p-3 border border-slate-200 rounded-lg hover:border-blue-400 hover:bg-blue-50 transition-colors"
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-medium text-slate-900">{set.title}</p>
                            <p className="text-sm text-slate-600">{set.description}</p>
                          </div>
                          <div className="text-right">
                            <span className="inline-block px-2 py-1 text-xs font-medium bg-slate-100 text-slate-700 rounded">
                              {set.level}
                            </span>
                            <p className="text-xs text-slate-500 mt-1">Band {set.est_band_min}-{set.est_band_max}</p>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Listening */}
          <div className="bg-white border border-slate-200 shadow-sm rounded-2xl p-6">
            <div className="flex items-start gap-4">
              <div className="p-3 bg-purple-100 rounded-lg">
                <Headphones className="w-6 h-6 text-purple-700" />
              </div>
              <div className="flex-1">
                <h3 className="text-xl font-semibold text-slate-900">Listening</h3>
                <p className="text-sm text-slate-600 mt-1">Audio exercises with note-taking practice</p>
                {isListeningSetsLoading ? (
                  <p className="text-sm text-slate-500 mt-3">Loading exercises...</p>
                ) : (
                  <div className="mt-4 space-y-2">
                    {listeningSets?.map((set) => (
                      <button
                        key={set.id}
                        onClick={() => navigate(`/ielts/listening/${set.id}`)}
                        className="w-full text-left p-3 border border-slate-200 rounded-lg hover:border-purple-400 hover:bg-purple-50 transition-colors"
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-medium text-slate-900">{set.title}</p>
                            <p className="text-sm text-slate-600">{set.description}</p>
                          </div>
                          <div className="text-right">
                            <span className="inline-block px-2 py-1 text-xs font-medium bg-slate-100 text-slate-700 rounded">
                              {set.level}
                            </span>
                            <p className="text-xs text-slate-500 mt-1">Band {set.est_band_min}-{set.est_band_max}</p>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Writing */}
          <div className="bg-white border border-slate-200 shadow-sm rounded-2xl p-6">
            <div className="flex items-start gap-4">
              <div className="p-3 bg-green-100 rounded-lg">
                <PenTool className="w-6 h-6 text-green-700" />
              </div>
              <div className="flex-1">
                <h3 className="text-xl font-semibold text-slate-900">Writing</h3>
                <p className="text-sm text-slate-600 mt-1">Task 1 & Task 2 prompts with expert feedback</p>
                {isWritingTasksLoading ? (
                  <p className="text-sm text-slate-500 mt-3">Loading tasks...</p>
                ) : (
                  <div className="mt-4 space-y-2">
                    {writingTasks?.map((task) => (
                      <button
                        key={task.id}
                        onClick={() => navigate(`/ielts/writing/${task.id}`)}
                        className="w-full text-left p-3 border border-slate-200 rounded-lg hover:border-green-400 hover:bg-green-50 transition-colors"
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-medium text-slate-900">{task.title}</p>
                            <p className="text-sm text-slate-600">{task.prompt.substring(0, 100)}...</p>
                          </div>
                          <div className="text-right">
                            <span className="inline-block px-2 py-1 text-xs font-medium bg-slate-100 text-slate-700 rounded">
                              {task.task_type === 'task1' ? 'Task 1' : 'Task 2'}
                            </span>
                            <p className="text-xs text-slate-500 mt-1">Target: {task.bands_target}</p>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Speaking */}
          <div className="bg-white border border-slate-200 shadow-sm rounded-2xl p-6">
            <div className="flex items-start gap-4">
              <div className="p-3 bg-orange-100 rounded-lg">
                <Mic className="w-6 h-6 text-orange-700" />
              </div>
              <div className="flex-1">
                <h3 className="text-xl font-semibold text-slate-900">Speaking</h3>
                <p className="text-sm text-slate-600 mt-1">Record your responses and get expert feedback</p>
                {isSpeakingTasksLoading ? (
                  <p className="text-sm text-slate-500 mt-3">Loading tasks...</p>
                ) : (
                  <div className="mt-4 space-y-2">
                    {speakingTasks?.map((task) => (
                      <button
                        key={task.id}
                        onClick={() => navigate(`/ielts/speaking/${task.id}`)}
                        className="w-full text-left p-3 border border-slate-200 rounded-lg hover:border-orange-400 hover:bg-orange-50 transition-colors"
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-medium text-slate-900">{task.prompt.substring(0, 80)}...</p>
                          </div>
                          <div className="text-right">
                            <span className="inline-block px-2 py-1 text-xs font-medium bg-slate-100 text-slate-700 rounded">
                              Part {task.part}
                            </span>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Upgrade CTA */}
          <div className="bg-gradient-to-r from-blue-600 to-purple-600 rounded-2xl p-6 text-white">
            <h3 className="text-xl font-semibold">Ready for the Full Experience?</h3>
            <p className="text-sm text-blue-100 mt-2">Upgrade to Prime Prep for full mock tests, detailed feedback, and certificates signed by Brains Heist Academy.</p>
            <button
              onClick={() => navigate('/ielts/prime-application')}
              className="mt-4 px-6 py-2 bg-white text-blue-700 font-medium rounded-lg hover:bg-blue-50 transition-colors"
            >
              Apply for Prime Access
            </button>
          </div>
        </section>

        {/* Original Session System */}
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
