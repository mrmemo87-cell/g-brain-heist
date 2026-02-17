import React, { useState, useEffect } from 'react';

/**
 * SkeletonDashboard – shows the real dashboard layout as grey placeholder
 * cards that are visible instantly, then "pop" to life one-by-one on a
 * fast staggered timer (~80 ms apart ≈ 500 ms total).
 *
 * Cards start dim/muted and scale up with a glow when activated — the user
 * never sees a blank page.
 *
 * Respects `prefers-reduced-motion`.
 */

/* ---------- tiny building blocks ---------- */

const Bone: React.FC<{ className?: string }> = ({ className }) => (
  <div
    className={`skeleton-bone rounded-lg bg-white/[0.07] ${className ?? ''}`}
  />
);

/**
 * Cards are always rendered. Before their stage fires they sit at reduced
 * opacity / slightly smaller; once active they pop to full size with a
 * brief overshoot scale.
 */
const CardShell: React.FC<{
  active: boolean;
  children: React.ReactNode;
  className?: string;
}> = ({ active, children, className }) => (
  <div
    className={`rounded-2xl border p-5 transition-all duration-300 ease-out
      ${active
        ? 'border-white/10 bg-white/[0.04] opacity-100 scale-100 skel-pop'
        : 'border-white/[0.05] bg-white/[0.02] opacity-40 scale-[0.97]'}
      ${className ?? ''}`}
  >
    {children}
  </div>
);

/* ---------- section skeletons ---------- */

/** Header bar skeleton */
const HeaderSkeleton: React.FC<{ active: boolean }> = ({ active }) => (
  <CardShell active={active} className="!rounded-2xl !p-3 mb-6">
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-3">
        <Bone className="h-8 w-8 !rounded-full" />
        <Bone className="h-5 w-28" />
      </div>
      <div className="flex items-center gap-2">
        <Bone className="h-7 w-7 !rounded-full" />
        <Bone className="h-7 w-7 !rounded-full" />
        <Bone className="h-7 w-7 !rounded-full" />
      </div>
    </div>
  </CardShell>
);

/** Player profile card skeleton (left column) */
const ProfileSkeleton: React.FC<{ active: boolean }> = ({ active }) => (
  <CardShell active={active}>
    <div className="flex items-center gap-4 mb-4">
      <Bone className="h-14 w-14 !rounded-full shrink-0" />
      <div className="flex-1 space-y-2">
        <Bone className="h-5 w-28" />
        <Bone className="h-3 w-20" />
      </div>
    </div>
    <div className="grid grid-cols-3 gap-3">
      {[1, 2, 3].map((i) => (
        <div key={i} className="text-center space-y-1">
          <Bone className="h-6 w-full" />
          <Bone className="h-3 w-3/4 mx-auto" />
        </div>
      ))}
    </div>
    <Bone className="h-2 w-full mt-4 !rounded-full" />
  </CardShell>
);

/** Action grid skeleton (middle column) */
const ActionGridSkeleton: React.FC<{ active: boolean }> = ({ active }) => (
  <CardShell active={active}>
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
const TasksSkeleton: React.FC<{ active: boolean }> = ({ active }) => (
  <CardShell active={active}>
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
const SideCardSkeleton: React.FC<{ active: boolean; lines?: number }> = ({
  active,
  lines = 3,
}) => (
  <CardShell active={active}>
    <Bone className="h-5 w-24 mb-4" />
    <div className="space-y-2.5">
      {Array.from({ length: lines }).map((_, i) => (
        <Bone key={i} className="h-3.5 w-full" />
      ))}
    </div>
  </CardShell>
);

/* ---------- main component ---------- */

const STAGE_INTERVAL = 80;

interface SkeletonDashboardProps {
  role?: 'student' | 'teacher' | 'admin';
}

/**
 * Teacher / Admin skeleton – no game data.
 * Shows a wide content area + sidebar skeleton.
 */
const TeacherAdminSkeleton: React.FC<{ stage: number; label: string }> = ({ stage, label }) => (
  <div className="space-y-6 mt-2">
    {/* Header */}
    <HeaderSkeleton active={stage >= 1} />

    {/* Wide 2-column layout */}
    <section className="grid grid-cols-1 gap-6 lg:grid-cols-12">
      {/* Left sidebar – profile + tools */}
      <div className="space-y-6 lg:col-span-3">
        <CardShell active={stage >= 2}>
          <div className="flex items-center gap-4 mb-4">
            <Bone className="h-12 w-12 !rounded-full shrink-0" />
            <div className="flex-1 space-y-2">
              <Bone className="h-5 w-28" />
              <Bone className="h-3 w-20" />
            </div>
          </div>
          <Bone className="h-8 w-full !rounded-lg mt-3" />
          <Bone className="h-8 w-full !rounded-lg mt-2" />
        </CardShell>
      </div>

      {/* Main content area */}
      <div className="space-y-6 lg:col-span-9">
        <CardShell active={stage >= 3}>
          <Bone className="h-6 w-40 mb-4" />
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="space-y-2 rounded-xl bg-white/[0.03] p-4">
                <Bone className="h-8 w-8 !rounded-lg" />
                <Bone className="h-3 w-20" />
                <Bone className="h-2.5 w-14" />
              </div>
            ))}
          </div>
        </CardShell>
        <CardShell active={stage >= 4}>
          <Bone className="h-5 w-32 mb-3" />
          <div className="space-y-2.5">
            <Bone className="h-4 w-full" />
            <Bone className="h-4 w-5/6" />
            <Bone className="h-4 w-4/6" />
          </div>
        </CardShell>
      </div>
    </section>

    {/* Subtle role label */}
    <p className="text-center text-xs text-cyan-400/40 tracking-widest uppercase mt-2">
      Loading {label} portal…
    </p>
  </div>
);

const SkeletonDashboard: React.FC<SkeletonDashboardProps> = ({ role = 'student' }) => {
  const totalStages = role === 'student' ? 7 : 5;
  const [stage, setStage] = useState(0);

  useEffect(() => {
    if (stage >= totalStages) return;
    const id = window.setTimeout(() => setStage((s) => s + 1), STAGE_INTERVAL);
    return () => clearTimeout(id);
  }, [stage, totalStages]);

  // Teacher / admin / school admin layout
  if (role === 'teacher') {
    return <TeacherAdminSkeleton stage={stage} label="teacher" />;
  }
  if (role === 'admin') {
    return <TeacherAdminSkeleton stage={stage} label="admin" />;
  }

  // Student layout (3-column game dashboard)
  return (
    <div className="space-y-6 mt-2">
      <HeaderSkeleton active={stage >= 1} />

      <section className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="space-y-6 lg:col-span-4">
          <ProfileSkeleton active={stage >= 2} />
        </div>

        <div className="space-y-6 lg:col-span-5">
          <ActionGridSkeleton active={stage >= 3} />
          <TasksSkeleton active={stage >= 4} />
        </div>

        <div className="space-y-6 lg:col-span-3">
          <SideCardSkeleton active={stage >= 5} lines={3} />
          <SideCardSkeleton active={stage >= 6} lines={4} />
          <SideCardSkeleton active={stage >= 7} lines={5} />
        </div>
      </section>
    </div>
  );
};

export default SkeletonDashboard;
