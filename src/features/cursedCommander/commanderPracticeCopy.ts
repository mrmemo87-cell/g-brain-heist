import type { CommanderPracticeEvent } from '../../../services/commanderPracticeService';

export const COMMANDER_COPY = {
  en: {
    back: 'Back', recoveryRetry: 'Retry battle recovery', storageUnavailable: 'Your browser could not save this battle. Keep this page open to retain progress.',
    title: 'Commander Preview', subtitle: 'Practice arena', practiceOnly: 'PRACTICE ONLY',
    safety: 'Free practice. Battles never cost Coins. Win once today for +40 XP.', testers: 'How to play: 1) Tap an enemy. 2) Choose a move. 3) Your fighters attack by themselves. Knock out the enemy Commander to win!',
    startTitle: 'Practice battle',
    startBody: 'Fight a computer army with your own team. Try different moves and learn how the game works.',
    start: 'Start practice battle', retry: 'Try again', restart: 'Play again', close: 'Close',
    you: 'Your squad', enemy: 'Enemy squad', turn: 'Turn', of: 'of', selectTarget: 'Tap an enemy', selected: 'Selected',
    actions: 'Commander actions', tactical: 'Basic moves (always ready)', powerMatrix: 'Choose your move', powerCore: 'All powers share one charge',
    focus: 'Focus Target', focusHint: 'Hit the enemy you chose. Your fighters attack it too.',
    bolt: 'Death Bolt', boltHint: 'Big hit on one enemy. Even stronger after Focus.',
    stormPower: 'Chain Surge', stormPowerHint: 'Hits your enemy, then jumps to another enemy.',
    rotPower: 'Rot Miasma', rotPowerHint: 'Hurts every enemy. Your chosen enemy takes the most.',
    gravePower: 'Raise Dead', gravePowerHint: 'Brings back a fallen fighter, or heals your most hurt fighter.',
    guard: 'Guard', guardHint: 'Add shield to your Commander. No enemy needed.',
    equipToUnlock: 'Locked: add a fighter of this magic type to your team', lockedPower: 'That power is locked. Add a fighter of its magic type to your team.',
    coreCooling: 'Powers recharging', noSoulToRaise: 'No ally needs recovery yet.',
    cooldown: 'Ready in', rounds: 'turns', resolving: 'Your squad is acting…', battleLog: 'Battle log',
    loadout: 'Practice loadout', loadoutValue: 'Void Saber · Aegis Shield · 2 starter units', expires: 'Session ends',
    victory: 'You won!', defeat: 'You lost this time', draw: 'Draw',
    finishedNote: 'Practice finished. Practice never costs Coins.',
    accessDenied: 'Commander Preview is available to student accounts only.',
    expired: 'This practice session ended. Start a new battle.', unavailable: 'The Commander practice server is not available right now.',
    invalidTarget: 'Tap an enemy first.', genericError: 'The practice turn could not be resolved.',
    hp: 'HP', shield: 'Shield', battlefield: 'Live battlefield', battlefieldHint: 'Every hit below is a confirmed server result.',
    animations: 'Animations', effects: 'Effects', sound: 'Sound', speed: 'Speed', waiting: 'Tap an enemy, then choose a move.', knockedOut: 'Knocked out',
    impact: 'Impact', shieldHit: 'Shield hit', locked: 'Target locked', reinforced: 'Shield reinforced', restored: 'Soul restored',
  },
  ar: {
    back: 'رجوع', recoveryRetry: 'أعد محاولة استعادة المعركة', storageUnavailable: 'تعذر حفظ المعركة في متصفحك. أبقِ هذه الصفحة مفتوحة للاحتفاظ بالتقدم.',
    title: 'معاينة القائد', subtitle: 'ساحة التدريب', practiceOnly: 'تدريب فقط',
    safety: 'تدريب مجاني. المعارك لا تكلّف عملات. اربح مرة اليوم لتحصل على 40 نقطة خبرة.', testers: 'طريقة اللعب: 1) اضغط على عدو. 2) اختر حركة. 3) مقاتلوك يهاجمون وحدهم. اهزم قائد العدو لتفوز!',
    startTitle: 'معركة تدريب',
    startBody: 'قاتل جيش الكمبيوتر بفريقك. جرّب حركات مختلفة وتعلّم كيف تعمل اللعبة.',
    start: 'ابدأ معركة تدريب', retry: 'حاول مرة أخرى', restart: 'العب مرة أخرى', close: 'إغلاق',
    you: 'فريقك', enemy: 'فريق الخصم', turn: 'الجولة', of: 'من', selectTarget: 'اضغط على عدو', selected: 'محدد',
    actions: 'حركات القائد', tactical: 'حركات أساسية (جاهزة دائمًا)', powerMatrix: 'اختر حركتك', powerCore: 'كل القوى تشترك في شحنة واحدة',
    focus: 'تركيز الهدف', focusHint: 'اضرب العدو الذي اخترته. مقاتلوك يهاجمونه أيضًا.',
    bolt: 'صاعقة الموت', boltHint: 'ضربة قوية على عدو واحد. أقوى بعد التركيز.',
    stormPower: 'سلسلة البرق', stormPowerHint: 'تضرب عدوك ثم تقفز إلى عدو آخر.',
    rotPower: 'ضباب التعفن', rotPowerHint: 'تؤذي كل الأعداء. العدو الذي اخترته يتأذى أكثر.',
    gravePower: 'إحياء الساقط', gravePowerHint: 'تعيد مقاتلًا سقط، أو تعالج أكثر مقاتل مصاب.',
    guard: 'دفاع', guardHint: 'أضف درعًا لقائدك. لا تحتاج إلى عدو.',
    equipToUnlock: 'مقفل: أضف مقاتلًا من هذا النوع السحري إلى فريقك', lockedPower: 'هذه القوة مقفلة. أضف مقاتلًا من نوعها السحري إلى فريقك.',
    coreCooling: 'القوى تعيد الشحن', noSoulToRaise: 'لا يوجد حليف يحتاج للاستعادة الآن.',
    cooldown: 'جاهز بعد', rounds: 'أدوار', resolving: 'فريقك يتحرك…', battleLog: 'سجل المعركة',
    loadout: 'تجهيز التدريب', loadoutValue: 'Void Saber · Aegis Shield · وحدتان للمبتدئين', expires: 'تنتهي الجلسة',
    victory: 'فزت!', defeat: 'خسرت هذه المرة', draw: 'تعادل',
    finishedNote: 'انتهى التدريب. التدريب لا يكلّف عملات.', accessDenied: 'معاينة القائد متاحة لحسابات الطلاب فقط.',
    expired: 'انتهت جلسة التدريب. ابدأ معركة جديدة.', unavailable: 'خادم تدريب القائد غير متاح الآن.',
    invalidTarget: 'اضغط على عدو أولًا.', genericError: 'تعذر حساب حركة التدريب.',
    hp: 'الصحة', shield: 'الدرع', battlefield: 'ساحة القتال الحية', battlefieldHint: 'كل ضربة هنا هي نتيجة مؤكدة من الخادم.',
    animations: 'الحركة', effects: 'المؤثرات', sound: 'الصوت', speed: 'السرعة', waiting: 'اضغط على عدو ثم اختر حركة.', knockedOut: 'خارج القتال',
    impact: 'إصابة', shieldHit: 'ضربة درع', locked: 'تم تثبيت الهدف', reinforced: 'تم تعزيز الدرع', restored: 'تمت الاستعادة',
  },
  ru: {
    back: 'Назад', recoveryRetry: 'Повторить восстановление боя', storageUnavailable: 'Браузер не смог сохранить бой. Не закрывайте страницу, чтобы сохранить прогресс.',
    title: 'Предпросмотр Командира', subtitle: 'Тренировочная арена', practiceOnly: 'ТОЛЬКО ТРЕНИРОВКА',
    safety: 'Бесплатная тренировка. Бои не стоят монет. Победите один раз сегодня и получите 40 XP.', testers: 'Как играть: 1) Нажмите на врага. 2) Выберите ход. 3) Ваши бойцы атакуют сами. Победите вражеского Командира, чтобы выиграть!',
    startTitle: 'Тренировочный бой',
    startBody: 'Сразитесь своей командой с армией компьютера. Пробуйте разные ходы и учитесь играть.',
    start: 'Начать тренировочный бой', retry: 'Попробовать снова', restart: 'Играть ещё', close: 'Закрыть',
    you: 'Ваш отряд', enemy: 'Отряд противника', turn: 'Ход', of: 'из', selectTarget: 'Нажмите на врага', selected: 'Выбрано',
    actions: 'Действия командира', tactical: 'Основные ходы (всегда готовы)', powerMatrix: 'Выберите ход', powerCore: 'Все силы используют один заряд',
    focus: 'Фокус цели', focusHint: 'Ударьте выбранного врага. Ваши бойцы тоже атакуют его.',
    bolt: 'Смертельный разряд', boltHint: 'Сильный удар по одному врагу. Ещё сильнее после Фокуса.',
    stormPower: 'Цепной импульс', stormPowerHint: 'Бьёт врага, затем перескакивает на другого.',
    rotPower: 'Гниющий туман', rotPowerHint: 'Ранит всех врагов. Выбранный враг получает больше всех.',
    gravePower: 'Поднять павшего', gravePowerHint: 'Возвращает павшего бойца или лечит самого раненого.',
    guard: 'Защита', guardHint: 'Добавьте щит Командиру. Враг не нужен.',
    equipToUnlock: 'Закрыто: добавьте в команду бойца этого типа магии', lockedPower: 'Эта сила закрыта. Добавьте в команду бойца её типа магии.',
    coreCooling: 'Силы перезаряжаются', noSoulToRaise: 'Сейчас ни один союзник не нуждается в восстановлении.',
    cooldown: 'Готово через', rounds: 'ход.', resolving: 'Ваш отряд действует…', battleLog: 'Журнал боя',
    loadout: 'Тренировочный комплект', loadoutValue: 'Void Saber · Aegis Shield · 2 стартовых бойца', expires: 'Сессия закончится',
    victory: 'Победа!', defeat: 'В этот раз поражение', draw: 'Ничья',
    finishedNote: 'Тренировка окончена. Тренировка не стоит монет.', accessDenied: 'Commander Preview доступен только аккаунтам учеников.',
    expired: 'Тренировочная сессия закончилась. Начните новый бой.', unavailable: 'Сервер тренировочного Commander сейчас недоступен.',
    invalidTarget: 'Сначала нажмите на врага.', genericError: 'Не удалось рассчитать тренировочный ход.',
    hp: 'HP', shield: 'Щит', battlefield: 'Живое поле боя', battlefieldHint: 'Каждый удар здесь подтверждён сервером.',
    animations: 'Анимация', effects: 'Эффекты', sound: 'Звук', speed: 'Скорость', waiting: 'Нажмите на врага, затем выберите ход.', knockedOut: 'Выбыл',
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
