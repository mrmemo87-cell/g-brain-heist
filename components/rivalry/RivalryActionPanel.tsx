import React from 'react';
import { RivalryActionType, RivalryStructureCode } from '../../services/rivalryService';
import { RIVALRY_STRUCTURE_LABELS } from './rivalryLabels';
import { actionBadgeAssetMap } from './rivalryAssets';
import RivalryImage from './RivalryImage';

interface RivalryActionPanelProps {
  isParticipant: boolean;
  isRostered: boolean;
  status: string;
  enemyClanId?: string | null;
  ownClanId?: string | null;
  blackout: boolean;
  busy: boolean;
  cooldownUntil?: string | null;
  onSubmit: (actionType: RivalryActionType, targetClanId: string, target: RivalryStructureCode) => void;
}

const RivalryActionPanel: React.FC<RivalryActionPanelProps> = ({ isParticipant, isRostered, status, enemyClanId, ownClanId, blackout, busy, cooldownUntil, onSubmit }) => {
  const [targetStructure, setTargetStructure] = React.useState<RivalryStructureCode>('relay_core');
  const [selectedAction, setSelectedAction] = React.useState<RivalryActionType>('strike');

  const nowMs = Date.now();
  const cooldownMs = cooldownUntil ? new Date(cooldownUntil).getTime() : 0;
  const cooldownActive = cooldownMs > nowMs;

  let reason = '';
  let stateLabel = 'READY';
  if (!isParticipant) {
    reason = 'Outsider mode: watch the war live, but only active participants can use actions.';
    stateLabel = 'OUTSIDER';
  } else if (!isRostered) {
    reason = 'Not rostered: your clan is in this war, but you were not locked into the combat squad.';
    stateLabel = 'NOT ROSTERED';
  } else if (!(status === 'live' || status === 'blackout')) {
    reason = 'Action console is staged. Actions unlock once the war reaches the Live phase.';
    stateLabel = 'STAGED';
  } else if (cooldownActive) {
    reason = `Cooldown active. You can act again at ${new Date(cooldownMs).toLocaleTimeString()}.`;
    stateLabel = 'COOLDOWN';
  } else if (blackout) {
    reason = 'Blackout active: actions still count, but exact score is hidden until settlement.';
    stateLabel = 'BLACKOUT';
  } else {
    reason = 'Action console ready. Coordinate your role and push for objective control.';
  }

  const canAct = isParticipant && isRostered && (status === 'live' || status === 'blackout') && !cooldownActive;
  const structureButtons: RivalryStructureCode[] = ['relay_core', 'cipher_vault', 'sentinel_grid'];

  const submit = (action: RivalryActionType) => {
    setSelectedAction(action);
    if (action === 'repair') {
      if (ownClanId) onSubmit('repair', ownClanId, targetStructure);
      return;
    }
    if (enemyClanId) onSubmit(action, enemyClanId, targetStructure);
  };

  return (
    <div className="space-y-3 animate-fade-in-up">
      <div className={`rounded-lg border px-3 py-2 text-xs ${canAct ? 'border-emerald-500/40 bg-emerald-900/20 text-emerald-100' : 'border-amber-400/30 bg-amber-900/20 text-amber-100'}`}>
        <span className="mr-2 rounded-full border border-white/20 px-2 py-0.5 text-[10px] tracking-[0.2em]">{stateLabel}</span>{reason}
      </div>

      <div className="rounded-lg border border-white/10 bg-black/30 p-3">
        <p className="text-xs uppercase text-gray-400 tracking-wide">Target Selection</p>
        <div className="mt-2 flex gap-2 flex-wrap">
          {structureButtons.map((code) => (
            <button
              key={code}
              onClick={() => setTargetStructure(code)}
              disabled={!canAct || busy}
              className={`rounded-lg px-3 py-1.5 text-xs border ${targetStructure === code ? 'border-cyan-300/80 bg-cyan-500/20 text-cyan-100' : 'border-white/10 bg-white/5 text-gray-200'} disabled:opacity-50`}
            >
              {RIVALRY_STRUCTURE_LABELS[code]}
            </button>
          ))}
        </div>
        <p className="text-xs text-gray-300 mt-2">Selected target: <span className="text-white font-semibold">{RIVALRY_STRUCTURE_LABELS[targetStructure]}</span></p>
      </div>

      {blackout ? <div className="rounded-lg bg-fuchsia-900/45 border border-fuchsia-400/40 p-2 text-xs text-fuchsia-100">⚠ Final phase: exact score is hidden until results.</div> : null}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <button disabled={!canAct || busy || !enemyClanId} onClick={() => submit('strike')} className={`rounded-lg px-3 py-2 disabled:opacity-50 text-sm text-white border transition-all ${selectedAction === 'strike' ? 'bg-red-500 border-red-200/70 shadow-[0_0_20px_rgba(239,68,68,0.55)]' : 'bg-red-600/85 border-red-300/25 hover:bg-red-500 hover:-translate-y-0.5'}`}>
          <RivalryImage src={actionBadgeAssetMap.strike} alt="Strike" className="h-8 w-8 mx-auto mb-1 object-contain" />
          Strike
          <div className="text-[11px] text-red-100/90">Damage enemy structures</div>
        </button>
        <button disabled={!canAct || busy || !enemyClanId} onClick={() => submit('sabotage')} className={`rounded-lg px-3 py-2 disabled:opacity-50 text-sm text-white border transition-all ${selectedAction === 'sabotage' ? 'bg-purple-500 border-purple-200/70 shadow-[0_0_20px_rgba(168,85,247,0.55)]' : 'bg-purple-600/85 border-purple-300/25 hover:bg-purple-500 hover:-translate-y-0.5'}`}>
          <RivalryImage src={actionBadgeAssetMap.sabotage} alt="Sabotage" className="h-8 w-8 mx-auto mb-1 object-contain" />
          Sabotage
          <div className="text-[11px] text-purple-100/90">Disrupt enemy systems</div>
        </button>
        <button disabled={!canAct || busy || !ownClanId} onClick={() => submit('repair')} className={`rounded-lg px-3 py-2 disabled:opacity-50 text-sm text-white border transition-all ${selectedAction === 'repair' ? 'bg-emerald-500 border-emerald-200/70 shadow-[0_0_20px_rgba(16,185,129,0.55)]' : 'bg-emerald-600/85 border-emerald-300/25 hover:bg-emerald-500 hover:-translate-y-0.5'}`}>
          <RivalryImage src={actionBadgeAssetMap.repair} alt="Repair" className="h-8 w-8 mx-auto mb-1 object-contain" />
          Repair
          <div className="text-[11px] text-emerald-100/90">Restore your structures</div>
        </button>
      </div>
    </div>
  );
};

export default RivalryActionPanel;
