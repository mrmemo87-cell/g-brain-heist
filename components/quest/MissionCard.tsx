import React from 'react';
import type { QuestMission, SoloDifficulty } from '../../types';

interface MissionCardProps {
  mission: QuestMission;
  onSelect: (mission: QuestMission) => void;
}

const DIFFICULTY_BADGE: Record<SoloDifficulty, { text: string; color: string }> = {
  easy: { text: 'Easy', color: 'bg-green-500/20 text-green-300 border-green-500/40' },
  medium: { text: 'Medium', color: 'bg-amber-500/20 text-amber-300 border-amber-500/40' },
  hard: { text: 'Hard', color: 'bg-red-500/20 text-red-300 border-red-500/40' },
};

const TYPE_BADGE: Record<string, { label: string; color: string }> = {
  standard: { label: 'Standard', color: 'text-cyan-300' },
  risk: { label: 'Risk Run', color: 'text-red-300' },
  daily: { label: 'Daily', color: 'text-yellow-300' },
};

const CHEST_TIER_BADGE: Record<string, { icon: string; label: string; color: string }> = {
  gold: { icon: '🥇', label: 'Gold', color: 'text-yellow-300' },
  silver: { icon: '🥈', label: 'Silver', color: 'text-slate-300' },
  bronze: { icon: '🥉', label: 'Bronze', color: 'text-amber-600' },
};

type SubjectBadge = { type: 'emoji'; value: string } | { type: 'image'; src: string; alt: string };

const SUBJECT_BADGE: Record<string, SubjectBadge> = {
  Geography: { type: 'emoji', value: '🌍' },
  Science: { type: 'emoji', value: '🔬' },
  Maths: { type: 'emoji', value: '🧮' },
  Mathematics: { type: 'emoji', value: '🧮' },
  English: { type: 'image', src: '/visuals/UK-flag.png', alt: 'United Kingdom flag' },
  ICT: { type: 'emoji', value: '💻' },
  'Global Perspective': { type: 'emoji', value: '🌐' },
  'Russian Language': { type: 'emoji', value: '🇷🇺' },
  'German Language': { type: 'emoji', value: '🇩🇪' },
  'Kyrgyz Language': { type: 'emoji', value: '🇰🇬' },
  'Kyrgyz History': { type: 'emoji', value: '📜' },
};

const MissionCard: React.FC<MissionCardProps> = ({ mission, onSelect }) => {
  const diff = DIFFICULTY_BADGE[mission.difficulty];
  const mType = TYPE_BADGE[mission.mission_type] ?? TYPE_BADGE.standard;
  const nodeCount = mission.route_template.length;
  const bestRun = mission.best_run;
  const hasActiveRun = !!mission.active_run_id;
  const tierBadge = bestRun?.chest_tier ? CHEST_TIER_BADGE[bestRun.chest_tier] : null;
  const subjectBadge = SUBJECT_BADGE[mission.subject] ?? { type: 'emoji', value: '📚' as const };

  return (
    <button
      onClick={() => onSelect(mission)}
      className={`w-full text-left card-glass rounded-xl border p-4 space-y-3 hover:scale-[1.02] active:scale-[0.98] transition-all group ${
        hasActiveRun
          ? 'border-amber-400/40 hover:border-amber-400/70'
          : bestRun?.perfect_run
            ? 'border-yellow-400/30 hover:border-yellow-400/60'
            : 'border-cyan-400/20 hover:border-cyan-400/50'
      }`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {subjectBadge.type === 'image' ? (
            <img
              src={subjectBadge.src}
              alt={subjectBadge.alt}
              className="h-5 w-5 rounded-sm object-cover"
              loading="lazy"
            />
          ) : (
            <span className="text-lg">{subjectBadge.value}</span>
          )}
          <h3 className="font-bold text-white text-lg group-hover:text-cyan-200 transition-colors">
            {mission.title}
          </h3>
        </div>
        <div className="flex items-center gap-2">
          {hasActiveRun && (
            <span className="text-[10px] font-bold uppercase tracking-widest text-amber-300 animate-pulse">
              ▶ In Progress
            </span>
          )}
          {tierBadge && !hasActiveRun && (
            <span className={`text-sm ${tierBadge.color}`} title={`Best: ${tierBadge.label}`}>
              {tierBadge.icon}
            </span>
          )}
          <span className={`text-[10px] font-bold uppercase tracking-widest ${mType.color}`}>
            {mType.label}
          </span>
        </div>
      </div>

      {mission.description && (
        <p className="text-sm text-slate-300 leading-relaxed">{mission.description}</p>
      )}

      <div className="flex items-center gap-3 flex-wrap">
        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${diff.color}`}>
          {diff.text}
        </span>
        <span className="text-xs text-slate-400">
          📍 {nodeCount} nodes
        </span>
        <span className="text-xs text-slate-400">
          ⏱ ~3-5 min
        </span>
        {bestRun && (
          <span className="text-xs text-cyan-400">
            ⭐ Best: {bestRun.rewards_xp} XP
          </span>
        )}
        {!bestRun && (
          <span className="text-xs text-slate-400">
            🏆 Final Chest
          </span>
        )}
      </div>

      {/* Mini route preview */}
      <div className="flex items-center gap-1.5 pt-1">
        {mission.route_template.map((node, i) => {
          const icons: Record<string, string> = {
            start: '🚀', question: '❓', reward: '🎁',
            surprise: '✨', elite_question: '⚡', final_chest: '🏆',
          };
          return (
            <React.Fragment key={i}>
              <span className="text-sm opacity-70">{icons[node.type] ?? '•'}</span>
              {i < mission.route_template.length - 1 && (
                <span className="text-[8px] text-slate-600">─</span>
              )}
            </React.Fragment>
          );
        })}
      </div>

      {/* Perfect run indicator */}
      {bestRun?.perfect_run && (
        <div className="text-[10px] text-yellow-300/80 font-semibold tracking-wide">
          ✨ PERFECT RUN ACHIEVED
        </div>
      )}
    </button>
  );
};

export default MissionCard;
