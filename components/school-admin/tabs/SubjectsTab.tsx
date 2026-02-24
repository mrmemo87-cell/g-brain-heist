import React from 'react';
import { useSchoolAdmin } from '../SchoolAdminContext';

const SubjectsTab: React.FC = () => {
  const {
    dbSubjects, editingSubjectCode, editingSubjectId, editingSubjectName, editingSubjectSaving, handleAddSubject, handleCancelEditSubject, handleDeleteSubject, handleSaveEditSubject, handleStartEditSubject, setEditingSubjectCode, setEditingSubjectName, setSubjectCode, setSubjectName, subjectCode, subjectName, subjectSaving, teachers,
  } = useSchoolAdmin();

  return (
    <div className="space-y-6">
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
