from pathlib import Path

path = Path('components/teacher/QuestionBatchWorkspace.tsx')
text = path.read_text(encoding='utf-8')
old = "const [questionTypes, setQuestionTypes] = useState<QuestionType[]>(['multiple_choice', 'short_answer']);"
new = "const [questionTypes, setQuestionTypes] = useState<QuestionType[]>(['multiple_choice', 'true_false']);"
count = text.count(old)
if count != 1:
    raise SystemExit(f'Expected exactly one PDF question-type default, found {count}')
path.write_text(text.replace(old, new, 1), encoding='utf-8')
print('Updated PDF defaults to Multiple choice + True / False.')
