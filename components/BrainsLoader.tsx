import React from 'react';

interface BrainsLoaderProps {
  message?: string;
  fullScreen?: boolean;
  size?: number;
}

const BrainsLoader: React.FC<BrainsLoaderProps> = ({ message, fullScreen = true, size = 220 }) => {
  const loaderClass = fullScreen ? 'brains-loader brains-loader--full' : 'brains-loader brains-loader--inline';

  return (
    <div className={loaderClass}>
      <img
        src="/BRAINS.svg"
        alt="Loading..."
        className="brains-loader__image"
        style={{ width: `${size}px`, height: `${size}px` }}
      />
      {message && <p className="brains-loader__message">{message}</p>}

      <style>{`
        .brains-loader {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 1rem;
          text-align: center;
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

        .brains-loader__image {
          object-fit: contain;
          filter: drop-shadow(0 0 30px rgba(0, 212, 255, 0.6)) drop-shadow(0 0 60px rgba(255, 0, 255, 0.3));
          animation: brainsPulse 2s ease-in-out infinite;
        }

        .brains-loader__message {
          color: #7ce7ff;
          font-size: 1.125rem;
          letter-spacing: 0.04em;
          animation: fadeIn 0.8s ease-out;
        }

        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateY(4px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes brainsPulse {
          0%, 100% {
            filter: drop-shadow(0 0 30px rgba(0, 212, 255, 0.6)) drop-shadow(0 0 60px rgba(255, 0, 255, 0.3));
            transform: scale(1);
          }
          50% {
            filter: drop-shadow(0 0 50px rgba(0, 212, 255, 0.8)) drop-shadow(0 0 80px rgba(255, 0, 255, 0.5));
            transform: scale(1.03);
          }
        }

        @media (max-width: 480px) {
          .brains-loader__image {
            width: 70vw !important;
            height: 70vw !important;
            max-width: 260px;
            max-height: 260px;
          }
        }
      `}</style>
    </div>
  );
};

export default BrainsLoader;
