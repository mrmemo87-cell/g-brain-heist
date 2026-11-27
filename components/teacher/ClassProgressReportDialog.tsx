import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { fetchClassProgressReport } from '../../services/classProgressReportService';
import { analyseClassProgress, suggestTests, testOptions, longDate, type CprData } from '../../src/lib/classProgressReport';
import { openClassProgressPrint } from '../../src/lib/classProgressReportPrint';
import { DEFAULT_BOOKLET_PRINT_SETTINGS, type BookletPrintSettings } from '../../src/lib/paperScan/printBooklets';

interface Props {
  groupId: string;
  groupName: string;
  onClose: () => void;
}

/**
 * Class Progress Report for school leadership. The teacher picks the start and end tests (the app suggests them),
 * edits the note and next-term focus the app drafts from the data, and prints with Brains Heist smart printing.
 */
const ClassProgressReportDialog: React.FC<Props> = ({ groupId, groupName, onClose }) => {
  const [data, setData] = useState<CprData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [baselineId, setBaselineId] = useState<string>('');
  const [latestId, setLatestId] = useState<string>('');
  const [note, setNote] = useState('');
  const [focus, setFocus] = useState('');
  const [edited, setEdited] = useState(false);
  const [settings, setSettings] = useState<BookletPrintSettings>(DEFAULT_BOOKLET_PRINT_SETTINGS);
  const [popupBlocked, setPopupBlocked] = useState(false);

  useEffect(() => {
    let active = true;
    setData(null); setError(null);
    fetchClassProgressReport(groupId)
      .then((value) => {
        if (!active) return;
        const suggestion = suggestTests(value);
        setBaselineId(suggestion.baselineId ?? '');
        setLatestId(suggestion.latestId ?? '');
        setData(value);
      })
      .catch((err: unknown) => { if (active) setError(err instanceof Error ? err.message : 'The progress report could not be opened.'); });
    return () => { active = false; };
  }, [groupId]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const tests = useMemo(() => (data ? testOptions(data) : []), [data]);
  const model = useMemo(() => (data ? analyseClassProgress(data, { baselineId: baselineId || null, latestId: latestId || null }) : null), [data, baselineId, latestId]);

  // The note and focus are drafted from the data until the teacher edits them.
  useEffect(() => {
    if (!model || edited) return;
    setNote(model.teacherNote);
    setFocus(model.focus.join('\n'));
  }, [model, edited]);

  const print = () => {
    if (!model || !data) return;
    const reserved = window.open('', '_blank');
    const win = openClassProgressPrint(model, {
      settings, teacherNote: note, focus: focus.split('\n'), schoolId: data.school.id, groupId: data.group.id,
    }, reserved);
    setPopupBlocked(!win);
  };

  const label = (t: (typeof tests)[number]) => `${t.title} · ${longDate(t.assigned_at)} · ${t.sat} sat it`;

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-3 sm:p-4" role="dialog" aria-modal="true" aria-labelledby="class-progress-report-title">
      <button type="button" className="absolute inset-0 bg-slate-950/60" onClick={onClose} aria-label="Close progress report" />
      <div className="relative flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="border-b border-slate-200 px-6 py-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">Class progress report · for school leadership</p>
          <h3 id="class-progress-report-title" className="mt-1 text-xl font-bold text-slate-900">{groupName}</h3>
          <p className="mt-1 text-sm text-slate-600">Two printed A4 pages with the school logo: progress, skills, engagement, students who need support and your note.</p>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
          {error ? <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800" role="alert">{error}</p> : null}
          {!error && !model ? <p className="text-sm text-slate-500" role="status">Loading the class's results…</p> : null}

          {model ? <>
            <section className="grid gap-3 sm:grid-cols-2">
              <label className="block text-sm">
                <span className="font-semibold text-slate-800">Start point</span>
                <select className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" value={baselineId} onChange={(e) => setBaselineId(e.target.value)}>
                  <option value="">Earlier work (no start test)</option>
                  {tests.map((t) => <option key={t.id} value={t.id} disabled={t.id === latestId}>{label(t)}</option>)}
                </select>
              </label>
              <label className="block text-sm">
                <span className="font-semibold text-slate-800">End point</span>
                <select className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" value={latestId} onChange={(e) => setLatestId(e.target.value)}>
                  <option value="">Recent work (no end test)</option>
                  {tests.map((t) => <option key={t.id} value={t.id} disabled={t.id === baselineId}>{label(t)}</option>)}
                </select>
              </label>
              <p className="text-xs text-slate-500 sm:col-span-2">
                {model.mode === 'tests'
                  ? `Averages count the ${model.matched} students who sat both tests.`
                  : 'No two tests chosen: the report compares each student\'s earlier and recent marked work and says so on the page.'}
              </p>
            </section>

            <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                ['Average', model.averageNow === null ? '—' : `${model.averageNow}%`, model.averageStart === null ? '' : `from ${model.averageStart}%`],
                ['Improving', `${model.improving}`, `of ${model.matched}`],
                ['Completed', model.completion === null ? '—' : `${model.completion}%`, `${model.doneTotal} / ${model.assignedTotal}`],
                ['Need support', `${model.support.length}`, model.status.label],
              ].map(([title, value, sub]) => (
                <div key={title} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs font-semibold text-slate-500">{title}</p>
                  <p className="text-xl font-black text-slate-900">{value}</p>
                  <p className="text-xs text-slate-600">{sub}</p>
                </div>
              ))}
            </section>
            <p className="text-xs text-slate-500">
              Expected level {model.expectedLevel}% · {model.expectedLevelSet ? 'set by your school' : 'school default (an administrator can change it in School Settings)'}.
            </p>

            <label className="block text-sm">
              <span className="font-semibold text-slate-800">Teacher's note</span>
              <span className="ml-2 text-xs text-slate-500">Drafted from the results — edit before printing</span>
              <textarea className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" rows={5} maxLength={900} value={note}
                onChange={(e) => { setEdited(true); setNote(e.target.value); }} />
            </label>
            <label className="block text-sm">
              <span className="font-semibold text-slate-800">Focus for next term</span>
              <span className="ml-2 text-xs text-slate-500">One point per line (up to 4)</span>
              <textarea className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" rows={4} maxLength={600} value={focus}
                onChange={(e) => { setEdited(true); setFocus(e.target.value.split('\n').slice(0, 4).join('\n')); }} />
            </label>
            {edited ? <button type="button" className="text-xs font-semibold text-blue-700 underline" onClick={() => setEdited(false)}>Restore the drafted note and focus</button> : null}

            <section className="grid gap-3 sm:grid-cols-2">
              <label className="block text-sm">
                <span className="font-semibold text-slate-800">Print sides</span>
                <select className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" value={settings.duplex ? 'double' : 'single'}
                  onChange={(e) => setSettings((s) => ({ ...s, duplex: e.target.value === 'double' }))}>
                  <option value="double">Double-sided (one sheet)</option>
                  <option value="single">Single-sided</option>
                </select>
              </label>
              <label className="block text-sm">
                <span className="font-semibold text-slate-800">Pages per side</span>
                <select className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" value={settings.pagesPerSide}
                  onChange={(e) => setSettings((s) => ({ ...s, pagesPerSide: Number(e.target.value) as 1 | 2 | 4 }))}>
                  <option value={1}>1 (recommended)</option>
                  <option value={2}>2</option>
                </select>
              </label>
            </section>
            {popupBlocked ? <p className="text-sm text-red-700" role="alert">The print preview was blocked. Allow pop-ups for Brains Heist and try again.</p> : null}
          </> : null}
        </div>

        <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 px-6 py-4">
          <button type="button" className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700" onClick={onClose}>Close</button>
          <button type="button" className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" disabled={!model} onClick={print}>
            Preview &amp; print
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default ClassProgressReportDialog;
