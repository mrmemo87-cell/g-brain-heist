import React, { useState, useEffect } from 'react';
import { InventoryItem, ToastMessage } from '../types';
import * as GameService from '../services/gameService';
import { audioService } from '../services/audioService';
import BackButton from './BackButton';
import { ShieldIcon, CrackerIcon, BoosterIcon, InventoryIcon } from './icons';

interface InventoryViewProps {
  onComplete: () => void;
  addToast: (message: string, type: ToastMessage['type']) => void;
  onNavigateToShop?: () => void;
}

const getItemIcon = (kind: InventoryItem['kind']) => {
    const style = { width: '100%', height: '100%'};
    switch (kind) {
        case 'shield': return <div style={{...style, color: 'var(--ion-blue)'}}><ShieldIcon /></div>;
        case 'cracker': return <div style={{...style, color: 'var(--danger-red)'}}><CrackerIcon /></div>;
        case 'booster':
        case 'major_booster': return <div style={{...style, color: 'var(--amber-warn)'}}><BoosterIcon /></div>;
        default: return <div style={{...style, color: 'var(--mist-400)'}}><InventoryIcon /></div>;
    }
};

const ItemCard: React.FC<{ item: InventoryItem & any, onActivate: (inv_id: string) => void, isActivating: boolean, quantity: number }> = ({ item, onActivate, isActivating, quantity }) => {
    const isUsable = item.state === 'unused' && (
        item.kind === 'booster' || 
        item.kind === 'major_booster' || 
        item.kind === 'shield' ||
        item.kind === 'encryption_key' ||
        item.kind === 'exploit_kit' ||
        item.kind === 'firewall'
    );

  const statePillClasses: Record<InventoryItem['state'], string> = {
    active: 'bg-green-500/30 text-green-300 border-green-500/50',
    unused: 'bg-gray-500/30 text-gray-300 border-gray-500/50',
    consumed: 'bg-red-500/30 text-red-300 border-red-500/50',
    used: 'bg-red-500/30 text-red-300 border-red-500/50',
    expired: 'bg-red-500/30 text-red-300 border-red-500/50',
  };

  const invId = (item.inv_id || item.id);
  return (
        <div className={`card-glass p-4 flex flex-col text-center relative glow-purple`} style={{borderColor: 'rgba(158, 93, 255, 0.2)'}}>
            <div className={`absolute top-2 right-2 px-2 py-1 text-xs font-mono rounded-full border ${statePillClasses[item.state]} capitalize`}>
                {item.state}
            </div>
            {quantity > 1 && (
                <div className="absolute top-2 left-2 px-2 py-1 text-xs font-mono rounded-full border bg-purple-500/30 text-purple-200 border-purple-400">
                    x{quantity}
                </div>
            )}
            <div className="w-16 h-16 mx-auto my-2 p-2 bg-black/30 rounded-full">{getItemIcon(item.kind)}</div>
            <h3 className="font-heading text-lg text-white">{item.name}</h3>
            <p className="text-sm text-gray-400 flex-grow mt-1">{item.description}</p>
            <p className="text-xs text-gray-500 mt-2">{item.effect_summary}</p>
            
            <div className="mt-4 h-12 flex items-center justify-center">
         {isUsable ? (
           <button 
            onClick={() => onActivate(invId)}
            disabled={isActivating}
            className="w-full font-heading font-bold py-2.5 rounded-xl transition-all duration-200 border bg-purple-500/20 hover:bg-purple-500/30 border-purple-400 text-white disabled:opacity-50"
          >
            {isActivating ? 'Activating...' : 'Activate'}
          </button>
         ) : (
                     <p className="text-xs text-gray-500 italic">
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
                    </p>
                 )}
            </div>
        </div>
    );
};


const InventoryView: React.FC<InventoryViewProps> = ({ onComplete, addToast, onNavigateToShop }) => {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [activatingId, setActivatingId] = useState<string | null>(null);

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
      } catch (error: any) {
          addToast(error.message || "Failed to activate item.", "error");
      } finally {
          setActivatingId(null);
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
     return <div className="font-heading text-2xl animate-pulse text-center mt-20" style={{color: 'var(--grid-purple)'}}>Accessing Inventory...</div>;
  }

  return (
    <div className="mt-6">
      <div className="flex justify-between items-center mb-4">
        <BackButton onClick={onComplete} />
        {onNavigateToShop && (
          <button 
            onClick={onNavigateToShop}
            className="px-4 py-2 bg-gradient-to-r from-green-600 to-teal-600 text-white rounded-lg font-heading hover:from-green-500 hover:to-teal-500 transition-all"
          >
            ← Go to Shop
          </button>
        )}
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