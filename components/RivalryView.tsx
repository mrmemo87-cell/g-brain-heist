import React from 'react';
import BackButton from './BackButton';
import { Profile, ToastMessage } from '../types';
import { rivalryService } from '../services/rivalryService';
import RivalryHub from './rivalry/RivalryHub';
import RivalryWarDetail from './rivalry/RivalryWarDetail';

interface RivalryViewProps {
  profile: Profile;
  onComplete: () => void;
  addToast: (message: string, type: ToastMessage['type']) => void;
}

const RivalryView: React.FC<RivalryViewProps> = ({ profile, onComplete, addToast }) => {
  const [selectedWarId, setSelectedWarId] = React.useState<string | null>(null);
  const [wars, setWars] = React.useState<Awaited<ReturnType<typeof rivalryService.getPublicWars>>>([]);
  const [loading, setLoading] = React.useState(false);
  const [declaring, setDeclaring] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const loadWars = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await rivalryService.getPublicWars(50);
      setWars(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load wars');
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void loadWars();
  }, [loadWars]);

  const handleDeclare = async (targetClanId: string) => {
    setDeclaring(true);
    try {
      const res = await rivalryService.declareWar(targetClanId);
      if (!res.success) {
        throw new Error(String(res.error || 'Failed to declare war'));
      }
      addToast('War declaration sent.', 'success');
      await loadWars();
      if (typeof res.war_id === 'string') {
        setSelectedWarId(res.war_id);
      }
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Failed to declare war', 'error');
    } finally {
      setDeclaring(false);
    }
  };

  return (
    <main className="mt-6 space-y-5">
      <BackButton onClick={onComplete} label="Back to Dashboard" />

      <div className="card-glass p-4">
        <h1 className="font-heading text-2xl text-white">Rivalry Protocol</h1>
        <p className="text-sm text-gray-400 mt-1">Clan Wars V1 Command Center</p>
      </div>

      {!selectedWarId ? (
        <RivalryHub
          wars={wars}
          loading={loading}
          error={error}
          onRefresh={() => void loadWars()}
          onOpenWar={setSelectedWarId}
          onDeclare={(targetClanId) => void handleDeclare(targetClanId)}
          declaring={declaring}
        />
      ) : (
        <div className="space-y-4">
          <button onClick={() => setSelectedWarId(null)} className="rounded-lg px-3 py-2 bg-white/10 hover:bg-white/20 text-sm">← Back to hub</button>
          <RivalryWarDetail
            warId={selectedWarId}
            myUserId={profile.id}
            myClanId={profile.clan_id || null}
            myClanRole={profile.clan_role || null}
            addToast={addToast}
            service={rivalryService}
          />
        </div>
      )}
    </main>
  );
};

export default RivalryView;
