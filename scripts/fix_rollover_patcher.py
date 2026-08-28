from pathlib import Path

path = Path('scripts/patch_academic_year_rollover_surfaces.py')
text = path.read_text(encoding='utf-8')
old = '''text = replace_once(
    text,
    "  }, [studentId]);\\n\\n  const resolvedContext",
    "  }, [studentId, academicYearId]);\\n\\n  useEffect(() => {\\n    if (!academicYearId || !profile) return;\\n    setAvailableSubjects(profile.subjects.map((item) => item.subject));\\n  }, [academicYearId, profile]);\\n\\n  const resolvedContext",
    'academic context dependency',
)
'''
new = '''text = replace_once(
    text,
    "  }, [studentId]);\\n\\n  const allSubjects = useMemo",
    "  }, [studentId, academicYearId]);\\n\\n  useEffect(() => {\\n    if (!academicYearId || !profile) return;\\n    setAvailableSubjects(profile.subjects.map((item) => item.subject));\\n  }, [academicYearId, profile]);\\n\\n  const allSubjects = useMemo",
    'academic context dependency',
)
'''
if old not in text:
    raise RuntimeError('Expected Academic Profile patcher block was not found')
path.write_text(text.replace(old, new, 1), encoding='utf-8')
print('Rollover patcher marker fixed.')
