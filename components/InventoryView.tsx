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

const ItemCard: React.FC<{ item: InventoryItem, onActivate: (inv_id: string) => void, isActivating: boolean }> = ({ item, onActivate, isActivating }) => {
    const isUsable = item.state === 'unused' && (item.kind === 'booster' || item.kind === 'major_booster' || item.kind === 'shield');

    const statePillClasses = {
        active: 'bg-green-500/30 text-green-300 border-green-500/50',
        unused: 'bg-gray-500/30 text-gray-300 border-gray-500/50',
        consumed: 'bg-red-500/30 text-red-300 border-red-500/50',
        expired: 'bg-red-500/30 text-red-300 border-red-500/50',
    };

    return (
        <div className={`card-glass p-4 flex flex-col text-center relative glow-purple`} style={{borderColor: 'rgba(158, 93, 255, 0.2)'}}>
            <div className={`absolute top-2 right-2 px-2 py-1 text-xs font-mono rounded-full border ${statePillClasses[item.state]} capitalize`}>
                {item.state}
            </div>
            <div className="w-16 h-16 mx-auto my-2 p-2 bg-black/30 rounded-full">{getItemIcon(item.kind)}</div>
            <h3 className="font-heading text-lg text-white">{item.name}</h3>
            <p className="text-sm text-gray-400 flex-grow mt-1">{item.description}</p>
            <p className="text-xs text-gray-500 mt-2">{item.effect_summary}</p>
            
            <div className="mt-4 h-12 flex items-center justify-center">
                 {isUsable ? (
                     <button 
                        onClick={() => onActivate(item.inv_id)}
                        disabled={isActivating}
                        className="w-full font-heading font-bold py-2.5 rounded-xl transition-all duration-200 border bg-purple-500/20 hover:bg-purple-500/30 border-purple-400 text-white disabled:opacity-50"
                    >
                        {isActivating ? 'Activating...' : 'Activate'}
                    </button>
                 ) : (
                     <p className="text-xs text-gray-500 italic">
                        {item.state === 'active' && item.expires_at 
                            ? `Active until ${item.expires_at === 'Until Cracked' ? 'broken' : new Date(item.expires_at).toLocaleTimeString()}` 
                            : item.kind === 'cracker' || item.kind === 'firewall'
                            ? 'Used automatically in PvP'
                            : 'Cannot be activated'}
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
      {items.length > 0 ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-5xl mx-auto">
            {items.map(item => (
            <ItemCard key={item.inv_id} item={item} onActivate={handleActivate} isActivating={activatingId === item.inv_id} />
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