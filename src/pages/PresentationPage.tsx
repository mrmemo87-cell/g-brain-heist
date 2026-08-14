import { useRef, type ReactNode } from 'react';
import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import { MotionPathPlugin } from 'gsap/MotionPathPlugin';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import DotLottieAnimation from '../../components/DotLottieAnimation';
import './presentation.css';

gsap.registerPlugin(useGSAP, ScrollTrigger, MotionPathPlugin);

const STORAGE = 'https://sozodkxwhubespiedgxm.supabase.co/storage/v1/object/public';
const presentationAsset = (filename: string) => `${STORAGE}/presentation/${encodeURIComponent(filename)}`;
const lottieAsset = (filename: string) => `${STORAGE}/lotties/${encodeURIComponent(filename)}`;

const assets = {
  logo: `${STORAGE}/logo/logo.svg`,
  eyeScan: lottieAsset('Eye scanning logo Lottie JSON animation.lottie'),
  connectedSchool: presentationAsset('brains-heist-connected-school-ecosystem-finale-no-bg.png'),
  teacherPresenting: presentationAsset('brains-heist-teacher-presenting-alpha.png'),
  studentThinking: presentationAsset('brains-heist-student-thinking-alpha.png'),
  studentVictory: presentationAsset('brains-heist-student-clan-victory-alpha.png'),
  rival: presentationAsset('brains-heist-rival-clan-student-challenge-no-bg.png'),
  aiMentor: presentationAsset('brains-heist-ai-mentor-presenting-alpha.png'),
  teacherValidation: presentationAsset('brains-heist-teacher-ai-writing-validation-true-no-bg-v2.png'),
  academicProfile: presentationAsset('brains-heist-student-academic-profile-no-bg.png'),
  parentDashboard: presentationAsset('brains-heist-parent-dashboard-correct-phone-no-bg.png'),
  principalOversight: presentationAsset('brains-heist-principal-school-oversight-alpha.png'),
} as const;

const chapters = ['Connect', 'Create', 'Learn', 'Compete', 'Validate', 'Understand', 'Act', 'Reassure', 'Lead', 'Expand'] as const;

const modules = [
  { title: 'Admissions', copy: 'Diagnostic applicant profiles', icon: '/mission-console-images/lockdown.webp', accent: 'cyan' },
  { title: 'IELTS', copy: 'Preparation and assessment', icon: '/mission-console-images/ielts-prep.webp', accent: 'violet' },
  { title: 'Cambridge', copy: 'Exam-ready practice', icon: '/mission-console-images/cambridge-tests.webp', accent: 'pink' },
  { title: 'Writing Hub', copy: 'Evidence-led feedback', icon: '/mission-console-images/writing.webp', accent: 'gold' },
  { title: 'Tournaments', copy: 'Whole-school competition', icon: '/mission-console-images/tournament.webp', accent: 'cyan' },
] as const;

type SceneHeadingProps = {
  eyebrow: string;
  title: string;
  children: ReactNode;
  align?: 'left' | 'center';
};

const SceneHeading = ({ eyebrow, title, children, align = 'left' }: SceneHeadingProps) => (
  <div className={`bhp-copy bhp-copy--${align}`}>
    <div className="bhp-eyebrow" data-reveal><span aria-hidden="true" />{eyebrow}</div>
    <h2 data-reveal>{title}</h2>
    <p data-reveal>{children}</p>
  </div>
);

const HudCorners = () => (
  <div className="bhp-hud-corners" aria-hidden="true"><i /><i /><i /><i /></div>
);

const LearningSignal = () => (
  <svg className="bhp-signal-map" viewBox="0 0 1000 1000" preserveAspectRatio="none" aria-hidden="true">
    <defs>
      <linearGradient id="bhp-path-gradient" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#35f6ff" />
        <stop offset=".5" stopColor="#8b5cff" />
        <stop offset="1" stopColor="#ff4aa2" />
      </linearGradient>
      <filter id="bhp-signal-glow" x="-200%" y="-200%" width="500%" height="500%">
        <feGaussianBlur stdDeviation="12" result="blur" />
        <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
      </filter>
    </defs>
    <path id="bhp-signal-path" data-signal-path d="M110 710 C165 475 285 355 430 470 S690 775 866 590 S750 248 530 286 S230 145 132 356 S370 860 650 728 S904 525 850 240" />
    <g data-learning-signal filter="url(#bhp-signal-glow)">
      <circle r="34" fill="#35f6ff" opacity=".12" /><circle r="17" fill="#35f6ff" opacity=".28" /><circle r="7" fill="#f4feff" />
    </g>
  </svg>
);

const NeuralProfile = () => (
  <svg className="bhp-neural" viewBox="0 0 620 540" aria-label="A living academic profile connecting evidence across skills">
    <defs><linearGradient id="bhp-neural-gradient" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#35f6ff" /><stop offset=".55" stopColor="#8b5cff" /><stop offset="1" stopColor="#ff4aa2" /></linearGradient></defs>
    <g className="bhp-neural__links" fill="none" stroke="url(#bhp-neural-gradient)">
      <path d="M310 270L108 104M310 270L514 102M310 270L530 282M310 270L472 458M310 270L148 456" />
      <path d="M108 104L514 102M514 102L530 282M530 282L472 458M472 458L148 456M148 456L108 104" opacity=".22" />
    </g>
    <g className="bhp-neural__nodes">
      <g transform="translate(310 270)"><circle r="68" /><text textAnchor="middle" y="-3">LIVING</text><text textAnchor="middle" y="20">PROFILE</text></g>
      <g transform="translate(108 104)"><circle r="48" /><text textAnchor="middle" y="5">STRENGTHS</text></g>
      <g transform="translate(514 102)"><circle r="48" /><text textAnchor="middle" y="-4">FOCUS</text><text textAnchor="middle" y="14">AREAS</text></g>
      <g transform="translate(530 282)"><circle r="48" /><text textAnchor="middle" y="-4">SKILLS</text><text textAnchor="middle" y="14">IMPROVED</text></g>
      <g transform="translate(472 458)"><circle r="48" /><text textAnchor="middle" y="-4">NEXT</text><text textAnchor="middle" y="14">PRACTICE</text></g>
      <g transform="translate(148 456)"><circle r="48" /><text textAnchor="middle" y="-4">VALIDATED</text><text textAnchor="middle" y="14">EVIDENCE</text></g>
    </g>
  </svg>
);

const PresentationPage = () => {
  const rootRef = useRef<HTMLElement>(null);
  const storyRef = useRef<HTMLElement>(null);

  useGSAP(() => {
    const root = rootRef.current;
    const story = storyRef.current;
    if (!root || !story) return;

    const scenes = gsap.utils.toArray<HTMLElement>('[data-scene]', root);
    const railItems = gsap.utils.toArray<HTMLElement>('[data-rail-item]', root);
    const signal = root.querySelector<SVGGElement>('[data-learning-signal]');
    const signalPath = root.querySelector<SVGPathElement>('[data-signal-path]');
    const matchMedia = gsap.matchMedia();

    matchMedia.add('(prefers-reduced-motion: no-preference)', () => {
      gsap.set(scenes, { autoAlpha: 0 });
      gsap.set(scenes[0], { autoAlpha: 1 });
      gsap.set(scenes[0].querySelectorAll('[data-reveal]'), { autoAlpha: 1, y: 0 });
      if (signalPath) gsap.set(signalPath, { strokeDasharray: 18, strokeDashoffset: 520 });

      const setActiveChapter = (progress: number) => {
        const activeIndex = Math.min(chapters.length - 1, Math.floor(progress * chapters.length));
        root.style.setProperty('--bhp-progress', `${progress * 100}%`);
        railItems.forEach((item, index) => item.toggleAttribute('data-active', index === activeIndex));
      };

      const timeline = gsap.timeline({
        defaults: { ease: 'power2.inOut' },
        scrollTrigger: {
          trigger: story,
          start: 'top top',
          end: 'bottom bottom',
          scrub: 0.8,
          invalidateOnRefresh: true,
          onUpdate: (self) => setActiveChapter(self.progress),
        },
      });

      if (signal && signalPath) {
        timeline.to(signal, { motionPath: { path: signalPath, align: signalPath, alignOrigin: [0.5, 0.5] }, duration: 20, ease: 'none' }, 0);
        timeline.to(signalPath, { strokeDashoffset: 0, duration: 20, ease: 'none' }, 0);
      }

      scenes.forEach((scene, index) => {
        const at = index * 2;
        const reveals = scene.querySelectorAll('[data-reveal]');
        const cinematic = scene.querySelectorAll('[data-cinematic]');

        if (index > 0) {
          timeline.to(scenes[index - 1], { autoAlpha: 0, duration: 0.38 }, at - 0.28);
          timeline.fromTo(scene, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.42 }, at - 0.04);
        }
        timeline.fromTo(reveals, { autoAlpha: index === 0 ? 1 : 0, y: index === 0 ? 0 : 34 }, { autoAlpha: 1, y: 0, duration: 0.66, stagger: 0.06 }, at + 0.02);
        timeline.fromTo(cinematic, { autoAlpha: index === 0 ? 1 : 0, scale: index === 0 ? 1 : 0.9, y: index === 0 ? 0 : 38 }, { autoAlpha: 1, scale: 1, y: 0, duration: 0.9, stagger: 0.08 }, at + 0.12);
        if (index < scenes.length - 1) timeline.to(cinematic, { scale: 1.025, duration: 0.78, ease: 'none' }, at + 1.04);
      });

      if (signal) timeline.to(signal, { scale: 1.8, duration: 1.5, ease: 'power2.out' }, 18.5);
      setActiveChapter(0);

      const refresh = () => ScrollTrigger.refresh();
      window.addEventListener('load', refresh, { once: true });
      return () => window.removeEventListener('load', refresh);
    });

    return () => matchMedia.revert();
  }, { scope: rootRef });

  return (
    <main ref={rootRef} className="bhp-shell">
      <a className="bhp-home" href="/" aria-label="Return to Brains Heist home"><img src={assets.logo} alt="" /><span>Brains Heist</span></a>

      <section ref={storyRef} className="bhp-story" aria-label="The Brains Heist school journey">
        <div className="bhp-stage">
          <div className="bhp-aurora" aria-hidden="true" /><div className="bhp-grid" aria-hidden="true" /><div className="bhp-grain" aria-hidden="true" />
          <HudCorners /><LearningSignal />

          <header className="bhp-system-bar" aria-label="Presentation status">
            <div><span className="bhp-status-dot" /> Learning ecosystem online</div>
            <div className="bhp-system-bar__center">Scroll to direct the journey</div>
            <div>BH / SCHOOL.OS</div>
          </header>

          <div className="bhp-scenes">
            <article className="bhp-scene bhp-scene--connect" data-scene="0">
              <SceneHeading eyebrow="01 / The school connects" title="Four roles. One learning signal.">Classes, subjects, teachers, students and parents enter one connected ecosystem—each seeing the part of the story they need.</SceneHeading>
              <div className="bhp-connect-visual" data-cinematic>
                <div className="bhp-orbit bhp-orbit--one" /><div className="bhp-orbit bhp-orbit--two" />
                <img src={assets.connectedSchool} alt="A student, teacher, parent and school leader connected in one school ecosystem" fetchPriority="high" />
                <div className="bhp-node-label bhp-node-label--teacher">Teacher</div><div className="bhp-node-label bhp-node-label--student">Student</div><div className="bhp-node-label bhp-node-label--parent">Parent</div><div className="bhp-node-label bhp-node-label--leader">Leader</div>
              </div>
              <div className="bhp-boot-card" data-reveal>
                <DotLottieAnimation src={assets.eyeScan} width={190} height={126} respectLightMode={false} />
                <div><small>Identity confirmed</small><strong>School ecosystem connected</strong></div>
              </div>
            </article>

            <article className="bhp-scene bhp-scene--create" data-scene="1">
              <SceneHeading eyebrow="02 / Mission forge" title="Teachers create work effortlessly.">Select questions, assign academic missions or writing tasks, choose students, then publish now or schedule for later.</SceneHeading>
              <div className="bhp-character bhp-character--teacher" data-cinematic><div className="bhp-character-glow" /><img src={assets.teacherPresenting} alt="Teacher presenting a newly created academic mission" loading="lazy" decoding="async" /></div>
              <div className="bhp-forge" data-cinematic>
                <div className="bhp-forge__header"><span>MISSION FORGE</span><em>Draft secured</em></div>
                <div className="bhp-forge__row"><b>01</b><span>Choose content</span><i>Questions + writing</i></div>
                <div className="bhp-forge__row"><b>02</b><span>Select learners</span><i>Class 7B</i></div>
                <div className="bhp-forge__row"><b>03</b><span>Set the launch</span><i>Schedule</i></div>
                <button type="button" tabIndex={-1}>Publish mission <span>→</span></button>
              </div>
            </article>

            <article className="bhp-scene bhp-scene--learn" data-scene="2">
              <SceneHeading eyebrow="03 / Student missions" title="Learning becomes something you do.">Students answer questions, write responses, earn XP and see immediate progress—without losing sight of the academic goal.</SceneHeading>
              <div className="bhp-character bhp-character--student" data-cinematic>
                <img className="bhp-student-thinking" src={assets.studentThinking} alt="Student thinking through an academic mission" loading="lazy" decoding="async" />
                <img className="bhp-student-victory" src={assets.studentVictory} alt="Student celebrating completed learning progress" loading="lazy" decoding="async" />
              </div>
              <div className="bhp-mission-path" data-cinematic aria-label="Mission progress from question to reward">
                <div><img src="/nodes/Start-Node-Icon.png" alt="" /><span>Start</span></div><i /><div><img src="/nodes/Question-Node-Icon.png" alt="" /><span>Respond</span></div><i /><div><img src="/nodes/Reward-Node-Icon.png" alt="" /><span>+ XP</span></div>
              </div>
              <div className="bhp-xp-burst" data-cinematic>+120 <span>XP</span></div>
            </article>

            <article className="bhp-scene bhp-scene--war" data-scene="3">
              <div className="bhp-war-flare" aria-hidden="true" />
              <SceneHeading eyebrow="04 / Clan Wars" title="Now the whole classroom is in the game.">Student teams compete through academic performance in a high-energy, group-based class activity. Every correct move powers the clan.</SceneHeading>
              <div className="bhp-war-arena" data-cinematic>
                <img className="bhp-war-bg" src="/rivalry_assets/backgrounds/live-war.png" alt="" loading="lazy" decoding="async" />
                <img className="bhp-war-student" src={assets.rival} alt="Student challenging a rival clan in a live academic battle" loading="lazy" decoding="async" />
                <img className="bhp-war-strike" src="/rivalry_assets/fx/strike.png" alt="" loading="lazy" decoding="async" />
                <div className="bhp-score bhp-score--left"><small>NEON WOLVES</small><strong>ROUND READY</strong></div><div className="bhp-versus">VS</div><div className="bhp-score bhp-score--right"><small>VOID RUNNERS</small><strong>ANSWER LOCKED</strong></div>
              </div>
              <div className="bhp-war-callout" data-reveal><span>Academic energy</span><b>→</b><span>Team momentum</span></div>
            </article>

            <article className="bhp-scene bhp-scene--validate" data-scene="4">
              <SceneHeading eyebrow="05 / Human-in-the-loop AI" title="AI analyzes. Teachers validate.">The system identifies writing strengths, weaknesses and supporting evidence. The teacher reviews and confirms what becomes part of the student record.</SceneHeading>
              <div className="bhp-validation" data-cinematic>
                <div className="bhp-validation__side bhp-validation__side--ai"><img src={assets.aiMentor} alt="AI mentor surfacing patterns in student writing" loading="lazy" decoding="async" /><span>AI analysis</span></div>
                <div className="bhp-evidence-sheet"><small>WRITING EVIDENCE / 04</small><p>The learner states a clear position and supports it with relevant examples.</p><mark>Clear position</mark><mark>Supporting evidence</mark><div className="bhp-scan-line" /></div>
                <div className="bhp-validation__side bhp-validation__side--teacher"><img src={assets.teacherValidation} alt="Teacher validating AI-supported writing feedback" loading="lazy" decoding="async" /><span>Teacher validated ✓</span></div>
              </div>
              <div className="bhp-trust-chain" data-reveal><span>AI analysis</span><b>→</b><span>Teacher review</span><b>→</b><strong>Validated record</strong></div>
            </article>

            <article className="bhp-scene bhp-scene--profile" data-scene="5">
              <SceneHeading eyebrow="06 / Academic profile" title="Evidence becomes understanding.">Every validated task adds to a living profile: recurring strengths, persistent weaknesses, improved skills, unresolved focus areas and recommended next practice.</SceneHeading>
              <div className="bhp-profile-visual" data-cinematic><NeuralProfile /><img src={assets.academicProfile} alt="Student beside a growing evidence-based academic profile" loading="lazy" decoding="async" /></div>
              <div className="bhp-profile-proof" data-reveal><span>14 Mar</span><b>Evidence connected</b><em>Teacher validated</em></div>
            </article>

            <article className="bhp-scene bhp-scene--act" data-scene="6">
              <SceneHeading eyebrow="07 / Targeted action" title="The next move is already visible.">A teacher converts an identified gap into personalized practice or a focused intervention—closing the loop from insight to action.</SceneHeading>
              <div className="bhp-action-loop" data-cinematic>
                <div className="bhp-gap-card"><small>FOCUS AREA</small><strong>Supporting an argument</strong><span>Evidence appears across 3 writing tasks</span></div>
                <div className="bhp-action-arrow"><i /><b>Turn insight into action</b></div>
                <div className="bhp-intervention-card"><div><small>PERSONAL MISSION</small><strong>Evidence Builder</strong></div><img src="/mission-console-images/writing.webp" alt="" /><p>3 targeted prompts · Teacher selected</p><span>Ready to assign</span></div>
              </div>
              <div className="bhp-mini-teacher" data-cinematic><img src={assets.teacherPresenting} alt="" loading="lazy" decoding="async" /></div>
            </article>

            <article className="bhp-scene bhp-scene--parent" data-scene="7">
              <SceneHeading eyebrow="08 / Parent confidence" title="Not a score dump. A clear progress story.">Parents see progress, achievements, strengths, current focus areas and teacher-validated feedback in language they can understand.</SceneHeading>
              <div className="bhp-parent-compare" data-cinematic>
                <div className="bhp-parent-noise" aria-label="Confusing raw score report"><small>TERM DATA EXPORT</small><b>72 8/12 B- 14 6.4 81%</b><span>Q4 / L2 / R7 / Δ-0.2</span><i>?</i></div>
                <div className="bhp-parent-story"><img src={assets.parentDashboard} alt="Parent viewing a clear student progress story on a phone" loading="lazy" decoding="async" /><div><small>CURRENT STORY</small><strong>Writing confidence is growing</strong><span>Next focus: use stronger supporting evidence</span><em>Teacher validated</em></div></div>
                <div className="bhp-clarity-wipe" />
              </div>
              <blockquote data-reveal>Strengthen parent confidence through continuous visibility, evidence-based progress and teacher-validated feedback.</blockquote>
            </article>

            <article className="bhp-scene bhp-scene--lead" data-scene="8">
              <SceneHeading eyebrow="09 / School leadership" title="Zoom out. See the whole school move.">Leaders monitor engagement, class coverage, academic activity and intervention needs—without losing the human story beneath the patterns.</SceneHeading>
              <div className="bhp-leadership" data-cinematic>
                <div className="bhp-leadership__map">{['7A', '7B', '8A', '8B', '9A', '9B'].map((name, index) => <div key={name} className={index === 4 ? 'is-focus' : ''}><span>{name}</span><i /><small>{index === 4 ? 'Review focus' : 'Learning active'}</small></div>)}</div>
                <img src={assets.principalOversight} alt="School leader reviewing whole-school learning activity" loading="lazy" decoding="async" />
              </div>
              <div className="bhp-lead-key" data-reveal><span><i className="is-active" />Activity</span><span><i className="is-focus" />Focus area</span><span><i className="is-validated" />Validated</span></div>
            </article>

            <article className="bhp-scene bhp-scene--vault" data-scene="9">
              <SceneHeading eyebrow="10 / The vault opens" title="One platform. A much bigger future.">The connected school journey becomes the foundation for admissions, IELTS, Cambridge assessments, writing, tournaments and the modules still to come.</SceneHeading>
              <div className="bhp-vault" data-cinematic>
                <div className="bhp-vault__rings" aria-hidden="true"><i /><i /><i /></div><div className="bhp-vault__core"><img src={assets.logo} alt="Brains Heist" /><span>ECOSYSTEM</span></div>
                <div className="bhp-module-wheel">{modules.map((module) => <div key={module.title} className={`bhp-module bhp-module--${module.accent}`}><img src={module.icon} alt="" loading="lazy" decoding="async" /><div><strong>{module.title}</strong><span>{module.copy}</span></div></div>)}</div>
              </div>
              <div className="bhp-finale" data-reveal><p>One connected journey. Every learner understood. Every next step made visible.</p><strong>Learn. Compete. Grow.</strong><a href="/">Enter Brains Heist <span aria-hidden="true">→</span></a></div>
            </article>
          </div>

          <nav className="bhp-rail" aria-label="Presentation chapters">
            <div className="bhp-rail__track"><i /></div>
            {chapters.map((chapter, index) => <div key={chapter} className="bhp-rail__item" data-rail-item data-active={index === 0 ? '' : undefined}><span>{String(index + 1).padStart(2, '0')}</span><b>{chapter}</b></div>)}
          </nav>
          <div className="bhp-scroll-cue" aria-hidden="true"><span>Direct the signal</span><i /></div>
        </div>

        <div className="bhp-story-space" aria-hidden="true">{chapters.map((chapter) => <div key={chapter} />)}</div>
      </section>
    </main>
  );
};

export default PresentationPage;
