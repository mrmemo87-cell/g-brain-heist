import { useRef, type ReactNode } from 'react';
import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import { MotionPathPlugin } from 'gsap/MotionPathPlugin';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import DotLottieAnimation from '../../components/DotLottieAnimation';
import './presentation.css';

gsap.registerPlugin(useGSAP, ScrollTrigger, MotionPathPlugin);

const STORAGE = 'https://sozodkxwhubespiedgxm.supabase.co/storage/v1/object/public';
const pAsset = (name: string) => `${STORAGE}/presentation/${encodeURIComponent(name)}`;
const assets = {
  logo: `${STORAGE}/logo/logo.svg`,
  eye: `${STORAGE}/lotties/${encodeURIComponent('Eye scanning logo Lottie JSON animation.lottie')}`,
  connected: pAsset('brains-heist-connected-school-ecosystem-finale-no-bg.png'),
  teacher: pAsset('brains-heist-teacher-presenting-alpha.png'),
  student: pAsset('brains-heist-student-thinking-alpha.png'),
  rival: pAsset('brains-heist-rival-clan-student-challenge-no-bg.png'),
  ai: pAsset('brains-heist-ai-mentor-presenting-alpha.png'),
  validation: pAsset('brains-heist-teacher-ai-writing-validation-true-no-bg-v2.png'),
  profile: pAsset('brains-heist-student-academic-profile-no-bg.png'),
  parent: pAsset('brains-heist-parent-dashboard-correct-phone-no-bg.png'),
  leader: pAsset('brains-heist-principal-school-oversight-alpha.png'),
} as const;

const modules = [
  ['Admissions', 'Diagnostic applicant profiles', '/mission-console-images/lockdown.webp'],
  ['IELTS', 'Preparation and assessment', '/mission-console-images/ielts-prep.webp'],
  ['Cambridge', 'Exam-ready practice', '/mission-console-images/cambridge-tests.webp'],
  ['Writing Hub', 'Evidence-led feedback', '/mission-console-images/writing.webp'],
  ['Tournaments', 'Whole-school competition', '/mission-console-images/tournament.webp'],
] as const;

type HeadingProps = { number: string; label: string; title: ReactNode; children: ReactNode };
const Heading = ({ number, label, title, children }: HeadingProps) => <div className="journey-copy" data-copy><div className="journey-kicker"><span>{number}</span><i />{label}</div><h2>{title}</h2><p>{children}</p></div>;
const Phrase = ({ children }: { children: string }) => <div className="signal-phrase" aria-label={children}>{children.split(' ').map((word, i) => <span key={`${word}-${i}`} aria-hidden="true">{word}</span>)}</div>;

const WorldLine = () => <svg className="world-line" viewBox="0 0 1000 11600" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="world-gradient" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#35f6ff"/><stop offset=".46" stopColor="#8b5cff"/><stop offset=".72" stopColor="#ff4aa2"/><stop offset="1" stopColor="#35f6ff"/></linearGradient><filter id="signal-glow" x="-250%" y="-250%" width="600%" height="600%"><feGaussianBlur stdDeviation="12" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs><path className="world-line__ghost" d="M505 80 C760 380 220 710 505 1060 S800 1600 555 2050 S210 2590 455 3100 S810 3610 585 4160 S225 4680 490 5200 S800 5740 535 6300 S190 6900 500 7480 S830 8090 560 8700 S190 9300 485 9940 S790 10700 500 11520"/><path data-world-path className="world-line__live" d="M505 80 C760 380 220 710 505 1060 S800 1600 555 2050 S210 2590 455 3100 S810 3610 585 4160 S225 4680 490 5200 S800 5740 535 6300 S190 6900 500 7480 S830 8090 560 8700 S190 9300 485 9940 S790 10700 500 11520"/><g data-signal-orb className="world-line__orb" filter="url(#signal-glow)"><circle r="62" fill="#35f6ff" opacity=".08"/><circle r="34" fill="#35f6ff" opacity=".18"/><ellipse rx="25" ry="15" fill="#35f6ff" opacity=".58"/><circle r="7" fill="#f5ffff"/></g></svg>;

const Bars = ({ labels }: { labels: string[] }) => <div className="metric-bars">{labels.map((label, i) => <div className="metric-bar" key={label}><div><span>{label}</span><em>{['growing','connected','validated'][i % 3]}</em></div><i><b data-fill style={{ '--fill': `${64 + i * 11}%` } as React.CSSProperties}/></i></div>)}</div>;
const Gauge = ({ label, value }: { label: string; value: number }) => <div className="radial-gauge"><svg viewBox="0 0 120 120" aria-hidden="true"><circle cx="60" cy="60" r="48"/><circle data-gauge cx="60" cy="60" r="48" pathLength="100"/></svg><div><strong>{value}</strong><span>{label}</span></div></div>;

const PresentationPage = () => {
  const rootRef = useRef<HTMLElement>(null);

  useGSAP(() => {
    const root = rootRef.current;
    if (!root) return;
    const path = root.querySelector<SVGPathElement>('[data-world-path]');
    const orb = root.querySelector<SVGGElement>('[data-signal-orb]');
    const mm = gsap.matchMedia();
    mm.add('(prefers-reduced-motion: no-preference)', () => {
      if (path && orb) {
        const length = path.getTotalLength();
        gsap.set(path, { strokeDasharray: length, strokeDashoffset: length });
        gsap.to(path, { strokeDashoffset: 0, ease: 'none', scrollTrigger: { trigger: root, start: 'top top', end: 'bottom bottom', scrub: .45 } });
        gsap.to(orb, { motionPath: { path, align: path, alignOrigin: [.5,.5] }, ease: 'none', scrollTrigger: { trigger: root, start: 'top top', end: 'bottom bottom', scrub: .35 } });
      }
      gsap.from('.hero-lockup > *', { y: 70, autoAlpha: 0, rotateX: -10, duration: 1.15, stagger: .09, ease: 'power4.out' });
      root.querySelectorAll<HTMLElement>('[data-journey]').forEach(scene => { const copy = scene.querySelector('[data-copy]'); if (copy) gsap.fromTo(copy.children, { y: 55, autoAlpha: 0 }, { y: 0, autoAlpha: 1, stagger: .08, ease: 'power3.out', scrollTrigger: { trigger: scene, start: 'top 74%', end: 'top 28%', scrub: .55 } }); });
      gsap.fromTo('.connect-cast', { scale: .7, autoAlpha: 0, filter: 'blur(14px)' }, { scale: 1, autoAlpha: 1, filter: 'blur(0px)', scrollTrigger: { trigger: '.connect-scene', start: 'top 65%', end: 'center 55%', scrub: .5 } });
      gsap.fromTo('.connect-ring', { scale: .25, autoAlpha: 0 }, { scale: 1, autoAlpha: 1, stagger: .12, ease: 'back.out(1.5)', scrollTrigger: { trigger: '.connect-scene', start: 'top 55%', end: 'center 50%', scrub: .5 } });
      gsap.fromTo('.forge-panel > *', { x: -65, autoAlpha: 0 }, { x: 0, autoAlpha: 1, stagger: .1, ease: 'expo.out', scrollTrigger: { trigger: '.forge-scene', start: 'top 58%', end: 'center 50%', scrub: .45 } });
      gsap.fromTo('.teacher-main', { xPercent: 32, rotate: 3, autoAlpha: 0 }, { xPercent: 0, rotate: 0, autoAlpha: 1, scrollTrigger: { trigger: '.forge-scene', start: 'top 62%', end: 'center 48%', scrub: .45 } });
      gsap.fromTo('.mission-node', { y: (i) => i % 2 ? 50 : -50, autoAlpha: 0, rotate: -12 }, { y: 0, autoAlpha: 1, rotate: 0, stagger: .15, ease: 'back.out(1.7)', scrollTrigger: { trigger: '.student-scene', start: 'top 58%', end: 'center 52%', scrub: .4 } });
      gsap.fromTo('.student-main', { clipPath: 'inset(100% 0 0 0)', scale: .88 }, { clipPath: 'inset(0% 0 0 0)', scale: 1, scrollTrigger: { trigger: '.student-scene', start: 'top 60%', end: 'center 45%', scrub: .5 } });
      gsap.to('.student-scene [data-gauge]', { strokeDashoffset: 28, ease: 'none', scrollTrigger: { trigger: '.student-scene', start: 'top 48%', end: 'bottom 60%', scrub: .4 } });
      gsap.fromTo('.war-arena', { scale: 1.18, xPercent: -8, filter: 'saturate(.35)' }, { scale: 1, xPercent: 0, filter: 'saturate(1.15)', scrollTrigger: { trigger: '.war-scene', start: 'top 65%', end: 'center 50%', scrub: .35 } });
      gsap.fromTo('.war-character', { xPercent: 42, rotate: 5 }, { xPercent: 0, rotate: 0, scrollTrigger: { trigger: '.war-scene', start: 'top 54%', end: 'center 46%', scrub: .4 } });
      gsap.utils.toArray<HTMLElement>('[data-fill]').forEach(fill => gsap.to(fill, { scaleX: 1, ease: 'none', scrollTrigger: { trigger: fill.closest('section') || fill, start: 'top 65%', end: 'bottom 55%', scrub: .35 } }));
      const track = root.querySelector<HTMLElement>('.proof-track');
      if (track && window.matchMedia('(min-width: 821px)').matches) {
        const horizontal = gsap.to(track, { xPercent: -75, ease: 'none', scrollTrigger: { trigger: '.proof-journey', start: 'top top', end: 'bottom bottom', scrub: .55 } });
        gsap.utils.toArray<HTMLElement>('.proof-panel').forEach(panel => gsap.fromTo(panel.querySelectorAll('.signal-phrase span'), { yPercent: 115, rotate: 7, autoAlpha: 0 }, { yPercent: 0, rotate: 0, autoAlpha: 1, stagger: .05, scrollTrigger: { trigger: panel, containerAnimation: horizontal, start: 'left 68%', end: 'center 55%', scrub: .4 } }));
      }
      gsap.fromTo('.neural-link', { strokeDasharray: 420, strokeDashoffset: 420 }, { strokeDashoffset: 0, stagger: .08, scrollTrigger: { trigger: '.profile-proof', start: 'left 85%', end: 'center 45%', scrub: .5 } });
      gsap.fromTo('.parent-data', { xPercent: 0 }, { xPercent: -102, scrollTrigger: { trigger: '.parent-scene', start: 'top 52%', end: 'center 46%', scrub: .45 } });
      gsap.fromTo('.parent-character', { xPercent: 25, scale: .88, autoAlpha: 0 }, { xPercent: 0, scale: 1, autoAlpha: 1, scrollTrigger: { trigger: '.parent-scene', start: 'top 64%', end: 'center 52%', scrub: .4 } });
      gsap.fromTo('.lead-map', { scale: 2.2, xPercent: -22, yPercent: 18, filter: 'blur(9px)' }, { scale: 1, xPercent: 0, yPercent: 0, filter: 'blur(0px)', scrollTrigger: { trigger: '.lead-scene', start: 'top 65%', end: 'center 45%', scrub: .5 } });
      gsap.fromTo('.leader-character', { xPercent: 24, autoAlpha: 0 }, { xPercent: 0, autoAlpha: 1, scrollTrigger: { trigger: '.lead-scene', start: 'top 55%', end: 'center 45%', scrub: .4 } });
      gsap.fromTo('.vault-module', { scale: .15, autoAlpha: 0 }, { scale: 1, autoAlpha: 1, stagger: .1, ease: 'back.out(1.7)', scrollTrigger: { trigger: '.vault-scene', start: 'top 60%', end: 'center 48%', scrub: .4 } });
      gsap.fromTo('.vault-core', { rotate: -90, scale: .6 }, { rotate: 0, scale: 1, scrollTrigger: { trigger: '.vault-scene', start: 'top 62%', end: 'center 42%', scrub: .5 } });
      const refresh = () => ScrollTrigger.refresh(); window.addEventListener('load', refresh, { once: true }); return () => window.removeEventListener('load', refresh);
    });
    return () => mm.revert();
  }, { scope: rootRef });

  return <main className="journey" ref={rootRef}>
    <div className="journey-atmosphere" aria-hidden="true"><i/><i/><i/></div><WorldLine/>
    <section className="journey-hero" aria-labelledby="journey-title"><nav className="hero-nav"><a href="/"><img src={assets.logo} alt=""/><span>Brains Heist</span></a><small>CONNECTED SCHOOL JOURNEY / 01</small></nav><div className="hero-lockup"><div className="hero-kicker"><span/>LEARNING ECOSYSTEM ONLINE</div><h1 id="journey-title">Follow one signal.<br/><em>See the whole learner.</em></h1><p>Scroll into a school where every mission, insight and human decision strengthens the next move.</p><div className="hero-direct"><i/><span>Direct the signal downward</span></div></div><div className="hero-eye" aria-hidden="true"><DotLottieAnimation src={assets.eye} width={440} height={300} respectLightMode={false}/></div><div className="hero-depth" aria-hidden="true"><b>DISCOVER</b><b>PROVE</b><b>GROW</b></div></section>
    <section className="journey-scene connect-scene" data-journey><div className="scene-glow scene-glow--cyan"/><Heading number="01" label="THE SCHOOL CONNECTS" title={<>Four roles.<br/>One learning signal.</>}>Classes, subjects, teachers, students and parents enter one ecosystem—each seeing the part of the story they need.</Heading><div className="connect-world"><i className="connect-ring connect-ring--one"/><i className="connect-ring connect-ring--two"/><i className="connect-ring connect-ring--three"/><img className="connect-cast" src={assets.connected} alt="A student, teacher, parent and school leader connected in one learning ecosystem"/><div className="role-tag role-tag--teacher">Teacher <span>creates</span></div><div className="role-tag role-tag--student">Student <span>learns</span></div><div className="role-tag role-tag--parent">Parent <span>understands</span></div><div className="role-tag role-tag--leader">Leader <span>sees</span></div></div><Phrase>EVERY ROLE SEES WHAT MATTERS</Phrase></section>
    <section className="journey-scene forge-scene" data-journey><div className="scene-glow scene-glow--violet"/><Heading number="02" label="MISSION FORGE" title={<>The teacher turns intent<br/>into action.</>}>Select questions, assign academic missions or writing tasks, choose students, then publish now or schedule for later.</Heading><img className="scene-character teacher-main" src={assets.teacher} alt="Teacher presenting a newly created academic mission" loading="lazy"/><div className="forge-panel"><header><span>MISSION FORGE</span><em>DRAFT SECURED</em></header>{['Choose content','Select learners','Set the launch'].map((x,i)=><div className="forge-step" key={x}><b>0{i+1}</b><span>{x}</span><small>{['Questions + writing','Class 8A','Now or scheduled'][i]}</small></div>)}<Bars labels={['Mission built','Learners selected','Launch ready']}/><button type="button" tabIndex={-1}>PUBLISH MISSION <span>→</span></button></div></section>
    <section className="journey-scene student-scene" data-journey><div className="scene-glow scene-glow--blue"/><Heading number="03" label="STUDENT MISSIONS" title={<>Learning becomes<br/>something you do.</>}>Students answer questions, write responses, earn XP and see immediate progress—without losing sight of the academic goal.</Heading><div className="student-zone"><img className="scene-character student-main" src={assets.student} alt="Student thinking through an academic mission" loading="lazy"/><Gauge label="XP" value={72}/><div className="mission-route">{[['Start-Node-Icon.png','ENTER'],['Question-Node-Icon.png','RESPOND'],['Reward-Node-Icon.png','LEVEL UP']].map(([icon,label],i)=><span key={label} className="mission-fragment"><div className="mission-node"><img src={`/nodes/${icon}`} alt=""/><span>{label}</span></div>{i<2&&<i/>}</span>)}</div></div><Phrase>ANSWER. ADAPT. ADVANCE.</Phrase></section>
    <section className="journey-scene war-scene" data-journey><Heading number="04" label="CLAN WARS" title={<>Now the whole classroom<br/>is in the game.</>}>Teams compete through academic performance in a high-energy class activity. Every correct move powers the clan.</Heading><div className="war-arena"><img className="war-backdrop" src="/rivalry_assets/backgrounds/live-war.png" alt="" loading="lazy"/><div className="war-score"><div><span>NEON WOLVES</span><strong>ACADEMIC ENERGY</strong><i><b data-fill style={{'--fill':'84%'} as React.CSSProperties}/></i></div><em>VS</em><div><span>VOID RUNNERS</span><strong>TEAM MOMENTUM</strong><i><b data-fill style={{'--fill':'67%'} as React.CSSProperties}/></i></div></div><img className="war-character" src={assets.rival} alt="Student leading a live academic clan battle" loading="lazy"/><img className="war-impact" src="/rivalry_assets/fx/strike.png" alt="" loading="lazy"/></div><Phrase>KNOWLEDGE BECOMES MOMENTUM</Phrase></section>
    <section className="proof-journey" aria-label="From analysis to targeted action"><div className="proof-viewport"><div className="proof-track">
      <article className="proof-panel proof-panel--ai"><Heading number="05" label="AI ANALYSIS" title={<>AI finds the pattern.</>}>The system identifies writing strengths, weaknesses and exact supporting evidence.</Heading><img className="proof-character ai-character" src={assets.ai} alt="AI mentor surfacing patterns in student writing" loading="lazy"/><div className="scan-card"><small>WRITING EVIDENCE / 04</small><p>The learner states a clear position and supports it with relevant examples.</p><span>Clear position</span><span>Supporting evidence</span><i/></div><Phrase>AI ANALYZES</Phrase></article>
      <article className="proof-panel proof-panel--validate"><Heading number="05B" label="HUMAN IN THE LOOP" title={<>The teacher decides<br/>what becomes truth.</>}>The teacher reviews the evidence, adjusts the finding and confirms what enters the student record.</Heading><img className="proof-character validation-character" src={assets.validation} alt="Teacher validating AI-supported writing feedback" loading="lazy"/><div className="validation-stamp"><span>TEACHER</span><strong>VALIDATED</strong><i>✓</i></div><div className="evidence-bars"><Bars labels={['Claim identified','Evidence located','Teacher confirmed']}/></div><Phrase>TEACHERS VALIDATE</Phrase></article>
      <article className="proof-panel profile-proof"><Heading number="06" label="ACADEMIC PROFILE" title={<>Evidence becomes<br/>understanding.</>}>Every validated task grows a living profile of strengths, focus areas, improved skills and recommended next practice.</Heading><img className="proof-character profile-character" src={assets.profile} alt="Student presenting a living academic profile" loading="lazy"/><svg className="profile-network" viewBox="0 0 520 430" aria-hidden="true"><g fill="none"><path className="neural-link" d="M258 211L84 72M258 211L438 69M258 211L448 235M258 211L376 376M258 211L117 367"/><path className="neural-link" d="M84 72L438 69M438 69L448 235M448 235L376 376M376 376L117 367" opacity=".25"/></g><g><circle cx="258" cy="211" r="55"/><circle cx="84" cy="72" r="36"/><circle cx="438" cy="69" r="36"/><circle cx="448" cy="235" r="36"/><circle cx="376" cy="376" r="36"/><circle cx="117" cy="367" r="36"/></g></svg><Phrase>A LIVING PROFILE GROWS</Phrase></article>
      <article className="proof-panel proof-panel--act"><Heading number="07" label="TARGETED ACTION" title={<>The next move is<br/>already visible.</>}>The teacher converts an identified gap into personalized practice or a focused intervention.</Heading><img className="proof-character action-character" src={assets.teacher} alt="Teacher turning an insight into targeted action" loading="lazy"/><div className="action-transform"><div><small>FOCUS AREA</small><strong>Supporting an argument</strong><span>Recurring gap across writing</span></div><b>→</b><div><small>PERSONAL MISSION</small><strong>Evidence Builder</strong><span>Ready to assign</span></div></div><Phrase>INSIGHT BECOMES ACTION</Phrase></article>
    </div></div></section>
    <section className="journey-scene parent-scene" data-journey><div className="scene-glow scene-glow--cyan"/><Heading number="08" label="PARENT CONFIDENCE" title={<>Not a score dump.<br/>A clear progress story.</>}>Parents see progress, achievements, strengths, current focus areas and teacher-validated feedback in language they can understand.</Heading><img className="scene-character parent-character" src={assets.parent} alt="Parent confidently viewing a clear learner progress story" loading="lazy"/><div className="parent-dashboard"><div className="parent-data"><small>TERM DATA EXPORT</small><strong>72 8/12 B−<br/>6.4 81%</strong><span>Q4 / L2 / R7 / Δ−0.2</span></div><div className="parent-story"><small>CURRENT STORY</small><h3>Writing confidence is growing.</h3><p>Next focus: use stronger supporting evidence.</p><Bars labels={['Progress visible','Focus understood','Feedback validated']}/><em>TEACHER VALIDATED</em></div></div><blockquote>Strengthen parent confidence through continuous visibility, evidence-based progress and teacher-validated feedback.</blockquote></section>
    <section className="journey-scene lead-scene" data-journey><div className="scene-glow scene-glow--violet"/><Heading number="09" label="SCHOOL LEADERSHIP" title={<>Zoom out.<br/>See the whole school move.</>}>Leaders monitor engagement, class coverage, academic activity and intervention needs—without losing the human story beneath the patterns.</Heading><img className="scene-character leader-character" src={assets.leader} alt="School leader monitoring learning across the school" loading="lazy"/><div className="lead-map"><div className="lead-gauges"><Gauge label="ACTIVE" value={86}/><Gauge label="COVERAGE" value={74}/></div><div className="class-grid">{['7A','7B','8A','8B','9A','9B'].map((name,i)=><div key={name} className={i===4?'is-focus':''}><span>{name}</span><small>{i===4?'REVIEW FOCUS':'LEARNING ACTIVE'}</small><i><b data-fill style={{'--fill':`${52+i*7}%`} as React.CSSProperties}/></i></div>)}</div></div><Phrase>FROM ONE LEARNER TO THE WHOLE SCHOOL</Phrase></section>
    <section className="journey-scene vault-scene" data-journey><div className="vault-heading"><Heading number="10" label="THE VAULT OPENS" title={<>One platform.<br/>A much bigger future.</>}>The connected school journey becomes the foundation for admissions, IELTS, Cambridge assessments, writing, tournaments and the modules still to come.</Heading></div><div className="vault-system"><div className="vault-rings"><i/><i/><i/></div><div className="vault-core"><img src={assets.logo} alt="Brains Heist"/><span>ECOSYSTEM</span></div>{modules.map((m,i)=><div className={`vault-module vault-module--${i+1}`} key={m[0]}><img src={m[2]} alt=""/><div><strong>{m[0]}</strong><span>{m[1]}</span></div></div>)}</div><div className="vault-finale"><p>One connected journey. Every learner understood. Every next step made visible.</p><strong>Learn. Compete. Grow.</strong><a href="/">ENTER BRAINS HEIST <span>→</span></a></div></section>
  </main>;
};

export default PresentationPage;
