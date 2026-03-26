import React, { useRef } from 'react';
import gsap from 'gsap';
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
  const cardRef = useRef<HTMLButtonElement>(null);
  const glowRef = useRef<HTMLDivElement>(null);
  const badgeRowRef = useRef<HTMLDivElement>(null);

  const diff = DIFFICULTY_BADGE[mission.difficulty];
  const mType = TYPE_BADGE[mission.mission_type] ?? TYPE_BADGE.standard;
  const nodeCount = mission.route_template.length;
  const bestRun = mission.best_run;
  const hasActiveRun = !!mission.active_run_id;
  const tierBadge = bestRun?.chest_tier ? CHEST_TIER_BADGE[bestRun.chest_tier] : null;
  const subjectBadge = SUBJECT_BADGE[mission.subject] ?? { type: 'emoji', value: '📚' as const };
  const cardTone = hasActiveRun
    ? 'from-amber-600/25 via-cyan-900/35 to-slate-950'
    : bestRun?.perfect_run
      ? 'from-yellow-500/20 via-cyan-900/40 to-slate-950'
      : 'from-cyan-500/15 via-blue-900/35 to-slate-950';
  const objectiveText = mission.description?.trim() || 'Clear the route, keep your streak alive, and claim the final chest.';
  const ctaLabel = hasActiveRun ? '▶ Continue Mission' : '🚀 Start Mission';

  const handleHoverIn = () => {
    if (!cardRef.current) return;
    gsap.killTweensOf([cardRef.current, glowRef.current, badgeRowRef.current]);
    gsap.to(cardRef.current, {
      y: -6,
      scale: 1.02,
      rotateX: 4,
      rotateY: -3,
      boxShadow: '0 18px 38px rgba(8,145,178,0.32)',
      duration: 0.28,
      ease: 'power2.out',
      transformPerspective: 1000,
      transformOrigin: 'center',
    });
    if (glowRef.current) {
      gsap.to(glowRef.current, { opacity: 1, duration: 0.25, ease: 'power2.out' });
    }
    if (badgeRowRef.current) {
      gsap.to(badgeRowRef.current.children, {
        y: -3,
        stagger: 0.04,
        duration: 0.2,
        ease: 'power2.out',
      });
    }
  };

  const handleHoverOut = () => {
    if (!cardRef.current) return;
    gsap.killTweensOf([cardRef.current, glowRef.current, badgeRowRef.current]);
    gsap.to(cardRef.current, {
      y: 0,
      scale: 1,
      rotateX: 0,
      rotateY: 0,
      boxShadow: '0 0 0 rgba(0,0,0,0)',
      duration: 0.26,
      ease: 'power2.out',
    });
    if (glowRef.current) {
      gsap.to(glowRef.current, { opacity: 0, duration: 0.22, ease: 'power2.out' });
    }
    if (badgeRowRef.current) {
      gsap.to(badgeRowRef.current.children, { y: 0, duration: 0.18, ease: 'power2.out' });
    }
  };

  const handleSelect = () => {
    if (!cardRef.current) {
      onSelect(mission);
      return;
    }
    gsap.killTweensOf(cardRef.current);
    gsap.timeline({
      onComplete: () => onSelect(mission),
    })
      .to(cardRef.current, { scale: 0.96, duration: 0.09, ease: 'power2.out' })
      .to(cardRef.current, {
        scale: 1.03,
        y: -2,
        boxShadow: '0 0 30px rgba(14, 165, 233, 0.55)',
        duration: 0.14,
        ease: 'back.out(2.4)',
      })
      .to(cardRef.current, { scale: 1, y: 0, duration: 0.12, ease: 'power1.out' });
  };

  return (
    <button
      ref={cardRef}
      onClick={handleSelect}
      onMouseEnter={handleHoverIn}
      onMouseLeave={handleHoverOut}
      onBlur={handleHoverOut}
      className={`relative w-full text-left rounded-2xl border overflow-hidden group will-change-transform ${
        hasActiveRun
          ? 'border-amber-400/45'
          : bestRun?.perfect_run
            ? 'border-yellow-400/35'
            : 'border-cyan-400/30'
      } focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70`}
    >
      <div className={`relative h-[22rem] bg-gradient-to-br ${cardTone}`}>
        <img
          src="/visuals/QUESTCARDMAINFRAME.svg"
          alt=""
          className="absolute inset-0 h-full w-full object-cover opacity-90 pointer-events-none select-none"
          loading="lazy"
        />
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ background: 'linear-gradient(180deg, rgba(2,6,23,0.18) 0%, rgba(2,6,23,0.08) 35%, rgba(2,6,23,0.65) 70%, rgba(2,6,23,0.94) 100%)' }}
        />
        <div
          ref={glowRef}
          className="absolute inset-0 opacity-0 pointer-events-none"
          style={{ background: 'radial-gradient(circle at 50% 40%, rgba(34,211,238,.25), rgba(2,6,23,0) 70%)' }}
        />

        <div className="absolute inset-0 p-3 sm:p-4 flex flex-col justify-between">
          <div className="flex items-start justify-between gap-2">
            <div ref={badgeRowRef} className="flex flex-wrap items-center gap-2">
              <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border backdrop-blur-sm ${diff.color}`}>
                {diff.text.toUpperCase()}
              </span>
              <span className={`text-[10px] font-bold uppercase tracking-widest ${mType.color}`}>
                {mType.label}
              </span>
            </div>
            {hasActiveRun ? (
              <span className="text-[10px] font-bold uppercase tracking-widest text-amber-200 bg-amber-500/20 border border-amber-300/40 px-2 py-1 rounded-full">
                ▶ Resume
              </span>
            ) : tierBadge ? (
              <span className={`text-sm ${tierBadge.color} bg-slate-950/65 px-2 py-1 rounded-full border border-white/10`} title={`Best: ${tierBadge.label}`}>
                {tierBadge.icon} {tierBadge.label}
              </span>
            ) : null}
          </div>

          <div className="flex flex-col items-center justify-center gap-3">
            <div className="h-20 w-20 rounded-full bg-slate-950/70 border border-cyan-300/35 shadow-[0_0_24px_rgba(34,211,238,0.35)] flex items-center justify-center">
              {subjectBadge.type === 'image' ? (
                <img
                  src={subjectBadge.src}
                  alt={subjectBadge.alt}
                  className="h-12 w-12 rounded-full object-cover"
                  loading="lazy"
                />
              ) : (
                <span className="text-4xl leading-none">{subjectBadge.value}</span>
              )}
            </div>
            <span className="px-3 py-1 rounded-full border border-cyan-400/25 bg-cyan-950/40 text-[10px] uppercase tracking-[0.2em] text-cyan-100/90">
              Mission Objective
            </span>
            <p className="max-w-[88%] text-center text-xs sm:text-sm text-slate-200/90 line-clamp-2">
              {objectiveText}
            </p>
          </div>

          <div className="space-y-2">
            <h3 className="font-bold text-white text-2xl leading-tight text-shadow-sm group-hover:text-cyan-100 transition-colors">
              {mission.title}
            </h3>
            <div className="flex flex-wrap items-center gap-2 text-[11px] sm:text-xs">
              <span className="px-2 py-1 rounded-full bg-slate-900/80 border border-white/10 text-slate-200">
                📍 {nodeCount} nodes
              </span>
              <span className="px-2 py-1 rounded-full bg-slate-900/80 border border-white/10 text-slate-200">
                ⏱ ~3-5 min
              </span>
              {bestRun ? (
                <span className="px-2 py-1 rounded-full bg-cyan-950/80 border border-cyan-400/30 text-cyan-200">
                  ⭐ {bestRun.rewards_xp} XP best
                </span>
              ) : (
                <span className="px-2 py-1 rounded-full bg-slate-900/80 border border-white/10 text-slate-300">
                  🏆 Final chest
                </span>
              )}
            </div>
            <div className="pt-1">
              <span className={`inline-flex items-center justify-center rounded-xl px-3.5 py-1.5 text-xs font-black tracking-wide border ${
                hasActiveRun
                  ? 'bg-amber-500/20 border-amber-300/50 text-amber-100'
                  : 'bg-orange-500/90 border-orange-200/40 text-slate-950'
              }`}>
                {ctaLabel}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Mini route preview */}
      <div className="flex items-center gap-1.5 px-4 py-3 bg-slate-950/75 border-t border-white/10">
        {mission.route_template.map((node, i) => {
          const icons: Record<string, string> = {
            start: '🚀', question: '❓', reward: '🎁',
            surprise: '✨', elite_question: '⚡', final_chest: '🏆',
          };
          return (
            <React.Fragment key={i}>
              <span className="text-sm opacity-80">{icons[node.type] ?? '•'}</span>
              {i < mission.route_template.length - 1 && (
                <span className="text-[8px] text-slate-600">─</span>
              )}
            </React.Fragment>
          );
        })}
      </div>

      {/* Perfect run indicator */}
      {bestRun?.perfect_run && (
        <div className="px-4 pb-3 text-[10px] text-yellow-300/85 font-semibold tracking-wide">
          ✨ PERFECT RUN ACHIEVED
        </div>
      )}
    </button>
  );
};

export default MissionCard;
