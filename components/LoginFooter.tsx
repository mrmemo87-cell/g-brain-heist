import React from 'react';

interface LoginFooterProps {
    onRequestDemo: () => void;
}

const LoginFooter: React.FC<LoginFooterProps> = ({ onRequestDemo }) => (
    <footer className="relative z-30 border-t border-white/[0.05] px-4 py-10 text-sm text-slate-500 sm:px-6 sm:py-12" style={{ pointerEvents: 'auto' }}>
        <div className="mx-auto max-w-6xl">
            <div className="grid grid-cols-2 gap-8 sm:grid-cols-4">
                <div className="col-span-2 sm:col-span-1">
                    <div className="mb-3 flex items-center gap-2">
                        <img src="/logo.png" alt="" className="h-8 w-8" />
                        <span className="font-heading font-bold text-white">Brains Heist</span>
                    </div>
                    <p className="max-w-xs text-xs leading-relaxed text-slate-600">
                        Gamified English &amp; Maths learning for schools — assessments, live competition and meaningful progress insights.
                    </p>
                </div>

                <div>
                    <h4 className="mb-3 text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Legal</h4>
                    <ul className="space-y-2.5">
                        <li><a href="/terms.html" target="_blank" rel="noopener noreferrer" className="relative z-40 inline-block cursor-pointer transition-colors hover:text-cyan-300">Terms of Service</a></li>
                        <li><a href="/privacy.html" target="_blank" rel="noopener noreferrer" className="relative z-40 inline-block cursor-pointer transition-colors hover:text-cyan-300">Privacy Policy</a></li>
                        <li><a href="/refund.html" target="_blank" rel="noopener noreferrer" className="relative z-40 inline-block cursor-pointer transition-colors hover:text-cyan-300">Refund Policy</a></li>
                    </ul>
                </div>

                <div>
                    <h4 className="mb-3 text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Resources</h4>
                    <ul className="space-y-2.5">
                        <li><a href="/pricing.html" target="_blank" rel="noopener noreferrer" className="relative z-40 inline-block cursor-pointer transition-colors hover:text-cyan-300">Pricing</a></li>
                        <li><a href="/contact.html" target="_blank" rel="noopener noreferrer" className="relative z-40 inline-block cursor-pointer transition-colors hover:text-cyan-300">Contact Us</a></li>
                        <li><a href="/ielts" className="relative z-40 inline-block cursor-pointer transition-colors hover:text-cyan-300">IELTS Prep</a></li>
                        <li><button type="button" onClick={onRequestDemo} className="relative z-40 cursor-pointer text-left transition-colors hover:text-cyan-300">Request demo</button></li>
                    </ul>
                </div>

                <div>
                    <h4 className="mb-3 text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Get in touch</h4>
                    <ul className="space-y-2.5 text-xs sm:text-sm">
                        <li><a href="mailto:support@brainsheist.com" className="relative z-40 inline-block cursor-pointer transition-colors hover:text-cyan-300">support@brainsheist.com</a></li>
                        <li><a href="mailto:sales@brainsheist.com" className="relative z-40 inline-block cursor-pointer transition-colors hover:text-cyan-300">sales@brainsheist.com</a></li>
                    </ul>
                </div>
            </div>

            <div className="mt-9 flex flex-col items-center justify-between gap-3 border-t border-white/[0.05] pt-6 text-xs text-slate-600 sm:flex-row">
                <span>© {new Date().getFullYear()} Brains Heist. All rights reserved.</span>
                <span>🔒 Payments secured by Paddle — Merchant of Record</span>
            </div>
        </div>
    </footer>
);

export default LoginFooter;
