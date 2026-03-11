import React from 'react';
import BackButton from './BackButton';
import { Profile, ToastMessage } from '../types';
import { RivalryClanOption, rivalryService } from '../services/rivalryService';
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

  const [clanTargets, setClanTargets] = React.useState<RivalryClanOption[]>([]);
  const [clanTargetsLoading, setClanTargetsLoading] = React.useState(false);
  const [clanTargetsError, setClanTargetsError] = React.useState<string | null>(null);
  const [targetSearch, setTargetSearch] = React.useState('');

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

  const loadClanTargets = React.useCallback(async (search: string) => {
    setClanTargetsLoading(true);
    setClanTargetsError(null);
    try {
      const data = await rivalryService.listClanTargets(search, 80);
      setClanTargets(data);
    } catch (err) {
      setClanTargetsError(err instanceof Error ? err.message : 'Failed to load clan targets');
    } finally {
      setClanTargetsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void loadWars();
    void loadClanTargets('');
  }, [loadWars, loadClanTargets]);

  React.useEffect(() => {
    const t = window.setTimeout(() => {
      void loadClanTargets(targetSearch);
    }, 220);
    return () => window.clearTimeout(t);
  }, [targetSearch, loadClanTargets]);

  const handleDeclare = async (targetClanId: string) => {
    const normalizeTargetClanId = (raw: string): string | null => {
      const value = raw.trim();
      const uuidLike = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      if (uuidLike.test(value)) return value;

      const exactByName = clanTargets.find((c) => c.name.toLowerCase() === value.toLowerCase());
      if (exactByName) return exactByName.id;

      const prefixMatches = clanTargets.filter((c) => c.name.toLowerCase().startsWith(value.toLowerCase()));
      if (prefixMatches.length === 1) return prefixMatches[0].id;

      return null;
    };

    const resolvedTargetClanId = normalizeTargetClanId(targetClanId);
    if (!resolvedTargetClanId) {
      addToast('Please select a valid clan target from the list before declaring war.', 'warning');
      return;
    }

    setDeclaring(true);
    try {
      const res = await rivalryService.declareWar(resolvedTargetClanId);
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
          myClanId={profile.clan_id || null}
          clanTargets={clanTargets}
          clanTargetsLoading={clanTargetsLoading}
          clanTargetsError={clanTargetsError}
          onSearchClanTargets={(search) => setTargetSearch(search)}
          onReloadClanTargets={() => void loadClanTargets(targetSearch)}
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
