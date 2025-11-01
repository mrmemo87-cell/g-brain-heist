import React, { useState, useEffect } from 'react';
import { Profile, Task, SessionStatus, Caps, NewsEvent, ToastMessage } from './types';
import * as GameService from './services/gameService';
import { supabase } from './services/supabaseClient';
import Header from './components/Header';
import PlayerProfileCard from './components/PlayerProfileCard';
import SessionTracker from './components/SessionTracker';
import TaskList from './components/TaskList';
import CapTracker from './components/CapTracker';
import MainActions from './components/MainActions';
import NewsFeed from './components/NewsFeed';
import QuestView from './components/QuestView';
import PvPView from './components/PvPView';
import ShopView from './components/ShopView';
import Toast from './components/Toast';
import ClanView from './components/ClanView';
import InventoryView from './components/InventoryView';
import LevelUpModal from './components/LevelUpModal';
import LeaderboardView from './components/LeaderboardView';
import AchievementView from './components/AchievementView';
import TutorialModal from './components/TutorialModal';
import TeacherPortal from './components/TeacherPortal';
import { ToastContainer } from './components/ToastNotification';

interface AppProps {
  onLogout: () => void;
}

const App: React.FC<AppProps> = ({ onLogout }) => {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [sessionStatus, setSessionStatus] = useState<SessionStatus | null>(null);
  const [caps, setCaps] = useState<Caps | null>(null);
  const [news, setNews] = useState<NewsEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'dashboard' | 'quest' | 'pvp' | 'shop' | 'clan' | 'inventory' | 'leaderboard' | 'achievements' | 'teacher'>('dashboard');
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [showLevelUpModal, setShowLevelUpModal] = useState(false);
  const [levelUpData, setLevelUpData] = useState<{ newLevel: number; rewards: any } | null>(null);
  const [previousLevel, setPreviousLevel] = useState<number | null>(null);
  const [showTutorial, setShowTutorial] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [tutorialChecked, setTutorialChecked] = useState(false); // Track if we've checked tutorial status
  const [loadError, setLoadError] = useState<string | null>(null);

  const addToast = (message: string, type: ToastMessage['type'] = 'info', retryAction?: () => void) => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type, retryAction }]);
  };

  const removeToast = (id: number) => {
    setToasts(prev => prev.filter(toast => toast.id !== id));
  };


  const fetchGameData = async () => {
    try {
      setLoading(true);
      setLoadError(null);

      // Check if offline before attempting fetch
      if (!navigator.onLine) {
        throw new Error('No internet connection');
      }

      // Add timeout to prevent infinite loading (30 seconds)
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Request timeout - server took too long to respond')), 30000)
      );

      const dataPromise = Promise.all([
        GameService.whoami(),
        GameService.tasks_list(),
        GameService.session_status(),
        GameService.caps_status(),
        GameService.news_feed(),
      ]);

      const [profileData, tasksData, sessionData, capsData, newsData] = await Promise.race([
        dataPromise,
        timeoutPromise
      ]) as any;

      setProfile(profileData);
      setTasks(tasksData);
      setSessionStatus(sessionData);
      setCaps(capsData);
      setNews(newsData);

      // Show tutorial if first time user (only check once on initial load)
      if (!tutorialChecked && profileData && !profileData.tutorial_completed) {
        setShowTutorial(true);
        setTutorialChecked(true);
      } else if (!tutorialChecked) {
        setTutorialChecked(true);
      }
    } catch (error: any) {
      console.error("Failed to load game data:", error);
      
      // Check for database setup issues
      const isDatabaseError = error?.message?.includes('relation') || 
                              error?.message?.includes('does not exist') ||
                              error?.code === '42P01' ||
                              error?.code === 'PGRST116';
      
      if (isDatabaseError) {
        setLoadError('database_not_setup');
      } else if (!navigator.onLine || error?.message?.includes('fetch') || error?.message?.includes('network')) {
        setLoadError('network_error');
      } else if (error?.message?.includes('timeout')) {
        setLoadError('timeout_error');
      } else {
        setLoadError('unknown_error');
      }
      
      addToast(`Failed to load: ${error?.message || 'Unknown error'}`, "error", fetchGameData);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchGameData();
  }, []);

  // Auto-refresh profile every 60 seconds to update AP regeneration
  useEffect(() => {
    const intervalId = setInterval(() => {
      if (navigator.onLine && profile) {
        refreshProfile();
      }
    }, 60000); // 60 seconds

    return () => clearInterval(intervalId);
  }, [profile]);

  // Network status detection
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      addToast('🌐 Connection restored', 'success');
      // Refresh data when coming back online
      fetchGameData();
    };

    const handleOffline = () => {
      setIsOnline(false);
      addToast('📡 No internet connection', 'error');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Real-time subscription for activity feed
  useEffect(() => {
    if (!profile) return;
    
    const activityChannel = supabase
      .channel('activities')
      .on('postgres_changes', {
          event: 'INSERT',
          schema: 'public',
          table: 'activities'
        },
        (payload) => {
          console.log('New activity detected!', payload);
          const newActivity = payload.new as any;
          
          // Show toast if user is the target of an action (got hacked)
          if (newActivity.target_id === profile.id) {
            if (newActivity.kind === 'pvp_win') {
              addToast(`⚔️ ${newActivity.actor_username} hacked you! ${newActivity.data?.details || ''}`, 'error');
            } else if (newActivity.kind === 'pvp_blocked') {
              addToast(`🛡️ Your shield blocked ${newActivity.actor_username}'s attack!`, 'success');
            }
          }
          
          // Refresh feed
          GameService.news_feed().then(setNews);
        }
      )
      .subscribe();
    
    return () => {
      supabase.removeChannel(activityChannel);
    };
  }, [profile]);

  // Real-time subscription for profile updates
  useEffect(() => {
    if (!profile?.id) return;
    
    const profileChannel = supabase
      .channel('profile_updates')
      .on('postgres_changes', {
          event: 'UPDATE',
          schema: 'public',
          table: 'users',
          filter: `id=eq.${profile.id}`
        },
        (payload) => {
          console.log('Profile updated!', payload);
          const newProfile = payload.new as Profile;
          
          // Detect level up
          if (previousLevel !== null && newProfile.level > previousLevel) {
            // Call RPC to grant level-up rewards
            supabase.rpc('rpc_grant_levelup_rewards', { p_new_level: newProfile.level })
              .then(({ data, error }) => {
                if (error) {
                  console.error('Failed to grant level-up rewards:', error);
                  return;
                }
                
                const rewards = data || { coins: 100 * newProfile.level, ap_refill: true };
                setLevelUpData({ newLevel: newProfile.level, rewards });
                setShowLevelUpModal(true);
                
                // Refresh profile to show updated rewards
                GameService.whoami().then(updatedProfile => {
                  setProfile(updatedProfile);
                  setPreviousLevel(updatedProfile.level);
                });
              });
          } else {
            setProfile(newProfile);
            setPreviousLevel(newProfile.level);
          }
        }
      )
      .subscribe();
    
    return () => {
      supabase.removeChannel(profileChannel);
    };
  }, [profile?.id, previousLevel]);
  
  // Set initial level when profile loads
  useEffect(() => {
    if (profile && previousLevel === null) {
      setPreviousLevel(profile.level);
    }
  }, [profile, previousLevel]);
  
  const handleViewComplete = () => {
    setView('dashboard');
    // Only refresh profile data (lightweight) instead of all game data
    refreshProfile();
  };

  // Lightweight profile refresh (no loading screen)
  const refreshProfile = async () => {
    try {
      const profileData = await GameService.whoami();
      setProfile(profileData);
    } catch (error) {
      console.error('Failed to refresh profile:', error);
    }
  };

  const handleGrantReward = (deltas: { xp?: number; coins?: number, ap?: number }) => {
    if (!profile) return;
    
    // Optimistic update for smooth UI feedback
    setProfile(prevProfile => {
      if (!prevProfile) return null;
      return {
        ...prevProfile,
        xp: prevProfile.xp + (deltas.xp || 0),
        coins: prevProfile.coins + (deltas.coins || 0),
        ap_now: prevProfile.ap_now + (deltas.ap || 0),
      };
    });
  };


  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4">
        <div className="relative w-64 h-64 flex items-center justify-center">
          <div className="absolute w-32 h-32 border-4 border-ion-blue border-t-transparent rounded-full animate-spin"></div>
          <div className="absolute w-24 h-24 border-4 border-plasma-pink border-t-transparent rounded-full animate-spin" style={{animationDirection: 'reverse', animationDuration: '1.5s'}}></div>
        </div>
        <div className="font-heading text-2xl animate-pulse mt-4" style={{color: 'var(--ion-blue)'}}>
          Initializing Heist OS...
        </div>
        <div className="text-sm text-gray-400 mt-2">
          Loading your profile and game data...
        </div>
      </div>
    );
  }

  // Database not set up error screen
  if (loadError === 'database_not_setup') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="card-glass p-8 max-w-2xl w-full text-center">
          <div className="text-6xl mb-4">🗄️</div>
          <h1 className="font-heading text-3xl mb-4" style={{color: 'var(--danger-red)'}}>
            Database Not Set Up
          </h1>
          <p className="text-gray-300 mb-4">
            The game database needs to be initialized before you can play.
          </p>
          <div className="bg-black/40 p-4 rounded-lg text-left mb-6">
            <p className="font-bold mb-2" style={{color: 'var(--ion-blue)'}}>Quick Setup (2 minutes):</p>
            <ol className="list-decimal list-inside space-y-2 text-sm text-gray-300">
              <li>Open your <strong>Supabase Dashboard</strong> → <strong>SQL Editor</strong></li>
              <li>Run <code className="bg-black/50 px-2 py-1 rounded">supabase-schema.sql</code> (creates tables)</li>
              <li>Run <code className="bg-black/50 px-2 py-1 rounded">supabase-rls-policies.sql</code> (enables security)</li>
              <li>Run <code className="bg-black/50 px-2 py-1 rounded">DATABASE_MIGRATIONS.sql</code> (adds features)</li>
              <li>Click the retry button below</li>
            </ol>
          </div>
          <p className="text-sm text-gray-400 mb-6">
            📖 See <code className="bg-black/50 px-2 py-1 rounded">DATABASE_SETUP_GUIDE.md</code> in your repo for detailed instructions.
          </p>
          <button 
            onClick={() => {
              setLoadError(null);
              fetchGameData();
            }}
            className="px-6 py-3 rounded-lg font-bold gradient-cyan hover:scale-105 transition-transform"
          >
            🔄 Retry Connection
          </button>
          <button 
            onClick={onLogout}
            className="ml-4 px-6 py-3 rounded-lg font-bold bg-gray-700 hover:bg-gray-600 transition-colors"
          >
            Logout
          </button>
        </div>
      </div>
    );
  }

  // Network error screen
  if (loadError === 'network_error' || loadError === 'timeout_error') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="card-glass p-8 max-w-md w-full text-center">
          <div className="text-6xl mb-4">{loadError === 'timeout_error' ? '⏱️' : '📡'}</div>
          <h1 className="font-heading text-3xl mb-4" style={{color: 'var(--amber-warn)'}}>
            {loadError === 'timeout_error' ? 'Request Timeout' : 'Connection Lost'}
          </h1>
          <p className="text-gray-300 mb-6">
            {loadError === 'timeout_error' 
              ? 'The server took too long to respond. This might be due to slow internet or server issues.'
              : 'Unable to connect to the game server. Please check your internet connection and try again.'}
          </p>
          <button 
            onClick={() => {
              setLoadError(null);
              fetchGameData();
            }}
            className="px-6 py-3 rounded-lg font-bold gradient-cyan hover:scale-105 transition-transform"
          >
            🔄 Retry Connection
          </button>
        </div>
      </div>
    );
  }

  // Unknown error screen
  if (loadError) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="card-glass p-8 max-w-md w-full text-center">
          <div className="text-6xl mb-4">⚠️</div>
          <h1 className="font-heading text-3xl mb-4" style={{color: 'var(--danger-red)'}}>
            Something Went Wrong
          </h1>
          <p className="text-gray-300 mb-6">
            Failed to load game data. This might be a temporary issue.
          </p>
          <button 
            onClick={() => {
              setLoadError(null);
              fetchGameData();
            }}
            className="px-6 py-3 rounded-lg font-bold gradient-cyan hover:scale-105 transition-transform"
          >
            🔄 Try Again
          </button>
          <button 
            onClick={onLogout}
            className="ml-4 px-6 py-3 rounded-lg font-bold bg-gray-700 hover:bg-gray-600 transition-colors"
          >
            Logout
          </button>
        </div>
      </div>
    );
  }

  if (!profile || !tasks || !sessionStatus || !caps || !news) {
     return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="card-glass p-8 max-w-md w-full text-center">
          <div className="text-6xl mb-4">❌</div>
          <h1 className="font-heading text-2xl mb-4" style={{color: 'var(--danger-red)'}}>
            Critical Data Missing
          </h1>
          <p className="text-gray-300 mb-6">
            Some required game data failed to load properly.
          </p>
          <button 
            onClick={fetchGameData}
            className="px-6 py-3 rounded-lg font-bold gradient-cyan hover:scale-105 transition-transform"
          >
            🔄 Reload
          </button>
        </div>
      </div>
    );
  }

  const renderView = () => {
    switch(view) {
        case 'quest':
            return <QuestView onComplete={handleViewComplete} onGrantReward={handleGrantReward} />;
        case 'pvp':
            return <PvPView onComplete={handleViewComplete} onGrantReward={handleGrantReward} profile={profile} />;
        case 'shop':
            return <ShopView onComplete={handleViewComplete} onPurchase={handleGrantReward} profile={profile} addToast={addToast} onNavigateToInventory={() => setView('inventory')} />;
        case 'clan':
            return <ClanView onComplete={handleViewComplete} profile={profile} onUpdateProfile={setProfile} addToast={addToast} />;
        case 'inventory':
            return <InventoryView onComplete={handleViewComplete} addToast={addToast} onNavigateToShop={() => setView('shop')} />;
        case 'leaderboard':
            return <LeaderboardView onComplete={handleViewComplete} currentUserId={profile.id} />;
        case 'achievements':
            return <AchievementView onComplete={handleViewComplete} addToast={addToast} />;
        case 'teacher':
            return <TeacherPortal profile={profile} onComplete={handleViewComplete} />;
        case 'dashboard':
        default:
            // Teacher Dashboard - simplified view focused on teaching
            if (profile?.role === 'teacher') {
                return (
                    <main className="mt-6 max-w-6xl mx-auto">
                        <div className="text-center mb-8">
                            <h1 className="font-heading text-4xl mb-2" style={{color: 'var(--ion-blue)'}}>👨‍🏫 Teacher Dashboard</h1>
                            <p className="text-gray-300">Manage your questions and track student progress</p>
                        </div>
                        
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                            {/* Quick Stats */}
                            <div className="card-glass p-6">
                                <h3 className="font-heading text-xl mb-4" style={{color: 'var(--ion-blue)'}}>Overview</h3>
                                <div className="space-y-3">
                                    <div className="flex justify-between items-center p-3 bg-black/20 rounded-lg">
                                        <span className="text-gray-300">Username</span>
                                        <span className="font-bold text-white">{profile.username}</span>
                                    </div>
                                    <div className="flex justify-between items-center p-3 bg-purple-500/20 rounded-lg border border-purple-400">
                                        <span className="text-gray-300">Role</span>
                                        <span className="font-bold text-white">👨‍🏫 Teacher</span>
                                    </div>
                                </div>
                            </div>
                            
                            {/* Quick Actions */}
                            <div className="card-glass p-6">
                                <h3 className="font-heading text-xl mb-4" style={{color: 'var(--amber-warn)'}}>Quick Actions</h3>
                                <button
                                    onClick={() => setView('teacher')}
                                    className="w-full p-6 rounded-xl bg-gradient-to-r from-purple-500/20 to-blue-500/20 border-2 border-purple-400 hover:border-purple-300 transition-all hover:scale-105 active:scale-95"
                                >
                                    <div className="text-4xl mb-2">📚</div>
                                    <div className="font-heading text-xl mb-1">Question Management</div>
                                    <div className="text-sm text-gray-300">Create and manage your questions</div>
                                </button>
                            </div>
                        </div>
                        
                        {/* News Feed */}
                        <NewsFeed news={news} />
                    </main>
                );
            }
            
            // Student Dashboard - full gameplay experience
            return (
                 <main className="mt-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
                    {/* Left Column */}
                    <div className="lg:col-span-4 xl:col-span-3 space-y-6">
                        <PlayerProfileCard profile={profile} />
                        <SessionTracker sessionStatus={sessionStatus} />
                        <CapTracker caps={caps} />
                    </div>

                    {/* Middle Column */}
                    <div className="lg:col-span-5 xl:col-span-6 space-y-6">
                        <MainActions 
                            onStartQuest={() => setView('quest')} 
                            onStartPvp={() => setView('pvp')} 
                            onVisitShop={() => setView('shop')} 
                            onGoToClan={() => setView('clan')} 
                            onVisitInventory={() => setView('inventory')}
                            onViewLeaderboard={() => setView('leaderboard')}
                            onViewAchievements={() => setView('achievements')}
                            onOpenTeacherPortal={profile?.role === 'teacher' ? () => setView('teacher') : undefined} 
                        />
                        <TaskList tasks={tasks} onTasksUpdate={fetchGameData} />
                    </div>

                    {/* Right Column */}
                    <div className="lg:col-span-3 xl:col-span-3 space-y-6">
                        <NewsFeed news={news} />
                    </div>
                </main>
            );
    }
  }

  return (
    <div className="min-h-screen p-4 md:p-6 lg:p-8 max-w-screen-2xl mx-auto">
      <Header 
        profile={profile} 
        onLogout={onLogout} 
        currentView={view}
        onBackToDashboard={() => setView('dashboard')}
      />

      {/* Offline Banner */}
      {!isOnline && (
        <div className="fixed top-20 left-0 right-0 z-50 flex justify-center">
          <div className="bg-red-500/90 text-white px-6 py-3 rounded-lg shadow-lg backdrop-blur-sm">
            <p className="font-semibold">📡 No internet connection - Some features may not work</p>
          </div>
        </div>
      )}

      {renderView()}
      <div className="fixed top-6 right-6 z-[100] space-y-3">
        {toasts.map(toast => (
          <Toast 
            key={toast.id} 
            id={toast.id} 
            message={toast.message} 
            type={toast.type} 
            retryAction={toast.retryAction}
            onDismiss={() => removeToast(toast.id)} 
          />
        ))}
      </div>
      
      {/* Level Up Modal */}
      {showLevelUpModal && levelUpData && (
        <LevelUpModal
          newLevel={levelUpData.newLevel}
          rewards={levelUpData.rewards}
          onClose={() => {
            setShowLevelUpModal(false);
            setLevelUpData(null);
          }}
        />
      )}

      {/* Tutorial Modal */}
      {showTutorial && (
        <TutorialModal
          onComplete={() => {
            setShowTutorial(false);
            // Don't refetch data - tutorial already updated DB
            // Just refresh the profile to show updated tutorial_completed status
            setTimeout(async () => {
              try {
                const updatedProfile = await GameService.whoami();
                setProfile(updatedProfile);
              } catch (error) {
                console.error('Failed to refresh profile:', error);
              }
            }, 100);
          }}
          onSkip={() => {
            setShowTutorial(false);
            // Skip also marks tutorial as complete, so refresh profile
            setTimeout(async () => {
              try {
                const updatedProfile = await GameService.whoami();
                setProfile(updatedProfile);
              } catch (error) {
                console.error('Failed to refresh profile:', error);
              }
            }, 100);
          }}
        />
      )}

      {/* Toast Notifications */}
      <ToastContainer />
    </div>
  );
};

export default App;
