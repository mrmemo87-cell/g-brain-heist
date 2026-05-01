import React, { useState, useEffect } from 'react';
import { ShopItem, Profile, ToastMessage } from '../types';
import * as GameService from '../services/gameService';
import { audioService } from '../services/audioService';
import BackButton from './BackButton';
import CoinAnimation from './CoinAnimation';
import { tryConsumePilotQuota } from '../services/tierService';
import {
  BoosterIcon,
  CoinIcon,
  CosmeticIcon,
  CrackerIcon,
  EncryptionKeyIcon,
  ExploitIcon,
  FirewallIcon,
  GemIcon,
  MysteryIcon,
  ShieldIcon,
} from './icons';
import ModalPortal from './ModalPortal';
import { isBrainsMasterActive, formatBrainsMasterRemaining, BM_GEM_PRICE, BM_INSTANT_GEMS, BM_DURATION_DAYS, BM_CAP_BOOST_FACTOR } from '../src/utils/premiumHelpers';

type ShopStage = 'loading' | 'idle' | 'purchasing';

interface ShopViewProps {
  profile: Profile;
  onComplete: () => void;
  onPurchase: (deltas: { coins?: number; gemstones?: number }) => void;
  addToast: (message: string, type: ToastMessage['type']) => void;
  onNavigateToInventory?: () => void;
}

const SHOP_ITEM_ART_BY_ID: Partial<Record<string, string>> = {
  item_quantum_cloak: '/visuals/shop-items/Quantum-Cloak.png',
};

const SHOP_ITEM_ART_BY_KIND: Partial<Record<ShopItem['kind'], string>> = {
  shield: '/visuals/shop-items/Shield.png',
  firewall: '/visuals/shop-items/Firewall.png',
  encryption_key: '/visuals/shop-items/Encryption-Key.png',
  exploit_kit: '/visuals/shop-items/Exploit-Kit.png',
  booster: '/visuals/shop-items/Booster.png',
  major_booster: '/visuals/shop-items/Major-Booster.png',
};

const getItemIcon = (item: ShopItem) => {
  const style = { width: '100%', height: '100%' };
  const imageSrc = SHOP_ITEM_ART_BY_ID[item.id] || SHOP_ITEM_ART_BY_KIND[item.kind];
  if (imageSrc) {
    return <img src={imageSrc} alt={item.name} className="w-full h-full object-contain" loading="lazy" />;
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
      return <div style={{ ...style, color: 'var(--ion-blue)' }}><FirewallIcon /></div>;
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
      <div
        className={`card-glass relative flex flex-col gap-3 p-4 sm:p-5 text-left ${currentStyle.glow}`}
        style={{ borderColor: rarity?.border || currentStyle.border }}
      >
        <div className="flex items-start justify-between gap-2">
          {rarity && (
            <div className={`px-3 py-1 rounded-full text-[11px] font-semibold uppercase tracking-wide ${rarity.badge}`}>
              {rarity.label}
            </div>
          )}
          <div className="px-3 py-1 rounded-full bg-black/30 text-[11px] text-gray-300 border border-white/10 font-mono">
            {remainingToday} left today
          </div>
        </div>

        <div className="flex items-start gap-4">
          <div className="w-32 h-32 sm:w-36 sm:h-36 flex shrink-0 items-center justify-center rounded-xl">
            {getItemIcon(item)}
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-heading text-lg text-white truncate">{item.name}</h3>
            <p className="text-sm text-gray-400 line-clamp-2">{item.description}</p>
          </div>
        </div>

        <p className="text-xs text-gray-400 leading-relaxed bg-black/20 border border-white/5 rounded-lg p-2">
          {item.effect_summary}
        </p>

        <div className="grid grid-cols-2 gap-2">
          <div className="inline-flex items-center justify-between bg-black/30 px-3 py-2 rounded-lg border border-amber-500/30">
            <span className="font-heading text-lg text-amber-300">{item.price}</span>
            <CoinAnimation width={20} height={20} />
          </div>
          {item.gemstone_price ? (
            <div className="inline-flex items-center justify-between bg-black/30 px-3 py-2 rounded-lg border border-rose-500/50 shadow-[0_10px_24px_rgba(248,113,113,0.25)]">
              <span className="font-heading text-lg text-rose-200">{item.gemstone_price}</span>
              <div className="w-5 h-5">
                <GemIcon />
              </div>
            </div>
          ) : (
            <div className="inline-flex items-center justify-center px-3 py-2 rounded-lg text-xs text-gray-500 bg-black/20 border border-white/5">
              Coins only
            </div>
          )}
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
          <p className="text-xs text-red-400 font-mono">{shortageMessage}</p>
        )}
        {limitReached && (
          <p className="text-xs text-amber-300 font-mono">Restock after daily reset</p>
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
                                <CoinAnimation width={20} height={20} />
                            </div>
                        </div>
                        {item.gemstone_price ? (
                            <div className="flex justify-between items-center">
                                <span className="text-gray-300">Total Gemstones:</span>
                                <div className="flex items-center space-x-2">
                                    <span className={`text-xl font-mono ${insufficientGemstones ? 'text-red-500' : 'text-rose-200'}`}>{totalGemCost.toLocaleString()}</span>
                                    <div className="w-5 h-5">
                                        <GemIcon />
                                    </div>
                                </div>
                            </div>
                        ) : null}
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-4 text-sm text-gray-300 bg-black/20 p-3 rounded-lg">
                        <div className="flex items-center justify-between">
                            <span>Coins Available</span>
                            <div className="flex items-center gap-2">
                                <span className="font-mono text-amber-200">{profile.coins.toLocaleString()}</span>
                                <CoinAnimation width={16} height={16} />
                            </div>
                        </div>
                        <div className="flex items-center justify-between">
                            <span>Gemstones Available</span>
                            <div className="flex items-center gap-2">
                                <span className="font-mono text-rose-200">{profile.gemstones.toLocaleString()}</span>
                                <div className="w-4 h-4">
                                    <GemIcon />
                                </div>
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
  const [bmPurchasing, setBmPurchasing] = useState(false);

  const bmActive = isBrainsMasterActive(profile);

  const handleBuyBrainsMaster = async () => {
    if (profile.gemstones < BM_GEM_PRICE) {
      addToast(`You need ${BM_GEM_PRICE} gemstones to purchase Brains Master (you have ${profile.gemstones}).`, 'error');
      return;
    }
    setBmPurchasing(true);
    try {
      const result = await GameService.brains_master_purchase();
      if (!result.success) {
        addToast(result.error || 'Brains Master purchase failed', 'error');
        return;
      }
      audioService.play('buy');
      onPurchase({
        gemstones: -(result.gemstones_spent - result.gemstones_granted),
        coins: result.coins_granted,
      });
      addToast(
        `🧠 Brains Master activated! +${result.gemstones_granted} gems, +${result.coins_granted} coins. Expires ${new Date(result.new_expiry).toLocaleDateString()}.`,
        'success'
      );
    } catch (error: any) {
      addToast(error.message || 'Brains Master purchase failed', 'error');
    } finally {
      setBmPurchasing(false);
    }
  };

  useEffect(() => {
    GameService.shop_list().then(data => {
      setItems(data);
      setStage('idle');
    });
  }, []);

  const handleBuy = async (item: ShopItem, quantity: number) => {
    // Consume pilot quota if applicable
    const quota = await tryConsumePilotQuota('shop_purchases');
    if (!quota.proceed) {
      addToast(quota.error || 'You\'ve reached the shop purchase limit on the Pilot plan. Upgrade to continue.', 'error');
      return;
    }

    try {
        const receipt = await GameService.shop_buy(item.id, quantity);
        audioService.play('buy');
        onPurchase({ coins: -receipt.coins_spent, gemstones: -receipt.gemstones_spent });
        setItems(prev =>
          prev.map(shopItem =>
            shopItem.id === item.id
              ? { ...shopItem, owned_today: shopItem.owned_today + quantity }
              : shopItem
          )
        );
        setSelectedItem(null);
        // Silent background sync to reconcile with server and keep UX instant.
        GameService.shop_list().then(data => setItems(data)).catch(() => {});
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
            matcher: (item: ShopItem) => ['shield', 'firewall'].includes(item.kind),
        },
        {
            id: 'boost',
            label: 'Boosters & Exploits',
            description: 'Tempo-shifting tools that spike damage, XP, or resource gains.',
            matcher: (item: ShopItem) => ['booster', 'major_booster', 'exploit_kit', 'encryption_key'].includes(item.kind),
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
     return <div className="flex justify-center mt-20"><img src="/BRAINS.svg" alt="Loading..." className="w-32 h-32 animate-pulse" style={{ filter: 'drop-shadow(0 0 30px rgba(0, 212, 255, 0.6))' }} /></div>;
  }

  return (
    <div className="mt-6">
      <div className="sticky top-4 z-40 mb-6">
        <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-slate-950/70 p-2 backdrop-blur sm:flex-row sm:items-center sm:justify-between">
          <BackButton onClick={onComplete} containerClassName="mb-0" />
          {onNavigateToInventory && (
            <button
              onClick={onNavigateToInventory}
              className="w-full px-4 py-2 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg font-heading hover:from-blue-500 hover:to-purple-500 transition-all sm:w-auto"
            >
              View Inventory →
            </button>
          )}
        </div>
      </div>
      <h2 className="font-heading text-3xl text-center mb-8" style={{ color: 'var(--success-teal)' }}>Item Shop</h2>

            {/* ── Brains Master Premium Card ── */}
            <section className="mb-6 rounded-3xl border border-yellow-500/30 bg-gradient-to-br from-[#3b1f18]/90 via-[#2e1628]/90 to-[#2a1223]/90 p-5 sm:p-6 relative overflow-hidden shadow-[0_0_40px_rgba(251,191,36,0.1)]">
              <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(251,191,36,0.12),transparent_62%)] pointer-events-none" />
              <div className="relative z-20 grid grid-cols-1 md:grid-cols-[1fr_auto] gap-4 md:gap-6">
                <div className="space-y-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="font-heading text-2xl text-amber-300 flex items-center gap-2">
                    🧠 Brains Master
                    {bmActive && <span className="text-xs bg-green-500/20 text-green-300 px-2 py-0.5 rounded-full border border-green-500/30">ACTIVE</span>}
                  </h3>
                  <p className="mt-1 text-sm text-amber-100/80 leading-relaxed max-w-xl">
                    {bmActive
                      ? formatBrainsMasterRemaining(profile)
                      : `${BM_DURATION_DAYS}-day premium rank with instant rewards & boosted caps`}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4"><GemIcon /></div>
                  <span className="font-mono text-rose-200 text-lg">{BM_GEM_PRICE}</span>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
                <div className="rounded-xl border border-white/10 bg-black/25 p-3 backdrop-blur-[1px]">
                  <span className="text-gray-400">Instant Reward</span>
                  <p className="text-white font-heading">+{BM_INSTANT_GEMS} 💎 gems + 5× daily coin cap in coins</p>
                </div>
                <div className="rounded-xl border border-white/10 bg-black/25 p-3 backdrop-blur-[1px]">
                  <span className="text-gray-400">Cap Boost</span>
                  <p className="text-white font-heading">{BM_CAP_BOOST_FACTOR}× all earning caps for {BM_DURATION_DAYS} days</p>
                </div>
                <div className="rounded-xl border border-white/10 bg-black/25 p-3 backdrop-blur-[1px]">
                  <span className="text-gray-400">Badge</span>
                  <p className="text-white font-heading">🧠 Brains Master badge on leaderboard & clan</p>
                </div>
              </div>
              <button
                onClick={handleBuyBrainsMaster}
                disabled={bmPurchasing || profile.gemstones < BM_GEM_PRICE}
                className={`w-full py-3 rounded-xl font-heading text-lg transition-all ${
                  bmPurchasing
                    ? 'bg-gray-600/50 cursor-wait'
                    : profile.gemstones < BM_GEM_PRICE
                    ? 'bg-gray-700/50 text-gray-400 cursor-not-allowed'
                    : bmActive
                    ? 'bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white'
                    : 'bg-gradient-to-r from-amber-600 to-yellow-600 hover:from-amber-500 hover:to-yellow-500 text-white'
                }`}
              >
                {bmPurchasing ? 'Purchasing…' : bmActive ? 'Extend Brains Master' : 'Purchase Brains Master'}
              </button>
              {profile.gemstones < BM_GEM_PRICE && (
                <p className="text-xs text-rose-300/90 text-center">
                  You need {BM_GEM_PRICE - profile.gemstones} more gemstones
                </p>
              )}
                </div>
                <div className="flex items-start justify-center md:justify-end">
                  <img
                    src="/visuals/shop-items/Brains-Master.png"
                    alt="Brains Master"
                    className="pointer-events-none h-44 w-full max-w-xs object-contain opacity-95 drop-shadow-[0_10px_30px_rgba(255,170,80,0.35)] md:h-56"
                    loading="lazy"
                  />
                </div>
              </div>
            </section>

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
