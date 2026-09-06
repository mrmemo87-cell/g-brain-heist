import type { InterfaceLanguage } from './interfaceTranslations';

type TranslationPair = { ar: string; ru: string };

const FRAGMENT_MESSAGES: Record<string, TranslationPair> = {
  'Open': { ar: 'افتح', ru: 'Откройте' },
  'to see allocated classes, subjects and students.': { ar: 'لعرض الفصول والمواد والطلاب المخصصين لك.', ru: 'чтобы увидеть назначенные классы, предметы и учеников.' },
  'Use': { ar: 'استخدم', ru: 'Используйте' },
  'when you need a current class list.': { ar: 'عندما تحتاج إلى قائمة فصل محدثة.', ru: 'когда нужен актуальный список класса.' },
  'show completed work and assessment results.': { ar: 'تعرض الأعمال المكتملة ونتائج التقييم.', ru: 'показывают завершённые работы и результаты оценивания.' },
  'combine dated evidence from authorised assignments and verified writing.': { ar: 'تجمع أدلة مؤرخة من الواجبات المعتمدة والكتابة التي تمت مراجعتها.', ru: 'объединяют датированные данные из разрешённых заданий и проверенных письменных работ.' },
  'shows specific current learning needs; repeated labels require repeated evidence.': { ar: 'يعرض احتياجات تعلم حالية محددة؛ وتكرار التصنيف يتطلب أدلة متكررة.', ru: 'показывает конкретные текущие учебные потребности; повторяющиеся метки требуют повторных подтверждений.' },
  'feels like a': { ar: 'تجربة تشبه', ru: 'становится похожей на' },
  'Guide & Help': { ar: 'الدليل والمساعدة', ru: 'Руководство и помощь' },
  'Help & Guide': { ar: 'المساعدة والدليل', ru: 'Помощь и руководство' },
  '— Lockdown mode only. Upgrade to unlock Cambridge tests, IELTS, assignments & more.': { ar: '— يتوفر وضع Lockdown فقط. قم بالترقية لفتح اختبارات Cambridge وIELTS والواجبات والمزيد.', ru: '— доступен только режим Lockdown. Обновите тариф, чтобы открыть тесты Cambridge, IELTS, задания и другие возможности.' },
  'Lockdown mode only. Upgrade to unlock Cambridge tests, IELTS, assignments & more.': { ar: 'يتوفر وضع Lockdown فقط. قم بالترقية لفتح اختبارات Cambridge وIELTS والواجبات والمزيد.', ru: 'Доступен только режим Lockdown. Обновите тариф, чтобы открыть тесты Cambridge, IELTS, задания и другие возможности.' },
  'Every assigned class, subject, and student in one organised view.': { ar: 'كل فصل ومادة وطالب مخصص لك في عرض منظم واحد.', ru: 'Все назначенные классы, предметы и ученики в одном удобном представлении.' },
  'Print all rosters': { ar: 'طباعة جميع قوائم الفصول', ru: 'Распечатать все списки' },
  'Search by class, subject, or student…': { ar: 'ابحث حسب الفصل أو المادة أو الطالب…', ru: 'Поиск по классу, предмету или ученику…' },
  'Search by class, subject, or student...': { ar: 'ابحث حسب الفصل أو المادة أو الطالب…', ru: 'Поиск по классу, предмету или ученику…' },
  'Read-only governed questions used as official learning evidence only when curriculum mapping is valid.': { ar: 'أسئلة محكومة للقراءة فقط، وتُستخدم كدليل تعلم رسمي فقط عندما يكون ربطها بالمنهج صالحاً.', ru: 'Управляемые вопросы только для чтения; используются как официальные учебные данные только при корректной привязке к учебной программе.' },
  'Your classroom questions. Create, edit, bulk import and reuse them without changing the official question bank.': { ar: 'أسئلة فصلك. يمكنك إنشاؤها وتعديلها واستيرادها دفعة واحدة وإعادة استخدامها دون تغيير بنك الأسئلة الرسمي.', ru: 'Ваши вопросы для класса. Создавайте, редактируйте, массово импортируйте и повторно используйте их, не изменяя официальный банк вопросов.' },
};

const DYNAMIC_PATTERNS: Array<{
  pattern: RegExp;
  ar: (...groups: string[]) => string;
  ru: (...groups: string[]) => string;
}> = [
  {
    pattern: /^Your Allocated Classes \((\d+)\)$/,
    ar: (count) => `الفصول المخصصة لك (${count})`,
    ru: (count) => `Назначенные вам классы (${count})`,
  },
];

export function hasFragmentInterfaceTranslation(value: string): boolean {
  if (FRAGMENT_MESSAGES[value]) return true;
  return DYNAMIC_PATTERNS.some(({ pattern }) => pattern.test(value));
}

export function translateFragmentInterfaceText(language: InterfaceLanguage, value: string): string | null {
  if (language === 'en') return value;
  const exact = FRAGMENT_MESSAGES[value];
  if (exact) return exact[language];
  for (const entry of DYNAMIC_PATTERNS) {
    const match = value.match(entry.pattern);
    if (match) return entry[language](...match.slice(1));
  }
  return null;
}
