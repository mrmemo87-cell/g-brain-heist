import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

const STORAGE_KEY = 'gbrain-lite-mode';

interface LightModeContextType {
  isLightMode: boolean;
  toggleLightMode: () => void;
}

const LightModeContext = createContext<LightModeContextType | undefined>(undefined);

export const LightModeProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [isLightMode, setIsLightMode] = useState<boolean>(() => {
    if (typeof window === 'undefined') {
      return false;
    }
    try {
      return window.localStorage.getItem(STORAGE_KEY) === 'true';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(STORAGE_KEY, String(isLightMode));
      } catch {
        /* ignore storage errors */
      }
    }
    
    // Apply global class to body for CSS targeting
    if (isLightMode) {
      document.body.classList.add('light-mode');
      document.body.classList.add('lite-mode');
      document.body.classList.remove('performance-mode-disabled');
    } else {
      document.body.classList.remove('light-mode');
      document.body.classList.remove('lite-mode');
      document.body.classList.add('performance-mode-disabled');
    }
  }, [isLightMode]);

  const toggleLightMode = () => {
    setIsLightMode((prev) => !prev);
  };

  return (
    <LightModeContext.Provider value={{ isLightMode, toggleLightMode }}>
      {children}
    </LightModeContext.Provider>
  );
};

export const useLightMode = (): LightModeContextType => {
  const context = useContext(LightModeContext);
  if (!context) {
    throw new Error('useLightMode must be used within LightModeProvider');
  }
  return context;
};
