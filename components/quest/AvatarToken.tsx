import React, { useRef, useEffect, useCallback } from 'react';
import gsap from 'gsap';
import { playSound } from '../../services/soundManager';

interface AvatarTokenProps {
  /** Index of the node the avatar is currently at */
  nodeIndex: number;
  /** Avatar URL from profile — falls back to a default glow token */
  avatarUrl?: string;
  /** Callback when move animation completes */
  onMoveComplete?: () => void;
  /**
   * Node positions in percentage units [0..100] — mirrors the positions array
   * used in MissionBoard to place route nodes. Used to travel along the
   * same cubic-bezier path that is drawn between nodes.
   * Shape: { left: number, top: number }[]  (one entry per route node)
   */
  routePositions?: { left: number; top: number }[];
}

/* ── Sparkle trail helper ── */
function spawnTrailSparkle(container: HTMLElement, x: number, y: number) {
  const spark = document.createElement('div');
  const size = 4 + Math.random() * 6;
  const hue = 170 + Math.random() * 40; // cyan-ish range
  Object.assign(spark.style, {
    position: 'absolute',
    left: `${x - size / 2}px`,
    top: `${y - size / 2}px`,
    width: `${size}px`,
    height: `${size}px`,
    borderRadius: '50%',
    background: `hsl(${hue}, 90%, 70%)`,
    boxShadow: `0 0 ${size * 2}px hsl(${hue}, 90%, 60%)`,
    pointerEvents: 'none',
    zIndex: '15',
  });
  container.appendChild(spark);

  gsap.to(spark, {
    opacity: 0,
    scale: 0,
    y: `-=${10 + Math.random() * 15}`,
    x: `+=${(Math.random() - 0.5) * 20}`,
    duration: 0.5 + Math.random() * 0.4,
    ease: 'power2.out',
    onComplete: () => spark.remove(),
  });
}

/* ── Arrival burst helper ── */
function spawnArrivalBurst(container: HTMLElement, cx: number, cy: number, color: string) {
  for (let i = 0; i < 8; i++) {
    const spark = document.createElement('div');
    const angle = (i / 8) * Math.PI * 2;
    const dist = 20 + Math.random() * 15;
    const size = 3 + Math.random() * 4;
    Object.assign(spark.style, {
      position: 'absolute',
      left: `${cx - size / 2}px`,
      top: `${cy - size / 2}px`,
      width: `${size}px`,
      height: `${size}px`,
      borderRadius: '50%',
      background: color,
      boxShadow: `0 0 ${size * 2}px ${color}`,
      pointerEvents: 'none',
      zIndex: '25',
    });
    container.appendChild(spark);

    gsap.to(spark, {
      x: Math.cos(angle) * dist,
      y: Math.sin(angle) * dist,
      opacity: 0,
      scale: 0.3,
      duration: 0.6 + Math.random() * 0.2,
      ease: 'power3.out',
      onComplete: () => spark.remove(),
    });
  }
}

const AvatarToken: React.FC<AvatarTokenProps> = ({ nodeIndex, avatarUrl, onMoveComplete, routePositions }) => {
  const tokenRef = useRef<HTMLDivElement>(null);
  const glowRef = useRef<HTMLDivElement>(null);
  const prevIndex = useRef(nodeIndex);
  const idleAnim = useRef<gsap.core.Timeline | null>(null);

  // ── Idle animation: floating + glow pulse ──
  const startIdle = useCallback(() => {
    const el = tokenRef.current;
    const glow = glowRef.current;
    if (!el) return;

    idleAnim.current?.kill();
    const tl = gsap.timeline({ repeat: -1, yoyo: true });
    tl.to(el, { y: -8, duration: 1.6, ease: 'sine.inOut' });
    if (glow) {
      tl.to(glow, {
        opacity: 0.6,
        scale: 1.3,
        duration: 1.6,
        ease: 'sine.inOut',
      }, 0);
    }
    idleAnim.current = tl;
  }, []);

  useEffect(() => {
    startIdle();
    return () => { idleAnim.current?.kill(); };
  }, [startIdle]);

  // ── Initial position: snap to current node on mount ──
  useEffect(() => {
    const el = tokenRef.current;
    if (!el) return;

    // Wait a frame for DOM layout
    requestAnimationFrame(() => {
      const nodeEls = document.querySelectorAll('[data-quest-node]');
      const targetNode = nodeEls[nodeIndex] as HTMLElement | undefined;
      if (!targetNode || !el.offsetParent) return;

      const parentRect = el.offsetParent.getBoundingClientRect();
      const targetRect = targetNode.getBoundingClientRect();
      // Centre avatar on the node image
      const cx = targetRect.left + targetRect.width / 2 - parentRect.left;
      const cy = targetRect.top + targetRect.height / 2 - parentRect.top - el.offsetHeight / 2;

      gsap.set(el, { left: cx, top: cy, x: '-50%' });
    });
    // Only run on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Travel animation when nodeIndex changes ──
  useEffect(() => {
    if (prevIndex.current === nodeIndex) return;
    const el = tokenRef.current;
    if (!el) return;

    const nodeEls = document.querySelectorAll('[data-quest-node]');
    const fromNode = nodeEls[prevIndex.current] as HTMLElement | undefined;
    const toNode = nodeEls[nodeIndex] as HTMLElement | undefined;

    if (!fromNode || !toNode) {
      prevIndex.current = nodeIndex;
      onMoveComplete?.();
      return;
    }

    // Get the route map container for sparkle spawning
    const routeContainer = el.closest('[data-route-map]') as HTMLElement | null;

    idleAnim.current?.kill();
    gsap.set(el, { y: 0 }); // reset idle offset
    playSound('avatarMove');

    // Calculate positions relative to parent
    const parentRect = el.offsetParent?.getBoundingClientRect() ?? new DOMRect();
    const fromRect = fromNode.getBoundingClientRect();
    const toRect = toNode.getBoundingClientRect();

    const fromCX = fromRect.left + fromRect.width / 2 - parentRect.left;
    const fromCY = fromRect.top + fromRect.height / 2 - parentRect.top - el.offsetHeight / 2;
    const toCX = toRect.left + toRect.width / 2 - parentRect.left;
    const toCY = toRect.top + toRect.height / 2 - parentRect.top - el.offsetHeight / 2;

    // Compute bezier control points matching MissionBoard's connector bezier:
    // cx1 = x1, cy1 = midY, cx2 = x2, cy2 = midY
    const midCY = (fromCY + toCY) / 2;
    const cp1x = fromCX;
    const cp1y = midCY;
    const cp2x = toCX;
    const cp2y = midCY;

    // Position avatar at "from" node
    gsap.set(el, { left: fromCX, top: fromCY, x: '-50%' });

    // Cubic bezier evaluation: B(t) = (1-t)^3*P0 + 3(1-t)^2*t*P1 + 3(1-t)*t^2*P2 + t^3*P3
    function cubicBezier(t: number, p0: number, p1: number, p2: number, p3: number) {
      const mt = 1 - t;
      return mt * mt * mt * p0 + 3 * mt * mt * t * p1 + 3 * mt * t * t * p2 + t * t * t * p3;
    }

    const dx = toCX - fromCX;
    const dy = toCY - fromCY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const duration = Math.max(0.6, Math.min(1.6, dist / 250));

    // Build travel timeline
    const tl = gsap.timeline();

    // Hop up slightly at start
    tl.to(el, { scale: 1.2, duration: 0.12, ease: 'power2.out' });

    // Travel along bezier path via proxy t
    const proxy = { t: 0 };
    const sparkleObj = { progress: 0 };
    tl.to(proxy, {
      t: 1,
      duration,
      ease: 'power2.inOut',
      onUpdate: function () {
        const t = proxy.t;
        const bx = cubicBezier(t, fromCX, cp1x, cp2x, toCX);
        const by = cubicBezier(t, fromCY, cp1y, cp2y, toCY);
        gsap.set(el, { left: bx, top: by });

        if (!routeContainer) return;
        const newProgress = t;
        if (newProgress - sparkleObj.progress > 0.06) {
          sparkleObj.progress = newProgress;
          const rect = el.getBoundingClientRect();
          const containerRect = routeContainer.getBoundingClientRect();
          spawnTrailSparkle(
            routeContainer,
            rect.left + rect.width / 2 - containerRect.left + (Math.random() - 0.5) * 10,
            rect.top + rect.height / 2 - containerRect.top + (Math.random() - 0.5) * 10,
          );
        }
      },
    });

    // Arrival bounce
    tl.to(el, { scale: 1.35, duration: 0.1, ease: 'power4.out' });
    tl.to(el, { scale: 1, duration: 0.35, ease: 'elastic.out(1.2, 0.5)' });

    // Arrival burst
    tl.call(() => {
      if (routeContainer) {
        const rect = el.getBoundingClientRect();
        const containerRect = routeContainer.getBoundingClientRect();
        const cx = rect.left + rect.width / 2 - containerRect.left;
        const cy = rect.top + rect.height / 2 - containerRect.top;

        // Color based on the target node type
        const targetType = toNode.getAttribute('data-node-type') ?? '';
        const burstColor =
          targetType === 'reward' ? 'rgba(251,191,36,0.9)' :
          targetType === 'surprise' ? 'rgba(232,121,249,0.9)' :
          targetType === 'elite_question' ? 'rgba(239,68,68,0.9)' :
          targetType === 'final_chest' ? 'rgba(250,204,21,0.9)' :
          'rgba(34,211,238,0.9)';
        spawnArrivalBurst(routeContainer, cx, cy, burstColor);
      }

      prevIndex.current = nodeIndex;
      startIdle();
      onMoveComplete?.();
    });

  }, [nodeIndex, onMoveComplete, startIdle]);
  return (
    <div
      ref={tokenRef}
      className="pointer-events-none"
      style={{
        width: 44,
        height: 44,
        position: 'absolute',
        zIndex: 20,
        filter: 'drop-shadow(0 0 8px rgba(34,211,238,0.6))',
        transform: 'translateX(-50%)',
      }}
    >
      {/* Glow ring */}
      <div
        ref={glowRef}
        className="absolute inset-[-6px] rounded-full opacity-40"
        style={{
          background: 'radial-gradient(circle, rgba(34,211,238,0.4) 0%, transparent 70%)',
          filter: 'blur(4px)',
        }}
      />
      {avatarUrl ? (
        <img
          src={avatarUrl}
          alt="avatar"
          className="w-full h-full rounded-full border-2 border-cyan-400 object-cover relative z-10"
          onError={(e) => { (e.target as HTMLImageElement).src = '/BRAINS.svg'; }}
        />
      ) : (
        <div className="w-full h-full rounded-full border-2 border-cyan-400 bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center relative z-10">
          <span className="text-lg">🧠</span>
        </div>
      )}
    </div>
  );
};

export default AvatarToken;
