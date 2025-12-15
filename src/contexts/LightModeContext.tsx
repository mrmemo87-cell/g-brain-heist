import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

const STORAGE_KEY = 'gbrain-lite-mode';

interface LightModeContextType {
  isLightMode: boolean;
  toggleLightMode: () => void;
  /**
   * When set, light mode was auto-enabled to protect performance or battery.
   */
  autoEnabledReason: string | null;
  /**
   * Clears the last auto-enable notice (e.g. after the user manually opts back into full mode).
   */
  clearAutoEnabledReason: () => void;
}

const LightModeContext = createContext<LightModeContextType | undefined>(undefined);

export const LightModeProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [isLightMode, setIsLightMode] = useState<boolean>(() => {
    if (typeof window === 'undefined') {
      return true;
    }
    try {
      const storedValue = window.localStorage.getItem(STORAGE_KEY);
      if (storedValue === null) {
        return true;
      }
      return storedValue === 'true';
    } catch {
      return true;
    }
  });
  const [autoEnabledReason, setAutoEnabledReason] = useState<string | null>(null);

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
    setAutoEnabledReason(null);
    setIsLightMode((prev) => !prev);
  };

  // Automatically enable lite mode when system signals low resources or user preference
  useEffect(() => {
    if (typeof window === 'undefined' || isLightMode) {
      return;
    }

    try {
      const connection = (navigator as any).connection;
      const saveData = Boolean(connection?.saveData);
      const slowNetwork = connection?.effectiveType && ['slow-2g', '2g'].includes(connection.effectiveType);
      const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const lowMemory = typeof (navigator as any).deviceMemory === 'number' && (navigator as any).deviceMemory < 4;

      if (saveData || slowNetwork || prefersReducedMotion || lowMemory) {
        setIsLightMode(true);
        setAutoEnabledReason('Enabled Ultra Performance Mode automatically to respect system battery/efficiency settings.');
        return;
      }
    } catch {
      /* ignore capability detection errors */
    }
  }, [isLightMode]);

  // Watch for battery drain signals and auto-enable lite mode
  useEffect(() => {
    if (typeof navigator === 'undefined' || isLightMode || !(navigator as any).getBattery) {
      return;
    }

    let cancelled = false;
    let batteryRef: any;

    const handleBatteryStatus = (battery: any) => {
      if (cancelled || isLightMode) return;

      const lowBattery = battery.level <= 0.25 && !battery.charging;
      if (lowBattery) {
        setIsLightMode(true);
        setAutoEnabledReason('Battery is low while running full mode. Switched to Ultra Performance Mode to conserve power.');
      }
    };

    (navigator as any).getBattery().then((battery: any) => {
      if (cancelled || !battery) return;
      batteryRef = battery;
      handleBatteryStatus(battery);

      const onLevelChange = () => handleBatteryStatus(battery);
      const onChargingChange = () => handleBatteryStatus(battery);

      battery.addEventListener('levelchange', onLevelChange);
      battery.addEventListener('chargingchange', onChargingChange);

      batteryRef.cleanup = () => {
        battery.removeEventListener('levelchange', onLevelChange);
        battery.removeEventListener('chargingchange', onChargingChange);
      };
    }).catch(() => {
      /* ignore unsupported battery API */
    });

    return () => {
      cancelled = true;
      batteryRef?.cleanup?.();
    };
  }, [isLightMode]);

  // Monitor frame rate; if it tanks for an extended period, protect the device by switching to lite mode
  useEffect(() => {
    if (typeof window === 'undefined' || isLightMode) {
      return;
    }

    let rafId: number | null = null;
    const fpsSamples: number[] = [];
    let lastTimestamp = performance.now();
    let cancelled = false;

    const sample = (timestamp: number) => {
      if (cancelled) return;
      const delta = timestamp - lastTimestamp;
      lastTimestamp = timestamp;

      if (delta > 0) {
        const fps = 1000 / delta;
        if (Number.isFinite(fps)) {
          fpsSamples.push(fps);
          if (fpsSamples.length > 120) {
            fpsSamples.shift();
          }

          const averageFps = fpsSamples.reduce((sum, value) => sum + value, 0) / fpsSamples.length;
          if (averageFps < 45 && fpsSamples.length > 30) {
            setIsLightMode(true);
            setAutoEnabledReason('Detected sustained frame drops in full mode. Auto-enabled Ultra Performance Mode to stop lag.');
            return;
          }
        }
      }

      rafId = window.requestAnimationFrame(sample);
    };

    rafId = window.requestAnimationFrame(sample);

    return () => {
      cancelled = true;
      if (rafId) {
        window.cancelAnimationFrame(rafId);
      }
    };
  }, [isLightMode]);

  const clearAutoEnabledReason = () => setAutoEnabledReason(null);

  return (
    <LightModeContext.Provider value={{ isLightMode, toggleLightMode, autoEnabledReason, clearAutoEnabledReason }}>
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
