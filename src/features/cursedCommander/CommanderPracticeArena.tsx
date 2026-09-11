import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLanguage } from '../../contexts/LanguageContext';
import {
  startCommanderPractice,
  submitCommanderPracticeTurn,
  type CommanderPracticeCombatant,
  type CommanderPracticeEvent,
  type CommanderPracticeMove,
  type CommanderPracticeSession,
} from '../../../services/commanderPracticeService';

type CommanderPracticeArenaProps = {
  onClose: () => void;
};

const COPY = {
  en: {
    title: 'Commander Preview',
    subtitle: 'Isolated practice arena',
    practiceOnly: 'PRACTICE ONLY',
    safety: 'No Coins, XP, AP, rank, inventory, purchases or rewards are changed.',
    testers: 'Server-authorized preview testers only.',
    startTitle: 'Enter the first Commander combat slice',
    startBody: 'Fight one commander and two units with a fixed practice loadout. The server resolves every move and signs the battle transcript.',
    start: 'Start practice battle',
    retry: 'Try again',
    restart: 'Restart practice',
    close: 'Close',
    you: 'Your squad',
    enemy: 'Enemy squad',
    turn: 'Turn',
    of: 'of',
    selectTarget: 'Select a target',
    selected: 'Selected',
    actions: 'Commander actions',
    focus: 'Focus Target',
    focusHint: 'Mark a target and deal light damage. Your units concentrate fire there.',
    bolt: 'Death Bolt',
    boltHint: 'Heavy server-resolved damage. A focused target takes bonus damage.',
    guard: 'Guard',
    guardHint: 'Raise commander shield without choosing a target.',
    cooldown: 'Cooldown',
    resolving: 'Resolving turn…',
    battleLog: 'Battle log',
    loadout: 'Practice loadout',
    loadoutValue: 'Void Saber · Aegis Shield · 2 starter units',
    expires: 'Transcript expires',
    victory: 'Practice victory',
    defeat: 'Practice defeat',
    draw: 'Practice draw',
    finishedNote: 'This result is practice-only and does not affect live progression.',
    accessDenied: 'Commander Preview is not enabled for this account yet.',
    expired: 'This practice transcript expired. Start a fresh battle.',
    unavailable: 'The Commander practice server is not available right now.',
    invalidTarget: 'Choose a living enemy target first.',
    genericError: 'The practice turn could not be resolved.',
    hp: 'HP',
    shield: 'Shield',
  },
  ar: {
    title: 'معاينة القائد',
    subtitle: 'ساحة تدريب معزولة',
    practiceOnly: 'تدريب فقط',
    safety: 'لن تتغير العملات أو XP أو AP أو التصنيف أو المخزون أو المشتريات أو المكافآت.',
    testers: 'متاح فقط للمختبرين المصرح لهم من الخادم.',
    startTitle: 'ادخل أول تجربة قتال للقائد',
    startBody: 'واجه قائدًا ووحدتين باستخدام تجهيز تدريب ثابت. الخادم يحسب كل حركة ويوقّع سجل المعركة.',
    start: 'ابدأ معركة تدريب',
    retry: 'حاول مرة أخرى',
    restart: 'أعد التدريب',
    close: 'إغلاق',
    you: 'فريقك',
    enemy: 'فريق الخصم',
    turn: 'الجولة',
    of: 'من',
    selectTarget: 'اختر هدفًا',
    selected: 'محدد',
    actions: 'حركات القائد',
    focus: 'تركيز الهدف',
    focusHint: 'حدد هدفًا وألحق ضررًا خفيفًا. وحداتك ستركز هجومها عليه.',
    bolt: 'صاعقة الموت',
    boltHint: 'ضرر قوي يحسبه الخادم. الهدف المُركز عليه يتلقى ضررًا إضافيًا.',
    guard: 'دفاع',
    guardHint: 'ارفع درع القائد من دون اختيار هدف.',
    cooldown: 'انتظار',
    resolving: 'جارٍ حساب الجولة…',
    battleLog: 'سجل المعركة',
    loadout: 'تجهيز التدريب',
    loadoutValue: 'Void Saber · Aegis Shield · وحدتان للمبتدئين',
    expires: 'انتهاء صلاحية السجل',
    victory: 'فوز تدريبي',
    defeat: 'خسارة تدريبية',
    draw: 'تعادل تدريبي',
    finishedNote: 'هذه النتيجة تدريبية فقط ولا تؤثر في تقدمك الحقيقي.',
    accessDenied: 'معاينة القائد غير مفعلة لهذا الحساب حتى الآن.',
    expired: 'انتهت صلاحية سجل التدريب. ابدأ معركة جديدة.',
    unavailable: 'خادم تدريب القائد غير متاح الآن.',
    invalidTarget: 'اختر أولًا هدفًا حيًا من الخصم.',
    genericError: 'تعذر حساب حركة التدريب.',
    hp: 'الصحة',
    shield: 'الدرع',
  },
  ru: {
    title: 'Предпросмотр Командира',
    subtitle: 'Изолированная тренировочная арена',
    practiceOnly: 'ТОЛЬКО ТРЕНИРОВКА',
    safety: 'Монеты, XP, AP, рейтинг, инвентарь, покупки и награды не изменяются.',
    testers: 'Доступ только для тестеров, разрешённых сервером.',
    startTitle: 'Войдите в первый боевой прототип Commander',
    startBody: 'Сразитесь с командиром и двумя бойцами с фиксированным тренировочным комплектом. Каждый ход рассчитывается сервером, а журнал боя подписывается.',
    start: 'Начать тренировочный бой',
    retry: 'Попробовать снова',
    restart: 'Начать заново',
    close: 'Закрыть',
    you: 'Ваш отряд',
    enemy: 'Отряд противника',
    turn: 'Ход',
    of: 'из',
    selectTarget: 'Выберите цель',
    selected: 'Выбрано',
    actions: 'Действия командира',
    focus: 'Фокус цели',
    focusHint: 'Пометьте цель и нанесите небольшой урон. Ваши бойцы сосредоточат огонь на ней.',
    bolt: 'Смертельный разряд',
    boltHint: 'Мощный урон, рассчитанный сервером. Сфокусированная цель получает бонусный урон.',
    guard: 'Защита',
    guardHint: 'Усилить щит командира без выбора цели.',
    cooldown: 'Перезарядка',
    resolving: 'Сервер рассчитывает ход…',
    battleLog: 'Журнал боя',
    loadout: 'Тренировочный комплект',
    loadoutValue: 'Void Saber · Aegis Shield · 2 стартовых бойца',
    expires: 'Журнал истекает',
    victory: 'Победа в тренировке',
    defeat: 'Поражение в тренировке',
    draw: 'Ничья в тренировке',
    finishedNote: 'Этот результат существует только в тренировке и не влияет на реальный прогресс.',
    accessDenied: 'Commander Preview пока не включён для этого аккаунта.',
    expired: 'Срок тренировочного журнала истёк. Начните новый бой.',
    unavailable: 'Сервер тренировочного Commander сейчас недоступен.',
    invalidTarget: 'Сначала выберите живую цель противника.',
    genericError: 'Не удалось рассчитать тренировочный ход.',
    hp: 'HP',
    shield: 'Щит',
  },
} as const;

const formatError = (code: string, copy: (typeof COPY)['en']) => {
  if (code.includes('commander_preview_not_enabled')) return copy.accessDenied;
  if (code.includes('transcript_expired')) return copy.expired;
  if (code.includes('preview_') || code.includes('Failed to send') || code.includes('FunctionsHttpError')) return copy.unavailable;
  if (code.includes('invalid_target')) return copy.invalidTarget;
  return copy.genericError;
};

const hpPercent = (combatant: CommanderPracticeCombatant) =>
  Math.max(0, Math.min(100, Math.round((combatant.hp / combatant.maxHp) * 100)));

const eventText = (event: CommanderPracticeEvent, language: keyof typeof COPY) => {
  const actor = event.actorName ?? '';
  const target = event.targetName ?? '';
  const amount = event.amount ?? 0;

  if (language === 'ar') {
    switch (event.code) {
      case 'battle_started': return 'بدأت معركة التدريب.';
      case 'focus_target': return `${actor} ركّز على ${target}${amount ? ` وألحق ${amount} ضررًا` : ''}.`;
      case 'death_bolt': return `${actor} أطلق صاعقة الموت على ${target} بقوة ${amount}.`;
      case 'guard': return `${actor} رفع الدرع بمقدار ${amount}.`;
      case 'unit_attack': return `${actor} هاجم ${target} بقوة ${amount}.`;
      case 'shield_absorb': return `درع ${actor} امتص ${amount} ضررًا.`;
      case 'combatant_defeated': return `خرج ${actor} من القتال.`;
      case 'battle_victory': return 'انتهى التدريب بالفوز.';
      case 'battle_defeat': return 'انتهى التدريب بالخسارة.';
      case 'battle_draw': return 'انتهى التدريب بالتعادل.';
    }
  }

  if (language === 'ru') {
    switch (event.code) {
      case 'battle_started': return 'Тренировочный бой начался.';
      case 'focus_target': return `${actor} сфокусировался на ${target}${amount ? ` и нанёс ${amount} урона` : ''}.`;
      case 'death_bolt': return `${actor} применил Смертельный разряд по ${target}: ${amount} урона.`;
      case 'guard': return `${actor} усилил щит на ${amount}.`;
      case 'unit_attack': return `${actor} атаковал ${target}: ${amount} урона.`;
      case 'shield_absorb': return `Щит ${actor} поглотил ${amount} урона.`;
      case 'combatant_defeated': return `${actor} выбыл из боя.`;
      case 'battle_victory': return 'Тренировка завершена победой.';
      case 'battle_defeat': return 'Тренировка завершена поражением.';
      case 'battle_draw': return 'Тренировка завершена ничьей.';
    }
  }

  switch (event.code) {
    case 'battle_started': return 'Practice battle started.';
    case 'focus_target': return `${actor} focused ${target}${amount ? ` and dealt ${amount} damage` : ''}.`;
    case 'death_bolt': return `${actor} cast Death Bolt on ${target} for ${amount} damage.`;
    case 'guard': return `${actor} raised shield by ${amount}.`;
    case 'unit_attack': return `${actor} attacked ${target} for ${amount} damage.`;
    case 'shield_absorb': return `${actor}'s shield absorbed ${amount} damage.`;
    case 'combatant_defeated': return `${actor} was knocked out.`;
    case 'battle_victory': return 'Practice ended in victory.';
    case 'battle_defeat': return 'Practice ended in defeat.';
    case 'battle_draw': return 'Practice ended in a draw.';
  }
};

const CombatantCard: React.FC<{
  combatant: CommanderPracticeCombatant;
  targetable: boolean;
  selected: boolean;
  focused: boolean;
  selectedLabel: string;
  hpLabel: string;
  shieldLabel: string;
  onSelect: () => void;
}> = ({ combatant, targetable, selected, focused, selectedLabel, hpLabel, shieldLabel, onSelect }) => {
  const disabled = combatant.hp <= 0 || !targetable;
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onSelect}
      className={`relative w-full rounded-2xl border p-3 text-start transition ${
        combatant.hp <= 0
          ? 'border-slate-800 bg-slate-950/50 opacity-45'
          : selected
            ? 'border-cyan-300/80 bg-cyan-400/10 shadow-[0_0_24px_rgba(34,211,238,0.18)]'
            : 'border-slate-700/80 bg-slate-900/80 hover:border-slate-500'
      } ${disabled ? 'cursor-default' : 'cursor-pointer'}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <strong className="truncate text-sm text-white">{combatant.name}</strong>
            {combatant.role === 'commander' && (
              <span className="rounded-full border border-violet-400/30 bg-violet-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-violet-200">CMD</span>
            )}
          </div>
          {focused && <span className="mt-1 block text-[11px] font-semibold text-fuchsia-300">◎ FOCUS</span>}
        </div>
        {selected && combatant.hp > 0 && (
          <span className="rounded-full bg-cyan-300 px-2 py-0.5 text-[10px] font-black text-slate-950">{selectedLabel}</span>
        )}
      </div>

      <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-800" aria-label={`${hpLabel} ${combatant.hp}/${combatant.maxHp}`}>
        <div className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-cyan-300 transition-all" style={{ width: `${hpPercent(combatant)}%` }} />
      </div>
      <div className="mt-1 flex items-center justify-between gap-2 text-[11px] text-slate-300">
        <span>{hpLabel} {combatant.hp}/{combatant.maxHp}</span>
        <span>{shieldLabel} {combatant.shield}</span>
      </div>
    </button>
  );
};

const CommanderPracticeArena: React.FC<CommanderPracticeArenaProps> = ({ onClose }) => {
  const { language, direction } = useLanguage();
  const copy = COPY[language];
  const [session, setSession] = useState<CommanderPracticeSession | null>(null);
  const [selectedTargetId, setSelectedTargetId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dialogRef = useRef<HTMLDialogElement>(null);
  const pendingRequest = useRef<AbortController | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    dialog?.showModal();
    document.body.style.overflow = 'hidden';
    return () => {
      pendingRequest.current?.abort();
      dialog?.close();
      document.body.style.overflow = previousOverflow;
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
    };
  }, []);

  const playerCombatants = useMemo(
    () => session?.battle.combatants.filter((combatant) => combatant.side === 'player') ?? [],
    [session],
  );
  const enemyCombatants = useMemo(
    () => session?.battle.combatants.filter((combatant) => combatant.side === 'enemy') ?? [],
    [session],
  );

  const chooseDefaultTarget = (nextSession: CommanderPracticeSession) => {
    const enemies = nextSession.battle.combatants.filter((combatant) => combatant.side === 'enemy' && combatant.hp > 0);
    const currentStillAlive = enemies.some((combatant) => combatant.id === selectedTargetId);
    if (!currentStillAlive) {
      const enemyCommander = enemies.find((combatant) => combatant.role === 'commander');
      setSelectedTargetId(enemyCommander?.id ?? enemies[0]?.id ?? null);
    }
  };

  const begin = async () => {
    if (pendingRequest.current) return;
    const controller = new AbortController();
    pendingRequest.current = controller;
    const timeout = window.setTimeout(() => controller.abort(), 20_000);
    setBusy(true);
    setError(null);
    try {
      const next = await startCommanderPractice(controller.signal);
      if (controller.signal.aborted) return;
      setSession(next);
      const firstTarget = next.battle.combatants.find(
        (combatant) => combatant.side === 'enemy' && combatant.role === 'commander' && combatant.hp > 0,
      ) ?? next.battle.combatants.find((combatant) => combatant.side === 'enemy' && combatant.hp > 0);
      setSelectedTargetId(firstTarget?.id ?? null);
    } catch (cause) {
      const code = cause instanceof Error ? cause.message : String(cause);
      setError(formatError(code, copy as (typeof COPY)['en']));
    } finally {
      window.clearTimeout(timeout);
      pendingRequest.current = null;
      setBusy(false);
    }
  };

  const playMove = async (move: CommanderPracticeMove) => {
    if (!session || session.battle.status !== 'active' || pendingRequest.current) return;
    if (move !== 'guard' && !selectedTargetId) {
      setError(copy.invalidTarget);
      return;
    }

    const controller = new AbortController();
    pendingRequest.current = controller;
    const timeout = window.setTimeout(() => controller.abort(), 20_000);
    setBusy(true);
    setError(null);
    try {
      const next = await submitCommanderPracticeTurn(
        session.transcript,
        move,
        move === 'guard' ? null : selectedTargetId,
        controller.signal,
      );
      if (controller.signal.aborted) return;
      setSession(next);
      chooseDefaultTarget(next);
    } catch (cause) {
      const code = cause instanceof Error ? cause.message : String(cause);
      setError(formatError(code, copy as (typeof COPY)['en']));
    } finally {
      window.clearTimeout(timeout);
      pendingRequest.current = null;
      setBusy(false);
    }
  };

  const battle = session?.battle ?? null;
  const finished = Boolean(battle && battle.status !== 'active');
  const outcomeLabel = battle?.status === 'victory'
    ? copy.victory
    : battle?.status === 'defeat'
      ? copy.defeat
      : copy.draw;

  return createPortal(
    <dialog
      ref={dialogRef}
      onCancel={(event) => { event.preventDefault(); onClose(); }}
      data-no-interface-translation="true"
      aria-modal="true"
      aria-labelledby="commander-preview-title"
      className="fixed inset-0 m-0 h-[100dvh] max-h-none w-screen max-w-none border-0 z-[220] overflow-y-auto bg-slate-950/95 px-3 py-4 backdrop-blur-xl sm:px-6 sm:py-6"
      lang={language}
      dir={direction}
    >
      <div className="mx-auto w-full max-w-6xl overflow-hidden rounded-[2rem] border border-cyan-400/20 bg-slate-950 shadow-[0_0_80px_rgba(34,211,238,0.12)]">
        <header className="relative overflow-hidden border-b border-slate-800 px-4 py-5 sm:px-6">
          <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_0%,rgba(34,211,238,0.18),transparent_34%),radial-gradient(circle_at_82%_20%,rgba(168,85,247,0.16),transparent_32%)]" />
          <div className="relative flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-amber-300/40 bg-amber-400/10 px-2.5 py-1 text-[11px] font-black tracking-[0.16em] text-amber-200">{copy.practiceOnly}</span>
                <span className="rounded-full border border-cyan-400/30 bg-cyan-400/10 px-2.5 py-1 text-[11px] font-semibold text-cyan-100">COMMANDER · V1 PREVIEW</span>
              </div>
              <h1 id="commander-preview-title" className="font-heading text-2xl font-black text-white sm:text-3xl">{copy.title}</h1>
              <p className="mt-1 text-sm text-slate-300">{copy.subtitle}</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-700 bg-slate-900/80 px-3 py-2 text-sm font-semibold text-slate-200 transition hover:border-slate-500 hover:text-white disabled:opacity-50"
            >
              ✕ {copy.close}
            </button>
          </div>
        </header>

        <main className="space-y-5 p-4 sm:p-6">
          <section className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/[0.06] p-3 text-sm text-emerald-100">
              <strong className="block text-emerald-200">✓ {copy.safety}</strong>
            </div>
            <div className="rounded-2xl border border-violet-400/20 bg-violet-400/[0.06] p-3 text-sm text-violet-100">
              <strong className="block text-violet-200">🔐 {copy.testers}</strong>
            </div>
          </section>

          {!session && (
            <section className="rounded-3xl border border-slate-800 bg-slate-900/60 p-5 sm:p-7">
              <div className="grid items-center gap-6 md:grid-cols-[1.4fr_1fr]">
                <div>
                  <span aria-hidden className="text-5xl">🧠⚔️</span>
                  <h2 className="mt-4 font-heading text-xl font-bold text-white sm:text-2xl">{copy.startTitle}</h2>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">{copy.startBody}</p>
                  <button
                    type="button"
                    onClick={() => void begin()}
                    disabled={busy}
                    className="mt-5 rounded-2xl bg-gradient-to-r from-cyan-300 via-sky-400 to-violet-400 px-5 py-3 font-heading text-sm font-black text-slate-950 shadow-lg shadow-cyan-500/10 transition hover:brightness-110 disabled:cursor-wait disabled:opacity-60"
                  >
                    {busy ? copy.resolving : copy.start}
                  </button>
                </div>
                <div className="rounded-2xl border border-slate-700/80 bg-slate-950/70 p-4">
                  <span className="text-xs font-bold uppercase tracking-[0.14em] text-cyan-300">{copy.loadout}</span>
                  <p className="mt-2 text-sm font-semibold text-white">{copy.loadoutValue}</p>
                  <div className="mt-4 grid grid-cols-2 gap-2 text-center text-xs text-slate-300">
                    <span className="rounded-xl border border-slate-800 bg-slate-900 px-2 py-3">◎ {copy.focus}</span>
                    <span className="rounded-xl border border-slate-800 bg-slate-900 px-2 py-3">☄ {copy.bolt}</span>
                  </div>
                </div>
              </div>
            </section>
          )}

          {error && (
            <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
              <span>{error}</span>
              {!session && (
                <button type="button" onClick={() => void begin()} disabled={busy} className="rounded-lg border border-rose-300/30 px-3 py-1.5 font-semibold hover:bg-rose-300/10 disabled:opacity-50">
                  {copy.retry}
                </button>
              )}
            </div>
          )}

          {session && battle && (
            <>
              <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-800 bg-slate-900/60 px-4 py-3">
                <div className="flex flex-wrap items-center gap-2 text-sm text-slate-200">
                  <span className="rounded-full border border-cyan-400/30 bg-cyan-400/10 px-3 py-1 font-bold text-cyan-200">{copy.turn} {battle.turn} {copy.of} {battle.maxTurns}</span>
                  <span className="rounded-full border border-slate-700 px-3 py-1 text-xs text-slate-300">{copy.expires}: {new Date(session.expiresAt).toLocaleTimeString(language === 'ar' ? 'ar' : language === 'ru' ? 'ru-RU' : 'en-US', { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
                <button type="button" onClick={() => void begin()} disabled={busy} className="rounded-xl border border-slate-700 px-3 py-2 text-xs font-bold text-slate-200 hover:border-cyan-400/40 hover:text-cyan-100 disabled:opacity-50">
                  ↻ {copy.restart}
                </button>
              </section>

              {finished && (
                <section className={`rounded-3xl border p-5 text-center ${
                  battle.status === 'victory'
                    ? 'border-emerald-400/30 bg-emerald-500/10'
                    : battle.status === 'defeat'
                      ? 'border-rose-400/30 bg-rose-500/10'
                      : 'border-amber-400/30 bg-amber-500/10'
                }`}>
                  <div className="text-4xl" aria-hidden>{battle.status === 'victory' ? '🏆' : battle.status === 'defeat' ? '☠️' : '⚖️'}</div>
                  <h2 className="mt-2 font-heading text-2xl font-black text-white">{outcomeLabel}</h2>
                  <p className="mt-1 text-sm text-slate-300">{copy.finishedNote}</p>
                </section>
              )}

              <section className="grid gap-4 lg:grid-cols-2">
                <div className="rounded-3xl border border-cyan-400/20 bg-cyan-400/[0.04] p-4">
                  <h2 className="mb-3 font-heading text-sm font-black uppercase tracking-[0.12em] text-cyan-200">{copy.you}</h2>
                  <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
                    {playerCombatants.map((combatant) => (
                      <CombatantCard
                        key={combatant.id}
                        combatant={combatant}
                        targetable={false}
                        selected={false}
                        focused={battle.enemyFocusTarget === combatant.id}
                        selectedLabel={copy.selected}
                        hpLabel={copy.hp}
                        shieldLabel={copy.shield}
                        onSelect={() => {}}
                      />
                    ))}
                  </div>
                </div>

                <div className="rounded-3xl border border-fuchsia-400/20 bg-fuchsia-400/[0.04] p-4">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <h2 className="font-heading text-sm font-black uppercase tracking-[0.12em] text-fuchsia-200">{copy.enemy}</h2>
                    {!finished && <span className="text-xs text-slate-400">{copy.selectTarget}</span>}
                  </div>
                  <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
                    {enemyCombatants.map((combatant) => (
                      <CombatantCard
                        key={combatant.id}
                        combatant={combatant}
                        targetable={!finished && !busy}
                        selected={selectedTargetId === combatant.id}
                        focused={battle.playerFocusTarget === combatant.id}
                        selectedLabel={copy.selected}
                        hpLabel={copy.hp}
                        shieldLabel={copy.shield}
                        onSelect={() => setSelectedTargetId(combatant.id)}
                      />
                    ))}
                  </div>
                </div>
              </section>

              {!finished && (
                <section className="rounded-3xl border border-slate-800 bg-slate-900/70 p-4 sm:p-5">
                  <h2 className="font-heading text-sm font-black uppercase tracking-[0.12em] text-white">{copy.actions}</h2>
                  <div className="mt-3 grid gap-3 md:grid-cols-3">
                    <button
                      type="button"
                      onClick={() => void playMove('focus_target')}
                      disabled={busy || !selectedTargetId}
                      className="rounded-2xl border border-cyan-400/30 bg-cyan-400/10 p-4 text-start transition hover:border-cyan-300/70 hover:bg-cyan-400/15 disabled:cursor-not-allowed disabled:opacity-45"
                    >
                      <span className="text-xl" aria-hidden>◎</span>
                      <strong className="mt-2 block text-sm text-cyan-100">{copy.focus}</strong>
                      <span className="mt-1 block text-xs leading-5 text-slate-300">{copy.focusHint}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => void playMove('death_bolt')}
                      disabled={busy || !selectedTargetId || battle.playerDeathBoltCooldown > 0}
                      className="rounded-2xl border border-fuchsia-400/30 bg-fuchsia-400/10 p-4 text-start transition hover:border-fuchsia-300/70 hover:bg-fuchsia-400/15 disabled:cursor-not-allowed disabled:opacity-45"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-xl" aria-hidden>☄</span>
                        {battle.playerDeathBoltCooldown > 0 && <span className="rounded-full border border-slate-600 px-2 py-0.5 text-[10px] font-bold text-slate-300">{copy.cooldown}: {battle.playerDeathBoltCooldown}</span>}
                      </div>
                      <strong className="mt-2 block text-sm text-fuchsia-100">{copy.bolt}</strong>
                      <span className="mt-1 block text-xs leading-5 text-slate-300">{copy.boltHint}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => void playMove('guard')}
                      disabled={busy}
                      className="rounded-2xl border border-amber-400/30 bg-amber-400/10 p-4 text-start transition hover:border-amber-300/70 hover:bg-amber-400/15 disabled:cursor-not-allowed disabled:opacity-45"
                    >
                      <span className="text-xl" aria-hidden>⬡</span>
                      <strong className="mt-2 block text-sm text-amber-100">{copy.guard}</strong>
                      <span className="mt-1 block text-xs leading-5 text-slate-300">{copy.guardHint}</span>
                    </button>
                  </div>
                  {busy && <p className="mt-3 animate-pulse text-center text-xs font-semibold text-cyan-200">{copy.resolving}</p>}
                </section>
              )}

              <section className="rounded-3xl border border-slate-800 bg-slate-950/80 p-4">
                <h2 className="font-heading text-sm font-black uppercase tracking-[0.12em] text-slate-200">{copy.battleLog}</h2>
                <ol className="mt-3 max-h-64 space-y-2 overflow-y-auto pe-1" aria-live="polite">
                  {[...battle.events].reverse().map((event) => (
                    <li key={event.id} className="rounded-xl border border-slate-800/80 bg-slate-900/70 px-3 py-2 text-xs leading-5 text-slate-300">
                      <span className="me-2 font-mono text-[10px] font-bold text-slate-500">T{event.turn}</span>
                      {eventText(event, language)}
                    </li>
                  ))}
                </ol>
              </section>
            </>
          )}
        </main>
      </div>
    </dialog>,
    document.body,
  );
};

export default CommanderPracticeArena;
