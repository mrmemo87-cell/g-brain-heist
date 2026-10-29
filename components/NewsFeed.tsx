import React, { useEffect, useRef, useState } from 'react';
import { NewsEvent } from '../types';
import { activity_reaction_toggle } from '../services/gameService';
import { announcePushMoment } from '../src/lib/pushMoment';

const EMOJIS = ['🔥', '😮', '😂', '❤️'] as const;

/** Moments worth celebrating get the glowing card treatment. */
const CELEBRATION_KINDS = new Set<NewsEvent['kind']>(['level_up', 'achievement_earned', 'streak_milestone']);

/** Posts younger than this play their entrance celebration (sparkles) once. */
const FRESH_MS = 6 * 60 * 60 * 1000;

type Tone = 'gold' | 'flame' | 'teal' | 'blue' | 'rose' | 'slate';

const KIND_STYLE: Record<string, { badge: string; tone: Tone }> = {
  level_up: { badge: '⭐', tone: 'gold' },
  achievement_earned: { badge: '🏆', tone: 'gold' },
  streak_milestone: { badge: '🔥', tone: 'flame' },
  pvp_win: { badge: '⚔️', tone: 'teal' },
  pvp_loss: { badge: '💥', tone: 'rose' },
  pvp_blocked: { badge: '🛡️', tone: 'slate' },
  clan_create: { badge: '🛡️', tone: 'blue' },
  clan_joined: { badge: '🤝', tone: 'blue' },
  quest_cleared: { badge: '🎯', tone: 'blue' },
  purchase: { badge: '🛒', tone: 'teal' },
  weekly_claim: { badge: '💰', tone: 'gold' },
};

const normalizeDisplayName = (name: string | undefined, fallback: string) => {
  const trimmedName = name?.trim();
  if (!trimmedName || trimmedName.toUpperCase() === 'UNKNOWN') return fallback;
  return trimmedName;
};

const parseCoinAmountFromDetails = (details?: string) => {
  if (!details) return undefined;
  const match = details.match(/(lost|stole)\s+(\d+)/i);
  if (!match) return undefined;
  const parsed = Number(match[2]);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const firstDefinedNumber = (...values: Array<number | undefined>) => {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
  }
  return undefined;
};

const Name: React.FC<{ children: React.ReactNode; tone?: Tone }> = ({ children, tone }) => (
  <span className={`feed-name ${tone ? `feed-name--${tone}` : ''}`}>{children}</span>
);

const formatEventText = (event: NewsEvent) => {
  const actorName = normalizeDisplayName(event.actor, 'Someone');
  const data = event.data as NewsEvent['data'] & Record<string, any>;
  const targetName = normalizeDisplayName(event.target || data?.target_username || data?.defender_username, 'a rival');
  const details = data.details?.trim();
  const coinsStolen = firstDefinedNumber(data.coins_stolen, data.coins_stolen_from_def, parseCoinAmountFromDetails(details));
  const coinsLost = firstDefinedNumber(data.coins_lost, data.coins_lost_to_def, parseCoinAmountFromDetails(details));

  switch (event.kind) {
    case 'level_up': {
      const level = data.level ?? details?.replace(/^Level\s+/i, '');
      return <><Name tone="gold">{actorName}</Name> reached <strong className="feed-highlight feed-highlight--gold">Level {level}</strong>!</>;
    }
    case 'achievement_earned':
      return <><Name tone="gold">{actorName}</Name> unlocked <strong className="feed-highlight feed-highlight--gold">{data.achievement_icon ? `${data.achievement_icon} ` : ''}{data.achievement_name}</strong></>;
    case 'streak_milestone':
      return <><Name tone="flame">{actorName}</Name> is on a <strong className="feed-highlight feed-highlight--flame">{data.streak ?? details}-day streak</strong> — keep it going!</>;
    case 'pvp_win':
      return (
        <>
          <Name tone="teal">{actorName}</Name> beat <Name>{targetName}</Name>
          {typeof coinsStolen === 'number' && coinsStolen > 0 ? <> and grabbed <strong className="feed-coins">{coinsStolen} coins</strong></> : null}
        </>
      );
    case 'pvp_blocked':
      return <><Name>{actorName}</Name> tried to attack <Name tone="teal">{targetName}</Name>, but their shield held</>;
    case 'pvp_loss':
      return (
        <>
          <Name>{actorName}</Name> challenged <Name tone="teal">{targetName}</Name>, but {targetName} defended
          {typeof coinsLost === 'number' && coinsLost > 0 ? <> and won <strong className="feed-coins">{coinsLost} coins</strong></> : null}
        </>
      );
    case 'clan_create':
      return <><Name tone="blue">{actorName}</Name> started a new clan, <strong>{details}</strong></>;
    case 'clan_joined':
      return <><Name tone="blue">{actorName}</Name> joined <strong>{details || 'a clan'}</strong> — welcome!</>;
    case 'quest_cleared':
      return <><Name tone="blue">{actorName}</Name> aced <strong>“{details}”</strong></>;
    case 'purchase':
      return <><Name tone="teal">{actorName}</Name> bought a <strong>{data.item}</strong></>;
    case 'weekly_claim':
      return <><Name tone="gold">{actorName}</Name> claimed weekly rewards</>;
    default:
      return <><Name>{actorName}</Name> did something cool</>;
  }
};

const initialsOf = (name: string) =>
  name.trim().split(/\s+|_/).filter(Boolean).slice(0, 2).map(part => part[0]?.toUpperCase() ?? '').join('') || '?';

const Avatar: React.FC<{ name: string; src?: string | null; badge: string; tone: Tone; celebrate: boolean }> = ({ name, src, badge, tone, celebrate }) => {
  const [failed, setFailed] = useState(false);
  return (
    <div className={`feed-avatar feed-avatar--${tone} ${celebrate ? 'is-celebration' : ''}`}>
      {src && !failed
        ? <img src={src} alt="" loading="lazy" decoding="async" onError={() => setFailed(true)} />
        : <span className="feed-avatar__initials" aria-hidden="true">{initialsOf(name)}</span>}
      <span className={`feed-avatar__badge ${tone === 'flame' ? 'is-flame' : ''}`} aria-hidden="true">{badge}</span>
    </div>
  );
};

const reactorsLine = (reactors: NonNullable<NewsEvent['reactors']>) => {
  if (reactors.length === 0) return null;
  const names = reactors.slice(0, 2).map(r => (r.is_self ? 'You' : r.name));
  const others = reactors.length - names.length;
  const emojis = Array.from(new Set(reactors.map(r => r.emoji))).slice(0, 3).join('');
  const who = others > 0
    ? `${names.join(', ')} and ${others} other${others === 1 ? '' : 's'}`
    : names.join(' and ');
  return `${emojis} ${who}`;
};

interface FloatingEmoji {
  key: number;
  emoji: string;
  postId: string;
}

const NewsFeed: React.FC<{ news: NewsEvent[] }> = ({ news }) => {
  const [localNews, setLocalNews] = useState(news);
  const [poppingReaction, setPoppingReaction] = useState<string | null>(null);
  const [floaters, setFloaters] = useState<FloatingEmoji[]>([]);
  const floaterKey = useRef(0);

  useEffect(() => {
    setLocalNews(news);
  }, [news]);

  const handleReactionClick = async (eventId: string, emoji: string) => {
    let added = false;
    setLocalNews(prevNews =>
      prevNews.map(event => {
        if (event.id !== eventId) return event;

        const newReactions = { ...event.reactions };
        const myCurrentReaction = event.my_reaction;
        let newMyReaction: string | null = emoji;
        let reactors = [...(event.reactors ?? [])].filter(r => !r.is_self);

        if (myCurrentReaction === emoji) {
          newReactions[emoji] = Math.max(0, (newReactions[emoji] || 0) - 1);
          newMyReaction = null;
        } else {
          if (myCurrentReaction) {
            newReactions[myCurrentReaction] = Math.max(0, (newReactions[myCurrentReaction] || 0) - 1);
          }
          newReactions[emoji] = (newReactions[emoji] || 0) + 1;
          reactors = [{ name: 'You', emoji, is_self: true }, ...reactors];
          added = true;
        }

        return { ...event, reactions: newReactions, my_reaction: newMyReaction, reactors };
      }),
    );

    if (added) {
      setPoppingReaction(`${eventId}-${emoji}`);
      window.setTimeout(() => setPoppingReaction(null), 320);
      const key = ++floaterKey.current;
      setFloaters(prev => [...prev, { key, emoji, postId: eventId }]);
      window.setTimeout(() => setFloaters(prev => prev.filter(f => f.key !== key)), 900);
      try {
        navigator.vibrate?.(12);
      } catch {
        /* optional */
      }
      announcePushMoment('reaction');
    }

    try {
      await activity_reaction_toggle(eventId, emoji);
    } catch (error) {
      console.error('Failed to save reaction:', error);
    }
  };

  const now = Date.now();

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
        {localNews.map((event, index) => {
          const style = KIND_STYLE[event.kind] ?? { badge: '✨', tone: 'slate' as Tone };
          const celebrate = CELEBRATION_KINDS.has(event.kind);
          const fresh = celebrate && typeof event.created_at_ms === 'number' && now - event.created_at_ms < FRESH_MS;
          const reactors = event.reactors ?? [];
          const line = reactorsLine(reactors);
          const actorName = normalizeDisplayName(event.actor, 'Someone');

          return (
            <li
              key={event.id}
              className={`student-activity-item feed-item feed-item--${style.tone} ${celebrate ? 'is-celebration' : ''} ${fresh ? 'is-fresh' : ''}`}
              style={{ '--feed-delay': `${Math.min(index, 8) * 55}ms` } as React.CSSProperties}
            >
              {celebrate && <span className="feed-item__shimmer" aria-hidden="true" />}
              {fresh && (
                <span className="feed-item__sparkles" aria-hidden="true">
                  <i>✨</i><i>⭐</i><i>✨</i>
                </span>
              )}
              <div className="student-activity-item__layout">
                <Avatar name={actorName} src={event.actor_avatar} badge={style.badge} tone={style.tone} celebrate={celebrate} />
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
                          onClick={() => void handleReactionClick(event.id, emoji)}
                          aria-label={`${isActive ? 'Remove' : 'Add'} ${emoji} reaction${count > 0 ? `, ${count} total` : ''}`}
                          aria-pressed={isActive}
                          className={`student-reaction-button feed-reaction ${isActive ? 'is-active' : ''} ${count > 0 ? 'has-count' : ''} ${isPopping ? 'is-popping' : ''}`}
                        >
                          <span aria-hidden className="feed-reaction__emoji">{emoji}</span>
                          {count > 0 && <span className="feed-reaction__count">{count}</span>}
                          {floaters.filter(f => f.postId === event.id && f.emoji === emoji).map(f => (
                            <span key={f.key} className="feed-reaction__float" aria-hidden="true">{f.emoji}</span>
                          ))}
                        </button>
                      );
                    })}
                  </div>
                  {line && <p className="feed-reactors">{line}</p>}
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
