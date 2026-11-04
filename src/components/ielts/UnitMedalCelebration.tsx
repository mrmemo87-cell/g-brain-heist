import React, { Suspense, lazy, useState } from 'react';
import { useAppEffects } from '../../native/effects/effectsStore';
import { hasWebGL } from './BlazeLive';

const Medal3D = lazy(() => import('./Medal3D'));

/**
 * App-only 3D medal drop when a unit is completed (IELTS Visual & UX Bible §14.3). Renders nothing on the
 * website, with Effects off or reduce-motion, or without WebGL; the existing confetti card stays as is.
 */
export function UnitMedalCelebration({ label }: { label: string }) {
  const { level } = useAppEffects();
  const [open, setOpen] = useState(true);
  if (!open || level === 'off' || !hasWebGL()) return null;
  return (
    <Suspense fallback={null}>
      <Medal3D label={label} level={level} onDone={() => setOpen(false)} />
    </Suspense>
  );
}

export default UnitMedalCelebration;
