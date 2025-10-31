import React, { useState, useEffect } from 'react';
import { RaidTarget, RaidAttackResult, Profile } from '../types';
import * as GameService from '../services/gameService';
import { audioService } from '../services/audioService';
import BackButton from './BackButton';
import { ShieldIcon, HackIcon, CoinIcon, XPIcon } from './icons';
import { createPortal } from 'react-dom';

type PvPStage = 'loading' | 'targets' | 'cinematic' | 'result';

interface PvPViewProps {
  profile: Profile;
  onComplete: () => void;
  onGrantReward: (deltas: { xp?: number; coins?: number, ap?: number }) => void;
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
  
  const status = getOnlineStatus(target.last_seen);
  
  return (
    <div className="card-glass p-4 flex flex-col items-center text-center relative overflow-hidden">
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
      {target.clan_name && (
        <p className="text-xs text-ion-blue mt-1">⚔️ {target.clan_name}</p>
      )}
      <p className="text-xs text-amber-400 mt-1">~{target.coins.toLocaleString()} Coins</p>
      <button
        onClick={() => onSelect(target)}
        className="mt-4 w-full bg-pink-500/20 hover:bg-pink-500/30 border border-pink-400 text-white font-heading font-bold py-2 rounded-xl transition-all duration-200"
      >
        Hack
      </button>
    </div>
  );
};


const PvPView: React.FC<PvPViewProps> = ({ profile, onComplete, onGrantReward }) => {
  const [stage, setStage] = useState<PvPStage>('loading');
  const [targets, setTargets] = useState<RaidTarget[]>([]);
  const [selectedTarget, setSelectedTarget] = useState<RaidTarget | null>(null);
  const [attackResult, setAttackResult] = useState<RaidAttackResult | null>(null);
  const [useCracker, setUseCracker] = useState(false);

  useEffect(() => {
    GameService.raid_targets().then(data => {
      setTargets(data);
      setStage('targets');
    });
  }, []);

  const handleAttack = async (target: RaidTarget) => {
    setSelectedTarget(target);
    setStage('cinematic');

    const result = await GameService.raid_attack(target.user_id, useCracker, target);
    setAttackResult(result);

    // Play appropriate sound based on result
    if (result.result === 'win') {
      audioService.play('hack_win');
    } else if (result.result === 'blocked') {
      audioService.play('hack_fail');
    } else {
      audioService.play('hack_fail');
    }

    // Grant rewards/penalties including AP cost
    onGrantReward({
      xp: result.attacker_deltas.xp,
      coins: result.attacker_deltas.coins,
      ap: -2, // AP cost for hacking
    });
    
    setTimeout(() => {
        setStage('result');
    }, 2500); // Cinematic duration
  };

  const renderTargets = () => (
    <div>
      <h2 className="font-heading text-3xl text-center mb-8" style={{ color: 'var(--plasma-pink)' }}>Select a Target</h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-5xl mx-auto">
        {targets.map(target => (
          <TargetCard key={target.user_id} target={target} onSelect={handleAttack} />
        ))}
      </div>
    </div>
  );

  const renderCinematic = () => {
    if (!selectedTarget) return null;
    return (
      <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex flex-col items-center justify-center z-50 animate-fadeIn">
        <div className="flex items-center justify-around w-full max-w-md">
            <div className="flex flex-col items-center animate-slideInLeft">
                <img src={profile.avatar_url} className="w-24 h-24 md:w-32 md:h-32 rounded-full border-4 border-ion-blue" />
                <span className="mt-2 font-heading text-xl text-ion-blue">{profile.username}</span>
            </div>
            <div className="font-heading text-4xl text-plasma-pink animate-pulse">VS</div>
             <div className="flex flex-col items-center animate-slideInRight">
                <img src={selectedTarget.avatar_url} className="w-24 h-24 md:w-32 md:h-32 rounded-full border-4 border-plasma-pink" />
                <span className="mt-2 font-heading text-xl text-plasma-pink">{selectedTarget.username}</span>
            </div>
        </div>
        <p className="mt-8 font-mono text-xl animate-pulse text-amber-warn">Hacking in progress...</p>
      </div>
    );
  };
  
  const renderResult = () => {
    if (!attackResult || !selectedTarget) return null;

    const resultText = {
        win: { title: 'Breach Successful! 🎯', color: 'var(--success-teal)' },
        lose: { title: 'Hack Failed 😤', color: 'var(--danger-red)' },
        blocked: { title: 'Attack Blocked 🛡️', color: 'var(--amber-warn)' }
    };
    const {title, color} = resultText[attackResult.result];

    // Static result messages - no randomization
    const getResultMessage = () => {
        if (attackResult.result === 'win') {
            return `You successfully hacked ${selectedTarget.username}! Their defenses couldn't hold! �`;
        } else if (attackResult.result === 'blocked') {
            return `${selectedTarget.username}'s shield stopped your attack! Better bring a cracker next time! 🔨`;
        } else {
            return `${selectedTarget.username}'s defenses held strong. Time to upgrade and try again! 📈`;
        }
    };

    const handleHackAnother = () => {
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
                </div>

                <button
                    onClick={handleHackAnother}
                    className="w-full bg-plasma-pink/20 hover:bg-plasma-pink/30 border border-plasma-pink text-white shadow-lg shadow-plasma-pink/20 font-heading font-bold text-lg tracking-wider p-4 rounded-2xl transition-all duration-300 transform hover:scale-105"
                >
                    🎯 Hack Another Target
                </button>
            </div>
        </div>
    );
  };


  const renderContent = () => {
    switch(stage) {
      case 'loading': return <div className="font-heading text-2xl animate-pulse text-center mt-20" style={{color: 'var(--plasma-pink)'}}>Scanning for targets...</div>;
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
    </div>
  );
};

export default PvPView;
