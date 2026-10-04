import { economicsDisplayOptions } from './economicsOptionPresentation';
import {
  createSchoolDocumentId,
  escapeSchoolDocumentHtml,
  openSchoolDocumentPreview,
  schoolDocumentFileName,
} from '../src/lib/schoolDocument';
import { supabase } from './supabaseClient';
import { userFacingError } from './userFacingError';

export interface PrintableAssignmentOption {
  text: string;
  imageUrl?: string | null;
}

export interface PrintableAssignmentQuestion {
  questionId: string;
  orderIndex: number;
  questionText: string;
  questionType: string;
  options: PrintableAssignmentOption[];
  imageUrl?: string | null;
  imageAltText?: string | null;
  timeLimit?: number | null;
  points?: number | null;
}

export interface PrintableTeacherAssignment {
  assignment: {
    id: string;
    title: string;
    subjectName: string;
    topicName: string;
    description?: string | null;
    instructions?: string | null;
    assignedAt: string;
    dueAt?: string | null;
    className?: string | null;
    academicYear?: string | null;
    term?: string | null;
  };
  questions: PrintableAssignmentQuestion[];
}

const optionHtml = (option: PrintableAssignmentOption) => {
  const image = option.imageUrl
    ? `<img src="${escapeSchoolDocumentHtml(option.imageUrl)}" alt="" style="display:block;max-width:55mm;max-height:35mm;margin:2mm 0;object-fit:contain">`
    : '';
  return `<li style="margin-bottom:2mm"><span>${escapeSchoolDocumentHtml(option.text)}</span>${image}</li>`;
};

const responseLines = (count = 3) => Array.from({ length: count }, () => (
  '<div style="height:9mm;border-bottom:1px solid #b9c4d4"></div>'
)).join('');

const questionHtml = (question: PrintableAssignmentQuestion) => {
  const options = Array.isArray(question.options) ? economicsDisplayOptions(question.questionId, question.options.filter((option) => option?.text)) : [];
  const isShortAnswer = question.questionType === 'short_answer' || options.length === 0;
  const image = question.imageUrl
    ? `<img src="${escapeSchoolDocumentHtml(question.imageUrl)}" alt="${escapeSchoolDocumentHtml(question.imageAltText || `Question ${question.orderIndex} visual`)}" style="display:block;max-width:100%;max-height:75mm;margin:3mm auto;object-fit:contain">`
    : '';

  return `<section class="document-card" style="margin-bottom:3mm">
    <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:4mm">
      <strong style="font-size:11px;line-height:1.45">${question.orderIndex}. ${escapeSchoolDocumentHtml(question.questionText)}</strong>
    </div>
    ${image}
    ${isShortAnswer
      ? `<div style="margin-top:3mm">${responseLines(question.questionType === 'short_answer' ? 4 : 3)}</div>`
      : `<ol type="A" style="margin:3mm 0 0;padding-left:8mm">${options.map(optionHtml).join('')}</ol>`}
  </section>`;
};

export async function fetchPrintableTeacherAssignment(
  assignmentId: string,
): Promise<PrintableTeacherAssignment> {
  const { data, error } = await supabase.rpc('rpc_teacher_assignment_print_packet', {
    p_assignment_id: assignmentId,
  });
  if (error) {
    throw userFacingError(error, 'The printable assignment could not be prepared. Please try again.');
  }
  return data as PrintableTeacherAssignment;
}

export function openPrintableTeacherAssignment(input: {
  packet: PrintableTeacherAssignment;
  schoolName: string;
  schoolLogoUrl?: string | null;
  schoolId?: string | null;
  teacherName: string;
}) {
  const { packet, schoolName, schoolLogoUrl, schoolId, teacherName } = input;
  const { assignment, questions } = packet;
  const totalSeconds = questions.reduce((sum, question) => sum + Math.max(0, Number(question.timeLimit || 0)), 0);
  const estimatedMinutes = totalSeconds > 0 ? Math.max(1, Math.ceil(totalSeconds / 60)) : null;
  const dueLabel = assignment.dueAt ? new Date(assignment.dueAt).toLocaleString() : 'No deadline';

  const bodyHtml = `
    <div class="document-grid">
      <div class="document-card"><strong>Student name</strong><p style="margin-top:5mm;border-bottom:1px solid #718096">&nbsp;</p></div>
      <div class="document-card"><strong>Date</strong><p style="margin-top:5mm;border-bottom:1px solid #718096">&nbsp;</p></div>
    </div>

    <div class="document-grid" style="margin-top:3mm">
      <div class="document-card"><strong>Questions</strong><p>${questions.length}</p></div>
      <div class="document-card"><strong>Due</strong><p>${escapeSchoolDocumentHtml(dueLabel)}</p></div>
      ${estimatedMinutes ? `<div class="document-card"><strong>Suggested time</strong><p>About ${estimatedMinutes} minutes</p></div>` : ''}
    </div>

    <div class="document-callout">
      <strong>Instructions</strong>
      <p>${escapeSchoolDocumentHtml(assignment.instructions?.trim() || assignment.description?.trim() || 'Complete every question independently. For multiple-choice questions, clearly circle or mark one answer.')}</p>
    </div>

    <h2>Questions</h2>
    ${questions.map(questionHtml).join('')}

    <div class="document-callout" style="margin-top:6mm">
      <strong>Before handing in</strong>
      <p>Check that your name is written clearly and that every answer is easy to read.</p>
    </div>
  `;

  return openSchoolDocumentPreview({
    meta: {
      documentId: createSchoolDocumentId('question'),
      templateVersion: 'student-question-paper-v1',
      title: assignment.title || assignment.topicName,
      subtitle: `${questions.length} question${questions.length === 1 ? '' : 's'} · ${assignment.topicName}`,
      schoolName,
      schoolLogoUrl,
      audience: 'student',
      status: 'final',
      confidentiality: 'school-use',
      generatedAt: new Date().toISOString(),
      generatedBy: teacherName,
      subject: assignment.subjectName,
      className: assignment.className || undefined,
      academicYear: assignment.academicYear || undefined,
      term: assignment.term || undefined,
      schoolId,
      sourceType: 'teacher_assignment_question_paper',
      sourceId: assignment.id,
      visibilityScope: 'class_staff',
      documentTypeLabel: 'Student assignment question paper',
    },
    bodyHtml,
    orientation: 'portrait',
    paper: 'A4',
    inkSaver: true,
    fileName: schoolDocumentFileName(
      schoolName,
      assignment.className,
      assignment.subjectName,
      assignment.title || assignment.topicName,
      'Question_Paper',
    ),
  });
}
