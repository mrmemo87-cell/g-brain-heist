import React, { useEffect, useMemo, useRef } from 'react';
import { gsap } from 'gsap';
import type { IeltsDashboardSummary, IeltsSkill, IeltsSkillProgress } from '../../../services/ieltsDashboardService';

type SkillCardModel = {
  skill: IeltsSkill;
  label: string;
  benefit: string;
  progress: IeltsSkillProgress;
  overviewRoute: string;
};

type Props = {
  summary: IeltsDashboardSummary;
  lapsedPrime: boolean;
  taskTotal: number;
  completedTotal: number;
  recommendedSkill: IeltsSkill | 'reading';
  recommendedRoute: string;
  onNavigate: (route: string) => void;
  onRedirectToPrime: () => void;
  formatDate: (value?: string | null) => string;
};

const shell: React.CSSProperties = {
  minHeight: '100vh',
  background: 'radial-gradient(circle at 14% 8%, rgba(125,211,252,0.38), transparent 28%), radial-gradient(circle at 88% 0%, rgba(196,181,253,0.42), transparent 32%), linear-gradient(135deg,#f8fbff 0%,#eef7ff 42%,#fbf7ff 100%)',
  color: '#0f172a',
  fontFamily: 'system-ui, -apple-system, sans-serif',
  padding: 'clamp(1rem,3vw,2rem)',
  overflowX: 'hidden',
};

const glassCard: React.CSSProperties = {
  background: 'rgba(255,255,255,0.9)',
  border: '1px solid rgba(148,163,184,0.24)',
  borderRadius: '1.35rem',
  padding: '1.05rem',
  boxShadow: '0 18px 48px rgba(15,23,42,0.08)',
};

const skillName = (skill?: string | null) => skill ? `${skill[0].toUpperCase()}${skill.slice(1)}` : 'Reading';

const progressPercent = (progress: IeltsSkillProgress) => {
  if (!progress.totalAvailableTasks) return 0;
  return Math.min(100, Math.round((progress.completedTaskCount / progress.totalAvailableTasks) * 100));
};

const formatBand = (band: number | null) => band === null || band === undefined ? null : Number.isInteger(band) ? `${band}.0` : band.toFixed(1);

const IeltsPrimeBandRing: React.FC<{ band: number | null }> = ({ band }) => {
  const circleRef = useRef<SVGCircleElement | null>(null);
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const clampedBand = band === null ? 0 : Math.max(0, Math.min(9, band));
  const offset = circumference - (clampedBand / 9) * circumference;

  useEffect(() => {
    const circle = circleRef.current;
    if (!circle) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    gsap.set(circle, { strokeDasharray: circumference, strokeDashoffset: reduced ? offset : circumference });
    if (reduced) return;
    const tween = gsap.to(circle, { strokeDashoffset: offset, duration: 1.15, ease: 'power3.out', delay: 0.15 });
    return () => { tween.kill(); };
  }, [circumference, offset]);

  return (
    <div style={{ position: 'relative', width: 172, maxWidth: '100%', margin: '0 auto' }}>
      <svg width="172" height="172" viewBox="0 0 144 144" aria-hidden="true" style={{ display: 'block', filter: 'drop-shadow(0 18px 24px rgba(2,6,23,0.28))' }}>
        <circle cx="72" cy="72" r={radius} fill="rgba(255,255,255,0.08)" stroke="rgba(226,232,240,0.18)" strokeWidth="12" />
        <circle ref={circleRef} cx="72" cy="72" r={radius} fill="transparent" stroke="url(#primeBandGradient)" strokeLinecap="round" strokeWidth="12" transform="rotate(-90 72 72)" />
        <defs><linearGradient id="primeBandGradient" x1="14" x2="126" y1="18" y2="128"><stop stopColor="#67e8f9" /><stop offset="0.55" stopColor="#a78bfa" /><stop offset="1" stopColor="#fbbf24" /></linearGradient></defs>
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', textAlign: 'center' }}>
        <div>
          <div style={{ color: '#c4b5fd', fontSize: '.68rem', fontWeight: 950, letterSpacing: '.14em', textTransform: 'uppercase' }}>{band === null ? 'Prime' : 'Band'}</div>
          <div style={{ color: '#fff', fontSize: band === null ? '1.25rem' : '2.35rem', fontWeight: 950, letterSpacing: '-.05em' }}>{band === null ? 'Path ready' : formatBand(band)}</div>
          <div style={{ color: '#bae6fd', fontSize: '.75rem', fontWeight: 800 }}>{band === null ? 'baseline pending' : 'out of 9'}</div>
        </div>
      </div>
    </div>
  );
};

const IeltsPrimeDashboard: React.FC<Props> = ({ summary, lapsedPrime, taskTotal, completedTotal, recommendedSkill, recommendedRoute, onNavigate, onRedirectToPrime, formatDate }) => {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const activePrime = summary.isPrimeActive;
  const taskPercent = taskTotal ? Math.round((completedTotal / taskTotal) * 100) : 0;
  const skillCards: SkillCardModel[] = useMemo(() => [
    { skill: 'reading', label: 'Reading', benefit: 'Build speed, scanning, and evidence matching.', progress: summary.skillProgress.reading, overviewRoute: '/ielts/reading' },
    { skill: 'writing', label: 'Writing', benefit: 'Structure stronger Task 1 and Task 2 responses.', progress: summary.skillProgress.writing, overviewRoute: '/ielts/writing' },
    { skill: 'listening', label: 'Listening', benefit: 'Improve detail accuracy and distractor control.', progress: summary.skillProgress.listening, overviewRoute: '/ielts/listening' },
    { skill: 'speaking', label: 'Speaking', benefit: 'Practise fluent answers with clear response patterns.', progress: summary.skillProgress.speaking, overviewRoute: '/ielts/speaking' },
  ], [summary.skillProgress]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const bars = gsap.utils.toArray<HTMLElement>(root.querySelectorAll('[data-prime-progress]'));
    bars.forEach((bar) => gsap.set(bar, { scaleX: reduced ? 1 : 0, transformOrigin: 'left center' }));
    if (reduced) return;
    const ctx = gsap.context(() => {
      gsap.from('[data-prime-hero]', { opacity: 0, y: 24, duration: 0.75, ease: 'power3.out' });
      gsap.from('[data-prime-stat]', { opacity: 0, y: 18, duration: 0.55, ease: 'power3.out', stagger: 0.08, delay: 0.12 });
      gsap.from('[data-prime-skill]', { opacity: 0, y: 18, duration: 0.55, ease: 'power3.out', stagger: 0.08, delay: 0.24 });
      gsap.to(bars, { scaleX: 1, duration: 0.9, ease: 'power3.out', stagger: 0.06, delay: 0.25 });
    }, root);
    return () => ctx.revert();
  }, []);

  return (
    <div ref={rootRef} style={shell}>
      <main style={{ maxWidth: 1120, margin: '0 auto', display: 'grid', gap: '1rem' }}>
        <section data-prime-hero style={{ position: 'relative', overflow: 'hidden', borderRadius: '1.8rem', color: '#fff', padding: 'clamp(1.25rem,4vw,2.4rem)', background: 'radial-gradient(circle at 78% 18%, rgba(124,58,237,.52), transparent 28%), radial-gradient(circle at 20% 5%, rgba(14,165,233,.4), transparent 26%), linear-gradient(135deg,#08111f 0%,#172554 52%,#3b0764 100%)', boxShadow: '0 28px 80px rgba(30,41,59,.22)' }}>
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(90deg,rgba(255,255,255,.08) 1px,transparent 1px),linear-gradient(0deg,rgba(255,255,255,.06) 1px,transparent 1px)', backgroundSize: '44px 44px', opacity: .34 }} aria-hidden="true" />
          <div style={{ position: 'relative', display: 'grid', gridTemplateColumns: 'minmax(0,1.55fr) minmax(220px,.65fr)', gap: 'clamp(1.1rem,4vw,2rem)', alignItems: 'center' }} className="ielts-prime-hero-grid">
            <div>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '.45rem', background: activePrime ? 'rgba(34,197,94,.16)' : 'rgba(251,191,36,.16)', border: '1px solid rgba(255,255,255,.24)', borderRadius: 999, padding: '.42rem .78rem', fontWeight: 950, color: activePrime ? '#bbf7d0' : '#fde68a' }}>✦ {activePrime ? 'IELTS Prime Active' : lapsedPrime ? 'Prime access needs renewal' : 'Diagnostic complete'}</span>
              <h1 style={{ margin: '.85rem 0 .4rem', fontSize: 'clamp(2.15rem,6vw,4.25rem)', lineHeight: .94, letterSpacing: '-.07em' }}>Welcome back, {summary.displayName || 'IELTS learner'}</h1>
              <p style={{ margin: 0, color: '#dbeafe', fontSize: 'clamp(.98rem,2vw,1.12rem)', lineHeight: 1.65, maxWidth: 620 }}>{activePrime ? 'Continue your premium IELTS practice dashboard.' : 'You’re closer than you think. Your result shows where to focus next.'}</p>
              <div style={{ marginTop: '1.15rem', display: 'flex', gap: '.8rem', alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{ color: '#93c5fd', fontSize: '.72rem', fontWeight: 950, letterSpacing: '.14em', textTransform: 'uppercase' }}>Recommended next</div>
                <button type="button" onClick={() => onNavigate(recommendedRoute)} style={{ minHeight: 48, border: 0, borderRadius: 999, padding: '.9rem 1.2rem', background: 'linear-gradient(135deg,#ffffff,#e0f2fe)', color: '#312e81', fontWeight: 950, cursor: 'pointer', boxShadow: '0 16px 32px rgba(2,6,23,.24)' }}>Continue Learning →</button>
                <span style={{ color: '#bfdbfe', fontWeight: 800 }}>{skillName(recommendedSkill)} focus</span>
              </div>
            </div>
            <div><IeltsPrimeBandRing band={summary.diagnostic.estimatedBand} /><p style={{ margin: '.25rem auto 0', maxWidth: 230, color: '#e0e7ff', textAlign: 'center', lineHeight: 1.45, fontWeight: 750 }}>{summary.diagnostic.estimatedBand === null ? 'Band path ready when your baseline syncs.' : 'Starting point detected — not your limit.'}</p></div>
          </div>
        </section>

        <section style={{ ...glassCard, display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: '.75rem' }}>
          {[
            ['Plan', summary.subscription.plan || 'Monthly Prime'], ['Status', summary.subscription.status || 'Active'], ['Renewal', formatDate(summary.subscription.current_period_end)], ['Started', formatDate((summary.subscription as any).current_period_start) === 'Not available yet' ? 'Active from checkout' : formatDate((summary.subscription as any).current_period_start)],
          ].map(([k, v]) => <div data-prime-stat key={k} style={{ border: '1px solid rgba(124,58,237,.12)', borderRadius: '1rem', padding: '.9rem', background: 'linear-gradient(180deg,#fff,#f8fafc)' }}><div style={{ color: '#64748b', fontSize: '.7rem', fontWeight: 950, letterSpacing: '.12em', textTransform: 'uppercase' }}>{k}</div><div style={{ marginTop: '.22rem', color: '#111827', fontWeight: 950 }}>{v}</div></div>)}
        </section>

        <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: '1rem' }}>
          {[
            ['✅', 'Diagnostic complete', `Completed ${formatDate(summary.diagnostic.completedAt)}`], ['📈', 'Tasks completed', `${completedTotal} / ${taskTotal} tasks completed`], ['🎯', 'Current focus skill', `${skillName(recommendedSkill)} — based on your diagnostic`], ['🕒', 'Recent activity', summary.recentActivity ? `Last practice: ${formatDate(summary.recentActivity)}` : 'Last practice: Not available yet'],
          ].map(([icon, title, text], index) => <div data-prime-stat key={title} style={glassCard}><div style={{ display: 'flex', gap: '.72rem', alignItems: 'flex-start' }}><span style={{ display: 'grid', placeItems: 'center', width: 38, height: 38, borderRadius: 14, background: index === 1 ? '#eef2ff' : '#f0f9ff' }}>{icon}</span><div><b style={{ color: '#0f172a' }}>{title}</b><p style={{ margin: '.28rem 0 0', color: '#475569', lineHeight: 1.45 }}>{text}</p></div></div>{index === 1 && <div style={{ height: 9, marginTop: '.8rem', borderRadius: 999, background: '#e2e8f0', overflow: 'hidden' }}><div data-prime-progress style={{ width: `${taskPercent}%`, height: '100%', borderRadius: 999, background: 'linear-gradient(90deg,#0ea5e9,#7c3aed)' }} /></div>}</div>)}
        </section>

        <section style={{ ...glassCard, display: 'flex', gap: '.65rem', flexWrap: 'wrap', alignItems: 'center' }}><b style={{ marginRight: '.25rem' }}>Your Prime plan includes</b>{['Guided practice','Skill-by-skill progress','Writing support','Speaking review','Band path dashboard'].map((item) => <span key={item} style={{ padding: '.45rem .7rem', borderRadius: 999, background: '#f5f3ff', color: '#5b21b6', fontWeight: 850, fontSize: '.84rem' }}>{item}</span>)}</section>

        <section style={glassCard}>
          <h2 style={{ margin: '0 0 .25rem', fontSize: 'clamp(1.45rem,3vw,2rem)', letterSpacing: '-.04em' }}>Skill tracks</h2>
          <p style={{ margin: '0 0 1rem', color: '#64748b' }}>Premium progress cards route through your existing next unfinished tasks.</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(230px,1fr))', gap: '.9rem' }}>{skillCards.map((card) => {
            const locked = !activePrime && ['writing', 'speaking'].includes(card.skill);
            const disabled = !locked && !card.progress.nextUnfinishedTaskRoute && !card.progress.allTasksCompleted;
            const destination = card.progress.nextUnfinishedTaskRoute || (card.progress.allTasksCompleted ? card.overviewRoute : null);
            const percent = progressPercent(card.progress);
            const status = locked ? 'Locked' : card.progress.totalAvailableTasks ? (card.progress.allTasksCompleted ? 'Completed' : 'Available') : 'Coming soon';
            return <div data-prime-skill key={card.skill} style={{ border: card.progress.allTasksCompleted ? '1px solid rgba(34,197,94,.35)' : '1px solid rgba(148,163,184,.22)', borderRadius: '1.2rem', padding: '1rem', background: card.progress.allTasksCompleted ? 'linear-gradient(180deg,#ffffff,#f0fdf4)' : card.progress.totalAvailableTasks ? '#fff' : '#f8fafc', transition: 'transform .2s ease, box-shadow .2s ease' }} onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-3px)'; e.currentTarget.style.boxShadow = '0 16px 34px rgba(15,23,42,.10)'; }} onMouseLeave={(e) => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'none'; }}><div style={{ display: 'flex', justifyContent: 'space-between', gap: '.75rem' }}><h3 style={{ margin: 0 }}>{card.label}</h3><span style={{ color: card.progress.allTasksCompleted ? '#047857' : card.progress.totalAvailableTasks ? '#2563eb' : '#64748b', fontWeight: 950, fontSize: '.78rem' }}>{status}</span></div><p style={{ color: '#64748b', minHeight: 48 }}>{card.benefit}</p><p style={{ fontSize: '.82rem', color: '#475569', fontWeight: 800 }}>{card.progress.completedTaskCount} / {card.progress.totalAvailableTasks} completed</p><div style={{ height: 9, margin: '.7rem 0 1rem', borderRadius: 999, background: '#e2e8f0', overflow: 'hidden' }}><div data-prime-progress style={{ width: `${percent}%`, height: '100%', borderRadius: 999, background: card.progress.allTasksCompleted ? 'linear-gradient(90deg,#22c55e,#14b8a6)' : 'linear-gradient(90deg,#38bdf8,#8b5cf6)' }} /></div><button type="button" disabled={disabled} onClick={() => locked ? onRedirectToPrime() : destination && onNavigate(destination)} style={{ width: '100%', minHeight: 44, border: 0, borderRadius: '.85rem', padding: '.75rem', fontWeight: 950, cursor: disabled ? 'default' : 'pointer', background: locked ? '#ede9fe' : card.progress.allTasksCompleted ? '#dcfce7' : card.progress.totalAvailableTasks ? '#0f172a' : '#e2e8f0', color: locked ? '#6d28d9' : card.progress.allTasksCompleted ? '#166534' : card.progress.totalAvailableTasks ? '#fff' : '#64748b' }}>{locked ? 'Unlock with Prime' : card.progress.buttonLabel}</button></div>;
          })}</div>
        </section>
        {summary.subscription.management_url && <a href={summary.subscription.management_url} style={{ color: '#334155', fontWeight: 850 }}>Manage subscription</a>}
        <button onClick={() => onNavigate('/')} style={{ padding: '.8rem', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '.9rem', cursor: 'pointer', fontWeight: 850 }}>← Back to Brain Heist Game</button>
      </main>
      <style>{`@media (max-width: 760px) { .ielts-prime-hero-grid { grid-template-columns: 1fr !important; } }`}</style>
    </div>
  );
};

export default IeltsPrimeDashboard;
