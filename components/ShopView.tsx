import React, { useState, useEffect } from 'react';
import { ShopItem, Profile, ToastMessage } from '../types';
import * as GameService from '../services/gameService';
import { audioService } from '../services/audioService';
import BackButton from './BackButton';
import { ShieldIcon, CrackerIcon, BoosterIcon, CoinIcon, CosmeticIcon, GemIcon } from './icons';
import ModalPortal from './ModalPortal';

type ShopStage = 'loading' | 'idle' | 'purchasing';

interface ShopViewProps {
  profile: Profile;
  onComplete: () => void;
  onPurchase: (deltas: { coins?: number; gemstones?: number }) => void;
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

const rarityStyles: Record<ShopItem['rarity'], { label: string; border: string; badge: string }> = {
    common: { label: 'Common', border: 'rgba(255, 255, 255, 0.08)', badge: 'bg-gray-700/70 text-gray-200' },
    rare: { label: 'Rare', border: 'rgba(56, 189, 248, 0.4)', badge: 'bg-cyan-600/40 text-cyan-100' },
    legendary: { label: 'Legendary', border: 'rgba(249, 115, 22, 0.55)', badge: 'bg-orange-600/40 text-orange-100' },
};

const ItemCard: React.FC<{
    item: ShopItem;
    onBuy: (item: ShopItem) => void;
    balances: { coins: number; gemstones: number };
}> = ({ item, onBuy, balances }) => {
    const remainingToday = Math.max(0, item.daily_limit - item.owned_today);
    const coinDeficit = Math.max(0, item.price - balances.coins);
    const gemstonePrice = item.gemstone_price || 0;
    const gemstoneDeficit = Math.max(0, gemstonePrice - balances.gemstones);
    const limitReached = item.owned_today >= item.daily_limit;
    const cannotAfford = coinDeficit > 0 || gemstoneDeficit > 0;
    const shortageParts: string[] = [];

    if (coinDeficit > 0) {
        shortageParts.push(`${coinDeficit.toLocaleString()} more coin${coinDeficit === 1 ? '' : 's'}`);
    }
    if (gemstoneDeficit > 0) {
        shortageParts.push(`${gemstoneDeficit.toLocaleString()} more gemstone${gemstoneDeficit === 1 ? '' : 's'}`);
    }

    const shortageMessage = shortageParts.length > 0 ? `Need ${shortageParts.join(' & ')}` : null;
    const buttonDisabled = limitReached || cannotAfford;
    const buttonLabel = limitReached
        ? `Limit Reached (${item.owned_today}/${item.daily_limit})`
        : cannotAfford
            ? 'Insufficient Funds'
            : 'Buy';

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
    const rarity = rarityStyles[item.rarity];

    return (
        <div className={`card-glass p-4 flex flex-col text-center relative ${currentStyle.glow}`} style={{ borderColor: rarity?.border || currentStyle.border }}>
            {rarity && (
                <div className={`absolute top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full text-[11px] font-semibold uppercase tracking-wide ${rarity.badge}`}>
                    {rarity.label}
                </div>
            )}
            <div className="w-16 h-16 mx-auto my-2 p-2 bg-black/30 rounded-full">{getItemIcon(item.kind)}</div>
            <h3 className="font-heading text-lg text-white mt-4">{item.name}</h3>
            <p className="text-sm text-gray-400 flex-grow mt-1">{item.description}</p>
            <p className="text-xs text-gray-500 mt-2">{item.effect_summary}</p>

            <div className="my-4">
                <div className="flex items-center justify-center gap-2">
                    <div className="inline-flex items-center justify-center bg-black/30 px-4 py-2 rounded-full">
                        <span className="font-heading text-2xl text-amber-300">{item.price}</span>
                        <div className="w-6 h-6 ml-2 text-amber-400"><CoinIcon /></div>
                    </div>
                    {item.gemstone_price ? (
                        <div className="inline-flex items-center justify-center bg-black/30 px-4 py-2 rounded-full border border-cyan-500/40">
                            <span className="font-heading text-xl text-cyan-200">{item.gemstone_price}</span>
                            <div className="w-5 h-5 ml-2 text-cyan-300"><GemIcon /></div>
                        </div>
                    ) : null}
                </div>
            </div>

            <button
                onClick={() => onBuy(item)}
                disabled={buttonDisabled}
                className={`w-full font-heading font-bold py-2.5 rounded-xl transition-all duration-200 border ${
                    buttonDisabled
                        ? 'bg-gray-700/50 border-gray-600 text-gray-500 cursor-not-allowed'
                        : 'bg-green-500/20 hover:bg-green-500/30 border-green-400 text-white'
                }`}
            >
                {buttonLabel}
            </button>
            {!limitReached && shortageMessage && (
                <p className="mt-2 text-xs text-red-400 font-mono">{shortageMessage}</p>
            )}
            {limitReached && (
                <p className="mt-2 text-xs text-amber-300 font-mono">Restock after daily reset</p>
            )}
            {!limitReached && remainingToday < item.daily_limit && (
                <p className="mt-2 text-[10px] text-gray-400 font-mono">Remaining today: {remainingToday}</p>
            )}
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
    const coinLimit = item.price > 0 ? Math.floor(profile.coins / item.price) : Infinity;
    const gemstoneLimit = item.gemstone_price ? Math.floor(profile.gemstones / item.gemstone_price) : Infinity;
    const calculatedMax = Math.min(maxCanBuy, coinLimit, gemstoneLimit, 10);
    const maxQuantity = Math.max(0, calculatedMax);
    const minQuantity = maxQuantity === 0 ? 0 : 1;

    useEffect(() => {
        setQuantity(prev => {
            if (maxQuantity === 0) {
                return 0;
            }
            const clamped = Math.min(Math.max(prev || 1, minQuantity), maxQuantity);
            return clamped;
        });
    }, [maxQuantity, minQuantity]);

    const totalCoinCost = item.price * quantity;
    const totalGemCost = (item.gemstone_price || 0) * quantity;
    const insufficientCoins = totalCoinCost > profile.coins;
    const insufficientGemstones = totalGemCost > profile.gemstones;

    const handleConfirm = async () => {
        setIsProcessing(true);
        await onConfirm(item, quantity);
        setIsProcessing(false);
    };

    return (
        <ModalPortal>
            <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50">
                <div className="card-glass w-full max-w-md m-4 p-6 border-2" style={{ borderColor: 'var(--success-teal)' }}>
                    <h2 className="font-heading text-2xl text-center mb-2" style={{ color: 'var(--success-teal)' }}>Authorize Purchase</h2>
                    <p className="font-mono text-center text-gray-400 mb-6">&gt; Confirm transaction details for: <span className="text-white">{item.name}</span></p>

                    <div className="bg-black/30 p-4 rounded-xl space-y-4">
                        <div className="flex justify-between items-center">
                            <span className="text-gray-300">Quantity:</span>
                            <div className="flex items-center space-x-3">
                                <button
                                    onClick={() => setQuantity(q => Math.max(minQuantity, q - 1))}
                                    className="w-8 h-8 rounded-md bg-gray-700 hover:bg-gray-600"
                                    disabled={quantity <= minQuantity}
                                >
                                    -
                                </button>
                                <span className="text-xl font-mono w-10 text-center">{quantity}</span>
                                <button
                                    onClick={() => setQuantity(q => Math.min(maxQuantity, q + 1))}
                                    className="w-8 h-8 rounded-md bg-gray-700 hover:bg-gray-600"
                                    disabled={quantity >= maxQuantity}
                                >
                                    +
                                </button>
                            </div>
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="text-gray-300">Total Coins:</span>
                            <div className="flex items-center space-x-2">
                                <span className={`text-xl font-mono ${insufficientCoins ? 'text-red-500' : 'text-amber-300'}`}>{totalCoinCost.toLocaleString()}</span>
                                <div className="w-5 h-5 text-amber-400"><CoinIcon /></div>
                            </div>
                        </div>
                        {item.gemstone_price ? (
                            <div className="flex justify-between items-center">
                                <span className="text-gray-300">Total Gemstones:</span>
                                <div className="flex items-center space-x-2">
                                    <span className={`text-xl font-mono ${insufficientGemstones ? 'text-red-500' : 'text-cyan-200'}`}>{totalGemCost.toLocaleString()}</span>
                                    <div className="w-5 h-5 text-cyan-300"><GemIcon /></div>
                                </div>
                            </div>
                        ) : null}
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-4 text-sm text-gray-300 bg-black/20 p-3 rounded-lg">
                        <div className="flex items-center justify-between">
                            <span>Coins Available</span>
                            <div className="flex items-center gap-2">
                                <span className="font-mono text-amber-200">{profile.coins.toLocaleString()}</span>
                                <div className="w-4 h-4 text-amber-300"><CoinIcon /></div>
                            </div>
                        </div>
                        <div className="flex items-center justify-between">
                            <span>Gemstones Available</span>
                            <div className="flex items-center gap-2">
                                <span className="font-mono text-cyan-200">{profile.gemstones.toLocaleString()}</span>
                                <div className="w-4 h-4 text-cyan-300"><GemIcon /></div>
                            </div>
                        </div>
                    </div>

                    <div className="flex space-x-4 mt-8">
                        <button onClick={onCancel} disabled={isProcessing} className="w-full font-heading py-3 rounded-xl bg-gray-600/50 hover:bg-gray-500/50 border border-gray-500">Cancel</button>
                        <button
                            onClick={handleConfirm}
                            disabled={isProcessing || quantity === 0 || insufficientCoins || insufficientGemstones}
                            className="w-full font-heading py-3 rounded-xl bg-green-500/20 hover:bg-green-500/30 border border-green-400 text-white disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {isProcessing ? 'Processing...' : 'Confirm'}
                        </button>
                    </div>
                </div>
            </div>
        </ModalPortal>
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
        const receipt = await GameService.shop_buy(item.id, quantity);
        audioService.play('buy');
        onPurchase({ coins: -receipt.coins_spent, gemstones: -receipt.gemstones_spent });
        const costParts = [
            receipt.coins_spent ? `${receipt.coins_spent} coins` : null,
            receipt.gemstones_spent ? `${receipt.gemstones_spent} gemstones` : null,
        ].filter(Boolean).join(' & ');
        addToast(`Purchased ${quantity}x ${item.name} for ${costParts || 'free'}!`, 'success');
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


    const sectionBlueprints = [
        {
            id: 'defense',
            label: 'Defensive Arsenal',
            description: 'Shields, firewalls, and cryptographic wards that soak up enemy strikes.',
            matcher: (item: ShopItem) => ['shield', 'firewall', 'encryption_key'].includes(item.kind),
        },
        {
            id: 'boost',
            label: 'Boosters & Exploits',
            description: 'Tempo-shifting tools that spike damage, XP, or resource gains.',
            matcher: (item: ShopItem) => ['booster', 'major_booster', 'exploit_kit'].includes(item.kind),
        },
        {
            id: 'cosmetic',
            label: 'Style & Mystery',
            description: 'Cosmetic flairs and mysterious drops for extra prestige.',
            matcher: (item: ShopItem) => ['cosmetic', 'mystery'].includes(item.kind),
        },
    ];

    const assignedIds = new Set<string>();
    const sections = sectionBlueprints
            .map(section => {
                const matched = items.filter(item => {
                    const result = section.matcher(item);
                    if (result) assignedIds.add(item.id);
                    return result;
                });
                return { ...section, items: matched };
            })
            .filter(section => section.items.length > 0);

    const uncategorized = items.filter(item => !assignedIds.has(item.id));
    if (uncategorized.length > 0) {
        sections.push({
            id: 'utility',
            label: 'Utility Gear',
            description: 'Grab anything that does not fall into the core stacks above.',
            matcher: () => true,
            items: uncategorized,
        });
    }

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
            <div className="space-y-6">
                {sections.map(section => (
                    <section key={section.id} className="bg-black/40 border border-white/5 rounded-3xl p-6 space-y-4">
                        <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
                            <div>
                                <h3 className="font-heading text-2xl text-white">{section.label}</h3>
                                <p className="text-sm text-gray-400">{section.description}</p>
                            </div>
                            <span className="text-xs uppercase tracking-widest text-gray-400">{section.items.length} Item{section.items.length === 1 ? '' : 's'}</span>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                            {section.items.map(item => (
                                <ItemCard
                                    key={item.id}
                                    item={item}
                                    onBuy={setSelectedItem}
                                    balances={{ coins: profile.coins, gemstones: profile.gemstones }}
                                />
                            ))}
                        </div>
                    </section>
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