import React, { useEffect, useRef } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import type { Language } from '../i18n/language';

const STAFF_MESSAGES: Record<string, { ar: string; ru: string }> = {
  'Teacher Portal': { ar: 'بوابة المعلم', ru: 'Портал учителя' },
  'School Admin Portal': { ar: 'بوابة إدارة المدرسة', ru: 'Портал администратора школы' },
  'Admin Portal': { ar: 'بوابة الإدارة', ru: 'Портал администратора' },
  'Super Admin': { ar: 'المشرف العام', ru: 'Суперадминистратор' },
  'School Head Portal': { ar: 'بوابة قيادة المدرسة', ru: 'Портал руководителя школы' },
  'Parent Portal': { ar: 'بوابة ولي الأمر', ru: 'Портал родителя' },
  'Dashboard': { ar: 'لوحة التحكم', ru: 'Панель управления' },
  'Overview': { ar: 'نظرة عامة', ru: 'Обзор' },
  'Students': { ar: 'الطلاب', ru: 'Ученики' },
  'Teachers': { ar: 'المعلمون', ru: 'Учителя' },
  'Staff & Students': { ar: 'الموظفون والطلاب', ru: 'Сотрудники и ученики' },
  'Members': { ar: 'الأعضاء', ru: 'Участники' },
  'Users': { ar: 'المستخدمون', ru: 'Пользователи' },
  'Schools': { ar: 'المدارس', ru: 'Школы' },
  'Applications': { ar: 'الطلبات', ru: 'Заявки' },
  'Question Bank': { ar: 'بنك الأسئلة', ru: 'Банк вопросов' },
  'Official Question Bank': { ar: 'بنك الأسئلة الرسمي', ru: 'Официальный банк вопросов' },
  'Create Question': { ar: 'إنشاء سؤال', ru: 'Создать вопрос' },
  'Questions': { ar: 'الأسئلة', ru: 'Вопросы' },
  'Assignments': { ar: 'الواجبات', ru: 'Задания' },
  'Active Assignments': { ar: 'الواجبات النشطة', ru: 'Активные задания' },
  'Create Assignment': { ar: 'إنشاء واجب', ru: 'Создать задание' },
  'Reports': { ar: 'التقارير', ru: 'Отчёты' },
  'Completed Submissions': { ar: 'التسليمات المكتملة', ru: 'Завершённые работы' },
  'Answer Accuracy': { ar: 'دقة الإجابات', ru: 'Точность ответов' },
  'Academic Profiles': { ar: 'الملفات الأكاديمية', ru: 'Академические профили' },
  'Interventions': { ar: 'خطط التدخل', ru: 'Поддержка' },
  'Writing Hub': { ar: 'مركز الكتابة', ru: 'Центр письма' },
  'Writing': { ar: 'الكتابة', ru: 'Письмо' },
  'Cambridge': { ar: 'كامبريدج', ru: 'Cambridge' },
  'Cambridge Tests': { ar: 'اختبارات كامبريدج', ru: 'Тесты Cambridge' },
  'IELTS': { ar: 'IELTS', ru: 'IELTS' },
  'Admissions': { ar: 'القبول', ru: 'Поступление' },
  'Clan Wars': { ar: 'حروب العشائر', ru: 'Войны кланов' },
  'Organisation': { ar: 'هيكل المدرسة', ru: 'Организация' },
  'Curriculum & Subjects': { ar: 'المنهج والمواد', ru: 'Учебный план и предметы' },
  'Subjects': { ar: 'المواد', ru: 'Предметы' },
  'Classes & Registration': { ar: 'الفصول والتسجيل', ru: 'Классы и регистрация' },
  'Classes': { ar: 'الفصول', ru: 'Классы' },
  'Teacher Allocation': { ar: 'توزيع المعلمين', ru: 'Распределение учителей' },
  'Document Center': { ar: 'مركز المستندات', ru: 'Центр документов' },
  'Documents': { ar: 'المستندات', ru: 'Документы' },
  'Plan & Billing': { ar: 'الخطة والفوترة', ru: 'Тариф и оплата' },
  'Billing': { ar: 'الفوترة', ru: 'Оплата' },
  'School Settings': { ar: 'إعدادات المدرسة', ru: 'Настройки школы' },
  'Settings': { ar: 'الإعدادات', ru: 'Настройки' },
  'Analytics': { ar: 'التحليلات', ru: 'Аналитика' },
  'Game': { ar: 'اللعبة', ru: 'Игра' },
  'Clans': { ar: 'العشائر', ru: 'Кланы' },
  'System': { ar: 'النظام', ru: 'Система' },
  'Moderation': { ar: 'الإشراف', ru: 'Модерация' },
  'Audit Logs': { ar: 'سجلات التدقيق', ru: 'Журнал аудита' },
  'Identity Requests': { ar: 'طلبات التحقق من الهوية', ru: 'Запросы идентификации' },
  'Booked Appointments': { ar: 'المواعيد المحجوزة', ru: 'Записанные встречи' },
  'Search': { ar: 'بحث', ru: 'Поиск' },
  'Filter': { ar: 'تصفية', ru: 'Фильтр' },
  'Filters': { ar: 'عوامل التصفية', ru: 'Фильтры' },
  'All': { ar: 'الكل', ru: 'Все' },
  'Active': { ar: 'نشط', ru: 'Активные' },
  'Pending': { ar: 'قيد الانتظار', ru: 'Ожидают' },
  'Approved': { ar: 'مقبول', ru: 'Одобрено' },
  'Rejected': { ar: 'مرفوض', ru: 'Отклонено' },
  'Save': { ar: 'حفظ', ru: 'Сохранить' },
  'Cancel': { ar: 'إلغاء', ru: 'Отмена' },
  'Close': { ar: 'إغلاق', ru: 'Закрыть' },
  'Back': { ar: 'رجوع', ru: 'Назад' },
  'Next': { ar: 'التالي', ru: 'Далее' },
  'Previous': { ar: 'السابق', ru: 'Назад' },
  'Edit': { ar: 'تعديل', ru: 'Изменить' },
  'Delete': { ar: 'حذف', ru: 'Удалить' },
  'Add': { ar: 'إضافة', ru: 'Добавить' },
  'Create': { ar: 'إنشاء', ru: 'Создать' },
  'Update': { ar: 'تحديث', ru: 'Обновить' },
  'Refresh': { ar: 'تحديث', ru: 'Обновить' },
  'Export': { ar: 'تصدير', ru: 'Экспорт' },
  'Import': { ar: 'استيراد', ru: 'Импорт' },
  'Name': { ar: 'الاسم', ru: 'Имя' },
  'Email': { ar: 'البريد الإلكتروني', ru: 'Эл. почта' },
  'Role': { ar: 'الدور', ru: 'Роль' },
  'Status': { ar: 'الحالة', ru: 'Статус' },
  'Class': { ar: 'الفصل', ru: 'Класс' },
  'Subject': { ar: 'المادة', ru: 'Предмет' },
  'Actions': { ar: 'الإجراءات', ru: 'Действия' },
  'Details': { ar: 'التفاصيل', ru: 'Подробности' },
  'Notifications': { ar: 'الإشعارات', ru: 'Уведомления' },
  'Help': { ar: 'المساعدة', ru: 'Помощь' },
  'Log Out': { ar: 'تسجيل الخروج', ru: 'Выйти' },
  'Logout': { ar: 'تسجيل الخروج', ru: 'Выйти' },
  'More': { ar: 'المزيد', ru: 'Ещё' },
  'Language': { ar: 'اللغة', ru: 'Язык' },
  'Interface language': { ar: 'لغة الواجهة', ru: 'Язык интерфейса' },
  'Executive Overview': { ar: 'النظرة التنفيذية', ru: 'Обзор руководителя' },
  'Decision Center': { ar: 'مركز القرارات', ru: 'Центр решений' },
  'Academic': { ar: 'الأكاديمي', ru: 'Учебный процесс' },
  'People': { ar: 'الأشخاص', ru: 'Люди' },
  'Programs': { ar: 'البرامج', ru: 'Программы' },
  'Subscription': { ar: 'الاشتراك', ru: 'Подписка' },
  'Governance': { ar: 'الحوكمة', ru: 'Управление' },
  'Children': { ar: 'الأبناء', ru: 'Дети' },
  'Progress': { ar: 'التقدم', ru: 'Прогресс' },
  'Attendance': { ar: 'الحضور', ru: 'Посещаемость' },
};

const LOCKED_SELECTOR = [
  '[lang="en"]',
  '[data-language-lock="en"]',
  'iframe', 'script', 'style', 'code', 'pre', 'textarea', '[contenteditable="true"]',
  '[class*="cambridge-question" i]', '[class*="cambridge-test" i]', '[data-testid*="cambridge-question" i]',
  '[class*="ielts-question" i]', '[class*="ielts-passage" i]', '[data-testid*="ielts-question" i]',
].join(',');

function translateLiteral(language: Language, source: string): string {
  if (language === 'en') return source;
  return STAFF_MESSAGES[source]?.[language] || source;
}

function isLocked(node: Node, root: HTMLElement): boolean {
  const element = node.nodeType === Node.ELEMENT_NODE ? node as Element : node.parentElement;
  const locked = element?.closest(LOCKED_SELECTOR);
  return Boolean(locked && root.contains(locked));
}

export function PortalLocalizationBoundary({ children, portalName }: { children: React.ReactNode; portalName: string }) {
  const { language, direction, setLanguage } = useLanguage();
  const rootRef = useRef<HTMLDivElement>(null);
  const textSources = useRef(new WeakMap<Text, string>());
  const attributeSources = useRef(new WeakMap<Element, Map<string, string>>());

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const processText = (text: Text) => {
      if (isLocked(text, root)) return;
      const current = text.nodeValue || '';
      const stored = textSources.current.get(text);
      const sourceRaw = stored ?? current;
      const source = sourceRaw.trim();
      if (!STAFF_MESSAGES[source]) return;
      if (!stored) textSources.current.set(text, sourceRaw);
      const translated = translateLiteral(language, source);
      const next = sourceRaw.replace(source, translated);
      if (current !== next) text.nodeValue = next;
    };

    const processElement = (element: Element) => {
      if (isLocked(element, root)) return;
      for (const attr of ['aria-label', 'title', 'placeholder']) {
        const current = element.getAttribute(attr);
        if (!current) continue;
        let sources = attributeSources.current.get(element);
        if (!sources) {
          sources = new Map<string, string>();
          attributeSources.current.set(element, sources);
        }
        const source = sources.get(attr) ?? current;
        if (!STAFF_MESSAGES[source]) continue;
        if (!sources.has(attr)) sources.set(attr, source);
        const translated = translateLiteral(language, source);
        if (current !== translated) element.setAttribute(attr, translated);
      }
    };

    const processNode = (node: Node) => {
      if (node.nodeType === Node.TEXT_NODE) processText(node as Text);
      if (node.nodeType === Node.ELEMENT_NODE) {
        const element = node as Element;
        processElement(element);
        const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
        let child = walker.nextNode();
        while (child) {
          if (child.nodeType === Node.TEXT_NODE) processText(child as Text);
          else processElement(child as Element);
          child = walker.nextNode();
        }
      }
    };

    processNode(root);
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'characterData') processNode(mutation.target);
        mutation.addedNodes.forEach(processNode);
      }
    });
    observer.observe(root, { subtree: true, childList: true, characterData: true });
    return () => observer.disconnect();
  }, [language]);

  return (
    <div className="staff-localization-boundary" lang={language} dir={direction} data-portal-language={language}>
      <div className="staff-language-control" role="group" aria-label="Interface language">
        <span className="staff-language-control__label">🌐</span>
        {(['en', 'ar', 'ru'] as Language[]).map((code) => (
          <button key={code} type="button" onClick={() => setLanguage(code)} aria-pressed={language === code} title={code === 'en' ? 'English' : code === 'ar' ? 'العربية' : 'Русский'}>
            {code === 'en' ? 'EN' : code === 'ar' ? 'ع' : 'RU'}
          </button>
        ))}
      </div>
      <div ref={rootRef} className="staff-localized-ui" data-portal-name={portalName}>{children}</div>
      <style>{`
        .staff-localization-boundary { min-height: 100%; }
        .staff-language-control { position: fixed; right: max(12px, env(safe-area-inset-right)); bottom: max(12px, env(safe-area-inset-bottom)); z-index: 2147482000; display: flex; align-items: center; gap: 4px; padding: 5px; border: 1px solid rgba(148,163,184,.35); border-radius: 999px; background: rgba(15,23,42,.94); box-shadow: 0 10px 30px rgba(2,6,23,.28); backdrop-filter: blur(12px); direction: ltr; }
        .staff-language-control__label { padding: 0 4px; font-size: 14px; }
        .staff-language-control button { min-width: 30px; height: 28px; padding: 0 7px; border: 0; border-radius: 999px; background: transparent; color: #cbd5e1; font-size: 11px; font-weight: 800; cursor: pointer; }
        .staff-language-control button[aria-pressed="true"] { background: #0ea5e9; color: white; }
        .staff-localized-ui[dir="rtl"] { text-align: right; }
        .staff-localized-ui[dir="rtl"] input, .staff-localized-ui[dir="rtl"] textarea, .staff-localized-ui[dir="rtl"] [dir="auto"] { text-align: start; }
        @media (max-width: 640px) { .staff-language-control { bottom: max(76px, calc(env(safe-area-inset-bottom) + 64px)); } }
      `}</style>
    </div>
  );
}

export function withPortalLocalization<P extends object>(Component: React.ComponentType<P>, portalName: string) {
  const LocalizedPortal: React.FC<P> = (props) => (
    <PortalLocalizationBoundary portalName={portalName}><Component {...props} /></PortalLocalizationBoundary>
  );
  LocalizedPortal.displayName = `Localized(${Component.displayName || Component.name || portalName})`;
  return LocalizedPortal;
}
