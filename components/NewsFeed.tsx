import React, { useState, useEffect } from 'react';
import { NewsEvent } from '../types';
import { LevelUpIcon, PvpWinIcon, PvpBlockedIcon, QuestClearedIcon, PurchaseIcon, TrophyIcon } from './icons';
import { activity_reaction_toggle } from '../services/gameService';

const getEventIconAndColor = (kind: NewsEvent['kind']) => {
    const iconStyle = {width: '1.5rem', height: '1.5rem'};
    switch (kind) {
        case 'level_up': return { icon: <div style={{...iconStyle, color: 'var(--amber-warn)'}}><LevelUpIcon /></div>, color: 'var(--amber-warn)' };
        case 'pvp_win': return { icon: <div style={{...iconStyle, color: 'var(--success-teal)'}}><PvpWinIcon /></div>, color: 'var(--success-teal)' };
        case 'pvp_loss':
        case 'pvp_blocked': return { icon: <div style={{...iconStyle, color: 'var(--danger-red)'}}><PvpBlockedIcon /></div>, color: 'var(--danger-red)' };
        case 'quest_cleared': return { icon: <div style={{...iconStyle, color: 'var(--ion-blue)'}}><QuestClearedIcon /></div>, color: 'var(--ion-blue)' };
        case 'clan_create': return { icon: <div style={{...iconStyle, color: 'var(--ion-blue)'}}><QuestClearedIcon /></div>, color: 'var(--ion-blue)' };
        case 'purchase': return { icon: <div style={{...iconStyle, color: 'var(--success-teal)'}}><PurchaseIcon /></div>, color: 'var(--success-teal)' };
        case 'achievement_earned': return { icon: <div style={{...iconStyle, color: '#fbbf24'}}><TrophyIcon className="w-6 h-6" /></div>, color: '#fbbf24' };
        default: return { icon: null, color: 'var(--mist-400)'};
    }
};

const normalizeDisplayName = (name: string | undefined, fallback: string) => {
    const trimmedName = name?.trim();
    if (!trimmedName || trimmedName.toUpperCase() === 'UNKNOWN') {
        return fallback;
    }
    return trimmedName;
};

const formatEventText = (event: NewsEvent) => {
    const actorStyle = { color: 'var(--paper-50)', fontWeight: '600' };
    const actorName = normalizeDisplayName(event.actor, 'Someone');
    const targetName = normalizeDisplayName(event.target, 'a rival');
    const details = event.data.details?.trim();
    
    // Static messages - no randomization to keep feed stable
    const coinsStolen = event.data.coins_stolen;
    const coinsLost = event.data.coins_lost;

    switch (event.kind) {
        case 'pvp_win':
            return (
                <>
                    <span style={{...actorStyle, color: 'var(--success-teal)'}}>{actorName}</span> hacked{' '}
                    <span style={{...actorStyle, color: 'var(--danger-red)'}}>{targetName}</span>
                    {coinsStolen ? <> and stole <span className="font-bold" style={{color: 'var(--amber-warn)'}}>{coinsStolen} coins</span></> : (details ? `. ${details}` : '')} 💪
                </>
            );
        
        case 'pvp_blocked':
            return <><span style={{...actorStyle, color: 'var(--danger-red)'}}>{actorName}</span> tried to hack <span style={{...actorStyle, color: 'var(--success-teal)'}}>{targetName}</span> but was blocked by their shield! 🛡️</>;
        
        case 'pvp_loss':
            return <><span style={{...actorStyle, color: 'var(--danger-red)'}}>{actorName}</span> failed to hack <span style={{...actorStyle, color: 'var(--success-teal)'}}>{targetName}</span>{coinsLost ? <> and lost <span className="font-bold" style={{color: 'var(--danger-red)'}}>{coinsLost} coins</span></> : ''} 😅</>;
        
        case 'level_up':
            return <><span style={{...actorStyle, color: 'var(--amber-warn)'}}>{actorName}</span> leveled up to <span className="font-bold">{event.data.details}</span>! 🎉</>;
    case 'clan_create':
      return <><span style={{...actorStyle, color: 'var(--ion-blue)'}}>{actorName}</span> created a clan <span className="font-bold">{event.data.details}</span>. Welcome! 🛡️</>;
        
        case 'quest_cleared':
            return <><span style={{...actorStyle, color: 'var(--ion-blue)'}}>{actorName}</span> aced <span className="font-bold">"{event.data.details}"</span>! <img src="/logo.png" alt="" className="inline-block w-4 h-4" /></>;
        
        case 'purchase':
            return <><span style={{...actorStyle, color: 'var(--success-teal)'}}>{actorName}</span> bought a <span className="font-bold">{event.data.item}</span> 🛒</>;
        
        case 'weekly_claim':
            return <><span style={{...actorStyle, color: 'var(--amber-warn)'}}>{actorName}</span> claimed weekly rewards! 💰</>;
        
        case 'achievement_earned':
            return <><span style={{...actorStyle, color: '#fbbf24'}}>{actorName}</span> unlocked <span className="font-bold">{event.data.achievement_icon || '🏆'} {event.data.achievement_name}</span>! 🎉</>;
        
        default:
            return <><span style={actorStyle}>{actorName}</span> is up to something... 🤔</>;
    }
};

const EMOJIS = ['🔥', '😮', '😂', '❤️'];

const NewsFeed: React.FC<{ news: NewsEvent[] }> = ({ news }) => {
  const [localNews, setLocalNews] = useState(news);
  const [poppingReaction, setPoppingReaction] = useState<string | null>(null);

  useEffect(() => {
    setLocalNews(news);
  }, [news]);

  const handleReactionClick = async (eventId: string, emoji: string) => {
    // Optimistically update UI first
    setLocalNews(prevNews =>
      prevNews.map(event => {
        if (event.id !== eventId) {
          return event;
        }

        const newReactions = { ...event.reactions };
        const myCurrentReaction = event.my_reaction;
        let newMyReaction: string | null = emoji;

        if (myCurrentReaction === emoji) {
          // Toggle off
          newReactions[emoji] = Math.max(0, newReactions[emoji] - 1);
          newMyReaction = null;
        } else {
          // If there was a previous reaction, decrement it
          if (myCurrentReaction) {
            newReactions[myCurrentReaction] = Math.max(0, newReactions[myCurrentReaction] - 1);
          }
          // Increment the new one
          newReactions[emoji] += 1;
          
          // Trigger pop animation
          setPoppingReaction(`${eventId}-${emoji}`);
          setTimeout(() => setPoppingReaction(null), 300);
        }

        return {
          ...event,
          reactions: newReactions,
          my_reaction: newMyReaction,
        };
      })
    );
    
    // Save to database
    try {
      await activity_reaction_toggle(eventId, emoji);
    } catch (error) {
      console.error('Failed to save reaction:', error);
    }
  };

  return (
    <div className="card-glass p-4 h-full">
      <h3 className="font-heading text-lg text-gray-300 mb-4">Activity Feed</h3>
      <ul className="space-y-3 max-h-[500px] lg:max-h-[calc(100%-2rem)] overflow-y-auto pr-2">
        {localNews.map(event => {
          const { icon, color } = getEventIconAndColor(event.kind);
          return (
            <li key={event.id} className="bg-black/20 rounded-lg p-3 relative overflow-hidden">
              <div className="absolute left-0 top-0 bottom-0 w-1.5" style={{ backgroundColor: color, filter: `blur(2px)` }}></div>
              <div className="flex items-start space-x-3">
                <div className="flex-shrink-0 pt-1 pl-2">{icon}</div>
                <div className="flex-grow">
                    <p className="text-sm text-gray-300 leading-tight">{formatEventText(event)}</p>
                    <p className="text-xs" style={{color: 'var(--mist-400)'}}>{event.created_at}</p>
                    <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                      {EMOJIS.map(emoji => {
                        const count = event.reactions[emoji] || 0;
                        const isActive = event.my_reaction === emoji;
                        const isPopping = poppingReaction === `${event.id}-${emoji}`;
                        return (
                          <button
                            key={emoji}
                            onClick={() => handleReactionClick(event.id, emoji)}
                            className={`flex items-center gap-1 px-2 py-1 rounded-full transition-all duration-200 border min-w-[3rem] ${
                              isActive
                                ? 'bg-blue-500/30 border-blue-400'
                                : 'bg-black/30 hover:bg-black/50 border-gray-600 hover:border-gray-500'
                            }`}
                          >
                            <span className="text-sm leading-none">{emoji}</span>
                            <span
                              className={`font-mono text-xs font-bold leading-none ${isPopping ? 'animate-pop' : ''} ${
                                isActive ? 'text-white' : count > 0 ? 'text-gray-200' : 'text-gray-400'
                              }`}
                            >
                              {count}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
};

export default NewsFeed;
