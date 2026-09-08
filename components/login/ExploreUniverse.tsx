import React, { useEffect, useRef } from 'react';
import gsap from 'gsap';
import LoginFooter from '../LoginFooter';

interface ExploreUniverseProps {
    onBack: () => void;
    onRequestDemo: () => void;
}

const NODES = [
    { eyebrow: 'LEARN', title: 'Learning', copy: 'Classes, assignments, progress and a learning loop students can actually feel.', icon: '🧠' },
    { eyebrow: 'COMPETE', title: 'Competition', copy: 'XP, clans, rankings, battles and momentum built into the school day.', icon: '⚔️' },
    { eyebrow: 'PREPARE', title: 'IELTS', copy: 'Diagnostics, targeted practice and a clear path from current level to target band.', icon: '🎯' },
    { eyebrow: 'OPERATE', title: 'Schools', copy: 'Classes, teachers, reporting, admissions and school-wide visibility in one system.', icon: '🏫' },
    { eyebrow: 'DISCOVER', title: 'Admissions', copy: 'Candidate testing, placement intelligence and school-ready admissions workflows.', icon: '🔬' },
] as const;

const ExploreUniverse: React.FC<ExploreUniverseProps> = ({ onBack, onRequestDemo }) => {
    const rootRef = useRef<HTMLDivElement>(null);
    const titleRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
        const ctx = gsap.context(() => {
            const cards = gsap.utils.toArray<HTMLElement>('[data-universe-node]');
            gsap.set([titleRef.current, ...cards], { opacity: 0, y: 28, filter: 'blur(7px)' });
            gsap.timeline({ defaults: { ease: 'power3.out' } })
                .to(titleRef.current, { opacity: 1, y: 0, filter: 'blur(0px)', duration: 0.7 })
                .to(cards, { opacity: 1, y: 0, filter: 'blur(0px)', duration: 0.65, stagger: 0.08 }, '-=0.35');
        }, rootRef);
        return () => ctx.revert();
    }, []);

    return (
        <div ref={rootRef} className="relative min-h-screen overflow-hidden bg-[#06101d] text-white">
            <div className="relative px-5 py-7 sm:px-8 lg:px-12">
                <div className="pointer-events-none absolute inset-0 opacity-[0.16] [background-image:linear-gradient(rgba(34,211,238,0.075)_1px,transparent_1px),linear-gradient(90deg,rgba(217,70,239,0.06)_1px,transparent_1px)] [background-size:72px_72px]" aria-hidden="true" />
                <div className="pointer-events-none absolute left-1/2 top-24 h-[34rem] w-[34rem] -translate-x-1/2 rounded-full bg-cyan-400/[0.10] blur-[135px]" aria-hidden="true" />
                <div className="pointer-events-none absolute -bottom-36 -right-16 h-[30rem] w-[30rem] rounded-full bg-fuchsia-500/[0.10] blur-[125px]" aria-hidden="true" />

                <div className="relative z-10 mx-auto max-w-7xl">
                    <header className="flex items-center justify-between gap-3">
                        <button type="button" onClick={onBack} className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-xs font-bold text-slate-300 transition hover:border-cyan-300/30 hover:text-white sm:px-4 sm:text-sm">← Back to portal</button>
                        <img src="/logo.png" alt="Brains Heist" className="h-10 w-10 object-contain drop-shadow-[0_0_18px_rgba(34,211,238,0.28)] sm:h-12 sm:w-12" />
                        <button type="button" onClick={onRequestDemo} className="rounded-xl border border-cyan-300/25 bg-cyan-300/[0.06] px-3 py-2 text-xs font-bold text-cyan-200 transition hover:bg-cyan-300/[0.10] sm:px-4 sm:text-sm">Request a school demo</button>
                    </header>

                    <div ref={titleRef} className="mx-auto max-w-3xl pb-10 pt-14 text-center sm:pt-20">
                        <p className="text-[11px] font-black uppercase tracking-[0.36em] text-cyan-300/80">The Brains Heist Universe</p>
                        <h2 className="mt-4 text-4xl font-black tracking-[-0.04em] sm:text-6xl">One system. Different missions.</h2>
                        <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-slate-400 sm:text-lg">Explore each part of Brains Heist and see exactly what it is designed to do.</p>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
                        {NODES.map((node) => (
                            <article key={node.title} data-universe-node className="group relative min-h-[18rem] overflow-hidden rounded-[1.75rem] border border-white/10 bg-[#081321]/85 p-6 shadow-[0_24px_80px_rgba(0,0,0,0.28)] backdrop-blur-xl transition duration-300 hover:-translate-y-1.5 hover:border-cyan-300/30">
                                <div className="pointer-events-none absolute -right-12 -top-12 h-32 w-32 rounded-full bg-cyan-300/[0.06] blur-3xl transition duration-300 group-hover:bg-fuchsia-400/[0.08]" aria-hidden="true" />
                                <div className="relative">
                                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-cyan-300/20 bg-cyan-300/[0.06] text-xl shadow-[0_0_28px_rgba(34,211,238,0.10)]">{node.icon}</div>
                                    <p className="mt-7 text-[10px] font-black uppercase tracking-[0.3em] text-cyan-300/70">{node.eyebrow}</p>
                                    <h3 className="mt-2 text-2xl font-black tracking-tight">{node.title}</h3>
                                    <p className="mt-3 text-sm leading-relaxed text-slate-400">{node.copy}</p>
                                    <div className="mt-6 text-xs font-black uppercase tracking-[0.18em] text-slate-500 transition group-hover:text-cyan-300">Discover →</div>
                                </div>
                            </article>
                        ))}
                    </div>

                    <div className="mx-auto mt-10 max-w-2xl rounded-[1.75rem] border border-white/10 bg-white/[0.025] p-6 text-center sm:p-8">
                        <p className="text-sm leading-relaxed text-slate-400">Already part of Brains Heist?</p>
                        <button type="button" onClick={onBack} className="mt-3 text-lg font-black text-white transition hover:text-cyan-200">Return to sign in →</button>
                    </div>
                </div>
            </div>

            <LoginFooter onRequestDemo={onRequestDemo} />
        </div>
    );
};

export default ExploreUniverse;
