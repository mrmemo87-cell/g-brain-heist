import React, { useState, useEffect } from 'react';
import { Profile, Task, SessionStatus, Caps, NewsEvent, ToastMessage } from './types';
import * as GameService from './services/gameService';
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
  const [view, setView] = useState<'dashboard' | 'quest' | 'pvp' | 'shop' | 'clan' | 'inventory'>('dashboard');
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const addToast = (message: string, type: ToastMessage['type'] = 'info') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);
  };

  const removeToast = (id: number) => {
    setToasts(prev => prev.filter(toast => toast.id !== id));
  };


  const fetchGameData = async () => {
    try {
      setLoading(true);
      const [profileData, tasksData, sessionData, capsData, newsData] = await Promise.all([
        GameService.whoami(),
        GameService.tasks_list(),
        GameService.session_status(),
        GameService.caps_status(),
        GameService.news_feed(),
      ]);
      setProfile(profileData);
      setTasks(tasksData);
      setSessionStatus(sessionData);
      setCaps(capsData);
      setNews(newsData);
    } catch (error) {
      console.error("Failed to load game data:", error);
      addToast("Failed to load game data.", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchGameData();
  }, []);
  
  const handleViewComplete = () => {
    setView('dashboard');
    fetchGameData(); // Refetch to sync with server state
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
      <div className="min-h-screen flex items-center justify-center">
        <div className="font-heading text-2xl animate-pulse" style={{color: 'var(--ion-blue)'}}>Initializing Heist OS...</div>
      </div>
    );
  }

  if (!profile || !tasks || !sessionStatus || !caps || !news) {
     return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="font-heading text-2xl" style={{color: 'var(--danger-red)'}}>Connection Error: Failed to load critical data.</div>
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
            return <ShopView onComplete={handleViewComplete} onPurchase={handleGrantReward} profile={profile} addToast={addToast} />;
        case 'clan':
            return <ClanView onComplete={handleViewComplete} profile={profile} onUpdateProfile={setProfile} addToast={addToast} />;
        case 'inventory':
            return <InventoryView onComplete={handleViewComplete} addToast={addToast} />;
        case 'dashboard':
        default:
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
                        <MainActions onStartQuest={() => setView('quest')} onStartPvp={() => setView('pvp')} onVisitShop={() => setView('shop')} onGoToClan={() => setView('clan')} onVisitInventory={() => setView('inventory')} />
                        <TaskList tasks={tasks} />
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
      {renderView()}
      <div className="fixed top-6 right-6 z-[100] space-y-3">
        {toasts.map(toast => (
          // FIX: Pass the 'id' prop to the Toast component as it's required by its props interface.
          <Toast key={toast.id} id={toast.id} message={toast.message} type={toast.type} onDismiss={() => removeToast(toast.id)} />
        ))}
      </div>
    </div>
  );
};

export default App;
