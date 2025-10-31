import React, { useEffect, useState } from 'react';
import Lottie from 'lottie-react';

interface LottieAnimationProps {
  url: string;
  width?: number;
  height?: number;
  loop?: boolean;
}

const LottieAnimation: React.FC<LottieAnimationProps> = ({ url, width = 200, height = 200, loop = true }) => {
  const [animationData, setAnimationData] = useState<any>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch(url)
      .then(res => res.json())
      .then(data => setAnimationData(data))
      .catch(() => setError(true));
  }, [url]);

  if (error || !animationData) {
    return <div style={{ width, height }} className="animate-pulse bg-black/20 rounded" />;
  }

  return <Lottie animationData={animationData} loop={loop} style={{ width, height }} />;
};

export default LottieAnimation;
