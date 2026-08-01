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

const parseCoinAmountFromDetails = (details?: string) => {
  if (!details) {
    return undefined;
  }

  const match = details.match(/(lost|stole)\s+(\d+)/i);
  if (!match) {
    return undefined;
  }

  const parsed = Number(match[2]);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const firstDefinedNumber = (...values: Array<number | undefined>) => {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
  }
  return undefined;
};

const formatEventText = (event: NewsEvent) => {
    const actorStyle = { color: 'var(--paper-50)', fontWeight: '600' };
    const actorName = normalizeDisplayName(event.actor, 'Someone');
  const targetFromData = (event.data as any)?.target_username || (event.data as any)?.defender_username;
  const targetName = normalizeDisplayName(event.target || targetFromData, 'a rival');
    const details = event.data.details?.trim();
    
    // Static messages - no randomization to keep feed stable
  const parsedCoinAmount = parseCoinAmountFromDetails(details);
  const coinsStolen = firstDefinedNumber((event.data as any).coins_stolen, (event.data as any).coins_stolen_from_def, parsedCoinAmount);
  const coinsLost = firstDefinedNumber((event.data as any).coins_lost, (event.data as any).coins_lost_to_def, parsedCoinAmount);

    switch (event.kind) {
        case 'pvp_win':
            return (
                <>
                    <span style={{...actorStyle, color: 'var(--success-teal)'}}>{actorName}</span> attacked{' '}
                    <span style={{...actorStyle, color: 'var(--danger-red)'}}>{targetName}</span>
              {typeof coinsStolen === 'number' ? <> and stole <span className="font-bold" style={{color: 'var(--amber-warn)'}}>{coinsStolen} coins</span></> : (details ? `. ${details}` : '')} 💪
                </>
            );
        
        case 'pvp_blocked':
            return <><span style={{...actorStyle, color: 'var(--danger-red)'}}>{actorName}</span> tried to attack <span style={{...actorStyle, color: 'var(--success-teal)'}}>{targetName}</span> but was blocked by their shield! 🛡️</>;
        
        case 'pvp_loss':
          return <><span style={{...actorStyle, color: 'var(--danger-red)'}}>{actorName}</span> failed to attack <span style={{...actorStyle, color: 'var(--success-teal)'}}>{targetName}</span>{typeof coinsLost === 'number' ? <> and lost <span className="font-bold" style={{color: 'var(--danger-red)'}}>{coinsLost} coins</span></> : ''} 😅</>;
        
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
    <section className="student-activity-feed" aria-labelledby="student-activity-title">
      <div className="student-activity-feed__heading">
        <div>
          <p>Community</p>
          <h3 id="student-activity-title">Activity feed</h3>
        </div>
        <span>{localNews.length} update{localNews.length === 1 ? '' : 's'}</span>
      </div>
      <ul className="student-activity-feed__list">
        {localNews.map(event => {
          const { icon, color } = getEventIconAndColor(event.kind);
          return (
            <li key={event.id} className="student-activity-item">
              <div className="student-activity-item__accent" style={{ backgroundColor: color }}></div>
              <div className="student-activity-item__layout">
                <div className="student-activity-item__icon">{icon || <span aria-hidden>•</span>}</div>
                <div className="student-activity-item__content">
                    <p>{formatEventText(event)}</p>
                    <time>{event.created_at}</time>
                    <div className="student-activity-item__reactions" aria-label="React to this update">
                      {EMOJIS.map(emoji => {
                        const count = event.reactions[emoji] || 0;
                        const isActive = event.my_reaction === emoji;
                        const isPopping = poppingReaction === `${event.id}-${emoji}`;
                        return (
                          <button
                            key={emoji}
                            type="button"
                            onClick={() => handleReactionClick(event.id, emoji)}
                            aria-label={`${isActive ? 'Remove' : 'Add'} ${emoji} reaction${count > 0 ? `, ${count} total` : ''}`}
                            aria-pressed={isActive}
                            className={`student-reaction-button ${
                              isActive
                                ? 'is-active'
                                : ''
                            }`}
                          >
                            <span aria-hidden>{emoji}</span>
                            <span
                              className={`${isPopping ? 'animate-pop' : ''}`}
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
    </section>
  );
};

export default NewsFeed;
