import React, { useState, useEffect } from 'react';

/**
 * SkeletonDashboard – shows the real dashboard layout as grey placeholder
 * cards that "light up" (fade-in + scale) one-by-one on a staggered timer,
 * giving users the perception of progress even before any data arrives.
 *
 * Respects `prefers-reduced-motion` — falls back to a simple fade with no
 * translate/scale and disables the pulse shimmer.
 */

/* ---------- tiny building blocks ---------- */

const Bone: React.FC<{ className?: string }> = ({ className }) => (
  <div
    className={`skeleton-bone rounded-lg bg-white/[0.07] ${className ?? ''}`}
  />
);

const CardShell: React.FC<{
  visible: boolean;
  delay: number;          // ms before this card appears
  children: React.ReactNode;
  className?: string;
}> = ({ visible, delay, children, className }) => (
  <div
    className={`rounded-2xl border border-white/10 bg-white/[0.04] p-5 transition-all duration-500
      ${visible ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 translate-y-3 scale-[0.97]'}
      ${className ?? ''}`}
    style={{ transitionDelay: `${delay}ms` }}
  >
    {children}
  </div>
);

/* ---------- section skeletons ---------- */

/** Header bar skeleton */
const HeaderSkeleton: React.FC<{ show: boolean }> = ({ show }) => (
  <CardShell visible={show} delay={0} className="!rounded-2xl !p-3 mb-6">
    <div className="flex items-center justify-between">
      {/* Logo + title */}
      <div className="flex items-center gap-3">
        <Bone className="h-8 w-8 !rounded-full" />
        <Bone className="h-5 w-28" />
      </div>
      {/* Right-side icons */}
      <div className="flex items-center gap-2">
        <Bone className="h-7 w-7 !rounded-full" />
        <Bone className="h-7 w-7 !rounded-full" />
        <Bone className="h-7 w-7 !rounded-full" />
      </div>
    </div>
  </CardShell>
);

/** Player profile card skeleton (left column) */
const ProfileSkeleton: React.FC<{ show: boolean }> = ({ show }) => (
  <CardShell visible={show} delay={150}>
    <div className="flex items-center gap-4 mb-4">
      <Bone className="h-14 w-14 !rounded-full shrink-0" />
      <div className="flex-1 space-y-2">
        <Bone className="h-5 w-28" />
        <Bone className="h-3 w-20" />
      </div>
    </div>
    {/* Stats row */}
    <div className="grid grid-cols-3 gap-3">
      {[1, 2, 3].map((i) => (
        <div key={i} className="text-center space-y-1">
          <Bone className="h-6 w-full" />
          <Bone className="h-3 w-3/4 mx-auto" />
        </div>
      ))}
    </div>
    {/* XP bar */}
    <Bone className="h-2 w-full mt-4 !rounded-full" />
  </CardShell>
);

/** Action grid skeleton (middle column) */
const ActionGridSkeleton: React.FC<{ show: boolean }> = ({ show }) => (
  <CardShell visible={show} delay={300}>
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex flex-col items-center gap-2 rounded-xl bg-white/[0.04] p-4">
          <Bone className="h-10 w-10 !rounded-xl" />
          <Bone className="h-3 w-16" />
        </div>
      ))}
    </div>
  </CardShell>
);

/** Tasks / feed skeleton (middle column, below actions) */
const TasksSkeleton: React.FC<{ show: boolean }> = ({ show }) => (
  <CardShell visible={show} delay={500}>
    <div className="flex items-center justify-between mb-4">
      <Bone className="h-5 w-20" />
      <Bone className="h-4 w-12" />
    </div>
    <div className="space-y-3">
      {[1, 2, 3].map((i) => (
        <div key={i} className="flex items-center gap-3">
          <Bone className="h-8 w-8 !rounded-lg shrink-0" />
          <div className="flex-1 space-y-1.5">
            <Bone className="h-4 w-3/4" />
            <Bone className="h-2.5 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  </CardShell>
);

/** Right-column cards skeleton (assignment, caps, news) */
const SideCardSkeleton: React.FC<{ show: boolean; delay: number; lines?: number }> = ({
  show,
  delay,
  lines = 3,
}) => (
  <CardShell visible={show} delay={delay}>
    <Bone className="h-5 w-24 mb-4" />
    <div className="space-y-2.5">
      {Array.from({ length: lines }).map((_, i) => (
        <Bone key={i} className="h-3.5 w-full" />
      ))}
    </div>
  </CardShell>
);

/* ---------- main component ---------- */

const REVEAL_STAGES = 6;           // header, profile, actions, tasks, right-1, right-2/3
const STAGE_INTERVAL_MS = 220;     // stagger between stages

const SkeletonDashboard: React.FC = () => {
  const [stage, setStage] = useState(0);

  useEffect(() => {
    // Kick off stage 0 immediately, then increment
    if (stage >= REVEAL_STAGES) return;
    const id = window.setTimeout(() => setStage((s) => s + 1), STAGE_INTERVAL_MS);
    return () => clearTimeout(id);
  }, [stage]);

  return (
    <div className="space-y-6 mt-2">
      {/* Header skeleton */}
      <HeaderSkeleton show={stage >= 0} />

      {/* 3-column grid matching real dashboard */}
      <section className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left column – profile */}
        <div className="space-y-6 lg:col-span-4 xl:col-span-3">
          <ProfileSkeleton show={stage >= 1} />
        </div>

        {/* Middle column – actions + tasks */}
        <div className="space-y-6 lg:col-span-5 xl:col-span-6">
          <ActionGridSkeleton show={stage >= 2} />
          <TasksSkeleton show={stage >= 3} />
        </div>

        {/* Right column – assignment, caps, news */}
        <div className="space-y-6 lg:col-span-3 xl:col-span-3">
          <SideCardSkeleton show={stage >= 4} delay={700} lines={3} />
          <SideCardSkeleton show={stage >= 4} delay={850} lines={4} />
          <SideCardSkeleton show={stage >= 5} delay={1000} lines={5} />
        </div>
      </section>

      {/* Subtle bottom status line */}
      <div
        className={`text-center text-xs text-cyan-300/50 tracking-widest uppercase transition-opacity duration-700 ${
          stage >= 3 ? 'opacity-100' : 'opacity-0'
        }`}
      >
        Initializing systems…
      </div>
    </div>
  );
};

export default SkeletonDashboard;
