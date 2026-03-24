import React, { useRef, useEffect } from 'react';
import gsap from 'gsap';
import type { QuestNodeType, QuestNodeState } from '../../types';
import { NODE_ICONS } from './nodeAssets';

interface RouteNodeProps {
  index: number;
  type: QuestNodeType;
  label: string;
  state: QuestNodeState;
  onClick: () => void;
  staggerDelay?: number;
  /** XP reward badge shown on the node */
  xpBadge?: string;
}

/* ── Visual config per node type ─────────────────────────── */

const NODE_CONFIG: Record<QuestNodeType, {
  imgSrc: string;
  tag: string;
  glow: string;
  filterGlow: string;
  tagBg: string;
  /** px size of the image — used for the orbiting comet radius too */
  imgPx: number;
  orbitColor: string;
  /** raw rgba components for SVG stop colors */
  orbitRgb: string;
}> = {
  start: {
    imgSrc: NODE_ICONS.start, tag: 'START',
    glow: '0 0 28px 8px rgba(34,211,238,0.5)',
    filterGlow: 'drop-shadow(0 0 14px rgba(34,211,238,0.9))',
    tagBg: 'bg-cyan-500/80', imgPx: 160,
    orbitColor: 'rgba(34,211,238,1)', orbitRgb: '34,211,238',
  },
  question: {
    imgSrc: NODE_ICONS.question, tag: 'QUESTION',
    glow: '0 0 24px 8px rgba(96,165,250,0.5)',
    filterGlow: 'drop-shadow(0 0 14px rgba(96,165,250,0.9))',
    tagBg: 'bg-blue-500/80', imgPx: 160,
    orbitColor: 'rgba(96,165,250,1)', orbitRgb: '96,165,250',
  },
  reward: {
    imgSrc: NODE_ICONS.reward, tag: 'REWARD',
    glow: '0 0 28px 8px rgba(251,191,36,0.55)',
    filterGlow: 'drop-shadow(0 0 14px rgba(251,191,36,0.95))',
    tagBg: 'bg-amber-500/80', imgPx: 160,
    orbitColor: 'rgba(251,191,36,1)', orbitRgb: '251,191,36',
  },
  surprise: {
    imgSrc: NODE_ICONS.surprise, tag: 'SURPRISE!',
    glow: '0 0 28px 8px rgba(232,121,249,0.55)',
    filterGlow: 'drop-shadow(0 0 14px rgba(232,121,249,0.9))',
    tagBg: 'bg-fuchsia-500/80', imgPx: 160,
    orbitColor: 'rgba(232,121,249,1)', orbitRgb: '232,121,249',
  },
  elite_question: {
    imgSrc: NODE_ICONS.elite_question, tag: 'RIDDLE!',
    glow: '0 0 28px 8px rgba(248,113,113,0.55)',
    filterGlow: 'drop-shadow(0 0 14px rgba(248,113,113,0.9))',
    tagBg: 'bg-red-500/80', imgPx: 176,
    orbitColor: 'rgba(248,113,113,1)', orbitRgb: '248,113,113',
  },
  final_chest: {
    imgSrc: NODE_ICONS.final_chest, tag: 'BOSS',
    glow: '0 0 36px 12px rgba(250,204,21,0.6)',
    filterGlow: 'drop-shadow(0 0 18px rgba(250,204,21,1))',
    tagBg: 'bg-yellow-500/90', imgPx: 200,
    orbitColor: 'rgba(250,204,21,1)', orbitRgb: '250,204,21',
  },
};

const RouteNode: React.FC<RouteNodeProps> = ({
  index, type, label, state, onClick, staggerDelay = 0, xpBadge,
}) => {
  const wrapRef = useRef<HTMLDivElement>(null);
  const nodeRef = useRef<HTMLButtonElement>(null);
  const svgCometRef = useRef<SVGSVGElement>(null);
  const hasEnteredRef = useRef(false);

  const cfg = NODE_CONFIG[type];
  const imgPx = cfg.imgPx;
  // Radius the comet orbits at (half-image + small margin)
  const orbitR = imgPx / 2 + 14;
  // SVG canvas size (orbit diameter + padding for glow)
  const svgSize = (orbitR + 20) * 2;
  const cx = svgSize / 2;
  const cy = svgSize / 2;

  // Entrance stagger
  useEffect(() => {
    if (hasEnteredRef.current || !wrapRef.current) return;
    hasEnteredRef.current = true;
    gsap.fromTo(wrapRef.current,
      { y: 24, opacity: 0, scale: 0.5 },
      { y: 0, opacity: 1, scale: 1, duration: 0.5, delay: staggerDelay, ease: 'back.out(1.6)' }
    );
  }, [staggerDelay]);

  // Active orbiting comet: rotate the entire SVG
  useEffect(() => {
    const svg = svgCometRef.current;
    if (!svg) return;

    if (state !== 'active') {
      gsap.killTweensOf(svg);
      gsap.set(svg, { opacity: 0 });
      return;
    }

    gsap.set(svg, { opacity: 1 });
    const anim = gsap.to(svg, {
      rotation: 360,
      duration: 2.2,
      repeat: -1,
      ease: 'none',
      transformOrigin: '50% 50%',
    });

    if (nodeRef.current) {
      gsap.fromTo(nodeRef.current,
        { scale: 0.85, opacity: 0 },
        { scale: 1, opacity: 1, duration: 0.5, ease: 'back.out(1.6)' }
      );
    }

    return () => { anim.kill(); };
  }, [state]);

  // Cleared pop
  useEffect(() => {
    if (state === 'cleared' && nodeRef.current) {
      gsap.fromTo(nodeRef.current,
        { scale: 1.25 }, { scale: 1, duration: 0.4, ease: 'elastic.out(1, 0.5)' }
      );
    }
  }, [state]);

  const isLocked = state === 'locked';
  const isCleared = state === 'cleared';
  const isActive = state === 'active';

  // Build SVG arc path for the comet tail
  // Tail spans ~200° behind the head (head sits at angle 0 = 3 o'clock)
  // Arc goes counter-clockwise from head (-200°) to head (0°)
  const tailSpan = 200; // degrees
  const headAngleDeg = 0;
  const tailStartDeg = headAngleDeg - tailSpan;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const headX = cx + orbitR * Math.cos(toRad(headAngleDeg));
  const headY = cy + orbitR * Math.sin(toRad(headAngleDeg));
  const tailX = cx + orbitR * Math.cos(toRad(tailStartDeg));
  const tailY = cy + orbitR * Math.sin(toRad(tailStartDeg));
  // SVG arc: large-arc-flag=1 because tailSpan > 180°
  const arcPath = `M ${tailX} ${tailY} A ${orbitR} ${orbitR} 0 1 1 ${headX} ${headY}`;

  const tailGradId = `cometTail-${type}`;

  return (
    <div
      ref={wrapRef}
      className="relative flex flex-col items-center"
      style={{ opacity: 0 }}
    >
      {/* Type tag (floats above image) */}
      {!isLocked && (
        <span className={`
          mb-1 px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-widest
          text-white shadow-lg select-none ${cfg.tagBg}
        `}>
          {cfg.tag}
        </span>
      )}

      {/* Node wrapper — fixed size so badges position correctly */}
      <div
        className="relative flex items-center justify-center"
        style={{ width: imgPx, height: imgPx }}
      >
        {/* Orbiting comet SVG (active only) — positioned to overflow the node symmetrically */}
        {isActive && (
          <svg
            ref={svgCometRef}
            className="absolute pointer-events-none"
            width={svgSize}
            height={svgSize}
            viewBox={`0 0 ${svgSize} ${svgSize}`}
            style={{
              left: '50%',
              top: '50%',
              transform: 'translate(-50%, -50%)',
              overflow: 'visible',
              opacity: 0,
              zIndex: 30,
            }}
          >
            <defs>
              {/* Gradient along the arc: tail = transparent, head = full color */}
              <linearGradient
                id={tailGradId}
                gradientUnits="userSpaceOnUse"
                x1={tailX}
                y1={tailY}
                x2={headX}
                y2={headY}
              >
                <stop offset="0%" stopColor={`rgba(${cfg.orbitRgb},0)`} />
                <stop offset="60%" stopColor={`rgba(${cfg.orbitRgb},0.3)`} />
                <stop offset="100%" stopColor={`rgba(${cfg.orbitRgb},0.85)`} />
              </linearGradient>
              <filter id={`cometGlow-${type}`} x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="3" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            {/* Curved tail arc */}
            <path
              d={arcPath}
              fill="none"
              stroke={`url(#${tailGradId})`}
              strokeWidth="4"
              strokeLinecap="round"
              filter={`url(#cometGlow-${type})`}
              style={{ opacity: 0.9 }}
            />
            {/* Outer glow on tail */}
            <path
              d={arcPath}
              fill="none"
              stroke={`rgba(${cfg.orbitRgb},0.25)`}
              strokeWidth="12"
              strokeLinecap="round"
              style={{ filter: 'blur(4px)' }}
            />

            {/* Head: bright glowing ball */}
            <circle
              cx={headX}
              cy={headY}
              r={6}
              fill={`rgba(${cfg.orbitRgb},1)`}
              filter={`url(#cometGlow-${type})`}
            />
            {/* Head outer glow */}
            <circle
              cx={headX}
              cy={headY}
              r={12}
              fill={`rgba(${cfg.orbitRgb},0.3)`}
              style={{ filter: 'blur(5px)' }}
            />
          </svg>
        )}

        {/* Main button/image */}
        <button
          ref={nodeRef}
          onClick={isActive ? onClick : undefined}
          disabled={isLocked}
          className={`
            relative z-10 bg-transparent border-none p-0 focus:outline-none
            transition-all duration-200 flex items-center justify-center
            ${isActive ? 'hover:scale-110 active:scale-95 cursor-pointer' : isLocked ? 'cursor-not-allowed' : 'cursor-default'}
          `}
          style={{
            width: imgPx,
            height: imgPx,
            filter: isLocked
              ? 'grayscale(1) brightness(0.35)'
              : isActive
                ? cfg.filterGlow
                : 'drop-shadow(0 4px 10px rgba(0,0,0,0.5))',
            opacity: isLocked ? 0.4 : isCleared ? 0.72 : 1,
          }}
        >
          {isLocked ? (
            /* Lock placeholder — same size as image so layout is consistent */
            <div
              className="flex items-center justify-center rounded-full bg-slate-800/60"
              style={{ width: imgPx, height: imgPx }}
            >
              <span style={{ fontSize: imgPx * 0.35 }}>🔒</span>
            </div>
          ) : (
            <img
              src={cfg.imgSrc}
              alt={cfg.tag}
              style={{ width: imgPx, height: imgPx }}
              className="object-contain select-none block"
              draggable={false}
            />
          )}
          {isCleared && (
            <div className="absolute -top-1 -right-1 z-20 w-[26px] h-[26px] rounded-full bg-green-500 flex items-center justify-center shadow-md border-2 border-green-300/60">
              <svg viewBox="0 0 12 12" className="w-3.5 h-3.5" fill="none">
                <path d="M2 6l3 3 5-5" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
          )}
        </button>

        {/* XP badge — top-right corner of the fixed-size box */}
        {xpBadge && !isLocked && (
          <div className="absolute -top-2 -right-3 z-30 px-2 py-0.5 rounded-lg bg-emerald-500/90 text-white text-[11px] font-black shadow-lg shadow-emerald-500/30 border border-emerald-300/40">
            {xpBadge}
          </div>
        )}
      </div>

      {/* Label below */}
      {!isLocked && (
        <span className={`
          mt-1 text-[11px] font-bold tracking-wide max-w-[120px] text-center leading-tight
          ${isActive ? 'text-white' : isCleared ? 'text-green-300/80' : 'text-slate-400'}
        `}>
          {label}
        </span>
      )}
    </div>
  );
};

export default RouteNode;
