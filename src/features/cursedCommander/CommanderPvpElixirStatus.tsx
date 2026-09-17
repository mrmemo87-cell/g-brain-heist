import React, { useEffect, useState } from 'react';
import { getCommanderPvpBattleElixirs, type CommanderFrozenPvpElixir } from '../../../services/commanderPvpElixirVisibilityService';

const label = (elixir: CommanderFrozenPvpElixir) =>
  `+${elixir.boostRanks} ${elixir.statKey === 'omni' ? 'ALL SKILLS' : elixir.statKey.toUpperCase()}`;

const ElixirChip = ({ side, elixir }: { side: 'YOUR' | 'RIVAL'; elixir: CommanderFrozenPvpElixir }) => (
  <div className="min-w-0 rounded-xl border border-fuchsia-300/30 bg-fuchsia-400/[0.08] px-3 py-2 shadow-[0_0_24px_rgba(217,70,239,0.08)]">
    <span className="block text-[9px] font-black tracking-[0.14em] text-fuchsia-300">⚗ {side} FROZEN BATTLE ELIXIR</span>
    <strong className="mt-0.5 block truncate text-xs text-fuchsia-50">{elixir.name} · {label(elixir)}</strong>
  </div>
);

const CommanderPvpElixirStatus = ({ battleId }: { battleId: string }) => {
  const [data, setData] = useState<{ attacker: CommanderFrozenPvpElixir | null; defender: CommanderFrozenPvpElixir | null } | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void getCommanderPvpBattleElixirs(battleId, controller.signal)
      .then(setData)
      .catch(() => setData(null));
    return () => controller.abort();
  }, [battleId]);

  if (!data?.attacker && !data?.defender) return null;
  return (
    <section className="grid gap-2 sm:grid-cols-2" aria-label="Battle elixirs">
      {data.attacker ? <ElixirChip side="YOUR" elixir={data.attacker} /> : <div />}
      {data.defender ? <ElixirChip side="RIVAL" elixir={data.defender} /> : null}
    </section>
  );
};

export default CommanderPvpElixirStatus;
