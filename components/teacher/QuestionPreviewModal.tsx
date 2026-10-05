import React from 'react';
import type { TeacherQuestion } from '../../types';
import { questionPurposeLabel } from '../../services/economicsQuestionPurpose';
import './QuestionPreviewModal.css';

interface QuestionPreviewModalProps {
  question: TeacherQuestion;
  onClose: () => void;
  onEdit?: () => void;
  optionOrderNote?: string;
}

const textForOption = (option: TeacherQuestion['options'][number]) =>
  typeof option === 'string' ? option : option.text;

export default function QuestionPreviewModal({ question, onClose, onEdit, optionOrderNote }: QuestionPreviewModalProps) {
  const topic = question.topic_name || question.topic || 'General';
  const purpose = questionPurposeLabel(question);
  const type = question.question_type.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());

  return (
    <div className="question-preview" role="dialog" aria-modal="true" aria-labelledby="question-preview-title" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <article className="question-preview__card">
        <header>
          <div>
            <span>Question preview</span>
            <h2 id="question-preview-title">{topic}</h2>
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
          {purpose ? <div><dt>Suggested use</dt><dd>{purpose}</dd></div> : null}
        </dl>
        <section className="question-preview__prompt">
          <span>Question prompt</span>
          <p>{question.question_text}</p>
        </section>
        {question.image_url ? <img className="question-preview__image" src={question.image_url} alt={question.image_alt_text || 'Question visual'} /> : null}
        {question.options?.length ? (
          <section className="question-preview__section">
            <h3>Answer choices</h3>
            {optionOrderNote ? <p className="question-preview__tracking-note">{optionOrderNote}</p> : null}
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
        {purpose ? <section className="question-preview__section"><h3>{purpose}</h3><p>{purpose === 'Reassessment candidate'
          ? 'Keep this item for a later independent quiz. If the student has already answered it, the result is recorded as repetition rather than fresh evidence.'
          : 'Use this item to rehearse the skill. Create it through Targeted Practice so the answers remain separate from independent assessment evidence.'}</p></section> : null}
        {question.tags?.length ? <div className="question-preview__tags">{question.tags.filter(tag => !tag.startsWith('purpose:') && !tag.startsWith('subskill:')).map((tag) => <span key={tag}>{tag}</span>)}</div> : null}
        <section className="question-preview__section question-preview__tracking">
          <h3>What this question assesses</h3>
          {question.registry_mappings?.length ? question.registry_mappings.map((mapping, index) => (
            <div className="question-preview__mapping" key={`${mapping.registryCode}-${mapping.subskill}-${mapping.evidenceFocus}-${index}`}>
              <dl>
                {mapping.strand ? <div><dt>Strand</dt><dd>{mapping.strand}</dd></div> : null}
                <div><dt>Skill</dt><dd>{mapping.skill}</dd></div>
                <div><dt>Subskill</dt><dd>{mapping.subskill}</dd></div>
                <div><dt>Evidence focus</dt><dd>{mapping.evidenceFocus}</dd></div>
              </dl>
              <p>{mapping.evidenceStatement}</p>
            </div>
          )) : question.curriculum_skill || question.curriculum_subskill ? (
            <div className="question-preview__mapping"><dl>
              {question.curriculum_strand ? <div><dt>Strand</dt><dd>{question.curriculum_strand}</dd></div> : null}
              {question.curriculum_skill ? <div><dt>Skill</dt><dd>{question.curriculum_skill}</dd></div> : null}
              {question.curriculum_subskill ? <div><dt>Subskill</dt><dd>{question.curriculum_subskill}</dd></div> : null}
            </dl>{question.curriculum_objective ? <p>{question.curriculum_objective}</p> : null}</div>
          ) : <p>Detailed assessment mapping is not available for this question.</p>}
          <p className="question-preview__tracking-note">{question.analytics_eligible && question.verification_status === 'verified'
            ? 'Fresh verified assessment answers can contribute to Academic Profiles. Evidence from different items and occasions builds confidence; targeted practice and repeated items require fresh independent reassessment.'
            : 'This question is not eligible to contribute to verified Academic Profile evidence.'}</p>
        </section>
        <footer>
          <button type="button" className="is-secondary" onClick={onClose}>Close preview</button>
          {onEdit ? <button type="button" className="is-primary" onClick={onEdit}>Edit question</button> : null}
        </footer>
      </article>
    </div>
  );
}
