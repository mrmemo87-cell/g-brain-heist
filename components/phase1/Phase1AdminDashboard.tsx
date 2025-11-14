import React, { useEffect, useState } from 'react';
import type {
  AdminOverviewStats,
  Batch,
  Grade,
  LeaderboardEntry,
  Profile,
} from '../../types';
import {
  fetchAdminOverviewStats,
  fetchBatchLeaderboard,
  fetchGradeLeaderboard,
  fetchQuestionBank,
  fetchQuestionCountsByGrade,
  fetchBatchSummaries,
  searchPlayers,
  grantPlayerRewards,
  resetPlayerProgress,
  setPlayerBanned,
  fetchPlayerLastAttempt,
  postAnnouncement,
  updateQuestionActiveState,
} from '../../services/competitionService';

interface Phase1AdminDashboardProps {
  profile: Profile;
  onExit: () => void;
  addToast: (message: string, type?: 'success' | 'error' | 'info') => void;
}

type PlayerSearchResult = {
  id: string;
  username: string;
  grade: Grade | null;
  batch: Batch | null;
  xp: number;
  coins: number;
  gemstones?: number;
  streak: number;
  updated_at: string;
  is_banned?: boolean;
};

type QuestionRow = {
  id: number;
  grade: Grade;
  difficulty: string | null;
  active: boolean;
  stem: string;
  lang: string;
};

const classList: Batch[] = ['8A', '8B', '8C', '9A', '9B', '9C'];
const grades: Grade[] = [8, 9];

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

const Phase1AdminDashboard: React.FC<Phase1AdminDashboardProps> = ({ profile, onExit, addToast }) => {
  const [overview, setOverview] = useState<AdminOverviewStats | null>(null);
  const [gradeBoards, setGradeBoards] = useState<Record<Grade, LeaderboardEntry[]>>({ 8: [], 9: [] });
  const [classBoards, setClassBoards] = useState<Record<Batch, LeaderboardEntry[]>>({
    '8A': [],
    '8B': [],
    '8C': [],
    '9A': [],
    '9B': [],
    '9C': [],
  });
  const [classSummaries, setClassSummaries] = useState<Record<Batch, { total_xp: number; player_count: number }>>({
    '8A': { total_xp: 0, player_count: 0 },
    '8B': { total_xp: 0, player_count: 0 },
    '8C': { total_xp: 0, player_count: 0 },
    '9A': { total_xp: 0, player_count: 0 },
    '9B': { total_xp: 0, player_count: 0 },
    '9C': { total_xp: 0, player_count: 0 },
  });
  const [questionCounts, setQuestionCounts] = useState<Array<{ grade: Grade; total: number; active: number; difficulty: Record<string, number> }>>([]);
  const [questionBank, setQuestionBank] = useState<QuestionRow[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<PlayerSearchResult[]>([]);
  const [selectedPlayer, setSelectedPlayer] = useState<PlayerSearchResult | null>(null);
  const [selectedPlayerLastAttempt, setSelectedPlayerLastAttempt] = useState<string | null>(null);
  const [grantXp, setGrantXp] = useState(20);
  const [grantCoins, setGrantCoins] = useState(10);
  const [broadcastText, setBroadcastText] = useState('');
  const [loading, setLoading] = useState(false);
  const [questionLoading, setQuestionLoading] = useState(false);

  const refreshOverview = async () => {
    try {
      const stats = await fetchAdminOverviewStats();
      setOverview(stats);
    } catch (err: any) {
      addToast(err?.message || 'Failed to load overview', 'error');
    }
  };

  const refreshLeaderboards = async () => {
    try {
        <div className="p-4 bg-gradient-to-br from-emerald-700/20 to-emerald-900/10 rounded-lg border border-emerald-400/30">
          <p className="text-sm text-gray-300">Total Gemstones</p>
          <div className="text-3xl font-heading text-white">{overview?.total_gemstones ?? 0}</div>
        </div>
      const [grade8, grade9, classData] = await Promise.all([
        fetchGradeLeaderboard(8),
        fetchGradeLeaderboard(9),
        Promise.all(classList.map((batch) => fetchBatchLeaderboard(batch))),
      ]);

      setGradeBoards({ 8: grade8, 9: grade9 });

      const updatedClasses: Record<Batch, LeaderboardEntry[]> = {
        '8A': classData[0] ?? [],
        '8B': classData[1] ?? [],
        '8C': classData[2] ?? [],
        '9A': classData[3] ?? [],
        '9B': classData[4] ?? [],
        '9C': classData[5] ?? [],
      };
      setClassBoards(updatedClasses);
    } catch (err: any) {
      addToast(err?.message || 'Failed to load leaderboards', 'error');
    }
  };

  const refreshSummaries = async () => {
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

  const refreshQuestions = async () => {
    setQuestionLoading(true);
    try {
      const [counts, bank] = await Promise.all([
        fetchQuestionCountsByGrade(),
        fetchQuestionBank(),
      ]);
      setQuestionCounts(counts);
      setQuestionBank((bank as any[]).map((row) => ({
        id: row.id,
        grade: Number(row.grade) as Grade,
        difficulty: row.difficulty ?? null,
        active: !!row.active,
        stem: row.stem,
        lang: row.lang ?? 'ru',
      })));
    } catch (err: any) {
      addToast(err?.message || 'Failed to load question bank', 'error');
    } finally {
      setQuestionLoading(false);
    }
  };

  useEffect(() => {
    refreshOverview();
    refreshLeaderboards();
    refreshSummaries();
    refreshQuestions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchTerm.trim()) {
      setSearchResults([]);
      return;
    }
    setLoading(true);
    try {
      const results = await searchPlayers(searchTerm.trim());
      setSearchResults(results as PlayerSearchResult[]);
    } catch (err: any) {
      addToast(err?.message || 'Failed to search players', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectPlayer = async (player: PlayerSearchResult) => {
    setSelectedPlayer(player);
    try {
      const lastAttempt = await fetchPlayerLastAttempt(player.id);
      setSelectedPlayerLastAttempt(lastAttempt);
    } catch (err: any) {
      addToast(err?.message || 'Failed to load attempt history', 'error');
    }
  };

  const handleGrant = async () => {
    if (!selectedPlayer) return;
    setLoading(true);
    try {
      await grantPlayerRewards(selectedPlayer.id, grantXp, grantCoins);
      addToast('Rewards granted successfully', 'success');
      await refreshOverview();
      await refreshLeaderboards();
      await refreshSummaries();
    } catch (err: any) {
      addToast(err?.message || 'Failed to grant rewards', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async () => {
    if (!selectedPlayer) return;
    setLoading(true);
    try {
      await resetPlayerProgress(selectedPlayer.id);
      addToast('Player progress reset', 'success');
      await refreshOverview();
      await refreshLeaderboards();
      await refreshSummaries();
    } catch (err: any) {
      addToast(err?.message || 'Failed to reset player', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleBanToggle = async (isBanned: boolean) => {
    if (!selectedPlayer) return;
    setLoading(true);
    try {
      const newStatus = await setPlayerBanned(selectedPlayer.id, isBanned);
      addToast(newStatus ? 'Player banned' : 'Player unbanned', 'success');
      setSelectedPlayer(prev => (prev ? { ...prev, is_banned: newStatus } : prev));
      await refreshOverview();
    } catch (err: any) {
      addToast(err?.message || 'Failed to update ban status', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleBroadcast = async () => {
    if (!broadcastText.trim()) {
      addToast('Enter a message before broadcasting', 'info');
      return;
    }

    setLoading(true);
    try {
      await postAnnouncement(broadcastText.trim());
      addToast('Broadcast sent to all students', 'success');
      setBroadcastText('');
    } catch (err: any) {
      addToast(err?.message || 'Failed to send broadcast', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleQuestion = async (question: QuestionRow) => {
    setQuestionLoading(true);
    try {
      await updateQuestionActiveState(question.id, !question.active);
      addToast('Question updated', 'success');
      await refreshQuestions();
    } catch (err: any) {
      addToast(err?.message || 'Failed to update question', 'error');
    } finally {
      setQuestionLoading(false);
    }
  };

  const renderOverview = () => (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
      <div className="card-glass p-4 border border-cyan-500/30">
        <div className="text-gray-400 text-sm">Players Today</div>
        <div className="text-3xl font-heading text-white">{overview?.players_today ?? 0}</div>
      </div>
      <div className="card-glass p-4 border border-cyan-500/30">
        <div className="text-gray-400 text-sm">Attempts (5 min)</div>
        <div className="text-3xl font-heading text-white">{overview?.attempts_last_five_minutes ?? 0}</div>
      </div>
      <div className="card-glass p-4 border border-cyan-500/30">
        <div className="text-gray-400 text-sm">Top Class</div>
        <div className="text-2xl font-heading text-white">{overview?.top_batch ?? '—'}</div>
        <div className="text-sm text-gray-500">{overview?.top_batch_total_xp ?? 0} XP</div>
      </div>
      <div className="card-glass p-4 border border-cyan-500/30">
        <div className="text-gray-400 text-sm">System Status</div>
        <div className="text-sm text-white">
          {overview?.last_error_message
            ? `⚠️ ${overview.last_error_message}`
            : '✅ OK'}
        </div>
        {overview?.last_error_at && (
          <div className="text-xs text-gray-500">Last error: {new Date(overview.last_error_at).toLocaleString()}</div>
        )}
      </div>
    </div>
  );

  const renderLeaderboardSection = () => (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="card-glass p-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-heading text-2xl" style={{ color: 'var(--ion-blue)' }}>Grade Leaderboards</h3>
          <div className="flex gap-2">
            {grades.map((grade) => (
              <button
                key={grade}
                onClick={() => downloadCsv(`admin-grade-${grade}.csv`, formatCsv(gradeBoards[grade]))}
                className="px-3 py-2 text-sm border border-cyan-500 text-cyan-300 rounded-lg hover:bg-cyan-500/10"
              >
                Export G{grade}
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-1 gap-4">
          {grades.map((grade) => (
            <div key={grade} className="bg-black/30 border border-cyan-500/20 rounded-lg">
              <div className="px-4 py-2 border-b border-cyan-500/10 text-gray-300">Grade {grade}</div>
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="text-gray-400 text-xs uppercase">
                      <th className="py-2 px-3">Rank</th>
                      <th className="py-2 px-3">Agent</th>
                      <th className="py-2 px-3">XP</th>
                      <th className="py-2 px-3">Coins</th>
                      <th className="py-2 px-3">Streak</th>
                      <th className="py-2 px-3">Class</th>
                    </tr>
                  </thead>
                  <tbody>
                    {gradeBoards[grade].map((entry, index) => (
                      <tr key={entry.user_id} className="border-b border-gray-900">
                        <td className="py-2 px-3 text-gray-500">#{index + 1}</td>
                        <td className="py-2 px-3 text-white font-semibold">{entry.username}</td>
                        <td className="py-2 px-3 text-cyan-300">{entry.xp}</td>
                        <td className="py-2 px-3 text-yellow-300">{entry.coins}</td>
                        <td className="py-2 px-3 text-gray-200">{entry.streak}</td>
                        <td className="py-2 px-3 text-gray-400">{entry.batch ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="card-glass p-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-heading text-2xl" style={{ color: 'var(--ion-blue)' }}>Class vs Class Totals</h3>
          <button
            onClick={() => downloadCsv('admin-class-summary.csv', formatCsv(classList.flatMap((batch) => classBoards[batch])))}
            className="px-3 py-2 text-sm border border-cyan-500 text-cyan-300 rounded-lg hover:bg-cyan-500/10"
          >
            Export All
          </button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {classList.map((batch) => (
            <div key={batch} className="bg-black/30 border border-cyan-500/20 rounded-lg p-4">
              <div className="text-gray-400 text-sm">{batch}</div>
              <div className="text-2xl font-heading text-white">{classSummaries[batch].total_xp} XP</div>
              <div className="text-sm text-gray-500">{classSummaries[batch].player_count} agents</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  const renderPlayerManagement = () => (
    <div className="card-glass p-6">
      <h3 className="font-heading text-2xl mb-4" style={{ color: 'var(--ion-blue)' }}>Player Management</h3>
      <form onSubmit={handleSearch} className="flex flex-col md:flex-row gap-3 mb-4">
        <input
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Search by username"
          className="flex-1 bg-black/40 border border-gray-700 rounded-lg px-3 py-2 text-white"
        />
        <button
          type="submit"
          className="px-4 py-2 rounded-lg border border-cyan-500 text-cyan-300 hover:bg-cyan-500/10"
        >
          Search
        </button>
      </form>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="space-y-3 max-h-72 overflow-y-auto pr-2">
          {searchResults.map((player) => (
            <button
              key={player.id}
              onClick={() => handleSelectPlayer(player)}
              className={`w-full text-left p-3 rounded-lg border transition ${
                selectedPlayer?.id === player.id
                  ? 'border-cyan-500 bg-cyan-500/10 text-cyan-300'
                  : 'border-gray-700 text-gray-200 hover:border-cyan-400'
              }`}
            >
              <div className="font-semibold">{player.username}</div>
              <div className="text-xs text-gray-400">
                Grade {player.grade ?? '—'} • {player.batch ?? '—'} • XP {player.xp} • Coins {player.coins}
              </div>
              {player.is_banned && <div className="text-xs text-danger-red">🚫 Banned</div>}
            </button>
          ))}
          {searchResults.length === 0 && (
            <div className="text-gray-500 text-sm">No players loaded yet. Search above to view agents.</div>
          )}
        </div>

        <div className="bg-black/20 border border-cyan-500/20 rounded-lg p-4">
          {selectedPlayer ? (
            <div className="space-y-4">
              <div>
                <div className="text-gray-400 text-sm">Selected Agent</div>
                <div className="text-xl font-heading text-white">{selectedPlayer.username}</div>
                <div className="text-xs text-gray-500">
                  Grade {selectedPlayer.grade ?? '—'} • {selectedPlayer.batch ?? '—'}
                </div>
                <div className="text-xs text-gray-500">
                  Last seen {new Date(selectedPlayer.updated_at).toLocaleString()}
                </div>
                <div className="text-xs text-gray-500">
                  Last attempt {selectedPlayerLastAttempt ? new Date(selectedPlayerLastAttempt).toLocaleString() : '—'}
                </div>
                {selectedPlayer.is_banned && <div className="text-xs text-danger-red">🚫 Currently banned</div>}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="bg-black/30 rounded-lg p-3 border border-cyan-500/20">
                  <div className="text-gray-400 text-xs">XP</div>
                  <div className="text-xl text-cyan-300">{selectedPlayer.xp}</div>
                </div>
                <div className="bg-black/30 rounded-lg p-3 border border-cyan-500/20">
                  <div className="text-gray-400 text-xs">Coins</div>
                  <div className="text-xl text-yellow-300">{selectedPlayer.coins}</div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col text-sm text-gray-300">
                  Grant XP
                  <input
                    type="number"
                    value={grantXp}
                    onChange={(e) => setGrantXp(Number(e.target.value))}
                    className="mt-1 bg-black/40 border border-gray-700 rounded-lg px-3 py-2 text-white"
                  />
                </label>
                <label className="flex flex-col text-sm text-gray-300">
                  Grant Coins
                  <input
                    type="number"
                    value={grantCoins}
                    onChange={(e) => setGrantCoins(Number(e.target.value))}
                    className="mt-1 bg-black/40 border border-gray-700 rounded-lg px-3 py-2 text-white"
                  />
                </label>
              </div>

              <div className="flex flex-wrap gap-3">
                <button
                  onClick={handleGrant}
                  className="px-4 py-2 rounded-lg border border-cyan-500 text-cyan-300 hover:bg-cyan-500/10"
                  disabled={loading}
                >
                  Add XP/Coins
                </button>
                <button
                  onClick={handleReset}
                  className="px-4 py-2 rounded-lg border border-yellow-500 text-yellow-300 hover:bg-yellow-500/10"
                  disabled={loading}
                >
                  Reset Progress
                </button>
                <button
                  onClick={() => handleBanToggle(!(selectedPlayer.is_banned ?? false))}
                  className={`px-4 py-2 rounded-lg border ${selectedPlayer.is_banned ? 'border-green-500 text-green-300 hover:bg-green-500/10' : 'border-red-500 text-red-300 hover:bg-red-500/10'}`}
                  disabled={loading}
                >
                  {selectedPlayer.is_banned ? 'Unban' : 'Ban'} Player
                </button>
              </div>
            </div>
          ) : (
            <div className="text-gray-500 text-sm">Select a player to manage their stats.</div>
          )}
        </div>
      </div>
    </div>
  );

  const renderQuestionBank = () => (
    <div className="card-glass p-6">
      <div className="flex justify-between items-center mb-4">
        <h3 className="font-heading text-2xl" style={{ color: 'var(--ion-blue)' }}>Question Bank</h3>
        <button
          onClick={refreshQuestions}
          className="px-3 py-2 rounded-lg border border-cyan-500 text-cyan-300 hover:bg-cyan-500/10"
        >
          Refresh
        </button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        {questionCounts.map((entry) => (
          <div key={entry.grade} className="bg-black/30 border border-cyan-500/20 rounded-lg p-4">
            <div className="text-gray-400 text-sm">Grade {entry.grade}</div>
            <div className="text-2xl font-heading text-white">{entry.active} / {entry.total} Active</div>
            <div className="text-xs text-gray-500 mt-2">
              {Object.entries(entry.difficulty).map(([diff, count]) => (
                <span key={diff} className="mr-2">{diff}: {count}</span>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="text-gray-400 text-xs uppercase">
              <th className="py-2 px-3">ID</th>
              <th className="py-2 px-3">Grade</th>
              <th className="py-2 px-3">Difficulty</th>
              <th className="py-2 px-3">Language</th>
              <th className="py-2 px-3">Status</th>
              <th className="py-2 px-3">Stem</th>
              <th className="py-2 px-3">Action</th>
            </tr>
          </thead>
          <tbody>
            {questionBank.map((question) => (
              <tr key={question.id} className="border-b border-gray-900">
                <td className="py-2 px-3 text-gray-500">{question.id}</td>
                <td className="py-2 px-3 text-gray-300">{question.grade}</td>
                <td className="py-2 px-3 text-gray-300">{question.difficulty ?? '—'}</td>
                <td className="py-2 px-3 text-gray-300">{question.lang}</td>
                <td className={`py-2 px-3 ${question.active ? 'text-green-300' : 'text-red-300'}`}>
                  {question.active ? 'Active' : 'Inactive'}
                </td>
                <td className="py-2 px-3 text-gray-400 truncate max-w-sm">{question.stem}</td>
                <td className="py-2 px-3">
                  <button
                    onClick={() => handleToggleQuestion(question)}
                    className={`px-3 py-2 text-sm rounded-lg border ${question.active ? 'border-red-500 text-red-300 hover:bg-red-500/10' : 'border-green-500 text-green-300 hover:bg-green-500/10'}`}
                    disabled={questionLoading}
                  >
                    {question.active ? 'Deactivate' : 'Activate'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  const renderBroadcast = () => (
    <div className="card-glass p-6">
      <h3 className="font-heading text-2xl mb-4" style={{ color: 'var(--ion-blue)' }}>Broadcast Message</h3>
      <textarea
        value={broadcastText}
        onChange={(e) => setBroadcastText(e.target.value)}
        placeholder="Enter a short announcement for all students..."
        className="w-full h-32 bg-black/40 border border-gray-700 rounded-lg px-3 py-2 text-white"
      />
      <div className="mt-3 flex justify-end">
        <button
          onClick={handleBroadcast}
          className="px-4 py-2 rounded-lg border border-cyan-500 text-cyan-300 hover:bg-cyan-500/10"
          disabled={loading}
        >
          Send Broadcast
        </button>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="font-heading text-3xl" style={{ color: 'var(--ion-blue)' }}>Admin Command Center</h2>
          <p className="text-gray-400">Monitoring Silk Road competition for grades 8 & 9.</p>
        </div>
        <button
          onClick={onExit}
          className="px-4 py-2 rounded-lg border border-gray-600 text-gray-300 hover:bg-gray-800 transition"
        >
          Exit
        </button>
      </div>

      {renderOverview()}
      {renderLeaderboardSection()}
      {renderPlayerManagement()}
      {renderQuestionBank()}
      {renderBroadcast()}
    </div>
  );
};

export default Phase1AdminDashboard;
