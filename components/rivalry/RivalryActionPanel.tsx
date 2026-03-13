import React from 'react';
import { RivalryActionType, RivalryStructureCode } from '../../services/rivalryService';

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

const LABELS: Record<RivalryStructureCode, string> = {
  relay_core: 'Relay Core',
  cipher_vault: 'Cipher Vault',
  sentinel_grid: 'Sentinel Grid',
};

const RivalryActionPanel: React.FC<RivalryActionPanelProps> = ({ isParticipant, isRostered, status, enemyClanId, ownClanId, blackout, busy, cooldownUntil, onSubmit }) => {
  const [targetStructure, setTargetStructure] = React.useState<RivalryStructureCode>('relay_core');
  const [selectedAction, setSelectedAction] = React.useState<RivalryActionType>('strike');

  const nowMs = Date.now();
  const cooldownMs = cooldownUntil ? new Date(cooldownUntil).getTime() : 0;
  const cooldownActive = cooldownMs > nowMs;

  let reason = '';
  if (!isParticipant) reason = 'Public viewer mode: you can watch this war, but only participants can act.';
  else if (!isRostered) reason = 'You are in this clan, but you were not locked into the war squad.';
  else if (!(status === 'live' || status === 'blackout')) reason = 'Actions unlock once the mission reaches Live War.';
  else if (cooldownActive) reason = `Cooling down. You can act again at ${new Date(cooldownMs).toLocaleTimeString()}.`;
  else reason = blackout ? 'Blackout active: your actions count, but exact score is hidden.' : 'Action console ready.';

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
      <div className={`rounded-lg border px-3 py-2 text-xs ${canAct ? 'border-emerald-500/40 bg-emerald-900/20 text-emerald-100' : 'border-amber-400/30 bg-amber-900/20 text-amber-100'}`}>{reason}</div>

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
              {LABELS[code]}
            </button>
          ))}
        </div>
        <p className="text-xs text-gray-300 mt-2">Selected target: <span className="text-white font-semibold">{LABELS[targetStructure]}</span></p>
      </div>

      {blackout ? <div className="rounded-lg bg-fuchsia-900/45 border border-fuchsia-400/40 p-2 text-xs text-fuchsia-100">⚠ Final phase: exact score is hidden until results.</div> : null}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <button disabled={!canAct || busy || !enemyClanId} onClick={() => submit('strike')} className={`rounded-lg px-3 py-2 disabled:opacity-50 text-sm text-white ${selectedAction === 'strike' ? 'bg-red-500' : 'bg-red-600/85 hover:bg-red-500'}`}>
          Strike
          <div className="text-[11px] text-red-100/90">Damage enemy structures</div>
        </button>
        <button disabled={!canAct || busy || !enemyClanId} onClick={() => submit('sabotage')} className={`rounded-lg px-3 py-2 disabled:opacity-50 text-sm text-white ${selectedAction === 'sabotage' ? 'bg-purple-500' : 'bg-purple-600/85 hover:bg-purple-500'}`}>
          Sabotage
          <div className="text-[11px] text-purple-100/90">Disrupt enemy systems</div>
        </button>
        <button disabled={!canAct || busy || !ownClanId} onClick={() => submit('repair')} className={`rounded-lg px-3 py-2 disabled:opacity-50 text-sm text-white ${selectedAction === 'repair' ? 'bg-emerald-500' : 'bg-emerald-600/85 hover:bg-emerald-500'}`}>
          Repair
          <div className="text-[11px] text-emerald-100/90">Restore your structures</div>
        </button>
      </div>
    </div>
  );
};

export default RivalryActionPanel;
