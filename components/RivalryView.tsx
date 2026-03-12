import React from 'react';
import BackButton from './BackButton';
import { Profile, ToastMessage } from '../types';
import { RivalryClanOption, rivalryService } from '../services/rivalryService';
import RivalryHub from './rivalry/RivalryHub';
import RivalryWarDetail from './rivalry/RivalryWarDetail';
import { RIVALRY_RULES } from '../services/rivalryRules';

const DECLARE_ERROR_MESSAGES: Record<string, string> = {
  min_clan_size_not_met:
    `War declaration blocked: both clans must have at least ${RIVALRY_RULES.minClanSizeToDeclare} members before a rivalry war can be created.`,
  declaration_cap_reached:
    `War declaration cap reached: your clan has already sent the maximum ${RIVALRY_RULES.declarationCapPer24h} declarations in the last 24 hours.`,
  active_war_conflict:
    'War declaration blocked: one of the clans is already in an active rivalry war.',
  pair_cooldown_active:
    'This matchup is cooling down. You must wait until the clan-pair cooldown ends before declaring again.',
  insufficient_permissions:
    `Only clan ${RIVALRY_RULES.declarationRoles.join(', ')} can declare rivalry wars.`,
  invalid_target_clan:
    'Invalid target clan selected. Choose a different clan and try again.',
};

const reportRivalryDeclareDiagnostic = (tag: 'unmapped-declare-error'): void => {
  console.info('[rivalry-declare-diagnostic]', tag);
};

const getFriendlyDeclareError = (rawError: unknown): string => {
  if (typeof rawError !== 'string') return 'Failed to declare war.';
  const mapped = DECLARE_ERROR_MESSAGES[rawError];
  if (mapped) return mapped;
  reportRivalryDeclareDiagnostic('unmapped-declare-error');
  return 'Failed to declare war.';
};

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
  const [declareFeedback, setDeclareFeedback] = React.useState<string | null>(null);
  const declaringRef = React.useRef(false);
  const canDeclare = Boolean(profile.clan_id);

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
    if (canDeclare) {
      void loadClanTargets('');
    } else {
      setClanTargets([]);
      setTargetSearch('');
      setClanTargetsError(null);
      setDeclareFeedback(null);
    }
  }, [loadWars, loadClanTargets, canDeclare]);

  React.useEffect(() => {
    if (!canDeclare) return;
    const t = window.setTimeout(() => {
      void loadClanTargets(targetSearch);
    }, 220);
    return () => window.clearTimeout(t);
  }, [targetSearch, loadClanTargets, canDeclare]);

  const handleDeclare = async (targetClanId: string) => {
    if (declaringRef.current) return;

    setDeclareFeedback(null);

    if (!canDeclare) {
      const message = 'You must be in a clan to declare a rivalry war.';
      setDeclareFeedback(message);
      addToast(message, 'warning');
      return;
    }

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
      const message = 'Please select a valid clan target from the list before declaring war.';
      setDeclareFeedback(message);
      addToast(message, 'warning');
      return;
    }

    declaringRef.current = true;
    setDeclaring(true);
    try {
      const res = await rivalryService.declareWar(resolvedTargetClanId);
      if (!res.success) {
        throw new Error(String(res.error || 'Failed to declare war'));
      }
      setDeclareFeedback(null);
      addToast('War declaration sent.', 'success');
      await loadWars();
      if (typeof res.war_id === 'string') {
        setSelectedWarId(res.war_id);
      }
    } catch (err) {
      const friendlyError = getFriendlyDeclareError(err instanceof Error ? err.message : err);
      setDeclareFeedback(friendlyError);
      addToast(friendlyError, 'error');
    } finally {
      declaringRef.current = false;
      setDeclaring(false);
    }
  };

  return (
    <main className="mt-6 space-y-5">
      <BackButton onClick={onComplete} label="Back to Dashboard" />

      <div className="card-glass p-4 relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-cyan-500/10 via-fuchsia-500/10 to-red-500/10" />
        <div className="relative">
          <div className="inline-flex items-center gap-2 rounded-full border border-cyan-400/30 bg-cyan-900/20 px-2.5 py-1 text-[11px] uppercase tracking-[0.2em] text-cyan-200">
            <span className="h-1.5 w-1.5 rounded-full bg-cyan-300 animate-pulse" />
            Tactical Interface
          </div>
          <h1 className="mt-2 font-heading text-2xl text-white drop-shadow-[0_0_10px_rgba(34,211,238,0.35)]">Rivalry Protocol</h1>
          <p className="text-sm text-gray-300 mt-1">Clan Wars V1 Command Center</p>
        </div>
      </div>

      {!selectedWarId ? (
        <RivalryHub
          wars={wars}
          loading={loading}
          error={error}
          onRefresh={() => void loadWars()}
          onOpenWar={setSelectedWarId}
          onDeclare={(targetClanId) => void handleDeclare(targetClanId)}
          canDeclare={canDeclare}
          declaring={declaring}
          myClanId={profile.clan_id || null}
          clanTargets={clanTargets}
          clanTargetsLoading={clanTargetsLoading}
          clanTargetsError={clanTargetsError}
          onSearchClanTargets={(search) => setTargetSearch(search)}
          onReloadClanTargets={() => {
            if (!canDeclare) {
              setDeclareFeedback(null);
              return;
            }
            void loadClanTargets(targetSearch);
          }}
          onTargetChange={() => setDeclareFeedback(null)}
          declareFeedback={declareFeedback}
        />
      ) : (
        <div className="space-y-4">
          <button onClick={() => setSelectedWarId(null)} className="rounded-lg px-3 py-2 bg-white/10 hover:bg-white/20 text-sm transition-colors">← Back to hub</button>
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
