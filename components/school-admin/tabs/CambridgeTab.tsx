import React from 'react';
import { useSchoolAdmin } from '../SchoolAdminContext';

const CambridgeTab: React.FC = () => {
  const {
    allowQuizRetake, bulkSetSchoolVisibility, classFilter, exportCSV, fetchQuizScores, filteredQuizScores, filteredSchoolVisibility, linkCambridgeAttemptStudent, loadSchoolVisibility, quizFilter, quizScores, quizScoresLoading, school, schoolVisibility, schoolVisibilityLoading, schoolVisibilitySubjectFilter, schoolVisibilitySubjects, selectedSchoolTests, setClassFilter, setConfirmDialog, setQuizFilter, setSchoolVisibilitySubjectFilter, setSelectedSchoolTests, setShowSchoolVisibility, showSchoolVisibility, students, teachers, toggleSchoolTestVisibility, uniqueClasses, uniqueQuizReports,
  } = useSchoolAdmin();
  const [identitySelections, setIdentitySelections] = React.useState<Record<string, string>>({});

  const verifiedStudents = React.useMemo(
    () => students
      .filter((student: any) => student.full_name_status === 'verified' && student.full_name)
      .sort((left: any, right: any) =>
        (left.full_name || left.username).localeCompare(right.full_name || right.username)),
    [students],
  );

  return (
    <div className="school-admin-themed-tab space-y-6">
      <section className="admin-section-heading"><div><p className="school-admin-eyebrow">Assessments</p><h2>Cambridge Assessments</h2><p>Review school-wide results, manage test availability and authorise retakes.</p></div></section>
      <section className="admin-table-card p-6">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-xl font-bold text-slate-900">Cambridge test reports</h3>
          <button
            onClick={() => {
              setShowSchoolVisibility(!showSchoolVisibility);
              if (!showSchoolVisibility && schoolVisibility.length === 0) {
                loadSchoolVisibility();
              }
            }}
            className={`cambridge-white-action px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
              showSchoolVisibility
                ? 'bg-purple-600 text-white hover:bg-purple-700'
                : 'bg-purple-600/30 hover:bg-purple-600/50 border border-purple-400 text-white'
            }`}
          >
            👁️ {showSchoolVisibility ? 'Hide' : 'Test'} Visibility Manager
          </button>
        </div>

        {/* School-Level Visibility Manager Panel */}
        {showSchoolVisibility && (
          <div className="bg-gray-900/70 rounded-xl p-5 border border-purple-500/50 mb-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h4 className="text-lg font-bold text-purple-300">School-level test visibility</h4>
                <p className="text-xs text-gray-400 mt-1">Choose which tests teachers may release. Disabling a test removes it from every class immediately.</p>
              </div>
              <button
                onClick={loadSchoolVisibility}
                disabled={schoolVisibilityLoading}
                className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-white text-xs font-medium rounded-lg transition-colors disabled:opacity-50"
              >
                {schoolVisibilityLoading ? 'Loading…' : 'Refresh'}
              </button>
            </div>

            {schoolVisibilityLoading ? (
              <div className="text-center py-8 text-gray-400">
                Loading test visibility settings...
              </div>
            ) : schoolVisibility.length === 0 ? (
              <div className="text-center py-8 text-gray-400">
                No Cambridge tests found in the catalog.
              </div>
            ) : (
              <>
                {/* Subject filter + selection + bulk actions */}
                <div className="flex flex-wrap items-center gap-3 mb-4">
                  <select
                    value={schoolVisibilitySubjectFilter}
                    onChange={(e) => {
                      setSchoolVisibilitySubjectFilter(e.target.value);
                      setSelectedSchoolTests(new Set());
                    }}
                    className="px-3 py-1.5 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:border-purple-500"
                  >
                    <option value="all">All Subjects ({schoolVisibility.length})</option>
                    {schoolVisibilitySubjects.map(subj => (
                      <option key={subj} value={subj}>
                        {subj} ({schoolVisibility.filter(t => t.subject === subj).length})
                      </option>
                    ))}
                  </select>

                  {/* Select All / Deselect All */}
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={selectedSchoolTests.size === filteredSchoolVisibility.length && filteredSchoolVisibility.length > 0}
                      ref={el => { if (el) el.indeterminate = selectedSchoolTests.size > 0 && selectedSchoolTests.size < filteredSchoolVisibility.length; }}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedSchoolTests(new Set(filteredSchoolVisibility.map(t => t.test_id)));
                        } else {
                          setSelectedSchoolTests(new Set());
                        }
                      }}
                      className="w-4 h-4 rounded border-gray-500 bg-gray-700 text-purple-500 focus:ring-purple-500"
                    />
                    <span className="text-xs text-gray-300 font-medium">
                      {selectedSchoolTests.size === filteredSchoolVisibility.length && filteredSchoolVisibility.length > 0
                        ? 'Deselect All'
                        : 'Select All'} ({filteredSchoolVisibility.length})
                    </span>
                  </label>

                  {/* Bulk actions for selected tests */}
                  {selectedSchoolTests.size > 0 && (
                    <>
                      <button
                        onClick={() => setConfirmDialog({
                          title: '✅ Show Selected Tests?',
                          description: `This will make ${selectedSchoolTests.size} test(s) available for teachers to release to their classes.`,
                          confirmLabel: 'Show Tests',
                          onConfirm: async () => {
                            await bulkSetSchoolVisibility(Array.from(selectedSchoolTests), true);
                            setSelectedSchoolTests(new Set());
                          }
                        })}
                        disabled={Array.from(selectedSchoolTests).every(id => filteredSchoolVisibility.find(t => t.test_id === id)?.is_visible)}
                        className="px-3 py-1.5 bg-green-600/30 hover:bg-green-600/50 border border-green-500 text-green-300 text-xs font-semibold rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        ✅ Show Selected ({selectedSchoolTests.size})
                      </button>
                      <button
                        onClick={() => setConfirmDialog({
                          title: 'Hide selected tests?',
                          description: `This will disable ${selectedSchoolTests.size} test(s) school-wide and remove them from every student, even if a teacher released them.`,
                          confirmLabel: 'Hide Tests',
                          isDestructive: true,
                          onConfirm: async () => {
                            await bulkSetSchoolVisibility(Array.from(selectedSchoolTests), false);
                            setSelectedSchoolTests(new Set());
                          }
                        })}
                        disabled={Array.from(selectedSchoolTests).every(id => !filteredSchoolVisibility.find(t => t.test_id === id)?.is_visible)}
                        className="px-3 py-1.5 bg-red-600/30 hover:bg-red-600/50 border border-red-500 text-red-300 text-xs font-semibold rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        🚫 Hide Selected ({selectedSchoolTests.size})
                      </button>
                    </>
                  )}

                  <span className="text-xs text-gray-500 ml-auto">
                    {selectedSchoolTests.size > 0 ? `${selectedSchoolTests.size} selected · ` : ''}
                    {filteredSchoolVisibility.filter(t => t.is_visible).length} / {filteredSchoolVisibility.length} visible
                  </span>
                </div>

                {/* Tests list with checkboxes */}
                <div className="bg-gray-800/50 rounded-lg border border-gray-700 divide-y divide-gray-700/50 max-h-96 overflow-y-auto">
                  {filteredSchoolVisibility.map(test => (
                    <div key={test.test_id} className="px-4 py-3 flex items-center gap-3 hover:bg-gray-700/30 transition-colors">
                      <input
                        type="checkbox"
                        checked={selectedSchoolTests.has(test.test_id)}
                        onChange={(e) => {
                          const next = new Set(selectedSchoolTests);
                          if (e.target.checked) next.add(test.test_id);
                          else next.delete(test.test_id);
                          setSelectedSchoolTests(next);
                        }}
                        className="w-4 h-4 rounded border-gray-500 bg-gray-700 text-purple-500 focus:ring-purple-500 flex-shrink-0"
                      />
                      <div className="flex-1 min-w-0 mr-3">
                        <p className="text-sm font-medium text-white truncate">{test.test_name}</p>
                        <p className="text-xs text-gray-500">{test.subject} · {test.category || 'N/A'}</p>
                      </div>
                      <button
                        onClick={() => setConfirmDialog({
                          title: test.is_visible ? 'Hide this test?' : 'Show this test?',
                          description: test.is_visible
                            ? `"${test.test_name}" will be disabled school-wide and removed from every student's test list.`
                            : `"${test.test_name}" will become available for teachers to release to assigned classes.`,
                          confirmLabel: test.is_visible ? 'Hide Test' : 'Show Test',
                          isDestructive: test.is_visible,
                          onConfirm: async () => {
                            await toggleSchoolTestVisibility(test.test_id, test.is_visible);
                          }
                        })}
                        className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-colors flex-shrink-0 ${
                          test.is_visible
                            ? 'bg-green-600/20 text-green-300 border border-green-500/50 hover:bg-green-600/40'
                            : 'bg-red-600/20 text-red-300 border border-red-500/50 hover:bg-red-600/40'
                        }`}
                      >
                        {test.is_visible ? 'Visible' : 'Hidden'}
                      </button>
                    </div>
                  ))}
                </div>

                <p className="text-xs text-gray-500 mt-3">
                  💡 School availability is the first gate. Students see an available test only after their teacher releases it to their class.
                </p>
              </>
            )}
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex flex-wrap gap-3 mb-6">
          <button
            onClick={fetchQuizScores}
            disabled={quizScoresLoading}
            className="cambridge-white-action bg-cyan-600 hover:bg-cyan-500 text-white font-medium px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
          >
            {quizScoresLoading ? 'Loading…' : 'Load or refresh reports'}
          </button>
          {quizScores.length > 0 && (
            <button
              onClick={exportCSV}
              className="cambridge-white-action bg-green-600 hover:bg-green-500 text-white font-medium px-4 py-2 rounded-lg transition-colors"
            >
              📥 Export CSV
            </button>
          )}
        </div>

        {quizScores.length > 0 && (
          <>
            {/* Filters */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Filter by Test</label>
                <select
                  value={quizFilter}
                  onChange={(e) => setQuizFilter(e.target.value)}
                  className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-cyan-500"
                >
                  <option value="all">All Tests ({quizScores.length})</option>
                  {uniqueQuizReports.map((test: any) => (
                    <option key={test.key} value={test.key}>
                      {test.label} ({test.count})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Filter by Class</label>
                <select
                  value={classFilter}
                  onChange={(e) => setClassFilter(e.target.value)}
                  className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-cyan-500"
                >
                  <option value="all">All Classes ({quizScores.length})</option>
                  {uniqueClasses.map(cls => (
                    <option key={cls} value={cls}>
                      {cls} ({quizScores.filter(s => (s.student_class || 'Unknown') === cls).length})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Results Table */}
            <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
              <div className="admin-table-scroll" role="region" aria-label="Cambridge results table" tabIndex={0}>
                <table className="min-w-[900px] w-full">
                  <thead className="bg-gray-800 border-b border-gray-700">
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
                    {filteredQuizScores.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="px-4 py-8 text-center text-gray-400">
                          No submissions found with current filters
                        </td>
                      </tr>
                    ) : (
                      filteredQuizScores.map((score) => {
                        const hasCanonicalAttemptIdentity = Boolean(score.student_id && score.test_id && score.quiz_version);
                        return <tr key={score.id} className="hover:bg-gray-800/50 transition-colors">
                          <td className="px-4 py-3 text-sm text-white">{score.student_name || 'Unknown'}</td>
                          <td className="px-4 py-3 text-sm text-gray-300">{score.student_class || 'Unknown'}</td>
                          <td className="px-4 py-3 text-sm text-gray-300 max-w-xs"><span className="block truncate">{score.quiz_name || 'Unknown'}</span><span className="block text-xs text-slate-500">{score.quiz_version || 'legacy-v1'} · Attempt {score.attempt_number || 1} · {score.attempt_status || 'submitted'}</span></td>
                          <td className="px-4 py-3 text-sm text-center font-semibold text-cyan-300">
                            {score.score}/{score.total_questions}
                          </td>
                          <td className="px-4 py-3 text-sm text-center">
                            <span className={`inline-flex px-2 py-1 rounded-full text-xs font-semibold ${
                              score.percentage >= 80 ? 'bg-green-500/20 text-green-300' :
                              score.percentage >= 60 ? 'bg-yellow-500/20 text-yellow-300' :
                              'bg-red-500/20 text-red-300'
                            }`}>
                              {score.percentage}%
                            </span>
                          </td>
                          <td className="px-4 py-3 text-sm text-center text-gray-300">
                            {Math.floor((score.time_taken_seconds || 0) / 60)}m
                          </td>
                          <td className="px-4 py-3 text-sm text-center text-gray-400">
                            {score.submitted_at ? new Date(score.submitted_at).toLocaleDateString() : 'N/A'}
                          </td>
                          <td className="px-4 py-3 text-sm text-center">
                            {hasCanonicalAttemptIdentity ? (
                              <button
                                onClick={() => allowQuizRetake(score)}
                                className="text-amber-300 hover:text-amber-200 transition-colors font-medium text-xs"
                                title="Preserve this exact attempt version and allow a retake"
                              >
                                ↻ Allow Retake
                              </button>
                            ) : (
                              <div className="flex min-w-[220px] flex-col items-stretch gap-2 text-left">
                                <label htmlFor={`cambridge-identity-${score.id}`} className="text-[11px] font-semibold text-amber-200">
                                  Identity review required
                                </label>
                                <select
                                  id={`cambridge-identity-${score.id}`}
                                  value={identitySelections[score.id] || ''}
                                  onChange={(event) => setIdentitySelections((current) => ({
                                    ...current,
                                    [score.id]: event.target.value,
                                  }))}
                                  className="rounded-lg border border-slate-600 bg-slate-900 px-2 py-1.5 text-xs text-white focus:border-cyan-400 focus:outline-none"
                                  aria-label={`Choose the verified student for ${score.student_name || 'legacy Cambridge attempt'}`}
                                >
                                  <option value="">Select verified student…</option>
                                  {verifiedStudents.map((student: any) => (
                                    <option key={student.user_id} value={student.user_id}>
                                      {student.full_name} · {student.batch || student.username}
                                    </option>
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
                        </tr>;
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <p className="text-sm text-gray-400 mt-4">
              Showing {filteredQuizScores.length} of {quizScores.length} total submissions
            </p>
          </>
        )}

        {quizScores.length === 0 && !quizScoresLoading && (
          <div className="text-center p-8 text-gray-400">
            <p className="text-lg mb-2">No Cambridge test submissions yet</p>
            <p className="text-sm">Click "Load/Refresh Reports" to check for new submissions</p>
          </div>
        )}
      </section>
    </div>
  );
};

export default CambridgeTab;
