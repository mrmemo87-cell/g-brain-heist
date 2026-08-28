from pathlib import Path

path = Path('components/TeacherPortal.tsx')
source = path.read_text(encoding='utf-8')


def replace_once(old: str, new: str, label: str) -> None:
    global source
    count = source.count(old)
    if count != 1:
        raise RuntimeError(f'{label}: expected exactly one match, found {count}')
    source = source.replace(old, new, 1)


replace_once(
    "  const questionsLoadRef = useRef<Promise<void> | null>(null);\n",
    "  const questionsLoadRef = useRef<Promise<void> | null>(null);\n  const reportLoadRequestRef = useRef(0);\n",
    'report request identity ref',
)

replace_once(
    "  // Assignment Analysis State\n  const [questionAnalysis, setQuestionAnalysis] = useState<AssignmentQuestionAnalysis[]>([]);\n",
    "  // Assignment Analysis State\n  const [questionAnalysis, setQuestionAnalysis] = useState<AssignmentQuestionAnalysis[]>([]);\n  const [questionAnalysisLoading, setQuestionAnalysisLoading] = useState(false);\n",
    'question analysis loading state',
)

start_marker = "  const handleOpenReport = async (assignment: TeacherAssignmentSummary) => {"
start = source.find(start_marker)
if start < 0:
    raise RuntimeError('handleOpenReport: start marker not found')
error_marker = "      brainsAlert('Unable to load report: ' + (error as Error).message, 'error');"
error_pos = source.find(error_marker, start)
if error_pos < 0:
    raise RuntimeError('handleOpenReport: error marker not found')
end = source.find("\n  };", error_pos)
if end < 0:
    raise RuntimeError('handleOpenReport: end marker not found')
end += len("\n  };")

new_handler = r'''  const handleOpenReport = async (assignment: TeacherAssignmentSummary) => {
    if (!teacher) {
      brainsAlert('Teacher profile is still loading. Please try again.', 'info');
      return;
    }

    const requestId = ++reportLoadRequestRef.current;
    const teacherId = teacher.id;
    const officialNames = new Map(availableStudents.map((student) => [student.id, student.display_name]));

    // Move into the report immediately. Student results and question analysis are
    // independent payloads, so load them in parallel instead of serialising four
    // network round trips through duplicate teacher-profile lookups.
    setSelectedReportAssignment(assignment);
    setAssignmentReport([]);
    setQuestionAnalysis([]);
    setReportLoading(true);
    setQuestionAnalysisLoading(true);
    setView('report-detail');

    const reportRequest = supabase.rpc('rpc_teacher_assignment_report', {
      p_assignment_id: assignment.id,
      p_teacher_id: teacherId,
    });
    const analysisRequest = supabase.rpc('rpc_get_assignment_question_analysis', {
      p_assignment_id: assignment.id,
      p_teacher_id: teacherId,
    });

    const loadReportRows = async () => {
      try {
        const { data, error } = await reportRequest;
        if (error) throw new Error(error.message || 'Failed to load report');
        if (requestId !== reportLoadRequestRef.current) return;

        // Assignment submissions retain the game username for gameplay history.
        // Teacher-facing documents must instead use the official roster identity.
        const reportRows = ((data as TeacherAssignmentReportRow[] | null) || []);
        const rows = reportRows.map((row) => ({
          ...row,
          student_name: officialNames.get(row.student_id) || 'Student name unavailable',
        }));
        setAssignmentReport(rows);
        setAssignments((current) => current.map((item) => (
          item.id === assignment.id
            ? { ...item, completed_count: rows.length }
            : item
        )));
        setSelectedReportAssignment((current) => (
          current?.id === assignment.id
            ? { ...current, completed_count: rows.length }
            : current
        ));
      } catch (error) {
        if (requestId !== reportLoadRequestRef.current) return;
        console.error('Error loading assignment report:', error);
        setAssignmentReport([]);
        brainsAlert('Unable to load report: ' + (error as Error).message, 'error');
      } finally {
        if (requestId === reportLoadRequestRef.current) setReportLoading(false);
      }
    };

    const loadQuestionAnalysis = async () => {
      try {
        const { data, error } = await analysisRequest;
        if (error) throw new Error(error.message || 'Failed to load question analysis');
        if (requestId !== reportLoadRequestRef.current) return;
        setQuestionAnalysis(((data as AssignmentQuestionAnalysis[] | null) || []));
      } catch (error) {
        if (requestId !== reportLoadRequestRef.current) return;
        console.warn('Question analysis not available:', error);
        setQuestionAnalysis([]);
      } finally {
        if (requestId === reportLoadRequestRef.current) setQuestionAnalysisLoading(false);
      }
    };

    await Promise.allSettled([loadReportRows(), loadQuestionAnalysis()]);
  };'''

source = source[:start] + new_handler + source[end:]

replace_once(
    '''      {reportLoading ? (\n        <div className="teacher-card p-12 text-center text-cyan-600">Loading report...</div>\n      ) : !selectedReportAssignment ? ('''.replace('\\n', '\n'),
    '''      {!selectedReportAssignment ? (''',
    'report shell immediate navigation',
)

replace_once(
    '''          {assignmentReport.length === 0 ? (\n            <div className="bg-slate-50 border border-slate-200 rounded-xl p-10 text-center text-slate-500">No students have completed this assignment yet.</div>\n          ) : ('''.replace('\\n', '\n'),
    '''          {reportLoading ? (\n            <div className="rounded-xl border border-slate-200 bg-slate-50 p-10 text-center">\n              <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-cyan-600" aria-hidden="true" />\n              <div className="font-semibold text-slate-700">Loading student results…</div>\n              <div className="mt-1 text-sm text-slate-500">Question analysis is loading in parallel.</div>\n            </div>\n          ) : assignmentReport.length === 0 ? (\n            <div className="bg-slate-50 border border-slate-200 rounded-xl p-10 text-center text-slate-500">No students have completed this assignment yet.</div>\n          ) : ('''.replace('\\n', '\n'),
    'student report loading panel',
)

replace_once(
    "                    {questionAnalysis.length > 0 ? `${questionAnalysis.length} questions` : 'No data yet'}",
    "                    {questionAnalysisLoading ? 'Loading analysis…' : questionAnalysis.length > 0 ? `${questionAnalysis.length} questions` : 'No data yet'}",
    'question analysis status label',
)

replace_once(
    '''                <div className="border-t border-slate-200 p-4 sm:p-5">\n                  {questionAnalysis.length > 0 ? ('''.replace('\\n', '\n'),
    '''                <div className="border-t border-slate-200 p-4 sm:p-5">\n                  {questionAnalysisLoading ? (\n                    <div className="rounded-xl border border-cyan-100 bg-cyan-50 p-5 text-sm font-medium text-cyan-800">Preparing question analysis in parallel…</div>\n                  ) : questionAnalysis.length > 0 ? ('''.replace('\\n', '\n'),
    'question analysis progressive loading',
)

path.write_text(source, encoding='utf-8')
print('Patched TeacherPortal report loading path successfully.')
