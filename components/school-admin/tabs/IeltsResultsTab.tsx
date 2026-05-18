import React, { useEffect, useMemo, useState } from 'react';
import { useSchoolAdmin } from '../SchoolAdminContext';
import {
  rpcIeltsSchoolResults,
  type IeltsSchoolResultsResponse,
  type IeltsSchoolResultsStudentRow,
} from '../../../services/ieltsResultsService';

const formatNumber = (value?: number | null) => (typeof value === 'number' && Number.isFinite(value) ? value.toLocaleString() : '—');

const formatEstimate = (value?: number | null) => (typeof value === 'number' && Number.isFinite(value) ? value.toFixed(1) : '—');

const formatDateTime = (value?: string | null) => {
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '—';
  return parsed.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
};

const getStudentName = (row: IeltsSchoolResultsStudentRow) => row.username || row.email || 'Unnamed student';

const IeltsResultsTab: React.FC = () => {
  const { classes = [], students = [], school } = useSchoolAdmin();
  const [selectedClassId, setSelectedClassId] = useState('');
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [results, setResults] = useState<IeltsSchoolResultsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedClassName = useMemo(
    () => classes.find((cls: any) => cls.id === selectedClassId)?.class_name ?? null,
    [classes, selectedClassId],
  );

  const selectedStudentName = useMemo(
    () => students.find((student: any) => student.user_id === selectedStudentId)?.username ?? null,
    [students, selectedStudentId],
  );

  const loadResults = async () => {
    if (!school?.id) return;
    setLoading(true);
    setError(null);
    try {
      const response = await rpcIeltsSchoolResults({
        schoolId: school.id,
        classId: selectedClassId || null,
        studentId: selectedStudentId || null,
        limit: 100,
      });
      setResults(response);
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : 'Unable to load IELTS results.';
      setError(message);
      setResults(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadResults();
  }, [school?.id, selectedClassId, selectedStudentId]);

  const summary = results?.summary;
  const rows = results?.students ?? [];
  const summaryCards = [
    { label: 'Total students', value: formatNumber(summary?.total_students), detail: 'Students in the current school scope.' },
    { label: 'Assigned practice', value: formatNumber(summary?.assigned_practice_count), detail: 'School-scoped practice rows assigned.' },
    { label: 'Completed practice', value: formatNumber(summary?.completed_practice_count), detail: 'Assigned practice marked completed.' },
    { label: 'Exam submissions', value: formatNumber(summary?.exam_submission_count), detail: 'Secure Exam Mode submissions.' },
    { label: 'Average estimated readiness', value: formatEstimate(summary?.average_estimated_overall), detail: 'Practice-derived readiness estimate; not a certified band score.' },
  ];

  return (
    <div className="space-y-6" data-testid="ielts-results-tab">
      <div className="rounded-2xl border border-amber-500/30 bg-gradient-to-br from-gray-900 to-amber-950/30 p-6 shadow-xl">
        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-amber-300">IELTS Academy</p>
        <h3 className="mt-2 text-2xl font-bold text-white">IELTS Results</h3>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-amber-50/80">
          Review school-scoped practice completion, Exam Mode submission counts, and Estimated readiness without exposing protected answers.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <label className="rounded-xl border border-gray-700 bg-gray-900/80 p-4 text-sm text-gray-300">
          <span className="mb-2 block font-semibold text-white">Class</span>
          <select
            className="w-full rounded-lg border border-gray-700 bg-gray-800 p-2 text-gray-200"
            value={selectedClassId}
            onChange={(event) => setSelectedClassId(event.target.value)}
          >
            <option value="">All classes ({classes.length})</option>
            {classes.map((cls: any) => (
              <option key={cls.id} value={cls.id}>{cls.class_name}</option>
            ))}
          </select>
          <p className="mt-2 text-xs text-gray-500">{selectedClassName ? `Filtering ${selectedClassName}.` : 'Safe school-scoped class filter.'}</p>
        </label>

        <label className="rounded-xl border border-gray-700 bg-gray-900/80 p-4 text-sm text-gray-300">
          <span className="mb-2 block font-semibold text-white">Student</span>
          <select
            className="w-full rounded-lg border border-gray-700 bg-gray-800 p-2 text-gray-200"
            value={selectedStudentId}
            onChange={(event) => setSelectedStudentId(event.target.value)}
          >
            <option value="">All students ({students.length})</option>
            {students.map((student: any) => (
              <option key={student.user_id} value={student.user_id}>{student.username || student.email || 'Unnamed student'}</option>
            ))}
          </select>
          <p className="mt-2 text-xs text-gray-500">{selectedStudentName ? `Filtering ${selectedStudentName}.` : 'Safe school-scoped student filter.'}</p>
        </label>

        <div className="rounded-xl border border-gray-700 bg-gray-900/80 p-4 text-sm text-gray-300">
          <span className="mb-2 block font-semibold text-white">Result source</span>
          <p className="text-gray-400">Loaded only through the school results RPC. This view does not read raw practice content tables.</p>
          <button
            type="button"
            onClick={() => void loadResults()}
            className="mt-3 rounded-lg border border-amber-400/50 px-3 py-2 text-xs font-semibold text-amber-200 hover:bg-amber-500/10 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={loading || !school?.id}
          >
            {loading ? 'Refreshing…' : 'Refresh results'}
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-2xl border border-red-500/40 bg-red-950/40 p-5 text-sm text-red-100">
          <p className="font-semibold">Unable to load IELTS Results</p>
          <p className="mt-1 text-red-100/80">{error}</p>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {summaryCards.map((card) => (
          <div key={card.label} data-testid={`ielts-results-summary-${card.label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`} className="rounded-2xl border border-amber-500/20 bg-gray-900/80 p-5 shadow-lg">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-300">{card.label}</p>
            <p className="mt-3 text-3xl font-bold text-white">{loading && !results ? '…' : card.value}</p>
            <p className="mt-2 text-xs leading-relaxed text-gray-400">{card.detail}</p>
          </div>
        ))}
      </div>

      <section className="rounded-2xl border border-amber-500/30 bg-gray-900/80 p-5">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <h4 className="text-lg font-semibold text-white">Student Results</h4>
            <p className="text-sm text-gray-400">Estimated readiness is a school-safe planning signal; not a certified band score.</p>
          </div>
          {loading && <span className="text-sm text-amber-200">Loading results…</span>}
        </div>

        {!loading && !error && rows.length === 0 && (
          <div className="mt-5 rounded-xl border border-dashed border-gray-700 bg-black/20 p-6 text-center text-sm text-gray-300">
            No IELTS result rows found for the selected filters yet.
          </div>
        )}

        {rows.length > 0 && (
          <div className="mt-5 overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-800 text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-gray-400">
                <tr>
                  <th className="px-3 py-3">Student</th>
                  <th className="px-3 py-3">Class</th>
                  <th className="px-3 py-3">Practice</th>
                  <th className="px-3 py-3">Reading</th>
                  <th className="px-3 py-3">Listening</th>
                  <th className="px-3 py-3">Writing</th>
                  <th className="px-3 py-3">Speaking</th>
                  <th className="px-3 py-3">Estimated readiness</th>
                  <th className="px-3 py-3">Last activity</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800 text-gray-200">
                {rows.map((row) => (
                  <tr key={row.student_id} data-testid={`ielts-results-student-${row.student_id}`} className="align-top hover:bg-amber-500/5">
                    <td className="px-3 py-4">
                      <p className="font-semibold text-white">{getStudentName(row)}</p>
                      <p className="text-xs text-gray-400">{row.email || 'No email'}</p>
                    </td>
                    <td className="px-3 py-4 text-gray-300">{row.class_name || '—'}</td>
                    <td className="px-3 py-4 text-gray-300">{formatNumber(row.completed_practice_total)} / {formatNumber(row.assigned_practice_total)}</td>
                    <td className="px-3 py-4">{formatEstimate(row.latest_reading_estimate)}</td>
                    <td className="px-3 py-4">{formatEstimate(row.latest_listening_estimate)}</td>
                    <td className="px-3 py-4">{formatEstimate(row.latest_writing_estimate)}</td>
                    <td className="px-3 py-4">{formatEstimate(row.latest_speaking_estimate)}</td>
                    <td className="px-3 py-4 font-semibold text-amber-100">{formatEstimate(row.latest_overall_estimate)}</td>
                    <td className="px-3 py-4 text-gray-300">{formatDateTime(row.last_activity_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
};

export default IeltsResultsTab;
