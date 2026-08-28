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
    """      case 'reports':
        setSelectedReportAssignment(null);
        setAssignmentReport([]);
        setView('reports');
        break;
""",
    """      case 'reports':
        reportLoadRequestRef.current += 1;
        setReportLoading(false);
        setQuestionAnalysisLoading(false);
        setSelectedReportAssignment(null);
        setAssignmentReport([]);
        setView('reports');
        break;
""",
    'reports navigation invalidates in-flight request',
)

replace_once(
    """      <button
        onClick={() => setView('reports')}
        className=\"teacher-back-link mb-4\"
      >
""",
    """      <button
        onClick={() => {
          reportLoadRequestRef.current += 1;
          setReportLoading(false);
          setQuestionAnalysisLoading(false);
          setView('reports');
        }}
        className=\"teacher-back-link mb-4\"
      >
""",
    'report back button invalidates in-flight request',
)

path.write_text(source, encoding='utf-8')
print('Added stale-request protection to teacher report navigation.')
