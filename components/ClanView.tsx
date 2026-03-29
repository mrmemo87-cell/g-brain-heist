import React, { useState, useEffect, useRef, useLayoutEffect } from 'react';
import { Clan, ClanChatMessage, Profile, ToastMessage, ClanSummary, ClanBuff, ClanMember, ActiveClanBuff, ClanJoinRequest } from '../types';
import * as GameService from '../services/gameService';
import { supabase } from '../services/supabaseClient';
import BackButton from './BackButton';
import { SyndicateRune, CoinIcon, DemoteIcon, KickIcon, LeaveIcon, ManageIcon, PromoteIcon } from './icons';
import AvatarWithFrame from './AvatarWithFrame';
import ClickableUsername from './ClickableUsername';
import BrainsMasterBadge from './BrainsMasterBadge';
import { neonIcon } from './visualAssets';

type ClanViewStage = 'loading' | 'no_clan' | 'in_clan' | 'creating' | 'joining';
type ClanTab = 'home' | 'chat' | 'management' | 'browse';
type ModalType = null | 'deposit' | 'confirm_leave' | 'confirm_delete' | 'confirm_kick' | 'view_members';

// Internal UX investigation report:
// - Clans list/chat UI lives in components/ClanView.tsx (JoinClanView, BrowseClansTab, ClanChat).
// - Data layer uses GameService.clan_list() (RPC get_school_clan_leaderboard + clans metadata),
//   GameService.clan_details(), and chat helpers GameService.clan_chat_recent/clan_chat_post
//   with Supabase realtime inserts on clan_chat.
// - Scroll resets were caused by list/chat containers remounting during refresh/loading, and chat
//   forcing scroll-to-bottom on every message update.

interface ClanViewProps {
  profile: Profile;
  onComplete: () => void;
  onUpdateProfile: React.Dispatch<React.SetStateAction<Profile | null>>;
  addToast: (message: string, type: ToastMessage['type']) => void;
  onPendingCountChange?: (count: number) => void;
  onChatUnreadCountChange?: (count: number) => void;
  initialChatUnreadCount?: number;
}

const ConfirmationModal: React.FC<{ title: string, message: string, confirmText: string, onConfirm: () => void, onCancel: () => void }> = 
({ title, message, confirmText, onConfirm, onCancel }) => (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50">
        <div className="card-glass w-full max-w-md m-4 p-6 border-2 border-danger-red">
            <h2 className="font-heading text-2xl text-center mb-2 text-danger-red">{title}</h2>
            <p className="text-center text-gray-300 mb-6">{message}</p>
            <div className="flex space-x-4 mt-8">
                <button onClick={onCancel} className="w-full font-heading py-3 rounded-xl bg-gray-600/50 hover:bg-gray-500/50 border border-gray-500">Cancel</button>
                <button onClick={onConfirm} className="w-full font-heading py-3 rounded-xl bg-red-500/20 hover:bg-red-500/30 border border-red-400 text-white">
                    {confirmText}
                </button>
            </div>
        </div>
    </div>
);

const StatCard: React.FC<{ label: string; value: string | number; accent?: string; subtitle?: string }> = ({ label, value, accent = 'var(--amber-warn)', subtitle }) => (
    <div className="bg-black/30 rounded-2xl p-4 border border-white/5">
        <p className="text-xs uppercase tracking-wide text-gray-400">{label}</p>
        <p className="text-2xl font-heading" style={{ color: accent }}>{value}</p>
        {subtitle && <p className="text-xs text-gray-400 mt-1">{subtitle}</p>}
    </div>
);

const describeBuffEffect = (effect: ClanBuff['effect'] = {}): string => {
    const parts: string[] = [];
    if (effect.xp_multiplier && effect.xp_multiplier !== 1) {
        const boost = Math.round((effect.xp_multiplier - 1) * 100);
        parts.push(`XP +${boost}%`);
    }
    if (effect.attack_multiplier && effect.attack_multiplier !== 1) {
        const boost = Math.round((effect.attack_multiplier - 1) * 100);
        parts.push(`Attack +${boost}%`);
    }
    if (effect.defense_multiplier && effect.defense_multiplier !== 1) {
        const boost = Math.round((effect.defense_multiplier - 1) * 100);
        parts.push(`Defense +${boost}%`);
    }
    if (effect.shield_bonus_percent) {
        parts.push(`Shield +${effect.shield_bonus_percent}%`);
    }
    if (effect.ap_bonus) {
        parts.push(`AP +${effect.ap_bonus}`);
    }
    return parts.length ? parts.join(' • ') : 'Passive effect active';
};

const formatExpiresIn = (expiresAt?: string | null): string => {
    if (!expiresAt) return 'Unknown expiry';
    const expiry = new Date(expiresAt).getTime();
    const now = Date.now();
    const diffMinutes = Math.max(0, Math.round((expiry - now) / (1000 * 60)));
    if (diffMinutes <= 0) return 'Expiring soon';
    const hours = Math.floor(diffMinutes / 60);
    const minutes = diffMinutes % 60;
    if (hours === 0) {
        return `${minutes}m left`;
    }
    if (hours < 24) {
        return `${hours}h ${minutes}m left`;
    }
    const days = Math.floor(hours / 24);
    return `${days}d ${(hours % 24)}h left`;
};

const getClanLevel = (memberLimit: number, extraSlots: number): number => {
    const inferred = Math.max(0, memberLimit - 5);
    const purchased = Math.max(0, extraSlots);
    return Math.min(MAX_CLAN_LEVEL, Math.max(1, 1 + Math.max(inferred, purchased)));
};

const getClanLevelTheme = (level: number): { badge: string; panel: string; glow: string } => {
    if (level >= 6) {
        return {
            badge: 'bg-gradient-to-r from-fuchsia-500/80 via-purple-500/80 to-cyan-400/80 border-fuchsia-200/80 text-white',
            panel: 'from-fuchsia-500/20 via-purple-500/15 to-cyan-500/20 border-fuchsia-300/40',
            glow: 'shadow-[0_0_25px_rgba(217,70,239,0.35)]',
        };
    }
    if (level >= 4) {
        return {
            badge: 'bg-gradient-to-r from-cyan-500/80 to-blue-500/80 border-cyan-200/80 text-white',
            panel: 'from-cyan-500/20 to-blue-500/20 border-cyan-300/40',
            glow: 'shadow-[0_0_20px_rgba(34,211,238,0.30)]',
        };
    }
    if (level >= 2) {
        return {
            badge: 'bg-gradient-to-r from-amber-500/80 to-orange-500/80 border-amber-200/80 text-ink-900',
            panel: 'from-amber-500/20 to-orange-500/20 border-amber-300/40',
            glow: 'shadow-[0_0_16px_rgba(245,158,11,0.28)]',
        };
    }

    return {
        badge: 'bg-white/10 border-white/30 text-gray-100',
        panel: 'from-white/5 to-white/0 border-white/15',
        glow: '',
    };
};

const getClanLevelBenefits = (level: number): string[] => {
    const benefitTable = [
        'Recruitment unlocked and clan management controls',
        '+1 member capacity and Tactical Signals board',
        '+2 member capacity and Vanguard buff synergy',
        '+3 member capacity and elite role aura styling',
        '+4 member capacity and advanced battlefield intel feed',
        '+5 member capacity and mythic war-room visual effects',
    ];

    return benefitTable.slice(0, Math.min(level, benefitTable.length));
};

const MAX_CLAN_LEVEL = 6;

const combineClanBuffEffects = (buffs: ActiveClanBuff[]) => {
    return buffs.reduce<NonNullable<Profile['clan_buff_effects']>>((acc, buff) => {
        const effect = buff.effect || {};
        if (effect.xp_multiplier != null) {
            acc.xp_multiplier = (acc.xp_multiplier ?? 1) * effect.xp_multiplier;
        }
        if (effect.attack_multiplier != null) {
            acc.attack_multiplier = (acc.attack_multiplier ?? 1) * effect.attack_multiplier;
        }
        if (effect.defense_multiplier != null) {
            acc.defense_multiplier = (acc.defense_multiplier ?? 1) * effect.defense_multiplier;
        }
        if (effect.shield_bonus_percent != null) {
            acc.shield_bonus_percent = (acc.shield_bonus_percent ?? 0) + effect.shield_bonus_percent;
        }
        if (effect.ap_bonus != null) {
            acc.ap_bonus = (acc.ap_bonus ?? 0) + effect.ap_bonus;
        }
        return acc;
    }, {});
};

const getClanUpgradeConditions = (clan: Clan | null, isPrivileged: boolean): { canUpgrade: boolean; reasons: string[]; nextCost: number; nextLevel: number } => {
    const currentLevel = clan ? getClanLevel(clan.member_limit, clan.extra_member_slots_purchased) : 1;
    const nextLevel = Math.min(MAX_CLAN_LEVEL, currentLevel + 1);
    const extraSlots = clan?.extra_member_slots_purchased ?? Math.max(0, (clan?.member_limit ?? 5) - 5);
    const nextCost = 10000 * (extraSlots + 1);
    const reasons: string[] = [];

    if (!isPrivileged) {
        reasons.push('Leader or moderator role required');
    }

    if (currentLevel >= MAX_CLAN_LEVEL) {
        reasons.push(`Max level reached (Lv.${MAX_CLAN_LEVEL})`);
    }

    if ((clan?.vault_coins ?? 0) < nextCost) {
        const needed = nextCost - (clan?.vault_coins ?? 0);
        reasons.push(`Need ${needed.toLocaleString()} more vault coins`);
    }

    return {
        canUpgrade: reasons.length === 0,
        reasons,
        nextCost,
        nextLevel,
    };
};


const ClanView: React.FC<ClanViewProps> = ({ profile, onComplete, onUpdateProfile, addToast, onPendingCountChange, onChatUnreadCountChange, initialChatUnreadCount = 0 }) => {
  const [stage, setStage] = useState<ClanViewStage>('loading');
  const [clan, setClan] = useState<Clan | null>(null);
  const [activeTab, setActiveTab] = useState<ClanTab>('home');
  const [availableBuffs, setAvailableBuffs] = useState<ClanBuff[]>([]);
  const [buffLoadError, setBuffLoadError] = useState<string | null>(null);
  const [isLoadingBuffs, setIsLoadingBuffs] = useState(false);
  const [depositAmount, setDepositAmount] = useState('');
  const [modal, setModal] = useState<ModalType>(null);
  const [memberToKick, setMemberToKick] = useState<ClanMember | null>(null);
    const [memberModalState, setMemberModalState] = useState<{ clanId: string; clanName: string; notice?: string; members: ClanMember[] } | null>(null);
    const [isMemberModalLoading, setIsMemberModalLoading] = useState(false);
    const [memberModalError, setMemberModalError] = useState<string | null>(null);
        const [noticeDraft, setNoticeDraft] = useState('');
        const [isEditingNotice, setIsEditingNotice] = useState(false);
        const [isSavingNotice, setIsSavingNotice] = useState(false);
  // Browse clans state lifted to parent to prevent re-fetching on tab switch
  const [browseClansList, setBrowseClansList] = useState<ClanSummary[]>([]);
  const [browseClansFetched, setBrowseClansFetched] = useState(false);
  const [isBrowseClansLoading, setIsBrowseClansLoading] = useState(false);
  const [pendingJoinRequest, setPendingJoinRequest] = useState<ClanJoinRequest | null>(null);
  const [pendingApprovals, setPendingApprovals] = useState<ClanJoinRequest[]>([]);
  const [unreadChatCount, setUnreadChatCount] = useState(initialChatUnreadCount);
  const [isLoadingRequests, setIsLoadingRequests] = useState(false);
  const [processingRequestId, setProcessingRequestId] = useState<string | null>(null);
  const [isCancelingRequest, setIsCancelingRequest] = useState(false);
  const [capacityUpgradePrompt, setCapacityUpgradePrompt] = useState<{ message: string; requestId: string } | null>(null);
  const [isUpgradingCapacity, setIsUpgradingCapacity] = useState(false);
  const [isBioExpanded, setIsBioExpanded] = useState(false);
  const approvalsScrollRef = useRef<HTMLUListElement | null>(null);
  const approvalsScrollTop = useRef(0);
  const membersScrollRef = useRef<HTMLUListElement | null>(null);
  const membersScrollTop = useRef(0);
  
  const myMemberInfo = clan?.members.find(m => m.user_id === profile.id);
    const isPrivileged = !!myMemberInfo && ['leader', 'officer', 'moderator'].includes(myMemberInfo.role);

  const syncProfileBuffEffects = (activeBuffs: ActiveClanBuff[]) => {
      onUpdateProfile(prev => {
          if (!prev) return prev;
          if (!activeBuffs.length) {
              return { ...prev, active_clan_buffs: [], clan_buff_effects: undefined };
          }
          return {
              ...prev,
              active_clan_buffs: activeBuffs,
              clan_buff_effects: combineClanBuffEffects(activeBuffs),
          };
      });
  };

  const fetchAvailableBuffs = async () => {
      setIsLoadingBuffs(true);
      try {
          const buffs = await GameService.clan_get_available_buffs();
          setAvailableBuffs(buffs);
          setBuffLoadError(null);
          return buffs;
      } catch (error) {
          setBuffLoadError('Unable to load clan buffs. Please try again.');
          throw error;
      } finally {
          setIsLoadingBuffs(false);
      }
  };

  const formatRequestName = (request: ClanJoinRequest) => {
      const username = request.username?.trim();
      if (username) return username;

      const userId = request.user_id?.trim();
      if (userId) {
          const maskedId = userId.slice(0, 6);
          return `Agent ${maskedId}`;
      }

      return 'Unknown agent';
  };

  const fetchClanDetails = async (options?: { showLoading?: boolean }) => {
    if (options?.showLoading) {
        setStage('loading');
    }
    try {
        const clanDetails = await GameService.clan_details();
        setClan(clanDetails);
        syncProfileBuffEffects(clanDetails?.active_buffs ?? []);
        setStage(clanDetails ? 'in_clan' : 'no_clan');

        const results = await Promise.allSettled([
            fetchAvailableBuffs(),
            GameService.clan_get_my_pending_request(),
        ]);

        const pendingRequest = results[1].status === 'fulfilled' ? results[1].value : null;

        if (results[0].status === 'rejected') {
            console.error('Failed to load buffs:', results[0].reason);
        }
        if (results[1].status === 'rejected') {
            console.error('Failed to load pending request:', results[1].reason);
        }

        setPendingJoinRequest(pendingRequest);
    } catch (error) {
        console.error('Failed to load clan details:', error);
        addToast("Failed to load clan details.", "error");
        setClan(null);
        setStage('no_clan');
    }
  };

  useEffect(() => {
    void fetchClanDetails({ showLoading: true });
  }, []);

    useEffect(() => {
        const userId = profile.id;
        let isActive = true;

        const refreshState = async () => {
            if (!isActive) return;
            await fetchClanDetails();
        };

        const joinRequestChannel = supabase
            .channel(`clan-join-requests-${userId}`)
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'clan_join_requests', filter: `user_id=eq.${userId}` },
                (payload) => {
                    const status = (payload.new as { status?: string })?.status;
                    if (status === 'approved' || status === 'rejected' || payload.eventType === 'DELETE') {
                        void refreshState();
                        return;
                    }
                    if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
                        void refreshState();
                    }
                }
            )
            .subscribe();

        const membershipChannel = supabase
            .channel(`clan-membership-${userId}`)
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'clan_members', filter: `user_id=eq.${userId}` },
                (payload) => {
                    if (payload.eventType === 'INSERT' || payload.eventType === 'DELETE' || payload.eventType === 'UPDATE') {
                        void refreshState();
                    }
                }
            )
            .subscribe();

        return () => {
            isActive = false;
            void supabase.removeChannel(joinRequestChannel);
            void supabase.removeChannel(membershipChannel);
        };
    }, [profile.id]);

    useEffect(() => {
            setNoticeDraft(clan?.notice || '');
            setIsBioExpanded(false);
    }, [clan?.notice]);

    useEffect(() => {
        if (activeTab === 'management') {
            void loadPendingJoinRequests();
        }
    }, [activeTab, clan?.id, isPrivileged]);

    useEffect(() => {
        if (!isPrivileged || !clan?.id) return;
        void loadPendingJoinRequests();
    }, [isPrivileged, clan?.id]);

    useEffect(() => {
        onChatUnreadCountChange?.(unreadChatCount);
    }, [onChatUnreadCountChange, unreadChatCount]);

    useEffect(() => {
        if (!clan?.id) {
            setUnreadChatCount(0);
            return;
        }

        const channel = supabase
            .channel(`clan-chat-unread-${clan.id}`)
            .on(
                'postgres_changes',
                { event: 'INSERT', schema: 'public', table: 'clan_chat', filter: `clan_id=eq.${clan.id}` },
                (payload) => {
                    const newRow = payload.new as { user_id?: string };
                    if (newRow.user_id === profile.id) return;
                    if (activeTab === 'chat') return;
                    setUnreadChatCount((prev) => prev + 1);
                }
            )
            .subscribe();

        return () => {
            void supabase.removeChannel(channel);
        };
    }, [activeTab, clan?.id, profile.id]);

    useEffect(() => {
        if (activeTab === 'chat') return;
        setUnreadChatCount(initialChatUnreadCount);
    }, [activeTab, initialChatUnreadCount]);

    useEffect(() => {
        if (activeTab === 'chat' && unreadChatCount > 0) {
            setUnreadChatCount(0);
        }
    }, [activeTab, unreadChatCount]);

    useEffect(() => {
        if (!capacityUpgradePrompt?.requestId) return;

        const stillPending = pendingApprovals.some(
            (request) => request.id === capacityUpgradePrompt.requestId && request.status === 'pending'
        );

        if (!stillPending) {
            setCapacityUpgradePrompt(null);
        }
    }, [capacityUpgradePrompt?.requestId, pendingApprovals]);

    useLayoutEffect(() => {
        if (approvalsScrollRef.current) {
            approvalsScrollRef.current.scrollTop = approvalsScrollTop.current;
        }
    }, [pendingApprovals.length]);

    useLayoutEffect(() => {
        if (membersScrollRef.current) {
            membersScrollRef.current.scrollTop = membersScrollTop.current;
        }
    }, [clan?.members?.length]);
  
  const handleDeposit = async () => {
    const amount = parseInt(depositAmount, 10);
    if (isNaN(amount) || amount <= 0) {
        addToast("Please enter a valid amount.", "error");
        return;
    }
    if (amount > (profile?.coins ?? 0)) {
        addToast(`Insufficient funds. You only have ${(profile?.coins ?? 0).toLocaleString()} coins.`, "error");
        return;
    }
    try {
        const result = await GameService.clan_deposit_coins(amount);
        setClan(prev => {
            if (!prev) return null;
            return {
                ...prev,
                vault_coins: result.new_clan_vault,
                members: prev.members.map(member => (
                    member.user_id === profile.id
                        ? { ...member, deposited_coins: (member.deposited_coins ?? 0) + amount }
                        : member
                )),
            };
        });
        onUpdateProfile(p => p ? { ...p, coins: result.new_user_coins } : null);
        addToast(`Successfully deposited ${amount} coins!`, "success");
        setDepositAmount('');
    } catch (error: any) {
        addToast(error.message || "Deposit failed.", "error");
    }
  };
  
  const handleBuyBuff = async (buffCode: string) => {
      try {
          const updatedClan = await GameService.clan_buy_buff(buffCode);
          setClan(updatedClan);
          syncProfileBuffEffects(updatedClan.active_buffs || []);
          addToast("Buff purchased successfully!", "success");
      } catch (error: any) {
          addToast(error.message || "Failed to buy buff.", "error");
      }
  };

  const [isActivatingAllBuffs, setIsActivatingAllBuffs] = useState(false);
  
  const handleActivateAllBuffs = async () => {
      if (!clan) return;
      
      // Calculate total cost
      const totalCost = availableBuffs.reduce((sum, buff) => sum + buff.cost, 0);
      
      if (clan.vault_coins < totalCost) {
          addToast(`Insufficient vault coins. Need ${totalCost.toLocaleString()} coins.`, "error");
          return;
      }
      
      setIsActivatingAllBuffs(true);
      let successCount = 0;
      let latestClan = clan;
      
      try {
          for (const buff of availableBuffs) {
              try {
                  latestClan = await GameService.clan_buy_buff(buff.code);
                  successCount++;
              } catch (error: any) {
                  // Continue with other buffs even if one fails
                  console.warn(`Failed to activate buff ${buff.name}:`, error.message);
              }
          }
          
          setClan(latestClan);
          syncProfileBuffEffects(latestClan.active_buffs || []);
          
          if (successCount === availableBuffs.length) {
              addToast(`All ${successCount} buffs activated!`, "success");
          } else if (successCount > 0) {
              addToast(`${successCount}/${availableBuffs.length} buffs activated.`, "success");
          } else {
              addToast("No buffs were activated.", "error");
          }
      } finally {
          setIsActivatingAllBuffs(false);
      }
  };

  const handleSaveNotice = async () => {
      if (!isPrivileged) {
          addToast("Only clan leadership can edit the bio.", "error");
          return;
      }
      setIsSavingNotice(true);
      try {
          const updated = await GameService.clan_update_notice(noticeDraft);
          setClan(updated);
          addToast("Clan bio updated.", "success");
          setIsEditingNotice(false);
      } catch (error: any) {
          addToast(error.message || "Failed to update bio.", "error");
      } finally {
          setIsSavingNotice(false);
      }
  };

  const handleLeaveClan = async () => {
      try {
          await GameService.clan_leave();
          addToast("You have left the clan.", "success");
          setClan(null);
          syncProfileBuffEffects([]);
          setStage('no_clan');
          setModal(null);
      } catch (error) {
          addToast("Failed to leave clan.", "error");
      }
  };

  const handleDeleteClan = async () => {
      try {
          await GameService.clan_delete();
          addToast("Clan has been deleted.", "success");
          setClan(null);
          syncProfileBuffEffects([]);
          setStage('no_clan');
          setModal(null);
      } catch (error) {
          addToast("Failed to delete clan.", "error");
      }
  };
  
  const handleKickMember = async () => {
      if (!memberToKick) return;
      try {
          const updatedClan = await GameService.clan_kick_member(memberToKick.user_id);
          setClan(updatedClan);
          addToast(`${memberToKick.username} has been kicked.`, "success");
      } catch (error) {
          addToast("Failed to kick member.", "error");
      } finally {
          setModal(null);
          setMemberToKick(null);
      }
  };
  
  const handlePromote = async (userId: string) => {
      try {
          const updatedClan = await GameService.clan_promote_member(userId);
          setClan(updatedClan);
          addToast("Member promoted.", "success");
      } catch (e) { addToast("Failed to promote.", "error"); }
  };

  const handleDemote = async (userId: string) => {
       try {
          const updatedClan = await GameService.clan_demote_member(userId);
          setClan(updatedClan);
          addToast("Member demoted.", "success");
      } catch (e) { addToast("Failed to demote.", "error"); }
  };

  const loadPendingJoinRequests = async () => {
      const canApprove = myMemberInfo && ['leader', 'moderator'].includes(myMemberInfo.role);
      if (!canApprove) {
          setPendingApprovals([]);
          onPendingCountChange?.(0);
          return;
      }
      setIsLoadingRequests(true);
      try {
          const requests = await GameService.clan_get_pending_join_requests();
          setPendingApprovals(requests);
          onPendingCountChange?.(requests.length);
      } catch (error: any) {
          setPendingApprovals([]);
          addToast(error?.message || "Failed to load join requests.", "error");
      } finally {
          setIsLoadingRequests(false);
      }
  };

  const handleApproveJoinRequest = async (requestId: string) => {
      setProcessingRequestId(requestId);
      setCapacityUpgradePrompt(null);
      const memberCount = clan?.members.length ?? 0;
      const memberLimit = clan?.member_limit ?? 0;
      const atCapacity = memberCount >= memberLimit;
      if (atCapacity) {
          setCapacityUpgradePrompt({
              requestId,
              message: `Clan is at full capacity (${memberCount}/${memberLimit}). Level up your clan to unlock more seats and approve this request.`,
          });
          addToast('Clan capacity reached. Level up to unlock more member slots.', 'info');
          setProcessingRequestId(null);
          return;
      }
      try {
          await GameService.clan_approve_join_request(requestId);
          setPendingApprovals((prev) => {
              const next = prev.filter((request) => request.id !== requestId);
              onPendingCountChange?.(next.length);
              return next;
          });
          setCapacityUpgradePrompt(null);
          if (clan?.id) {
              const members = await GameService.clan_get_members_by_id(clan.id);
              setClan((prev) => (prev ? { ...prev, members } : prev));
          }
          addToast("Join request approved.", "success");
      } catch (error: any) {
          const message = error?.message || "Failed to approve request.";
          const isCapacityIssue = /full|capacity|limit|member slots?/i.test(message);
          if (isCapacityIssue) {
              setCapacityUpgradePrompt({
                  requestId,
                  message: `Clan is at full capacity (${memberCount}/${memberLimit}). Level up your clan to unlock more seats and approve this request.`,
              });
              addToast('Clan capacity reached. Level up to unlock more member slots.', 'info');
          } else {
              addToast(message, "error");
          }
      } finally {
          setProcessingRequestId(null);
      }
  };

  const handleRejectJoinRequest = async (requestId: string) => {
      setProcessingRequestId(requestId);
      try {
          await GameService.clan_reject_join_request(requestId);
          setPendingApprovals((prev) => {
              const next = prev.filter((request) => request.id !== requestId);
              onPendingCountChange?.(next.length);
              return next;
          });
          setCapacityUpgradePrompt(null);
          addToast("Join request rejected.", "info");
      } catch (error: any) {
          addToast(error?.message || "Failed to reject request.", "error");
      } finally {
          setProcessingRequestId(null);
      }
  };

  const handleCancelJoinRequest = async () => {
      if (!pendingJoinRequest) return;
      setIsCancelingRequest(true);
      try {
          await GameService.clan_cancel_join_request(pendingJoinRequest.id);
          setPendingJoinRequest(null);
          addToast("Join request canceled.", "success");
      } catch (error: any) {
          addToast(error?.message || "Failed to cancel request.", "error");
      } finally {
          setIsCancelingRequest(false);
      }
  };

  const handleClanLevelUp = async () => {
      const upgradeConditions = getClanUpgradeConditions(clan, isPrivileged);
      if (!upgradeConditions.canUpgrade) {
          addToast(upgradeConditions.reasons[0] || 'Upgrade unavailable right now.', 'info');
          return;
      }

      setIsUpgradingCapacity(true);
      try {
          const prevLevel = clan ? getClanLevel(clan.member_limit, clan.extra_member_slots_purchased) : 0;
          const updatedClan = await GameService.clan_buy_member_slot();
          const nextLevel = getClanLevel(updatedClan.member_limit, updatedClan.extra_member_slots_purchased);
          setClan(updatedClan);
          setCapacityUpgradePrompt(null);
          if (nextLevel > prevLevel) {
              addToast('Clan leveled up! New benefits unlocked.', 'success');
          } else {
              addToast('Member capacity increased.', 'success');
          }
      } catch (error: any) {
          addToast(error?.message || 'Failed to level up clan.', 'error');
      } finally {
          setIsUpgradingCapacity(false);
      }
  };

  const openMembersModal = async (clanId: string, clanName: string, clanNotice?: string) => {
      console.log('Opening members modal for:', clanName, clanId);
      setMemberModalError(null);
      setModal('view_members');
      setMemberModalState({ clanId, clanName, notice: clanNotice, members: [] });
      setIsMemberModalLoading(true);
      try {
          const members = await GameService.clan_get_members_by_id(clanId);
          console.log('Loaded members:', members);
          setMemberModalState({ clanId, clanName, notice: clanNotice, members });
      } catch (error: any) {
          const message = error?.message || "Failed to load clan members.";
          console.error('Error loading members:', error);
          setMemberModalError(message);
          addToast(message, "error");
      } finally {
          setIsMemberModalLoading(false);
      }
  };

  const closeMembersModal = () => {
      setModal(null);
      setMemberModalState(null);
      setMemberModalError(null);
      setIsMemberModalLoading(false);
  };
  
    const JoinClanView: React.FC<{ onRequestSubmitted: (request: ClanJoinRequest | null, clanName: string) => void; onViewMembers: (clan: ClanSummary) => void; pendingRequest?: ClanJoinRequest | null }> = ({ onRequestSubmitted, onViewMembers, pendingRequest }) => {
    const [clanList, setClanList] = useState<ClanSummary[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isJoining, setIsJoining] = useState<string | null>(null);
    const listScrollRef = useRef<HTMLDivElement>(null);

    const fetchClans = async () => {
        const scrollTop = listScrollRef.current?.scrollTop ?? 0;
        setIsLoading(true);
        try {
            const clans = await GameService.clan_list();
            setClanList(clans);
        } catch (error) {
            addToast("Failed to fetch clan list.", "error");
        } finally {
            if (listScrollRef.current && scrollTop > 0) {
                requestAnimationFrame(() => {
                    if (listScrollRef.current) {
                        listScrollRef.current.scrollTop = scrollTop;
                    }
                });
            }
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchClans();
    }, []);

    const handleJoin = async (clan: ClanSummary) => {
        setIsJoining(clan.id);
        try {
            const result = await GameService.clan_join(clan.id);
            if (result.status === 'pending') {
                addToast(`Request sent to "${clan.name}" for approval.`, "info");
                onRequestSubmitted(result.request ?? null, clan.name);
                setStage('no_clan');
            } else if (result.clan) {
                addToast(`Successfully joined "${clan.name}"!`, "success");
                onRequestSubmitted(null, clan.name);
                setClan(result.clan);
                setStage('in_clan');
            }
        } catch (error: any) {
            addToast(error.message || "Failed to join clan.", "error");
        }
        setIsJoining(null);
    };

    if (isLoading && clanList.length === 0) {
        return <div className="font-heading text-xl animate-pulse text-center" style={{color: 'var(--amber-warn)'}}>Scanning for Syndicates...</div>;
    }

    return (
        <div className="text-center max-w-2xl mx-auto">
            <div className="flex items-center justify-between mb-6">
                <h2 className="font-heading text-3xl text-amber-400">Join a Syndicate</h2>
                <button
                    onClick={fetchClans}
                    disabled={isLoading}
                    className="px-4 py-2 bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-400 text-white rounded-lg font-heading transition-all disabled:opacity-50"
                >
                    {isLoading ? 'Refreshing...' : '🔄 Refresh'}
                </button>
            </div>
            {pendingRequest && (
                <div className="card-glass p-4 mb-4 text-left border border-amber-400/40">
                    <p className="font-heading text-lg text-amber-300">Request Pending</p>
                    <p className="text-sm text-gray-300">You have requested to join <span className="font-semibold text-white">{pendingRequest.clan_name || 'this clan'}</span>. A leader or moderator needs to approve.</p>
                </div>
            )}
            {clanList.length === 0 ? (
                <div className="card-glass p-8 text-gray-400">
                    <p>No clans available yet. Be the first to create one!</p>
                </div>
            ) : (
                <div ref={listScrollRef} className="space-y-4">
                {clanList.map(clan => (
                    <div key={clan.id} className="card-glass p-4 flex items-center justify-between">
                        <div className="flex items-center space-x-4 text-left">
                            <img src={clan.crest_url || `https://api.dicebear.com/7.x/shapes/svg?seed=${clan.name}`} alt={`${clan.name} crest`} className="w-16 h-16 rounded-full" />
                            <div>
                                <button
                                    type="button"
                                    onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        onViewMembers(clan);
                                    }}
                                    className="font-heading text-lg text-white text-left hover:text-amber-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/60 rounded"
                                >
                                    {clan.name}
                                </button>
                                <p className="text-xs text-gray-500">View members</p>
                                <p className="text-sm text-gray-400">Lv.{getClanLevel(clan.member_limit, Math.max(0, clan.member_limit - 5))} • {clan.member_count}/{clan.member_limit} members | {clan.vault_metric.toLocaleString()} XP</p>
                                {clan.notice && <p className="text-xs text-gray-400 mt-1 line-clamp-2">{clan.notice}</p>}
                            </div>
                        </div>
                        <button
                            onClick={() => handleJoin(clan)}
                            disabled={!!isJoining || !!pendingRequest}
                            className="bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400 text-white font-semibold px-4 py-2 rounded-lg disabled:opacity-50"
                        >
                            {isJoining === clan.id ? 'Joining...' : pendingRequest ? 'Pending' : 'Request to Join'}
                        </button>
                    </div>
                ))}
            </div>
            )}
             <button onClick={() => setStage('no_clan')} className="text-gray-400 hover:text-white transition-colors mt-6">Back</button>
        </div>
    );
};

  const renderNoClan = () => (
    <div className="text-center max-w-lg mx-auto">
        <div className="w-24 h-24 mx-auto mb-4"><img src={neonIcon('clan')} alt="" className="w-full h-full object-contain drop-shadow-[0_0_12px_rgba(251,191,36,0.4)]" /></div>
        <h2 className="font-heading text-4xl mb-4 text-amber-400">Join the Syndicate</h2>
        <p className="text-gray-400 mb-8">You are not currently part of a clan. Create your own syndicate or join an existing one to collaborate with other agents.</p>
        {pendingJoinRequest && (
            <div className="card-glass p-4 mb-4 border border-amber-400/40">
                <div className="flex items-start justify-between gap-4">
                    <div className="text-left">
                        <p className="font-heading text-lg text-amber-300">Request Pending</p>
                        <p className="text-sm text-gray-300">Awaiting approval to join <span className="font-semibold text-white">{pendingJoinRequest.clan_name || 'a clan'}</span>. A leader or moderator will review your request soon.</p>
                    </div>
                    <button
                        onClick={handleCancelJoinRequest}
                        disabled={isCancelingRequest}
                        className="shrink-0 px-3 py-2 bg-red-500/20 hover:bg-red-500/30 border border-red-400 text-red-200 font-semibold rounded-lg transition-all disabled:opacity-50"
                        title="Cancel your join request"
                    >
                        {isCancelingRequest ? '...' : '✕'}
                    </button>
                </div>
            </div>
        )}
        <div className="card-glass p-6 space-y-4">
             <button
                onClick={() => setStage('creating')}
                className="w-full bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400 text-white font-heading font-bold text-lg p-3 rounded-xl transition-all"
            >
                Create a Clan (1000 Coins)
            </button>
            <button
                onClick={() => setStage('joining')}
                className="w-full bg-gray-500/20 hover:bg-gray-500/30 border border-gray-400 text-white font-heading font-bold text-lg p-3 rounded-xl transition-all inline-flex items-center justify-center gap-2"
            >
                <img src={neonIcon('invite_friend')} alt="" className="h-5 w-5 object-contain" />
                Join a Clan
            </button>
        </div>
    </div>
  );

  const CreateClanForm: React.FC<{ onCreated: () => void }> = ({ onCreated }) => {
      const [name, setName] = useState('');
      const [notice, setNotice] = useState('');
      const [isSubmitting, setIsSubmitting] = useState(false);
      const creationFee = 1000;

      const handleCreate = async () => {
          if (!name || name.length < 3) {
              addToast("Clan name must be at least 3 characters.", "error");
              return;
          }
           if (profile.coins < creationFee) {
              addToast("Not enough coins to create a clan.", "error");
              return;
          }

          setIsSubmitting(true);
          try {
              await GameService.clan_create(name, notice);
              addToast(`Clan "${name}" created successfully!`, "success");
              onUpdateProfile(p => p ? { ...p, coins: p.coins - creationFee } : null);
              onCreated();
          } catch (error: any) {
              addToast(error.message || "Failed to create clan.", "error");
          } finally {
              setIsSubmitting(false);
          }
      };

      return (
          <div className="text-center max-w-lg mx-auto">
              <h2 className="font-heading text-3xl mb-6 text-amber-400">Establish New Syndicate</h2>
              <div className="card-glass p-6 space-y-4">
                  <input type="text" placeholder="Clan Name (unique)" value={name} onChange={e => setName(e.target.value)} className="w-full bg-black/30 p-3 rounded-lg border border-gray-600 focus:border-amber-400 outline-none" />
                  <textarea placeholder="Clan Notice (optional)" value={notice} onChange={e => setNotice(e.target.value)} className="w-full bg-black/30 p-3 rounded-lg border border-gray-600 focus:border-amber-400 outline-none h-24" />
                  <button onClick={handleCreate} disabled={isSubmitting} className="w-full bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400 text-white font-heading font-bold text-lg p-3 rounded-xl transition-all disabled:opacity-50">
                      {isSubmitting ? "Establishing..." : "Create Clan"}
                  </button>
              </div>
              <button onClick={() => setStage('no_clan')} className="text-gray-400 hover:text-white transition-colors mt-6">Back</button>
          </div>
      );
  };
  
    const BrowseClansTab: React.FC<{ 
        currentClanId: string; 
        addToast: (msg: string, type: ToastMessage['type']) => void; 
        onViewMembers: (clan: ClanSummary) => void;
        clanList: ClanSummary[];
        setClanList: (clans: ClanSummary[]) => void;
        hasFetched: boolean;
        setHasFetched: (val: boolean) => void;
        isLoading: boolean;
        setIsLoading: (val: boolean) => void;
    }> = ({ currentClanId, addToast, onViewMembers, clanList, setClanList, hasFetched, setHasFetched, isLoading, setIsLoading }) => {
    const listScrollRef = useRef<HTMLDivElement>(null);

    const fetchClans = async () => {
        setIsLoading(true);
        try {
            const scrollTop = listScrollRef.current?.scrollTop ?? 0;
            const clans = await GameService.clan_list();
            setClanList(clans);
            setHasFetched(true);
            if (listScrollRef.current && scrollTop > 0) {
                requestAnimationFrame(() => {
                    if (listScrollRef.current) {
                        listScrollRef.current.scrollTop = scrollTop;
                    }
                });
            }
        } catch (error) {
            addToast("Failed to fetch clan list.", "error");
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        // Only fetch on first mount, not on re-render
        if (!hasFetched) {
            fetchClans();
        }
    }, [hasFetched]);

    if (isLoading && clanList.length === 0) {
        return <div className="flex justify-center py-8"><img src="/BRAINS.svg" alt="Loading..." className="w-20 h-20 animate-pulse" style={{ filter: 'drop-shadow(0 0 20px rgba(0, 212, 255, 0.6))' }} /></div>;
    }

    return (
        <div>
            <div className="flex items-center justify-between mb-4">
                <h3 className="font-heading text-xl text-amber-300">All Syndicates</h3>
                <button 
                    onClick={fetchClans}
                    disabled={isLoading}
                    className="px-4 py-2 bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-400 text-white rounded-lg font-heading transition-all disabled:opacity-50 text-sm"
                >
                    {isLoading ? 'Refreshing...' : '🔄 Refresh'}
                </button>
            </div>
            {clanList.length === 0 ? (
                <div className="bg-black/20 p-8 rounded-lg text-center text-gray-400">
                    <p>No other clans found.</p>
                </div>
            ) : (
                <div ref={listScrollRef} className="space-y-3 max-h-[500px] overflow-y-auto">
                    {clanList.map(clanItem => (
                        <div 
                            key={clanItem.id} 
                            className={`bg-black/20 p-4 rounded-lg flex items-center justify-between ${clanItem.id === currentClanId ? 'border-2 border-amber-400' : ''}`}
                        >
                            <div className="flex items-center space-x-4">
                                <img 
                                    src={clanItem.crest_url || `https://api.dicebear.com/7.x/shapes/svg?seed=${clanItem.name}`} 
                                    alt={`${clanItem.name} crest`} 
                                    className="w-12 h-12 rounded-full" 
                                />
                                <div>
                                    <button
                                        type="button"
                                        onClick={(e) => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            onViewMembers(clanItem);
                                        }}
                                        className="font-heading text-lg text-white text-left hover:text-amber-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/60 rounded"
                                    >
                                        {clanItem.name}
                                        {clanItem.id === currentClanId && <span className="ml-2 text-sm text-amber-400">(Your Clan)</span>}
                                    </button>
                                    <p className="text-xs text-gray-500">View members</p>
                                    <p className="text-sm text-gray-400">
                                        Lv.{getClanLevel(clanItem.member_limit, Math.max(0, clanItem.member_limit - 5))} • {clanItem.member_count}/{clanItem.member_limit} members | {clanItem.vault_metric.toLocaleString()} Total XP
                                    </p>
                                    {clanItem.notice && <p className="text-xs text-gray-400 mt-1 line-clamp-2">{clanItem.notice}</p>}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
  };
  
  const ClanChat: React.FC<{ clanId: string }> = ({ clanId }) => {
    type ChatMessage = ClanChatMessage & { user_id?: string };
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [newMessage, setNewMessage] = useState('');
    const [hasNewMessages, setHasNewMessages] = useState(false);
    const [userLookup, setUserLookup] = useState<Record<string, string>>({});
    const chatScrollRef = useRef<HTMLDivElement>(null);
    const userLookupRef = useRef<Record<string, string>>({});
    const isAtBottomRef = useRef(true);
    const hasLoadedRef = useRef(false);

    useEffect(() => {
        userLookupRef.current = userLookup;
    }, [userLookup]);

    useEffect(() => {
        setUserLookup((prev) => (profile.id ? { ...prev, [profile.id]: profile.username } : prev));
    }, [profile.id, profile.username]);

    const isNearBottom = (container: HTMLDivElement) => {
        const distance = container.scrollHeight - container.scrollTop - container.clientHeight;
        return distance < 120;
    };

    const formatChatTimestamp = (date: Date) => {
        const time = date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
        return `${time} · Just now`;
    };

    const scrollToBottom = () => {
        const container = chatScrollRef.current;
        if (!container) return;
        container.scrollTop = container.scrollHeight;
        setHasNewMessages(false);
        isAtBottomRef.current = true;
    };

    const ensureUsernames = async (userIds: string[]) => {
        const missing = userIds.filter((id) => id && !userLookupRef.current[id]);
        if (missing.length === 0) return;
        const { data, error } = await supabase
            .from('users')
            .select('id, username, email')
            .in('id', missing);

        if (error || !data) {
            console.warn('Failed to fetch chat usernames:', error);
            return;
        }

        const updates: Record<string, string> = {};
        data.forEach((row: any) => {
            updates[row.id] = row.username || row.email || 'Unknown';
        });
        setUserLookup((prev) => ({ ...prev, ...updates }));
    };

    useEffect(() => {
        let isMounted = true;

        GameService.clan_chat_recent(clanId).then((data) => {
            if (isMounted) {
                setMessages(data);
            }
        });

        const channel = supabase
            .channel(`clan-chat-${clanId}`)
            .on(
                'postgres_changes',
                { event: 'INSERT', schema: 'public', table: 'clan_chat', filter: `clan_id=eq.${clanId}` },
                (payload) => {
                    const newRow = payload.new as {
                        id: string;
                        message: string;
                        username?: string;
                        user_id?: string;
                        created_at?: string;
                    };
                    if (newRow.user_id && !newRow.username) {
                        void ensureUsernames([newRow.user_id]);
                    }

                    setMessages((prev) => {
                        if (prev.some((msg) => msg.id === newRow.id)) {
                            return prev;
                        }

                        const fallbackName =
                            newRow.username ||
                            (newRow.user_id ? userLookupRef.current[newRow.user_id] : undefined) ||
                            (newRow.user_id === profile.id ? profile.username : undefined) ||
                            'Unknown';

                        const normalizedMessage: ChatMessage = {
                            id: newRow.id,
                            user: fallbackName,
                            message: newRow.message,
                            created_at: newRow.created_at ? formatChatTimestamp(new Date(newRow.created_at)) : formatChatTimestamp(new Date()),
                            is_self: newRow.user_id === profile.id,
                            user_id: newRow.user_id,
                        };

                        const optimisticIndex = prev.findIndex((msg) =>
                            msg.id.startsWith('temp_') &&
                            msg.is_self &&
                            msg.user_id === newRow.user_id &&
                            msg.message === newRow.message
                        );

                        if (optimisticIndex >= 0) {
                            const next = [...prev];
                            next[optimisticIndex] = normalizedMessage;
                            return next;
                        }

                        return [...prev, normalizedMessage];
                    });
                }
            )
            .subscribe();

        return () => {
            isMounted = false;
            void supabase.removeChannel(channel);
        };
    }, [clanId, profile.id, profile.username]);

    useEffect(() => {
        const container = chatScrollRef.current;
        if (!container) return;
        const shouldAutoScroll =
            !hasLoadedRef.current ||
            isAtBottomRef.current ||
            (messages[messages.length - 1]?.is_self ?? false);
        if (shouldAutoScroll) {
            container.scrollTop = container.scrollHeight;
            setHasNewMessages(false);
            isAtBottomRef.current = true;
        } else {
            setHasNewMessages(true);
        }
        if (!hasLoadedRef.current && messages.length > 0) {
            hasLoadedRef.current = true;
        }
    }, [messages]);

    const handleSend = async () => {
        if (!newMessage.trim()) return;
        const tempId = `temp_${Date.now()}`;
        const optimisticMessage: ChatMessage = {
            id: tempId,
            user: profile.username,
            message: newMessage,
            created_at: 'Sending…',
            is_self: true,
            user_id: profile.id,
        };
        setMessages(prev => [...prev, optimisticMessage]);
        setNewMessage('');
        
        try {
            const sentMessage = await GameService.clan_chat_post(newMessage, clanId);
            const mergedMessage: ChatMessage = { ...sentMessage, user_id: profile.id };
            setMessages(prev => {
                const replaced = prev.map(m => m.id === tempId ? mergedMessage : m);
                const deduped: ChatMessage[] = [];
                const seen = new Set<string>();
                for (const msg of replaced) {
                    if (seen.has(msg.id)) continue;
                    seen.add(msg.id);
                    deduped.push(msg);
                }
                return deduped;
            });
        } catch {
            addToast("Failed to send message.", "error");
            setMessages(prev => prev.filter(m => m.id !== tempId));
        }
    };

    return (
        <div className="h-full flex flex-col">
            <div
                ref={chatScrollRef}
                className="flex-grow bg-black/20 p-4 rounded-t-lg overflow-y-auto h-[400px] relative"
                onScroll={() => {
                    const container = chatScrollRef.current;
                    if (!container) return;
                    const isNear = isNearBottom(container);
                    isAtBottomRef.current = isNear;
                    if (isNear) {
                        setHasNewMessages(false);
                    }
                }}
            >
                <div className="space-y-4">
                    {messages.map(msg => (
                        <div key={msg.id} className={`flex items-end gap-3 ${msg.is_self ? 'flex-row-reverse' : ''}`}>
                            <div className={`p-3 rounded-xl max-w-xs lg:max-w-md ${msg.is_self ? 'bg-ion-blue/20 rounded-br-none' : 'bg-gray-700/50 rounded-bl-none'}`}>
                                <div className={`flex items-center gap-2 mb-1 ${msg.is_self ? 'justify-end' : 'justify-start'}`}>
                                    <p className={`text-xs font-bold ${msg.is_self ? 'text-cyan-100' : 'text-amber-300'}`}>
                                        {msg.is_self
                                            ? 'You'
                                            : (msg.user_id ? userLookup[msg.user_id] ?? msg.user : msg.user)}
                                    </p>
                                    <p className={`text-[11px] ${msg.is_self ? 'text-cyan-200/70' : 'text-gray-400'}`}>
                                        {msg.created_at}
                                    </p>
                                </div>
                                <p className="text-white">{msg.message}</p>
                            </div>
                        </div>
                    ))}
                </div>
                {hasNewMessages && (
                    <div className="absolute inset-x-0 bottom-4 flex justify-center pointer-events-none">
                        <button
                            type="button"
                            onClick={scrollToBottom}
                            className="pointer-events-auto px-3 py-1 text-xs font-semibold bg-amber-500/90 text-ink-900 rounded-full shadow-lg"
                        >
                            New messages • Jump to bottom
                        </button>
                    </div>
                )}
            </div>
            <div className="flex p-4 bg-black/30 rounded-b-lg">
                <input
                    type="text"
                    value={newMessage}
                    onChange={e => setNewMessage(e.target.value)}
                    onKeyDown={e => {
                        if (e.key === 'Enter') {
                            e.preventDefault();
                            void handleSend();
                        }
                    }}
                    placeholder="Type a message..."
                    className="flex-grow bg-gray-900 p-2 rounded-l-lg border border-gray-600 focus:border-amber-400 outline-none"
                />
                <button type="button" onClick={handleSend} className="bg-amber-500/80 hover:bg-amber-500 text-ink-900 font-bold p-2 rounded-r-lg">Send</button>
            </div>
        </div>
    );
  };

  const renderInClan = () => {
    if (!clan || !myMemberInfo) return null;

    const getRolePower = (role: ClanMember['role']) => {
        if (role === 'leader') return 2;
        if (role === 'officer' || role === 'moderator') return 1;
        return 0;
    };

    const myPower = getRolePower(myMemberInfo.role);
    const sortedMembers = [...clan.members].sort((a, b) => {
        const depositDiff = (b.deposited_coins ?? 0) - (a.deposited_coins ?? 0);
        if (depositDiff !== 0) return depositDiff;
        return (b.total_score ?? b.contribution ?? 0) - (a.total_score ?? a.contribution ?? 0);
    });
    const clanScoreValue = clan.clan_total_score ?? clan.vault_metric ?? 0;
    const myScoreValue = myMemberInfo.total_score ?? profile.total_score ?? 0;
    const memberCount = clan.members?.length ?? 0;
    const activeBuffs = clan.active_buffs || [];
    const groupedBuffs = Object.values(activeBuffs.reduce<Record<string, ActiveClanBuff & { stackCount: number }>>((acc, buff) => {
        const key = buff.template_code || buff.id;

        if (!acc[key]) {
            acc[key] = { ...buff, stackCount: 1 };
            return acc;
        }

        acc[key].stackCount += 1;

        if (new Date(buff.expires_at).getTime() > new Date(acc[key].expires_at).getTime()) {
            acc[key].expires_at = buff.expires_at;
            acc[key].activated_at = buff.activated_at;
            acc[key].activated_by = buff.activated_by;
            acc[key].activated_by_name = buff.activated_by_name;
        }

        return acc;
    }, {}));
    const clanLevel = getClanLevel(clan.member_limit, clan.extra_member_slots_purchased);
    const clanTheme = getClanLevelTheme(clanLevel);
    const clanBenefits = getClanLevelBenefits(clanLevel);
    const upgradeConditions = getClanUpgradeConditions(clan, isPrivileged);
    const bioText = clan.notice || 'No bio added yet. Let the world know what makes your clan special.';
    const canExpandBio = bioText.length > 160;

    return (
        <div>
             <div className={`flex items-center space-x-4 mb-6 max-w-4xl mx-auto rounded-2xl border bg-gradient-to-r p-4 ${clanTheme.panel} ${clanTheme.glow}`}>
                <img src={clan.crest_url || `https://api.dicebear.com/7.x/shapes/svg?seed=${clan.name}`} alt={`${clan.name} Crest`} className="w-24 h-24 rounded-full border-4 border-amber-400" />
                <div>
                    <div className="flex items-center gap-3 flex-wrap">
                        <h2 className="font-heading text-4xl text-amber-400">{clan.name}</h2>
                        <span className={`text-xs font-bold px-3 py-1 rounded-full border tracking-wide uppercase ${clanTheme.badge}`}>Clan Lv.{clanLevel}</span>
                    </div>
                    <p className="text-gray-300 mt-1 capitalize">{myMemberInfo.role} • {memberCount}/{clan.member_limit} agents enlisted</p>
                </div>
            </div>

            <div className="max-w-4xl mx-auto card-glass p-2">
                <div className="flex border-b border-white/10 mb-2 flex-wrap gap-2">
                    <button onClick={() => setActiveTab('home')} className={`px-4 py-2 font-heading ${activeTab === 'home' ? 'text-amber-300 border-b-2 border-amber-300' : 'text-gray-400'}`}>Home</button>
                    <button onClick={() => setActiveTab('chat')} className={`relative px-4 py-2 font-heading ${activeTab === 'chat' ? 'text-amber-300 border-b-2 border-amber-300' : 'text-gray-400'}`}>
                      Chat
                      {unreadChatCount > 0 && (
                        <span className="absolute top-0 right-0 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-xs font-bold text-white shadow-lg animate-pulse">
                          {Math.min(unreadChatCount, 9)}
                        </span>
                      )}
                    </button>
                    <button onClick={() => setActiveTab('browse')} className={`px-4 py-2 font-heading ${activeTab === 'browse' ? 'text-amber-300 border-b-2 border-amber-300' : 'text-gray-400'}`}>Browse Clans</button>
                    {isPrivileged && <button onClick={() => setActiveTab('management')} className={`relative px-4 py-2 font-heading ${activeTab === 'management' ? 'text-amber-300 border-b-2 border-amber-300' : 'text-gray-400'}`}>
                      Management
                      {pendingApprovals.length > 0 && (
                        <span className="absolute top-0 right-0 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-xs font-bold text-white shadow-lg animate-pulse">
                          {Math.min(pendingApprovals.length, 9)}
                        </span>
                      )}
                    </button>}
                </div>
                <div className="p-4">
                    {activeTab === 'home' && (
                        <div className="space-y-6">
                            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                                <StatCard label="Clan Level" value={clanLevel} subtitle="Power tier" accent="var(--cyan-accent)" />
                                <StatCard label="Clan Score" value={clanScoreValue.toLocaleString()} subtitle="Sum of top operatives" />
                                <StatCard label="Vault Coins" value={clan.vault_coins.toLocaleString()} subtitle="Shared funds" />
                                <StatCard label="Capacity" value={`${memberCount}/${clan.member_limit}`} subtitle="Member seats" />
                                <StatCard label="Active Effects" value={groupedBuffs.length} subtitle="Live clan buffs" />
                            </div>

                            <div className={`rounded-xl border bg-gradient-to-r p-4 ${clanTheme.panel}`}>
                                <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
                                    <h3 className="font-heading text-xl text-cyan-300">Clan Level Progression</h3>
                                    <div className="flex items-center gap-2">
                                        <span className={`text-xs font-bold px-3 py-1 rounded-full border ${clanTheme.badge}`}>Lv.{clanLevel}</span>
                                        <div className="text-right">
                                            <button
                                                type="button"
                                                onClick={handleClanLevelUp}
                                                disabled={isUpgradingCapacity || !upgradeConditions.canUpgrade}
                                                className="rounded-md border border-cyan-300/60 px-3 py-1.5 text-xs font-semibold text-cyan-100 bg-cyan-500/20 hover:bg-cyan-500/30 disabled:opacity-50"
                                                title="Upgrade clan level and unlock more seats"
                                            >
                                                {isUpgradingCapacity ? 'Upgrading...' : '⚡ Upgrade Level'}
                                            </button>
                                            <p className="mt-1 text-[11px] text-gray-300">
                                                {upgradeConditions.reasons.length > 0
                                                    ? `Requirements: ${upgradeConditions.reasons.join(' • ')}`
                                                    : `Ready: Lv.${clanLevel} → Lv.${upgradeConditions.nextLevel} (${upgradeConditions.nextCost.toLocaleString()} vault coins)`}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                                <ul className="space-y-2 text-sm">
                                    {clanBenefits.map((benefit, index) => (
                                        <li key={benefit} className={`rounded-lg px-3 py-2 ${index + 1 === clanLevel ? 'bg-cyan-500/20 text-cyan-100 border border-cyan-300/30' : 'bg-black/20 text-gray-300 border border-white/5'}`}>
                                            <span className="font-semibold mr-2">Lv.{index + 1}</span>
                                            {benefit}
                                        </li>
                                    ))}
                                </ul>
                            </div>


                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="bg-black/20 p-4 rounded-lg border border-white/5">
                                    <div className="flex items-center justify-between mb-2">
                                        <h3 className="font-heading text-xl text-cyan-300">Clan Bio</h3>
                                        {isPrivileged && (
                                            <button className="text-xs text-cyan-300 hover:text-white" onClick={() => {
                                                setIsEditingNotice(prev => !prev);
                                                setNoticeDraft(clan.notice || '');
                                            }}>
                                                {isEditingNotice ? 'Cancel' : 'Edit'}
                                            </button>
                                        )}
                                    </div>
                                    {isEditingNotice ? (
                                        <div>
                                            <textarea
                                                value={noticeDraft}
                                                maxLength={280}
                                                onChange={(e) => setNoticeDraft(e.target.value)}
                                                className="w-full bg-gray-900/60 border border-gray-700 rounded-lg p-3 text-sm focus:border-amber-400 outline-none"
                                                rows={4}
                                                placeholder="Describe your clan's vibe..."
                                            />
                                            <div className="flex items-center justify-between text-xs text-gray-400 mt-2">
                                                <span>{noticeDraft.length}/280</span>
                                                <button
                                                    onClick={handleSaveNotice}
                                                    disabled={isSavingNotice}
                                                    className="px-3 py-1 rounded-md bg-amber-500/80 hover:bg-amber-500 text-ink-900 font-semibold disabled:opacity-50"
                                                >
                                                    {isSavingNotice ? 'Saving...' : 'Save bio'}
                                                </button>
                                            </div>
                                        </div>
                                    ) : (
                                        <div>
                                            <p className={`text-gray-200 leading-relaxed min-h-[64px] ${!isBioExpanded && canExpandBio ? 'line-clamp-3' : ''}`}>
                                                {bioText}
                                            </p>
                                            {canExpandBio && (
                                                <button
                                                    type="button"
                                                    onClick={() => setIsBioExpanded((prev) => !prev)}
                                                    className="mt-2 text-xs text-cyan-300 hover:text-white"
                                                >
                                                    {isBioExpanded ? 'Show less' : 'Read full bio'}
                                                </button>
                                            )}
                                        </div>
                                    )}
                                </div>

                                <div className="bg-black/20 p-4 rounded-lg border border-white/5">
                                    <h3 className="font-heading text-xl mb-3 text-cyan-300">Active Clan Effects</h3>
                                    {groupedBuffs.length === 0 ? (
                                        <p className="text-gray-400 text-sm">No buffs active. Purchase one to empower the whole team.</p>
                                    ) : (
                                        <ul className="space-y-3 max-h-60 overflow-y-auto pr-1">
                                            {groupedBuffs.map((buff) => (
                                                <li key={buff.id} className="bg-black/30 p-3 rounded-lg border border-white/5">
                                                    <div className="flex items-start justify-between gap-3">
                                                        <div>
                                                            <p className="font-semibold text-white">{buff.name}</p>
                                                            <p className="text-xs text-gray-400">{describeBuffEffect(buff.effect)}</p>
                                                            {buff.stackCount > 1 && (
                                                                <p className="text-[11px] text-amber-300 font-semibold mt-1">Stacked x{buff.stackCount}</p>
                                                            )}
                                                            {buff.activated_by_name && (
                                                                <p className="text-[11px] text-gray-500 mt-1">Activated by {buff.activated_by_name}</p>
                                                            )}
                                                        </div>
                                                        <div className="text-right text-xs text-gray-300">
                                                            <p>{formatExpiresIn(buff.expires_at)}</p>
                                                            <p className="text-[11px] text-gray-500">Since {new Date(buff.activated_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                                                        </div>
                                                    </div>
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div>
                                    <h3 className="font-heading text-xl mb-3 text-cyan-300">Clan Vault</h3>
                                    <div className="bg-black/20 p-4 rounded-lg">
                                        <div className="flex items-center justify-center space-x-2 text-3xl font-mono text-cyan-200">
                                            <span>{clan.vault_coins.toLocaleString()}</span>
                                            <CoinIcon />
                                        </div>
                                        <div className="flex mt-4">
                                            <input type="number" value={depositAmount} onChange={e => setDepositAmount(e.target.value)} placeholder="Amount" className="w-full bg-gray-900 p-2 rounded-l-lg border border-gray-600 focus:border-amber-400 outline-none" />
                                            <button onClick={handleDeposit} className="bg-amber-500/80 hover:bg-amber-500 text-ink-900 font-bold p-2 rounded-r-lg">Deposit</button>
                                        </div>
                                    </div>

                                    {isPrivileged && <div className="mt-6">
                                        <div className="flex items-center justify-between mb-3">
                                            <h3 className="font-heading text-xl text-cyan-300">Purchase Clan Buffs</h3>
                                            {availableBuffs.length > 1 && (
                                                <button 
                                                    onClick={handleActivateAllBuffs}
                                                    disabled={isActivatingAllBuffs || clan.vault_coins < availableBuffs.reduce((sum, b) => sum + b.cost, 0)}
                                                    className="bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-black font-bold px-4 py-2 rounded-lg text-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 shadow-lg shadow-amber-500/20 transition-all"
                                                >
                                                    {isActivatingAllBuffs ? (
                                                        <>
                                                            <span className="animate-spin">⚡</span>
                                                            Activating...
                                                        </>
                                                    ) : (
                                                        <>
                                                            ⚡ Activate All ({availableBuffs.reduce((sum, b) => sum + b.cost, 0).toLocaleString()} <CoinIcon className="inline h-4 w-4" />)
                                                        </>
                                                    )}
                                                </button>
                                            )}
                                        </div>
                                        {buffLoadError && (
                                            <div className="mb-4 rounded-lg border border-amber-400/40 bg-amber-500/10 p-3 text-sm text-amber-100">
                                                <p className="mb-2">{buffLoadError}</p>
                                                <button
                                                    type="button"
                                                    onClick={() => void fetchAvailableBuffs()}
                                                    disabled={isLoadingBuffs}
                                                    className="rounded-md border border-amber-300 px-3 py-1 text-xs font-semibold text-amber-200 hover:bg-amber-500/10 disabled:opacity-50"
                                                >
                                                    {isLoadingBuffs ? 'Retrying...' : 'Retry'}
                                                </button>
                                            </div>
                                        )}
                                        <div className="space-y-3">
                                            {availableBuffs.map(buff => (
                                                 <div key={buff.id} className="bg-black/20 p-3 rounded-lg flex justify-between items-center">
                                                     <div>
                                                         <p className="font-semibold text-white">{buff.name}</p>
                                                         <p className="text-xs text-gray-400">{buff.description}</p>
                                                     </div>
                                                     <button 
                                                         onClick={() => handleBuyBuff(buff.code)} 
                                                         disabled={clan.vault_coins < buff.cost} 
                                                         className="bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-black font-bold px-4 py-2 rounded-lg text-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 shadow-lg shadow-amber-500/20 transition-all"
                                                     >
                                                         ⚡ {buff.cost.toLocaleString()} <CoinIcon className="inline h-4 w-4" />
                                                     </button>
                                                 </div>
                                            ))}
                                        </div>
                                    </div>}

                                    {myMemberInfo.role !== 'leader' && (
                                        <div className="mt-6">
                                            <div className="bg-red-900/20 p-4 rounded-lg border border-red-500/30">
                                                <button 
                                                    onClick={() => setModal('confirm_leave')} 
                                                    className="w-full bg-red-500/20 hover:bg-red-500/30 border border-red-400 text-white font-semibold px-4 py-2 rounded-lg flex items-center justify-center space-x-2"
                                                >
                                                    <LeaveIcon className="w-5 h-5" />
                                                    <span>Leave Clan</span>
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                                 <div>
                                    <h3 className="font-heading text-xl mb-3 text-cyan-300">Top Contributors</h3>
                                    <ul className="space-y-3">
                                        {sortedMembers.map(member => (
                                            <li key={member.user_id} className="flex items-start justify-between bg-black/20 p-3 rounded-lg">
                                                <div className="flex items-start space-x-3">
                                                    <AvatarWithFrame
                                                        src={member.avatar_url || `https://api.dicebear.com/7.x/shapes/svg?seed=${member.username}`}
                                                        alt={member.username}
                                                        size="md"
                                                        hasNeonFrame={member.active_cosmetic_frame === 'neon'}
                                                        hasGlitchTheme={member.active_cosmetic_theme === 'flicker'}
                                                        hasGlitchEffect={member.active_cosmetic_effect === 'glitch'}
                                                    />
                                                    <div>
                                                        <p className="font-semibold text-white flex items-center gap-2">
                                                            <ClickableUsername userId={member.user_id} username={member.username}>
                                                                {member.username}
                                                            </ClickableUsername>
                                                            <BrainsMasterBadge showBadge={member.brains_master_show_badge} until={member.brains_master_until} />
                                                            {member.custom_title && <span className="text-[11px] px-2 py-0.5 rounded-full bg-white/10 text-amber-200">{member.custom_title}</span>}
                                                        </p>
                                                        <p className="text-xs text-gray-400 capitalize">{member.role}</p>
                                                        {member.bio && <p className="text-[11px] text-gray-500 mt-1 line-clamp-2">{member.bio}</p>}
                                                    </div>
                                                </div>
                                                <div className="text-right">
                                                    <p className="font-mono text-cyan-200 text-lg">{(member.deposited_coins ?? 0).toLocaleString()} deposited</p>
                                                    <p className="text-xs text-gray-400">Score {(member.total_score ?? member.contribution ?? 0).toLocaleString()} • XP {(member.xp ?? 0).toLocaleString()} • PvP {member.pvp_score ?? 0}</p>
                                                </div>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            </div>
                        </div>
                    )}
                    {activeTab === 'chat' && <ClanChat key={`clan-chat-${clan.id}`} clanId={clan.id} />}
                    {activeTab === 'browse' && (
                        <BrowseClansTab 
                            currentClanId={clan.id} 
                            addToast={addToast} 
                            onViewMembers={(clanItem) => openMembersModal(clanItem.id, clanItem.name, clanItem.notice)}
                            clanList={browseClansList}
                            setClanList={setBrowseClansList}
                            hasFetched={browseClansFetched}
                            setHasFetched={setBrowseClansFetched}
                            isLoading={isBrowseClansLoading}
                            setIsLoading={setIsBrowseClansLoading}
                        />
                    )}
                    {activeTab === 'management' && isPrivileged && (
                         <div>
                             {(myMemberInfo.role === 'leader' || myMemberInfo.role === 'moderator') && (
                                 <div className="mb-6">
                                     <div className="flex items-center justify-between mb-3">
                                         <h3 className="font-heading text-xl text-amber-300">Join Requests</h3>
                                         <button
                                             onClick={loadPendingJoinRequests}
                                             className="text-sm px-3 py-1 rounded-md border border-amber-400 text-amber-200 hover:bg-amber-500/10"
                                             disabled={isLoadingRequests}
                                         >
                                             {isLoadingRequests ? 'Refreshing...' : 'Refresh'}
                                         </button>
                                     </div>
                                     {capacityUpgradePrompt && (
                                         <div className="mb-4 rounded-lg border border-fuchsia-400/40 bg-fuchsia-500/10 p-4">
                                             <p className="text-sm text-fuchsia-100 mb-3">{capacityUpgradePrompt.message}</p>
                                             <button
                                                 type="button"
                                                 onClick={handleClanLevelUp}
                                                 disabled={isUpgradingCapacity}
                                                 className="rounded-md border border-fuchsia-300 px-4 py-2 text-sm font-semibold text-white bg-fuchsia-500/30 hover:bg-fuchsia-500/40 disabled:opacity-50"
                                             >
                                                 {isUpgradingCapacity ? 'Leveling up...' : '⚡ Level Up Clan (+1 Member Slot)'}
                                             </button>
                                         </div>
                                     )}
                                     {isLoadingRequests ? (
                                         <p className="text-gray-400">Loading requests...</p>
                                     ) : pendingApprovals.length === 0 ? (
                                         <p className="text-gray-500">No pending join requests.</p>
                                     ) : (
                                         <ul
                                             className="space-y-3 max-h-80 overflow-y-auto pr-1"
                                             ref={approvalsScrollRef}
                                             onScroll={(event) => {
                                                 approvalsScrollTop.current = (event.currentTarget as HTMLUListElement).scrollTop;
                                             }}
                                         >
                                             {pendingApprovals.map(request => (
                                                 <li key={request.id} className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between bg-black/20 p-3 rounded-lg border border-white/5">
                                                     <div className="flex items-center space-x-3">
                                                         {request.avatar_url ? (
                                                             <img
                                                                 src={request.avatar_url}
                                                                 className="w-10 h-10 rounded-full"
                                                                 alt="Requester avatar"
                                                             />
                                                         ) : (
                                                             <div className="w-10 h-10 rounded-full bg-slate-700 flex items-center justify-center text-xs font-semibold text-white">
                                                                 {formatRequestName(request).slice(0, 2).toUpperCase()}
                                                             </div>
                                                         )}
                                                         <div>
                                                             <p className="font-semibold text-white">{formatRequestName(request)}</p>
                                                             <p className="text-xs text-gray-400">
                                                                 Requested at {request.requested_at ? new Date(request.requested_at).toLocaleString() : request.created_at ? new Date(request.created_at).toLocaleString() : 'unknown time'}
                                                             </p>
                                                         </div>
                                                     </div>
                                                     <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full sm:w-auto">
                                                         <button
                                                             onClick={() => handleApproveJoinRequest(request.id)}
                                                             disabled={processingRequestId === request.id}
                                                             className="px-3 py-2 rounded-md bg-green-500/20 border border-green-400 text-green-200 hover:bg-green-500/30 disabled:opacity-50 w-full sm:w-auto"
                                                         >
                                                             {processingRequestId === request.id ? 'Approving...' : 'Approve'}
                                                         </button>
                                                         <button
                                                             onClick={() => handleRejectJoinRequest(request.id)}
                                                             disabled={processingRequestId === request.id}
                                                             className="px-3 py-2 rounded-md bg-red-500/20 border border-red-400 text-red-200 hover:bg-red-500/30 disabled:opacity-50 w-full sm:w-auto"
                                                         >
                                                             {processingRequestId === request.id ? 'Processing...' : 'Reject'}
                                                         </button>
                                                     </div>
                                                 </li>
                                             ))}
                                         </ul>
                                     )}
                                 </div>
                             )}
                             <h3 className="font-heading text-xl mb-3 text-amber-300">Member Management</h3>
                             <ul
                                 className="space-y-3 max-h-[28rem] overflow-y-auto pr-1"
                                 ref={membersScrollRef}
                                 onScroll={(event) => {
                                     membersScrollTop.current = (event.currentTarget as HTMLUListElement).scrollTop;
                                 }}
                             >
                                {clan.members.map(member => {
                                    const targetPower = getRolePower(member.role);
                                    return (
                                    <li key={member.user_id} className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between bg-black/20 p-3 rounded-lg border border-white/5">
                                        <div className="flex items-center space-x-3">
                                            <AvatarWithFrame
                                                src={member.avatar_url || `https://api.dicebear.com/7.x/shapes/svg?seed=${member.username}`}
                                                alt={member.username}
                                                size="md"
                                                hasNeonFrame={member.active_cosmetic_frame === 'neon'}
                                                hasGlitchTheme={member.active_cosmetic_theme === 'flicker'}
                                                hasGlitchEffect={member.active_cosmetic_effect === 'glitch'}
                                            />
                                            <div>
                                                <p className="font-semibold text-white">
                                                    <ClickableUsername userId={member.user_id} username={member.username}>
                                                        {member.username}
                                                    </ClickableUsername>
                                                    <BrainsMasterBadge showBadge={member.brains_master_show_badge} until={member.brains_master_until} />
                                                </p>
                                                <p className="text-xs text-gray-400 capitalize">{member.role}</p>
                                                {member.custom_title && <p className="text-[11px] text-gray-400">{member.custom_title}</p>}
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full sm:w-auto">
                                            {myPower > targetPower && member.role === 'member' && (
                                                <button onClick={() => handlePromote(member.user_id)} className="p-2 rounded-md hover:bg-green-500/20 text-green-400" title="Promote to Officer"><PromoteIcon className="w-5 h-5"/></button>
                                            )}
                                            {myPower > targetPower && member.role === 'officer' && myMemberInfo.role === 'leader' && (
                                                <button onClick={() => handleDemote(member.user_id)} className="p-2 rounded-md hover:bg-amber-500/20 text-amber-400" title="Demote to Member"><DemoteIcon className="w-5 h-5"/></button>
                                            )}
                                             {myPower > targetPower && (
                                                <button onClick={() => { setMemberToKick(member); setModal('confirm_kick'); }} className="p-2 rounded-md hover:bg-red-500/20 text-red-400" title="Kick Member"><KickIcon className="w-5 h-5"/></button>
                                            )}
                                        </div>
                                    </li>
                                )})}
                             </ul>
                             <div className="mt-8 pt-6 border-t border-danger-red/30">
                                 <h3 className="font-heading text-xl mb-3 text-danger-red">Danger Zone</h3>
                                 <div className="bg-red-900/20 p-4 rounded-lg flex justify-between items-center">
                                    {myMemberInfo.role === 'leader' ? (
                                        <>
                                            <p>Permanently delete this clan. This cannot be undone.</p>
                                            <button onClick={() => setModal('confirm_delete')} className="bg-red-500/20 hover:bg-red-500/30 border border-red-400 text-white font-semibold px-4 py-2 rounded-lg">Delete Clan</button>
                                        </>
                                    ) : (
                                        <>
                                            <p>Leave this clan. You can rejoin later if it's open.</p>
                                            <button onClick={() => setModal('confirm_leave')} className="bg-red-500/20 hover:bg-red-500/30 border border-red-400 text-white font-semibold px-4 py-2 rounded-lg">Leave Clan</button>
                                        </>
                                    )}
                                 </div>
                             </div>
                         </div>
                    )}
                </div>
            </div>
        </div>
    );
  };


  const renderContent = () => {
    switch(stage) {
      case 'loading': return <div className="font-heading text-2xl animate-pulse text-center mt-20" style={{color: 'var(--amber-warn)'}}>Accessing Clan Network...</div>;
      case 'no_clan': return renderNoClan();
      case 'creating': return <CreateClanForm onCreated={fetchClanDetails} />;
      case 'joining': return <JoinClanView onRequestSubmitted={(request) => {
          setPendingJoinRequest(request);
      }} onViewMembers={(clanSummary) => openMembersModal(clanSummary.id, clanSummary.name, clanSummary.notice)} pendingRequest={pendingJoinRequest} />;
      case 'in_clan': return renderInClan();
      default: return null;
    }
  }

  return (
    <div className="mt-6">
      <BackButton onClick={onComplete} />
      {renderContent()}
      
      {/* Modals - rendered outside stage content so they work in all stages */}
      {modal === 'view_members' && memberModalState && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="card-glass w-full max-w-lg m-4 p-6 border-2 border-amber-400">
            <h2 className="font-heading text-2xl text-center mb-2 text-amber-300">{`Members of ${memberModalState.clanName}`}</h2>
            {memberModalState.notice && <p className="text-center text-gray-300 mb-3">{memberModalState.notice}</p>}
            {isMemberModalLoading ? (
              <p className="text-center text-gray-300 py-6">Loading roster...</p>
            ) : memberModalError ? (
              <p className="text-center text-danger-red py-6">{memberModalError}</p>
            ) : memberModalState.members.length === 0 ? (
              <p className="text-center text-gray-300 py-6">No agents enlisted yet.</p>
            ) : (
              <ul className="space-y-3 max-h-80 overflow-y-auto mt-4">
                                {memberModalState.members.map(member => (
                                    <li key={member.user_id} className="flex items-start justify-between bg-black/20 p-3 rounded-lg">
                                        <div className="flex items-start space-x-3">
                                            <AvatarWithFrame
                                                src={member.avatar_url || `https://api.dicebear.com/7.x/shapes/svg?seed=${member.username}`}
                                                alt={member.username}
                                                size="md"
                                                hasNeonFrame={member.active_cosmetic_frame === 'neon'}
                                                hasGlitchTheme={member.active_cosmetic_theme === 'flicker'}
                                                hasGlitchEffect={member.active_cosmetic_effect === 'glitch'}
                                            />
                                            <div>
                                                <p className="font-semibold text-white flex items-center gap-2">
                                                        <ClickableUsername userId={member.user_id} username={member.username}>
                                                            {member.username}
                                                        </ClickableUsername>
                                                        <BrainsMasterBadge showBadge={member.brains_master_show_badge} until={member.brains_master_until} />
                                                        {member.custom_title && <span className="text-[11px] px-2 py-0.5 rounded-full bg-white/10 text-amber-200">{member.custom_title}</span>}
                                                </p>
                                                <p className="text-xs text-gray-400 capitalize">{member.role}</p>
                                                {member.bio && <p className="text-[11px] text-gray-500 mt-1 line-clamp-2">{member.bio}</p>}
                                            </div>
                                        </div>
                                        <div className="text-right">
                                                <p className="font-semibold text-cyan-300">{(member.total_score ?? member.contribution ?? 0).toLocaleString()} pts</p>
                                                <p className="text-xs text-gray-400">XP {(member.xp ?? 0).toLocaleString()} • PvP {member.pvp_score ?? 0}</p>
                                        </div>
                                    </li>
                                ))}
              </ul>
            )}
            <button onClick={closeMembersModal} className="w-full mt-6 font-heading py-3 rounded-xl bg-gray-600/50 hover:bg-gray-500/50 border border-gray-500">
              Close
            </button>
          </div>
        </div>
      )}
      {modal === 'confirm_leave' && <ConfirmationModal title="Leave Clan" message="Are you sure you want to leave this clan?" confirmText="Yes, Leave" onConfirm={handleLeaveClan} onCancel={() => setModal(null)} />}
      {modal === 'confirm_delete' && <ConfirmationModal title="Delete Clan" message="Are you sure you want to permanently delete this clan? This action cannot be undone." confirmText="Yes, Delete" onConfirm={handleDeleteClan} onCancel={() => setModal(null)} />}
      {modal === 'confirm_kick' && memberToKick && <ConfirmationModal title={`Kick ${memberToKick.username}`} message={`Are you sure you want to kick ${memberToKick.username} from the clan?`} confirmText="Yes, Kick" onConfirm={handleKickMember} onCancel={() => { setModal(null); setMemberToKick(null); }} />}
    </div>
  );
};

export default ClanView;
