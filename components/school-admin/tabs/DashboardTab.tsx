import React from 'react';
import { useSchoolAdmin } from '../SchoolAdminContext';

const DashboardTab: React.FC = () => {
  const {
    classes, members, school, setActiveTab, stats, students, teachers,
  } = useSchoolAdmin();

  return (
    <div className="space-y-8">
      {/* Premium Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-gray-800/80 backdrop-blur-sm rounded-2xl p-5 border border-cyan-500/30 hover:border-cyan-500/50 transition-all">
          <div className="flex items-center justify-between mb-2">
            <span className="text-3xl">🎓</span>
            <span className="text-xs text-cyan-400 bg-cyan-500/10 px-2 py-0.5 rounded-full">Active</span>
          </div>
          <div className="text-4xl font-bold text-cyan-400">{stats.students}</div>
          <div className="text-gray-400 text-sm mt-1">Students Enrolled</div>
        </div>

        <div className="bg-gray-800/80 backdrop-blur-sm rounded-2xl p-5 border border-blue-500/30 hover:border-blue-500/50 transition-all">
          <div className="flex items-center justify-between mb-2">
            <span className="text-3xl">👨‍🏫</span>
            <span className="text-xs text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded-full">Active</span>
          </div>
          <div className="text-4xl font-bold text-blue-400">{stats.teachers}</div>
          <div className="text-gray-400 text-sm mt-1">Teachers</div>
        </div>

        <div className="bg-gray-800/80 backdrop-blur-sm rounded-2xl p-5 border border-purple-500/30 hover:border-purple-500/50 transition-all">
          <div className="flex items-center justify-between mb-2">
            <span className="text-3xl">👑</span>
            <span className="text-xs text-purple-400 bg-purple-500/10 px-2 py-0.5 rounded-full">Admin</span>
          </div>
          <div className="text-4xl font-bold text-purple-400">{stats.admins}</div>
          <div className="text-gray-400 text-sm mt-1">School Admins</div>
        </div>

        <div className="bg-gray-800/80 backdrop-blur-sm rounded-2xl p-5 border border-green-500/30 hover:border-green-500/50 transition-all">
          <div className="flex items-center justify-between mb-2">
            <span className="text-3xl">🌟</span>
            <span className="text-xs text-green-400 bg-green-500/10 px-2 py-0.5 rounded-full">Total</span>
          </div>
          <div className="text-4xl font-bold text-green-400">{stats.total}</div>
          <div className="text-gray-400 text-sm mt-1">Total Members</div>
        </div>
      </div>

      {/* Quick Actions - Premium Style */}
      <div className="bg-gray-800/50 backdrop-blur-sm rounded-2xl p-6 border border-gray-700/50">
        <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
          <span className="text-2xl">⚡</span> Quick Actions
        </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <button
              onClick={() => setActiveTab('invites')}
              className="group relative overflow-hidden p-4 rounded-xl bg-gradient-to-br from-cyan-600/20 to-cyan-500/10 border border-cyan-500/30 hover:border-cyan-500/60 transition-all hover:scale-[1.02]"
            >
              <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/0 to-cyan-500/10 opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="relative flex items-center gap-3">
                <div className="text-3xl">🔑</div>
                <div className="text-left">
                  <div className="font-semibold text-white">Invite Code</div>
                  <div className="text-xs text-gray-400">Share school access</div>
                </div>
              </div>
            </button>

            <button
              onClick={() => setActiveTab('members')}
              className="group relative overflow-hidden p-4 rounded-xl bg-gradient-to-br from-purple-600/20 to-purple-500/10 border border-purple-500/30 hover:border-purple-500/60 transition-all hover:scale-[1.02]"
            >
              <div className="absolute inset-0 bg-gradient-to-r from-purple-500/0 to-purple-500/10 opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="relative flex items-center gap-3">
                <div className="text-3xl">👥</div>
                <div className="text-left">
                  <div className="font-semibold text-white">Manage Members</div>
                  <div className="text-xs text-gray-400">View & edit roles</div>
                </div>
              </div>
            </button>

            <button
              onClick={() => setActiveTab('classes')}
              className="group relative overflow-hidden p-4 rounded-xl bg-gradient-to-br from-blue-600/20 to-blue-500/10 border border-blue-500/30 hover:border-blue-500/60 transition-all hover:scale-[1.02]"
            >
              <div className="absolute inset-0 bg-gradient-to-r from-blue-500/0 to-blue-500/10 opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="relative flex items-center gap-3">
                <div className="text-3xl">🏫</div>
                <div className="text-left">
                  <div className="font-semibold text-white">Manage Classes</div>
                  <div className="text-xs text-gray-400">Create & organize</div>
                </div>
              </div>
            </button>
          </div>
      </div>

      {/* Power User Tips */}
      <div className="bg-gray-800/50 backdrop-blur-sm rounded-2xl p-6 border border-amber-500/30">
          <h3 className="text-lg font-bold mb-3 flex items-center gap-2">
            <span className="text-xl">💡</span> Admin Power Tips
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
            <div className="flex items-start gap-2 text-gray-300">
              <span className="text-amber-400">•</span>
              <span>Use <strong>Teacher Assignments</strong> to assign teachers to specific classes and subjects</span>
            </div>
            <div className="flex items-start gap-2 text-gray-300">
              <span className="text-amber-400">•</span>
              <span>Use <strong>Student Enrollment</strong> to move students between classes</span>
            </div>
            <div className="flex items-start gap-2 text-gray-300">
              <span className="text-amber-400">•</span>
              <span>Share the <strong>Invite Code</strong> to let new users join your school</span>
            </div>
            <div className="flex items-start gap-2 text-gray-300">
              <span className="text-amber-400">•</span>
              <span>Control signup permissions in <strong>Settings</strong> for security</span>
            </div>
          </div>
      </div>
    </div>
  );
};

export default DashboardTab;
