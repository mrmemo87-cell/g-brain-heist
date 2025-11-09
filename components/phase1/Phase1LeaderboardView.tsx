import React, { useEffect, useState } from 'react';
import type { Batch, Grade, LeaderboardEntry, Profile } from '../../types';
import {
  fetchBatchLeaderboard,
  fetchBatchSummaries,
  fetchGradeLeaderboard,
} from '../../services/competitionService';

interface Phase1LeaderboardViewProps {
  profile: Profile;
  onExit: () => void;
  addToast: (message: string, type?: 'success' | 'error' | 'info') => void;
}

const gradeTabs: Grade[] = [8, 9];
const classTabs: Batch[] = ['8A', '8B', '8C', '9A', '9B', '9C'];

const formatCsv = (rows: LeaderboardEntry[]): string => {
  const header = 'Rank,Username,XP,Coins,Streak,Batch,Grade';
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
  const [gradeLeaderboards, setGradeLeaderboards] = useState<Record<Grade, LeaderboardEntry[]>>({ 8: [], 9: [] });
  const [classLeaderboard, setClassLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [classSummaries, setClassSummaries] = useState<Record<Batch, { total_xp: number; player_count: number }>>({
    '8A': { total_xp: 0, player_count: 0 },
    '8B': { total_xp: 0, player_count: 0 },
    '8C': { total_xp: 0, player_count: 0 },
    '9A': { total_xp: 0, player_count: 0 },
    '9B': { total_xp: 0, player_count: 0 },
    '9C': { total_xp: 0, player_count: 0 },
  });
  const [activeGrade, setActiveGrade] = useState<Grade>(profile.grade === 9 ? 9 : 8);
  const [activeClass, setActiveClass] = useState<Batch>(
    profile.batch ?? (profile.grade === 9 ? '9A' : '8A')
  );
  const [loadingGrade, setLoadingGrade] = useState(false);
  const [loadingClass, setLoadingClass] = useState(false);

  useEffect(() => {
    const loadLeaderboards = async () => {
      setLoadingGrade(true);
      try {
        const [grade8, grade9] = await Promise.all([
          fetchGradeLeaderboard(8),
          fetchGradeLeaderboard(9),
        ]);
        setGradeLeaderboards({ 8: grade8, 9: grade9 });
      } catch (err: any) {
        addToast(err?.message || 'Failed to load grade leaderboards', 'error');
      } finally {
        setLoadingGrade(false);
      }
    };

    const loadSummaries = async () => {
      try {
        const summaries = await fetchBatchSummaries();
        setClassSummaries((prev) => {
          const next = { ...prev };
          summaries.forEach((entry) => {
            next[entry.batch] = {
              total_xp: entry.total_xp,
              player_count: entry.player_count,
            };
          });
          return next;
        });
      } catch (err: any) {
        addToast(err?.message || 'Failed to load class totals', 'error');
      }
    };

    loadLeaderboards();
    loadSummaries();
  }, [addToast]);

  useEffect(() => {
    const loadClassLeaderboard = async () => {
      setLoadingClass(true);
      try {
        const rows = await fetchBatchLeaderboard(activeClass);
        setClassLeaderboard(rows);
      } catch (err: any) {
        addToast(err?.message || 'Failed to load class leaderboard', 'error');
      } finally {
        setLoadingClass(false);
      }
    };

    loadClassLeaderboard();
  }, [activeClass, addToast]);

  const highlightId = profile.id;

  const renderLeaderboardRows = (rows: LeaderboardEntry[]) => (
    rows.map((entry, index) => {
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
    })
  );

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="font-heading text-3xl" style={{ color: 'var(--ion-blue)' }}>
            Silk Road Leaderboards
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
        <div className="card-glass p-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-heading text-2xl" style={{ color: 'var(--ion-blue)' }}>
              Grade Leaderboards
            </h3>
            <button
              onClick={() => downloadCsv(`grade-${activeGrade}-leaderboard.csv`, formatCsv(gradeLeaderboards[activeGrade]))}
              className="px-3 py-2 text-sm border border-cyan-500 text-cyan-300 rounded-lg hover:bg-cyan-500/10"
            >
              Export CSV
            </button>
          </div>

          <div className="flex gap-3 mb-4">
            {gradeTabs.map((grade) => (
              <button
                key={grade}
                onClick={() => setActiveGrade(grade)}
                className={`px-4 py-2 rounded-lg border transition ${
                  activeGrade === grade
                    ? 'border-cyan-500 bg-cyan-500/10 text-cyan-300'
                    : 'border-gray-700 text-gray-400 hover:border-cyan-400'
                }`}
              >
                Grade {grade}
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
                  {renderLeaderboardRows(gradeLeaderboards[activeGrade])}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="card-glass p-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-heading text-2xl" style={{ color: 'var(--ion-blue)' }}>
              Class Leaderboards
            </h3>
            <button
              onClick={() => downloadCsv(`class-${activeClass}-leaderboard.csv`, formatCsv(classLeaderboard))}
              className="px-3 py-2 text-sm border border-cyan-500 text-cyan-300 rounded-lg hover:bg-cyan-500/10"
            >
              Export CSV
            </button>
          </div>

          <div className="flex flex-wrap gap-2 mb-4">
            {classTabs.map((batch) => (
              <button
                key={batch}
                onClick={() => setActiveClass(batch)}
                className={`px-3 py-2 rounded-lg border text-sm transition ${
                  activeClass === batch
                    ? 'border-cyan-500 bg-cyan-500/10 text-cyan-300'
                    : 'border-gray-700 text-gray-400 hover:border-cyan-400'
                }`}
              >
                {batch}
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
                  </tr>
                </thead>
                <tbody>
                  {renderLeaderboardRows(classLeaderboard)}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <div className="card-glass p-6">
        <h3 className="font-heading text-2xl mb-4" style={{ color: 'var(--ion-blue)' }}>
          Class Totals
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {classTabs.map((batch) => {
            const summary = classSummaries[batch];
            return (
              <div key={batch} className="bg-black/30 border border-cyan-500/20 rounded-lg p-4">
                <div className="text-gray-400 text-sm">{batch}</div>
                <div className="text-2xl font-heading text-white">{summary.total_xp} XP</div>
                <div className="text-sm text-gray-500">{summary.player_count} players</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default Phase1LeaderboardView;
