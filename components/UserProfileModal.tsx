import React, { useState, useEffect } from 'react';
import { Profile } from '../types';
import { APIcon, CoinIcon, GemIcon, ShieldIcon, StreakIcon, XPIcon, BrainIcon, TrophyIcon } from './icons';
import { supabase } from '../services/supabaseClient';

interface UserAchievement {
  achievement_id: string;
  name: string;
  description: string;
  icon: string;
  category: string;
  rarity: string;
  earned_at: string;
}

interface UserProfileModalProps {
  profile: Profile;
  apValue?: number;
  onClose: () => void;
}

const RARITY_STYLES: Record<string, { border: string; bg: string; glow: string; text: string }> = {
  common: { border: 'border-slate-500', bg: 'bg-slate-800', glow: '', text: 'text-slate-300' },
  rare: { border: 'border-blue-400', bg: 'bg-blue-900/50', glow: 'shadow-blue-500/30', text: 'text-blue-300' },
  epic: { border: 'border-purple-400', bg: 'bg-purple-900/50', glow: 'shadow-purple-500/30', text: 'text-purple-300' },
  legendary: { border: 'border-amber-400', bg: 'bg-amber-900/50', glow: 'shadow-amber-500/30', text: 'text-amber-300' },
};

const StatPill: React.FC<{ label: string; value: string | number; icon?: React.ReactNode }> = ({ label, value, icon }) => (
  <div className="flex items-center gap-2 rounded-xl border border-slate-800/60 bg-slate-900/60 px-3 py-2 shadow-inner shadow-slate-950/30">
    {icon && <div className="text-cyan-300">{icon}</div>}
    <div className="flex flex-col leading-tight">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</span>
      <span className="font-mono text-sm font-bold text-white">{value}</span>
    </div>
  </div>
);

const AchievementBadge: React.FC<{ achievement: UserAchievement }> = ({ achievement }) => {
  const style = RARITY_STYLES[achievement.rarity] || RARITY_STYLES.common;
  return (
    <div 
      className={`flex items-center gap-2 rounded-lg border ${style.border} ${style.bg} px-2 py-1.5 shadow-md ${style.glow} transition hover:scale-105 cursor-default`}
      title={`${achievement.name}\n${achievement.description}`}
    >
      <span className="text-lg">{achievement.icon}</span>
      <span className={`text-xs font-medium truncate max-w-[80px] ${style.text}`}>{achievement.name}</span>
    </div>
  );
};

const UserProfileModal: React.FC<UserProfileModalProps> = ({ profile, apValue, onClose }) => {
  const [achievements, setAchievements] = useState<UserAchievement[]>([]);
  const [totalEarned, setTotalEarned] = useState(0);
  const [loadingAchievements, setLoadingAchievements] = useState(true);

  const isStaff = profile.role === 'teacher' || profile.role === 'admin';
  const clanLine = profile.clan_name
    ? `${profile.clan_name}${profile.clan_role ? ` · ${profile.clan_role}` : ''}`
    : 'No clan yet';
  const bioText = profile.bio?.trim() || 'Add a short bio from Settings to let others know more about you.';
  const roleLabel = profile.role === 'admin' ? 'Admin' : profile.role === 'teacher' ? 'Teacher' : `Level ${profile.level}`;

  useEffect(() => {
    const fetchAchievements = async () => {
      try {
        // Fetch user's earned achievements with join to get details
        const { data, error } = await supabase
          .from('user_achievements')
          .select(`
            achievement_id,
            earned_at,
            unlocked_at,
            achievements!inner (
              id,
              name,
              description,
              icon,
              category,
              rarity
            )
          `)
          .eq('user_id', profile.id)
          .not('earned_at', 'is', null)
          .order('earned_at', { ascending: false });

        if (error) {
          // Fallback: try without inner join in case of schema issues
          const { data: fallbackData } = await supabase
            .from('user_achievements')
            .select('achievement_id, earned_at, unlocked_at')
            .eq('user_id', profile.id)
            .not('earned_at', 'is', null);
          
          setTotalEarned(fallbackData?.length || 0);
          setAchievements([]);
        } else {
          const mapped = (data || []).map((row: any) => ({
            achievement_id: row.achievement_id,
            name: row.achievements?.name || row.achievement_id,
            description: row.achievements?.description || '',
            icon: row.achievements?.icon || '🏆',
            category: row.achievements?.category || 'general',
            rarity: row.achievements?.rarity || 'common',
            earned_at: row.earned_at || row.unlocked_at,
          }));
          setAchievements(mapped.slice(0, 6)); // Show top 6 most recent
          setTotalEarned(mapped.length);
        }
      } catch (err) {
        console.error('[UserProfileModal] Failed to fetch achievements:', err);
      } finally {
        setLoadingAchievements(false);
      }
    };

    if (!isStaff) {
      fetchAchievements();
    } else {
      setLoadingAchievements(false);
    }
  }, [profile.id, isStaff]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
      <div className="relative w-full max-w-xl rounded-3xl border border-slate-800 bg-slate-900/90 shadow-2xl shadow-cyan-900/40 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 z-20 flex items-start justify-between border-b border-slate-800 bg-slate-900/95 px-5 py-4 backdrop-blur">
          <div className="flex items-center gap-4">
            <div className={`relative h-14 w-14 overflow-hidden rounded-full border-2 ${profile.active_cosmetic_frame === 'neon' ? 'neon-frame neon-frame-sm' : 'border-pink-400/60'}`}>
              <img src={profile.avatar_url} alt={profile.username} className="h-full w-full object-cover" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">{profile.username}</h3>
              <p className="text-xs uppercase tracking-wide text-cyan-300">{roleLabel}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-600 bg-slate-900 text-lg font-semibold text-white shadow-sm transition hover:border-cyan-400 hover:text-cyan-200"
            aria-label="Close profile"
          >
            ✕
          </button>
        </div>

        <div className="grid gap-4 px-5 py-4">
          {/* Only show game stats for students */}
          {!isStaff && (
            <div className="grid grid-cols-2 gap-3">
              <StatPill
                label="Coins"
                value={profile.coins.toLocaleString()}
                icon={<CoinIcon className="h-5 w-5 text-yellow-300 drop-shadow-[0_0_6px_rgba(234,179,8,0.6)]" />}
              />
              <StatPill
                label="XP"
                value={(profile.xp_status?.xp ?? profile.xp).toLocaleString()}
                icon={<XPIcon className="h-5 w-5 text-cyan-300 drop-shadow-[0_0_6px_rgba(34,211,238,0.6)]" />}
              />
              <StatPill
                label="Gemstones"
                value={profile.gemstones.toLocaleString()}
                icon={<GemIcon className="h-5 w-5 text-rose-300 drop-shadow-[0_0_6px_rgba(244,114,182,0.6)]" />}
              />
              <StatPill
                label="AP"
                value={`${apValue ?? profile.ap_now}/${profile.ap_max}`}
                icon={<APIcon className="h-5 w-5 text-emerald-300 drop-shadow-[0_0_6px_rgba(16,185,129,0.6)]" />}
              />
              <StatPill
                label="Streak"
                value={`${profile.streak || 0} days`}
                icon={<StreakIcon className="h-5 w-5 text-orange-300 drop-shadow-[0_0_6px_rgba(251,146,60,0.6)]" />}
              />
              <StatPill
                label="PvP Score"
                value={profile.pvp_score}
                icon={<BrainIcon className="h-5 w-5 text-indigo-300 drop-shadow-[0_0_6px_rgba(165,180,252,0.6)]" />}
              />
              <StatPill
                label="Attack"
                value={profile.attack_power}
                icon={<BrainIcon className="h-5 w-5 text-pink-300 drop-shadow-[0_0_6px_rgba(244,114,182,0.6)]" />}
              />
              <StatPill
                label="Defense"
                value={profile.defense_power}
                icon={<ShieldIcon className="h-5 w-5 text-blue-300 drop-shadow-[0_0_6px_rgba(96,165,250,0.6)]" />}
              />
            </div>
          )}

          {/* Achievements Section - Only for students */}
          {!isStaff && (
            <div className="rounded-2xl border border-slate-800 bg-gradient-to-br from-slate-950/80 to-slate-900/60 p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <TrophyIcon className="h-5 w-5 text-amber-400" />
                  <h4 className="text-sm font-semibold uppercase tracking-wide text-slate-300">Achievements</h4>
                </div>
                {totalEarned > 0 && (
                  <span className="rounded-full bg-amber-500/20 px-2.5 py-0.5 text-xs font-bold text-amber-300">
                    {totalEarned} Earned
                  </span>
                )}
              </div>
              
              {loadingAchievements ? (
                <div className="flex items-center justify-center py-4">
                  <div className="animate-spin rounded-full h-6 w-6 border-2 border-cyan-400 border-t-transparent" />
                </div>
              ) : achievements.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {achievements.map((ach) => (
                    <AchievementBadge key={ach.achievement_id} achievement={ach} />
                  ))}
                  {totalEarned > 6 && (
                    <div className="flex items-center gap-1 rounded-lg border border-slate-600 bg-slate-800/50 px-2 py-1.5 text-xs text-slate-400">
                      +{totalEarned - 6} more
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-sm text-slate-500 italic">No achievements earned yet</p>
              )}
            </div>
          )}

          {/* Bio */}
          <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
            <h4 className="text-sm font-semibold uppercase tracking-wide text-slate-300">Bio</h4>
            <p className="mt-1 text-sm text-slate-200">{bioText}</p>
          </div>

          {/* Only show clan for students */}
          {!isStaff && (
            <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4 flex items-center justify-between">
              <div>
                <h4 className="text-sm font-semibold uppercase tracking-wide text-slate-300">Clan</h4>
                <p className="mt-1 text-sm text-slate-200">{clanLine}</p>
              </div>
              {profile.clan_name && <span className="rounded-full bg-cyan-500/10 px-3 py-1 text-xs font-semibold text-cyan-200">Active</span>}
            </div>
          )}

          {/* Show school info for teachers/admins */}
          {isStaff && profile.school_name && (
            <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4 flex items-center gap-3">
              {profile.school_logo_url && (
                <img src={profile.school_logo_url} alt={profile.school_name} className="h-10 w-10 rounded-lg object-contain" />
              )}
              <div>
                <h4 className="text-sm font-semibold uppercase tracking-wide text-slate-300">School</h4>
                <p className="mt-1 text-sm text-slate-200">{profile.school_name}</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default UserProfileModal;
