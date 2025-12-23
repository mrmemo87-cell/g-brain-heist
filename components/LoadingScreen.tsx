import React from 'react';

interface LoadingScreenProps {
  message?: string;
  subMessage?: string;
}

/**
 * LoadingScreen - Simple, clean loading screen featuring the BRAINS.svg animation
 */
const LoadingScreen: React.FC<LoadingScreenProps> = () => {
  return (
    <div className="brains-loading-screen">
      {/* BRAINS SVG - the main focus */}
      <div className="brains-container">
        <img 
          src="/BRAINS.svg" 
          alt="Loading..." 
          className="brains-svg"
        />
      </div>

      <style>{`
        .brains-loading-screen {
          min-height: 100vh;
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          background: linear-gradient(135deg, #0a0a1a 0%, #1a1a2e 50%, #0a0a1a 100%);
          position: fixed;
          inset: 0;
          z-index: 9999;
        }

        .brains-container {
          display: flex;
          align-items: center;
          justify-content: center;
          animation: fadeIn 0.5s ease-out;
        }

        .brains-svg {
          width: 300px;
          height: 300px;
          object-fit: contain;
          filter: drop-shadow(0 0 30px rgba(0, 212, 255, 0.6))
                  drop-shadow(0 0 60px rgba(255, 0, 255, 0.3));
          animation: brainsPulse 2s ease-in-out infinite;
        }

        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: scale(0.9);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }

        @keyframes brainsPulse {
          0%, 100% {
            filter: drop-shadow(0 0 30px rgba(0, 212, 255, 0.6))
                    drop-shadow(0 0 60px rgba(255, 0, 255, 0.3));
            transform: scale(1);
          }
          50% {
            filter: drop-shadow(0 0 50px rgba(0, 212, 255, 0.8))
                    drop-shadow(0 0 80px rgba(255, 0, 255, 0.5));
            transform: scale(1.02);
          }
        }

        /* Responsive sizing */
        @media (max-width: 480px) {
          .brains-svg {
            width: 200px;
            height: 200px;
          }
        }

        @media (min-width: 768px) {
          .brains-svg {
            width: 400px;
            height: 400px;
          }
        }
      `}</style>
    </div>
  );
};

export default LoadingScreen;
