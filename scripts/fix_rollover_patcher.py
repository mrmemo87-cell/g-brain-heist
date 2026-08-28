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
text = text.replace(old, new, 1)

old = '''    """>Start a new writing task
          </button>""",
    """>{isArchivedAcademicYear ? 'Archived year — switch to current year' : 'Start a new writing task'}
          </button>""",
    'writing archived button label',
)'''
new = '''    """>
            Start a new writing task
          </button>""",
    """>
            {isArchivedAcademicYear ? 'Archived year — switch to current year' : 'Start a new writing task'}
          </button>""",
    'writing archived button label',
)'''
if old not in text:
    raise RuntimeError('Expected Writing Hub button-label patcher block was not found')
text = text.replace(old, new, 1)

old = "onChange={(event) => setSelectedAcademicYearId(event.target.value)}"
new = "onChange={(event: React.ChangeEvent<HTMLSelectElement>) => setSelectedAcademicYearId(event.target.value)}"
if old not in text:
    raise RuntimeError('Expected Writing Hub academic-year selector handler was not found')
text = text.replace(old, new, 1)

path.write_text(text, encoding='utf-8')
print('Rollover patcher markers and selector typing fixed.')
