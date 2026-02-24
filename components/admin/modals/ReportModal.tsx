import React from 'react';
import { useAdmin } from '../AdminContext';

const ReportModal: React.FC = () => {
  const {
    actionPlans, analyzeSkillPerformance, formatTime, getEncouragement, getGrade, reportStudent, 
    setShowReportModal, showReportModal,
  } = useAdmin();

  return (
    <>
      {/* Performance Report Modal */}
      {showReportModal && reportStudent && (() => {
        const skillPerf = analyzeSkillPerformance(reportStudent);
        const sortedSkills = Object.entries(skillPerf).sort((a, b) => a[1].percentage - b[1].percentage);
        const grade = getGrade(reportStudent.percentage);
        // For F grade, show areas below 70%; for others use grade-appropriate threshold
        const threshold = grade === 'F' ? 70 : grade === 'D' ? 65 : 60;
        const weakAreas = sortedSkills.filter(([_, data]) => data.percentage < threshold);
        const encouragement = getEncouragement(grade);

        return (
          <div className="fixed inset-0 z-[70] flex items-start justify-center bg-black/90 p-4 overflow-y-auto no-print" role="dialog" aria-modal="true" aria-label="Student Performance Report">
            <div className="bg-white rounded-2xl max-w-4xl w-full my-8 print-content font-sans">
              {/* Report Header */}
              <div className="p-6 border-b-4 border-purple-600 no-print-hide">
                <div className="flex justify-between items-start">
                  <div className="flex items-center gap-3">
                    <img src="/logo.png" alt="Brains Heist" style={{ width: '48px', height: '48px' }} />
                    <div>
                      <h1 className="text-2xl font-bold text-purple-800">Brains Heist</h1>
                      <p className="text-sm text-gray-500">Student Performance Report</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <h2 className="text-lg font-semibold text-purple-800">{reportStudent.quiz_name}</h2>
                    <p className="text-sm text-gray-500">Generated: {new Date().toLocaleDateString()}</p>
                  </div>
                </div>
              </div>

              {/* Student Banner */}
              <div className="bg-gradient-to-r from-purple-800 to-indigo-900 text-white p-6 flex justify-between items-center">
                <div>
                  <h2 className="text-2xl font-bold">{reportStudent.student_name}</h2>
                  <p className="opacity-80">Class: {reportStudent.student_class || 'N/A'} | Completed: {new Date(reportStudent.submitted_at).toLocaleDateString()} | Time: {formatTime(reportStudent.time_taken_seconds)}</p>
                </div>
                <div className="w-20 h-20 rounded-full bg-white flex flex-col items-center justify-center">
                  <span className="text-3xl font-bold text-purple-800">{grade}</span>
                  <span className="text-xs text-gray-600">{reportStudent.percentage}%</span>
                </div>
              </div>

              <div className="p-6 space-y-6">
                {/* Skills Performance */}
                <div>
                  <h3 className="text-lg font-semibold text-purple-800 border-b-2 border-gray-200 pb-2 mb-4">📊 Skills Performance Analysis</h3>
                  <div className="space-y-3">
                    {sortedSkills.map(([skill, data]) => (
                      <div key={skill} className="flex items-center gap-3">
                        <span className="w-40 text-sm text-gray-600">{data.icon} {skill}</span>
                        <div className="flex-1 h-4 bg-gray-200 rounded-full overflow-hidden">
                          <div 
                            className={`h-full rounded-full transition-all ${data.percentage >= 80 ? 'bg-green-500' : data.percentage >= 65 ? 'bg-blue-500' : data.percentage >= 50 ? 'bg-yellow-500' : 'bg-red-500'}`}
                            style={{ width: `${data.percentage}%` }}
                          />
                        </div>
                        <span className="w-12 text-sm font-semibold text-right">{data.percentage}%</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Focus Areas */}
                {weakAreas.length > 0 && (
                  <div className="bg-amber-50 border-l-4 border-amber-400 p-4 rounded-r-lg">
                    <h4 className="font-semibold text-amber-800 mb-2">⚠️ Priority Focus Areas</h4>
                    <ul className="text-sm text-gray-700 space-y-1">
                      {weakAreas.map(([skill, data]) => (
                        <li key={skill}>• <strong>{skill}</strong> — You scored {data.percentage}% ({data.correct}/{data.total} correct)</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Action Plan */}
                <div className="border-2 border-purple-600 rounded-xl p-5">
                  <h3 className="text-lg font-semibold text-purple-800 mb-4">📋 Personalized Action Plan</h3>
                  {weakAreas.length > 0 ? weakAreas.slice(0, 3).map(([skill, data], idx) => {
                    const plan = actionPlans[skill];
                    return plan ? (
                      <div key={skill} className="flex gap-4 mb-4 p-4 bg-gray-50 rounded-lg">
                        <div className="w-8 h-8 bg-purple-800 text-white rounded-full flex items-center justify-center font-bold flex-shrink-0">{idx + 1}</div>
                        <div>
                          <h4 className="font-semibold text-gray-800">{plan.title} (Currently {data.percentage}%)</h4>
                          <p className="text-sm text-gray-600">{plan.tips.join(' • ')}</p>
                        </div>
                      </div>
                    ) : null;
                  }) : (
                    <div className="flex gap-4 p-4 bg-green-50 rounded-lg">
                      <div className="w-8 h-8 bg-green-600 text-white rounded-full flex items-center justify-center font-bold flex-shrink-0">✓</div>
                      <div>
                        <h4 className="font-semibold text-gray-800">Maintain Your Excellence</h4>
                        <p className="text-sm text-gray-600">Continue challenging yourself • Read diverse texts daily • Help classmates who are struggling</p>
                      </div>
                    </div>
                  )}
                </div>

                {/* Encouragement */}
                <div className="bg-gradient-to-r from-purple-600 to-pink-600 text-white p-6 rounded-xl text-center">
                  <h3 className="text-xl font-bold mb-2">{encouragement.title}</h3>
                  <p className="opacity-90">{encouragement.message}</p>
                </div>
              </div>

              {/* Footer */}
              <div className="p-4 border-t flex justify-between items-center text-xs text-gray-400">
                <span>Brains Heist Learning Platform</span>
                <span>Report ID: {reportStudent.id?.substring(0, 8) || 'N/A'}</span>
                <div className="flex gap-3">
                  <button onClick={() => window.print()} className="px-4 py-2 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700">🖨️ Print</button>
                  <button onClick={() => setShowReportModal(false)} className="px-4 py-2 bg-gray-600 text-white rounded-lg font-semibold hover:bg-gray-700">Close</button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

    </>
  );
};

export default ReportModal;
