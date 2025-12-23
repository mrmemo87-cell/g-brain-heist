import React from 'react';
import BrainsLoader from './BrainsLoader';

/**
 * LoadingScreen - Fullscreen loading overlay that centers the animated BRAINS.svg
 */
const LoadingScreen: React.FC = () => {
  return <BrainsLoader fullScreen size={320} message="Loading Brains Heist..." />;
};

export default LoadingScreen;
