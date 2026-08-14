import { useEffect, useId, useRef } from 'react';

const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value));

const missionStats = [
  { label: 'Knowledge secured', value: '84%', className: 'border-cyan-300/15 text-cyan-200' },
  { label: 'Current streak', value: '12 days', className: 'border-fuchsia-400/15 text-fuchsia-300' },
  { label: 'Next reward', value: '+250 XP', className: 'border-amber-300/15 text-amber-300' },
] as const;

const title = 'Steal knowledge. Level up.';

const BrainLockGraphic = () => {
  const id = useId().replace(/:/g, '');
  const brainGradientId = `${id}-brain`;
  const lockGradientId = `${id}-lock`;
  const coreGradientId = `${id}-core`;
  const glowId = `${id}-glow`;

  return (
    <svg aria-hidden="true" className="h-full w-full overflow-visible" viewBox="0 0 620 620" fill="none">
      <defs>
        <linearGradient id={brainGradientId} x1="104" y1="96" x2="530" y2="526">
          <stop stopColor="#00E7FF" />
          <stop offset="0.48" stopColor="#8B5CFF" />
          <stop offset="1" stopColor="#FF2D91" />
        </linearGradient>
        <linearGradient id={lockGradientId} x1="245" y1="240" x2="405" y2="435">
          <stop stopColor="#E8FDFF" />
          <stop offset="0.5" stopColor="#00D0E8" />
          <stop offset="1" stopColor="#7B61FF" />
        </linearGradient>
        <radialGradient id={coreGradientId} cx="0" cy="0" r="1" gradientTransform="translate(310 310) rotate(90) scale(248)">
          <stop stopColor="#00D0E8" stopOpacity="0.34" />
          <stop offset="0.48" stopColor="#7B61FF" stopOpacity="0.14" />
          <stop offset="1" stopColor="#020817" stopOpacity="0" />
        </radialGradient>
        <filter id={glowId} x="-80%" y="-80%" width="260%" height="260%">
          <feGaussianBlur stdDeviation="10" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <circle cx="310" cy="310" r="285" fill={`url(#${coreGradientId})`} />
      <circle cx="310" cy="310" r="246" stroke="#00D0E8" strokeOpacity="0.12" />
      <circle cx="310" cy="310" r="214" stroke="#FF2D91" strokeOpacity="0.09" strokeDasharray="6 18" />

      <g filter={`url(#${glowId})`} stroke={`url(#${brainGradientId})`} strokeLinecap="round" strokeLinejoin="round">
        <path d="M307 174c-24-59-112-63-142-7-45 0-69 51-49 85-35 28-25 87 11 104-12 48 33 91 77 76 20 43 83 43 103 5V174Z" strokeWidth="12" />
        <path d="M313 174c24-59 112-63 142-7 45 0 69 51 49 85 35 28 25 87-11 104 12 48-33 91-77 76-20 43-83 43-103 5V174Z" strokeWidth="12" />
        <path d="M181 190c28 4 50 25 54 53M132 271c28-13 66-2 80 25M130 359c31-14 70 0 80 33M210 430c-5-34 15-63 46-72M439 190c-28 4-50 25-54 53M488 271c-28-13-66-2-80 25M490 359c-31-14-70 0-80 33M410 430c5-34-15-63-46-72" strokeWidth="8" strokeOpacity="0.75" />
        <path d="M307 227c-26 0-49 21-49 48M313 227c26 0 49 21 49 48M307 405c-28 0-51-22-51-50M313 405c28 0 51-22 51-50" strokeWidth="7" strokeOpacity="0.6" />
      </g>

      <g filter={`url(#${glowId})`}>
        <rect x="235" y="285" width="150" height="132" rx="30" fill="#040B1C" stroke={`url(#${lockGradientId})`} strokeWidth="9" />
        <path d="M270 287v-25c0-28 18-52 40-52s40 24 40 52v25" stroke={`url(#${lockGradientId})`} strokeWidth="13" strokeLinecap="round" />
        <circle cx="310" cy="348" r="17" fill="#E8FDFF" />
        <path d="M310 361v24" stroke="#E8FDFF" strokeWidth="10" strokeLinecap="round" />
      </g>

      {([
        [104, 174, '#00E7FF'],
        [508, 187, '#FF2D91'],
        [82, 346, '#7B61FF'],
        [534, 350, '#00E7FF'],
        [185, 496, '#FF2D91'],
        [438, 493, '#7B61FF'],
      ] as const).map(([cx, cy, fill], index) => (
        <g key={index} filter={`url(#${glowId})`}>
          <circle cx={cx} cy={cy} r="7" fill={fill} />
          <circle cx={cx} cy={cy} r="17" stroke={fill} strokeOpacity="0.24" />
        </g>
      ))}
    </svg>
  );
};

const PresentationPage = () => {
  const sectionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return undefined;

    let frame = 0;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const titleCharacters = Array.from(section.querySelectorAll<HTMLElement>('[data-bh-title-character]'));

    const updateTitle = (progress: number) => {
      titleCharacters.forEach((character) => {
        const delay = Number(character.dataset.delay ?? 0);
        const angle = Number(character.dataset.angle ?? 0);
        const localProgress = clamp((progress - delay) * 10);
        character.style.opacity = localProgress.toFixed(4);
        character.style.transform = `scale(${localProgress.toFixed(4)}) rotate(${((1 - localProgress) * angle).toFixed(2)}deg)`;
      });
    };

    const update = () => {
      frame = 0;

      if (reducedMotion.matches) {
        section.style.setProperty('--bh-clip-x', '0%');
        section.style.setProperty('--bh-clip-y', '0%');
        section.style.setProperty('--bh-visual-scale', '1');
        section.style.setProperty('--bh-art-scale', '1');
        section.style.setProperty('--bh-art-y', '0%');
        section.style.setProperty('--bh-copy-opacity', '1');
        section.style.setProperty('--bh-scroll-opacity', '0');
        updateTitle(1);
        return;
      }

      const rect = section.getBoundingClientRect();
      const distance = Math.max(rect.height - window.innerHeight, 1);
      const progress = clamp(-rect.top / distance);
      const reveal = clamp((progress - 0.14) / 0.46);
      const settle = clamp((progress - 0.62) / 0.38);
      const copy = clamp((progress - 0.68) / 0.2);

      section.style.setProperty('--bh-clip-x', `${(1 - reveal) * 50}%`);
      section.style.setProperty('--bh-clip-y', `${(1 - reveal) * 10}%`);
      section.style.setProperty('--bh-visual-scale', `${0.56 + reveal * 0.44 - settle * 0.06}`);
      section.style.setProperty('--bh-art-scale', `${2.35 - reveal * 1.15 - settle * 0.2}`);
      section.style.setProperty('--bh-art-y', `${(1 - reveal) * 26}%`);
      section.style.setProperty('--bh-copy-opacity', copy.toFixed(4));
      section.style.setProperty('--bh-scroll-opacity', (1 - clamp(progress / 0.18)).toFixed(4));
      updateTitle(progress);
    };

    const requestUpdate = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };

    update();
    window.addEventListener('scroll', requestUpdate, { passive: true });
    window.addEventListener('resize', requestUpdate);
    reducedMotion.addEventListener('change', requestUpdate);

    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener('scroll', requestUpdate);
      window.removeEventListener('resize', requestUpdate);
      reducedMotion.removeEventListener('change', requestUpdate);
    };
  }, []);

  return (
    <main className="min-h-screen bg-[#020611] text-white">
      <section
        ref={sectionRef}
        aria-label="Brains Heist mission presentation"
        className="relative h-[320svh] overflow-clip bg-[#020611] [--bh-art-scale:2.35] [--bh-art-y:26%] [--bh-clip-x:50%] [--bh-clip-y:10%] [--bh-copy-opacity:0] [--bh-scroll-opacity:1] [--bh-visual-scale:.56]"
      >
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_35%,rgba(0,208,232,.13),transparent_31%),radial-gradient(circle_at_78%_57%,rgba(255,45,145,.1),transparent_28%),linear-gradient(rgba(7,16,38,.6)_1px,transparent_1px),linear-gradient(90deg,rgba(7,16,38,.6)_1px,transparent_1px)] [background-size:auto,auto,44px_44px,44px_44px]" />
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-300/60 to-transparent" />

        <div className="sticky top-0 flex h-svh items-center overflow-hidden px-4 py-8 sm:px-6 lg:px-10">
          <a
            href="/"
            className="absolute left-5 top-5 z-30 inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/25 px-3 py-2 text-[10px] font-black uppercase tracking-[0.18em] text-cyan-100 backdrop-blur-md transition hover:border-cyan-300/40 hover:bg-cyan-300/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200 sm:left-8 sm:top-7"
          >
            <span aria-hidden="true">←</span> Brains Heist
          </a>

          <div className="mx-auto grid w-full max-w-7xl items-center gap-7 lg:grid-cols-[.85fr_1.15fr] lg:gap-10">
            <div className="relative z-20 order-2 lg:order-1">
              <div style={{ opacity: 'var(--bh-copy-opacity)' }}>
                <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-300/[.06] px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.22em] text-cyan-200 shadow-[0_0_28px_rgba(0,208,232,.08)]">
                  <span className="h-1.5 w-1.5 rounded-full bg-cyan-300 shadow-[0_0_12px_#00d0e8]" />
                  Mission protocol 01
                </div>

                <p className="max-w-xl text-balance text-base leading-7 text-slate-300 sm:text-lg">
                  Every lesson is a vault. Crack the challenge, secure the knowledge, and turn your progress into power.
                </p>

                <div className="mt-7 flex flex-wrap gap-3">
                  <a
                    href="/"
                    className="group inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-cyan-300 px-5 py-3 text-sm font-black uppercase tracking-[0.08em] text-[#020611] shadow-[0_0_34px_rgba(0,208,232,.32)] transition hover:-translate-y-0.5 hover:bg-cyan-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200 focus-visible:ring-offset-4 focus-visible:ring-offset-[#020611]"
                  >
                    Enter Brains Heist
                    <span aria-hidden="true" className="transition-transform group-hover:translate-x-1">→</span>
                  </a>
                  <a
                    href="/ielts/trial-test-2"
                    className="inline-flex min-h-12 items-center justify-center rounded-xl border border-white/10 bg-white/[.04] px-5 py-3 text-sm font-bold text-slate-100 transition hover:-translate-y-0.5 hover:border-fuchsia-400/40 hover:bg-fuchsia-400/[.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fuchsia-300 focus-visible:ring-offset-4 focus-visible:ring-offset-[#020611]"
                  >
                    Try free diagnostic
                  </a>
                </div>
              </div>

              <div className="mt-8 hidden max-w-2xl grid-cols-3 gap-2 sm:grid sm:gap-3" style={{ opacity: 'var(--bh-copy-opacity)' }}>
                {missionStats.map((stat) => (
                  <div key={stat.label} className={`rounded-xl border bg-white/[.025] p-3 backdrop-blur-sm sm:p-4 ${stat.className}`}>
                    <div className="text-lg font-black tracking-tight sm:text-2xl">{stat.value}</div>
                    <div className="mt-1 text-[9px] font-bold uppercase leading-4 tracking-[0.13em] text-slate-500 sm:text-[10px]">{stat.label}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="relative order-1 flex min-h-[38svh] items-center justify-center lg:order-2 lg:min-h-[76svh]">
              <h1 className="pointer-events-none absolute left-1/2 top-1/2 z-0 w-[120vw] -translate-x-1/2 -translate-y-1/2 text-center text-[clamp(3.2rem,11vw,10rem)] font-black uppercase leading-[.82] tracking-[-.065em] text-white lg:w-[92vw]">
                <span className="sr-only">{title}</span>
                <span aria-hidden="true">
                  {Array.from(title).map((character, index) => {
                    const count = Math.max(title.length - 1, 1);
                    const delay = (index / count) * 0.22;
                    const angle = (index % 2 ? 1 : -1) * (22 + (index % 5) * 8);
                    return (
                      <span
                        key={`${character}-${index}`}
                        data-angle={angle}
                        data-bh-title-character
                        data-delay={delay}
                        className="inline-block bg-gradient-to-br from-white via-cyan-100 to-fuchsia-300 bg-clip-text text-transparent will-change-transform"
                        style={{ opacity: 0, transform: `scale(0) rotate(${angle}deg)`, textShadow: '0 0 44px rgba(0, 208, 232, .1)' }}
                      >
                        {character === ' ' ? '\u00A0' : character}
                      </span>
                    );
                  })}
                </span>
              </h1>

              <div
                className="relative z-10 aspect-square w-[min(68vw,34rem)] overflow-hidden rounded-[2rem] border border-cyan-200/15 bg-[#040a19]/90 shadow-[0_0_0_1px_rgba(255,255,255,.025),0_32px_120px_rgba(0,208,232,.14),0_16px_80px_rgba(255,45,145,.09)] backdrop-blur-xl will-change-transform sm:w-[min(76vw,34rem)]"
                style={{
                  clipPath: 'inset(var(--bh-clip-y) var(--bh-clip-x) var(--bh-clip-y) var(--bh-clip-x) round 2rem)',
                  transform: 'scale(var(--bh-visual-scale))',
                }}
              >
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_35%_25%,rgba(0,231,255,.14),transparent_28%),radial-gradient(circle_at_70%_75%,rgba(255,45,145,.16),transparent_32%)]" />
                <div className="absolute left-5 top-5 z-10 flex items-center gap-2 rounded-full border border-white/10 bg-black/25 px-3 py-1.5 text-[9px] font-black uppercase tracking-[0.18em] text-cyan-100 backdrop-blur-md sm:left-7 sm:top-7 sm:text-[10px]">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-300 shadow-[0_0_10px_#6ee7b7]" /> Vault online
                </div>
                <div className="absolute right-5 top-5 z-10 rounded-full border border-fuchsia-400/20 bg-fuchsia-400/[.08] px-3 py-1.5 text-[9px] font-black uppercase tracking-[0.18em] text-fuchsia-200 sm:right-7 sm:top-7 sm:text-[10px]">Level 07</div>

                <div className="absolute inset-[7%] will-change-transform" style={{ transform: 'translateY(var(--bh-art-y)) scale(var(--bh-art-scale))' }}>
                  <BrainLockGraphic />
                </div>

                <div className="absolute inset-x-7 bottom-7 z-10 flex items-end justify-between gap-4">
                  <div>
                    <div className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-500 sm:text-[10px]">Security status</div>
                    <div className="mt-1 text-sm font-black uppercase tracking-[0.12em] text-white sm:text-base">Brain encrypted</div>
                  </div>
                  <div className="h-1.5 w-20 overflow-hidden rounded-full bg-white/10 sm:w-28">
                    <div className="h-full w-[84%] rounded-full bg-gradient-to-r from-cyan-300 via-violet-400 to-fuchsia-400 shadow-[0_0_14px_#00d0e8]" />
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="pointer-events-none absolute bottom-5 left-1/2 -translate-x-1/2 text-center text-[9px] font-black uppercase tracking-[0.28em] text-slate-600" style={{ opacity: 'var(--bh-scroll-opacity)' }}>
            Scroll to breach
          </div>
        </div>
      </section>
    </main>
  );
};

export default PresentationPage;
