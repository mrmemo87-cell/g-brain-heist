import React, { useEffect, useRef } from 'react';
import gsap from 'gsap';
import LoginFooter from '../LoginFooter';

interface PortalLandingProps {
    onExplore: () => void;
    children: React.ReactNode;
}

const PortalLanding: React.FC<PortalLandingProps> = ({ onExplore, children }) => {
    const rootRef = useRef<HTMLDivElement>(null);
    const gridRef = useRef<HTMLDivElement>(null);
    const glowOneRef = useRef<HTMLDivElement>(null);
    const glowTwoRef = useRef<HTMLDivElement>(null);
    const brandRef = useRef<HTMLDivElement>(null);
    const headlineRef = useRef<HTMLHeadingElement>(null);
    const cardWrapRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
        const ctx = gsap.context(() => {
            gsap.set([brandRef.current, headlineRef.current, cardWrapRef.current], { opacity: 0, y: 26, filter: 'blur(8px)' });
            gsap.timeline({ defaults: { ease: 'power3.out' } })
                .to(brandRef.current, { opacity: 1, y: 0, filter: 'blur(0px)', duration: 0.7 })
                .to(headlineRef.current, { opacity: 1, y: 0, filter: 'blur(0px)', duration: 0.8 }, '-=0.4')
                .to(cardWrapRef.current, { opacity: 1, y: 0, filter: 'blur(0px)', duration: 0.9 }, '-=0.52');
            if (gridRef.current) gsap.to(gridRef.current, { backgroundPosition: '0px 76px', duration: 12, repeat: -1, yoyo: true, ease: 'sine.inOut' });
            if (glowOneRef.current) gsap.to(glowOneRef.current, { xPercent: 14, yPercent: -10, scale: 1.14, duration: 8, repeat: -1, yoyo: true, ease: 'sine.inOut' });
            if (glowTwoRef.current) gsap.to(glowTwoRef.current, { xPercent: -12, yPercent: 14, scale: 1.12, duration: 10, repeat: -1, yoyo: true, ease: 'sine.inOut' });
        }, rootRef);
        return () => ctx.revert();
    }, []);

    return (
        <div ref={rootRef} className="relative min-h-screen overflow-hidden bg-[#06101d] text-white">
            <div ref={gridRef} className="pointer-events-none absolute inset-0 opacity-[0.16] [background-image:linear-gradient(rgba(34,211,238,0.075)_1px,transparent_1px),linear-gradient(90deg,rgba(217,70,239,0.06)_1px,transparent_1px)] [background-size:72px_72px]" aria-hidden="true" />
            <div ref={glowOneRef} className="pointer-events-none absolute -left-32 top-8 h-[34rem] w-[34rem] rounded-full bg-cyan-400/[0.13] blur-[120px]" aria-hidden="true" />
            <div ref={glowTwoRef} className="pointer-events-none absolute -right-32 bottom-0 h-[32rem] w-[32rem] rounded-full bg-fuchsia-500/[0.11] blur-[120px]" aria-hidden="true" />
            <div className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-gradient-to-b from-cyan-300/[0.035] to-transparent" aria-hidden="true" />

            <main className="relative z-10 mx-auto flex min-h-screen w-full max-w-7xl flex-col px-5 py-7 sm:px-8 lg:px-12">
                <div ref={brandRef} className="mx-auto flex flex-col items-center text-center">
                    <div className="flex items-center gap-3 sm:gap-4">
                        <img src="/logo.png" alt="Brains Heist" className="h-16 w-16 object-contain drop-shadow-[0_0_28px_rgba(34,211,238,0.32)] sm:h-20 sm:w-20" />
                        <div className="text-start">
                            <div className="text-3xl font-black tracking-tight sm:text-5xl">Brains <span className="bg-gradient-to-r from-cyan-300 via-teal-200 to-fuchsia-400 bg-clip-text text-transparent">Heist</span></div>
                            <div className="mt-1 text-[10px] font-extrabold uppercase tracking-[0.5em] text-slate-500 sm:text-xs">Learn · Compete · Grow</div>
                        </div>
                    </div>
                </div>

                <section className="mx-auto grid w-full flex-1 items-center gap-10 py-10 lg:grid-cols-[1.08fr_0.92fr] lg:gap-14 lg:py-8">
                    <div className="mx-auto max-w-3xl text-center lg:text-start">
                        <h1 ref={headlineRef} className="text-[clamp(3.6rem,8.5vw,7.8rem)] font-black leading-[0.86] tracking-[-0.055em] text-white">
                            Where school<br />feels like a<br /><span className="bg-gradient-to-r from-cyan-300 via-teal-300 to-fuchsia-400 bg-clip-text text-transparent">game.</span>
                        </h1>
                        <p className="mx-auto mt-7 max-w-xl text-base leading-relaxed text-slate-400 sm:text-lg lg:mx-0">One identity. One learning world. Sign in instantly or explore what Brains Heist can do.</p>
                    </div>

                    <div ref={cardWrapRef} className="mx-auto w-full max-w-md">
                        {children}
                        <button type="button" onClick={onExplore} className="group mt-7 w-full rounded-2xl border border-white/10 bg-white/[0.025] px-5 py-4 text-center transition duration-300 hover:border-cyan-300/35 hover:bg-cyan-300/[0.05]">
                            <span className="block text-[10px] font-extrabold uppercase tracking-[0.33em] text-slate-500 transition group-hover:text-cyan-300/80">Not here to sign in?</span>
                            <span className="mt-1.5 flex items-center justify-center gap-2 text-sm font-black uppercase tracking-[0.18em] text-white">
                                <span className="flex h-7 w-7 items-center justify-center rounded-full border border-cyan-300/30 bg-cyan-300/[0.06] text-cyan-300 shadow-[0_0_22px_rgba(34,211,238,0.16)]">◉</span>
                                Explore Brains Heist
                                <span className="text-cyan-300 transition-transform duration-300 group-hover:translate-x-1">→</span>
                            </span>
                        </button>
                        <div className="mt-4 text-center text-[11px] text-slate-600">Schools · Learning · IELTS · Admissions · Competition</div>
                    </div>
                </section>
            </main>

            <LoginFooter onRequestDemo={() => { window.location.href = '/contact.html'; }} />
        </div>
    );
};

export default PortalLanding;
