import React from 'react';
import { useLightMode } from '../src/contexts/LightModeContext';

interface CinematicEffectsProps {
  intensity: 'calm' | 'active' | 'alert';
}

const INTENSITY_CLASS: Record<CinematicEffectsProps['intensity'], string> = {
  calm: 'cinematic-effects cinematic-effects--calm',
  active: 'cinematic-effects cinematic-effects--active',
  alert: 'cinematic-effects cinematic-effects--alert',
};

const CinematicEffects: React.FC<CinematicEffectsProps> = ({ intensity }) => {
  const { isLightMode } = useLightMode();

  // Disable all effects in light mode
  if (isLightMode) {
    return null;
  }

  return (
    <div aria-hidden="true" className={INTENSITY_CLASS[intensity]}>
      <div className="cinematic-effects__aurora" />
      <div className="cinematic-effects__grid" />
      <div className="cinematic-effects__scanline" />
      <div className="cinematic-effects__pulse-ring" />
    </div>
  );
};

export default CinematicEffects;
