from pathlib import Path

path = Path('components/teacher/AssignmentWizard.tsx')
source = path.read_text()


def replace_once(old: str, new: str, label: str) -> None:
    global source
    count = source.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected exactly one match, found {count}')
    source = source.replace(old, new, 1)


replace_once(
    """  const subjectQuestions = useMemo(\n    () => uniqueQuestions.filter((question) => normalizeSubject(question.subject) === normalizeSubject(assignmentSubject)),\n    [assignmentSubject, uniqueQuestions],\n  );\n\n  const topics = useMemo(\n""",
    """  const subjectQuestions = useMemo(\n    () => uniqueQuestions.filter((question) => normalizeSubject(question.subject) === normalizeSubject(assignmentSubject)),\n    [assignmentSubject, uniqueQuestions],\n  );\n\n  const audienceGrades = useMemo(() => {\n    const grades = assignmentMode === 'batch'\n      ? uniqueClasses\n        .filter((item) => assignmentBatches.includes('All') || assignmentBatches.includes(item.class_code))\n        .map((item) => Number(item.grade_level))\n      : availableStudents\n        .filter((student) => selectedStudentIds.includes(student.id))\n        .map((student) => Number(student.grade));\n\n    return [...new Set(grades.filter((grade) => Number.isInteger(grade) && grade > 0))];\n  }, [assignmentBatches, assignmentMode, availableStudents, selectedStudentIds, uniqueClasses]);\n\n  const topics = useMemo(\n""",
    'audience grade derivation',
)

replace_once(
    """      const xp = question.points || 0;\n      return (\n        (!debouncedQuestionSearch || haystack.includes(debouncedQuestionSearch)) &&\n""",
    """      const xp = question.points || 0;\n      const eligibleGrades = question.eligible_grade_levels || [];\n      const matchesAudienceGrades = !isBrainsHeistPoolQuestion(question, teacherId)\n        || audienceGrades.length === 0\n        || audienceGrades.every((grade) => eligibleGrades.includes(grade));\n      return (\n        matchesAudienceGrades &&\n        (!debouncedQuestionSearch || haystack.includes(debouncedQuestionSearch)) &&\n""",
    'verified question audience-grade filter',
)

replace_once(
    """  }, [assignmentQuestionIds, debouncedQuestionSearch, difficultyFilter, questionPool, sort, subjectQuestions, teacherId, topicFilter, typeFilter, xpFilter]);\n\n  const selectedQuestions = useMemo(\n""",
    """  }, [assignmentQuestionIds, audienceGrades, debouncedQuestionSearch, difficultyFilter, questionPool, sort, subjectQuestions, teacherId, topicFilter, typeFilter, xpFilter]);\n\n  useEffect(() => {\n    if (!audienceGrades.length) return;\n    setAssignmentQuestionIds((current) => {\n      const next = current.filter((id) => {\n        const question = subjectQuestions.find((item) => item.id === id);\n        if (!question || !isBrainsHeistPoolQuestion(question, teacherId)) return true;\n        const eligibleGrades = question.eligible_grade_levels || [];\n        return audienceGrades.every((grade) => eligibleGrades.includes(grade));\n      });\n      return next.length === current.length ? current : next;\n    });\n  }, [audienceGrades, setAssignmentQuestionIds, subjectQuestions, teacherId]);\n\n  const selectedQuestions = useMemo(\n""",
    'prune incompatible selected verified questions',
)

path.write_text(source)
