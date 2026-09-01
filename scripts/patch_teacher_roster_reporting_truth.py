from pathlib import Path


def replace_once(path: Path, old: str, new: str, label: str) -> bool:
    text = path.read_text(encoding='utf-8')
    if new in text:
        print(f'{label} already materialized; skipping patch.')
        return False
    if old not in text:
        raise SystemExit(f'{label}: expected source block not found')
    path.write_text(text.replace(old, new, 1), encoding='utf-8')
    print(f'{label} materialized.')
    return True


portal = Path('components/TeacherPortal.tsx')
collective = Path('components/CollectiveAssignmentReport.tsx')

replace_once(
    portal,
    "          student_name: officialNames.get(row.student_id) || 'Student name unavailable',",
    "          student_name: officialNames.get(row.student_id) || row.student_name || 'Student name unavailable',",
    'Assignment report official-name fallback',
)

replace_once(
    collective,
    """  useEffect(() => {\n    if (!studentRows.length || studentSelectionReady) return;\n    setSelectedStudentIds(studentRows.map((student) => student.studentId));\n    setStudentSelectionReady(true);\n  }, [studentRows, studentSelectionReady]);""",
    """  useEffect(() => {\n    // Wait for historical assignment rows before taking the initial selection\n    // snapshot. A current roster can load before a transferred/suspended\n    // student's historical result, which must never make real evidence vanish.\n    if (loading || !studentRows.length || studentSelectionReady) return;\n    setSelectedStudentIds(studentRows.map((student) => student.studentId));\n    setStudentSelectionReady(true);\n  }, [loading, studentRows, studentSelectionReady]);""",
    'Collective report historical-student selection barrier',
)
