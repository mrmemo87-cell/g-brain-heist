import React, { useEffect, useState } from 'react';
import type { Batch, LeaderboardEntry, Profile } from '../../types';
import {
  fetchBatchLeaderboard,
  fetchGradeLeaderboard,
  fetchSchoolGrades,
  fetchSchoolBatches,
  type SchoolGradeInfo,
  type SchoolBatchInfo,
} from '../../services/competitionService';

interface Phase1LeaderboardViewProps {
  profile: Profile;
  onExit: () => void;
  addToast: (message: string, type?: 'success' | 'error' | 'info') => void;
}

const formatCsv = (rows: LeaderboardEntry[]): string => {
  const header = 'Rank,Username,XP,Coins,Streak,Class,Grade';
  const body = rows
    .map((row, index) => [
      index + 1,
      row.username,
      row.xp,
      row.coins,
      row.streak,
      row.batch ?? '',
      row.grade,
    ].join(','))
    .join('\n');

  return `${header}\n${body}`;
};

const downloadCsv = (filename: string, content: string) => {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
};

const Phase1LeaderboardView: React.FC<Phase1LeaderboardViewProps> = ({ profile, onExit, addToast }) => {
  const displaySchoolName = profile.school_name || 'School';
  
  // Dynamic grades and batches from the school
  const [availableGrades, setAvailableGrades] = useState<SchoolGradeInfo[]>([]);
  const [availableBatches, setAvailableBatches] = useState<SchoolBatchInfo[]>([]);
  const [loadingStructure, setLoadingStructure] = useState(true);
  
  // Leaderboard data
  const [gradeLeaderboard, setGradeLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [classLeaderboard, setClassLeaderboard] = useState<LeaderboardEntry[]>([]);
  
  // Active selections - will be set after loading structure
  const [activeGrade, setActiveGrade] = useState<number | null>(null);
  const [activeClass, setActiveClass] = useState<string | null>(null);
  
  // Loading states
  const [loadingGrade, setLoadingGrade] = useState(false);
  const [loadingClass, setLoadingClass] = useState(false);

  // Load school structure (grades and batches) on mount
  useEffect(() => {
    const loadSchoolStructure = async () => {
      setLoadingStructure(true);
      try {
        const [grades, batches] = await Promise.all([
          fetchSchoolGrades(),
          fetchSchoolBatches(),
        ]);
        
        setAvailableGrades(grades);
        setAvailableBatches(batches);
        
        // Auto-select the user's grade/batch, or first available
        if (grades.length > 0) {
          const userGrade = grades.find(g => g.grade === profile.grade);
          setActiveGrade(userGrade ? userGrade.grade : grades[0].grade);
        }
        
        if (batches.length > 0) {
          const userBatch = batches.find(b => b.batch === profile.batch);
          setActiveClass(userBatch ? userBatch.batch : batches[0].batch);
        }
      } catch (err: any) {
        console.error('Failed to load school structure:', err);
        addToast('Failed to load school data', 'error');
      } finally {
        setLoadingStructure(false);
      }
    };

    loadSchoolStructure();
  }, [profile.grade, profile.batch, addToast]);

  // Load grade leaderboard when activeGrade changes
  useEffect(() => {
    if (activeGrade === null) return;
    
    const loadGradeLeaderboard = async () => {
      setLoadingGrade(true);
      try {
        const rows = await fetchGradeLeaderboard(activeGrade as any, 50);
        setGradeLeaderboard(rows);
      } catch (err: any) {
        console.error('Failed to load grade leaderboard:', err);
        // Don't show toast for RPC errors - just show empty
        setGradeLeaderboard([]);
      } finally {
        setLoadingGrade(false);
      }
    };

    loadGradeLeaderboard();
  }, [activeGrade]);

  // Load class leaderboard when activeClass changes
  useEffect(() => {
    if (activeClass === null) return;
    
    const loadClassLeaderboard = async () => {
      setLoadingClass(true);
      try {
        const rows = await fetchBatchLeaderboard(activeClass as Batch, 50);
        setClassLeaderboard(rows);
      } catch (err: any) {
        console.error('Failed to load class leaderboard:', err);
        setClassLeaderboard([]);
      } finally {
        setLoadingClass(false);
      }
    };

    loadClassLeaderboard();
  }, [activeClass]);

  const highlightId = profile.id;

  const renderLeaderboardRows = (rows: LeaderboardEntry[]) => {
    if (rows.length === 0) {
      return (
        <tr>
          <td colSpan={6} className="py-8 text-center text-gray-400">
            No students found in this category
          </td>
        </tr>
      );
    }
    
    return rows.map((entry, index) => {
      const isSelf = entry.user_id === highlightId;
      return (
        <tr
          key={entry.user_id}
          className={`border-b border-gray-800 ${isSelf ? 'bg-cyan-500/20' : ''}`}
        >
          <td className="py-2 px-3 text-gray-400">#{index + 1}</td>
          <td className="py-2 px-3 text-white font-semibold">{entry.username}</td>
          <td className="py-2 px-3 text-cyan-300">{entry.xp}</td>
          <td className="py-2 px-3 text-yellow-300">{entry.coins}</td>
          <td className="py-2 px-3 text-gray-200">{entry.streak}</td>
          <td className="py-2 px-3 text-gray-400">{entry.batch ?? '—'}</td>
        </tr>
      );
    });
  };

  // Show loading state while fetching school structure
  if (loadingStructure) {
    return (
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="font-heading text-3xl" style={{ color: 'var(--ion-blue)' }}>
              {displaySchoolName} Leaderboards
            </h2>
            <p className="text-gray-400">Loading school data...</p>
          </div>
          <button
            onClick={onExit}
            className="px-4 py-2 rounded-lg border border-gray-600 text-gray-300 hover:bg-gray-800 transition"
          >
            Back
          </button>
        </div>
        <div className="card-glass p-8 text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-cyan-400 mx-auto mb-4"></div>
          <p className="text-gray-300">Loading leaderboard data...</p>
        </div>
      </div>
    );
  }

  // Show empty state if no grades/batches found
  if (availableGrades.length === 0 && availableBatches.length === 0) {
    return (
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="font-heading text-3xl" style={{ color: 'var(--ion-blue)' }}>
              {displaySchoolName} Leaderboards
            </h2>
            <p className="text-gray-400">Track class and grade rankings for the competition.</p>
          </div>
          <button
            onClick={onExit}
            className="px-4 py-2 rounded-lg border border-gray-600 text-gray-300 hover:bg-gray-800 transition"
          >
            Back
          </button>
        </div>
        <div className="card-glass p-8 text-center">
          <p className="text-gray-300 text-lg">No students found in your school yet.</p>
          <p className="text-gray-500 mt-2">Students will appear here once they join and start playing.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="font-heading text-3xl" style={{ color: 'var(--ion-blue)' }}>
            {displaySchoolName} Leaderboards
          </h2>
          <p className="text-gray-400">Track class and grade rankings for the competition.</p>
        </div>
        <button
          onClick={onExit}
          className="px-4 py-2 rounded-lg border border-gray-600 text-gray-300 hover:bg-gray-800 transition"
        >
          Back
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Grade Leaderboards */}
        <div className="card-glass p-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-heading text-2xl" style={{ color: 'var(--ion-blue)' }}>
              Grade Leaderboards
            </h3>
            {activeGrade && gradeLeaderboard.length > 0 && (
              <button
                onClick={() => downloadCsv(`grade-${activeGrade}-leaderboard.csv`, formatCsv(gradeLeaderboard))}
                className="px-3 py-2 text-sm border border-cyan-500 text-cyan-300 rounded-lg hover:bg-cyan-500/10"
              >
                Export CSV
              </button>
            )}
          </div>

          {availableGrades.length > 0 ? (
            <>
              <div className="flex flex-wrap gap-2 mb-4">
                {availableGrades.map((gradeInfo) => (
                  <button
                    key={gradeInfo.grade}
                    onClick={() => setActiveGrade(gradeInfo.grade)}
                    className={`px-4 py-2 rounded-lg border transition ${
                      activeGrade === gradeInfo.grade
                        ? 'border-cyan-500 bg-cyan-500/10 text-cyan-300'
                        : 'border-gray-700 text-gray-400 hover:border-cyan-400'
                    }`}
                  >
                    Grade {gradeInfo.grade}
                    <span className="ml-1 text-xs opacity-70">({gradeInfo.player_count})</span>
                  </button>
                ))}
              </div>

              {loadingGrade ? (
                <div className="text-center py-6 text-gray-400">Loading grade leaderboard...</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="text-gray-400 text-sm uppercase">
                        <th className="py-2 px-3">Rank</th>
                        <th className="py-2 px-3">Agent</th>
                        <th className="py-2 px-3">XP</th>
                        <th className="py-2 px-3">Coins</th>
                        <th className="py-2 px-3">Streak</th>
                        <th className="py-2 px-3">Class</th>
                      </tr>
                    </thead>
                    <tbody>
                      {renderLeaderboardRows(gradeLeaderboard)}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-6 text-gray-400">No grades found in your school</div>
          )}
        </div>

        {/* Class Leaderboards */}
        <div className="card-glass p-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-heading text-2xl" style={{ color: 'var(--ion-blue)' }}>
              Class Leaderboards
            </h3>
            {activeClass && classLeaderboard.length > 0 && (
              <button
                onClick={() => downloadCsv(`class-${activeClass}-leaderboard.csv`, formatCsv(classLeaderboard))}
                className="px-3 py-2 text-sm border border-cyan-500 text-cyan-300 rounded-lg hover:bg-cyan-500/10"
              >
                Export CSV
              </button>
            )}
          </div>

          {availableBatches.length > 0 ? (
            <>
              <div className="flex flex-wrap gap-2 mb-4">
                {availableBatches.map((batchInfo) => (
                  <button
                    key={batchInfo.batch}
                    onClick={() => setActiveClass(batchInfo.batch)}
                    className={`px-3 py-2 rounded-lg border text-sm transition ${
                      activeClass === batchInfo.batch
                        ? 'border-cyan-500 bg-cyan-500/10 text-cyan-300'
                        : 'border-gray-700 text-gray-400 hover:border-cyan-400'
                    }`}
                  >
                    {batchInfo.batch}
                    <span className="ml-1 text-xs opacity-70">({batchInfo.player_count})</span>
                  </button>
                ))}
              </div>

              {loadingClass ? (
                <div className="text-center py-6 text-gray-400">Loading class leaderboard...</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="text-gray-400 text-sm uppercase">
                        <th className="py-2 px-3">Rank</th>
                        <th className="py-2 px-3">Agent</th>
                        <th className="py-2 px-3">XP</th>
                        <th className="py-2 px-3">Coins</th>
                        <th className="py-2 px-3">Streak</th>
                        <th className="py-2 px-3">Class</th>
                      </tr>
                    </thead>
                    <tbody>
                      {renderLeaderboardRows(classLeaderboard)}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-6 text-gray-400">No classes found in your school</div>
          )}
        </div>
      </div>

      {/* Class Totals */}
      {availableBatches.length > 0 && (
        <div className="card-glass p-6">
          <h3 className="font-heading text-2xl mb-4" style={{ color: 'var(--ion-blue)' }}>
            Class Totals
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {availableBatches.map((batchInfo) => (
              <div 
                key={batchInfo.batch} 
                className={`bg-black/30 border rounded-lg p-4 cursor-pointer transition hover:bg-black/50 ${
                  activeClass === batchInfo.batch ? 'border-cyan-500' : 'border-cyan-500/20'
                }`}
                onClick={() => setActiveClass(batchInfo.batch)}
              >
                <div className="text-gray-400 text-sm">{batchInfo.batch}</div>
                <div className="text-2xl font-heading text-white">{batchInfo.total_xp.toLocaleString()} XP</div>
                <div className="text-sm text-gray-500">{batchInfo.player_count} players</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default Phase1LeaderboardView;
