from pathlib import Path

path = Path('components/teacher/AssignmentWizard.tsx')
text = path.read_text(encoding='utf-8')

old_topics = """  const topics = useMemo(\n    () => [...new Set(subjectQuestions.map((question) => question.topic_name || question.topic || 'General'))]\n      .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true })),\n    [subjectQuestions],\n  );\n"""

new_topics = """  const assignmentEligibleQuestions = useMemo(\n    () => subjectQuestions.filter((question) => {\n      const eligibleGrades = question.eligible_grade_levels || [];\n      const matchesAudienceGrades = !isBrainsHeistPoolQuestion(question, teacherId)\n        || audienceGrades.length === 0\n        || audienceGrades.every((grade) => eligibleGrades.includes(grade));\n      const matchesPool = questionPool === 'all'\n        || (questionPool === 'mine' && isMyPoolQuestion(question, teacherId))\n        || (questionPool === 'brains-heist' && isBrainsHeistPoolQuestion(question, teacherId));\n      return matchesAudienceGrades && matchesPool;\n    }),\n    [audienceGrades, questionPool, subjectQuestions, teacherId],\n  );\n\n  const topics = useMemo(\n    () => [...new Set(assignmentEligibleQuestions.map((question) => question.topic_name || question.topic || 'General'))]\n      .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true })),\n    [assignmentEligibleQuestions],\n  );\n\n  useEffect(() => {\n    if (topicFilter !== 'all' && !topics.includes(topicFilter)) setTopicFilter('all');\n  }, [topicFilter, topics]);\n"""

old_filter_head = """  const filteredQuestions = useMemo(() => {\n    const matches = subjectQuestions.filter((question) => {\n      const topic = question.topic_name || question.topic || 'General';\n      const haystack = [\n        question.question_text,\n        question.correct_answer,\n        topic,\n        ...(question.tags || []),\n        question.difficulty,\n      ].join(' ').toLocaleLowerCase();\n      const xp = question.points || 0;\n      const eligibleGrades = question.eligible_grade_levels || [];\n      const matchesAudienceGrades = !isBrainsHeistPoolQuestion(question, teacherId)\n        || audienceGrades.length === 0\n        || audienceGrades.every((grade) => eligibleGrades.includes(grade));\n      return (\n        matchesAudienceGrades &&\n        (!debouncedQuestionSearch || haystack.includes(debouncedQuestionSearch)) &&\n        (questionPool === 'all' ||\n          (questionPool === 'mine' && isMyPoolQuestion(question, teacherId)) ||\n          (questionPool === 'brains-heist' && isBrainsHeistPoolQuestion(question, teacherId))) &&\n"""

new_filter_head = """  const filteredQuestions = useMemo(() => {\n    const matches = assignmentEligibleQuestions.filter((question) => {\n      const topic = question.topic_name || question.topic || 'General';\n      const haystack = [\n        question.question_text,\n        question.correct_answer,\n        topic,\n        ...(question.tags || []),\n        question.difficulty,\n      ].join(' ').toLocaleLowerCase();\n      const xp = question.points || 0;\n      return (\n        (!debouncedQuestionSearch || haystack.includes(debouncedQuestionSearch)) &&\n"""

old_dependencies = """  }, [assignmentQuestionIds, audienceGrades, debouncedQuestionSearch, difficultyFilter, questionPool, sort, subjectQuestions, teacherId, topicFilter, typeFilter, xpFilter]);\n"""
new_dependencies = """  }, [assignmentEligibleQuestions, assignmentQuestionIds, debouncedQuestionSearch, difficultyFilter, sort, topicFilter, typeFilter, xpFilter]);\n"""

already_patched = 'const assignmentEligibleQuestions = useMemo(' in text
if already_patched:
    print('Assignment topic options already audience-scoped; skipping patch.')
    raise SystemExit(0)

for label, old in (
    ('topic source', old_topics),
    ('filtered question source', old_filter_head),
    ('filtered question dependencies', old_dependencies),
):
    if old not in text:
        raise SystemExit(f'Cannot safely patch AssignmentWizard.tsx: expected {label} block not found.')

text = text.replace(old_topics, new_topics, 1)
text = text.replace(old_filter_head, new_filter_head, 1)
text = text.replace(old_dependencies, new_dependencies, 1)
path.write_text(text, encoding='utf-8')
print('Assignment topic options now follow audience-grade and pool eligibility.')
