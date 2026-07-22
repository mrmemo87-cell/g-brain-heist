import React from 'react';
import { useAdmin } from '../AdminContext';

const CambridgeTab: React.FC = () => {
  const {
    addToast, classFilter, deleteQuizScore, exportCSV, fetchQuizScores, filteredQuizScores, 
    formatTime, openAnswerReflection, openReport, quizFilter, quizScores, quizScoresLoading, 
    quizStats, reportRpcError, setClassFilter, setQuizFilter, stats, supabase, uniqueClasses, 
    uniqueQuizNames,
  } = useAdmin();

  return (
    <div className="card-glass p-6 border-2 border-teal-400/50">
      <h3 className="text-3xl font-heading font-bold text-teal-300 mb-6">📚 Cambridge Test Reports</h3>

      {/* Action Buttons */}
      <div className="flex flex-wrap gap-3 mb-6">
        <button
          onClick={fetchQuizScores}
          disabled={quizScoresLoading}
          className="bg-teal-600/30 hover:bg-teal-600/50 border border-teal-400 text-white font-semibold px-6 py-3 rounded-lg transition-all hover:shadow-[0_0_20px_rgba(20,184,166,0.6)]"
        >
          {quizScoresLoading ? '⏳ Loading...' : '🔄 Load/Refresh Reports'}
        </button>
        {quizScores.length > 0 && (
          <button
            onClick={exportCSV}
            className="bg-green-600/30 hover:bg-green-600/50 border border-green-400 text-white font-semibold px-6 py-3 rounded-lg transition-all hover:shadow-[0_0_20px_rgba(34,197,94,0.6)]"
          >
            📥 Export CSV
          </button>
        )}
        {/* Bulk Release Scores for Science tests */}
        {quizFilter !== 'all' && (quizFilter.toLowerCase().includes('chemistry') || quizFilter.toLowerCase().includes('biology')) && (
          <button
            onClick={async () => {
              if (!window.confirm(`Release all unreleased scores for "${quizFilter}"${classFilter !== 'all' ? ` in class ${classFilter}` : ''}? Students will be able to see their results.`)) {
                return;
              }
              try {
                const { data, error } = await supabase.rpc('bulk_release_quiz_scores', {
                  p_quiz_name: quizFilter,
                  p_student_class: classFilter !== 'all' ? classFilter : null
                });
                if (error) throw error;
                if (!data?.success) throw new Error(data?.error || 'Failed to release scores');
                addToast(`✅ ${data.affected || 0} scores released`, 'success');
                fetchQuizScores();
              } catch (error: any) {
                reportRpcError('Failed to bulk release scores:', error, 'Failed to bulk release scores');
              }
            }}
            className="bg-purple-600/30 hover:bg-purple-600/50 border border-purple-400 text-white font-semibold px-6 py-3 rounded-lg transition-all hover:shadow-[0_0_20px_rgba(168,85,247,0.6)]"
          >
            🔓 Bulk Release Scores
          </button>
        )}
      </div>

      {quizScores.length > 0 && (
        <>
          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <div className="bg-gradient-to-br from-teal-600/20 to-teal-900/20 border-2 border-teal-400 p-4 rounded-xl">
              <p className="text-sm text-gray-300">Total Submissions</p>
              <p className="text-3xl font-bold text-teal-300">{quizStats.totalSubmissions}</p>
            </div>
            <div className="bg-gradient-to-br from-blue-600/20 to-blue-900/20 border-2 border-blue-400 p-4 rounded-xl">
              <p className="text-sm text-gray-300">Average Score</p>
              <p className="text-3xl font-bold text-blue-300">{quizStats.avgPercentage}%</p>
            </div>
            <div className="bg-gradient-to-br from-green-600/20 to-green-900/20 border-2 border-green-400 p-4 rounded-xl">
              <p className="text-sm text-gray-300">Highest Score</p>
              <p className="text-xl font-bold text-green-300">{quizStats.highestScore?.name || '-'}</p>
              <p className="text-sm text-gray-400">{quizStats.highestScore ? `${quizStats.highestScore.percentage}%` : ''}</p>
            </div>
            <div className="bg-gradient-to-br from-red-600/20 to-red-900/20 border-2 border-red-400 p-4 rounded-xl">
              <p className="text-sm text-gray-300">Lowest Score</p>
              <p className="text-xl font-bold text-red-300">{quizStats.lowestScore?.name || '-'}</p>
              <p className="text-sm text-gray-400">{quizStats.lowestScore ? `${quizStats.lowestScore.percentage}%` : ''}</p>
            </div>
          </div>

          {/* Class Performance Summary */}
          <div className="bg-black/30 border border-teal-400/50 rounded-xl p-4 mb-6">
            <h4 className="text-lg font-bold text-teal-300 mb-3">📊 Class Performance</h4>
            <div className="flex flex-wrap gap-3">
              {Object.entries(quizStats.classStats).sort((a, b) => b[1].avg - a[1].avg).map(([cls, stats]) => (
                <div key={cls} className="bg-black/40 border border-gray-600 rounded-lg px-4 py-2">
                  <p className="font-bold text-white">{cls}</p>
                  <p className="text-sm text-gray-400">{stats.count} students • Avg: <span className={stats.avg >= 70 ? 'text-green-400' : stats.avg >= 50 ? 'text-yellow-400' : 'text-red-400'}>{stats.avg}%</span></p>
                </div>
              ))}
            </div>
          </div>

          {/* Filters */}
          <div className="flex flex-wrap gap-4 mb-6">
            <div>
              <label className="text-sm text-gray-400 block mb-1">Filter by Test</label>
              <select
                value={quizFilter}
                onChange={(e) => setQuizFilter(e.target.value)}
                className="bg-black/40 border border-teal-400/50 rounded-lg px-4 py-2 text-white min-w-[200px]"
              >
                <option value="all">All Tests</option>
                {uniqueQuizNames.map(name => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-sm text-gray-400 block mb-1">Filter by Class</label>
              <select
                value={classFilter}
                onChange={(e) => setClassFilter(e.target.value)}
                className="bg-black/40 border border-teal-400/50 rounded-lg px-4 py-2 text-white min-w-[150px]"
              >
                <option value="all">All Classes</option>
                {uniqueClasses.map(cls => (
                  <option key={cls} value={cls}>{cls}</option>
                ))}
              </select>
            </div>
            <div className="flex items-end">
              <p className="text-gray-400">Showing {filteredQuizScores.length} of {quizScores.length} results</p>
            </div>
          </div>

          {/* Results Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-teal-400/50">
                  <th className="px-4 py-3 text-teal-300">Student</th>
                  <th className="px-4 py-3 text-teal-300">Class</th>
                  <th className="px-4 py-3 text-teal-300">Test</th>
                  <th className="px-4 py-3 text-teal-300">Score</th>
                  <th className="px-4 py-3 text-teal-300">%</th>
                  <th className="px-4 py-3 text-teal-300">Time</th>
                  <th className="px-4 py-3 text-teal-300">Submitted</th>
                  <th className="px-4 py-3 text-teal-300">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredQuizScores.map((score) => (
                  <tr key={score.id} className="border-b border-gray-700 hover:bg-black/30">
                    <td className="px-4 py-3 text-white font-semibold">{score.student_name}</td>
                    <td className="px-4 py-3 text-gray-300">{score.student_class || '-'}</td>
                    <td className="px-4 py-3 text-gray-300 text-sm">{score.quiz_name}</td>
                    <td className="px-4 py-3">
                      <span className="font-mono text-white">{score.score}/{score.total_questions}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`font-bold ${
                        score.percentage >= 70 ? 'text-green-400' :
                        score.percentage >= 50 ? 'text-yellow-400' : 'text-red-400'
                      }`}>{score.percentage}%</span>
                    </td>
                    <td className="px-4 py-3 text-gray-400 text-sm">{formatTime(score.time_taken_seconds)}</td>
                    <td className="px-4 py-3 text-gray-400 text-sm">
                      {new Date(score.submitted_at).toLocaleDateString()} {new Date(score.submitted_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2 flex-wrap">
                        <button
                          onClick={() => openAnswerReflection(score)}
                          className="bg-blue-600/30 hover:bg-blue-600/50 border border-blue-400 text-white text-xs px-3 py-1 rounded"
                        >
                          📝 Answers
                        </button>
                        <button
                          onClick={() => openReport(score)}
                          className="bg-purple-600/30 hover:bg-purple-600/50 border border-purple-400 text-white text-xs px-3 py-1 rounded"
                        >
                          📄 Report
                        </button>
                        <button
                          onClick={() => deleteQuizScore(score.id, score.student_name)}
                          className="bg-amber-600/30 hover:bg-amber-600/50 border border-amber-400 text-white text-xs px-3 py-1 rounded"
                          title="Preserve this attempt and allow the student to retake"
                        >
                          ↻ Allow Retake
                        </button>
                        {/* Show Release Score button for Science tests */}
                        {score.quiz_name && (score.quiz_name.toLowerCase().includes('chemistry') || score.quiz_name.toLowerCase().includes('biology')) && !score.scores_released && (
                          <button
                            onClick={async () => {
                              try {
                                const { data, error } = await supabase.rpc('release_quiz_score', {
                                  p_quiz_score_id: score.id
                                });
                                if (error) throw error;
                                if (!data?.success) throw new Error(data?.error || 'Failed to release score');
                                addToast(`✅ Score released for ${score.student_name}`, 'success');
                                fetchQuizScores();
                              } catch (error: any) {
                                reportRpcError('Failed to release score:', error, 'Failed to release score');
                              }
                            }}
                            className="bg-green-600/30 hover:bg-green-600/50 border border-green-400 text-white text-xs px-3 py-1 rounded"
                          >
                            🔓 Release Score
                          </button>
                        )}
                        {score.scores_released && score.quiz_name && (score.quiz_name.toLowerCase().includes('chemistry') || score.quiz_name.toLowerCase().includes('biology')) && (
                          <span className="text-xs text-green-400 px-2 py-1">✓ Released</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {quizScores.length === 0 && !quizScoresLoading && (
        <div className="text-center py-12 text-gray-400">
          <p className="text-6xl mb-4">📭</p>
          <p className="text-xl">No test submissions yet</p>
          <p className="text-sm mt-2">Click "Load/Refresh Reports" to check for submissions</p>
        </div>
      )}
    </div>
  );
};

export default CambridgeTab;
