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

const RivalryActionPanel: React.FC<RivalryActionPanelProps> = ({ isParticipant, isRostered, status, enemyClanId, ownClanId, blackout, busy, cooldownUntil, onSubmit }) => {
  const [targetStructure, setTargetStructure] = React.useState<RivalryStructureCode>('relay_core');

  const nowMs = Date.now();
  const cooldownMs = cooldownUntil ? new Date(cooldownUntil).getTime() : 0;
  const cooldownActive = cooldownMs > nowMs;

  let reason = '';
  if (!isParticipant) reason = 'You are viewing as outsider. Actions are participant-only.';
  else if (!isRostered) reason = 'You are in an involved clan but not locked into the war roster.';
  else if (!(status === 'live' || status === 'blackout')) reason = `War is currently ${status}. Actions unlock in live/blackout.`;
  else if (cooldownActive) reason = `Action cooldown active until ${new Date(cooldownMs).toLocaleTimeString()}.`;
  else reason = blackout ? 'Blackout is active: actions still work, but exact score is hidden.' : 'Action console ready.';

  const canAct = isParticipant && isRostered && (status === 'live' || status === 'blackout') && !cooldownActive;

  const structureButtons: RivalryStructureCode[] = ['relay_core', 'cipher_vault', 'sentinel_grid'];

  return (
    <div className="space-y-3">
      <div className={`rounded-lg border px-3 py-2 text-xs ${canAct ? 'border-emerald-500/40 bg-emerald-900/20 text-emerald-100' : 'border-amber-400/30 bg-amber-900/20 text-amber-100'}`}>
        {reason}
      </div>

      <div className="text-xs uppercase text-gray-400">Target Structure</div>
      <div className="flex gap-2 flex-wrap">
        {structureButtons.map((code) => (
          <button key={code} onClick={() => setTargetStructure(code)} disabled={!canAct || busy} className={`rounded-lg px-3 py-1 text-xs border ${targetStructure === code ? 'border-cyan-300 bg-cyan-500/20' : 'border-white/10 bg-white/5'} disabled:opacity-50`}>
            {code}
          </button>
        ))}
      </div>

      {blackout && <div className="rounded-lg bg-fuchsia-900/40 border border-fuchsia-400/30 p-2 text-xs text-fuchsia-100">Blackout active: exact score is hidden until settlement.</div>}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <button disabled={!canAct || busy || !enemyClanId} onClick={() => enemyClanId && onSubmit('strike', enemyClanId, targetStructure)} className="rounded-lg px-3 py-2 bg-red-600/80 hover:bg-red-500 disabled:opacity-50 text-sm">Strike (2 OE)</button>
        <button disabled={!canAct || busy || !enemyClanId} onClick={() => enemyClanId && onSubmit('sabotage', enemyClanId, targetStructure)} className="rounded-lg px-3 py-2 bg-purple-600/80 hover:bg-purple-500 disabled:opacity-50 text-sm">Sabotage (3 OE)</button>
        <button disabled={!canAct || busy || !ownClanId} onClick={() => ownClanId && onSubmit('repair', ownClanId, targetStructure)} className="rounded-lg px-3 py-2 bg-emerald-600/80 hover:bg-emerald-500 disabled:opacity-50 text-sm">Repair (2 OE)</button>
      </div>
    </div>
  );
};

export default RivalryActionPanel;
