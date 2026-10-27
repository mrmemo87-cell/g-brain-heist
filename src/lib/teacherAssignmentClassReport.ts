import type { TeacherAssignmentReportRow, TeacherAssignmentSummary } from '../../types';
import { escapeSchoolDocumentHtml as escape } from './schoolDocument';

// Use only the authorised, already-loaded report; printing never fetches new results.
export const buildTeacherAssignmentClassReport = (
  assignment: TeacherAssignmentSummary,
  rows: readonly TeacherAssignmentReportRow[],
) => {
  const date = (value: string) => {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? 'Unavailable' : parsed.toLocaleString();
  };
  const average = rows.length
    ? `${(rows.reduce((total, row) => total + row.accuracy, 0) / rows.length).toFixed(1)}%`
    : 'No completed results';
  const resultRows = rows.map((row) => `
    <tr>
      <td>${escape(row.student_name)}</td>
      <td>${escape(row.batch ?? '—')}</td>
      <td>${escape(row.score)}</td>
      <td>${escape(row.correct)}</td>
      <td>${escape(row.incorrect)}</td>
      <td>${escape(row.accuracy)}%</td>
      <td>${escape(date(row.completed_at))}</td>
      <td>${row.completion_source === 'paper' ? 'Paper · Teacher confirmed' : row.completion_source === 'online' ? 'Online' : 'Not recorded'}</td>
    </tr>`).join('');

  return `
    <h2>Assignment overview</h2>
    <div class="document-grid">
      <div class="document-card"><strong>Topic</strong><p>${escape(assignment.topic_name)}</p></div>
      <div class="document-card"><strong>Questions</strong><p>${escape(assignment.question_count)}</p></div>
      <div class="document-card"><strong>Assigned</strong><p>${escape(date(assignment.assigned_at))}</p></div>
      <div class="document-card"><strong>Due</strong><p>${assignment.due_at ? escape(date(assignment.due_at)) : 'No deadline'}</p></div>
      <div class="document-card"><strong>Completed / assigned students</strong><p>${rows.length} / ${escape(assignment.student_count)}</p></div>
      <div class="document-card"><strong>Average accuracy · completed submissions</strong><p>${average}</p></div>
    </div>
    <h2>Student performance</h2>
    <p>This report includes completed submissions available when generated. Unfinished submissions are excluded from the average and are not scored as zero.</p>
    <table>
      <thead><tr><th scope="col">Student</th><th scope="col">Class</th><th scope="col">Score (XP)</th><th scope="col">Correct</th><th scope="col">Incorrect</th><th scope="col">Accuracy</th><th scope="col">Completed</th><th scope="col">Source</th></tr></thead>
      <tbody>${resultRows || '<tr><td colspan="8">No completed results available.</td></tr>'}</tbody>
    </table>
    <p>Score is XP earned; questions may carry different points. Accuracy is the percentage of correct answers. Class labels reflect the assignment-time class snapshot. Paper results were confirmed by the teacher; response timing is unavailable.</p>`;
};
