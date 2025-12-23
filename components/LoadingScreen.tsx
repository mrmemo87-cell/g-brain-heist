import React, { useState, useEffect } from 'react';

interface LoadingScreenProps {
  message?: string;
  subMessage?: string;
}

// Terminal-style text typing animation messages
const terminalMessages = [
  'Establishing neural link...',
  'Bypassing firewall protocols...',
  'Syncing brain waves...',
  'Loading heist modules...',
  'Calibrating cognitive interface...',
  'Connecting to the grid...',
];

/**
 * LoadingScreen - A sleek loading intro with the Brains Heist logo
 * Features: Glitch effect, scanlines, typing terminal, neural network animation
 */
const LoadingScreen: React.FC<LoadingScreenProps> = ({
  message = 'Initializing Heist OS...',
  subMessage = 'Loading your profile and game data...',
}) => {
  const [terminalText, setTerminalText] = useState('');
  const [messageIndex, setMessageIndex] = useState(0);
  const [charIndex, setCharIndex] = useState(0);
  const [showCursor, setShowCursor] = useState(true);

  // Typing effect for terminal
  useEffect(() => {
    const currentMessage = terminalMessages[messageIndex];
    
    if (charIndex < currentMessage.length) {
      const timeout = setTimeout(() => {
        setTerminalText(prev => prev + currentMessage[charIndex]);
        setCharIndex(prev => prev + 1);
      }, 40 + Math.random() * 30);
      return () => clearTimeout(timeout);
    } else {
      // Move to next message after delay
      const timeout = setTimeout(() => {
        setTerminalText('');
        setCharIndex(0);
        setMessageIndex(prev => (prev + 1) % terminalMessages.length);
      }, 1500);
      return () => clearTimeout(timeout);
    }
  }, [charIndex, messageIndex]);

  // Blinking cursor
  useEffect(() => {
    const interval = setInterval(() => setShowCursor(prev => !prev), 500);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="loading-screen">
      {/* Scanline overlay */}
      <div className="scanlines" />
      
      {/* Neural network background */}
      <div className="neural-network">
        {[...Array(12)].map((_, i) => (
          <div key={i} className="neural-node" style={{ 
            '--node-delay': `${i * 0.2}s`,
            '--node-x': `${10 + (i % 4) * 25}%`,
            '--node-y': `${15 + Math.floor(i / 4) * 30}%`,
          } as React.CSSProperties} />
        ))}
        {/* Neural connection lines */}
        <svg className="neural-connections" viewBox="0 0 100 100" preserveAspectRatio="none">
          <path d="M10,15 L35,15 L60,45 L85,15" className="neural-path" />
          <path d="M10,45 L35,75 L60,45 L85,75" className="neural-path" />
          <path d="M35,15 L35,75" className="neural-path" />
          <path d="M60,15 L60,75" className="neural-path" />
        </svg>
      </div>

      {/* Animated background particles */}
      <div className="loading-particles">
        {[...Array(8)].map((_, i) => (
          <div key={i} className="particle" style={{ '--delay': `${i * 0.4}s` } as React.CSSProperties} />
        ))}
      </div>

      {/* Logo container with glow effect */}
      <div className="loading-logo-container">
        {/* Hexagon rings */}
        <div className="hex-ring hex-ring-1" />
        <div className="hex-ring hex-ring-2" />
        
        {/* Outer ring animation */}
        <div className="loading-ring loading-ring-outer" />
        <div className="loading-ring loading-ring-inner" />
        
        {/* Logo with glitch and reveal animation */}
        <div className="loading-logo">
          <div className="glitch-wrapper">
            <img 
              src="/BRAINS.svg" 
              alt="Brains Heist" 
              className="loading-logo-img brains-svg"
            />
            <img 
              src="/BRAINS.svg" 
              alt="" 
              className="loading-logo-img glitch-clone glitch-r"
              aria-hidden="true"
            />
            <img 
              src="/BRAINS.svg" 
              alt="" 
              className="loading-logo-img glitch-clone glitch-b"
              aria-hidden="true"
            />
          </div>
        </div>
      </div>

      {/* Text */}
      <div className="loading-text">
        <h1 className="loading-title">{message}</h1>
        <p className="loading-subtitle">{subMessage}</p>
      </div>

      {/* Terminal output */}
      <div className="terminal-output">
        <span className="terminal-prompt">&gt;</span>
        <span className="terminal-text">{terminalText}</span>
        <span className={`terminal-cursor ${showCursor ? 'visible' : 'hidden'}`}>_</span>
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

        /* Scanline overlay */
        .scanlines {
          position: absolute;
          inset: 0;
          background: repeating-linear-gradient(
            0deg,
            rgba(0, 0, 0, 0.15) 0px,
            rgba(0, 0, 0, 0.15) 1px,
            transparent 1px,
            transparent 2px
          );
          pointer-events: none;
          z-index: 100;
          animation: scanlineFlicker 0.1s infinite;
        }

        @keyframes scanlineFlicker {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.97; }
        }

        /* Neural network background */
        .neural-network {
          position: absolute;
          inset: 0;
          pointer-events: none;
          opacity: 0.3;
        }

        .neural-node {
          position: absolute;
          width: 8px;
          height: 8px;
          background: var(--ion-blue, #00d4ff);
          border-radius: 50%;
          left: var(--node-x);
          top: var(--node-y);
          animation: nodePulse 2s ease-in-out infinite;
          animation-delay: var(--node-delay);
          box-shadow: 0 0 10px var(--ion-blue, #00d4ff);
        }

        @keyframes nodePulse {
          0%, 100% { transform: scale(1); opacity: 0.5; }
          50% { transform: scale(1.5); opacity: 1; }
        }

        .neural-connections {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
        }

        .neural-path {
          fill: none;
          stroke: var(--ion-blue, #00d4ff);
          stroke-width: 0.3;
          stroke-dasharray: 5;
          animation: pathFlow 3s linear infinite;
        }

        @keyframes pathFlow {
          from { stroke-dashoffset: 0; }
          to { stroke-dashoffset: -20; }
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

        .particle:nth-child(1) { left: 8%; }
        .particle:nth-child(2) { left: 20%; }
        .particle:nth-child(3) { left: 35%; }
        .particle:nth-child(4) { left: 50%; }
        .particle:nth-child(5) { left: 65%; }
        .particle:nth-child(6) { left: 78%; }
        .particle:nth-child(7) { left: 88%; }
        .particle:nth-child(8) { left: 95%; }

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
          width: 200px;
          height: 200px;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        /* Hexagon rings */
        .hex-ring {
          position: absolute;
          width: 180px;
          height: 180px;
          border: 2px solid rgba(0, 212, 255, 0.2);
          clip-path: polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%);
        }

        .hex-ring-1 {
          animation: hexRotate 8s linear infinite;
        }

        .hex-ring-2 {
          width: 150px;
          height: 150px;
          border-color: rgba(255, 0, 255, 0.2);
          animation: hexRotate 6s linear infinite reverse;
        }

        @keyframes hexRotate {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
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

        /* Glitch wrapper */
        .glitch-wrapper {
          position: relative;
        }

        .glitch-clone {
          position: absolute;
          top: 0;
          left: 0;
          opacity: 0.8;
        }

        .glitch-r {
          animation: glitchR 2.5s infinite;
        }

        .glitch-b {
          animation: glitchB 2.5s infinite;
        }

        @keyframes glitchR {
          0%, 90%, 100% {
            transform: translate(0);
            filter: hue-rotate(0deg);
            opacity: 0;
          }
          92% {
            transform: translate(3px, -2px);
            filter: hue-rotate(-60deg);
            opacity: 0.6;
          }
          94% {
            transform: translate(-2px, 1px);
            filter: hue-rotate(-60deg);
            opacity: 0.4;
          }
          96% {
            transform: translate(1px, 2px);
            filter: hue-rotate(-60deg);
            opacity: 0;
          }
        }

        @keyframes glitchB {
          0%, 90%, 100% {
            transform: translate(0);
            filter: hue-rotate(0deg);
            opacity: 0;
          }
          91% {
            transform: translate(-2px, 2px);
            filter: hue-rotate(90deg);
            opacity: 0.6;
          }
          93% {
            transform: translate(3px, -1px);
            filter: hue-rotate(90deg);
            opacity: 0.4;
          }
          95% {
            transform: translate(-1px, -2px);
            filter: hue-rotate(90deg);
            opacity: 0;
          }
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

        /* Enhanced BRAINS.svg styling */
        .loading-logo-img.brains-svg {
          width: 150px;
          height: 150px;
          filter: drop-shadow(0 0 25px rgba(0, 212, 255, 0.7))
                  drop-shadow(0 0 50px rgba(255, 0, 255, 0.4));
          animation: brainsPulse 2s ease-in-out infinite;
        }

        @keyframes brainsPulse {
          0%, 100% {
            filter: drop-shadow(0 0 25px rgba(0, 212, 255, 0.7))
                    drop-shadow(0 0 50px rgba(255, 0, 255, 0.4));
            transform: scale(1);
          }
          50% {
            filter: drop-shadow(0 0 35px rgba(0, 212, 255, 0.9))
                    drop-shadow(0 0 70px rgba(255, 0, 255, 0.6));
            transform: scale(1.03);
          }
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

        /* Terminal output */
        .terminal-output {
          font-family: 'Fira Code', 'Consolas', monospace;
          font-size: 0.85rem;
          color: #10b981;
          margin-top: 1.5rem;
          padding: 0.75rem 1.25rem;
          background: rgba(0, 0, 0, 0.4);
          border: 1px solid rgba(16, 185, 129, 0.3);
          border-radius: 6px;
          min-width: 280px;
          text-align: left;
          animation: terminalFadeIn 0.5s ease-out 1s forwards;
          opacity: 0;
        }

        @keyframes terminalFadeIn {
          from { opacity: 0; transform: translateY(5px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .terminal-prompt {
          color: var(--ion-blue, #00d4ff);
          margin-right: 0.5rem;
        }

        .terminal-text {
          color: #10b981;
        }

        .terminal-cursor {
          color: #10b981;
          animation: none;
        }

        .terminal-cursor.hidden {
          opacity: 0;
        }

        .terminal-cursor.visible {
          opacity: 1;
        }

        /* Loading bar */
        .loading-bar-container {
          width: 200px;
          height: 3px;
          background: rgba(255, 255, 255, 0.1);
          border-radius: 2px;
          margin-top: 1.5rem;
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
