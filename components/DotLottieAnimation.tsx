import React, { useEffect, useState } from 'react';
import Lottie from 'lottie-react';
import { unzipSync } from 'fflate';
import { useLightMode } from '../src/contexts/LightModeContext';

interface DotLottieAnimationProps {
  src: string;
  width?: number;
  height?: number;
  loop?: boolean;
  autoplay?: boolean;
  respectLightMode?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * Renders a .lottie (binary/zipped) animation file.
 * Falls back gracefully in light mode or on error.
 */
const DotLottieAnimation: React.FC<DotLottieAnimationProps> = ({
  src,
  width = 200,
  height = 200,
  loop = true,
  autoplay = true,
  respectLightMode = true,
  className = '',
  style,
}) => {
  const [animationData, setAnimationData] = useState<any>(null);
  const [error, setError] = useState(false);
  const { isLightMode } = useLightMode();

  useEffect(() => {
    if (isLightMode && respectLightMode) return;

    let cancelled = false;
    const decoder = new TextDecoder();

    const load = async () => {
      try {
        const res = await fetch(src);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const buffer = await res.arrayBuffer();
        const files = unzipSync(new Uint8Array(buffer));

        // Try manifest first, then fall back to any .json file
        let data: any = null;
        const manifestEntry = files['manifest.json'];
        if (manifestEntry) {
          const manifest = JSON.parse(decoder.decode(manifestEntry));
          const anim = manifest.animations?.[0];
          if (anim?.id) {
            const path = `animations/${anim.id}.json`;
            if (files[path]) data = JSON.parse(decoder.decode(files[path]));
          }
        }
        if (!data) {
          const jsonKey = Object.keys(files).find(k => k.endsWith('.json') && k !== 'manifest.json');
          if (jsonKey) data = JSON.parse(decoder.decode(files[jsonKey]));
        }

        if (!cancelled && data?.v && data?.layers) {
          setAnimationData(data);
        } else if (!cancelled) {
          setError(true);
        }
      } catch {
        if (!cancelled) setError(true);
      }
    };

    load();
    return () => { cancelled = true; };
  }, [src, isLightMode, respectLightMode]);

  if ((isLightMode && respectLightMode) || error || !animationData) return null;

  return (
    <Lottie
      animationData={animationData}
      loop={loop}
      autoplay={autoplay}
      className={className}
      style={{ width, height, ...style }}
    />
  );
};

export default DotLottieAnimation;
