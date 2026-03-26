import React, { useRef, useEffect } from 'react';
import gsap from 'gsap';
import type { QuestMission, SoloDifficulty } from '../../types';
import { formatMissionTitleForDisplay } from './missionDisplay';

interface MissionPreviewProps {
  mission: QuestMission;
  onStart: () => void;
  onBack: () => void;
}

const NODE_ICONS: Record<string, string> = {
  start: '🚀', question: '❓', reward: '🎁',
  surprise: '✨', elite_question: '⚡', final_chest: '🏆',
};

const NODE_COLORS: Record<string, string> = {
  start: 'border-cyan-500/50',
  question: 'border-blue-500/50',
  reward: 'border-amber-500/50',
  surprise: 'border-fuchsia-500/50',
  elite_question: 'border-red-500/50',
  final_chest: 'border-yellow-500/50',
};

const DIFFICULTY_LABEL: Record<SoloDifficulty, { text: string; color: string }> = {
  easy: { text: 'Easy', color: 'text-green-400' },
  medium: { text: 'Medium', color: 'text-amber-400' },
  hard: { text: 'Hard', color: 'text-red-400' },
};

const MissionPreview: React.FC<MissionPreviewProps> = ({ mission, onStart, onBack }) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    gsap.fromTo(containerRef.current.children,
      { y: 20, opacity: 0 },
      { y: 0, opacity: 1, stagger: 0.06, duration: 0.4, ease: 'power2.out' }
    );
  }, []);

  const diff = DIFFICULTY_LABEL[mission.difficulty];
  const displayTitle = formatMissionTitleForDisplay(mission.title);

  return (
    <div ref={containerRef} className="max-w-lg mx-auto space-y-6">
      {/* Header */}
      <div className="card-glass rounded-2xl border border-cyan-400/20 p-6 space-y-4">
        <button onClick={onBack} className="text-slate-400 hover:text-white text-sm transition-colors">
          ← Back to missions
        </button>
        <div>
          <h2 className="text-2xl font-bold text-white">{displayTitle}</h2>
          {mission.description && (
            <p className="text-sm text-slate-300 mt-1">{mission.description}</p>
          )}
        </div>
        <div className="flex items-center gap-4 text-sm">
          <span className={`font-bold ${diff.color}`}>{diff.text}</span>
          <span className="text-slate-400">📍 {mission.route_template.length} nodes</span>
          <span className="text-slate-400">⏱ ~3-5 min</span>
        </div>
      </div>

      {/* Route Preview */}
      <div className="card-glass rounded-2xl border border-slate-700/50 p-5 space-y-4">
        <h3 className="text-sm font-bold text-slate-400 uppercase tracking-widest">Route Map</h3>
        <div className="space-y-0">
          {mission.route_template.map((node, i) => (
            <div key={i} className="flex items-center gap-4">
              {/* Connector line */}
              <div className="flex flex-col items-center w-10">
                <div className={`w-10 h-10 rounded-full border-2 flex items-center justify-center bg-slate-900/80 ${NODE_COLORS[node.type]}`}>
                  <span className="text-lg">{NODE_ICONS[node.type]}</span>
                </div>
                {i < mission.route_template.length - 1 && (
                  <div className="w-0.5 h-6 bg-slate-700/50" />
                )}
              </div>

              {/* Node info */}
              <div className="flex-1">
                <p className="text-sm text-white font-semibold">{node.label}</p>
                <p className="text-xs text-slate-400">
                  {node.type === 'question' && `Question (${node.difficulty ?? 'medium'})`}
                  {node.type === 'elite_question' && 'Elite Challenge (hard)'}
                  {node.type === 'reward' && 'Free reward cache'}
                  {node.type === 'surprise' && 'Mystery effect'}
                  {node.type === 'start' && 'Mission start'}
                  {node.type === 'final_chest' && 'Chest reward + bonuses'}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Reward Preview */}
      <div className="card-glass rounded-2xl border border-amber-500/20 p-5 space-y-3">
        <h3 className="text-sm font-bold text-amber-400 uppercase tracking-widest">Potential Rewards</h3>
        <div className="grid grid-cols-3 gap-3 text-center">
          <div className="p-3 rounded-lg bg-slate-800/60 border border-blue-500/20">
            <p className="text-xs text-slate-400">XP</p>
            <p className="font-bold text-blue-300">40-100+</p>
          </div>
          <div className="p-3 rounded-lg bg-slate-800/60 border border-amber-500/20">
            <p className="text-xs text-slate-400">Coins</p>
            <p className="font-bold text-amber-300">30-120+</p>
          </div>
          <div className="p-3 rounded-lg bg-slate-800/60 border border-yellow-500/20">
            <p className="text-xs text-slate-400">Chest</p>
            <p className="font-bold text-yellow-300">🏆</p>
          </div>
        </div>
        <p className="text-xs text-slate-400 text-center">
          💡 Higher streak = bigger chest bonus. Perfect run = gold chest.
        </p>
      </div>

      {/* Start / Resume Button */}
      <button
        onClick={onStart}
        className={`w-full py-4 rounded-2xl font-bold text-lg text-white hover:scale-[1.02] active:scale-95 transition-all shadow-lg ${
          mission.active_run_id
            ? 'bg-gradient-to-r from-amber-500 to-orange-500 shadow-amber-500/30'
            : 'bg-gradient-to-r from-cyan-500 to-blue-500 shadow-cyan-500/30 animate-pulse-glow'
        }`}
      >
        {mission.active_run_id ? '▶ Resume Mission' : '🚀 Start Mission'}
      </button>
    </div>
  );
};

export default MissionPreview;
