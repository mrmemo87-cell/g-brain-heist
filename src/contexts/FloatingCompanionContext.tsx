import { createContext, useContext } from 'react';
import type React from 'react';

export type FloatingCompanion = {
 name: string; avatar: React.ReactNode; palette: string;
 greet: () => void; personalise: () => void; keepsakes: () => void; tuck: () => void;
};
export const FloatingCompanionContext = createContext<{
 companion: FloatingCompanion | null;
 register: (companion: FloatingCompanion | null) => void;
}>({ companion: null, register: () => {} });
export const useFloatingCompanion = () => useContext(FloatingCompanionContext);
