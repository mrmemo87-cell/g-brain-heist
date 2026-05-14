import React from 'react';
import { useSchoolAdmin } from '../SchoolAdminContext';

const CAMBRIDGE_SUBJECT_TEMPLATES = [
  { name: 'English stage 9', code: 'ENG9', description: 'Stage 7-9 English Cambridge tests' },
  { name: 'Chemistry', code: 'CHEM', description: 'AS Chemistry Cambridge tests' },
  { name: 'Biology', code: 'BIO', description: 'AS Biology Cambridge tests' },
  { name: 'Travel & Tourism', code: 'TRAVEL', description: 'Cambridge 9395 Travel & Tourism tests' },
];

const SubjectsTab: React.FC = () => {
  const {
    dbSubjects, editingSubjectCode, editingSubjectId, editingSubjectName, editingSubjectSaving, handleAddSubject, handleAddSubjectTemplate, handleCancelEditSubject, handleDeleteSubject, handleSaveEditSubject, handleStartEditSubject, setEditingSubjectCode, setEditingSubjectName, setSubjectCode, setSubjectName, subjectCode, subjectName, subjectSaving, subjectTemplateSaving,
  } = useSchoolAdmin();

  const existingSubjectNames = new Set(dbSubjects.map((subject: { name: string }) => subject.name.toLowerCase()));

  return (
    <div className="space-y-6">
      {/* Cambridge Subject Templates */}
      <div className="bg-cyan-950/30 rounded-xl p-6 border border-cyan-700/50">
        <div className="flex flex-col gap-2 mb-4">
          <h3 className="text-lg font-semibold text-cyan-100">Cambridge subject templates</h3>
          <p className="text-sm text-cyan-200/80">
            Add official Cambridge subjects to this school so they appear in the teacher assignment subject dropdown. Use the Travel & Tourism template for the new 9395 test.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
          {CAMBRIDGE_SUBJECT_TEMPLATES.map((template) => {
            const alreadyAdded = existingSubjectNames.has(template.name.toLowerCase());
            const isSaving = subjectTemplateSaving === template.name;
            return (
              <div key={template.name} className="rounded-lg border border-cyan-800/70 bg-gray-900/70 p-4">
                <div className="text-sm font-bold text-white">{template.name}</div>
                <div className="mt-1 text-xs text-cyan-200/70">{template.description}</div>
                <div className="mt-2 text-xs text-gray-400">Code: {template.code}</div>
                <button
                  onClick={() => handleAddSubjectTemplate(template.name, template.code)}
                  disabled={alreadyAdded || isSaving}
                  className="mt-3 w-full px-3 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:bg-gray-700 disabled:text-gray-400 disabled:cursor-not-allowed rounded-lg transition-colors text-sm font-medium"
                >
                  {alreadyAdded ? 'Already added' : isSaving ? 'Adding...' : 'Add template'}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Add Subject Form */}
      <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
        <h3 className="text-lg font-semibold mb-4">Add New Subject</h3>
        <p className="text-sm text-gray-400 mb-4">
          Create subjects that teachers can be assigned to. All subjects are stored in the database.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-400 mb-1">Subject Name *</label>
            <input
              type="text"
              value={subjectName}
              onChange={(e) => setSubjectName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !subjectSaving) {
                  handleAddSubject();
                }
              }}
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-cyan-500"
              placeholder="e.g., Mathematics, Physics, English Literature"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1">Code (Optional)</label>
            <input
              type="text"
              value={subjectCode}
              onChange={(e) => setSubjectCode(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !subjectSaving) {
                  handleAddSubject();
                }
              }}
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-cyan-500"
              placeholder="e.g., MATH, PHYS"
            />
          </div>
        </div>
        <button
          onClick={handleAddSubject}
          disabled={subjectSaving || !subjectName.trim()}
          className="mt-4 px-4 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors font-medium"
        >
          {subjectSaving ? 'Adding...' : 'Add Subject'}
        </button>
      </div>

      {/* Subjects List */}
      <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
        <div className="p-4 border-b border-gray-700">
          <h4 className="text-sm font-semibold text-gray-300">Active Subjects ({dbSubjects.length})</h4>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-750 border-b border-gray-700">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-400">Subject Name</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-400">Code</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-400">Created</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-400">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700">
              {dbSubjects.map((subject) => (
                <tr key={subject.id} className="hover:bg-gray-750">
                  {editingSubjectId === subject.id ? (
                    <>
                      <td className="px-4 py-3">
                        <input
                          type="text"
                          value={editingSubjectName}
                          onChange={(e) => setEditingSubjectName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSaveEditSubject();
                            if (e.key === 'Escape') handleCancelEditSubject();
                          }}
                          className="w-full px-2 py-1 bg-gray-700 border border-cyan-500 rounded text-white text-sm focus:outline-none"
                          autoFocus
                        />
                      </td>
                      <td className="px-4 py-3">
                        <input
                          type="text"
                          value={editingSubjectCode}
                          onChange={(e) => setEditingSubjectCode(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSaveEditSubject();
                            if (e.key === 'Escape') handleCancelEditSubject();
                          }}
                          className="w-full px-2 py-1 bg-gray-700 border border-gray-600 rounded text-white text-sm focus:outline-none focus:border-cyan-500"
                          placeholder="Code"
                        />
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500">
                        {new Date(subject.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3 text-right space-x-2">
                        <button
                          onClick={handleSaveEditSubject}
                          disabled={editingSubjectSaving || !editingSubjectName.trim()}
                          className="text-green-400 hover:text-green-300 text-sm font-medium disabled:opacity-50"
                        >
                          {editingSubjectSaving ? 'Saving...' : 'Save'}
                        </button>
                        <button
                          onClick={handleCancelEditSubject}
                          className="text-gray-400 hover:text-gray-300 text-sm"
                        >
                          Cancel
                        </button>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="px-4 py-3 text-sm text-gray-200 font-medium">📚 {subject.name}</td>
                      <td className="px-4 py-3 text-sm text-gray-400">{subject.code || '-'}</td>
                      <td className="px-4 py-3 text-sm text-gray-500">
                        {new Date(subject.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3 text-right space-x-2">
                        <button
                          onClick={() => handleStartEditSubject(subject)}
                          className="text-cyan-400 hover:text-cyan-300 text-sm font-medium"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDeleteSubject(subject.id, subject.name)}
                          className="text-red-400 hover:text-red-300 text-sm font-medium"
                        >
                          Delete
                        </button>
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {dbSubjects.length === 0 && (
          <div className="p-8 text-center text-gray-400">
            No subjects added yet. Add subjects to enable teacher assignments.
          </div>
        )}
      </div>
    </div>
  );
};

export default SubjectsTab;
