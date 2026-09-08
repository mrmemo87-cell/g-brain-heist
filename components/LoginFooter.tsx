import React from 'react';
import { useLanguage } from '../src/contexts/LanguageContext';
import { PORTAL_COPY } from './login/portalCopy';

interface LoginFooterProps {
    onRequestDemo?: () => void;
}

const LoginFooter: React.FC<LoginFooterProps> = ({ onRequestDemo }) => {
    const { language, direction } = useLanguage();
    const copy = PORTAL_COPY[language];
    const handleRequestDemo = () => {
        if (onRequestDemo) onRequestDemo();
        else window.location.href = '/contact.html';
    };

    return (
        <footer dir={direction} lang={language} className="relative z-30 border-t border-white/[0.05] bg-[#06101d] px-4 py-10 text-sm text-slate-500 sm:px-6 sm:py-12" style={{ pointerEvents: 'auto' }}>
            <div className="mx-auto max-w-6xl">
                <div className="grid grid-cols-2 gap-8 sm:grid-cols-4">
                    <div className="col-span-2 sm:col-span-1">
                        <div className="mb-3 flex items-center gap-2">
                            <img src="/logo.png" alt="Brains Heist" className="h-8 w-8" />
                            <span dir="ltr" className="font-heading font-bold text-white">Brains Heist</span>
                        </div>
                        <p className="max-w-xs text-xs leading-relaxed text-slate-600">{copy.footerBody}</p>
                    </div>
                    <div>
                        <h4 className="mb-3 text-xs font-bold uppercase tracking-[0.14em] text-slate-400">{copy.legal}</h4>
                        <ul className="space-y-2.5">
                            <li><a href="/terms.html" target="_blank" rel="noopener noreferrer" className="relative z-40 inline-block cursor-pointer transition-colors hover:text-cyan-300">{copy.terms}</a></li>
                            <li><a href="/privacy.html" target="_blank" rel="noopener noreferrer" className="relative z-40 inline-block cursor-pointer transition-colors hover:text-cyan-300">{copy.privacy}</a></li>
                            <li><a href="/refund.html" target="_blank" rel="noopener noreferrer" className="relative z-40 inline-block cursor-pointer transition-colors hover:text-cyan-300">{copy.refund}</a></li>
                        </ul>
                    </div>
                    <div>
                        <h4 className="mb-3 text-xs font-bold uppercase tracking-[0.14em] text-slate-400">{copy.resources}</h4>
                        <ul className="space-y-2.5">
                            <li><a href="/pricing.html" target="_blank" rel="noopener noreferrer" className="relative z-40 inline-block cursor-pointer transition-colors hover:text-cyan-300">{copy.pricing}</a></li>
                            <li><a href="/contact.html" target="_blank" rel="noopener noreferrer" className="relative z-40 inline-block cursor-pointer transition-colors hover:text-cyan-300">{copy.contact}</a></li>
                            <li><a href="/ielts" className="relative z-40 inline-block cursor-pointer transition-colors hover:text-cyan-300">{copy.ieltsPrep}</a></li>
                            <li><button type="button" onClick={handleRequestDemo} className="relative z-40 cursor-pointer text-start transition-colors hover:text-cyan-300">{copy.requestDemoShort}</button></li>
                        </ul>
                    </div>
                    <div>
                        <h4 className="mb-3 text-xs font-bold uppercase tracking-[0.14em] text-slate-400">{copy.getInTouch}</h4>
                        <ul dir="ltr" className={`space-y-2.5 text-xs sm:text-sm ${direction === 'rtl' ? 'text-right' : 'text-left'}`}>
                            <li><a href="mailto:support@brainsheist.com" className="relative z-40 inline-block cursor-pointer transition-colors hover:text-cyan-300">support@brainsheist.com</a></li>
                            <li><a href="mailto:sales@brainsheist.com" className="relative z-40 inline-block cursor-pointer transition-colors hover:text-cyan-300">sales@brainsheist.com</a></li>
                        </ul>
                    </div>
                </div>
                <div className="mt-9 flex flex-col items-center justify-between gap-3 border-t border-white/[0.05] pt-6 text-xs text-slate-600 sm:flex-row">
                    <span>© {new Date().getFullYear()} Brains Heist. {copy.rights}</span>
                    <span>🔒 {copy.payments}</span>
                </div>
            </div>
        </footer>
    );
};

export default LoginFooter;
