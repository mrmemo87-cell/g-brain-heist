import React, { useState, useEffect } from 'react';
import { RaidTarget, RaidAttackResult, Profile } from '../types';
import * as GameService from '../services/gameService';
import { supabase } from '../services/supabaseClient';
import { audioService } from '../services/audioService';
import BackButton from './BackButton';
import { ShieldIcon, HackIcon, CoinIcon, XPIcon, GemIcon } from './icons';
import { createPortal } from 'react-dom';

type PvPStage = 'loading' | 'targets' | 'cinematic' | 'result';

interface BattleNarration {
  text: string;
  delay: number;
  color?: string;
  icon?: string;
}

const RAID_AP_COST = 2;

interface PvPViewProps {
  profile: Profile;
  onComplete: () => void;
  onGrantReward: (deltas: { xp?: number; coins?: number; gemstones?: number; ap?: number }) => void;
}

const TargetCard: React.FC<{ target: RaidTarget, onSelect: (target: RaidTarget) => void }> = ({ target, onSelect }) => {
  // Calculate online status based on last_seen
  const getOnlineStatus = (last_seen?: string): { color: string; label: string } => {
    if (!last_seen) return { color: 'bg-gray-500', label: 'Unknown' };
    
    const lastSeenTime = new Date(last_seen).getTime();
    const now = Date.now();
    const minutesAgo = (now - lastSeenTime) / 1000 / 60;
    
    if (minutesAgo < 5) {
      return { color: 'bg-green-500', label: 'Online' };
    } else if (minutesAgo < 30) {
      return { color: 'bg-yellow-500', label: 'Away' };
    } else {
      return { color: 'bg-red-500', label: 'Offline' };
    }
  };
  
  // Check if target is on cooldown (attacked in last 5 minutes)
  const isOnCooldown = target.last_attacked_at && 
    (Date.now() - new Date(target.last_attacked_at).getTime()) < 5 * 60 * 1000;
  
  const getCooldownRemaining = () => {
    if (!isOnCooldown || !target.last_attacked_at) return 0;
    const elapsed = Date.now() - new Date(target.last_attacked_at).getTime();
    const remaining = (5 * 60 * 1000) - elapsed;
    return Math.ceil(remaining / 1000 / 60); // minutes
  };
  
  const status = getOnlineStatus(target.last_seen);
  
  return (
    <div className="card-glass p-4 flex flex-col items-center text-center relative overflow-hidden">
      {/* Cooldown Badge */}
      {isOnCooldown && (
        <div className="absolute top-2 left-2 bg-red-500/80 text-white text-xs px-2 py-0.5 rounded-full z-10" title="Recently attacked">
          🕐 {getCooldownRemaining()}m
        </div>
      )}
      
      {target.has_shield && (
        <div className="absolute top-2 right-2 w-6 h-6 text-cyan-400" title="Shield Active">
          <ShieldIcon />
        </div>
      )}
      <div className="relative mb-3">
        <img src={target.avatar_url} alt={target.username} className="w-20 h-20 rounded-full border-2 border-gray-600" />
        <div 
          className={`absolute bottom-0 right-0 w-4 h-4 ${status.color} rounded-full border-2 border-gray-900`}
          title={status.label}
        />
      </div>
      <h3 className="font-heading text-lg" style={{ color: 'var(--plasma-pink)' }}>{target.username}</h3>
      <p className="text-sm text-gray-400">Lvl {target.level} | Batch {target.batch}</p>
      {target.clan_name && target.clan_id && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            (window as any).openClanMembers?.(target.clan_id, target.clan_name);
          }}
          className="text-xs text-ion-blue mt-1 hover:text-cyan-300 transition-colors underline"
        >
          ⚔️ {target.clan_name}
        </button>
      )}
      {target.clan_name && !target.clan_id && (
        <p className="text-xs text-ion-blue mt-1">⚔️ {target.clan_name}</p>
      )}
      <p className="text-xs text-amber-400 mt-1">~{target.coins.toLocaleString()} Coins</p>
      <button
        onClick={() => onSelect(target)}
        disabled={isOnCooldown}
        className={`mt-4 w-full font-heading font-bold py-2 rounded-xl transition-all duration-200 ${
          isOnCooldown
            ? 'bg-gray-500/20 border border-gray-600 text-gray-500 cursor-not-allowed'
            : 'bg-pink-500/20 hover:bg-pink-500/30 border border-pink-400 text-white'
        }`}
      >
        {isOnCooldown ? `🕐 Cooldown ${getCooldownRemaining()}m` : '⚔️ Attack'}
      </button>
    </div>
  );
};


interface ClanMember {
  user_id: string;
  username: string;
  role: string;
  avatar_url?: string;
}

type TargetFilter = 'all' | 'nearby' | 'easy' | 'challenge' | 'rivals';

const PvPView: React.FC<PvPViewProps> = ({ profile, onComplete, onGrantReward }) => {
  const [stage, setStage] = useState<PvPStage>('loading');
  const [targets, setTargets] = useState<RaidTarget[]>([]);
  const [selectedTarget, setSelectedTarget] = useState<RaidTarget | null>(null);
  const [attackResult, setAttackResult] = useState<RaidAttackResult | null>(null);
  const [useCracker, setUseCracker] = useState(false);
  const [battleNarration, setBattleNarration] = useState<BattleNarration[]>([]);
  const [visibleNarrations, setVisibleNarrations] = useState<number>(0);
  const [clanModal, setClanModal] = useState<{ clanId: string; clanName: string; members: ClanMember[]; loading: boolean } | null>(null);
  const [filterTab, setFilterTab] = useState<TargetFilter>('all');

  useEffect(() => {
    GameService.raid_targets().then(data => {
      // Filter out admin users (they cannot be attacked)
      const attackableTargets = data.filter((target: any) => target.role !== 'admin');
      setTargets(attackableTargets);
      setStage('targets');
    });
  }, []);

  const openClanMembers = async (clanId: string, clanName: string) => {
    setClanModal({ clanId, clanName, members: [], loading: true });
    
    try {
      const { data, error } = await supabase
        .from('clan_members')
        .select(`
          user_id,
          role,
          users!inner (
            username,
            avatar_url
          )
        `)
        .eq('clan_id', clanId);

      if (error) throw error;

      const members: ClanMember[] = (data || []).map((m: any) => ({
        user_id: m.user_id,
        username: m.users?.username || 'Unknown',
        role: m.role || 'member',
        avatar_url: m.users?.avatar_url,
      }));

      setClanModal({ clanId, clanName, members, loading: false });
    } catch (err) {
      console.error('Failed to load clan members:', err);
      setClanModal(null);
    }
  };

  useEffect(() => {
    (window as any).openClanMembers = openClanMembers;
    return () => {
      delete (window as any).openClanMembers;
    };
  }, []);

  const getFilteredTargets = () => {
    switch (filterTab) {
      case 'nearby':
        return targets.filter(t => Math.abs(t.level - profile.level) <= 2);
      case 'easy':
        return targets.filter(t => t.level < profile.level);
      case 'challenge':
        return targets.filter(t => t.level > profile.level);
      case 'rivals':
        return targets.filter(t => t.clan_name && t.clan_name !== profile.clan_name);
      default:
        return targets;
    }
  };

  const filteredTargets = getFilteredTargets();

  const handleAttack = async (target: RaidTarget) => {
    if (profile.ap_now < RAID_AP_COST) {
      audioService.play('wrong');
      alert('Not enough Action Points to launch a raid. Regain AP before attacking again.');
      return;
    }

    onGrantReward({ ap: -RAID_AP_COST });

    setSelectedTarget(target);
    setStage('cinematic');
    setBattleNarration([]);
    setVisibleNarrations(0);

    // Generate battle narration based on combat stats
    const narrativeSteps: BattleNarration[] = [];
    
    // Calculate estimated stats (client-side approximation)
    const attackerAttack = profile.attack_power || 10;
    const baseDefense = 10 + (target.level * 2); // Estimate based on level
    const defenderDefense = baseDefense + (target.has_shield ? 20 : 0);
    const winChance = Math.round((attackerAttack / (attackerAttack + defenderDefense)) * 100);

    // Opening
    narrativeSteps.push({
      text: `💥 ${profile.username} charges at ${target.username}!`,
      delay: 0,
      color: 'text-cyan-400'
    });

    // Show combat stats
    narrativeSteps.push({
      text: `⚔️ Your Attack Power: ${attackerAttack}`,
      delay: 600,
      color: 'text-green-400'
    });

    narrativeSteps.push({
      text: `🛡️ Enemy Defense: ${defenderDefense}${target.has_shield ? ' (+20 Shield)' : ''}`,
      delay: 1200,
      color: 'text-yellow-400'
    });

    // Win chance calculation
    narrativeSteps.push({
      text: `🎲 Victory Chance: ${winChance}%`,
      delay: 1800,
      color: 'text-purple-400'
    });

    // Rolling
    narrativeSteps.push({
      text: `🎰 Rolling the dice of fate...`,
      delay: 2400,
      color: 'text-pink-400',
      icon: '🎲'
    });

    setBattleNarration(narrativeSteps);

    // Animate narrations appearing
    narrativeSteps.forEach((_, index) => {
      setTimeout(() => {
        setVisibleNarrations(index + 1);
      }, narrativeSteps[index].delay);
    });

    try {
      // Call the actual attack (starts immediately but runs in parallel with animations)
      const result = await GameService.raid_attack(target.user_id, useCracker, target);

      console.log('Battle result received:', result); // Debug log
      
      setAttackResult(result);

      // Play appropriate sound based on result
      if (result.result === 'win') {
        audioService.play('hack_win');
      } else if (result.result === 'blocked') {
        audioService.play('hack_fail');
      } else {
        audioService.play('hack_fail');
      }

      // Grant rewards/penalties (AP cost already deducted when the raid was initiated)
      onGrantReward({
        xp: result.attacker_deltas.xp,
        coins: result.attacker_deltas.coins,
        gemstones: result.attacker_deltas.gemstones,
      });

      // Wait for minimum animation time (2.8s) before showing result
      const elapsedTime = 2800;
      setTimeout(() => {
        setStage('result');
      }, elapsedTime);

    } catch (error) {
      console.error('Battle attack error:', error);
      // Show error and go back to targets
      alert('Battle failed and action points were still consumed: ' + (error as Error).message);
      setStage('loading');
      GameService.raid_targets().then(data => {
        setTargets(data);
        setStage('targets');
      });
    }
  };

  const renderTargets = () => (
    <div>
      <h2 className="font-heading text-3xl text-center mb-4" style={{ color: 'var(--plasma-pink)' }}>⚔️ Choose Your Target</h2>
      
      {/* Filter Tabs */}
      <div className="flex justify-center gap-2 mb-6 flex-wrap">
        <button
          onClick={() => setFilterTab('all')}
          className={`px-4 py-2 rounded-lg font-semibold transition-all ${
            filterTab === 'all'
              ? 'bg-pink-500/30 border-2 border-pink-400 text-white'
              : 'bg-black/20 border border-gray-600 text-gray-400 hover:text-white'
          }`}
        >
          All ({targets.length})
        </button>
        <button
          onClick={() => setFilterTab('nearby')}
          className={`px-4 py-2 rounded-lg font-semibold transition-all ${
            filterTab === 'nearby'
              ? 'bg-pink-500/30 border-2 border-pink-400 text-white'
              : 'bg-black/20 border border-gray-600 text-gray-400 hover:text-white'
          }`}
        >
          ⚖️ Fair Fights ({targets.filter(t => Math.abs(t.level - profile.level) <= 2).length})
        </button>
        <button
          onClick={() => setFilterTab('easy')}
          className={`px-4 py-2 rounded-lg font-semibold transition-all ${
            filterTab === 'easy'
              ? 'bg-pink-500/30 border-2 border-pink-400 text-white'
              : 'bg-black/20 border border-gray-600 text-gray-400 hover:text-white'
          }`}
        >
          ✅ Easy ({targets.filter(t => t.level < profile.level).length})
        </button>
        <button
          onClick={() => setFilterTab('challenge')}
          className={`px-4 py-2 rounded-lg font-semibold transition-all ${
            filterTab === 'challenge'
              ? 'bg-pink-500/30 border-2 border-pink-400 text-white'
              : 'bg-black/20 border border-gray-600 text-gray-400 hover:text-white'
          }`}
        >
          💪 Challenges ({targets.filter(t => t.level > profile.level).length})
        </button>
        <button
          onClick={() => setFilterTab('rivals')}
          className={`px-4 py-2 rounded-lg font-semibold transition-all ${
            filterTab === 'rivals'
              ? 'bg-pink-500/30 border-2 border-pink-400 text-white'
              : 'bg-black/20 border border-gray-600 text-gray-400 hover:text-white'
          }`}
        >
          ⚔️ Clan Rivals ({targets.filter(t => t.clan_name && t.clan_name !== profile.clan_name).length})
        </button>
      </div>
      
      {/* Targets Grid */}
      {filteredTargets.length === 0 ? (
        <div className="text-center text-gray-400 py-8">
          <p className="text-xl">No targets in this category</p>
          <p className="text-sm mt-2">Try a different filter</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 max-w-7xl mx-auto">
          {filteredTargets.map(target => (
            <TargetCard key={target.user_id} target={target} onSelect={handleAttack} />
          ))}
        </div>
      )}
    </div>
  );

  const renderCinematic = () => {
    if (!selectedTarget) return null;
    return (
      <div className="fixed inset-0 bg-black/90 backdrop-blur-md flex flex-col items-center justify-center z-50 p-4 overflow-hidden">
        {/* Battle Arena Background Effect */}
        <div className="absolute inset-0 bg-gradient-to-br from-red-900/20 via-purple-900/20 to-blue-900/20 animate-pulse"></div>
        
        {/* Combatants */}
        <div className="relative z-10 flex items-center justify-around w-full max-w-2xl mb-8">
            <div className="flex flex-col items-center animate-slideInLeft">
                <div className="relative">
                  <img src={profile.avatar_url} className="w-24 h-24 md:w-32 md:h-32 rounded-full border-4 border-cyan-500 shadow-[0_0_30px_rgba(34,211,238,0.6)]" />
                  <div className="absolute -top-2 -right-2 bg-green-500 text-white text-xs font-bold px-2 py-1 rounded-full">
                    ⚔️ {profile.attack_power || 10}
                  </div>
                </div>
                <span className="mt-3 font-heading text-xl text-cyan-400 font-bold">{profile.username}</span>
                <span className="text-sm text-gray-400">Level {profile.level}</span>
            </div>
            
            <div className="relative">
              <div className="font-heading text-5xl md:text-6xl text-transparent bg-clip-text bg-gradient-to-r from-red-500 via-yellow-500 to-red-500 animate-pulse font-black">
                VS
              </div>
              <div className="absolute inset-0 blur-xl bg-gradient-to-r from-red-500 via-yellow-500 to-red-500 opacity-50 animate-pulse"></div>
            </div>
            
            <div className="flex flex-col items-center animate-slideInRight">
                <div className="relative">
                  <img src={selectedTarget.avatar_url} className="w-24 h-24 md:w-32 md:h-32 rounded-full border-4 border-pink-500 shadow-[0_0_30px_rgba(236,72,153,0.6)]" />
                  {selectedTarget.has_shield && (
                    <div className="absolute -top-2 -left-2 bg-yellow-500 text-white text-xs font-bold px-2 py-1 rounded-full animate-pulse">
                      🛡️ +20
                    </div>
                  )}
                  <div className="absolute -bottom-2 -right-2 bg-blue-500 text-white text-xs font-bold px-2 py-1 rounded-full">
                    🛡️ {10 + (selectedTarget.level * 2) + (selectedTarget.has_shield ? 20 : 0)}
                  </div>
                </div>
                <span className="mt-3 font-heading text-xl text-pink-400 font-bold">{selectedTarget.username}</span>
                <span className="text-sm text-gray-400">Level {selectedTarget.level}</span>
            </div>
        </div>

        {/* Battle Narration */}
        <div className="relative z-10 w-full max-w-2xl bg-black/60 backdrop-blur-sm border-2 border-purple-500/50 rounded-2xl p-6 min-h-[280px] shadow-[0_0_50px_rgba(168,85,247,0.4)]">
          <div className="flex flex-col space-y-3">
            {battleNarration.slice(0, visibleNarrations).map((narration, index) => (
              <div 
                key={index}
                className={`${narration.color || 'text-white'} font-mono text-base md:text-lg font-semibold animate-fade-in-up flex items-center gap-3 ${
                  index === visibleNarrations - 1 ? 'animate-pulse' : ''
                }`}
                style={{ 
                  animationDelay: '0ms',
                  animationFillMode: 'both'
                }}
              >
                {narration.icon && (
                  <span className="text-2xl animate-bounce">{narration.icon}</span>
                )}
                <span>{narration.text}</span>
              </div>
            ))}
            
            {visibleNarrations === battleNarration.length && (
              <div className="mt-4 flex items-center justify-center">
                <div className="flex space-x-2">
                  <div className="w-3 h-3 bg-cyan-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                  <div className="w-3 h-3 bg-pink-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                  <div className="w-3 h-3 bg-yellow-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Energy waves animation */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 border-4 border-cyan-500/30 rounded-full animate-ping"></div>
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 border-4 border-pink-500/20 rounded-full animate-ping" style={{ animationDelay: '1s' }}></div>
      </div>
    );
  };
  
  const renderResult = () => {
    if (!attackResult || !selectedTarget) return null;

    const resultText = {
        win: { title: 'Victory! �', color: 'var(--success-teal)' },
        lose: { title: 'Defeated �', color: 'var(--danger-red)' },
        blocked: { title: 'Blocked by Shield 🛡️', color: 'var(--amber-warn)' }
    };
    const {title, color} = resultText[attackResult.result];

    // Combat result messages
    const getResultMessage = () => {
        if (attackResult.result === 'win') {
            return `You defeated ${selectedTarget.username}! Your superior combat skills overwhelmed their defenses! 💪`;
        } else if (attackResult.result === 'blocked') {
            return `${selectedTarget.username}'s shield absorbed your attack! Their protective barrier held strong! �️`;
        } else {
            return `${selectedTarget.username} defended successfully! Their combat prowess turned the tide of battle! ⚔️`;
        }
    };

    const handleAttackAnother = () => {
        setStage('loading');
        setSelectedTarget(null);
        setAttackResult(null);
        GameService.raid_targets().then(data => {
            setTargets(data);
            setStage('targets');
        });
    };

    return (
        <div className="text-center max-w-lg mx-auto">
            <div className="flex flex-col items-center mb-4">
              {attackResult.result === 'win' && (
                <div className="text-8xl mb-4 animate-bounce">🏆</div>
              )}
              {attackResult.result === 'blocked' && (
                <div className="text-8xl mb-4 animate-pulse">🛡️</div>
              )}
              {attackResult.result === 'lose' && (
                <div className="text-8xl mb-4 animate-ping">💥</div>
              )}
              <h2 className="font-heading text-4xl" style={{ color }}>{title}</h2>
            </div>
            <div className="card-glass p-8" style={{borderColor: `${color}80`}}>
                 <p className="text-lg mb-6">{getResultMessage()}</p>

                <div className="text-2xl font-heading space-y-2 mb-6">
                    <p>XP Delta: <span style={{color: attackResult.attacker_deltas.xp > 0 ? 'var(--ion-blue)' : 'var(--danger-red)'}}>{attackResult.attacker_deltas.xp >= 0 ? `+${attackResult.attacker_deltas.xp}` : attackResult.attacker_deltas.xp}</span></p>
                    <p>Coins Delta: <span style={{color: 'var(--amber-warn)'}}>{attackResult.attacker_deltas.coins >= 0 ? `+${attackResult.attacker_deltas.coins}`: attackResult.attacker_deltas.coins}</span></p>
                    <p className="flex items-center justify-center gap-2">Gemstones: <span className="inline-flex items-center gap-1" style={{color: 'var(--plasma-pink)'}}><GemIcon className="w-5 h-5" />{attackResult.attacker_deltas.gemstones && attackResult.attacker_deltas.gemstones >= 0 ? `+${attackResult.attacker_deltas.gemstones}` : attackResult.attacker_deltas.gemstones || 0}</span></p>
                </div>

                <button
                    onClick={handleAttackAnother}
                    className="w-full bg-plasma-pink/20 hover:bg-plasma-pink/30 border border-plasma-pink text-white shadow-lg shadow-plasma-pink/20 font-heading font-bold text-lg tracking-wider p-4 rounded-2xl transition-all duration-300 transform hover:scale-105"
                >
                    ⚔️ Battle Another Target
                </button>
            </div>
        </div>
    );
  };


  const renderContent = () => {
    switch(stage) {
      case 'loading': return <div className="font-heading text-2xl animate-pulse text-center mt-20" style={{color: 'var(--plasma-pink)'}}>🎯 Searching for opponents...</div>;
      case 'targets': return renderTargets();
      case 'cinematic': return createPortal(renderCinematic(), document.body);
      case 'result': return renderResult();
      default: return null;
    }
  }

  return (
    <div className="mt-6">
      <BackButton onClick={onComplete} />
      {renderContent()}
      
      {/* Clan Members Modal */}
      {clanModal && (
        <div 
          className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4"
          onClick={() => setClanModal(null)}
        >
          <div 
            className="card-glass max-w-md w-full max-h-[80vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="font-heading text-2xl text-amber-300">⚔️ {clanModal.clanName}</h3>
                <button 
                  onClick={() => setClanModal(null)}
                  className="text-gray-400 hover:text-white text-2xl"
                >
                  ×
                </button>
              </div>
              
              {clanModal.loading ? (
                <p className="text-center text-gray-300 py-4">Loading members...</p>
              ) : (
                <div className="space-y-2">
                  {clanModal.members.map((member) => (
                    <div key={member.user_id} className="flex items-center gap-3 p-3 bg-black/20 rounded-lg">
                      <img
                        src={member.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${member.username}`}
                        alt={member.username}
                        className="w-10 h-10 rounded-full border-2 border-gray-600"
                      />
                      <div className="flex-1">
                        <p className="font-semibold text-white">{member.username}</p>
                        <p className="text-xs text-gray-400 capitalize">{member.role}</p>
                      </div>
                    </div>
                  ))}
                  {clanModal.members.length === 0 && (
                    <p className="text-center text-gray-400 py-4">No members found</p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PvPView;
