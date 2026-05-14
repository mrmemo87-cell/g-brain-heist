import React, { useEffect, useRef } from 'react';
import gsap from 'gsap';
import type { QuestMission, SoloDifficulty } from '../../types';
import { formatMissionTitleForDisplay } from './missionDisplay';

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

const formatCompactCount = (value?: number | null): string => {
  const count = Math.max(0, Math.floor(Number(value) || 0));
  if (count < 1000) return count.toString();
  if (count < 10000) {
    const compact = (count / 1000).toFixed(1).replace(/\.0$/, '');
    return `${compact}k`;
  }
  return `${Math.round(count / 1000)}k`;
};

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
  const scanlineRef = useRef<HTMLDivElement>(null);
  const coreRingRef = useRef<HTMLDivElement>(null);
  const ctaRef = useRef<HTMLDivElement>(null);
  const isVisibleRef = useRef(true);

  const diff = DIFFICULTY_BADGE[mission.difficulty];
  const mType = TYPE_BADGE[mission.mission_type] ?? TYPE_BADGE.standard;
  const bestRun = mission.best_run;
  const hasActiveRun = !!mission.active_run_id;
  const tierBadge = bestRun?.chest_tier ? CHEST_TIER_BADGE[bestRun.chest_tier] : null;
  const subjectBadge = SUBJECT_BADGE[mission.subject] ?? { type: 'emoji', value: '📚' as const };
  const cardTone = hasActiveRun
    ? 'from-amber-600/25 via-cyan-900/35 to-slate-950'
    : bestRun?.perfect_run
      ? 'from-yellow-500/20 via-cyan-900/40 to-slate-950'
      : 'from-cyan-500/15 via-blue-900/35 to-slate-950';
  const ctaLabel = hasActiveRun ? '▶ Continue Mission' : '🚀 Start Mission';
  const questionNodes = mission.route_question_count && mission.route_question_count > 0
    ? mission.route_question_count
    : mission.route_template.filter((node) => node.type === 'question' || node.type === 'elite_question').length;
  const viewCount = formatCompactCount(mission.play_count);
  const answeredCount = formatCompactCount(mission.questions_answered_count);
  const rewardLabel = bestRun ? `${bestRun.rewards_xp} XP Best` : 'Final Chest Reward';
  const displayTitle = formatMissionTitleForDisplay(mission.title);

  useEffect(() => {
    const scanline = scanlineRef.current;
    const coreRing = coreRingRef.current;
    const cta = ctaRef.current;
    if (!scanline || !coreRing || !cta) return;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reducedMotion) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        isVisibleRef.current = entry?.isIntersecting ?? false;
      },
      { threshold: 0.2 }
    );
    if (cardRef.current) observer.observe(cardRef.current);

    const timeline = gsap.timeline({ repeat: -1 });
    timeline
      .fromTo(scanline, { yPercent: -120, opacity: 0 }, { yPercent: 120, opacity: 0.7, duration: 2.2, ease: 'none' })
      .set(scanline, { opacity: 0 });

    const ringTween = gsap.to(coreRing, {
      rotate: 360,
      duration: 16,
      ease: 'none',
      repeat: -1,
      transformOrigin: 'center',
    });

    const ctaTween = gsap.to(cta, {
      boxShadow: '0 0 22px rgba(249,115,22,.65), 0 0 42px rgba(251,191,36,.35)',
      duration: 1.4,
      yoyo: true,
      repeat: -1,
      ease: 'sine.inOut',
    });

    return () => {
      observer.disconnect();
      timeline.kill();
      ringTween.kill();
      ctaTween.kill();
    };
  }, []);

  const handleHoverIn = () => {
    if (!cardRef.current) return;
    if (!isVisibleRef.current) return;
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
      <div className={`relative min-h-[24rem] bg-gradient-to-br ${cardTone}`}>
        <div
          aria-hidden="true"
          className="absolute inset-0 pointer-events-none select-none opacity-90"
          style={{
            background:
              'linear-gradient(135deg, rgba(34,211,238,0.22), transparent 18%, transparent 82%, rgba(251,146,60,0.2)), linear-gradient(45deg, rgba(14,165,233,0.12), transparent 45%, rgba(15,23,42,0.35))',
            boxShadow:
              'inset 0 0 0 2px rgba(34,211,238,0.22), inset 0 0 0 8px rgba(15,23,42,0.55), inset 0 0 36px rgba(8,145,178,0.28)',
          }}
        />
        <div
          className="absolute inset-3 border border-cyan-300/20 rounded-xl pointer-events-none"
          style={{ boxShadow: 'inset 0 0 35px rgba(56,189,248,.2), 0 0 20px rgba(15,23,42,.8)' }}
        />
        <div
          className="absolute inset-0 pointer-events-none opacity-55"
          style={{
            backgroundImage: 'radial-gradient(circle at 20% 20%, rgba(251,146,60,0.18), transparent 35%), radial-gradient(circle at 80% 35%, rgba(56,189,248,0.2), transparent 38%), linear-gradient(transparent 97%, rgba(148,163,184,0.25) 98%), linear-gradient(90deg, transparent 97%, rgba(148,163,184,0.18) 98%)',
            backgroundSize: '100% 100%, 100% 100%, 24px 24px, 24px 24px',
          }}
        />
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ background: 'linear-gradient(180deg, rgba(2,6,23,0.18) 0%, rgba(2,6,23,0.08) 35%, rgba(2,6,23,0.65) 70%, rgba(2,6,23,0.94) 100%)' }}
        />
        <div
          ref={scanlineRef}
          className="absolute inset-x-6 top-12 h-10 pointer-events-none opacity-0"
          style={{ background: 'linear-gradient(180deg, rgba(34,211,238,0), rgba(34,211,238,0.38), rgba(34,211,238,0))', filter: 'blur(2px)' }}
        />
        <div
          ref={glowRef}
          className="absolute inset-0 opacity-0 pointer-events-none"
          style={{ background: 'radial-gradient(circle at 50% 40%, rgba(34,211,238,.25), rgba(2,6,23,0) 70%)' }}
        />

        <div className="absolute inset-0 p-3 sm:p-4 grid grid-rows-[auto_1fr_auto] gap-3">
          <div className="flex items-start justify-between gap-2">
            <div ref={badgeRowRef} className="flex flex-wrap items-center gap-2">
              <span className={`text-[11px] font-semibold px-3 py-1 border backdrop-blur-sm ${diff.color}`} style={{ clipPath: 'polygon(8% 0, 100% 0, 92% 100%, 0 100%)' }}>
                ⚠ THREAT: {diff.text.toUpperCase()}
              </span>
              <span className={`text-[10px] font-bold uppercase tracking-widest ${mType.color} bg-slate-900/70 border border-cyan-400/30 px-2.5 py-1`} style={{ clipPath: 'polygon(0 0, 92% 0, 100% 50%, 92% 100%, 0 100%)' }}>
                {mType.label} Intel
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

          <div className="flex min-h-0 flex-col items-center justify-center gap-2 sm:gap-3">
            <div className="text-center space-y-1">
              <h3
                className="font-black text-white text-2xl sm:text-[2.1rem] leading-[0.95] tracking-wide uppercase drop-shadow-[0_3px_8px_rgba(34,211,238,.35)] overflow-hidden"
                style={{
                  display: '-webkit-box',
                  WebkitLineClamp: 3,
                  WebkitBoxOrient: 'vertical',
                  wordBreak: 'break-word',
                }}
              >
                {displayTitle}
              </h3>
              <div className="flex flex-wrap items-center justify-center gap-1.5 text-[0.64rem] uppercase tracking-[0.16em] font-semibold">
                <span className="text-amber-300/95">Temporal Grammar Mission</span>
                <span
                  className="rounded-full border border-cyan-300/35 bg-slate-950/70 px-2 py-0.5 text-cyan-100 tracking-[0.08em]"
                  title="Answerable question nodes inside this mission route"
                >
                  ❔ {questionNodes} Qs
                </span>
              </div>
            </div>
            <div className="relative h-40 w-40 flex items-center justify-center">
              <div ref={coreRingRef} className="absolute inset-0 rounded-full border border-cyan-300/45 border-dashed" />
              <div className="absolute inset-2 rounded-full border border-blue-300/45" />
              <div className="absolute inset-5 rounded-full border border-cyan-200/35" />
              <div className="h-24 w-24 rounded-full bg-slate-950/80 border border-cyan-300/45 shadow-[0_0_24px_rgba(34,211,238,0.35)] flex items-center justify-center">
              {subjectBadge.type === 'image' ? (
                <img
                  src={subjectBadge.src}
                  alt={subjectBadge.alt}
                  className="h-16 w-16 rounded-full object-cover"
                  loading="lazy"
                />
              ) : (
                <span className="text-5xl leading-none">{subjectBadge.value}</span>
              )}
            </div>
            </div>
          </div>

          <div className="space-y-2 sm:space-y-3">
            <div className="grid grid-cols-3 gap-2 text-[11px] sm:text-xs">
              <span className="px-2.5 py-1.5 rounded-lg bg-slate-950/80 border border-amber-400/35 text-amber-100 font-semibold">
                ⚠ {questionNodes} Challenges
              </span>
              <span className="px-2.5 py-1.5 rounded-lg bg-slate-950/80 border border-blue-400/35 text-blue-100 font-semibold">
                ⏱ 3-5 min Run
              </span>
              <span className="px-2.5 py-1.5 rounded-lg bg-slate-950/80 border border-orange-400/35 text-orange-100 font-semibold">
                ✦ {rewardLabel}
              </span>
            </div>
            <div
              ref={ctaRef}
              className={`w-full inline-flex items-center justify-center rounded-xl px-3.5 py-2 text-sm font-black tracking-wide border ${
                hasActiveRun
                  ? 'bg-gradient-to-r from-amber-700/90 to-orange-500/90 border-amber-200/55 text-amber-50'
                  : 'bg-gradient-to-r from-orange-500/95 to-amber-400/95 border-orange-100/50 text-slate-950'
              }`}
              style={{ textShadow: hasActiveRun ? '0 1px 3px rgba(0,0,0,0.45)' : 'none' }}
            >
                {ctaLabel}
            </div>
            <div
              className="flex items-center gap-2 text-[12px] font-semibold text-slate-300/90"
              title="Global mission views include Quest runs plus assignment/task trials that use this mission's questions. Answers count all logged question attempts for those questions."
            >
              <span className="inline-flex items-center gap-1 rounded-md bg-slate-950/55 px-2 py-1 text-slate-200/95">
                ▶ {viewCount} views · {answeredCount} answers
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Perfect run indicator */}
      {bestRun?.perfect_run && (
        <div className="px-4 pb-3 text-[10px] text-yellow-300/85 font-semibold tracking-wide hidden sm:block">
          ✨ PERFECT RUN ACHIEVED
        </div>
      )}
    </button>
  );
};

export default MissionCard;
