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
  if (!isParticipant) reason = 'Observer mode: actions are participant-only.';
  else if (!isRostered) reason = 'You are in an involved clan but not locked into the war roster.';
  else if (!(status === 'live' || status === 'blackout')) reason = `War is currently ${status}. Actions unlock in live/blackout.`;
  else if (cooldownActive) reason = `Action cooldown active until ${new Date(cooldownMs).toLocaleTimeString()}.`;
  else reason = blackout ? 'Blackout is active: actions still land, exact score is hidden.' : 'Command console armed.';

  const canAct = isParticipant && isRostered && (status === 'live' || status === 'blackout') && !cooldownActive;

  const structureButtons: RivalryStructureCode[] = ['relay_core', 'cipher_vault', 'sentinel_grid'];

  return (
    <div className="space-y-3 animate-fade-in-up">
      <div className={`rounded-lg border px-3 py-2 text-xs transition-all ${canAct ? 'border-emerald-500/40 bg-emerald-900/20 text-emerald-100' : 'border-amber-400/30 bg-amber-900/20 text-amber-100'}`}>
        {reason}
      </div>

      <div className="text-xs uppercase text-gray-400 tracking-wide">Target Structure</div>
      <div className="flex gap-2 flex-wrap">
        {structureButtons.map((code) => (
          <button
            key={code}
            onClick={() => setTargetStructure(code)}
            disabled={!canAct || busy}
            className={`rounded-lg px-3 py-1 text-xs border transition-all duration-200 ${targetStructure === code ? 'border-cyan-300/80 bg-cyan-500/20 text-cyan-100 shadow-[0_0_14px_rgba(34,211,238,0.25)]' : 'border-white/10 bg-white/5 text-gray-200 hover:bg-white/10'} disabled:opacity-50`}
          >
            {code}
          </button>
        ))}
      </div>

      {blackout && <div className="rounded-lg bg-fuchsia-900/45 border border-fuchsia-400/40 p-2 text-xs text-fuchsia-100 shadow-[0_0_16px_rgba(217,70,239,0.25)]">⚠ Blackout active: exact score is hidden until settlement.</div>}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <button disabled={!canAct || busy || !enemyClanId} onClick={() => enemyClanId && onSubmit('strike', enemyClanId, targetStructure)} className="rounded-lg px-3 py-2 bg-red-600/85 hover:bg-red-500 disabled:opacity-50 text-sm text-white transition-all hover:shadow-[0_0_16px_rgba(239,68,68,0.35)]">Strike (2 OE)</button>
        <button disabled={!canAct || busy || !enemyClanId} onClick={() => enemyClanId && onSubmit('sabotage', enemyClanId, targetStructure)} className="rounded-lg px-3 py-2 bg-purple-600/85 hover:bg-purple-500 disabled:opacity-50 text-sm text-white transition-all hover:shadow-[0_0_16px_rgba(168,85,247,0.35)]">Sabotage (3 OE)</button>
        <button disabled={!canAct || busy || !ownClanId} onClick={() => ownClanId && onSubmit('repair', ownClanId, targetStructure)} className="rounded-lg px-3 py-2 bg-emerald-600/85 hover:bg-emerald-500 disabled:opacity-50 text-sm text-white transition-all hover:shadow-[0_0_16px_rgba(16,185,129,0.35)]">Repair (2 OE)</button>
      </div>
    </div>
  );
};

export default RivalryActionPanel;
