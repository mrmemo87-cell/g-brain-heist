import React, { useEffect, useState } from 'react';
import Lottie from 'lottie-react';
import { useLightMode } from '../src/contexts/LightModeContext';

interface LottieAnimationProps {
  url: string;
  width?: number;
  height?: number;
  loop?: boolean;
}

const LottieAnimation: React.FC<LottieAnimationProps> = ({ url, width = 200, height = 200, loop = true }) => {
  const [animationData, setAnimationData] = useState<any>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const { isLightMode } = useLightMode();

  useEffect(() => {
    if (isLightMode) {
      setLoading(false);
      setError(false);
      setAnimationData(null);
      return;
    }

    setLoading(true);
    setError(false);
    setAnimationData(null);

    fetch(url)
      .then(res => {
        if (!res.ok) throw new Error('Failed to load animation');
        return res.json();
      })
      .then(data => {
        // Validate that we have proper Lottie data
        if (data && data.v && data.layers) {
          setAnimationData(data);
          setLoading(false);
        } else {
          throw new Error('Invalid Lottie data');
        }
      })
      .catch((err) => {
        console.error('Failed to load Lottie animation:', url, err);
        setError(true);
        setLoading(false);
      });
  }, [url, isLightMode]);

  // Don't load or render animations in light mode
  if (isLightMode) {
    return null;
  }

  if (loading) {
    return <div style={{ width, height }} className="flex items-center justify-center">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-ion-blue"></div>
    </div>;
  }

  if (error || !animationData) {
    // Return empty div instead of showing error
    return <div style={{ width, height }} />;
  }

  try {
    return <Lottie animationData={animationData} loop={loop} style={{ width, height }} />;
  } catch (err) {
    console.error('Error rendering Lottie:', err);
    return <div style={{ width, height }} />;
  }
};

export default LottieAnimation;
