import React, { useState, useEffect } from 'react';
import { ShopItem, Profile, ToastMessage } from '../types';
import * as GameService from '../services/gameService';
import { audioService } from '../services/audioService';
import BackButton from './BackButton';
import { ShieldIcon, CrackerIcon, BoosterIcon, CoinIcon, CosmeticIcon } from './icons';

type ShopStage = 'loading' | 'idle' | 'purchasing';

interface ShopViewProps {
  profile: Profile;
  onComplete: () => void;
  onPurchase: (deltas: { coins: number }) => void;
  addToast: (message: string, type: ToastMessage['type']) => void;
  onNavigateToInventory?: () => void;
}

const getItemIcon = (kind: ShopItem['kind']) => {
    const style = { width: '100%', height: '100%'};
    switch (kind) {
        case 'shield': return <div style={{...style, color: 'var(--ion-blue)'}}><ShieldIcon /></div>;
        case 'cracker': return <div style={{...style, color: 'var(--danger-red)'}}><CrackerIcon /></div>;
        case 'booster':
        case 'major_booster': return <div style={{...style, color: 'var(--amber-warn)'}}><BoosterIcon /></div>;
        case 'cosmetic': return <div style={{...style, color: 'var(--grid-purple)'}}><CosmeticIcon /></div>;
        default: return null;
    }
};

const ItemCard: React.FC<{ item: ShopItem, onBuy: (item: ShopItem) => void }> = ({ item, onBuy }) => {
    const canAfford = true; // Placeholder, real check would be here or in parent
    const limitReached = item.owned_today >= item.daily_limit;

    const typeStyles: Record<ShopItem['kind'], { glow: string, border: string }> = {
        shield: { glow: 'glow-ion', border: 'rgba(0, 208, 232, 0.2)' },
        firewall: { glow: 'glow-ion', border: 'rgba(0, 208, 232, 0.3)' },
        encryption_key: { glow: 'glow-plasma', border: 'rgba(255, 45, 145, 0.2)' },
        exploit_kit: { glow: 'glow-plasma', border: 'rgba(255, 45, 145, 0.3)' },
        cracker: { glow: 'glow-plasma', border: 'rgba(255, 45, 145, 0.2)' },
        booster: { glow: 'glow-warn', border: 'rgba(255, 176, 32, 0.2)' },
        major_booster: { glow: 'glow-warn', border: 'rgba(255, 176, 32, 0.2)' },
        cosmetic: { glow: 'glow-purple', border: 'rgba(158, 93, 255, 0.2)' },
        mystery: { glow: 'glow-success', border: 'rgba(22, 226, 161, 0.2)' },
    };
    const currentStyle = typeStyles[item.kind] || typeStyles.mystery;

    return (
        <div className={`card-glass p-4 flex flex-col text-center relative ${currentStyle.glow}`} style={{borderColor: currentStyle.border}}>
            <div className="w-16 h-16 mx-auto my-2 p-2 bg-black/30 rounded-full">{getItemIcon(item.kind)}</div>
            <h3 className="font-heading text-lg text-white">{item.name}</h3>
            <p className="text-sm text-gray-400 flex-grow mt-1">{item.description}</p>
            <p className="text-xs text-gray-500 mt-2">{item.effect_summary}</p>
            
            <div className="my-4">
                <div className="inline-flex items-center justify-center bg-black/30 px-4 py-2 rounded-full">
                    <span className="font-heading text-2xl text-amber-300">{item.price}</span>
                    <div className="w-6 h-6 ml-2 text-amber-400"><CoinIcon /></div>
                </div>
            </div>

            <button 
                onClick={() => onBuy(item)}
                disabled={!canAfford || limitReached}
                className={`w-full font-heading font-bold py-2.5 rounded-xl transition-all duration-200 border ${
                    limitReached 
                        ? 'bg-gray-700/50 border-gray-600 text-gray-500 cursor-not-allowed'
                        : 'bg-green-500/20 hover:bg-green-500/30 border-green-400 text-white'
                }`}
            >
                {limitReached ? `Limit Reached (${item.owned_today}/${item.daily_limit})` : 'Buy'}
            </button>
        </div>
    );
};

const PurchaseModal: React.FC<{
    item: ShopItem;
    profile: Profile;
    onConfirm: (item: ShopItem, quantity: number) => Promise<void>;
    onCancel: () => void;
}> = ({ item, profile, onConfirm, onCancel }) => {
    const [quantity, setQuantity] = useState(1);
    const [isProcessing, setIsProcessing] = useState(false);
    
    const maxCanBuy = item.daily_limit - item.owned_today;
    const maxCanAfford = Math.floor(profile.coins / item.price);
    const maxQuantity = Math.min(maxCanBuy, maxCanAfford, 10); // Arbitrary max 10 per purchase
    
    const totalCost = item.price * quantity;

    const handleConfirm = async () => {
        setIsProcessing(true);
        await onConfirm(item, quantity);
        setIsProcessing(false);
    };

    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="card-glass w-full max-w-md m-4 p-6 border-2" style={{borderColor: 'var(--success-teal)'}}>
                <h2 className="font-heading text-2xl text-center mb-2" style={{color: 'var(--success-teal)'}}>Authorize Purchase</h2>
                <p className="font-mono text-center text-gray-400 mb-6">&gt; Confirm transaction details for: <span className="text-white">{item.name}</span></p>

                <div className="bg-black/30 p-4 rounded-xl space-y-4">
                    <div className="flex justify-between items-center">
                        <span className="text-gray-300">Quantity:</span>
                        <div className="flex items-center space-x-3">
                            <button onClick={() => setQuantity(q => Math.max(1, q - 1))} className="w-8 h-8 rounded-md bg-gray-700 hover:bg-gray-600">-</button>
                            <span className="text-xl font-mono w-10 text-center">{quantity}</span>
                            <button onClick={() => setQuantity(q => Math.min(maxQuantity, q + 1))} className="w-8 h-8 rounded-md bg-gray-700 hover:bg-gray-600">+</button>
                        </div>
                    </div>
                    <div className="flex justify-between items-center">
                        <span className="text-gray-300">Total Cost:</span>
                        <div className="flex items-center space-x-2">
                           <span className={`text-xl font-mono ${totalCost > profile.coins ? 'text-red-500' : 'text-amber-300'}`}>{totalCost.toLocaleString()}</span>
                           <div className="w-5 h-5 text-amber-400"><CoinIcon/></div>
                        </div>
                    </div>
                </div>

                <div className="flex space-x-4 mt-8">
                    <button onClick={onCancel} disabled={isProcessing} className="w-full font-heading py-3 rounded-xl bg-gray-600/50 hover:bg-gray-500/50 border border-gray-500">Cancel</button>
                    <button 
                        onClick={handleConfirm} 
                        disabled={isProcessing || totalCost > profile.coins || quantity === 0}
                        className="w-full font-heading py-3 rounded-xl bg-green-500/20 hover:bg-green-500/30 border border-green-400 text-white disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {isProcessing ? 'Processing...' : 'Confirm'}
                    </button>
                </div>
            </div>
        </div>
    );
};

const ShopView: React.FC<ShopViewProps> = ({ profile, onComplete, onPurchase, addToast, onNavigateToInventory }) => {
  const [stage, setStage] = useState<ShopStage>('loading');
  const [items, setItems] = useState<ShopItem[]>([]);
  const [selectedItem, setSelectedItem] = useState<ShopItem | null>(null);

  useEffect(() => {
    GameService.shop_list().then(data => {
      setItems(data);
      setStage('idle');
    });
  }, []);

  const handleBuy = async (item: ShopItem, quantity: number) => {
    try {
        const receipt = await GameService.shop_buy(item.id, quantity, profile.coins);
        audioService.play('buy');
        onPurchase({ coins: -receipt.coins_spent });
        addToast(`Purchased ${quantity}x ${item.name}!`, 'success');
        setSelectedItem(null);
        // Refetch shop list to update owned_today counts
        setStage('loading');
        GameService.shop_list().then(data => {
            setItems(data);
            setStage('idle');
        });
    } catch (error: any) {
        console.error("Purchase failed:", error);
        addToast(error.message || 'Purchase failed', 'error');
    }
  };


  if (stage === 'loading') {
     return <div className="font-heading text-2xl animate-pulse text-center mt-20" style={{color: 'var(--success-teal)'}}>Accessing Secure Market...</div>;
  }

  return (
    <div className="mt-6">
      <div className="flex justify-between items-center mb-4">
        <BackButton onClick={onComplete} />
        {onNavigateToInventory && (
          <button 
            onClick={onNavigateToInventory}
            className="px-4 py-2 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg font-heading hover:from-blue-500 hover:to-purple-500 transition-all"
          >
            View Inventory →
          </button>
        )}
      </div>
      <h2 className="font-heading text-3xl text-center mb-8" style={{ color: 'var(--success-teal)' }}>Item Shop</h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-5xl mx-auto">
        {items.map(item => (
          <ItemCard key={item.id} item={item} onBuy={setSelectedItem} />
        ))}
      </div>

        {selectedItem && (
            <PurchaseModal 
                item={selectedItem}
                profile={profile}
                onConfirm={handleBuy}
                onCancel={() => setSelectedItem(null)}
            />
        )}
    </div>
  );
};

export default ShopView;