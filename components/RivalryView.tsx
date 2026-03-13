import React from 'react';
import BackButton from './BackButton';
import { Profile, ToastMessage } from '../types';
import { RivalryClanOption, rivalryService } from '../services/rivalryService';
import RivalryHub from './rivalry/RivalryHub';
import RivalryWarDetail from './rivalry/RivalryWarDetail';
import { RIVALRY_RULES } from '../services/rivalryRules';

const ONBOARDING_STORAGE_KEY = 'rivalry_protocol_onboarding_seen_v2';

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

interface OnboardingSlide {
  title: string;
  body: string;
  icon: string;
  accent: string;
}

const onboardingSlides: OnboardingSlide[] = [
  {
    title: 'What is Rivalry Protocol?',
    body: 'Clan vs clan mission. Build your squad, then battle the enemy clan together.',
    icon: '⚔️',
    accent: 'from-red-500/30 to-fuchsia-500/30',
  },
  {
    title: 'Build Your Squad',
    body: 'Fill at least 5 squad slots. Every selected member gets a role in your team plan.',
    icon: '🧩',
    accent: 'from-cyan-500/30 to-blue-500/30',
  },
  {
    title: 'Pick Your Strategy',
    body: 'Choose one strategy card. Each one boosts a different playstyle for your clan.',
    icon: '🛡️',
    accent: 'from-emerald-500/30 to-cyan-500/30',
  },
  {
    title: 'Fight the War',
    body: 'Strike, sabotage, and repair to control structures and earn points for your clan.',
    icon: '🔥',
    accent: 'from-orange-500/30 to-red-500/30',
  },
  {
    title: 'Blackout + Rewards',
    body: 'Final phase hides exact score. After settlement, eligible players can claim rewards.',
    icon: '🌑',
    accent: 'from-fuchsia-500/30 to-indigo-500/30',
  },
];

const RivalryOnboardingCarousel: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [index, setIndex] = React.useState(0);
  const current = onboardingSlides[index];

  return (
    <div className="card-glass p-5 border border-cyan-400/30 relative overflow-hidden">
      <div className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${current.accent}`} />
      <div className="relative space-y-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-heading text-2xl text-white">Welcome to Rivalry Protocol</h2>
          <button type="button" onClick={onClose} className="text-xs rounded-full border border-white/30 px-3 py-1 text-gray-200 hover:bg-white/10">
            Skip
          </button>
        </div>
        <div className="rounded-2xl border border-white/20 bg-black/30 p-5 min-h-52 flex flex-col justify-between">
          <div className="text-4xl">{current.icon}</div>
          <div>
            <h3 className="font-heading text-xl text-white">{current.title}</h3>
            <p className="mt-2 text-sm text-gray-200 max-w-xl">{current.body}</p>
          </div>
          <div className="mt-4 flex items-center gap-2">
            {onboardingSlides.map((_, dot) => (
              <span key={dot} className={`h-2 rounded-full transition-all ${dot === index ? 'w-6 bg-cyan-300' : 'w-2 bg-white/40'}`} />
            ))}
          </div>
        </div>
        <div className="flex justify-between gap-2">
          <button type="button" onClick={() => setIndex((prev) => Math.max(prev - 1, 0))} disabled={index === 0} className="rounded-lg px-4 py-2 bg-white/10 hover:bg-white/20 disabled:opacity-50 text-sm text-white">
            Back
          </button>
          {index === onboardingSlides.length - 1 ? (
            <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 bg-cyan-500 hover:bg-cyan-400 text-sm font-semibold text-slate-900">
              Start Mission
            </button>
          ) : (
            <button type="button" onClick={() => setIndex((prev) => Math.min(prev + 1, onboardingSlides.length - 1))} className="rounded-lg px-4 py-2 bg-cyan-500 hover:bg-cyan-400 text-sm font-semibold text-slate-900">
              Next
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

const RivalryView: React.FC<RivalryViewProps> = ({ profile, onComplete, addToast }) => {
  const [selectedWarId, setSelectedWarId] = React.useState<string | null>(null);
  const [wars, setWars] = React.useState<Awaited<ReturnType<typeof rivalryService.getPublicWars>>>([]);
  const [loading, setLoading] = React.useState(false);
  const [declaring, setDeclaring] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [showOnboarding, setShowOnboarding] = React.useState<boolean | null>(null);

  const [clanTargets, setClanTargets] = React.useState<RivalryClanOption[]>([]);
  const [clanTargetsLoading, setClanTargetsLoading] = React.useState(false);
  const [clanTargetsError, setClanTargetsError] = React.useState<string | null>(null);
  const [targetSearch, setTargetSearch] = React.useState('');
  const [declareFeedback, setDeclareFeedback] = React.useState<string | null>(null);
  const declaringRef = React.useRef(false);
  const canDeclare = Boolean(profile.clan_id);

  React.useEffect(() => {
    const seen = window.localStorage.getItem(ONBOARDING_STORAGE_KEY);
    setShowOnboarding(!seen);
  }, []);

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

    const selectedTarget = clanTargets.find((clan) => clan.id === targetClanId);
    if (!selectedTarget) {
      const message = 'Please select a valid clan target from the list before declaring war.';
      setDeclareFeedback(message);
      addToast(message, 'warning');
      return;
    }

    declaringRef.current = true;
    setDeclaring(true);
    try {
      const res = await rivalryService.declareWar(selectedTarget.id);
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

  if (showOnboarding === null) {
    return (
      <main className="mt-6 space-y-5">
        <BackButton onClick={onComplete} label="Back to Dashboard" />
        <div className="card-glass p-4 text-sm text-gray-300">Loading Rivalry Protocol…</div>
      </main>
    );
  }

  return (
    <main className="mt-6 space-y-5">
      <BackButton onClick={onComplete} label="Back to Dashboard" />

      <div className="card-glass p-4 relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-cyan-500/10 via-fuchsia-500/10 to-red-500/10" />
        <div className="relative">
          <div className="inline-flex items-center gap-2 rounded-full border border-cyan-400/30 bg-cyan-900/20 px-2.5 py-1 text-[11px] uppercase tracking-[0.2em] text-cyan-200">
            <span className="h-1.5 w-1.5 rounded-full bg-cyan-300 animate-pulse" />
            Mission Lobby
          </div>
          <h1 className="mt-2 font-heading text-2xl text-white drop-shadow-[0_0_10px_rgba(34,211,238,0.35)]">Rivalry Protocol</h1>
          <p className="text-sm text-gray-300 mt-1">A guided clan-vs-clan mission flow for students.</p>
        </div>
      </div>

      {showOnboarding !== null && showOnboarding ? <RivalryOnboardingCarousel onClose={() => {
        window.localStorage.setItem(ONBOARDING_STORAGE_KEY, '1');
        setShowOnboarding(false);
      }} /> : null}

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
          <button onClick={() => setSelectedWarId(null)} className="rounded-lg px-3 py-2 bg-white/10 hover:bg-white/20 text-sm transition-colors">← Back to mission lobby</button>
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
