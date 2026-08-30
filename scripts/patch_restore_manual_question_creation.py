from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected exactly one match, found {count}")
    return text.replace(old, new, 1)


def patch_teacher_portal() -> None:
    path = Path('components/TeacherPortal.tsx')
    text = path.read_text(encoding='utf-8')

    old = """  const openMyPoolQuestionForm = (preferredSubject?: Subject, preferredTopic?: string) => {
    setEditingQuestion(null);
    setQuestionBatchDefaults({
      subject: preferredSubject,
      topic: preferredTopic && preferredTopic !== 'General' ? preferredTopic : undefined,
    });
    setView('question-batch');
  };
"""
    new = """  const openMyPoolQuestionForm = (preferredSubject?: Subject, preferredTopic?: string) => {
    setEditingQuestion(null);
    if (preferredSubject) setSubject(preferredSubject);
    if (preferredTopic && preferredTopic !== 'General') {
      setTopicMode('custom');
      setCustomTopicName(preferredTopic);
    } else {
      setTopicMode('general');
      setCustomTopicName('');
    }
    setEligibleGradeLevels([]);
    setView('create-question');
  };

  const openQuestionBatchWorkspace = (preferredSubject?: Subject, preferredTopic?: string) => {
    setQuestionBatchDefaults({
      subject: preferredSubject,
      topic: preferredTopic && preferredTopic !== 'General' ? preferredTopic : undefined,
    });
    setView('question-batch');
  };
"""
    text = replace_once(text, old, new, 'restore manual question entry route')

    old = """              onCreateQuestion={openMyPoolQuestionForm}
              onRenameTopic={(topicQuestions, nextTopic) => { void handleRenameTopic(topicQuestions, nextTopic); }}
"""
    new = """              onCreateQuestion={openMyPoolQuestionForm}
              onCreateQuestionBatch={openQuestionBatchWorkspace}
              onRenameTopic={(topicQuestions, nextTopic) => { void handleRenameTopic(topicQuestions, nextTopic); }}
"""
    text = replace_once(text, old, new, 'wire batch callback separately')

    path.write_text(text, encoding='utf-8')


def patch_question_bank() -> None:
    path = Path('components/teacher/QuestionBank.tsx')
    text = path.read_text(encoding='utf-8')

    text = replace_once(
        text,
        "  onCreateQuestion?: (subject?: Subject, topic?: string) => void;\n",
        "  onCreateQuestion?: (subject?: Subject, topic?: string) => void;\n  onCreateQuestionBatch?: (subject?: Subject, topic?: string) => void;\n",
        'question bank batch prop',
    )
    text = replace_once(
        text,
        "  questions, teacher, onUseSet, onEditQuestion, onDeleteQuestion, onCreateQuestion,\n  onRenameTopic, onDeleteTopic, useActionLabel = 'Add to a new assignment', restrictedSubjects,\n",
        "  questions, teacher, onUseSet, onEditQuestion, onDeleteQuestion, onCreateQuestion, onCreateQuestionBatch,\n  onRenameTopic, onDeleteTopic, useActionLabel = 'Add to a new assignment', restrictedSubjects,\n",
        'question bank destructure',
    )
    text = replace_once(
        text,
        """        <div className=\"flex flex-wrap gap-2\">{onCreateQuestion ? <button type=\"button\" className=\"qb-primary-action\" onClick={() => { choosePool('mine'); onCreateQuestion(); }}>Add Question Batch</button> : null}</div>
""",
        """        <div className=\"flex flex-wrap gap-2\">
          {onCreateQuestion ? <button type=\"button\" className=\"qb-primary-action\" onClick={() => { choosePool('mine'); onCreateQuestion(); }}>Add Question</button> : null}
          {onCreateQuestionBatch ? <button type=\"button\" onClick={() => { choosePool('mine'); onCreateQuestionBatch(); }}>Add Question Batch</button> : null}
        </div>
""",
        'question bank header actions',
    )
    text = replace_once(
        text,
        """        {activePool === 'mine' && onCreateQuestion ? <button type=\"button\" onClick={() => onCreateQuestion()}>Upload question PDF</button> : null}
""",
        """        {activePool === 'mine' ? <div className=\"flex flex-wrap gap-2\">{onCreateQuestion ? <button type=\"button\" onClick={() => onCreateQuestion()}>Add Question</button> : null}{onCreateQuestionBatch ? <button type=\"button\" onClick={() => onCreateQuestionBatch()}>Upload question PDF</button> : null}</div> : null}
""",
        'my pool actions',
    )
    text = replace_once(
        text,
        """        <div className=\"qb-empty\"><h3>{activePool === 'mine' ? 'Upload your first question paper' : 'No questions match these filters'}</h3><p>{activePool === 'mine' ? 'We will find the questions and create topics after you check the extraction.' : 'Try another subject or a broader search.'}</p>{activePool === 'mine' && onCreateQuestion ? <button type=\"button\" onClick={() => onCreateQuestion()}>Add Question Batch</button> : null}</div>
""",
        """        <div className=\"qb-empty\"><h3>{activePool === 'mine' ? 'Create your first question' : 'No questions match these filters'}</h3><p>{activePool === 'mine' ? 'Add one question manually or upload a PDF to build a reviewed batch.' : 'Try another subject or a broader search.'}</p>{activePool === 'mine' ? <div className=\"flex flex-wrap justify-center gap-2\">{onCreateQuestion ? <button type=\"button\" onClick={() => onCreateQuestion()}>Add Question</button> : null}{onCreateQuestionBatch ? <button type=\"button\" onClick={() => onCreateQuestionBatch()}>Add Question Batch</button> : null}</div> : null}</div>
""",
        'my pool empty state',
    )
    text = replace_once(
        text,
        """              {activePool === 'mine' && onCreateQuestion ? <button type=\"button\" onClick={() => onCreateQuestion(selectedTopic.subject, selectedTopic.topic)}>Upload PDF to this topic</button> : null}
""",
        """              {activePool === 'mine' && onCreateQuestion ? <button type=\"button\" onClick={() => onCreateQuestion(selectedTopic.subject, selectedTopic.topic)}>Add question to this topic</button> : null}
              {activePool === 'mine' && onCreateQuestionBatch ? <button type=\"button\" onClick={() => onCreateQuestionBatch(selectedTopic.subject, selectedTopic.topic)}>Upload PDF to this topic</button> : null}
""",
        'topic footer actions',
    )

    path.write_text(text, encoding='utf-8')


def add_regression_test() -> None:
    path = Path('tests/manualQuestionCreationRouting.test.ts')
    path.write_text("""import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const portal = readFileSync('components/TeacherPortal.tsx', 'utf8');
const questionBank = readFileSync('components/teacher/QuestionBank.tsx', 'utf8');

test('manual question creation remains distinct from PDF batch creation', () => {
  assert.match(portal, /const openMyPoolQuestionForm[\\s\\S]*setView\\('create-question'\\)/);
  assert.match(portal, /const openQuestionBatchWorkspace[\\s\\S]*setView\\('question-batch'\\)/);
  assert.match(portal, /onCreateQuestion=\\{openMyPoolQuestionForm\\}/);
  assert.match(portal, /onCreateQuestionBatch=\\{openQuestionBatchWorkspace\\}/);
  assert.match(questionBank, />Add Question<\\/button>/);
  assert.match(questionBank, />Add Question Batch<\\/button>/);
  assert.match(questionBank, />Upload question PDF<\\/button>/);
});

test('geometry Use in Question continues into the manual question builder', () => {
  assert.match(portal, /onUseInQuestion=\\{\\(asset\\) => \\{[\\s\\S]*openMyPoolQuestionForm\\('Maths', asset\\.topic \\|\\| 'Geometry'\\)/);
});
""", encoding='utf-8')


if __name__ == '__main__':
    patch_teacher_portal()
    patch_question_bank()
    add_regression_test()
    print('Restored manual question creation while preserving PDF question batches.')
