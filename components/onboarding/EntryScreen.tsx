import React, { useEffect } from 'react';

interface EntryScreenProps {
  onSelectBrainsHeist: () => void;
  onSelectIELTS: () => void;
}

const EntryScreen: React.FC<EntryScreenProps> = ({ onSelectBrainsHeist, onSelectIELTS }) => {
  useEffect(() => {
    // Add entry animation class
    document.body.classList.add('entry-screen-active');
    return () => {
      document.body.classList.remove('entry-screen-active');
    };
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden bg-gradient-to-br from-[#0a0a1a] via-[#1a1a2e] to-[#0a0a1a]">
      {/* Animated background glow */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-cyan-500/20 rounded-full blur-3xl animate-pulse-slow" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-500/20 rounded-full blur-3xl animate-pulse-slow" style={{ animationDelay: '1s' }} />
      </div>

      <div className="max-w-5xl w-full relative z-10">
        {/* Logo and tagline */}
        <div className="text-center mb-12 animate-fade-in">
          <img 
            src="/logo.png" 
            alt="Brains Heist" 
            className="w-24 h-24 mx-auto mb-4 drop-shadow-[0_0_20px_rgba(0,212,255,0.6)] animate-float"
          />
          <h1 className="font-heading text-5xl md:text-6xl font-bold text-white mb-3 tracking-tight">
            Choose Your Mission
          </h1>
          <p className="text-gray-400 text-lg md:text-xl">
            Two paths. One platform. Your journey starts here.
          </p>
        </div>

        {/* Two-card selection */}
        <div className="grid md:grid-cols-2 gap-6 animate-slide-up" style={{ animationDelay: '0.2s' }}>
          {/* Brains Heist Card */}
          <button
            onClick={onSelectBrainsHeist}
            className="group relative overflow-hidden rounded-2xl border-2 border-cyan-500/30 bg-gradient-to-br from-slate-900/90 to-slate-800/90 p-8 text-left transition-all duration-300 hover:border-cyan-400 hover:shadow-2xl hover:shadow-cyan-500/30 hover:scale-[1.02] active:scale-[0.98]"
          >
            {/* Animated gradient background */}
            <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/0 to-cyan-500/10 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            
            <div className="relative z-10">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-14 h-14 rounded-xl bg-cyan-500/20 flex items-center justify-center text-3xl border border-cyan-500/40 group-hover:border-cyan-400 transition-colors">
                  🧠
                </div>
                <h2 className="font-heading text-3xl font-bold text-white">Brains Heist</h2>
              </div>
              
              <p className="text-gray-300 mb-6 leading-relaxed">
                Gamified learning platform. Compete in quests, join clans, climb leaderboards. Perfect for schools and competitive learners.
              </p>
              
              <div className="flex flex-wrap gap-2 mb-6">
                <span className="px-3 py-1 rounded-full bg-cyan-500/20 text-cyan-300 text-xs font-semibold border border-cyan-500/30">
                  PvP Battles
                </span>
                <span className="px-3 py-1 rounded-full bg-cyan-500/20 text-cyan-300 text-xs font-semibold border border-cyan-500/30">
                  Clan Wars
                </span>
                <span className="px-3 py-1 rounded-full bg-cyan-500/20 text-cyan-300 text-xs font-semibold border border-cyan-500/30">
                  School Leaderboards
                </span>
              </div>
              
              <div className="flex items-center gap-2 text-cyan-400 font-semibold group-hover:gap-3 transition-all">
                <span>Start Your Heist</span>
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </div>
            </div>
          </button>

          {/* IELTS Hub Card */}
          <button
            onClick={onSelectIELTS}
            className="group relative overflow-hidden rounded-2xl border-2 border-emerald-500/30 bg-gradient-to-br from-slate-900/90 to-slate-800/90 p-8 text-left transition-all duration-300 hover:border-emerald-400 hover:shadow-2xl hover:shadow-emerald-500/30 hover:scale-[1.02] active:scale-[0.98]"
          >
            {/* Animated gradient background */}
            <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/0 to-emerald-500/10 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            
            <div className="relative z-10">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-14 h-14 rounded-xl bg-emerald-500/20 flex items-center justify-center text-3xl border border-emerald-500/40 group-hover:border-emerald-400 transition-colors">
                  📚
                </div>
                <h2 className="font-heading text-3xl font-bold text-white">IELTS Hub</h2>
              </div>
              
              <p className="text-gray-300 mb-6 leading-relaxed">
                Dedicated IELTS preparation platform. Practice all four skills with authentic test materials and detailed feedback.
              </p>
              
              <div className="flex flex-wrap gap-2 mb-6">
                <span className="px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 text-xs font-semibold border border-emerald-500/30">
                  Reading
                </span>
                <span className="px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 text-xs font-semibold border border-emerald-500/30">
                  Writing
                </span>
                <span className="px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 text-xs font-semibold border border-emerald-500/30">
                  Listening
                </span>
                <span className="px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 text-xs font-semibold border border-emerald-500/30">
                  Speaking
                </span>
              </div>
              
              <div className="flex items-center gap-2 text-emerald-400 font-semibold group-hover:gap-3 transition-all">
                <span>Start Preparing</span>
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </div>
            </div>
          </button>
        </div>

        {/* Footer note */}
        <p className="text-center text-gray-500 text-sm mt-8 animate-fade-in" style={{ animationDelay: '0.4s' }}>
          You can switch between platforms anytime from your dashboard
        </p>
      </div>

      <style>{`
        @keyframes pulse-slow {
          0%, 100% {
            opacity: 0.3;
            transform: scale(1);
          }
          50% {
            opacity: 0.5;
            transform: scale(1.1);
          }
        }

        @keyframes fade-in {
          from {
            opacity: 0;
            transform: translateY(-10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes slide-up {
          from {
            opacity: 0;
            transform: translateY(30px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes float {
          0%, 100% {
            transform: translateY(0);
          }
          50% {
            transform: translateY(-10px);
          }
        }

        .animate-pulse-slow {
          animation: pulse-slow 4s ease-in-out infinite;
        }

        .animate-fade-in {
          animation: fade-in 0.6s ease-out forwards;
          opacity: 0;
        }

        .animate-slide-up {
          animation: slide-up 0.8s ease-out forwards;
          opacity: 0;
        }

        .animate-float {
          animation: float 3s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
};

export default EntryScreen;
