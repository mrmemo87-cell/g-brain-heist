import React, { useEffect, useState, useRef } from 'react';
import Lottie, { LottieRefCurrentProps } from 'lottie-react';
import { unzipSync } from 'fflate';
import { useLightMode } from '../src/contexts/LightModeContext';

interface CoinAnimationProps {
  width?: number;
  height?: number;
  loop?: boolean;
  speed?: number;
  className?: string;
}

/**
 * Animated coin component using Lottie animation
 * Displays a spinning/rotating coin animation
 * Automatically disabled in light mode for performance
 */
const CoinAnimation: React.FC<CoinAnimationProps> = ({ 
  width = 60, 
  height = 60, 
  loop = true,
  speed = 1,
  className = ''
}) => {
  const [animationData, setAnimationData] = useState<any>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const { isLightMode } = useLightMode();
  const lottieRef = useRef<LottieRefCurrentProps>(null);
  const containerClassName = ['coin-animation-container', className].filter(Boolean).join(' ');

  useEffect(() => {
    const animationSources = ['/icons/coin.lottie', '/icons/coin.json'];
    const decoder = new TextDecoder();

    const resolveLottieJson = (files: Record<string, Uint8Array>) => {
      const manifestEntry = files['manifest.json'];
      if (manifestEntry) {
        try {
          const manifest = JSON.parse(decoder.decode(manifestEntry));
          const targetAnim = manifest.animations?.[0];
          if (targetAnim?.id) {
            const animationPath = `animations/${targetAnim.id}.json`;
            if (files[animationPath]) {
              return JSON.parse(decoder.decode(files[animationPath]));
            }
          }
        } catch (e) {
          console.warn('Failed to parse .lottie manifest', e);
        }
      }

      const fallbackKey = Object.keys(files).find(key => key.toLowerCase().endsWith('.json'));
      if (fallbackKey) {
        return JSON.parse(decoder.decode(files[fallbackKey]));
      }

      return null;
    };

    const loadAnimation = async () => {
      for (const source of animationSources) {
        try {
          const response = await fetch(source);
          if (!response.ok) throw new Error(`Failed to load ${source}`);
          let data: any;

          if (source.endsWith('.lottie')) {
            const buffer = await response.arrayBuffer();
            const files = unzipSync(new Uint8Array(buffer));
            data = resolveLottieJson(files);
          } else {
            data = await response.json();
          }

          if (data && data.v && data.layers) {
            setAnimationData(data);
            setLoading(false);
            console.log('CoinAnimation loaded successfully', source);
            return;
          }

          throw new Error('Invalid animation data structure');
        } catch (err) {
          console.warn(`CoinAnimation failed to load from ${source}:`, err);
        }
      }

      setError(true);
      setLoading(false);
    };

    loadAnimation();
  }, []);

  // Set animation speed when speed prop changes
  useEffect(() => {
    if (lottieRef.current && animationData && speed !== 1) {
      try {
        lottieRef.current.setSpeed(speed);
      } catch (e) {
        console.warn('Failed to set animation speed:', e);
      }
    }
  }, [speed, animationData]);

  // Show placeholder while loading
  if (loading) {
    return (
      <div 
        style={{ width, height, backgroundColor: 'rgba(255, 200, 0, 0.15)', borderRadius: '4px' }} 
        className={className}
      />
    );
  }

  // Show spin animation placeholder if error
  if (error) {
    return (
      <div 
        style={{ 
          width, 
          height, 
          backgroundColor: 'rgba(255, 200, 0, 0.1)',
          borderRadius: '50%',
          border: '2px solid rgba(255, 200, 0, 0.3)',
          animation: 'spin 2s linear infinite'
        }} 
        className={className}
      />
    );
  }

  // Simple gold coin circle in lite mode
  if (isLightMode) {
    return (
      <div
        style={{
          width,
          height,
          borderRadius: '50%',
          background: 'linear-gradient(135deg, rgba(255, 215, 0, 0.85), rgba(255, 170, 0, 0.85))',
          boxShadow: '0 0 10px rgba(255, 215, 0, 0.8), inset 0 0 8px rgba(255, 255, 255, 0.6)',
          border: '1px solid rgba(255, 239, 159, 0.9)'
        }}
        className={className}
      />
    );
  }

  return (
    <>
      <style>{`
        @keyframes coinSpin {
          from { transform: rotateY(0deg); }
          to { transform: rotateY(360deg); }
        }
        .coin-animation-container {
          position: relative;
          display: inline-flex;
          align-items: center;
          justify-content: center;
        }
        .coin-spinner {
          animation: coinSpin 2s linear infinite !important;
          display: flex;
          align-items: center;
          justify-content: center;
          position: absolute;
          width: 100%;
          height: 100%;
        }
      `}</style>
      
      <div 
        className={containerClassName}
        style={{ 
          width, 
          height
        }} 
      >
        <div 
          className="coin-spinner"
          style={{
            background: 'radial-gradient(circle at 30% 30%, rgba(255, 220, 0, 0.8), rgba(255, 180, 0, 0.6))',
            borderRadius: '50%',
            border: '2px solid rgba(255, 200, 0, 0.9)',
            boxShadow: 'inset -2px -2px 5px rgba(0,0,0,0.3), 0 0 10px rgba(255, 200, 0, 0.5)',
            transformStyle: 'preserve-3d'
          }}
        />

        {/* Lottie animation on top */}
        {animationData && (
          <div style={{ position: 'relative', zIndex: 1 }}>
            <Lottie
              lottieRef={lottieRef}
              animationData={animationData}
              loop={loop}
              autoplay={true}
              style={{ width, height }}
            />
          </div>
        )}
      </div>
    </>
  );
};

export default CoinAnimation;
