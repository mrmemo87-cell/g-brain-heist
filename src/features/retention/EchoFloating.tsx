import React, { useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useFloatingCompanion } from '../../contexts/FloatingCompanionContext';
import Echo3DAvatar from './Echo3DAvatar';
import EchoAvatar from './EchoAvatar';
import type { EchoPose, EchoPosition } from './echoModel';
import type { CompanionPalette } from './companionModel';

/** The pilot owns availability; the language control owns movement and docking. */
export default function EchoFloating({ name, palette, pose, tucked, practicing, onTuck, onStop, onGreet, onPersonalise, onKeepsakes, threeD = false }: {
 threeD?: boolean; message?: string; name: string; palette: CompanionPalette; pose: EchoPose; position: EchoPosition | null; tucked: boolean; practicing: boolean;
 onPosition: (position: EchoPosition) => void; onTuck: (value: boolean) => void; onStop: () => void; onGreet: () => void;
 onPersonalise: () => void; onKeepsakes: () => void;
}) {
 const { register } = useFloatingCompanion();
 // Inline parent callbacks must never trigger a registration/render loop.
 const actions = useRef({ onGreet, onPersonalise, onKeepsakes, onTuck });
 actions.current = { onGreet, onPersonalise, onKeepsakes, onTuck };
 const companion = useMemo(() => ({ name, palette, avatar: threeD ? <Echo3DAvatar pose={pose} palette={palette}/> : <EchoAvatar pose={pose} floating/>,
  greet: () => actions.current.onGreet(), personalise: () => actions.current.onPersonalise(),
  keepsakes: () => actions.current.onKeepsakes(), tuck: () => actions.current.onTuck(true),
 }), [name, palette, pose, threeD]);
 useEffect(() => { register(tucked || practicing ? null : companion); return () => register(null); }, [register, companion, tucked, practicing]);
 if (practicing || !tucked) return null;
 return createPortal(<div className="echo-floating-dock" lang="en" dir="ltr"><button type="button" onClick={() => onTuck(false)} aria-label={`Bring ${name} back`}>✦ {name}</button><button type="button" onClick={onStop} aria-label="Turn off floating companion">×</button></div>, document.body);
}

