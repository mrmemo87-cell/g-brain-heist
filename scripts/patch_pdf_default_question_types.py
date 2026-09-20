from pathlib import Path

path = Path('components/teacher/QuestionBatchWorkspace.tsx')
text = path.read_text(encoding='utf-8')
old = "const [questionTypes, setQuestionTypes] = useState<QuestionType[]>(['multiple_choice', 'short_answer']);"
new = "const [questionTypes, setQuestionTypes] = useState<QuestionType[]>(['multiple_choice', 'true_false']);"
if old in text:
    if text.count(old) != 1:
        raise SystemExit('Unexpected duplicate PDF question-type defaults')
    text = text.replace(old, new, 1)
elif text.count(new) != 1:
    raise SystemExit('Expected the validated PDF question-type default exactly once')
path.write_text(text, encoding='utf-8')
print('PDF defaults verified: Multiple choice + True / False.')
