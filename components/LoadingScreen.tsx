import React from 'react';

interface LoadingScreenProps {
  message?: string;
  subMessage?: string;
}

/**
 * LoadingScreen - A sleek loading intro with the Brains Heist logo
 * Uses cross-browser compatible CSS animations (no path morphing)
 */
const LoadingScreen: React.FC<LoadingScreenProps> = ({
  message = 'Initializing Heist OS...',
  subMessage = 'Loading your profile and game data...',
}) => {
  return (
    <div className="loading-screen">
      {/* Animated background particles */}
      <div className="loading-particles">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="particle" style={{ '--delay': `${i * 0.3}s` } as React.CSSProperties} />
        ))}
      </div>

      {/* Logo container with glow effect */}
      <div className="loading-logo-container">
        {/* Outer ring animation */}
        <div className="loading-ring loading-ring-outer" />
        <div className="loading-ring loading-ring-inner" />
        
        {/* Logo with reveal animation */}
        <div className="loading-logo">
          <img 
            src="/logo.png" 
            alt="Brains Heist" 
            className="loading-logo-img"
          />
        </div>
      </div>

      {/* Text */}
      <div className="loading-text">
        <h1 className="loading-title">{message}</h1>
        <p className="loading-subtitle">{subMessage}</p>
      </div>

      {/* Loading bar */}
      <div className="loading-bar-container">
        <div className="loading-bar" />
      </div>

      <style>{`
        .loading-screen {
          min-height: 100vh;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 1rem;
          background: linear-gradient(135deg, #0a0a1a 0%, #1a1a2e 50%, #0a0a1a 100%);
          position: relative;
          overflow: hidden;
        }

        /* Floating particles */
        .loading-particles {
          position: absolute;
          inset: 0;
          pointer-events: none;
        }

        .particle {
          position: absolute;
          width: 4px;
          height: 4px;
          background: var(--ion-blue, #00d4ff);
          border-radius: 50%;
          opacity: 0;
          animation: floatUp 4s ease-in-out infinite;
          animation-delay: var(--delay);
        }

        .particle:nth-child(1) { left: 10%; }
        .particle:nth-child(2) { left: 25%; }
        .particle:nth-child(3) { left: 40%; }
        .particle:nth-child(4) { left: 60%; }
        .particle:nth-child(5) { left: 75%; }
        .particle:nth-child(6) { left: 90%; }

        @keyframes floatUp {
          0% {
            transform: translateY(100vh) scale(0);
            opacity: 0;
          }
          10% {
            opacity: 0.6;
          }
          90% {
            opacity: 0.6;
          }
          100% {
            transform: translateY(-20vh) scale(1);
            opacity: 0;
          }
        }

        /* Logo container */
        .loading-logo-container {
          position: relative;
          width: 180px;
          height: 180px;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        /* Spinning rings */
        .loading-ring {
          position: absolute;
          border-radius: 50%;
          border: 3px solid transparent;
        }

        .loading-ring-outer {
          width: 160px;
          height: 160px;
          border-top-color: var(--ion-blue, #00d4ff);
          border-right-color: var(--ion-blue, #00d4ff);
          animation: spinClockwise 2s linear infinite;
        }

        .loading-ring-inner {
          width: 130px;
          height: 130px;
          border-bottom-color: var(--plasma-pink, #ff00ff);
          border-left-color: var(--plasma-pink, #ff00ff);
          animation: spinCounterClockwise 1.5s linear infinite;
        }

        @keyframes spinClockwise {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        @keyframes spinCounterClockwise {
          from { transform: rotate(0deg); }
          to { transform: rotate(-360deg); }
        }

        /* Logo */
        .loading-logo {
          position: relative;
          z-index: 10;
          animation: logoReveal 1.2s ease-out forwards,
                     logoPulse 2s ease-in-out infinite 1.2s;
        }

        .loading-logo-img {
          width: 90px;
          height: 90px;
          object-fit: contain;
          filter: drop-shadow(0 0 20px rgba(0, 212, 255, 0.5));
        }

        @keyframes logoReveal {
          0% {
            transform: scale(0.5);
            opacity: 0;
            filter: blur(10px);
          }
          60% {
            transform: scale(1.1);
            opacity: 1;
            filter: blur(0);
          }
          100% {
            transform: scale(1);
            opacity: 1;
            filter: blur(0);
          }
        }

        @keyframes logoPulse {
          0%, 100% {
            transform: scale(1);
            filter: drop-shadow(0 0 20px rgba(0, 212, 255, 0.5));
          }
          50% {
            transform: scale(1.05);
            filter: drop-shadow(0 0 30px rgba(0, 212, 255, 0.8));
          }
        }

        /* Text */
        .loading-text {
          text-align: center;
          margin-top: 2rem;
          animation: textFadeIn 0.8s ease-out 0.5s forwards;
          opacity: 0;
        }

        @keyframes textFadeIn {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .loading-title {
          font-family: 'Orbitron', 'Segoe UI', sans-serif;
          font-size: 1.5rem;
          font-weight: bold;
          color: var(--ion-blue, #00d4ff);
          margin: 0;
          animation: titlePulse 2s ease-in-out infinite;
        }

        @keyframes titlePulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.7; }
        }

        .loading-subtitle {
          font-size: 0.875rem;
          color: #9ca3af;
          margin: 0.5rem 0 0 0;
        }

        /* Loading bar */
        .loading-bar-container {
          width: 200px;
          height: 3px;
          background: rgba(255, 255, 255, 0.1);
          border-radius: 2px;
          margin-top: 2rem;
          overflow: hidden;
          animation: barFadeIn 0.5s ease-out 0.8s forwards;
          opacity: 0;
        }

        @keyframes barFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        .loading-bar {
          height: 100%;
          width: 40%;
          background: linear-gradient(90deg, var(--ion-blue, #00d4ff), var(--plasma-pink, #ff00ff));
          border-radius: 2px;
          animation: loadingSlide 1.5s ease-in-out infinite;
        }

        @keyframes loadingSlide {
          0% {
            transform: translateX(-100%);
          }
          50% {
            transform: translateX(150%);
          }
          100% {
            transform: translateX(-100%);
          }
        }

        /* Glow effect behind logo */
        .loading-logo-container::before {
          content: '';
          position: absolute;
          width: 100px;
          height: 100px;
          background: radial-gradient(circle, rgba(0, 212, 255, 0.3) 0%, transparent 70%);
          border-radius: 50%;
          animation: glowPulse 2s ease-in-out infinite;
        }

        @keyframes glowPulse {
          0%, 100% {
            transform: scale(1);
            opacity: 0.5;
          }
          50% {
            transform: scale(1.3);
            opacity: 0.8;
          }
        }
      `}</style>
    </div>
  );
};

export default LoadingScreen;
