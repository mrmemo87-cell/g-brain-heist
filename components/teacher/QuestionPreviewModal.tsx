import React from 'react';
import type { TeacherQuestion } from '../../types';
import './QuestionPreviewModal.css';

interface QuestionPreviewModalProps {
  question: TeacherQuestion;
  onClose: () => void;
  onEdit?: () => void;
}

const textForOption = (option: TeacherQuestion['options'][number]) =>
  typeof option === 'string' ? option : option.text;

export default function QuestionPreviewModal({ question, onClose, onEdit }: QuestionPreviewModalProps) {
  const topic = question.topic_name || question.topic || 'General';
  const type = question.question_type.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());

  return (
    <div className="question-preview" role="dialog" aria-modal="true" aria-labelledby="question-preview-title" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <article className="question-preview__card">
        <header>
          <div>
            <span>Question preview</span>
            <h2 id="question-preview-title">{question.question_text}</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close question preview">×</button>
        </header>
        <dl className="question-preview__meta">
          <div><dt>Subject</dt><dd>{question.subject}</dd></div>
          <div><dt>Topic</dt><dd>{topic}</dd></div>
          <div><dt>Question type</dt><dd>{type}</dd></div>
          <div><dt>Difficulty</dt><dd>{question.difficulty}</dd></div>
          <div><dt>Points</dt><dd>{question.points || 0}</dd></div>
          <div><dt>Time</dt><dd>{question.time_limit || 60} sec</dd></div>
        </dl>
        {question.image_url ? <img className="question-preview__image" src={question.image_url} alt="Question visual" /> : null}
        {question.options?.length ? (
          <section className="question-preview__section">
            <h3>Answer choices</h3>
            <ol>
              {question.options.map((option, index) => (
                <li key={`${textForOption(option)}-${index}`} className={textForOption(option) === question.correct_answer ? 'is-correct' : ''}>
                  <span>{String.fromCharCode(65 + index)}</span>
                  <p>{textForOption(option)}</p>
                  {textForOption(option) === question.correct_answer ? <strong>Correct</strong> : null}
                </li>
              ))}
            </ol>
          </section>
        ) : null}
        <section className="question-preview__answer">
          <span>Correct answer</span>
          <strong>{question.correct_answer || 'Not provided'}</strong>
        </section>
        {question.explanation ? (
          <section className="question-preview__section">
            <h3>Teacher explanation</h3>
            <p>{question.explanation}</p>
          </section>
        ) : null}
        {question.tags?.length ? <div className="question-preview__tags">{question.tags.map((tag) => <span key={tag}>{tag}</span>)}</div> : null}
        <footer>
          <button type="button" className="is-secondary" onClick={onClose}>Close preview</button>
          {onEdit ? <button type="button" className="is-primary" onClick={onEdit}>Edit question</button> : null}
        </footer>
      </article>
    </div>
  );
}
