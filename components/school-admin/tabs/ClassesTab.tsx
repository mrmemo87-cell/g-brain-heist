import React from 'react';
import { useSchoolAdmin } from '../SchoolAdminContext';
import * as SchoolAdminService from '../../../services/schoolAdminService';

const ClassesTab: React.FC = () => {
  const {
    addToast, classForm, classSaving, classes, classesLoading, handleEditClass, handleSaveClass, loadAdminTools, school, setClassForm, setConfirmDialog, setConfirmReason,
  } = useSchoolAdmin();

  return (
    <div className="space-y-6">
      <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
        <h3 className="mb-4 text-lg font-semibold text-slate-900">{classForm.id ? 'Edit Class' : 'Create Class'}</h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1">Class Code</label>
            <input
              type="text"
              value={classForm.class_code}
              onChange={(e) => setClassForm((prev) => ({ ...prev, class_code: e.target.value }))}
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-cyan-500"
              placeholder="e.g. 9A"
            />
          </div>
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-400 mb-1">Class Name</label>
            <input
              type="text"
              value={classForm.class_name}
              onChange={(e) => setClassForm((prev) => ({ ...prev, class_name: e.target.value }))}
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-cyan-500"
              placeholder="e.g. Grade 9 Blue"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1">Grade Level</label>
            <input
              type="number"
              value={classForm.grade_level}
              onChange={(e) => setClassForm((prev) => ({ ...prev, grade_level: e.target.value }))}
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-cyan-500"
              placeholder="9"
            />
          </div>
        </div>
        <div className="flex items-center gap-4 mt-4">
          <label className="flex items-center gap-2 text-sm text-gray-300">
            <input
              type="checkbox"
              checked={classForm.is_active}
              onChange={(e) => setClassForm((prev) => ({ ...prev, is_active: e.target.checked }))}
              className="rounded border-gray-600 bg-gray-700 text-cyan-500 focus:ring-cyan-500"
            />
            Active
          </label>
          <button
            onClick={handleSaveClass}
            disabled={classSaving}
            className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 rounded-lg transition-colors font-medium"
          >
            {classSaving ? 'Saving...' : classForm.id ? 'Update Class' : 'Create Class'}
          </button>
          {classForm.id && (
            <button
              onClick={() => setClassForm({ id: '', class_code: '', class_name: '', grade_level: '', is_active: true })}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors text-sm"
            >
              Cancel Edit
            </button>
          )}
        </div>
      </div>

      <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
        <div className="p-4 border-b border-gray-700 flex items-center justify-between">
          <h4 className="text-sm font-semibold text-gray-300">Classes in School</h4>
          {classesLoading && <span className="text-xs text-gray-500">Refreshing...</span>}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-750 border-b border-gray-700">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-400">Code</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-400">Name</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-400">Grade</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-400">Status</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-400">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700">
              {classes.map((schoolClass) => (
                <tr key={schoolClass.id} className="hover:bg-gray-750">
                  <td className="px-4 py-3 text-sm text-white font-semibold">{schoolClass.class_code}</td>
                  <td className="px-4 py-3 text-sm text-gray-200">{schoolClass.class_name}</td>
                  <td className="px-4 py-3 text-sm text-gray-400">
                    {schoolClass.grade_level ? `Grade ${schoolClass.grade_level}` : '-'}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${schoolClass.is_active ? 'bg-green-500/20 text-green-300' : 'bg-gray-600/40 text-gray-300'}`}>
                      {schoolClass.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right space-x-2">
                    <button
                      onClick={() => handleEditClass(schoolClass)}
                      className="text-cyan-400 hover:text-cyan-300 text-sm"
                    >
                      Edit
                    </button>
                    {schoolClass.is_active && (
                      <button
                        onClick={() => {
                          setConfirmReason('');
                          setConfirmDialog({
                            title: 'Archive Class',
                            description: `Archive "${schoolClass.class_name}" (${schoolClass.class_code})? This will make it inactive. You can reactivate it later by editing.`,
                            confirmLabel: 'Archive',
                            cancelLabel: 'Cancel',
                            isDestructive: true,
                            onConfirm: async () => {
                              if (!school) return;
                              const result = await SchoolAdminService.archiveSchoolClass(school.id, schoolClass.id);
                              if (result.success) {
                                addToast('Class archived successfully', 'success');
                                await loadAdminTools(school.id);
                              } else {
                                addToast(`Failed to archive: ${result.error}`, 'error');
                              }
                            },
                          });
                        }}
                        className="text-amber-400 hover:text-amber-300 text-sm"
                      >
                        Archive
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {classes.length === 0 && (
          <div className="p-8 text-center text-gray-400">No classes created yet.</div>
        )}
      </div>
    </div>
  );
};

export default ClassesTab;
