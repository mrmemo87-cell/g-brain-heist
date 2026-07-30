import React from 'react';
import { useAdmin } from '../AdminContext';
import { buildBiologyAnswerKeyFromSavedMetadata, isBiologyCambridgeQuiz, parseSavedAnswersPayload } from '../../biologyReviewAnswerKey';
import { getPrimaryCambridgeAnswer, isCambridgeAnswerCorrect, parseCambridgeResponses } from '../../cambridgeListeningReview';
import { useSchoolBranding } from '../../../src/hooks/useSchoolBranding';

const AnswerReflectionModal: React.FC = () => {
  const {
    correctAnswers, getScienceAnswerKey, reportStudent, setShowAnswerReflection, 
    showAnswerReflection, testSections, profile,
  } = useAdmin();
  const { schoolName, schoolLogoUrl } = useSchoolBranding({
    schoolId: reportStudent?.school_id || profile?.school_id,
    schoolName: reportStudent?.school_name || profile?.school_name,
    schoolLogoUrl: reportStudent?.school_logo_url || profile?.school_logo_url,
  });

  return (
    <>
      {/* Answer Reflection Modal */}
      {showAnswerReflection && reportStudent && (() => {
        const rawAnswers = parseSavedAnswersPayload(reportStudent.answers);
        const quizName = reportStudent.quiz_name || '';
        const isBiologyTest = isBiologyCambridgeQuiz(quizName);
        const isChemistryTest = quizName.toLowerCase().includes('chemistry') || isBiologyTest;
        const biologyAnswerMetadata = buildBiologyAnswerKeyFromSavedMetadata(reportStudent.answers);

        // Every Cambridge paper may wrap numeric responses in answers.responses.
        const studentResponses = parseCambridgeResponses(rawAnswers);

        // Get correct answers for tests that ship an answer key in the frontend
        const correctAnswersForQuiz = isChemistryTest ? getScienceAnswerKey(quizName, reportStudent) : (correctAnswers[quizName] || {});
        const biologyMetadataUnavailable = isBiologyTest && !biologyAnswerMetadata.hasMetadata;
        const sections = testSections[quizName] || [];

        let correctCount = reportStudent.score || 0;
        let wrongCount = 0;
        let unansweredCount = 0;
        const mistakes: Array<{ q: number; studentAns: string; correctAns: string; unanswered: boolean }> = [];

        // For tests with defined correct answers
        if (Object.keys(correctAnswersForQuiz).length > 0) {
          correctCount = 0;
          Object.keys(correctAnswersForQuiz).forEach(qStr => {
            const q = parseInt(qStr);
            const studentAns = (studentResponses[q] || '').toString().trim();
            const expectedAnswer = correctAnswersForQuiz[q];
            const correctAns = expectedAnswer === undefined ? '' : getPrimaryCambridgeAnswer(expectedAnswer);

            if (!studentAns) {
              unansweredCount++;
              mistakes.push({ q, studentAns: '(No answer)', correctAns, unanswered: true });
            } else if (expectedAnswer !== undefined && isCambridgeAnswerCorrect(studentAns, expectedAnswer)) {
              correctCount++;
            } else {
              wrongCount++;
              mistakes.push({ q, studentAns, correctAns, unanswered: false });
            }
          });
        } else {
          // For tests without an answer key, use the stored score
          const totalQ = reportStudent.total_questions || 0;
          wrongCount = totalQ - correctCount;
          // Detailed answer breakdown is unavailable without a key
        }

        return (
          <div className="fixed inset-0 z-[70] flex items-start justify-center bg-black/90 p-4 overflow-y-auto no-print" role="dialog" aria-modal="true" aria-label="Test Answer Reflection">
            <div className="bg-white rounded-2xl max-w-5xl w-full my-8 print-content font-sans">
              {/* Header */}
              <div className="p-6 border-b-4 border-blue-600 no-print-hide">
                <div className="flex justify-between items-start">
                  <div className="flex items-center gap-3">
                    <img src={schoolLogoUrl} alt={`${schoolName} logo`} style={{ width: '48px', height: '48px', objectFit: 'contain' }} />
                    <div>
                      <h1 className="text-2xl font-bold text-blue-800">{schoolName}</h1>
                      <p className="text-sm text-gray-500">Test Reflection & Answer Review</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <h2 className="text-lg font-semibold text-blue-800">{reportStudent.quiz_name}</h2>
                    <p className="text-sm text-gray-500">Answer Details</p>
                  </div>
                </div>
              </div>

              {/* Student Info Banner */}
              <div className="bg-gradient-to-r from-blue-700 to-purple-800 text-white p-5 flex justify-between items-center">
                <div>
                  <h2 className="text-xl font-bold">{reportStudent.student_name}</h2>
                  <p className="text-sm opacity-80">Class: {reportStudent.student_class || 'N/A'} | {new Date(reportStudent.submitted_at).toLocaleDateString()}</p>
                </div>
                <div className="text-right">
                  <div className="text-3xl font-bold">{reportStudent.score}/{reportStudent.total_questions}</div>
                  <div className="text-sm opacity-80">{reportStudent.percentage}% Score</div>
                </div>
              </div>

              <div className="p-6 space-y-6">
                {/* Summary Stats */}
                <div className="grid grid-cols-3 gap-4">
                  <div className="bg-green-100 p-4 rounded-xl text-center">
                    <div className="text-3xl">✓</div>
                    <div className="text-3xl font-bold text-green-700">{correctCount}</div>
                    <div className="text-sm text-gray-600">Correct</div>
                  </div>
                  <div className="bg-red-100 p-4 rounded-xl text-center">
                    <div className="text-3xl">✗</div>
                    <div className="text-3xl font-bold text-red-700">{wrongCount}</div>
                    <div className="text-sm text-gray-600">Wrong</div>
                  </div>
                  <div className="bg-amber-100 p-4 rounded-xl text-center">
                    <div className="text-3xl">⚠️</div>
                    <div className="text-3xl font-bold text-amber-700">{unansweredCount}</div>
                    <div className="text-sm text-gray-600">Unanswered</div>
                  </div>
                </div>

                {biologyMetadataUnavailable && (
                  <div className="bg-amber-50 border border-amber-300 text-amber-800 rounded-xl p-4 text-sm">
                    Biology answer metadata is unavailable for this older submission, so admin review cannot safely reconstruct correct answers. The stored score is shown, but per-question correctness is not inferred.
                  </div>
                )}

                {/* Sections with Answers */}
                {sections.length > 0 ? sections.map(section => {
                  let sectionCorrect = 0;
                  return (
                    <div key={section.name}>
                      <div className="bg-blue-50 p-3 border-l-4 border-blue-600 mb-3 flex justify-between items-center">
                        <span className="font-semibold text-gray-800">{section.icon} {section.name}</span>
                        <span className="text-blue-600 text-sm">
                          {section.questions.filter(q => {
                            const studentAns = (studentResponses[q] || '').toString().trim().toLowerCase();
                            const expectedAnswer = correctAnswersForQuiz[q];
                            const isCorrect = expectedAnswer !== undefined && isCambridgeAnswerCorrect(studentAns, expectedAnswer);
                            if (isCorrect) sectionCorrect++;
                            return isCorrect;
                          }).length}/{section.questions.length} correct
                        </span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 mb-4">
                        {section.questions.map(q => {
                          const studentAns = (studentResponses[q] || '').toString().trim();
                          const expectedAnswer = correctAnswersForQuiz[q];
                          const correctAns = expectedAnswer === undefined ? '' : getPrimaryCambridgeAnswer(expectedAnswer);
                          const isCorrect = expectedAnswer !== undefined && isCambridgeAnswerCorrect(studentAns, expectedAnswer);
                          const isUnanswered = !studentAns;

                          return (
                            <div key={q} className={`p-3 rounded-lg border-2 flex items-center gap-3 ${isCorrect ? 'bg-green-50 border-green-400' : isUnanswered ? 'bg-amber-50 border-amber-400' : 'bg-red-50 border-red-400'}`}>
                              <div className={`w-9 h-9 rounded-full flex items-center justify-center text-white font-bold text-sm ${isCorrect ? 'bg-green-500' : isUnanswered ? 'bg-amber-500' : 'bg-red-500'}`}>Q{q}</div>
                              <div className="flex-1 text-sm">
                                <div><strong>Your answer:</strong> {studentAns || <em className="text-gray-400">blank</em>}</div>
                                {!isCorrect && <div className="text-green-600 font-semibold">✓ Correct: {correctAns}</div>}
                              </div>
                              <span className="text-xl">{isCorrect ? '✓' : isUnanswered ? '⚠️' : '✗'}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                }) : (
                  /* For Chemistry tests without predefined sections, show a simple summary */
                  <div className="bg-blue-50 border-2 border-blue-400 rounded-xl p-5">
                    <h3 className="text-lg font-semibold text-blue-700 mb-4">🧪 Cambridge Science Test Results</h3>
                    <p className="text-gray-700 mb-3">
                      Score: <strong>{reportStudent.score}</strong> out of <strong>{reportStudent.total_questions}</strong> ({reportStudent.percentage}%)
                    </p>
                    <p className="text-gray-600 text-sm">
                      For detailed answer review with correct answers, please check the test page directly. 
                      The student can view their answers when you release the score.
                    </p>
                  </div>
                )}

                {/* Key Mistakes Section */}
                {mistakes.length > 0 && (
                  <div className="bg-red-50 border-2 border-red-400 rounded-xl p-5">
                    <h3 className="text-lg font-semibold text-red-700 mb-4">📝 Key Mistakes to Learn From</h3>
                    <div className="space-y-3">
                      {mistakes.slice(0, 8).map(m => (
                        <div key={m.q} className="bg-white rounded-lg p-4 border-l-4 border-red-400">
                          <div className="font-semibold text-gray-800 mb-2">Question {m.q}</div>
                          <div className="grid grid-cols-2 gap-3 text-sm">
                            <div className="bg-red-100 p-3 rounded text-gray-800">
                              <strong className="text-red-700">{m.unanswered ? '⚠️ Unanswered' : '✗ Your Answer:'}</strong><br/>
                              <span className="text-gray-900 font-medium">{m.unanswered ? 'No response given' : m.studentAns}</span>
                            </div>
                            <div className="bg-green-100 p-3 rounded text-gray-800">
                              <strong className="text-green-700">✓ Correct Answer:</strong><br/>
                              <span className="text-gray-900 font-medium">{m.correctAns}</span>
                            </div>
                          </div>
                        </div>
                      ))}
                      {mistakes.length > 8 && <p className="text-center text-gray-600">+ {mistakes.length - 8} more mistakes (see full details above)</p>}
                    </div>
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="p-4 border-t flex justify-between items-center text-xs text-gray-400">
                <span>Brains Heist Learning Platform</span>
                <span>Use this sheet to review mistakes and improve!</span>
                <div className="flex gap-3">
                  <button onClick={() => window.print()} className="px-4 py-2 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700">🖨️ Print</button>
                  <button onClick={() => setShowAnswerReflection(false)} className="px-4 py-2 bg-gray-600 text-white rounded-lg font-semibold hover:bg-gray-700">Close</button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

    </>
  );
};

export default AnswerReflectionModal;
