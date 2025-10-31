import React, { useState, useEffect, useRef } from 'react';
import { Clan, ClanChatMessage, Profile, ToastMessage, ClanSummary, ClanBuff, ClanMember } from '../types';
import * as GameService from '../services/gameService';
import BackButton from './BackButton';
import { ClanIcon, CoinIcon, DemoteIcon, KickIcon, LeaveIcon, ManageIcon, PromoteIcon } from './icons';

type ClanViewStage = 'loading' | 'no_clan' | 'in_clan' | 'creating' | 'joining';
type ClanTab = 'home' | 'chat' | 'management';
type ModalType = null | 'deposit' | 'confirm_leave' | 'confirm_delete' | 'confirm_kick';

interface ClanViewProps {
  profile: Profile;
  onComplete: () => void;
  onUpdateProfile: React.Dispatch<React.SetStateAction<Profile | null>>;
  addToast: (message: string, type: ToastMessage['type']) => void;
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


const ClanView: React.FC<ClanViewProps> = ({ profile, onComplete, onUpdateProfile, addToast }) => {
  const [stage, setStage] = useState<ClanViewStage>('loading');
  const [clan, setClan] = useState<Clan | null>(null);
  const [activeTab, setActiveTab] = useState<ClanTab>('home');
  const [availableBuffs, setAvailableBuffs] = useState<ClanBuff[]>([]);
  const [depositAmount, setDepositAmount] = useState('');
  const [modal, setModal] = useState<ModalType>(null);
  const [memberToKick, setMemberToKick] = useState<ClanMember | null>(null);
  
  const myMemberInfo = clan?.members.find(m => m.user_id === profile.id);

  const fetchClanDetails = async () => {
    setStage('loading');
    try {
        const [clanDetails, buffs] = await Promise.all([
            GameService.clan_details(),
            GameService.clan_get_available_buffs()
        ]);
        setClan(clanDetails);
        setAvailableBuffs(buffs);
        setStage(clanDetails ? 'in_clan' : 'no_clan');
    } catch (error) {
        addToast("Failed to load clan details.", "error");
        setStage('no_clan');
    }
  };

  useEffect(() => {
    fetchClanDetails();
  }, []);
  
  const handleDeposit = async () => {
    const amount = parseInt(depositAmount, 10);
    if (isNaN(amount) || amount <= 0) {
        addToast("Please enter a valid amount.", "error");
        return;
    }
    try {
        const result = await GameService.clan_deposit_coins(amount);
        setClan(prev => prev ? { ...prev, vault_coins: result.new_clan_vault } : null);
        onUpdateProfile(p => p ? { ...p, coins: result.new_user_coins } : null);
        addToast(`Successfully deposited ${amount} coins!`, "success");
        setDepositAmount('');
    } catch (error: any) {
        addToast(error.message || "Deposit failed.", "error");
    }
  };
  
  const handleBuyBuff = async (buffId: string) => {
      try {
          const updatedClan = await GameService.clan_buy_buff(buffId);
          setClan(updatedClan);
          addToast("Buff purchased successfully!", "success");
      } catch (error: any) {
          addToast(error.message || "Failed to buy buff.", "error");
      }
  };

  const handleLeaveClan = async () => {
      try {
          await GameService.clan_leave();
          addToast("You have left the clan.", "success");
          setClan(null);
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
  
  const JoinClanView: React.FC<{ onJoined: (clan: Clan) => void }> = ({ onJoined }) => {
    const [clanList, setClanList] = useState<ClanSummary[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isJoining, setIsJoining] = useState<string | null>(null);

    useEffect(() => {
        GameService.clan_list()
            .then(setClanList)
            .catch(() => addToast("Failed to fetch clan list.", "error"))
            .finally(() => setIsLoading(false));
    }, []);

    const handleJoin = async (clanId: string) => {
        setIsJoining(clanId);
        try {
            const joinedClan = await GameService.clan_join(clanId);
            addToast(`Successfully joined "${joinedClan.name}"!`, "success");
            onJoined(joinedClan);
        } catch (error: any) {
            addToast(error.message || "Failed to join clan.", "error");
            setIsJoining(null);
        }
    };

    if (isLoading) {
        return <div className="font-heading text-xl animate-pulse text-center" style={{color: 'var(--amber-warn)'}}>Scanning for Syndicates...</div>;
    }

    return (
        <div className="text-center max-w-2xl mx-auto">
            <h2 className="font-heading text-3xl mb-6 text-amber-400">Join a Syndicate</h2>
            <div className="space-y-4">
                {clanList.map(clan => (
                    <div key={clan.id} className="card-glass p-4 flex items-center justify-between">
                        <div className="flex items-center space-x-4 text-left">
                            <img src={clan.crest_url} alt={`${clan.name} crest`} className="w-16 h-16 rounded-full" />
                            <div>
                                <p className="font-heading text-lg text-white">{clan.name}</p>
                                <p className="text-sm text-gray-400">{clan.member_count} members | {clan.vault_metric.toLocaleString()} XP</p>
                            </div>
                        </div>
                        <button 
                            onClick={() => handleJoin(clan.id)}
                            disabled={!!isJoining}
                            className="bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400 text-white font-semibold px-4 py-2 rounded-lg disabled:opacity-50"
                        >
                            {isJoining === clan.id ? 'Joining...' : 'Join'}
                        </button>
                    </div>
                ))}
            </div>
             <button onClick={() => setStage('no_clan')} className="text-gray-400 hover:text-white transition-colors mt-6">Back</button>
        </div>
    );
};

  const renderNoClan = () => (
    <div className="text-center max-w-lg mx-auto">
        <div className="w-24 h-24 mx-auto mb-4 text-amber-400/50"><ClanIcon /></div>
        <h2 className="font-heading text-4xl mb-4 text-amber-400">Join the Syndicate</h2>
        <p className="text-gray-400 mb-8">You are not currently part of a clan. Create your own syndicate or join an existing one to collaborate with other agents.</p>
        <div className="card-glass p-6 space-y-4">
             <button
                onClick={() => setStage('creating')}
                className="w-full bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400 text-white font-heading font-bold text-lg p-3 rounded-xl transition-all"
            >
                Create a Clan (1000 Coins)
            </button>
            <button
                onClick={() => setStage('joining')}
                className="w-full bg-gray-500/20 hover:bg-gray-500/30 border border-gray-400 text-white font-heading font-bold text-lg p-3 rounded-xl transition-all"
            >
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
  
  const ClanChat: React.FC = () => {
    const [messages, setMessages] = useState<ClanChatMessage[]>([]);
    const [newMessage, setNewMessage] = useState('');
    const chatEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        GameService.clan_chat_recent().then(setMessages);
    }, []);

    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const handleSend = async () => {
        if (!newMessage.trim()) return;
        const tempId = `temp_${Date.now()}`;
        const optimisticMessage: ClanChatMessage = {
            id: tempId,
            user: profile.username,
            message: newMessage,
            created_at: 'Sending...',
            is_self: true,
        };
        setMessages(prev => [...prev, optimisticMessage]);
        setNewMessage('');
        
        try {
            const sentMessage = await GameService.clan_chat_post(newMessage);
            setMessages(prev => prev.map(m => m.id === tempId ? sentMessage : m));
        } catch {
            addToast("Failed to send message.", "error");
            setMessages(prev => prev.filter(m => m.id !== tempId));
        }
    };

    return (
        <div className="h-full flex flex-col">
            <div className="flex-grow bg-black/20 p-4 rounded-t-lg overflow-y-auto h-[400px]">
                <div className="space-y-4">
                    {messages.map(msg => (
                        <div key={msg.id} className={`flex items-end gap-3 ${msg.is_self ? 'flex-row-reverse' : ''}`}>
                            <div className={`p-3 rounded-xl max-w-xs lg:max-w-md ${msg.is_self ? 'bg-ion-blue/20 rounded-br-none' : 'bg-gray-700/50 rounded-bl-none'}`}>
                                {!msg.is_self && <p className="text-xs font-bold text-amber-300 mb-1">{msg.user}</p>}
                                <p className="text-white">{msg.message}</p>
                                <p className={`text-xs mt-1 ${msg.is_self ? 'text-cyan-200/70' : 'text-gray-400'}`}>{msg.created_at}</p>
                            </div>
                        </div>
                    ))}
                    <div ref={chatEndRef} />
                </div>
            </div>
            <div className="flex p-4 bg-black/30 rounded-b-lg">
                <input type="text" value={newMessage} onChange={e => setNewMessage(e.target.value)} onKeyPress={e => e.key === 'Enter' && handleSend()} placeholder="Type a message..." className="flex-grow bg-gray-900 p-2 rounded-l-lg border border-gray-600 focus:border-amber-400 outline-none" />
                <button onClick={handleSend} className="bg-amber-500/80 hover:bg-amber-500 text-ink-900 font-bold p-2 rounded-r-lg">Send</button>
            </div>
        </div>
    );
  };

  const renderInClan = () => {
    if (!clan || !myMemberInfo) return null;
    const isPrivileged = myMemberInfo.role === 'leader' || myMemberInfo.role === 'officer';

    const getRolePower = (role: ClanMember['role']) => {
        if (role === 'leader') return 2;
        if (role === 'officer') return 1;
        return 0;
    }
    const myPower = getRolePower(myMemberInfo.role);

    return (
        <div>
             <div className="flex items-center space-x-4 mb-6 max-w-4xl mx-auto">
                <img src={clan.crest_url} alt={`${clan.name} Crest`} className="w-24 h-24 rounded-full border-4 border-amber-400" />
                <div>
                    <h2 className="font-heading text-4xl text-amber-400">{clan.name}</h2>
                    <p className="text-gray-300 mt-1">{clan.notice}</p>
                </div>
            </div>

            <div className="max-w-4xl mx-auto card-glass p-2">
                <div className="flex border-b border-white/10 mb-2">
                    <button onClick={() => setActiveTab('home')} className={`px-4 py-2 font-heading ${activeTab === 'home' ? 'text-amber-300 border-b-2 border-amber-300' : 'text-gray-400'}`}>Home</button>
                    <button onClick={() => setActiveTab('chat')} className={`px-4 py-2 font-heading ${activeTab === 'chat' ? 'text-amber-300 border-b-2 border-amber-300' : 'text-gray-400'}`}>Chat</button>
                    {isPrivileged && <button onClick={() => setActiveTab('management')} className={`px-4 py-2 font-heading ${activeTab === 'management' ? 'text-amber-300 border-b-2 border-amber-300' : 'text-gray-400'}`}>Management</button>}
                </div>
                <div className="p-4">
                    {activeTab === 'home' && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                                <h3 className="font-heading text-xl mb-3 text-amber-300">Clan Vault</h3>
                                <div className="bg-black/20 p-4 rounded-lg">
                                    <div className="flex items-center justify-center space-x-2 text-3xl font-mono text-amber-300">
                                        <span>{clan.vault_coins.toLocaleString()}</span>
                                        <CoinIcon />
                                    </div>
                                    <div className="flex mt-4">
                                        <input type="number" value={depositAmount} onChange={e => setDepositAmount(e.target.value)} placeholder="Amount" className="w-full bg-gray-900 p-2 rounded-l-lg border border-gray-600 focus:border-amber-400 outline-none" />
                                        <button onClick={handleDeposit} className="bg-amber-500/80 hover:bg-amber-500 text-ink-900 font-bold p-2 rounded-r-lg">Deposit</button>
                                    </div>
                                </div>
                                
                                {isPrivileged && <div className="mt-6">
                                    <h3 className="font-heading text-xl mb-3 text-amber-300">Purchase Clan Buffs</h3>
                                    <div className="space-y-3">
                                        {availableBuffs.map(buff => (
                                             <div key={buff.id} className="bg-black/20 p-3 rounded-lg flex justify-between items-center">
                                                 <div>
                                                     <p className="font-semibold text-white">{buff.name}</p>
                                                     <p className="text-xs text-gray-400">{buff.description}</p>
                                                 </div>
                                                 <button onClick={() => handleBuyBuff(buff.id)} disabled={clan.vault_coins < buff.cost} className="bg-ion-blue/20 hover:bg-ion-blue/30 text-white font-semibold px-3 py-1 rounded-md text-sm disabled:opacity-50">
                                                     {buff.cost.toLocaleString()} <CoinIcon className="inline h-4 w-4" />
                                                 </button>
                                             </div>
                                        ))}
                                    </div>
                                </div>}
                                
                                {/* Leave Clan Button for non-leaders */}
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
                                <h3 className="font-heading text-xl mb-3 text-amber-300">Top Contributors</h3>
                                <ul className="space-y-3">
                                    {clan.members.sort((a,b) => b.contribution - a.contribution).map(member => (
                                        <li key={member.user_id} className="flex items-center justify-between bg-black/20 p-3 rounded-lg">
                                            <div className="flex items-center space-x-3">
                                                <img src={member.avatar_url} className="w-10 h-10 rounded-full" />
                                                <div>
                                                    <p className="font-semibold text-white">{member.username}</p>
                                                    <p className="text-xs text-gray-400 capitalize">{member.role}</p>
                                                </div>
                                            </div>
                                            <div className="font-mono text-amber-300">{member.contribution.toLocaleString()} XP</div>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        </div>
                    )}
                    {activeTab === 'chat' && <ClanChat />}
                    {activeTab === 'management' && isPrivileged && (
                         <div>
                             <h3 className="font-heading text-xl mb-3 text-amber-300">Member Management</h3>
                             <ul className="space-y-3">
                                {clan.members.map(member => {
                                    const targetPower = getRolePower(member.role);
                                    return (
                                    <li key={member.user_id} className="flex items-center justify-between bg-black/20 p-3 rounded-lg">
                                        <div className="flex items-center space-x-3">
                                            <img src={member.avatar_url} className="w-10 h-10 rounded-full" />
                                            <div>
                                                <p className="font-semibold text-white">{member.username}</p>
                                                <p className="text-xs text-gray-400 capitalize">{member.role}</p>
                                            </div>
                                        </div>
                                        <div className="flex items-center space-x-2">
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
             {modal === 'confirm_leave' && <ConfirmationModal title="Leave Clan" message="Are you sure you want to leave this clan?" confirmText="Yes, Leave" onConfirm={handleLeaveClan} onCancel={() => setModal(null)} />}
             {modal === 'confirm_delete' && <ConfirmationModal title="Delete Clan" message="Are you sure you want to permanently delete this clan? This action cannot be undone." confirmText="Yes, Delete" onConfirm={handleDeleteClan} onCancel={() => setModal(null)} />}
             {modal === 'confirm_kick' && memberToKick && <ConfirmationModal title={`Kick ${memberToKick.username}`} message={`Are you sure you want to kick ${memberToKick.username} from the clan?`} confirmText="Yes, Kick" onConfirm={handleKickMember} onCancel={() => { setModal(null); setMemberToKick(null); }} />}

        </div>
    );
  };


  const renderContent = () => {
    switch(stage) {
      case 'loading': return <div className="font-heading text-2xl animate-pulse text-center mt-20" style={{color: 'var(--amber-warn)'}}>Accessing Clan Network...</div>;
      case 'no_clan': return renderNoClan();
      case 'creating': return <CreateClanForm onCreated={fetchClanDetails} />;
      case 'joining': return <JoinClanView onJoined={(joinedClan) => {
          setClan(joinedClan);
          setStage('in_clan');
      }} />;
      case 'in_clan': return renderInClan();
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

export default ClanView;
