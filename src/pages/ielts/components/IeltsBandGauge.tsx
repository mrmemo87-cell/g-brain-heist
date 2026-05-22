import React, { useEffect, useRef } from 'react';
import gsap from 'gsap';

export interface IeltsBandGaugeProps {
  band: number | null | undefined;
  size?: number;
  label?: string;
  animate?: boolean;
}

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const bandColor = (b: number) =>
  b >= 7 ? '#0891b2' : b >= 5.5 ? '#7c3aed' : b >= 4 ? '#ea580c' : '#dc2626';

const IeltsBandGauge: React.FC<IeltsBandGaugeProps> = ({
  band,
  size = 130,
  label,
  animate = true,
}) => {
  const fillRef = useRef<SVGPathElement>(null);
  const textRef = useRef<SVGTextElement>(null);

  const cx = size / 2;
  const cy = size * 0.60;
  const r  = size * 0.40;
  const sw = Math.max(7, size * 0.09);

  // 240° speedometer arc: 8 o'clock (150°) → CW through top (270°) → 4 o'clock (30°)
  // large-arc-flag=1 (>180°), sweep-flag=1 (clockwise in SVG)
  const toR = (deg: number) => (deg * Math.PI) / 180;
  const startX = cx + r * Math.cos(toR(150));
  const startY = cy + r * Math.sin(toR(150));
  const endX   = cx + r * Math.cos(toR(30));
  const endY   = cy + r * Math.sin(toR(30));
  const d = `M ${startX.toFixed(2)} ${startY.toFixed(2)} A ${r.toFixed(2)} ${r.toFixed(2)} 0 1 1 ${endX.toFixed(2)} ${endY.toFixed(2)}`;
  const arcLen = toR(240) * r;

  const clamped     = Math.max(0, Math.min(9, band ?? 0));
  const fillFrac    = band === null || band === undefined ? 0 : clamped / 9;
  const finalOffset = arcLen * (1 - fillFrac);
  const color       = bandColor(clamped);

  // ViewBox: crop to arc area only
  const svgTop    = cy - r - sw - 2;
  const svgBottom = cy + r * 0.5 + sw * 0.5 + 4;
  const svgHeight = svgBottom - svgTop;

  useEffect(() => {
    const fill = fillRef.current;
    const txt = textRef.current;
    if (!fill || !txt) return;

    const reduced = prefersReducedMotion();
    const hasData = band !== null && band !== undefined;

    if (!animate || reduced || !hasData) {
      fill.style.strokeDashoffset = String(hasData ? finalOffset : arcLen);
      txt.textContent = hasData ? clamped.toFixed(1) : '—';
      return;
    }

    // Arc fill
    gsap.fromTo(fill, { strokeDashoffset: arcLen }, { strokeDashoffset: finalOffset, duration: 1.1, ease: 'power2.out', delay: 0.12 });

    // Count-up
    const counter = { v: 0 };
    gsap.to(counter, {
      v: clamped,
      duration: 0.95,
      ease: 'power2.out',
      delay: 0.12,
      onUpdate: () => { txt.textContent = counter.v.toFixed(1); },
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [band]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.25rem' }}>
      <svg
        width={size}
        height={svgHeight}
        viewBox={`0 ${svgTop.toFixed(2)} ${size} ${svgHeight.toFixed(2)}`}
        aria-label={`IELTS band score: ${band ?? 'unknown'}`}
      >
        {/* Track */}
        <path d={d} fill="none" stroke="#e2e8f0" strokeWidth={sw} strokeLinecap="round" />
        {/* Fill */}
        <path
          ref={fillRef}
          d={d}
          fill="none"
          stroke={color}
          strokeWidth={sw}
          strokeLinecap="round"
          strokeDasharray={arcLen}
          strokeDashoffset={arcLen}
          style={{ filter: `drop-shadow(0 0 ${sw * 0.7}px ${color}90)`, transition: 'stroke 0.3s' }}
        />
        {/* Score */}
        <text
          ref={textRef}
          x={cx}
          y={cy}
          textAnchor="middle"
          dominantBaseline="middle"
          fill={band === null || band === undefined ? '#94a3b8' : color}
          fontSize={size * 0.23}
          fontWeight="900"
          fontFamily="system-ui, -apple-system, sans-serif"
        >
          {band === null || band === undefined ? '—' : '0.0'}
        </text>
        {/* /9.0 sub-label */}
        <text
          x={cx}
          y={cy + r * 0.30}
          textAnchor="middle"
          dominantBaseline="middle"
          fill="#94a3b8"
          fontSize={size * 0.10}
          fontFamily="system-ui, sans-serif"
        >
          / 9.0
        </text>
      </svg>
      {label && (
        <span style={{
          fontSize: `${Math.max(9, size * 0.09)}px`,
          color: '#64748b',
          fontWeight: 700,
          letterSpacing: '0.07em',
          textTransform: 'uppercase',
          textAlign: 'center',
        }}>
          {label}
        </span>
      )}
    </div>
  );
};

export default IeltsBandGauge;
