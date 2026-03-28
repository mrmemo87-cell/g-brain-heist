import React, { useState, useEffect } from 'react';
import { InventoryItem, Profile, ToastMessage } from '../types';
import * as GameService from '../services/gameService';
import { audioService } from '../services/audioService';
import BackButton from './BackButton';
import {
  BoosterIcon,
  EncryptionKeyIcon,
  ExploitIcon,
  InventoryIcon,
  MysteryIcon,
  ShieldIcon,
  CrackerIcon,
  CosmeticIcon,
} from './icons';

interface InventoryViewProps {
  onComplete: () => void;
  addToast: (message: string, type: ToastMessage['type']) => void;
  onNavigateToShop?: () => void;
  onProfileUpdate?: (profile: Profile) => void;
}

const INVENTORY_ITEM_ART_BY_ID: Partial<Record<string, string>> = {
  item_quantum_cloak: '/visuals/shop-items/Quantum-Cloak.png',
};

const INVENTORY_ITEM_ART_BY_KIND: Partial<Record<InventoryItem['kind'], string>> = {
  shield: '/visuals/shop-items/Shield.png',
  firewall: '/visuals/shop-items/Firewall.png',
  encryption_key: '/visuals/shop-items/Encryption-Key.png',
  exploit_kit: '/visuals/shop-items/Exploit-Kit.png',
  booster: '/visuals/shop-items/Booster.png',
  major_booster: '/visuals/shop-items/Major-Booster.png',
};

const getItemIcon = (item: InventoryItem) => {
  const style = { width: '100%', height: '100%' };
  const imageSrc = INVENTORY_ITEM_ART_BY_ID[item.item_id] || INVENTORY_ITEM_ART_BY_KIND[item.kind];
  if (imageSrc) {
    return <img src={imageSrc} alt={item.name} className="h-full w-full object-contain" loading="lazy" />;
  }

  switch (item.kind) {
    case 'shield':
    case 'firewall':
      return <div style={{ ...style, color: 'var(--ion-blue)' }}><ShieldIcon /></div>;
    case 'encryption_key':
      return <div style={{ ...style, color: 'var(--success-teal)' }}><EncryptionKeyIcon /></div>;
    case 'exploit_kit':
      return <div style={{ ...style, color: 'var(--danger-red)' }}><ExploitIcon /></div>;
    case 'cracker':
      return <div style={{ ...style, color: 'var(--danger-red)' }}><CrackerIcon /></div>;
    case 'booster':
    case 'major_booster':
      return <div style={{ ...style, color: 'var(--amber-warn)' }}><BoosterIcon /></div>;
    case 'cosmetic':
      return <div style={{ ...style, color: 'var(--grid-purple)' }}><CosmeticIcon /></div>;
    case 'mystery':
      return <div style={{ ...style, color: 'var(--mist-400)' }}><MysteryIcon /></div>;
    default:
      return <div style={{ ...style, color: 'var(--mist-400)' }}><InventoryIcon /></div>;
  }
};

const ItemCard: React.FC<{ item: InventoryItem & any, onActivate: (inv_id: string) => void, isActivating: boolean, quantity: number, onDeactivateNeon?: () => void, isDeactivatingNeon?: boolean, onDeactivateFlicker?: () => void, isDeactivatingFlicker?: boolean, onDeactivateGlitch?: () => void, isDeactivatingGlitch?: boolean }> = ({ item, onActivate, isActivating, quantity, onDeactivateNeon, isDeactivatingNeon, onDeactivateFlicker, isDeactivatingFlicker, onDeactivateGlitch, isDeactivatingGlitch }) => {
    const isUsable = item.state === 'unused' && (
        item.kind === 'booster' ||
        item.kind === 'major_booster' ||
        item.kind === 'shield' ||
        item.kind === 'encryption_key' ||
        item.kind === 'exploit_kit' ||
        item.kind === 'firewall' ||
        item.kind === 'cosmetic'
    );

  const isNeonFrame = item.kind === 'cosmetic' && item.item_id === 'item_cosmetic_frame';
  const isActiveNeonFrame = isNeonFrame && item.state === 'active';

  const statePillClasses: Record<InventoryItem['state'], string> = {
    active: 'bg-green-500/30 text-green-300 border-green-500/50',
    unused: 'bg-gray-500/30 text-gray-300 border-gray-500/50',
    consumed: 'bg-red-500/30 text-red-300 border-red-500/50',
    used: 'bg-red-500/30 text-red-300 border-red-500/50',
    expired: 'bg-red-500/30 text-red-300 border-red-500/50',
  };

  const invId = (item.inv_id || item.id);
  return (
    <div
      className={`card-glass relative flex flex-col gap-3 p-4 sm:p-5 text-left glow-purple`}
      style={{ borderColor: 'rgba(158, 93, 255, 0.2)' }}
    >
      <div className="flex items-start justify-between gap-2">
        <div
          className={`px-3 py-1 text-xs font-mono rounded-full border ${statePillClasses[item.state]} capitalize`}
        >
          {item.state}
        </div>
        {quantity > 1 && (
          <div className="px-3 py-1 text-xs font-mono rounded-full border bg-purple-500/30 text-purple-200 border-purple-400">
            x{quantity}
          </div>
        )}
      </div>

      <div className="flex items-center gap-3">
        <div className="w-14 h-14 sm:w-16 sm:h-16 flex items-center justify-center rounded-xl bg-black/30 border border-white/5">
            {getItemIcon(item)}
          </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-heading text-lg text-white truncate">{item.name}</h3>
          <p className="text-sm text-gray-400 line-clamp-2">{item.description}</p>
        </div>
      </div>

      <p className="text-xs text-gray-500 leading-relaxed bg-black/20 border border-white/5 rounded-lg p-2">
        {item.effect_summary}
      </p>

      <div className="flex flex-col gap-3">
        {isUsable ? (
          <button
            onClick={() => onActivate(invId)}
            disabled={isActivating}
            className="w-full font-heading font-bold py-2.5 rounded-xl transition-all duration-200 border bg-purple-500/20 hover:bg-purple-500/30 border-purple-400 text-white disabled:opacity-50"
          >
            {isActivating ? 'Activating...' : 'Activate'}
          </button>
        ) : (
          <div className="text-xs text-gray-400 bg-black/10 border border-white/5 rounded-lg p-2 leading-relaxed">
            {(() => {
              if (item.state === 'active') {
                if (item.kind === 'shield') {
                  return 'Active until cracked';
                }

                if (!item.expires_at) {
                  return 'Active permanently';
                }

                return `Active until ${new Date(item.expires_at).toLocaleTimeString()}`;
              }

              if (item.kind === 'cracker') {
                return 'Used automatically in PvP';
              }

              if (item.kind === 'encryption_key' || item.kind === 'exploit_kit' || item.kind === 'firewall') {
                return 'Activate to apply bonus to your stats';
              }

              return 'Cannot be activated';
            })()}
          </div>
        )}

        {isActiveNeonFrame && onDeactivateNeon && (
          <div className="rounded-2xl border border-amber-500/60 bg-amber-500/10 p-3 text-left text-xs text-amber-100">
            <p className="font-semibold text-amber-200 mb-1">Deactivate Neon Frame</p>
            <p className="text-[11px] leading-relaxed text-amber-100/80">
              This permanently removes the neon glow. You will need a new neon frame drop to turn it back on.
            </p>
            <button
              onClick={onDeactivateNeon}
              disabled={isDeactivatingNeon}
              className="mt-3 w-full rounded-xl border border-amber-400/70 bg-transparent px-3 py-2 font-heading text-[13px] font-semibold text-amber-200 transition enabled:hover:bg-amber-500/20 disabled:opacity-50"
            >
              {isDeactivatingNeon ? 'Removing…' : 'Deactivate Forever'}
            </button>
          </div>
        )}

        {item.kind === 'cosmetic' && item.item_id === 'item_cosmetic_theme' && item.state === 'active' && onDeactivateFlicker && (
          <div className="rounded-2xl border border-cyan-500/60 bg-cyan-500/10 p-3 text-left text-xs text-cyan-100">
            <p className="font-semibold text-cyan-200 mb-1">Deactivate Flicker Theme</p>
            <p className="text-[11px] leading-relaxed text-cyan-100/80">
              This permanently removes the flicker effect. You will need a new flicker theme drop to turn it back on.
            </p>
            <button
              onClick={onDeactivateFlicker}
              disabled={isDeactivatingFlicker}
              className="mt-3 w-full rounded-xl border border-cyan-400/70 bg-transparent px-3 py-2 font-heading text-[13px] font-semibold text-cyan-200 transition enabled:hover:bg-cyan-500/20 disabled:opacity-50"
            >
              {isDeactivatingFlicker ? 'Removing…' : 'Deactivate Forever'}
            </button>
          </div>
        )}

        {item.kind === 'cosmetic' && item.item_id === 'item_cosmetic_glitch' && item.state === 'active' && onDeactivateGlitch && (
          <div className="rounded-2xl border border-green-500/60 bg-green-500/10 p-3 text-left text-xs text-green-100">
            <p className="font-semibold text-green-200 mb-1">Deactivate Glitch Effect</p>
            <p className="text-[11px] leading-relaxed text-green-100/80">
              This permanently removes the digital glitch effect. You will need a new glitch effect purchase to turn it back on.
            </p>
            <button
              onClick={onDeactivateGlitch}
              disabled={isDeactivatingGlitch}
              className="mt-3 w-full rounded-xl border border-green-400/70 bg-transparent px-3 py-2 font-heading text-[13px] font-semibold text-green-200 transition enabled:hover:bg-green-500/20 disabled:opacity-50"
            >
              {isDeactivatingGlitch ? 'Removing…' : 'Deactivate Forever'}
            </button>
          </div>
        )}
            </div>
        </div>
    );
};


const InventoryView: React.FC<InventoryViewProps> = ({ onComplete, addToast, onNavigateToShop, onProfileUpdate }) => {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [activatingId, setActivatingId] = useState<string | null>(null);
  const [neonDeactivating, setNeonDeactivating] = useState(false);
  const [flickerDeactivating, setFlickerDeactivating] = useState(false);
  const [glitchDeactivating, setGlitchDeactivating] = useState(false);

  const fetchInventory = async () => {
    // No need to setLoading(true) here as it's called from initial load or after an action
    try {
        const data = await GameService.inventory_list();
        setItems(data);
    } catch {
        addToast("Failed to load inventory.", "error");
    } finally {
        setLoading(false);
    }
  };

  useEffect(() => {
    fetchInventory();
  }, []);
  
  const handleActivate = async (inv_id: string) => {
      setActivatingId(inv_id);
      try {
          await GameService.inventory_activate(inv_id);
          audioService.play('activate');
          addToast("Item activated!", "success");
          fetchInventory(); // Refetch to show new state

          try {
            const refreshedProfile = await GameService.whoami();
            onProfileUpdate?.(refreshedProfile);
          } catch (profileError) {
            console.warn('Failed to refresh profile after activation:', profileError);
          }
      } catch (error: any) {
          addToast(error.message || "Failed to activate item.", "error");
      } finally {
          setActivatingId(null);
      }
  };

  const handleDeactivateNeon = async () => {
    if (neonDeactivating) {
      return;
    }

    const confirmed = window.confirm('This permanently removes the neon frame glow. You will need another neon drop to reactivate it. Continue?');
    if (!confirmed) {
      return;
    }

    setNeonDeactivating(true);
    try {
      await GameService.deactivate_neon_frame();
      addToast('Neon frame permanently disabled.', 'warning');
      setLoading(true);
      await fetchInventory();

      try {
        const refreshedProfile = await GameService.whoami();
        onProfileUpdate?.(refreshedProfile);
      } catch (profileError) {
        console.warn('Failed to refresh profile after neon deactivation:', profileError);
      }
    } catch (error: any) {
      addToast(error.message || 'Failed to deactivate neon frame.', 'error');
    } finally {
      setNeonDeactivating(false);
    }
  };

  const handleDeactivateFlicker = async () => {
    if (flickerDeactivating) {
      return;
    }

    const confirmed = window.confirm('This permanently removes the flicker theme effect. You will need another flicker drop to reactivate it. Continue?');
    if (!confirmed) {
      return;
    }

    setFlickerDeactivating(true);
    try {
      await GameService.deactivate_flicker_theme();
      addToast('Flicker theme permanently disabled.', 'warning');
      setLoading(true);
      await fetchInventory();

      try {
        const refreshedProfile = await GameService.whoami();
        onProfileUpdate?.(refreshedProfile);
      } catch (profileError) {
        console.warn('Failed to refresh profile after flicker deactivation:', profileError);
      }
    } catch (error: any) {
      addToast(error.message || 'Failed to deactivate flicker theme.', 'error');
    } finally {
      setFlickerDeactivating(false);
    }
  };

  const handleDeactivateGlitch = async () => {
    if (glitchDeactivating) {
      return;
    }

    const confirmed = window.confirm('This permanently removes the glitch effect. You will need to purchase another glitch effect to reactivate it. Continue?');
    if (!confirmed) {
      return;
    }

    setGlitchDeactivating(true);
    try {
      await GameService.deactivate_glitch_effect();
      addToast('Glitch effect permanently disabled.', 'warning');
      setLoading(true);
      await fetchInventory();

      try {
        const refreshedProfile = await GameService.whoami();
        onProfileUpdate?.(refreshedProfile);
      } catch (profileError) {
        console.warn('Failed to refresh profile after glitch deactivation:', profileError);
      }
    } catch (error: any) {
      addToast(error.message || 'Failed to deactivate glitch effect.', 'error');
    } finally {
      setGlitchDeactivating(false);
    }
  };
  
  // Group items by item_id and state to show quantities
  const groupedItems = items.reduce((acc, item) => {
    const key = `${item.item_id}_${item.state}`;
    if (!acc[key]) {
      acc[key] = { item, count: 0 };
    }
    acc[key].count++;
    return acc;
  }, {} as Record<string, { item: InventoryItem; count: number }>);
  
  const displayItems = Object.values(groupedItems);
  const sectionDefinitions = [
    {
      id: 'active',
      label: 'Active Buffs',
      description: 'Currently applied boosts keeping you ahead of raids.',
      states: ['active'] as InventoryItem['state'][],
    },
    {
      id: 'ready',
      label: 'Ready to Activate',
      description: 'Prepare these items to launch on demand.',
      states: ['unused'],
    },
    {
      id: 'consumed',
      label: 'Consumed & Expired',
      description: 'Items that have already been used or expired.',
      states: ['used', 'consumed', 'expired'],
    },
  ];
  const handledStates = new Set<string>();
  const sectionGroups = sectionDefinitions
    .map(section => {
      const itemsInSection = displayItems.filter(({ item }) => {
        const matches = section.states.includes(item.state);
        if (matches) {
          handledStates.add(item.state);
        }
        return matches;
      });
      return { ...section, items: itemsInSection };
    })
    .filter(section => section.items.length > 0);

  const uncategorized = displayItems.filter(({ item }) => !handledStates.has(item.state));
  if (uncategorized.length > 0) {
    sectionGroups.push({
      id: 'misc',
      label: 'Other Inventory',
      description: 'Fallback stash for unexpected states.',
      states: [],
      items: uncategorized,
    });
  }


  if (loading) {
     return <div className="flex justify-center mt-20"><img src="/BRAINS.svg" alt="Loading..." className="w-32 h-32 animate-pulse" style={{ filter: 'drop-shadow(0 0 30px rgba(0, 212, 255, 0.6))' }} /></div>;
  }

  return (
    <div className="mt-6">
      <div className="sticky top-4 z-40 mb-6">
        <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-slate-950/70 p-2 backdrop-blur sm:flex-row sm:items-center sm:justify-between">
          <BackButton onClick={onComplete} containerClassName="mb-0" />
          {onNavigateToShop && (
            <button 
              onClick={onNavigateToShop}
              className="w-full px-4 py-2 bg-gradient-to-r from-green-600 to-teal-600 text-white rounded-lg font-heading hover:from-green-500 hover:to-teal-500 transition-all sm:w-auto"
            >
              ← Go to Shop
            </button>
          )}
        </div>
      </div>
      <h2 className="font-heading text-3xl text-center mb-8" style={{ color: 'var(--grid-purple)' }}>Inventory</h2>
      {sectionGroups.length > 0 ? (
        <div className="space-y-6">
          {sectionGroups.map(section => (
            <section key={section.id} className="bg-black/40 border border-white/5 rounded-3xl p-6 space-y-4">
              <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
                <div>
                  <h3 className="font-heading text-2xl text-white">{section.label}</h3>
                  <p className="text-sm text-gray-400">{section.description}</p>
                </div>
                <span className="text-xs uppercase tracking-widest text-gray-400">{section.items.length} Slot{section.items.length === 1 ? '' : 's'}</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {section.items.map(({ item, count }) => {
                  const invId = (item.inv_id || item.id);
                  return (
                    <ItemCard
                      key={`${item.item_id}_${item.state}_${invId}`}
                      item={item}
                      quantity={count}
                      onActivate={handleActivate}
                      isActivating={activatingId === invId}
                      onDeactivateNeon={item.kind === 'cosmetic' && item.item_id === 'item_cosmetic_frame' && item.state === 'active' ? handleDeactivateNeon : undefined}
                      isDeactivatingNeon={neonDeactivating}
                      onDeactivateFlicker={item.kind === 'cosmetic' && item.item_id === 'item_cosmetic_theme' && item.state === 'active' ? handleDeactivateFlicker : undefined}
                      isDeactivatingFlicker={flickerDeactivating}
                      onDeactivateGlitch={item.kind === 'cosmetic' && item.item_id === 'item_cosmetic_glitch' && item.state === 'active' ? handleDeactivateGlitch : undefined}
                      isDeactivatingGlitch={glitchDeactivating}
                    />
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="text-center text-gray-400 card-glass p-8 max-w-md mx-auto">
          <div className="w-16 h-16 mx-auto mb-4 text-gray-600">
            <ShieldIcon />
          </div>
          <p>Your inventory is empty.</p>
          <p className="text-sm">Visit the shop to purchase items.</p>
        </div>
      )}
    </div>
  );
};

export default InventoryView;
