import React, { useState, useCallback, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import gsap from 'gsap';
import type {
  QuestNode,
  QuestChestResult,
  SoloDifficulty,
  TeacherQuestion,
  XpStatus,
} from '../../types';
import { recordSoloQuestion } from '../../services/adaptiveService';
import {
  quest_start_run,
  quest_resume_run,
  quest_answer_node,
  quest_claim_event,
  quest_retreat,
  quest_open_chest,
  quest_abandon,
} from '../../services/gameService';
import { CoinIcon, XPIcon } from '../icons';
import RouteNode from './RouteNode';
import AvatarToken from './AvatarToken';
import StreakMeter from './StreakMeter';
import EventModal from './EventModal';
import ChestRevealModal from './ChestRevealModal';
import RetreatConfirmModal from './RetreatConfirmModal';
import SpinWheelModal from './SpinWheelModal';
import type { SpinPrize } from './SpinWheelModal';
import { getRandomRiddle } from './riddles';
import type { FunnyRiddle } from './riddles';
import { playSound } from '../../services/soundManager';
import { QUEST_BACKGROUND } from './nodeAssets';

// ─── Reward Particle (reused from QuestView pattern) ──────────────────────

interface RewardParticleProps {
  id: string;
  type: 'xp' | 'coin';
  startRect: DOMRect;
  onComplete: (id: string) => void;
}

const RewardParticle: React.FC<RewardParticleProps> = ({ id, type, startRect, onComplete }) => {
  const elRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = elRef.current;
    if (!el) return;
    const destinationIds = type === 'xp' ? ['xp-hud', 'mission-xp'] : ['coin-hud', 'mission-coin'];
    const destination = destinationIds
      .map((destId) => document.getElementById(destId))
      .find(Boolean);
    if (!destination) { onComplete(id); return; }

    const destRect = destination.getBoundingClientRect();
    const endX = destRect.left + destRect.width / 2;
    const endY = destRect.top + destRect.height / 2;

    const animation = el.animate([
      { transform: 'translate(0, 0) scale(1)', opacity: 1 },
      { transform: `translate(${endX - startRect.left}px, ${endY - startRect.top}px) scale(0.2)`, opacity: 0 },
    ], {
      duration: 800 + Math.random() * 200,
      easing: 'cubic-bezier(0.5, 0, 0.9, 0.5)',
      fill: 'forwards',
    });
    animation.onfinish = () => onComplete(id);
  }, [id, type, startRect, onComplete]);

  const iconColor = type === 'xp' ? 'var(--ion-blue)' : 'var(--amber-warn)';
  return (
    <div ref={elRef} style={{
      position: 'fixed',
      left: startRect.left + (Math.random() - 0.5) * startRect.width,
      top: startRect.top + (Math.random() - 0.5) * startRect.height,
      pointerEvents: 'none', zIndex: 420,
    }}>
      <div className="w-6 h-6" style={{ color: iconColor, filter: `drop-shadow(0 0 5px ${iconColor})` }}>
        {type === 'xp' ? <XPIcon /> : <CoinIcon />}
      </div>
    </div>
  );
};

// ─── MissionBoard ─────────────────────────────────────────────────────────

/** Build a fully-hydrated client-side route from teacher questions (no DB call). */
function buildVirtualRoute(questions: TeacherQuestion[]): QuestNode[] {
  const optText = (o: string | { text: string }): string =>
    typeof o === 'string' ? o : o.text;

  const route: QuestNode[] = [
    { index: 0, type: 'start', label: 'Start Base', state: 'active' },
  ];

  let nextIndex = 1;
  questions.forEach((q, i) => {
    const isLast = i === questions.length - 1;
    const isElite = isLast || (i > 0 && i % 3 === 0);
    const zone = Math.floor(i / 2) + 1;

    route.push({
      index: nextIndex,
      type: isElite ? 'elite_question' : 'question',
      label: `Zone ${zone} • Station ${i + 1}`,
      difficulty: (q.difficulty || 'medium') as SoloDifficulty,
      state: 'locked',
      question_body: q.question_text,
      options: (q.options ?? []).map(optText),
      correct_option: q.correct_answer ?? '',
      explanation: q.explanation ?? '',
      time_limit: q.time_limit ?? 30,
    });
    nextIndex += 1;

    if (!isLast && (i + 1) % 2 === 0) {
      route.push({
        index: nextIndex,
        type: 'surprise',
        label: `Fun Station ${Math.floor((i + 1) / 2)}`,
        state: 'locked',
      });
      nextIndex += 1;
    }
  });

  route.push({
    index: nextIndex,
    type: 'reward',
    label: 'Supply Cache',
    state: 'locked',
    event_payload: { xp: 20, coins: 30 },
  });
  nextIndex += 1;
  route.push({
    index: nextIndex,
    type: 'final_chest',
    label: 'Mission Vault',
    state: 'locked',
  });

  return route;
}

interface MissionBoardProps {
  missionId: string;
  missionTitle: string;
  missionSubject?: string;
  missionDifficulty?: string;
  missionType?: string;
  avatarUrl?: string;
  activeRunId?: string | null;
  /** When provided, the board runs entirely client-side — no DB run is created. */
  virtualRun?: { questions: TeacherQuestion[] };
  onGrantReward: (deltas: { xp: number; coins: number; gemstones?: number }, finalValues?: { xp: number; coins: number; level: number; gemstones: number; xp_status?: XpStatus }) => void;
  onComplete: (result: QuestChestResult) => void;
  onRetreat: (rewardsXp: number, rewardsCoins: number) => void;
  onBack: () => void;
}

const MissionBoard: React.FC<MissionBoardProps> = ({
  missionId, missionTitle, missionSubject, missionDifficulty, missionType,
  avatarUrl, activeRunId, virtualRun, onGrantReward, onComplete, onRetreat, onBack,
}) => {  const isVirtual = !!virtualRun;
  // ── Board lifecycle phase ──
  const [boardPhase, setBoardPhase] = useState<'start' | 'loading' | 'playing'>('start');
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Track fullscreen changes
  useEffect(() => {
    const onFsChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  // ── Loading state ──
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // ── Run state (from server) ──
  const [runId, setRunId] = useState<string | null>(null);
  const [route, setRoute] = useState<QuestNode[]>([]);
  const [currentNode, setCurrentNode] = useState(0);
  const [streak, setStreak] = useState(0);
  const [rewardsXp, setRewardsXp] = useState(0);
  const [rewardsCoins, setRewardsCoins] = useState(0);
  const [questionStartTime, setQuestionStartTime] = useState<number | null>(null);

  // ── Modal state ──
  const [activeModal, setActiveModal] = useState<'none' | 'question' | 'riddle' | 'event' | 'spin' | 'chest' | 'retreat'>('none');
  const [activeRiddle, setActiveRiddle] = useState<FunnyRiddle | null>(null);
  const [riddleResult, setRiddleResult] = useState<{ correct: boolean; explanation: string } | null>(null);
  const [activeNodeIndex, setActiveNodeIndex] = useState<number | null>(null);
  const [questionResult, setQuestionResult] = useState<{ is_correct: boolean; explanation?: string } | null>(null);
  const [eventResult, setEventResult] = useState<{ xp?: number; coins?: number; effect?: string } | null>(null);
  const [chestResult, setChestResult] = useState<QuestChestResult | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // ── Particles ──
  const [particles, setParticles] = useState<Omit<RewardParticleProps, 'onComplete'>[]>([]);
  const boardRef = useRef<HTMLDivElement>(null);
  const routeLineRef = useRef<HTMLDivElement>(null);
  const startedRef = useRef(false);
  const playingRef = useRef<HTMLDivElement>(null);

  const centerNodeInView = useCallback((nodeIndex: number, behavior: ScrollBehavior = 'smooth') => {
    if (!playingRef.current) return;
    const container = playingRef.current;
    const target = container.querySelector<HTMLElement>(`[data-node-index="${nodeIndex}"]`);
    if (!target) return;

    const targetCenter = target.offsetTop + target.offsetHeight / 2;
    const desiredScrollTop = targetCenter - container.clientHeight / 2;
    const maxScroll = Math.max(0, container.scrollHeight - container.clientHeight);
    const nextTop = Math.max(0, Math.min(desiredScrollTop, maxScroll));
    container.scrollTo({ top: nextTop, behavior });
  }, []);

  // ── Start game: request fullscreen then kick off run ──
  const handleStartGame = useCallback(async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      }
    } catch (_) {
      // Fullscreen may be blocked — proceed anyway
    }
    setBoardPhase('loading');
  }, []);

  // ── Exit game ──
  const handleExit = useCallback(() => {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }
    onBack();
  }, [onBack]);

  // ── Start run when entering 'loading' phase ──
  // Guard with ref to prevent StrictMode double-fire (start_run has side effects)
  useEffect(() => {
    if (boardPhase !== 'loading') return;
    if (startedRef.current) return;
    startedRef.current = true;

    // Virtual mode: build route client-side, no DB call
    if (isVirtual && virtualRun) {
      const virtualRoute = buildVirtualRoute(virtualRun.questions);
      setRunId(null);
      setRoute(virtualRoute);
      setCurrentNode(0);
      setStreak(0);
      setRewardsXp(0);
      setRewardsCoins(0);
      setIsLoading(false);
      setBoardPhase('playing');
      return;
    }

    (async () => {
      try {
        const runState = activeRunId
          ? await quest_resume_run(activeRunId)
          : await quest_start_run(missionId);

        const serverRoute = (Array.isArray(runState.route) ? runState.route : []) as QuestNode[];
        const shouldStartAtBase = !activeRunId && runState.current_node === 1 && serverRoute[0]?.type === 'start';
        const normalizedRoute = shouldStartAtBase
          ? serverRoute.map((node, idx) => {
            if (idx === 0) return { ...node, state: 'active' as const };
            if (idx === 1) return { ...node, state: 'locked' as const };
            return node;
          })
          : serverRoute;

        setRunId(runState.run_id);
        setRoute(normalizedRoute);
        setCurrentNode(shouldStartAtBase ? 0 : runState.current_node);
        setStreak(runState.streak);
        setRewardsXp(runState.rewards_xp);
        setRewardsCoins(runState.rewards_coins);
        setIsLoading(false);
        setBoardPhase('playing');
      } catch (err: any) {
        setLoadError(err?.message || 'Failed to start quest run. Please try again.');
        setIsLoading(false);
        setBoardPhase('playing'); // show error state
      }
    })();
  }, [boardPhase, missionId, activeRunId, isVirtual, virtualRun]);

  useEffect(() => {
    if (boardPhase !== 'playing' || route.length === 0) return;
    const behavior: ScrollBehavior = currentNode === 0 ? 'auto' : 'smooth';
    const timer = window.setTimeout(() => centerNodeInView(currentNode, behavior), 80);
    return () => window.clearTimeout(timer);
  }, [boardPhase, route.length, currentNode, centerNodeInView]);

  // ── Route path illumination ──
  useEffect(() => {
    if (!routeLineRef.current) return;
    const segments = routeLineRef.current.querySelectorAll('[data-route-segment] path');
    segments.forEach((seg, i) => {
      const el = seg as SVGPathElement;
      // Stagger reveal: paths draw in sequentially
      gsap.fromTo(el,
        { opacity: 0 },
        { opacity: 1, duration: 0.4, delay: i * 0.12, ease: 'power2.out' }
      );
      if (i < currentNode) {
        gsap.to(el, {
          attr: { stroke: 'rgba(34,211,238,0.7)', 'stroke-width': '0.5' },
          duration: 0.5, delay: i * 0.12 + 0.3, ease: 'power2.out',
        });
      }
    });
  }, [route.length]);

  // ── Route path illumination on node advancement ──
  useEffect(() => {
    if (!routeLineRef.current) return;
    const segments = routeLineRef.current.querySelectorAll('[data-route-segment] path');
    segments.forEach((seg, i) => {
      const el = seg as SVGPathElement;
      if (i < currentNode) {
        gsap.to(el, {
          attr: { stroke: 'rgba(34,211,238,0.7)', 'stroke-width': '0.5' },
          duration: 0.5, ease: 'power2.out',
        });
      }
    });
  }, [currentNode]);

  const handleParticleComplete = useCallback((id: string) => {
    setParticles(p => p.filter(x => x.id !== id));
  }, []);

  const spawnParticles = useCallback((xp: number, coins: number) => {
    if (!boardRef.current) return;
    const rect = boardRef.current.getBoundingClientRect();
    // Center the start rect on the board
    const startRect = new DOMRect(rect.left + rect.width / 2 - 20, rect.top + rect.height / 2 - 20, 40, 40);
    const newParticles: Omit<RewardParticleProps, 'onComplete'>[] = [];
    if (xp > 0) {
      for (let i = 0; i < 5; i++) newParticles.push({ id: `xp_${Date.now()}_${i}`, type: 'xp', startRect });
    }
    if (coins > 0) {
      for (let i = 0; i < 5; i++) newParticles.push({ id: `coin_${Date.now()}_${i}`, type: 'coin', startRect });
    }
    setParticles(prev => [...prev, ...newParticles]);
  }, []);

  // ── Advance to next node ──
  const advanceToNode = useCallback((nextIndex: number) => {
    setRoute(prev => prev.map((node, i) => {
      if (i < nextIndex) return { ...node, state: 'cleared' as const };
      if (i === nextIndex) return { ...node, state: 'active' as const };
      return node;
    }));
    setCurrentNode(nextIndex);
    setActiveModal('none');
    setActiveNodeIndex(null);
    setQuestionResult(null);
    setEventResult(null);
  }, []);

  // ── Node click handler ──
  const handleNodeClick = useCallback((index: number) => {
    const node = route[index];
    if (!node) return;
    if (node.state !== 'active') return;

    setActiveNodeIndex(index);

    switch (node.type) {
      case 'start':
        // Immediately advance from start
        advanceToNode(index + 1);
        break;
      case 'question':
        setQuestionResult(null);
        setQuestionStartTime(Date.now());
        setActiveModal('question');
        break;
      case 'elite_question':
        // Funny riddle from local bank
        setActiveRiddle(getRandomRiddle());
        setRiddleResult(null);
        setActiveModal('riddle');
        playSound('riddleAppear');
        break;
      case 'reward':
        setEventResult(null);
        setActiveModal('event');
        break;
      case 'surprise':
        setActiveModal('spin');
        break;
      case 'final_chest':
        openChest();
        break;
    }
  }, [route, advanceToNode, openChest]);

  // ── Answer a question node (server RPC) ──
  const handleQuestionAnswer = useCallback(async (selectedOption: string) => {
    if (activeNodeIndex === null) return;
    const node = route[activeNodeIndex];
    if (!node) return;

    // Virtual mode: evaluate answer client-side
    if (!runId) {
      const isCorrect = selectedOption === node.correct_option;
      const xp = isCorrect ? (node.type === 'elite_question' ? 25 : 10) : 0;
      const coins = isCorrect ? (node.type === 'elite_question' ? 15 : 5) : 0;
      playSound(isCorrect ? 'correct' : 'wrong');
      setStreak(prev => isCorrect ? prev + 1 : 0);
      if (isCorrect) {
        setRewardsXp(prev => prev + xp);
        setRewardsCoins(prev => prev + coins);
        spawnParticles(xp, coins);
        onGrantReward({ xp, coins });
      }
      setQuestionResult({ is_correct: isCorrect, explanation: node.explanation });
      return;
    }
    setIsSubmitting(true);

    const difficulty = (node.difficulty ?? 'medium') as SoloDifficulty;
    const timeLimitSeconds = node.time_limit ?? 30;
    const answerTimeSeconds = questionStartTime ? (Date.now() - questionStartTime) / 1000 : timeLimitSeconds;

    try {
      const result = await quest_answer_node(runId, activeNodeIndex, selectedOption);
      const isCorrect = result.is_correct;
      const xpDelta = result.deltas.xp;
      const coinsDelta = result.deltas.coins;

      playSound(isCorrect ? 'correct' : 'wrong');
      setStreak(result.streak);
      setRewardsXp(prev => prev + Math.max(0, xpDelta));
      setRewardsCoins(prev => prev + Math.max(0, coinsDelta));

      if (isCorrect && (xpDelta > 0 || coinsDelta > 0)) {
        spawnParticles(xpDelta, coinsDelta);
      }

      // Sync parent HUD with server profile values
      onGrantReward(
        { xp: xpDelta, coins: coinsDelta },
        result.final_profile_values as any,
      );

      // Record for adaptive tracking
      recordSoloQuestion({
        topicId: missionId,
        branchId: `quest_${missionTitle.toLowerCase().replace(/\s+/g, '_')}`,
        difficulty,
        timeLimitSeconds,
        answerTimeSeconds,
        wasCorrect: isCorrect,
        timestamp: new Date().toISOString(),
      });

      setQuestionResult({ is_correct: isCorrect, explanation: result.explanation });
    } catch (err) {
      console.error('[MissionBoard] quest_answer_node failed:', err);
      // Graceful fallback so player isn't stuck
      const isCorrect = selectedOption === node.correct_option;
      setStreak(prev => isCorrect ? prev + 1 : 0);
      setQuestionResult({ is_correct: isCorrect, explanation: node.explanation });
    } finally {
      setIsSubmitting(false);
    }
  }, [activeNodeIndex, runId, route, questionStartTime, spawnParticles, onGrantReward, missionId, missionTitle]);

  // ── Close question modal & advance ──
  const handleQuestionClose = useCallback(() => {
    if (activeNodeIndex === null) return;
    advanceToNode(activeNodeIndex + 1);
  }, [activeNodeIndex, advanceToNode]);

  // ── Answer a funny riddle (elite_question — client-side) ──
  const handleRiddleAnswer = useCallback((selectedOption: string) => {
    if (!activeRiddle) return;
    const isCorrect = selectedOption === activeRiddle.correct;

    playSound(isCorrect ? 'correct' : 'wrong');
    // Update streak
    setStreak(prev => isCorrect ? prev + 1 : 0);

    // Award XP/coins for riddles (more generous than normal questions)
    if (isCorrect) {
      const xp = 25;
      const coins = 15;
      setRewardsXp(prev => prev + xp);
      setRewardsCoins(prev => prev + coins);
      spawnParticles(xp, coins);
      onGrantReward({ xp, coins });
    }

    setRiddleResult({ correct: isCorrect, explanation: activeRiddle.explanation });
  }, [activeRiddle, spawnParticles, onGrantReward]);

  // ── Close riddle modal & advance ──
  const handleRiddleClose = useCallback(() => {
    if (activeNodeIndex === null) return;
    setActiveRiddle(null);
    setRiddleResult(null);
    advanceToNode(activeNodeIndex + 1);
  }, [activeNodeIndex, advanceToNode]);

  // ── Claim spin wheel prize (surprise node) ──
  const handleSpinClaim = useCallback(async (prize: SpinPrize) => {
    if (activeNodeIndex === null) return;
    setIsSubmitting(true);

    const xp = prize.reward.xp ?? 0;
    const coins = prize.reward.coins ?? 0;

    try {
      // Fire event RPC to record on server
      const result = await quest_claim_event(runId, activeNodeIndex);
      setRewardsXp(prev => prev + Math.max(xp, result.deltas.xp));
      setRewardsCoins(prev => prev + Math.max(coins, result.deltas.coins));
      spawnParticles(xp || result.deltas.xp, coins || result.deltas.coins);
      onGrantReward(
        { xp: xp || result.deltas.xp, coins: coins || result.deltas.coins },
        result.final_profile_values as any,
      );
      setIsSubmitting(false);
      setTimeout(() => advanceToNode(result.next_node_index), 400);
    } catch {
      // Fallback: apply spin reward locally
      setRewardsXp(prev => prev + xp);
      setRewardsCoins(prev => prev + coins);
      if (xp > 0 || coins > 0) spawnParticles(xp, coins);
      onGrantReward({ xp, coins });
      setIsSubmitting(false);
      setTimeout(() => advanceToNode(activeNodeIndex + 1), 400);
    }
  }, [activeNodeIndex, runId, spawnParticles, onGrantReward, advanceToNode]);

  // ── Resolve event node (server RPC) ──
  const handleEventClaim = useCallback(async () => {
    if (activeNodeIndex === null) return;
    setIsSubmitting(true);

    try {
      const result = await quest_claim_event(runId, activeNodeIndex);
      const xpDelta = result.deltas.xp;
      const coinsDelta = result.deltas.coins;

      setRewardsXp(prev => prev + xpDelta);
      setRewardsCoins(prev => prev + coinsDelta);
      spawnParticles(xpDelta, coinsDelta);

      onGrantReward(
        { xp: xpDelta, coins: coinsDelta },
        result.final_profile_values as any,
      );

      setEventResult(result.event_payload);
      setIsSubmitting(false);

      // Auto-advance after short delay
      setTimeout(() => advanceToNode(result.next_node_index), 600);
    } catch (err) {
      console.error('[MissionBoard] quest_claim_event failed:', err);
      // Fallback: use local payload
      const node = route[activeNodeIndex];
      const payload = node.event_payload ?? { xp: 15, coins: 20 };
      const xpDelta = payload.xp ?? 0;
      const coinsDelta = payload.coins ?? 0;

      setRewardsXp(prev => prev + xpDelta);
      setRewardsCoins(prev => prev + coinsDelta);
      spawnParticles(xpDelta, coinsDelta);
      onGrantReward({ xp: xpDelta, coins: coinsDelta });

      setEventResult(payload);
      setIsSubmitting(false);
      setTimeout(() => advanceToNode(activeNodeIndex + 1), 600);
    }
  }, [activeNodeIndex, runId, route, spawnParticles, onGrantReward, advanceToNode]);

  // ── Open final chest (server RPC or local fallback for virtual runs) ──
  const openChest = useCallback(async () => {
    if (!runId) {
      // Virtual mode: compute chest locally
      const questionsCleared = route.filter(n => n.type === 'question' || n.type === 'elite_question').length;
      const streakBonus = streak >= 6 ? 1.5 : streak >= 4 ? 1.25 : streak >= 2 ? 1.1 : 1.0;
      const tier = streak >= 6 ? 'gold' : streak >= 3 ? 'silver' : 'bronze';
      const chestXp = Math.round(30 * streakBonus);
      const chestCoins = Math.round(60 * streakBonus);
      onGrantReward({ xp: chestXp, coins: chestCoins });
      spawnParticles(chestXp, chestCoins);
      setChestResult({
        chest_tier: tier as 'bronze' | 'silver' | 'gold',
        chest_rewards: { xp: chestXp, coins: chestCoins },
        total_run_xp: rewardsXp + chestXp,
        total_run_coins: rewardsCoins + chestCoins,
        streak_peak: streak,
        perfect_run: false,
        nodes_cleared: questionsCleared,
      });
      setActiveModal('chest');
      return;
    }

    try {
      const result = await quest_open_chest(runId);

      const chestXp = result.chest_rewards.xp;
      const chestCoins = result.chest_rewards.coins;

      onGrantReward(
        { xp: chestXp, coins: chestCoins },
        result.final_profile_values as any,
      );
      spawnParticles(chestXp, chestCoins);

      setChestResult({
        chest_tier: result.chest_tier,
        chest_rewards: result.chest_rewards,
        total_run_xp: result.total_run_xp,
        total_run_coins: result.total_run_coins,
        streak_peak: result.streak_peak,
        perfect_run: result.perfect_run,
        nodes_cleared: result.nodes_cleared,
      });
      setActiveModal('chest');
    } catch (err) {
      console.error('[MissionBoard] quest_open_chest failed:', err);
      // Fallback: compute locally
      const streakBonus = streak >= 6 ? 1.2 : streak >= 4 ? 1.1 : 1.0;
      const chestXp = Math.round(15 * streakBonus);
      const chestCoins = Math.round(50 * streakBonus);

      onGrantReward({ xp: chestXp, coins: chestCoins });
      spawnParticles(chestXp, chestCoins);

      setChestResult({
        chest_tier: 'bronze',
        chest_rewards: { xp: chestXp, coins: chestCoins },
        total_run_xp: rewardsXp + chestXp,
        total_run_coins: rewardsCoins + chestCoins,
        streak_peak: streak,
        perfect_run: false,
        nodes_cleared: currentNode,
      });
      setActiveModal('chest');
    }
  }, [runId, streak, rewardsXp, rewardsCoins, currentNode, onGrantReward, spawnParticles]);

  // ── Retreat (server RPC or local fallback for virtual runs) ──
  const handleRetreatConfirm = useCallback(async () => {
    if (!runId) {
      setActiveModal('none');
      onRetreat(rewardsXp, rewardsCoins);
      return;
    }
    try {
      const result = await quest_retreat(runId);
      setActiveModal('none');
      onRetreat(result.rewards_xp, result.rewards_coins);
    } catch (err) {
      console.error('[MissionBoard] quest_retreat failed:', err);
      setActiveModal('none');
      onRetreat(rewardsXp, rewardsCoins);
    }
  }, [runId, rewardsXp, rewardsCoins, onRetreat]);

  // ── Chest close ──
  const handleChestClose = useCallback(() => {
    if (chestResult) onComplete(chestResult);
  }, [chestResult, onComplete]);

  const canRetreat = currentNode >= 3;
  const activeNode = activeNodeIndex !== null ? route[activeNodeIndex] : null;

  // ── Streak bonus display ──
  const streakBonusPct = streak >= 6 ? 54 : streak >= 4 ? 32 : streak >= 2 ? 15 : 0;
  const subjectLabel = (missionSubject ?? 'MISSION').toUpperCase();
  const riskLabel = missionType === 'risk' ? 'HIGH' : missionType === 'daily' ? 'DAILY' : (missionDifficulty ?? 'MEDIUM').toUpperCase();

  // ── Start Screen ──
  if (boardPhase === 'start') {
    return createPortal(
      <div
        ref={boardRef}
        className="fixed inset-0 z-[200] flex flex-col"
        style={{
          background: 'linear-gradient(180deg, #07051a 0%, #0e0730 30%, #1a1040 60%, #0e0730 85%, #07051a 100%)',
          backgroundImage: `url('${QUEST_BACKGROUND}')`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
        }}
      >
        {/* Stars layer */}
        <div className="absolute inset-0 pointer-events-none" style={{
          backgroundImage: 'radial-gradient(1.5px 1.5px at 15% 10%, rgba(255,255,255,0.5) 50%, transparent 100%), radial-gradient(1px 1px at 55% 20%, rgba(255,255,255,0.4) 50%, transparent 100%), radial-gradient(2px 2px at 75% 40%, rgba(255,255,255,0.35) 50%, transparent 100%), radial-gradient(1px 1px at 30% 60%, rgba(255,255,255,0.3) 50%, transparent 100%), radial-gradient(1.5px 1.5px at 88% 70%, rgba(255,255,255,0.4) 50%, transparent 100%), radial-gradient(1px 1px at 45% 85%, rgba(255,255,255,0.25) 50%, transparent 100%)',
        }} />
        {/* Atmosphere glow */}
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[500px] h-[400px] rounded-full pointer-events-none" style={{
          background: 'radial-gradient(ellipse, rgba(139,92,246,0.2) 0%, transparent 70%)',
        }} />

        {/* Exit button — top right */}
        <div className="relative z-10 flex items-center justify-between px-5 pt-5 pb-2">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-900/70 border border-cyan-500/30">
            <span className="text-cyan-400 text-xs">🔒</span>
            <span className="text-cyan-300 font-black text-xs tracking-wider uppercase">{subjectLabel}</span>
          </div>
          <button
            onClick={handleExit}
            className="px-4 py-2 rounded-xl bg-slate-900/80 border border-red-500/40 text-red-300 hover:text-red-100 hover:border-red-400 hover:bg-red-950/50 transition-all text-sm font-bold shadow-lg"
          >
            ✕ EXIT
          </button>
        </div>

        {/* Mission title area */}
        <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-6 text-center gap-6">
          <div className="space-y-2">
            <p className="text-cyan-400/80 text-xs font-black tracking-[0.3em] uppercase">— MISSION BRIEFING —</p>
            <h1 className="text-white font-black text-3xl leading-tight" style={{
              textShadow: '0 0 30px rgba(139,92,246,0.8), 0 0 60px rgba(34,211,238,0.4)',
            }}>
              {missionTitle}
            </h1>
          </div>

          <div className="flex items-center gap-3">
            <div className="px-3 py-1.5 rounded-xl bg-slate-900/70 border border-amber-500/30">
              <span className="text-amber-300 font-bold text-xs">RISK: <span className="text-white">{riskLabel}</span></span>
            </div>
            <div className="px-3 py-1.5 rounded-xl bg-slate-900/70 border border-purple-500/30">
              <span className="text-purple-300 font-bold text-xs">REWARD: <span className="text-white">~200+ XP</span></span>
            </div>
          </div>

          {/* Decorative hex grid / map preview */}
          <div className="w-full max-w-xs opacity-30 pointer-events-none select-none" style={{ filter: 'blur(1px)' }}>
            <svg viewBox="0 0 200 120" className="w-full h-auto">
              {[1,2,3,4,5].map((i) => (
                <circle key={i} cx={20 + i * 35} cy={60 + (i % 2 === 0 ? -20 : 20)} r="10"
                  fill="none" stroke="rgba(34,211,238,0.6)" strokeWidth="1" strokeDasharray="4 2" />
              ))}
              {[0,1,2,3].map((i) => (
                <line key={`l${i}`} x1={30 + i * 35} y1={60 + (i % 2 === 0 ? -20 : 20)}
                  x2={55 + i * 35} y2={60 + ((i+1) % 2 === 0 ? -20 : 20)}
                  stroke="rgba(139,92,246,0.4)" strokeWidth="0.8" strokeDasharray="3 2" />
              ))}
            </svg>
          </div>

          <p className="text-slate-400 text-sm max-w-[260px] leading-relaxed">
            Navigate the mission map, answer questions, and claim your chest reward.
          </p>
        </div>

        {/* Bottom: START button */}
        <div className="relative z-10 px-6 pb-10 pt-4 space-y-3">
          <button
            onClick={handleStartGame}
            className="w-full py-5 rounded-2xl font-black text-lg tracking-wide transition-all active:scale-95 shadow-2xl"
            style={{
              background: 'linear-gradient(135deg, rgba(34,211,238,0.9) 0%, rgba(139,92,246,0.9) 100%)',
              boxShadow: '0 0 40px rgba(34,211,238,0.4), 0 0 80px rgba(139,92,246,0.2)',
              color: 'white',
              textShadow: '0 1px 4px rgba(0,0,0,0.4)',
              border: '1px solid rgba(255,255,255,0.2)',
            }}
          >
            ⚡ START MISSION ⚡
          </button>
          <button
            onClick={handleExit}
            className="w-full py-3 rounded-2xl font-bold text-sm text-slate-400 hover:text-slate-200 transition-colors border border-slate-700/50 bg-slate-900/50 hover:bg-slate-800/50"
          >
            ← Back to missions
          </button>
        </div>
      </div>,
      document.body
    );
  }

  // ── Loading / Error states ──
  if (boardPhase === 'loading' && isLoading) {
    return createPortal(
      <div className="fixed inset-0 z-[200] flex flex-col items-center justify-center gap-4"
        style={{ background: 'linear-gradient(180deg, #07051a 0%, #0e0730 50%, #07051a 100%)' }}>
        <div className="text-5xl animate-pulse">🛰️</div>
        <p className="text-cyan-300 font-semibold">Loading mission intel...</p>
        <p className="text-slate-500 text-sm">Fetching questions from HQ</p>
      </div>,
      document.body
    );
  }

  if (loadError) {
    const isActiveRunError = loadError.includes('active quest run');
    return createPortal(
      <div className="fixed inset-0 z-[200] flex flex-col items-center justify-center gap-4 px-6 text-center"
        style={{ background: 'linear-gradient(180deg, #07051a 0%, #0e0730 50%, #07051a 100%)' }}>
        <div className="text-4xl">⚠️</div>
        <p className="text-amber-300 font-semibold">{loadError}</p>
        {isActiveRunError && (
          <button
            onClick={async () => {
              try {
                setLoadError(null);
                setIsLoading(true);
                // Find and abandon any active runs via a direct query, then retry
                const { data: activeRuns } = await (await import('../../services/supabaseClient')).supabase
                  .from('quest_runs')
                  .select('id')
                  .eq('status', 'active')
                  .limit(1);
                if (activeRuns?.[0]) {
                  await quest_abandon(activeRuns[0].id);
                }
                // Retry starting the mission
                const runState = await quest_start_run(missionId);
                setRunId(runState.run_id);
                setRoute(runState.route as QuestNode[]);
                setCurrentNode(runState.current_node);
                setStreak(runState.streak);
                setRewardsXp(runState.rewards_xp);
                setRewardsCoins(runState.rewards_coins);
                setIsLoading(false);
              } catch (err: any) {
                setLoadError(err?.message || 'Failed to restart. Try again.');
                setIsLoading(false);
              }
            }}
            className="mt-2 px-6 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold transition-colors"
          >
            🔄 Abandon old run & start fresh
          </button>
        )}
        <button
          onClick={onBack}
          className="mt-4 px-6 py-2 rounded-xl bg-slate-700 hover:bg-slate-600 text-white transition-colors"
        >
          ← Back to missions
        </button>
      </div>,
      document.body
    );
  }

  // Streak bonus percentage for display

  return createPortal(
    <div
      ref={boardRef}
      className="fixed inset-0 z-[200] flex flex-col overflow-hidden"
      style={{
        background: 'linear-gradient(180deg, #0c0a1e 0%, #1a1040 30%, #251650 60%, #1a1040 85%, #0c0a1e 100%)',
        backgroundImage: `url('${QUEST_BACKGROUND}')`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
      }}
    >
      {/* ── Atmospheric background layers ── */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {/* Stars */}
        <div className="absolute inset-0" style={{
          backgroundImage: 'radial-gradient(1.5px 1.5px at 20% 15%, rgba(255,255,255,0.4) 50%, transparent 100%), radial-gradient(1px 1px at 60% 25%, rgba(255,255,255,0.3) 50%, transparent 100%), radial-gradient(1.5px 1.5px at 80% 45%, rgba(255,255,255,0.35) 50%, transparent 100%), radial-gradient(1px 1px at 35% 65%, rgba(255,255,255,0.25) 50%, transparent 100%), radial-gradient(1.5px 1.5px at 90% 75%, rgba(255,255,255,0.3) 50%, transparent 100%)',
        }} />
        {/* Purple atmosphere glow */}
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[400px] h-[300px] rounded-full" style={{
          background: 'radial-gradient(ellipse, rgba(139,92,246,0.15) 0%, transparent 70%)',
        }} />
        {/* Bottom horizon glow */}
        <div className="absolute bottom-0 left-0 right-0 h-40" style={{
          background: 'linear-gradient(180deg, transparent 0%, rgba(251,146,60,0.06) 60%, rgba(251,146,60,0.12) 100%)',
        }} />
      </div>

      {/* Particle portal */}
      {createPortal(
        particles.map(p => <RewardParticle key={p.id} {...p} onComplete={handleParticleComplete} />),
        document.body
      )}

      {/* ── Header Badge ── */}
      <div className="relative z-10 px-4 pt-4 pb-2">
        <div className="flex items-center justify-between">
          {/* Left: Back + Subject badge */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleExit}
              className="w-8 h-8 rounded-full bg-slate-800/80 border border-slate-600/50 flex items-center justify-center text-slate-400 hover:text-white hover:border-slate-400 transition-all text-sm"
              title="Exit game"
            >
              ←
            </button>
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-800/70 border border-cyan-500/30">
              <span className="text-cyan-400 text-xs">🔒</span>
              <span className="text-cyan-300 font-black text-xs tracking-wider uppercase">{subjectLabel}</span>
            </div>
          </div>
          {/* Right: Exit + Risk badge */}
          <div className="flex items-center gap-2">
            <div className="px-3 py-1.5 rounded-xl bg-slate-800/70 border border-amber-500/30">
              <span className="text-amber-300 font-bold text-xs tracking-wide">RISK: <span className="text-white">{riskLabel}</span></span>
            </div>
            {isFullscreen && (
              <button
                onClick={handleExit}
                className="px-2.5 py-1.5 rounded-xl bg-slate-800/80 border border-red-500/40 text-red-300 hover:text-red-100 hover:border-red-400 transition-all text-xs font-bold"
                title="Exit fullscreen"
              >
                ✕
              </button>
            )}
          </div>
        </div>
        {/* Mission name */}
        <h2 className="text-center text-white font-black text-sm mt-2 tracking-wide uppercase" style={{
          textShadow: '0 0 20px rgba(139,92,246,0.5)',
        }}>
          {missionTitle}
        </h2>
      </div>

      {/* ── Question overlay (centered full-screen modal) ── */}
      {activeModal === 'question' && activeNode && createPortal(
        <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-cyan-500/30 bg-gradient-to-br from-slate-900/98 via-indigo-950/95 to-slate-900/98 backdrop-blur-md p-5 space-y-4 shadow-2xl shadow-cyan-500/10">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-lg">{activeNode.type === 'elite_question' ? '⚡' : '❓'}</span>
                <span className={`text-xs font-black uppercase tracking-widest ${activeNode.type === 'elite_question' ? 'text-red-300' : 'text-cyan-300'}`}>
                  {activeNode.type === 'elite_question' ? 'Riddle Challenge' : 'Question'}
                </span>
              </div>
              <span className="text-amber-300 text-xs font-bold">+{activeNode.type === 'elite_question' ? '×2' : '10'} XP</span>
            </div>
            {/* Question */}
            <p className="text-white font-semibold text-base leading-relaxed">{activeNode.question_body}</p>
            {/* Options */}
            <div className="space-y-2">
              {(activeNode.options ?? []).map((opt: any, i: number) => {
                const label = typeof opt === 'string' ? opt : (opt as any)?.text ?? String(opt);
                const isCorrect = label === activeNode.correct_option;
                const answered = !!questionResult;
                return (
                  <button
                    key={i}
                    onClick={() => handleQuestionAnswer(label)}
                    disabled={answered || isSubmitting}
                    className={`w-full px-4 py-3 rounded-xl text-left text-sm font-semibold transition-all border ${
                      answered
                        ? isCorrect
                          ? 'bg-green-500/25 border-green-400 text-green-100'
                          : 'bg-slate-800/60 border-slate-600/40 text-slate-500'
                        : 'bg-slate-800/80 border-slate-600/40 text-slate-200 hover:bg-cyan-900/40 hover:border-cyan-500/50 active:scale-[0.98]'
                    }`}
                  >
                    <span className="text-slate-500 font-bold mr-2">{String.fromCharCode(65 + i)}.</span>
                    {label}
                    {answered && isCorrect && <span className="ml-2 text-green-400">✓</span>}
                  </button>
                );
              })}
            </div>
            {/* Result + Continue */}
            {questionResult && (
              <div className="space-y-3 pt-1">
                <p className={`text-sm font-medium ${questionResult.is_correct ? 'text-green-300' : 'text-red-300'}`}>
                  {questionResult.is_correct ? '✅ Correct!' : '❌ Incorrect'}{questionResult.explanation ? ` — ${questionResult.explanation}` : ''}
                </p>
                <button
                  onClick={handleQuestionClose}
                  className="w-full py-3 rounded-xl font-bold bg-gradient-to-r from-cyan-500 to-blue-500 text-white hover:scale-[1.02] active:scale-95 transition-all shadow-lg shadow-cyan-500/30"
                >
                  Continue →
                </button>
              </div>
            )}
            {isSubmitting && !questionResult && (
              <div className="text-center text-cyan-300 text-sm animate-pulse">Checking answer...</div>
            )}
          </div>
        </div>
      , document.body)}

      {/* ── Reward info banner ── */}
      <div className="relative z-10 mx-4 mb-1 flex items-center justify-between text-[10px]">
        <span className="text-slate-500 tracking-wider">— MISSION MAP —</span>
        <span className="text-slate-500 tracking-wider">— REWARD: Approx. <span className="text-amber-300 font-bold">{Math.max(200, rewardsXp || 200)} XP</span> + Bonus Chest —</span>
      </div>

      {/* ── Route Map (S-curve layout) ── */}
      <div ref={playingRef} className="relative z-10 flex-1 px-4 py-2 overflow-y-auto" style={{ scrollbarWidth: 'none' }}>
        {/* SVG path connector */}
        <svg
          className="absolute inset-0 w-full h-full pointer-events-none"
          style={{ zIndex: 0 }}
          preserveAspectRatio="none"
        >
          <defs>
            <linearGradient id="pathGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgba(34,211,238,0.5)" />
              <stop offset="100%" stopColor="rgba(139,92,246,0.3)" />
            </linearGradient>
            <linearGradient id="pathClearedGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgba(34,211,238,0.8)" />
              <stop offset="100%" stopColor="rgba(34,211,238,0.4)" />
            </linearGradient>
            <filter id="pathGlow">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
        </svg>

        <div ref={routeLineRef} className="relative" style={{ minHeight: route.length * 260 }} data-route-map>
          {/* S-curve node positions: bottom-to-top (START at bottom, BOSS at top) */}
          {route.map((node, i) => {
            const total = route.length;
            const positions = ['55%', '30%', '50%', '70%', '40%', '60%', '35%', '65%', '45%'];
            const leftPos = positions[i % positions.length];
            // Invert: node 0 (START) at bottom, last node (BOSS) at top
            const topPos = `${(1 - i / (total - 1 || 1)) * 100}%`;

            return (
              <div
                key={i}
                className="absolute -translate-x-1/2 -translate-y-1/2"
                style={{
                  left: leftPos,
                  top: topPos,
                  zIndex: 10,
                }}
                data-quest-node
                data-node-index={i}
                data-node-type={node.type}
              >
                <RouteNode
                  index={node.index}
                  type={node.type}
                  label={node.label}
                  state={node.state}
                  onClick={() => handleNodeClick(i)}
                  staggerDelay={i * 0.12}
                  xpBadge={
                    node.type === 'question' ? '+10'
                    : node.type === 'elite_question' ? '×2'
                    : node.type === 'reward' ? '+40'
                    : node.type === 'surprise' ? '🎰'
                    : undefined
                  }
                />
              </div>
            );
          })}

          {/* Persistent avatar — travels between nodes */}
          <AvatarToken nodeIndex={currentNode} avatarUrl={avatarUrl} />

          {/* Curved glowing connection paths between nodes */}
          {route.slice(0, -1).map((_, i) => {
            const positions = ['55%', '30%', '50%', '70%', '40%', '60%', '35%', '65%', '45%'];
            const total = route.length;
            const x1 = parseFloat(positions[i % positions.length]);
            const y1 = (1 - i / (total - 1 || 1)) * 100;
            const x2 = parseFloat(positions[(i + 1) % positions.length]);
            const y2 = (1 - (i + 1) / (total - 1 || 1)) * 100;
            const cleared = i < currentNode;
            // Cubic bezier control points for smooth S-curves
            const midY = (y1 + y2) / 2;
            const cx1 = x1;
            const cy1 = midY;
            const cx2 = x2;
            const cy2 = midY;

            return (
              <svg
                key={`line-${i}`}
                className="absolute inset-0 w-full h-full pointer-events-none"
                viewBox="0 0 100 100"
                preserveAspectRatio="none"
                style={{ zIndex: 1 }}
                data-route-segment
              >
                <path
                  d={`M ${x1},${y1} C ${cx1},${cy1} ${cx2},${cy2} ${x2},${y2}`}
                  fill="none"
                  stroke={cleared ? 'rgba(34,211,238,0.7)' : 'rgba(100,116,139,0.25)'}
                  strokeWidth={cleared ? 0.5 : 0.35}
                  strokeDasharray={cleared ? 'none' : '1.2 0.8'}
                  filter={cleared ? 'url(#pathGlow)' : undefined}
                />
              </svg>
            );
          })}
        </div>
      </div>

      {/* ── Streak Meter ── */}
      <div className="relative z-10 px-4 py-1">
        <StreakMeter streak={streak} />
      </div>

      {/* ── Bottom Action Bar ── */}
      <div className="relative z-10 px-3 pb-3 pt-1">
        <div className="flex gap-2">
          {/* Retreat button */}
          {canRetreat && activeModal === 'none' ? (
            <button
              onClick={() => setActiveModal('retreat')}
              className="flex-1 py-3 rounded-xl font-bold text-sm transition-all border
                bg-gradient-to-r from-slate-800 to-slate-700 border-slate-600/50
                text-slate-300 hover:text-white hover:border-slate-400
                active:scale-95"
            >
              <div className="flex items-center justify-center gap-2">
                <span>🚪</span>
                <div>
                  <div className="text-xs">RETREAT (KEEP LOOT)</div>
                  <div className="text-[10px] text-amber-400 mt-0.5">
                    {'★'.repeat(Math.min(5, Math.floor(currentNode / 2)))}
                    {'☆'.repeat(Math.max(0, 5 - Math.floor(currentNode / 2)))}
                  </div>
                </div>
              </div>
            </button>
          ) : (
            <div className="flex-1" />
          )}

          {/* Status panel */}
          <div
            className="flex-1 py-3 rounded-xl font-bold text-sm border
              bg-gradient-to-r from-slate-800/95 to-slate-700/95 border-cyan-400/30
              text-cyan-100 shadow-lg shadow-cyan-500/10"
          >
            <div className="text-xs text-center">Tap the glowing station to continue</div>
            <div className="text-[10px] text-cyan-200/80 mt-0.5 text-center">
              {streakBonusPct > 0 ? `Streak bonus ready +${streakBonusPct}%` : 'Keep your streak alive for bonus loot'}
            </div>
          </div>
        </div>
      </div>

      {/* ── Stats Footer ── */}
      <div className="relative z-10 flex items-center justify-around px-4 py-2 border-t border-slate-700/50 bg-slate-900/80">
        <div className="flex items-center gap-1 text-xs">
          <span className="text-amber-400">🪙</span>
          <span className="text-amber-300 font-bold tabular-nums" id="mission-coin">{rewardsCoins}</span>
        </div>
        <div className="flex items-center gap-1 text-xs">
          <span className="text-red-400">💎</span>
          <span className="text-red-300 font-bold tabular-nums">196</span>
        </div>
        <div className="flex items-center gap-1 text-xs">
          <span className="text-blue-400">⚡</span>
          <span className="text-blue-300 font-bold tabular-nums" id="mission-xp">{rewardsXp}</span>
        </div>
        <div className="flex items-center gap-1 text-xs">
          <span className="text-green-400">🎒</span>
          <span className="text-green-300 font-bold tabular-nums">{currentNode} / {route.length}</span>
        </div>
      </div>

      {/* ── Modals ── */}

      {/* Riddle modal (funny riddles for elite_question nodes) */}
      {activeModal === 'riddle' && activeRiddle && createPortal(
        <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-red-500/40 bg-gradient-to-br from-slate-900/98 via-red-950/90 to-slate-900/98 backdrop-blur-md p-5 space-y-4 shadow-2xl shadow-red-500/15">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-2xl">🤪</span>
                <span className="text-xs font-black uppercase tracking-widest text-red-300">
                  Riddle Challenge
                </span>
              </div>
              <span className="text-amber-300 text-xs font-bold">+25 XP</span>
            </div>
            {/* Riddle */}
            <p className="text-white font-semibold text-base leading-relaxed">{activeRiddle.question}</p>
            {/* Options */}
            <div className="space-y-2">
              {activeRiddle.options.map((opt, i) => {
                const isCorrect = opt === activeRiddle.correct;
                const answered = !!riddleResult;
                return (
                  <button
                    key={i}
                    onClick={() => handleRiddleAnswer(opt)}
                    disabled={answered}
                    className={`w-full px-4 py-3 rounded-xl text-left text-sm font-semibold transition-all border ${
                      answered
                        ? isCorrect
                          ? 'bg-green-500/25 border-green-400 text-green-100'
                          : 'bg-slate-800/60 border-slate-600/40 text-slate-500'
                        : 'bg-slate-800/80 border-slate-600/40 text-slate-200 hover:bg-red-900/30 hover:border-red-500/50 active:scale-[0.98]'
                    }`}
                  >
                    <span className="text-slate-500 font-bold mr-2">{String.fromCharCode(65 + i)}.</span>
                    {opt}
                    {answered && isCorrect && <span className="ml-2 text-green-400">✓</span>}
                  </button>
                );
              })}
            </div>
            {/* Result */}
            {riddleResult && (
              <div className="space-y-3 pt-1">
                <p className={`text-sm font-medium ${riddleResult.correct ? 'text-green-300' : 'text-red-300'}`}>
                  {riddleResult.correct ? '😂 Correct!' : '😅 Nope!'} — {riddleResult.explanation}
                </p>
                <button
                  onClick={handleRiddleClose}
                  className="w-full py-3 rounded-xl font-bold bg-gradient-to-r from-red-500 to-orange-500 text-white hover:scale-[1.02] active:scale-95 transition-all shadow-lg shadow-red-500/30"
                >
                  Continue →
                </button>
              </div>
            )}
          </div>
        </div>
      , document.body)}

      {/* Spin the Wheel (surprise nodes) */}
      {activeModal === 'spin' && (
        <SpinWheelModal
          onClaim={handleSpinClaim}
          isClaiming={isSubmitting}
        />
      )}

      {/* Event modal (reward nodes only now) */}
      {activeModal === 'event' && activeNode && (
        <EventModal
          node={activeNode}
          onClaim={handleEventClaim}
          result={eventResult}
          isResolving={isSubmitting}
        />
      )}

      {activeModal === 'chest' && chestResult && (
        <ChestRevealModal
          result={chestResult}
          onClose={handleChestClose}
        />
      )}

      {activeModal === 'retreat' && (
        <RetreatConfirmModal
          rewardsXp={rewardsXp}
          rewardsCoins={rewardsCoins}
          nodesClearedCount={route.filter(n => n.state === 'cleared').length}
          onConfirm={handleRetreatConfirm}
          onCancel={() => setActiveModal('none')}
        />
      )}
    </div>,
    document.body
  );
};

export default MissionBoard;
