import type { CommanderPracticeEvent } from '../../../services/commanderPracticeService';

export const COMMANDER_COPY = {
  en: {
    back: 'Back', recoveryRetry: 'Retry battle recovery', storageUnavailable: 'Your browser could not save this battle. Keep this page open to retain progress.',
    title: 'Commander Preview', subtitle: 'Practice arena', practiceOnly: 'PRACTICE ONLY',
    safety: 'Practice mode — your progress stays the same.', testers: 'Open to authenticated student accounts.',
    startTitle: 'Enter the Commander practice arena',
    startBody: 'Fight one commander and two units with a fixed practice loadout. The server decides every result; the battlefield brings the confirmed turn to life.',
    start: 'Start practice battle', retry: 'Try again', restart: 'Restart practice', close: 'Close',
    you: 'Your squad', enemy: 'Enemy squad', turn: 'Turn', of: 'of', selectTarget: 'Select a target', selected: 'Selected',
    actions: 'Commander actions', tactical: 'Tactical controls', powerMatrix: 'Power matrix', powerCore: 'Shared power core',
    focus: 'Focus Target', focusHint: 'Lock onto an enemy. Your squad concentrates fire there.',
    bolt: 'Death Bolt', boltHint: 'VOID · Execute one target. Focus amplifies the strike.',
    stormPower: 'Chain Surge', stormPowerHint: 'STORM · Strike your target, then arc into another living enemy.',
    rotPower: 'Rot Miasma', rotPowerHint: 'ROT · Flood every living enemy. Your selected target takes the worst of it.',
    gravePower: 'Raise Dead', gravePowerHint: 'GRAVE · Restore a fallen unit, or mend your weakest wounded ally.',
    guard: 'Guard', guardHint: 'Raise commander shield without choosing a target.',
    equipToUnlock: 'Equip a school recruit to unlock', lockedPower: 'That Commander Power is not unlocked by your current squad.',
    coreCooling: 'Power core cooling', noSoulToRaise: 'No ally needs recovery yet.',
    cooldown: 'Ready in', rounds: 'rounds', resolving: 'Your squad is acting…', battleLog: 'Battle log',
    loadout: 'Practice loadout', loadoutValue: 'Void Saber · Aegis Shield · 2 starter units', expires: 'Session ends',
    victory: 'Practice victory', defeat: 'Practice defeat', draw: 'Practice draw',
    finishedNote: 'Practice complete. Your live progress was not changed.',
    accessDenied: 'Commander Preview is available to student accounts only.',
    expired: 'This practice session ended. Start a new battle.', unavailable: 'The Commander practice server is not available right now.',
    invalidTarget: 'Choose a living enemy target first.', genericError: 'The practice turn could not be resolved.',
    hp: 'HP', shield: 'Shield', battlefield: 'Live battlefield', battlefieldHint: 'Every hit below is a confirmed server result.',
    animations: 'Animations', effects: 'Effects', sound: 'Sound', speed: 'Speed', waiting: 'Choose a target and command.', knockedOut: 'Knocked out',
    impact: 'Impact', shieldHit: 'Shield hit', locked: 'Target locked', reinforced: 'Shield reinforced', restored: 'Soul restored',
  },
  ar: {
    back: 'رجوع', recoveryRetry: 'أعد محاولة استعادة المعركة', storageUnavailable: 'تعذر حفظ المعركة في متصفحك. أبقِ هذه الصفحة مفتوحة للاحتفاظ بالتقدم.',
    title: 'معاينة القائد', subtitle: 'ساحة التدريب', practiceOnly: 'تدريب فقط',
    safety: 'وضع التدريب — يبقى تقدمك الحقيقي كما هو.', testers: 'متاح لحسابات الطلاب المسجلين.',
    startTitle: 'ادخل ساحة تدريب القائد',
    startBody: 'واجه قائدًا ووحدتين بتجهيز تدريب ثابت. الخادم يحدد كل نتيجة، وساحة القتال تعرض الجولة المؤكدة بصريًا.',
    start: 'ابدأ معركة تدريب', retry: 'حاول مرة أخرى', restart: 'أعد التدريب', close: 'إغلاق',
    you: 'فريقك', enemy: 'فريق الخصم', turn: 'الجولة', of: 'من', selectTarget: 'اختر هدفًا', selected: 'محدد',
    actions: 'حركات القائد', tactical: 'أوامر تكتيكية', powerMatrix: 'مصفوفة القوى', powerCore: 'نواة قوى مشتركة',
    focus: 'تركيز الهدف', focusHint: 'ثبّت الهدف. فريقك سيركز هجومه عليه.',
    bolt: 'صاعقة الموت', boltHint: 'VOID · ضربة حاسمة لهدف واحد، ويقويها التركيز.',
    stormPower: 'سلسلة البرق', stormPowerHint: 'STORM · اضرب الهدف ثم اقفز بالبرق إلى عدو حي آخر.',
    rotPower: 'ضباب التعفن', rotPowerHint: 'ROT · يضرب كل الأعداء الأحياء، والهدف المحدد يتلقى الضربة الأقوى.',
    gravePower: 'إحياء الساقط', gravePowerHint: 'GRAVE · أعد وحدة ساقطة أو عالج أضعف حليف مصاب.',
    guard: 'دفاع', guardHint: 'ارفع درع القائد من دون اختيار هدف.',
    equipToUnlock: 'جهّز مجندًا من هذه المدرسة للفتح', lockedPower: 'هذه القوة غير مفتوحة بتشكيلتك الحالية.',
    coreCooling: 'نواة القوى تعيد الشحن', noSoulToRaise: 'لا يوجد حليف يحتاج للاستعادة الآن.',
    cooldown: 'جاهز بعد', rounds: 'جولات', resolving: 'فريقك يتحرك…', battleLog: 'سجل المعركة',
    loadout: 'تجهيز التدريب', loadoutValue: 'Void Saber · Aegis Shield · وحدتان للمبتدئين', expires: 'تنتهي الجلسة',
    victory: 'فوز تدريبي', defeat: 'خسارة تدريبية', draw: 'تعادل تدريبي',
    finishedNote: 'اكتمل التدريب. لم يتغير تقدمك الحقيقي.', accessDenied: 'معاينة القائد متاحة لحسابات الطلاب فقط.',
    expired: 'انتهت جلسة التدريب. ابدأ معركة جديدة.', unavailable: 'خادم تدريب القائد غير متاح الآن.',
    invalidTarget: 'اختر أولًا هدفًا حيًا من الخصم.', genericError: 'تعذر حساب حركة التدريب.',
    hp: 'الصحة', shield: 'الدرع', battlefield: 'ساحة القتال الحية', battlefieldHint: 'كل ضربة هنا هي نتيجة مؤكدة من الخادم.',
    animations: 'الحركة', effects: 'المؤثرات', sound: 'الصوت', speed: 'السرعة', waiting: 'اختر هدفًا وحركة.', knockedOut: 'خارج القتال',
    impact: 'إصابة', shieldHit: 'ضربة درع', locked: 'تم تثبيت الهدف', reinforced: 'تم تعزيز الدرع', restored: 'تمت الاستعادة',
  },
  ru: {
    back: 'Назад', recoveryRetry: 'Повторить восстановление боя', storageUnavailable: 'Браузер не смог сохранить бой. Не закрывайте страницу, чтобы сохранить прогресс.',
    title: 'Предпросмотр Командира', subtitle: 'Тренировочная арена', practiceOnly: 'ТОЛЬКО ТРЕНИРОВКА',
    safety: 'Режим тренировки — ваш реальный прогресс не меняется.', testers: 'Доступно авторизованным аккаунтам учеников.',
    startTitle: 'Войдите на тренировочную арену Commander',
    startBody: 'Сразитесь с командиром и двумя бойцами с фиксированным комплектом. Сервер решает результат, а поле боя оживляет подтверждённый ход.',
    start: 'Начать тренировочный бой', retry: 'Попробовать снова', restart: 'Начать заново', close: 'Закрыть',
    you: 'Ваш отряд', enemy: 'Отряд противника', turn: 'Ход', of: 'из', selectTarget: 'Выберите цель', selected: 'Выбрано',
    actions: 'Действия командира', tactical: 'Тактические команды', powerMatrix: 'Матрица сил', powerCore: 'Общее ядро сил',
    focus: 'Фокус цели', focusHint: 'Зафиксируйте цель. Отряд сосредоточит огонь на ней.',
    bolt: 'Смертельный разряд', boltHint: 'VOID · Мощный удар по одной цели. Фокус усиливает атаку.',
    stormPower: 'Цепной импульс', stormPowerHint: 'STORM · Ударяет выбранную цель и перескакивает на ещё одного живого врага.',
    rotPower: 'Гниющий туман', rotPowerHint: 'ROT · Поражает всех живых врагов, сильнее всего — выбранную цель.',
    gravePower: 'Поднять павшего', gravePowerHint: 'GRAVE · Возвращает павшего бойца или лечит самого раненого союзника.',
    guard: 'Защита', guardHint: 'Усилить щит командира без выбора цели.',
    equipToUnlock: 'Экипируйте бойца этой школы, чтобы открыть', lockedPower: 'Эта сила не открыта текущим составом.',
    coreCooling: 'Ядро сил перезаряжается', noSoulToRaise: 'Сейчас ни один союзник не нуждается в восстановлении.',
    cooldown: 'Готово через', rounds: 'ход.', resolving: 'Ваш отряд действует…', battleLog: 'Журнал боя',
    loadout: 'Тренировочный комплект', loadoutValue: 'Void Saber · Aegis Shield · 2 стартовых бойца', expires: 'Сессия закончится',
    victory: 'Победа в тренировке', defeat: 'Поражение в тренировке', draw: 'Ничья в тренировке',
    finishedNote: 'Тренировка завершена. Реальный прогресс не изменился.', accessDenied: 'Commander Preview доступен только аккаунтам учеников.',
    expired: 'Тренировочная сессия закончилась. Начните новый бой.', unavailable: 'Сервер тренировочного Commander сейчас недоступен.',
    invalidTarget: 'Сначала выберите живую цель противника.', genericError: 'Не удалось рассчитать тренировочный ход.',
    hp: 'HP', shield: 'Щит', battlefield: 'Живое поле боя', battlefieldHint: 'Каждый удар здесь подтверждён сервером.',
    animations: 'Анимация', effects: 'Эффекты', sound: 'Звук', speed: 'Скорость', waiting: 'Выберите цель и действие.', knockedOut: 'Выбыл',
    impact: 'Удар', shieldHit: 'Удар по щиту', locked: 'Цель захвачена', reinforced: 'Щит усилен', restored: 'Боец восстановлен',
  },
} as const;

export type CommanderLanguage = keyof typeof COMMANDER_COPY;
export type CommanderCopy = (typeof COMMANDER_COPY)[CommanderLanguage];

export const formatCommanderError = (code: string, copy: CommanderCopy) => {
  if (code.includes('commander_preview_not_enabled') || code.includes('commander_preview_students_only')) return copy.accessDenied;
  if (code.includes('transcript_expired')) return copy.expired;
  if (code.includes('commander_power_locked')) return copy.lockedPower;
  if (code.includes('commander_power_on_cooldown') || code.includes('death_bolt_on_cooldown')) return copy.coreCooling;
  if (code.includes('raise_dead_no_valid_target')) return copy.noSoulToRaise;
  if (code.includes('preview_') || code.includes('Failed to send') || code.includes('FunctionsHttpError')) return copy.unavailable;
  if (code.includes('invalid_target')) return copy.invalidTarget;
  return copy.genericError;
};

export const commanderEventText = (event: CommanderPracticeEvent, language: CommanderLanguage) => {
  const actor = event.actorName ?? '';
  const target = event.targetName ?? '';
  const amount = event.amount ?? 0;

  if (language === 'ar') {
    switch (event.code) {
      case 'battle_started': return 'بدأت معركة التدريب.';
      case 'focus_target': return `${actor} ركّز على ${target}${amount ? ` وألحق ${amount} ضررًا` : ''}.`;
      case 'death_bolt': return `${actor} أطلق صاعقة الموت على ${target} بقوة ${amount}.`;
      case 'chain_surge': return `${actor} أطلق سلسلة البرق على ${target} بقوة ${amount}.`;
      case 'rot_miasma': return `${actor} نشر ضباب التعفن على ${target} بقوة ${amount}.`;
      case 'raise_dead': return `${actor} استعاد ${target} بمقدار ${amount} صحة.`;
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
      case 'chain_surge': return `${actor} применил Цепной импульс по ${target}: ${amount} урона.`;
      case 'rot_miasma': return `${actor} окутал ${target} Гниющим туманом: ${amount} урона.`;
      case 'raise_dead': return `${actor} восстановил ${target} на ${amount} HP.`;
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
    case 'chain_surge': return `${actor} chained Storm energy into ${target} for ${amount} damage.`;
    case 'rot_miasma': return `${actor} spread Rot Miasma into ${target} for ${amount} damage.`;
    case 'raise_dead': return `${actor} restored ${target} for ${amount} HP.`;
    case 'guard': return `${actor} raised shield by ${amount}.`;
    case 'unit_attack': return `${actor} attacked ${target} for ${amount} damage.`;
    case 'shield_absorb': return `${actor}'s shield absorbed ${amount} damage.`;
    case 'combatant_defeated': return `${actor} was knocked out.`;
    case 'battle_victory': return 'Practice ended in victory.';
    case 'battle_defeat': return 'Practice ended in defeat.';
    case 'battle_draw': return 'Practice ended in a draw.';
  }
};

export const visibleCommanderEvents = (events: CommanderPracticeEvent[]) =>
  events.filter((event, index) => {
    if (event.code !== 'focus_target' || (event.amount ?? 0) > 0) return true;
    return !events.slice(index + 1).some((candidate) => (
      candidate.turn === event.turn
      && candidate.code === 'focus_target'
      && candidate.actorName === event.actorName
      && candidate.targetName === event.targetName
      && (candidate.amount ?? 0) > 0
    ));
  });
