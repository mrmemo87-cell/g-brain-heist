import React from 'react';
import { useSchoolAdmin } from '../SchoolAdminContext';
import AcademicSetupPanel from '../AcademicSetupPanel';

const formatDate = (value: string) => new Intl.DateTimeFormat('en-GB', {
  day: 'numeric', month: 'short', year: 'numeric',
}).format(new Date(value));

const SubjectsTab: React.FC = () => {
  const {
    dbSubjects, editingSubjectCode, editingSubjectId, editingSubjectName,
    editingSubjectSaving, handleAddSubject, handleCancelEditSubject,
    handleDeleteSubject, handleSaveEditSubject, handleStartEditSubject,
    setEditingSubjectCode, setEditingSubjectName, setSubjectCode,
    setSubjectName, subjectCode, subjectName, subjectSaving,
  } = useSchoolAdmin();

  return (
    <div className="space-y-6">
      <section className="admin-section-heading">
        <div>
          <p className="school-admin-eyebrow">Administration</p>
          <h2>Curriculum &amp; Subjects</h2>
          <p>Manage the subjects taught at your school and make them available for teacher and class assignments.</p>
        </div>
      </section>

      <AcademicSetupPanel />

      <details className="admin-advanced-disclosure subject-label-disclosure">
        <summary><span>Advanced: local subject labels</span><small>Use only for timetable or teacher-allocation names that are missing from the published framework.</small></summary>
        <div className="admin-advanced-disclosure-body space-y-4">
      <section className="admin-form-card" aria-labelledby="add-subject-title">
        <div className="admin-card-heading">
          <div><h3 id="add-subject-title">Create a local scheduling label</h3><p>This label can be used in teacher allocations, but it does not add curriculum objectives or expose questions to students.</p></div>
        </div>
        <div className="admin-access-note"><strong>Framework subjects come first</strong><span>If the subject already appears in Subjects by grade, do not recreate it here. Local labels are for school-specific names such as Advisory or Homeroom.</span></div>
        <div className="admin-form-grid">
          <label className="admin-field admin-field-wide">
            <span>Subject name <i>Required</i></span>
            <input value={subjectName} onChange={(event) => setSubjectName(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && !subjectSaving && handleAddSubject()} placeholder="For example, Mathematics" />
          </label>
          <label className="admin-field">
            <span>Subject code <i>Optional</i></span>
            <input value={subjectCode} onChange={(event) => setSubjectCode(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && !subjectSaving && handleAddSubject()} placeholder="For example, MATH" />
          </label>
        </div>
        <div className="admin-form-actions">
          <button className="admin-button-primary" onClick={handleAddSubject} disabled={subjectSaving || !subjectName.trim()}>
            {subjectSaving ? 'Adding subject…' : 'Add subject'}
          </button>
        </div>
      </section>

      <section className="admin-table-card" aria-labelledby="subjects-list-title">
        <div className="admin-card-heading">
          <div><h3 id="subjects-list-title">School subjects</h3><p>{dbSubjects.length} {dbSubjects.length === 1 ? 'subject' : 'subjects'} available for assignment</p></div>
        </div>
        {dbSubjects.length ? <div className="admin-table-scroll"><table>
          <thead><tr><th>Subject</th><th>Code</th><th>Created</th><th className="admin-actions-column">Actions</th></tr></thead>
          <tbody>{dbSubjects.map((subject) => <tr key={subject.id}>
            {editingSubjectId === subject.id ? <>
              <td><label className="sr-only" htmlFor={`subject-name-${subject.id}`}>Subject name</label><input id={`subject-name-${subject.id}`} autoFocus value={editingSubjectName} onChange={(event) => setEditingSubjectName(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') handleSaveEditSubject(); if (event.key === 'Escape') handleCancelEditSubject(); }} /></td>
              <td><label className="sr-only" htmlFor={`subject-code-${subject.id}`}>Subject code</label><input id={`subject-code-${subject.id}`} value={editingSubjectCode} onChange={(event) => setEditingSubjectCode(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') handleSaveEditSubject(); if (event.key === 'Escape') handleCancelEditSubject(); }} /></td>
              <td>{formatDate(subject.created_at)}</td>
              <td className="admin-row-actions"><button className="admin-button-primary admin-button-small" onClick={handleSaveEditSubject} disabled={editingSubjectSaving || !editingSubjectName.trim()}>{editingSubjectSaving ? 'Saving…' : 'Save'}</button><button className="admin-button-ghost admin-button-small" onClick={handleCancelEditSubject}>Cancel</button></td>
            </> : <>
              <td><strong>{subject.name}</strong></td><td>{subject.code || <span className="admin-muted">Not set</span>}</td><td>{formatDate(subject.created_at)}</td>
              <td className="admin-row-actions"><button className="admin-button-ghost admin-button-small" onClick={() => handleStartEditSubject(subject)}>Edit</button><button className="admin-button-danger admin-button-small" onClick={() => handleDeleteSubject(subject.id, subject.name)}>Delete</button></td>
            </>}
          </tr>)}</tbody>
        </table></div> : <div className="admin-empty-state"><h3>No curriculum subjects yet</h3><p>Add the subjects taught at your school so teachers and classes can be assigned correctly.</p></div>}
      </section>
        </div>
      </details>
    </div>
  );
};

export default SubjectsTab;
