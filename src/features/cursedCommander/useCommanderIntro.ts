import { useEffect, useRef, useState } from 'react';
import { buildCommanderIntroTimeline } from './commanderIntroTimeline';
import { playCommanderSfx, stopCommanderAudio } from './commanderBattleSound';

export function useCommanderIntro(units: readonly { id: string; side: string }[], onReady: () => void, soundOn: boolean, animationsOn: boolean) {
  const [state, setState] = useState({ done: false, team: '', label: 'BATTLE INITIALIZING', revealed: [] as string[] });
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const completed = useRef(false);
  const sound = useRef(soundOn);
  const ready = useRef(onReady);
  sound.current = soundOn;
  ready.current = onReady;
  const roster = JSON.stringify(units.map(({ id, side }) => ({ id, side })));
  const finish = () => {
    if (completed.current) return;
    completed.current = true;
    timers.current?.forEach(clearTimeout);
    timers.current = [];
    stopCommanderAudio();
    setState(current => ({ ...current, done: true, team: '', label: '', revealed: units.map(unit => unit.id) }));
    ready.current?.();
  };
  useEffect(() => {
    completed.current = false;
    setState({ done: false, team: '', label: 'BATTLE INITIALIZING', revealed: [] });
    const reduced = !animationsOn || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (sound.current) void playCommanderSfx('intro');
    for (const event of buildCommanderIntroTimeline(JSON.parse(roster), reduced)) {
      timers.current?.push(setTimeout(() => {
        if (completed.current) return;
        if (event.done) { finish(); return; }
        setState(current => ({
          ...current, team: event.team ?? current.team,
          label: event.label ?? (event.team ? '' : current.label),
          revealed: event.unitId ? [...current.revealed, event.unitId] : current.revealed,
        }));
        if (sound.current && event.cue) void playCommanderSfx(event.cue);
      }, event.at));
    }
    return () => {
      completed.current = true;
      timers.current?.forEach(clearTimeout);
      timers.current = [];
      stopCommanderAudio();
    };
    // A new roster/remount starts an intro; visual/audio toggles never restart it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roster]);
  return { ...state, skip: finish };
}
