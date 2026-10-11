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
  optionOrderPolicy?: 'assignment-balanced-v1' | null;
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
  code?: string;
  formHash?: string;
  answerKey?: Record<string, string>;
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

export const questionHtml = (question: PrintableAssignmentQuestion) => {
  const options = Array.isArray(question.options) ? economicsDisplayOptions(question.questionId, question.options.filter((option) => option && (option.text || option.imageUrl)), question.optionOrderPolicy) : [];
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
  const { data, error } = await supabase.rpc('rpc_teacher_paper_workspace', {
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
  markingKey?: boolean;
  studentName?: string;
}) {
  const { packet, schoolName, schoolLogoUrl, schoolId, teacherName } = input;
  const { assignment, questions } = packet;
  const totalSeconds = questions.reduce((sum, question) => sum + Math.max(0, Number(question.timeLimit || 0)), 0);
  const estimatedMinutes = totalSeconds > 0 ? Math.max(1, Math.ceil(totalSeconds / 60)) : null;
  const dueLabel = assignment.dueAt ? new Date(assignment.dueAt).toLocaleString() : 'No deadline';

  const questionBody = `
    <div class="document-callout"><strong>${escapeSchoolDocumentHtml(packet.code || assignment.id)} · Form ${escapeSchoolDocumentHtml(packet.formHash?.slice(0, 8) || "1")}</strong></div>
    <div class="document-grid">
      <div class="document-card"><strong>Student name</strong><p style="margin-top:5mm;border-bottom:1px solid #718096">${escapeSchoolDocumentHtml(input.studentName || "")}&nbsp;</p></div>
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

  const answerRows = questions.map((question) => {
    const options = economicsDisplayOptions(question.questionId, question.options, question.optionOrderPolicy);
    const answer = packet.answerKey?.[question.questionId];
    const correctIndex = options.findIndex((option) => option.text === answer);
    return `<tr><td style="padding:3mm;border-bottom:1px solid #dbe3ef">${question.orderIndex}</td><td style="padding:3mm;border-bottom:1px solid #dbe3ef">${input.markingKey ? `${correctIndex >= 0 ? String.fromCharCode(65 + correctIndex) + ' · ' : ''}${escapeSchoolDocumentHtml(answer || 'Teacher review')}` : options.length ? options.map((_, i) => `${String.fromCharCode(65 + i)} ○`).join('&emsp;') : '________________________________'}</td></tr>`;
  }).join('');
  const answerSheet = `<section style="${input.markingKey ? '' : 'break-before:page;'}"><h2>${input.markingKey ? 'Teacher marking key' : 'Answer sheet'}</h2><p>${escapeSchoolDocumentHtml(packet.code || assignment.id)} · Form ${escapeSchoolDocumentHtml(packet.formHash?.slice(0, 8) || '1')}</p>${input.markingKey ? '' : `<p>Student: ${escapeSchoolDocumentHtml(input.studentName || '')}___________________ &emsp; Date: ______________</p>`}<table style="width:100%;font-size:11px;border-collapse:collapse"><thead><tr><th style="text-align:left">Question</th><th style="text-align:left">${input.markingKey ? 'Answer' : 'Mark one answer'}</th></tr></thead><tbody>${answerRows}</tbody></table></section>`;
  const bodyHtml = input.markingKey ? answerSheet : questionBody + answerSheet;
  return openSchoolDocumentPreview({
    meta: {
      documentId: packet.code ? `${packet.code}-${packet.formHash?.slice(0, 8) || '1'}${input.markingKey ? '-KEY' : ''}` : createSchoolDocumentId('question'),
      templateVersion: 'student-question-paper-v1',
      title: assignment.title || assignment.topicName,
      subtitle: `${questions.length} question${questions.length === 1 ? '' : 's'} · ${assignment.topicName}`,
      schoolName,
      schoolLogoUrl,
      audience: input.markingKey ? 'teacher' : 'student',
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
      documentTypeLabel: input.markingKey ? 'Teacher marking key' : 'Student assignment question paper',
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
      input.markingKey ? 'Marking_Key' : 'Question_Paper',
    ),
  });
}
