import React from 'react';
import { COMMANDER_VFX } from './commanderVfxAssets';
import './commanderBattleEffects.css';

const hideUnavailableArt = (event: React.SyntheticEvent<HTMLImageElement>) => {
  event.currentTarget.hidden = true;
};

export const TacticalBackdrop = () => (
  <div aria-hidden className="cc-painted-arena">
    <img src={COMMANDER_VFX.arena} alt="" draggable={false} onError={hideUnavailableArt} />
    <div className="cc-arena-depth" />
    <div className="cc-arena-sidelight cc-arena-sidelight--ally" />
    <div className="cc-arena-sidelight cc-arena-sidelight--enemy" />
  </div>
);

export const ImpactBurst: React.FC<{ deathBolt: boolean; shieldOnly: boolean }> = ({ deathBolt, shieldOnly }) => (
  <span aria-hidden className={`cc-vfx-impact cc-vfx-anchor ${deathBolt ? 'cc-vfx-void' : shieldOnly ? 'cc-vfx-cyan' : ''}`}>
    <img src={COMMANDER_VFX.slash} alt="" draggable={false} onError={hideUnavailableArt} />
    {deathBolt && <img className="cc-vfx-impact-fracture" src={COMMANDER_VFX.lance} alt="" draggable={false} onError={hideUnavailableArt} />}
  </span>
);

export const DeathBoltCharge = () => (
  <span aria-hidden className="cc-vfx-charge cc-vfx-anchor">
    <img src={COMMANDER_VFX.lance} alt="" draggable={false} onError={hideUnavailableArt} />
    <span className="cc-vfx-charge-core" />
  </span>
);

/** Open-centred refractive plates preserve visibility of the character inside. */
export const AegisShield = () => (
  <span aria-hidden className="cc-vfx-aegis">
    <svg viewBox="0 0 160 190" fill="none">
      <path d="M80 8 145 30 139 111 116 150 80 181 44 150 21 111 15 30Z" fill="#083344" fillOpacity=".18" stroke="#67e8f9" strokeOpacity=".65" />
      <path d="m80 14 58 21-6 74-21 36-31 27-31-27-21-36-6-74Z" stroke="#cffafe" strokeWidth="2" strokeDasharray="54 12 10 8" />
      <path d="m25 39 16 5 5 35-14 14Zm6 66 15-12 13 28-9 17Zm27 39 10-15 12 12v25Zm77-105-16 5-5 35 14 14Zm-6 66-15-12-13 28 9 17Zm-27 39-10-15-12 12v25Z" fill="#22d3ee" fillOpacity=".24" stroke="#a5f3fc" strokeWidth=".8" />
      <path d="m8 28 9 43-5 11 12 29m128-83-9 43 5 11-12 29M49 11l31-8 31 8" stroke="#e0f2fe" strokeWidth="2" />
      <path d="M41 46h12m54 0h12M48 55h9m46 0h9M58 26l22-6 22 6" stroke="#67e8f9" strokeWidth="1.5" />
    </svg>
    <img src={COMMANDER_VFX.lance} alt="" className="cc-vfx-aegis-energy" draggable={false} onError={hideUnavailableArt} />
  </span>
);

export const TacticalTargetReticle: React.FC<{ selected: boolean; focused: boolean; focusLock: boolean }> = ({ selected, focused, focusLock }) => {
  if (!selected && !focused && !focusLock) return null;
  return (
    <span aria-hidden className={`cc-vfx-lock ${focused || focusLock ? 'cc-vfx-lock--focused' : ''}`}>
      <svg viewBox="0 0 160 180" fill="none">
        <path d="M12 54V31l15-15h29m48 0h29l15 15v23M12 126v23l15 15h29m48 0h29l15-15v-23" stroke="currentColor" strokeWidth="2" />
        <path d="M19 51V34l12-11h20m58 0h20l12 11v17M19 129v17l12 11h20m58 0h20l12-11v-17" stroke="currentColor" strokeWidth=".6" opacity=".6" />
        <path d="M3 65h9m-9 6h6m-6 6h9m136-12h9m-6 6h6m-9 6h9M64 8h32m-28 164h24" stroke="currentColor" strokeWidth="2" />
        <path d="m73 1 7 6 7-6M1 94l6-4-6-4m158 8-6-4 6-4" fill="currentColor" />
        {(focused || focusLock) && <path className="cc-vfx-lock-scan" d="M24 86h38m36 0h38M80 48v20m0 36v20m-8-38 8-8 8 8-8 8Z" stroke="currentColor" strokeWidth="1.5" />}
      </svg>
    </span>
  );
};

/** One low-opacity exposure per Death Bolt impact; never an ambient strobe. */
export const StormDischarge = () => (
  <div aria-hidden className="cc-storm-discharge">
    <div className="cc-storm-exposure" />
    <svg viewBox="0 0 1000 800" preserveAspectRatio="none" fill="none">
      <path d="M635-20 591 78 618 99 542 209 565 225 482 380 505 392 421 552 442 563 366 770M542 209l-73-28-54 67 12 29-73 73m151 42 98 43-22 60 37 65M591 78l102 18 48 62-17 22 68 74" stroke="#a5b4fc" strokeWidth="5" strokeOpacity=".22" />
      <path d="M635-20 591 78 618 99 542 209 565 225 482 380 505 392 421 552 442 563 366 770" stroke="#ede9fe" strokeWidth="1.5" />
    </svg>
  </div>
);
