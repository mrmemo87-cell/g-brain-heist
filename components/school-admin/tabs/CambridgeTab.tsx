import React from 'react';
import { supabase } from '../../../services/supabaseClient';
import {
  fetchSchoolAcademicSetup,
  type AcademicYearSetup,
} from '../../../services/schoolAcademicSetupService';
import { useSchoolAdmin } from '../SchoolAdminContext';

const getCambridgeReportKey = (score: any) =>
  `${score.test_id || score.quiz_name || 'unknown'}::${score.quiz_version || 'legacy-v1'}`;

const getCambridgeReportLabel = (score: any) =>
  `${score.quiz_name || 'Unknown test'} · ${score.quiz_version || 'legacy-v1'}`;

const CambridgeTab: React.FC = () => {
  const {
    addToast,
    allowQuizRetake,
    bulkSetSchoolVisibility,
    classFilter,
    fetchQuizScores,
    filteredSchoolVisibility,
    linkCambridgeAttemptStudent,
    loadSchoolVisibility,
    quizFilter,
    quizScores,
    quizScoresLoading,
    school,
    schoolVisibility,
    schoolVisibilityLoading,
    schoolVisibilitySubjectFilter,
    schoolVisibilitySubjects,
    selectedSchoolTests,
    setClassFilter,
    setConfirmDialog,
    setQuizFilter,
    setSchoolVisibilitySubjectFilter,
    setSelectedSchoolTests,
    setShowSchoolVisibility,
    showSchoolVisibility,
    students,
    toggleSchoolTestVisibility,
  } = useSchoolAdmin();

  const [identitySelections, setIdentitySelections] = React.useState<Record<string, string>>({});
  const [academicYears, setAcademicYears] = React.useState<AcademicYearSetup[]>([]);
  const [selectedYearId, setSelectedYearId] = React.useState('');
  const [yearsLoading, setYearsLoading] = React.useState(false);
  const [historicalScores, setHistoricalScores] = React.useState<any[]>([]);
  const [historicalLoading, setHistoricalLoading] = React.useState(false);

  const currentYear = React.useMemo(
    () => academicYears.find((year) => year.status === 'current') || null,
    [academicYears],
  );

  const selectedYear = React.useMemo(
    () => academicYears.find((year) => year.id === selectedYearId) || currentYear,
    [academicYears, currentYear, selectedYearId],
  );

  const isCurrentYear = Boolean(currentYear && selectedYear?.id === currentYear.id);
  const displayedScores = isCurrentYear ? quizScores : historicalScores;
  const reportsLoading = isCurrentYear ? quizScoresLoading : historicalLoading;

  React.useEffect(() => {
    if (!school?.id) return;
    let active = true;

    const loadAcademicYears = async () => {
      setYearsLoading(true);
      try {
        const setup = await fetchSchoolAcademicSetup(school.id);
        if (!active) return;
        const years = [...(setup.years || [])].sort((left, right) =>
          right.startsOn.localeCompare(left.startsOn),
        );
        setAcademicYears(years);
        const preferredYear = years.find((year) => year.status === 'current') || years[0];
        setSelectedYearId((existing) => existing || preferredYear?.id || '');
      } catch (error) {
        console.error('Failed to load Cambridge academic years:', error);
        if (active) addToast('Failed to load academic years for Cambridge reports', 'error');
      } finally {
        if (active) setYearsLoading(false);
      }
    };

    void loadAcademicYears();
    return () => { active = false; };
  }, [addToast, school?.id]);

  const verifiedStudents = React.useMemo(
    () => students
      .filter((student: any) => student.full_name_status === 'verified' && student.full_name)
      .sort((left: any, right: any) =>
        (left.full_name || left.username).localeCompare(right.full_name || right.username)),
    [students],
  );

  const loadHistoricalYear = React.useCallback(async (academicYearId: string): Promise<boolean> => {
    if (!academicYearId) return false;
    setHistoricalLoading(true);
    try {
      const { data, error } = await supabase.rpc('get_school_cambridge_scores_for_year', {
        p_academic_year_id: academicYearId,
        p_limit: 500,
      });
      if (error) {
        console.error('Failed to load archived Cambridge scores:', error);
        addToast('Failed to load archived Cambridge reports', 'error');
        return false;
      }
      setHistoricalScores(data || []);
      return true;
    } catch (error) {
      console.error('Exception loading archived Cambridge scores:', error);
      addToast('Failed to load archived Cambridge reports', 'error');
      return false;
    } finally {
      setHistoricalLoading(false);
    }
  }, [addToast]);

  const loadSelectedReports = React.useCallback(async () => {
    if (!selectedYear) {
      await fetchQuizScores();
      return;
    }
    if (currentYear && selectedYear.id === currentYear.id) {
      await fetchQuizScores();
      return;
    }
    await loadHistoricalYear(selectedYear.id);
  }, [currentYear, fetchQuizScores, loadHistoricalYear, selectedYear]);

  const handleYearChange = async (academicYearId: string) => {
    setSelectedYearId(academicYearId);
    setQuizFilter('all');
    setClassFilter('all');
    setIdentitySelections({});

    if (academicYearId === currentYear?.id) {
      await fetchQuizScores();
      return;
    }
    await loadHistoricalYear(academicYearId);
  };

  const filteredDisplayedScores = React.useMemo(() => displayedScores.filter((score: any) => {
    if (quizFilter !== 'all' && getCambridgeReportKey(score) !== quizFilter) return false;
    if (classFilter !== 'all' && (score.student_class || 'Unknown') !== classFilter) return false;
    return true;
  }), [classFilter, displayedScores, quizFilter]);

  const uniqueQuizReports = React.useMemo(() => {
    const byKey = new Map<string, { key: string; label: string; count: number }>();
    displayedScores.forEach((score: any) => {
      const key = getCambridgeReportKey(score);
      const existing = byKey.get(key);
      byKey.set(key, existing
        ? { ...existing, count: existing.count + 1 }
        : { key, label: getCambridgeReportLabel(score), count: 1 });
    });
    return Array.from(byKey.values()).sort((left, right) => left.label.localeCompare(right.label));
  }, [displayedScores]);

  const uniqueClasses = React.useMemo(
    () => Array.from(new Set(displayedScores.map((score: any) => score.student_class || 'Unknown'))).sort(),
    [displayedScores],
  );

  const exportDisplayedCSV = () => {
    if (filteredDisplayedScores.length === 0) {
      addToast('No data to export', 'error');
      return;
    }

    const headers = ['Academic Year', 'Student Name', 'Class', 'Quiz Name', 'Test ID', 'Version', 'Attempt', 'Status', 'Score', 'Total', 'Percentage', 'Time (seconds)', 'Submitted At'];
    const rows = filteredDisplayedScores.map((score: any) => [
      selectedYear?.name || '',
      score.student_name || '',
      score.student_class || '',
      score.quiz_name || '',
      score.test_id || '',
      score.quiz_version || 'legacy-v1',
      score.attempt_number || 1,
      score.attempt_status || 'submitted',
      score.score || 0,
      score.total_questions || 0,
      score.percentage || 0,
      score.time_taken_seconds || 0,
      score.submitted_at || '',
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')),
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    const yearSlug = (selectedYear?.name || 'academic-year').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '');
    link.download = `cambridge_scores_${yearSlug}_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
    addToast('CSV exported successfully', 'success');
  };

  return (
    <div className="school-admin-themed-tab space-y-6">
      <section className="admin-section-heading">
        <div>
          <p className="school-admin-eyebrow">Assessments</p>
          <h2>Cambridge Assessments</h2>
          <p>Review current results and safely access previous academic-year history.</p>
        </div>
      </section>

      <section className="admin-table-card p-6">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-xl font-bold text-slate-900">Cambridge test reports</h3>
            <p className="mt-1 text-sm text-slate-500">Previous years are archived and kept separate from the active school year.</p>
          </div>
          <button
            onClick={() => {
              setShowSchoolVisibility(!showSchoolVisibility);
              if (!showSchoolVisibility && schoolVisibility.length === 0) loadSchoolVisibility();
            }}
            className={`cambridge-white-action rounded-lg px-4 py-2 text-sm font-semibold transition-all ${
              showSchoolVisibility
                ? 'bg-purple-600 text-white hover:bg-purple-700'
                : 'border border-purple-400 bg-purple-600/30 text-white hover:bg-purple-600/50'
            }`}
          >
            {showSchoolVisibility ? 'Hide' : 'Open'} visibility manager
          </button>
        </div>

        {showSchoolVisibility && (
          <div className="mb-6 rounded-xl border border-purple-500/50 bg-gray-900/70 p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h4 className="text-lg font-bold text-purple-300">School-level test visibility</h4>
                <p className="mt-1 text-xs text-gray-400">Choose which tests teachers may release. Disabling a test removes it from every class immediately.</p>
              </div>
              <button
                onClick={loadSchoolVisibility}
                disabled={schoolVisibilityLoading}
                className="rounded-lg bg-gray-700 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-gray-600 disabled:opacity-50"
              >
                {schoolVisibilityLoading ? 'Loading…' : 'Refresh'}
              </button>
            </div>

            {schoolVisibilityLoading ? (
              <div className="py-8 text-center text-gray-400">Loading test visibility settings...</div>
            ) : schoolVisibility.length === 0 ? (
              <div className="py-8 text-center text-gray-400">No Cambridge tests found in the catalog.</div>
            ) : (
              <>
                <div className="mb-4 flex flex-wrap items-center gap-3">
                  <select
                    value={schoolVisibilitySubjectFilter}
                    onChange={(event) => {
                      setSchoolVisibilitySubjectFilter(event.target.value);
                      setSelectedSchoolTests(new Set());
                    }}
                    className="rounded-lg border border-gray-600 bg-gray-700 px-3 py-1.5 text-sm text-white focus:border-purple-500 focus:outline-none"
                  >
                    <option value="all">All Subjects ({schoolVisibility.length})</option>
                    {schoolVisibilitySubjects.map((subject: string) => (
                      <option key={subject} value={subject}>
                        {subject} ({schoolVisibility.filter((test: any) => test.subject === subject).length})
                      </option>
                    ))}
                  </select>

                  <label className="flex cursor-pointer select-none items-center gap-2">
                    <input
                      type="checkbox"
                      checked={selectedSchoolTests.size === filteredSchoolVisibility.length && filteredSchoolVisibility.length > 0}
                      ref={(element) => {
                        if (element) element.indeterminate = selectedSchoolTests.size > 0 && selectedSchoolTests.size < filteredSchoolVisibility.length;
                      }}
                      onChange={(event) => {
                        setSelectedSchoolTests(event.target.checked
                          ? new Set(filteredSchoolVisibility.map((test: any) => test.test_id))
                          : new Set());
                      }}
                      className="h-4 w-4 rounded border-gray-500 bg-gray-700 text-purple-500 focus:ring-purple-500"
                    />
                    <span className="text-xs font-medium text-gray-300">
                      {selectedSchoolTests.size === filteredSchoolVisibility.length && filteredSchoolVisibility.length > 0 ? 'Deselect All' : 'Select All'} ({filteredSchoolVisibility.length})
                    </span>
                  </label>

                  {selectedSchoolTests.size > 0 && (
                    <>
                      <button
                        onClick={() => setConfirmDialog({
                          title: 'Show selected tests?',
                          description: `This will make ${selectedSchoolTests.size} test(s) available for teachers to release to their classes.`,
                          confirmLabel: 'Show Tests',
                          onConfirm: async () => {
                            await bulkSetSchoolVisibility(Array.from(selectedSchoolTests), true);
                            setSelectedSchoolTests(new Set());
                          },
                        })}
                        disabled={Array.from(selectedSchoolTests).every((id: string) => filteredSchoolVisibility.find((test: any) => test.test_id === id)?.is_visible)}
                        className="rounded-lg border border-green-500 bg-green-600/30 px-3 py-1.5 text-xs font-semibold text-green-300 transition-colors hover:bg-green-600/50 disabled:cursor-not-allowed disabled:opacity-30"
                      >
                        Show selected ({selectedSchoolTests.size})
                      </button>
                      <button
                        onClick={() => setConfirmDialog({
                          title: 'Hide selected tests?',
                          description: `This will disable ${selectedSchoolTests.size} test(s) school-wide and remove them from every student's test list.`,
                          confirmLabel: 'Hide Tests',
                          isDestructive: true,
                          onConfirm: async () => {
                            await bulkSetSchoolVisibility(Array.from(selectedSchoolTests), false);
                            setSelectedSchoolTests(new Set());
                          },
                        })}
                        disabled={Array.from(selectedSchoolTests).every((id: string) => !filteredSchoolVisibility.find((test: any) => test.test_id === id)?.is_visible)}
                        className="rounded-lg border border-red-500 bg-red-600/30 px-3 py-1.5 text-xs font-semibold text-red-300 transition-colors hover:bg-red-600/50 disabled:cursor-not-allowed disabled:opacity-30"
                      >
                        Hide selected ({selectedSchoolTests.size})
                      </button>
                    </>
                  )}

                  <span className="ml-auto text-xs text-gray-500">
                    {selectedSchoolTests.size > 0 ? `${selectedSchoolTests.size} selected · ` : ''}
                    {filteredSchoolVisibility.filter((test: any) => test.is_visible).length} / {filteredSchoolVisibility.length} visible
                  </span>
                </div>

                <div className="max-h-96 divide-y divide-gray-700/50 overflow-y-auto rounded-lg border border-gray-700 bg-gray-800/50">
                  {filteredSchoolVisibility.map((test: any) => (
                    <div key={test.test_id} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-gray-700/30">
                      <input
                        type="checkbox"
                        checked={selectedSchoolTests.has(test.test_id)}
                        onChange={(event) => {
                          const next = new Set(selectedSchoolTests);
                          if (event.target.checked) next.add(test.test_id);
                          else next.delete(test.test_id);
                          setSelectedSchoolTests(next);
                        }}
                        className="h-4 w-4 flex-shrink-0 rounded border-gray-500 bg-gray-700 text-purple-500 focus:ring-purple-500"
                      />
                      <div className="mr-3 min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-white">{test.test_name}</p>
                        <p className="text-xs text-gray-500">{test.subject} · {test.category || 'N/A'}</p>
                      </div>
                      <button
                        onClick={() => setConfirmDialog({
                          title: test.is_visible ? 'Hide this test?' : 'Show this test?',
                          description: test.is_visible
                            ? `"${test.test_name}" will be disabled school-wide and removed from every student's test list.`
                            : `"${test.test_name}" will become available for teachers to release to allocated classes.`,
                          confirmLabel: test.is_visible ? 'Hide Test' : 'Show Test',
                          isDestructive: test.is_visible,
                          onConfirm: async () => toggleSchoolTestVisibility(test.test_id, test.is_visible),
                        })}
                        className={`flex-shrink-0 rounded-lg px-4 py-1.5 text-xs font-semibold transition-colors ${
                          test.is_visible
                            ? 'border border-green-500/50 bg-green-600/20 text-green-300 hover:bg-green-600/40'
                            : 'border border-red-500/50 bg-red-600/20 text-red-300 hover:bg-red-600/40'
                        }`}
                      >
                        {test.is_visible ? 'Visible' : 'Hidden'}
                      </button>
                    </div>
                  ))}
                </div>

                <p className="mt-3 text-xs text-gray-500">School availability is the first gate. Students see an available test only after their teacher releases it to their class.</p>
              </>
            )}
          </div>
        )}

        <div className="mb-6 rounded-xl border border-cyan-200 bg-cyan-50 p-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div className="min-w-0 flex-1">
              <label htmlFor="cambridge-academic-year" className="mb-1 block text-sm font-semibold text-slate-800">Academic year</label>
              <select
                id="cambridge-academic-year"
                value={selectedYear?.id || ''}
                disabled={yearsLoading || academicYears.length === 0}
                onChange={(event) => { void handleYearChange(event.target.value); }}
                className="w-full rounded-lg border border-cyan-300 bg-white px-3 py-2 text-sm font-semibold text-slate-900 focus:border-cyan-500 focus:outline-none md:max-w-sm"
              >
                {academicYears.length === 0 ? <option value="">No academic years configured</option> : null}
                {academicYears.map((year) => (
                  <option key={year.id} value={year.id}>
                    {year.name}{year.status === 'current' ? ' (Current)' : year.status === 'closed' ? ' (Archived)' : ' (Planned)'}
                  </option>
                ))}
              </select>
            </div>
            <div className="text-sm text-slate-600 md:text-right">
              {yearsLoading ? 'Loading academic years…' : selectedYear ? (
                isCurrentYear
                  ? <><strong className="text-emerald-700">Current year</strong><span className="block">New Cambridge attempts appear here.</span></>
                  : <><strong className="text-slate-700">Archived year</strong><span className="block">Historical attempts are preserved and read-only.</span></>
              ) : 'Configure an academic year to separate Cambridge history.'}
            </div>
          </div>
        </div>

        <div className="mb-6 flex flex-wrap gap-3">
          <button
            onClick={() => { void loadSelectedReports(); }}
            disabled={reportsLoading || yearsLoading}
            className="cambridge-white-action rounded-lg bg-cyan-600 px-4 py-2 font-medium text-white transition-colors hover:bg-cyan-500 disabled:opacity-50"
          >
            {reportsLoading ? 'Loading…' : `Load or refresh ${selectedYear?.name || 'reports'}`}
          </button>
          {displayedScores.length > 0 && (
            <button
              onClick={exportDisplayedCSV}
              className="cambridge-white-action rounded-lg bg-green-600 px-4 py-2 font-medium text-white transition-colors hover:bg-green-500"
            >
              Export CSV
            </button>
          )}
        </div>

        {displayedScores.length > 0 && (
          <>
            <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-300">Filter by Test</label>
                <select
                  value={quizFilter}
                  onChange={(event) => setQuizFilter(event.target.value)}
                  className="w-full rounded-lg border border-gray-600 bg-gray-700 px-4 py-2 text-white focus:border-cyan-500 focus:outline-none"
                >
                  <option value="all">All Tests ({displayedScores.length})</option>
                  {uniqueQuizReports.map((test) => (
                    <option key={test.key} value={test.key}>{test.label} ({test.count})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-gray-300">Filter by Class</label>
                <select
                  value={classFilter}
                  onChange={(event) => setClassFilter(event.target.value)}
                  className="w-full rounded-lg border border-gray-600 bg-gray-700 px-4 py-2 text-white focus:border-cyan-500 focus:outline-none"
                >
                  <option value="all">All Classes ({displayedScores.length})</option>
                  {uniqueClasses.map((className) => (
                    <option key={className} value={className}>
                      {className} ({displayedScores.filter((score: any) => (score.student_class || 'Unknown') === className).length})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="overflow-hidden rounded-xl border border-gray-700 bg-gray-800">
              <div className="admin-table-scroll" role="region" aria-label={`Cambridge results for ${selectedYear?.name || 'selected academic year'}`} tabIndex={0}>
                <table className="min-w-[900px] w-full">
                  <thead className="border-b border-gray-700 bg-gray-800">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-400">Student</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-400">Class</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-400">Test</th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-400">Score</th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-400">Percentage</th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-400">Time</th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-400">Submitted</th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-400">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-700">
                    {filteredDisplayedScores.length === 0 ? (
                      <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400">No submissions found with current filters</td></tr>
                    ) : filteredDisplayedScores.map((score: any) => {
                      const hasCanonicalAttemptIdentity = Boolean(score.student_id && score.test_id && score.quiz_version);
                      return (
                        <tr key={score.id} className="transition-colors hover:bg-gray-800/50">
                          <td className="px-4 py-3 text-sm text-white">{score.student_name || 'Unknown'}</td>
                          <td className="px-4 py-3 text-sm text-gray-300">{score.student_class || 'Unknown'}</td>
                          <td className="max-w-xs px-4 py-3 text-sm text-gray-300">
                            <span className="block truncate">{score.quiz_name || 'Unknown'}</span>
                            <span className="block text-xs text-slate-500">{score.quiz_version || 'legacy-v1'} · Attempt {score.attempt_number || 1} · {score.attempt_status || 'submitted'}</span>
                          </td>
                          <td className="px-4 py-3 text-center text-sm font-semibold text-cyan-300">{score.score}/{score.total_questions}</td>
                          <td className="px-4 py-3 text-center text-sm">
                            <span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${
                              score.percentage >= 80 ? 'bg-green-500/20 text-green-300'
                                : score.percentage >= 60 ? 'bg-yellow-500/20 text-yellow-300'
                                  : 'bg-red-500/20 text-red-300'
                            }`}>{score.percentage}%</span>
                          </td>
                          <td className="px-4 py-3 text-center text-sm text-gray-300">{Math.floor((score.time_taken_seconds || 0) / 60)}m</td>
                          <td className="px-4 py-3 text-center text-sm text-gray-400">{score.submitted_at ? new Date(score.submitted_at).toLocaleDateString() : 'N/A'}</td>
                          <td className="px-4 py-3 text-center text-sm">
                            {!isCurrentYear ? (
                              <span className="inline-flex rounded-full border border-slate-600 bg-slate-700/70 px-2.5 py-1 text-xs font-semibold text-slate-300">Archived · read only</span>
                            ) : hasCanonicalAttemptIdentity ? (
                              <button
                                onClick={() => allowQuizRetake(score)}
                                className="text-xs font-medium text-amber-300 transition-colors hover:text-amber-200"
                                title="Preserve this exact attempt version and allow a retake"
                              >
                                ↻ Allow Retake
                              </button>
                            ) : (
                              <div className="flex min-w-[220px] flex-col items-stretch gap-2 text-left">
                                <label htmlFor={`cambridge-identity-${score.id}`} className="text-[11px] font-semibold text-amber-200">Identity review required</label>
                                <select
                                  id={`cambridge-identity-${score.id}`}
                                  value={identitySelections[score.id] || ''}
                                  onChange={(event) => setIdentitySelections((current) => ({ ...current, [score.id]: event.target.value }))}
                                  className="rounded-lg border border-slate-600 bg-slate-900 px-2 py-1.5 text-xs text-white focus:border-cyan-400 focus:outline-none"
                                  aria-label={`Choose the verified student for ${score.student_name || 'legacy Cambridge attempt'}`}
                                >
                                  <option value="">Select verified student…</option>
                                  {verifiedStudents.map((student: any) => (
                                    <option key={student.user_id} value={student.user_id}>{student.full_name} · {student.batch || student.username}</option>
                                  ))}
                                </select>
                                <button
                                  type="button"
                                  disabled={!identitySelections[score.id]}
                                  onClick={() => linkCambridgeAttemptStudent(score, identitySelections[score.id])}
                                  className="rounded-lg border border-amber-400/60 bg-amber-500/15 px-2 py-1.5 text-xs font-semibold text-amber-200 transition-colors hover:bg-amber-500/25 disabled:cursor-not-allowed disabled:opacity-40"
                                >
                                  Link identity
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            <p className="mt-4 text-sm text-gray-400">Showing {filteredDisplayedScores.length} of {displayedScores.length} submissions in {selectedYear?.name || 'this academic year'}</p>
          </>
        )}

        {displayedScores.length === 0 && !reportsLoading && (
          <div className="p-8 text-center text-gray-400">
            <p className="mb-2 text-lg">
              {selectedYear ? `No Cambridge submissions in ${selectedYear.name}` : 'No Cambridge test submissions yet'}
            </p>
            <p className="text-sm">
              {isCurrentYear
                ? 'New submissions for the active academic year will appear here.'
                : 'This archived academic year has no Cambridge submissions.'}
            </p>
          </div>
        )}
      </section>
    </div>
  );
};

export default CambridgeTab;
