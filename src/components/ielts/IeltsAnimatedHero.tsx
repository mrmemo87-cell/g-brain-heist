import React, { useEffect, useMemo, useRef } from 'react';
import gsap from 'gsap';

type IeltsAnimatedHeroProps = {
  onStartDiagnostic: () => void;
  compact?: boolean;
  authenticated?: boolean;
};

const useReducedMotion = () => {
  if (typeof window === 'undefined') return true;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
};

const skillNodes = [
  { label: 'Reading', value: 'speed + evidence', x: 78, y: 82, color: '#0ea5e9' },
  { label: 'Listening', value: 'detail + distractors', x: 256, y: 66, color: '#7c3aed' },
  { label: 'Writing', value: 'structure + feedback', x: 294, y: 214, color: '#f59e0b' },
  { label: 'Speaking', value: 'fluency + confidence', x: 106, y: 238, color: '#10b981' },
];

export const IeltsBandRing: React.FC = () => {
  const ringRef = useRef<SVGCircleElement>(null);
  const glowRef = useRef<SVGCircleElement>(null);
  const orbitRef = useRef<SVGGElement>(null);
  const circumference = 2 * Math.PI * 94;
  const targetOffset = circumference * (1 - 6.5 / 9);

  useEffect(() => {
    const reduced = useReducedMotion();
    if (reduced) {
      if (ringRef.current) ringRef.current.style.strokeDashoffset = String(targetOffset);
      if (glowRef.current) glowRef.current.style.strokeDashoffset = String(targetOffset);
      return;
    }
    const ctx = gsap.context(() => {
      gsap.set([ringRef.current, glowRef.current], { strokeDasharray: circumference, strokeDashoffset: circumference });
      gsap.to([ringRef.current, glowRef.current], { strokeDashoffset: targetOffset, duration: 1.55, ease: 'power3.out', delay: 0.28 });
      gsap.to(orbitRef.current, { rotate: 360, transformOrigin: '50% 50%', duration: 26, repeat: -1, ease: 'none' });
      gsap.to('[data-band-pulse]', { scale: 1.04, opacity: 0.82, transformOrigin: '50% 50%', duration: 1.8, repeat: -1, yoyo: true, ease: 'sine.inOut' });
    });
    return () => ctx.revert();
  }, [circumference, targetOffset]);

  const ticks = useMemo(() => Array.from({ length: 10 }, (_, band) => {
    const angle = (-90 + band * 40) * (Math.PI / 180);
    const x1 = 160 + Math.cos(angle) * 106;
    const y1 = 160 + Math.sin(angle) * 106;
    const x2 = 160 + Math.cos(angle) * 116;
    const y2 = 160 + Math.sin(angle) * 116;
    return <line key={band} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#94a3b8" strokeWidth={band % 3 === 0 ? 3 : 2} strokeLinecap="round" opacity="0.72" />;
  }), []);

  return (
    <svg viewBox="0 0 320 320" aria-hidden="true" style={{ width: 'min(100%, 340px)', display: 'block', margin: '0 auto' }}>
      <defs>
        <linearGradient id="ieltsRing" x1="0" x2="1" y1="0" y2="1"><stop stopColor="#22d3ee" /><stop offset="0.54" stopColor="#2563eb" /><stop offset="1" stopColor="#7c3aed" /></linearGradient>
        <filter id="ieltsGlow" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="5" result="blur" /><feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
      </defs>
      <circle cx="160" cy="160" r="132" fill="#ffffff" stroke="#dbeafe" strokeWidth="1" />
      <circle data-band-pulse cx="160" cy="160" r="112" fill="#eff6ff" stroke="#bfdbfe" strokeWidth="1" />
      {ticks}
      <circle cx="160" cy="160" r="94" fill="none" stroke="#e2e8f0" strokeWidth="16" />
      <circle ref={glowRef} cx="160" cy="160" r="94" fill="none" stroke="url(#ieltsRing)" strokeWidth="16" strokeLinecap="round" transform="rotate(-90 160 160)" opacity="0.28" filter="url(#ieltsGlow)" />
      <circle ref={ringRef} cx="160" cy="160" r="94" fill="none" stroke="url(#ieltsRing)" strokeWidth="11" strokeLinecap="round" transform="rotate(-90 160 160)" />
      <g ref={orbitRef}><circle cx="254" cy="160" r="7" fill="#22d3ee" /><circle cx="66" cy="160" r="4" fill="#7c3aed" opacity="0.8" /></g>
      <text x="160" y="146" textAnchor="middle" fill="#0f172a" fontSize="18" fontWeight="900">Band Check</text>
      <text x="160" y="174" textAnchor="middle" fill="#2563eb" fontSize="34" fontWeight="950">6.5</text>
      <text x="160" y="198" textAnchor="middle" fill="#64748b" fontSize="12" fontWeight="800">demo estimate</text>
    </svg>
  );
};

export const IeltsSkillConstellation: React.FC = () => {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (useReducedMotion() || !ref.current) return;
    const ctx = gsap.context(() => {
      gsap.fromTo('[data-skill-node]', { scale: 0.8, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.45, stagger: 0.08, ease: 'back.out(1.7)', delay: 0.55 });
      gsap.to('[data-skill-dot]', { y: -5, duration: 1.8, repeat: -1, yoyo: true, ease: 'sine.inOut', stagger: 0.18 });
    }, ref);
    return () => ctx.revert();
  }, []);
  return (
    <div ref={ref} style={{ borderRadius: 28, background: 'linear-gradient(135deg,#ffffff,#f8fbff)', border: '1px solid #dbeafe', boxShadow: '0 24px 70px rgba(37,99,235,0.12)', padding: '1rem' }}>
      <svg viewBox="0 0 360 300" aria-hidden="true" style={{ width: '100%', display: 'block' }}>
        <path d="M78 82 C148 22, 202 26, 256 66 S342 146, 294 214 S166 292, 106 238 S18 146, 78 82" fill="none" stroke="#bfdbfe" strokeWidth="3" strokeDasharray="8 10" />
        {skillNodes.map((node) => <g key={node.label} data-skill-node><circle data-skill-dot cx={node.x} cy={node.y} r="22" fill={node.color} opacity="0.14" /><circle cx={node.x} cy={node.y} r="10" fill={node.color} /><text x={node.x} y={node.y + 42} textAnchor="middle" fill="#0f172a" fontSize="14" fontWeight="900">{node.label}</text><text x={node.x} y={node.y + 60} textAnchor="middle" fill="#64748b" fontSize="11" fontWeight="700">{node.value}</text></g>)}
      </svg>
    </div>
  );
};

const IeltsAnimatedHero: React.FC<IeltsAnimatedHeroProps> = ({ onStartDiagnostic, compact = false, authenticated = false }) => {
  const rootRef = useRef<HTMLElement>(null);
  const ctaRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (useReducedMotion() || !rootRef.current) return;
    const ctx = gsap.context(() => {
      gsap.fromTo('[data-ielts-hero-reveal]', { opacity: 0, y: 22 }, { opacity: 1, y: 0, duration: 0.62, stagger: 0.08, ease: 'power3.out' });
      gsap.to(ctaRef.current, { y: -2, boxShadow: '0 18px 42px rgba(37,99,235,0.24)', duration: 1.4, repeat: -1, yoyo: true, ease: 'sine.inOut' });
    }, rootRef);
    return () => ctx.revert();
  }, []);

  return (
    <section ref={rootRef} style={{ padding: compact ? '2rem 0 1rem' : 'clamp(2.5rem,7vw,5rem) 0 clamp(2rem,5vw,4rem)' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,320px),1fr))', gap: 'clamp(1.25rem,4vw,3rem)', alignItems: 'center' }}>
        <div>
          <p data-ielts-hero-reveal style={{ display: 'inline-flex', margin: '0 0 1rem', color: '#0f766e', background: '#ccfbf1', border: '1px solid #99f6e4', borderRadius: 999, padding: '.45rem .75rem', fontSize: '.74rem', fontWeight: 950, letterSpacing: '.14em', textTransform: 'uppercase' }}>Free IELTS Diagnostic</p>
          <h1 data-ielts-hero-reveal style={{ margin: 0, fontSize: 'clamp(2.55rem, 8vw, 5.6rem)', lineHeight: 0.94, fontWeight: 950, letterSpacing: '-0.06em', color: '#0f172a' }}>What’s Your Real IELTS Band Score?</h1>
          <h2 data-ielts-hero-reveal style={{ margin: '1rem 0 0', color: '#1e3a8a', fontSize: 'clamp(1.45rem,4vw,2.5rem)', lineHeight: 1.04, letterSpacing: '-0.045em' }}>Find your IELTS band gap before you study harder.</h2>
          <p data-ielts-hero-reveal style={{ margin: '1rem 0 0', color: '#475569', fontSize: 'clamp(1rem,2vw,1.18rem)', lineHeight: 1.7, maxWidth: 690 }}>Take a focused diagnostic, get an estimated band snapshot, and see what to practise next. Brain Heist reveals the gap and turns it into a practice path.</p>
          <div data-ielts-hero-reveal style={{ display: 'flex', gap: '.8rem', flexWrap: 'wrap', alignItems: 'center', marginTop: '1.5rem' }}>
            <button ref={ctaRef} type="button" onClick={onStartDiagnostic} style={{ background: 'linear-gradient(135deg,#0ea5e9,#2563eb 54%,#7c3aed)', color: '#fff', border: 0, borderRadius: 999, padding: '1rem 1.35rem', fontWeight: 950, cursor: 'pointer', fontSize: '1rem' }}>Start Free Diagnostic →</button>
            <span style={{ color: '#64748b', fontSize: '.9rem', fontWeight: 700 }}>{authenticated ? 'Your result unlocks the next step.' : 'No payment required · Your result unlocks the next step'}</span>
          </div>
        </div>
        <div data-ielts-hero-reveal style={{ display: 'grid', gap: '1rem' }}>
          <IeltsBandRing />
          {!compact && <IeltsSkillConstellation />}
        </div>
      </div>
    </section>
  );
};

export default IeltsAnimatedHero;
