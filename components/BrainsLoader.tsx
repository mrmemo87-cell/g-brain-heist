import React, { useState, useEffect, useRef } from 'react';

interface BrainsLoaderProps {
  message?: string;
  fullScreen?: boolean;
  size?: number;
}

const FLAVOR_LINES = [
  'Decrypting neural pathways…',
  'Initializing synaptic interface…',
  'Establishing secure uplink…',
  'Loading agent dossiers…',
  'Calibrating cognitive engines…',
  'Scanning for anomalies…',
  'Compiling mission briefing…',
  'Synchronizing memory banks…',
  'Warming up the heist engine…',
  'Bypassing firewall…',
  'Activating stealth protocols…',
  'Rendering holographic HUD…',
];

const BrainsLoader: React.FC<BrainsLoaderProps> = ({ message, fullScreen = true, size = 220 }) => {
  const loaderClass = fullScreen ? 'brains-loader brains-loader--full' : 'brains-loader brains-loader--inline';
  const [flavorIdx, setFlavorIdx] = useState(() => Math.floor(Math.random() * FLAVOR_LINES.length));
  const [progress, setProgress] = useState(0);
  const startRef = useRef(Date.now());

  // Rotate flavor text every 1.2s
  useEffect(() => {
    const id = setInterval(() => {
      setFlavorIdx((prev) => (prev + 1) % FLAVOR_LINES.length);
    }, 1200);
    return () => clearInterval(id);
  }, []);

  // Animate progress bar (eases toward 95% over ~6s, never hits 100 until unmount)
  useEffect(() => {
    let raf: number;
    const tick = () => {
      const elapsed = Date.now() - startRef.current;
      // Quick start, then slow ease toward 95%
      const raw = 1 - Math.exp(-elapsed / 2200);
      setProgress(Math.min(raw * 95, 95));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div className={loaderClass}>
      {/* Scan-line overlay */}
      <div className="brains-loader__scanlines" aria-hidden />

      {/* Logo */}
      <div className="brains-loader__logo-wrap">
        <img
          src="/BRAINS.svg"
          alt="Loading..."
          className="brains-loader__image"
          style={{ width: `${size}px`, height: `${size}px` }}
        />
      </div>

      {/* Progress bar */}
      <div className="brains-loader__bar-track">
        <div
          className="brains-loader__bar-fill"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Flavor text */}
      <p className="brains-loader__flavor" key={flavorIdx}>
        {FLAVOR_LINES[flavorIdx]}
      </p>

      {/* Optional caller message */}
      {message && <p className="brains-loader__message">{message}</p>}

      <style>{`
        .brains-loader {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 1rem;
          text-align: center;
          overflow: hidden;
        }

        .brains-loader--full {
          position: fixed;
          inset: 0;
          min-height: 100vh;
          width: 100%;
          z-index: 9999;
          background: linear-gradient(135deg, #0a0a1a 0%, #1a1a2e 50%, #0a0a1a 100%);
        }

        .brains-loader--inline {
          min-height: 320px;
          width: 100%;
        }

        /* ── Scan-line overlay ── */
        .brains-loader__scanlines {
          position: absolute;
          inset: 0;
          pointer-events: none;
          background: repeating-linear-gradient(
            0deg,
            transparent,
            transparent 3px,
            rgba(0, 212, 255, 0.015) 3px,
            rgba(0, 212, 255, 0.015) 4px
          );
          animation: scanScroll 4s linear infinite;
        }
        @keyframes scanScroll {
          from { transform: translateY(0); }
          to   { transform: translateY(8px); }
        }

        /* ── Logo ── */
        .brains-loader__logo-wrap {
          position: relative;
        }
        .brains-loader__image {
          object-fit: contain;
          filter: drop-shadow(0 0 30px rgba(0, 212, 255, 0.6))
                  drop-shadow(0 0 60px rgba(255, 0, 255, 0.3));
          animation: brainsPulse 2s ease-in-out infinite,
                     brainsGlitch 4s step-end infinite;
        }

        @keyframes brainsPulse {
          0%, 100% {
            filter: drop-shadow(0 0 30px rgba(0, 212, 255, 0.6))
                    drop-shadow(0 0 60px rgba(255, 0, 255, 0.3));
            transform: scale(1) translateX(0);
          }
          50% {
            filter: drop-shadow(0 0 50px rgba(0, 212, 255, 0.8))
                    drop-shadow(0 0 80px rgba(255, 0, 255, 0.5));
            transform: scale(1.03) translateX(0);
          }
        }

        /* Subtle horizontal glitch jitter */
        @keyframes brainsGlitch {
          0%, 92%, 100% { transform: translateX(0); }
          93%  { transform: translateX(-3px); }
          94%  { transform: translateX(2px); }
          95%  { transform: translateX(-1px); }
          96%  { transform: translateX(0); }
        }

        /* ── Progress bar ── */
        .brains-loader__bar-track {
          width: min(280px, 70vw);
          height: 4px;
          border-radius: 2px;
          background: rgba(255, 255, 255, 0.08);
          overflow: hidden;
        }
        .brains-loader__bar-fill {
          height: 100%;
          border-radius: 2px;
          background: linear-gradient(90deg, #00d4ff, #a855f7, #00d4ff);
          background-size: 200% 100%;
          animation: barShimmer 1.6s linear infinite;
          transition: width 0.15s ease-out;
        }
        @keyframes barShimmer {
          from { background-position: 200% 0; }
          to   { background-position: -200% 0; }
        }

        /* ── Flavor text ── */
        .brains-loader__flavor {
          color: #5eead4;
          font-size: 0.85rem;
          font-family: 'IBM Plex Mono', 'Courier New', monospace;
          letter-spacing: 0.06em;
          min-height: 1.4em;
          animation: flavorIn 0.35s ease-out;
        }
        @keyframes flavorIn {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }

        .brains-loader__message {
          color: #7ce7ff;
          font-size: 1.125rem;
          letter-spacing: 0.04em;
          animation: fadeIn 0.8s ease-out;
        }

        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(4px); }
          to   { opacity: 1; transform: translateY(0); }
        }

        @media (max-width: 480px) {
          .brains-loader__image {
            width: 70vw !important;
            height: 70vw !important;
            max-width: 260px;
            max-height: 260px;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .brains-loader__image {
            animation: none !important;
          }
          .brains-loader__scanlines {
            animation: none !important;
          }
          .brains-loader__bar-fill {
            animation: none !important;
          }
          .brains-loader__flavor {
            animation: none !important;
          }
        }
      `}</style>
    </div>
  );
};

export default BrainsLoader;
