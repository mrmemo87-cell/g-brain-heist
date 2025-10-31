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
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(url)
      .then(res => res.json())
      .then(data => {
        setAnimationData(data);
        setLoading(false);
      })
      .catch(() => {
        setError(true);
        setLoading(false);
      });
  }, [url]);

  if (loading) {
    return <div style={{ width, height }} className="flex items-center justify-center">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-ion-blue"></div>
    </div>;
  }

  if (error || !animationData) {
    return <div style={{ width, height }} className="animate-pulse bg-black/20 rounded" />;
  }

  return <Lottie animationData={animationData} loop={loop} style={{ width, height }} />;
};

export default LottieAnimation;
