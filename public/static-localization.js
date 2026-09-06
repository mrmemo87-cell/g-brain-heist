(() => {
  const KEY = 'brains-heist:ui-language:v1';
  const languages = {
    en: { name: 'English', dir: 'ltr' },
    ar: { name: 'العربية', dir: 'rtl' },
    ru: { name: 'Русский', dir: 'ltr' },
  };
  const M = {
    'Contact Us': ['تواصل معنا', 'Связаться с нами'],
    "We're here to help — reach out to the right team below.": ['نحن هنا للمساعدة — تواصل مع الفريق المناسب أدناه.', 'Мы готовы помочь — выберите нужную команду ниже.'],
    'Support': ['الدعم', 'Поддержка'],
    'Technical issues, bug reports, how-to questions': ['المشكلات التقنية وتقارير الأخطاء وأسئلة الاستخدام', 'Технические проблемы, сообщения об ошибках и вопросы по использованию'],
    'Sales & Partnerships': ['المبيعات والشراكات', 'Продажи и партнёрства'],
    'Pricing, enterprise plans, school partnerships': ['الأسعار وخطط المؤسسات وشراكات المدارس', 'Цены, корпоративные тарифы и партнёрства со школами'],
    'Privacy & Data': ['الخصوصية والبيانات', 'Конфиденциальность и данные'],
    'Data requests, GDPR inquiries, data deletion': ['طلبات البيانات واستفسارات GDPR وحذف البيانات', 'Запросы данных, GDPR и удаление данных'],
    'Billing': ['الفوترة', 'Оплата'],
    'Refunds, invoices, subscription changes': ['الاستردادات والفواتير وتغييرات الاشتراك', 'Возвраты, счета и изменения подписки'],
    'Response Times': ['أوقات الاستجابة', 'Сроки ответа'],
    'General support': ['الدعم العام', 'Общая поддержка'],
    'Billing & refund requests': ['طلبات الفوترة والاسترداد', 'Запросы по оплате и возвратам'],
    'Privacy / data requests': ['طلبات الخصوصية / البيانات', 'Запросы по конфиденциальности / данным'],
    'Sales inquiries': ['استفسارات المبيعات', 'Запросы по продажам'],
    'Urgent/critical issues': ['المشكلات العاجلة/الحرجة', 'Срочные/критические проблемы'],
    'Within 24 hours': ['خلال 24 ساعة', 'В течение 24 часов'],
    'Within 1 business day': ['خلال يوم عمل واحد', 'В течение 1 рабочего дня'],
    'Within 48 hours': ['خلال 48 ساعة', 'В течение 48 часов'],
    'Within 4 hours (business hours)': ['خلال 4 ساعات (أثناء ساعات العمل)', 'В течение 4 часов (в рабочее время)'],
    'Business hours: Monday – Friday, 08:00 – 18:00 (Bishkek time, UTC+6).': ['ساعات العمل: الاثنين – الجمعة، 08:00 – 18:00 (بتوقيت بيشكيك، UTC+6).', 'Рабочие часы: понедельник–пятница, 08:00–18:00 (Бишкек, UTC+6).'],
    'Frequently Asked Questions': ['الأسئلة الشائعة', 'Часто задаваемые вопросы'],
    'How do I cancel my subscription?': ['كيف ألغي اشتراكي؟', 'Как отменить подписку?'],
    'Can I get a refund?': ['هل يمكنني الحصول على استرداد؟', 'Можно ли получить возврат?'],
    'How do I switch plans?': ['كيف أغيّر الخطة؟', 'Как сменить тариф?'],
    'Who processes my payment?': ['من يعالج عملية الدفع؟', 'Кто обрабатывает мой платёж?'],
    'Is student data safe?': ['هل بيانات الطلاب آمنة؟', 'Безопасны ли данные учеников?'],
    'Do you support schools outside the UK?': ['هل تدعمون المدارس خارج المملكة المتحدة؟', 'Поддерживаются ли школы за пределами Великобритании?'],
    'Business Information': ['معلومات النشاط', 'Информация о компании'],
    'Brains Heist is an educational technology platform for schools.': ['Brains Heist منصة تقنية تعليمية للمدارس.', 'Brains Heist — образовательная технологическая платформа для школ.'],
    'Pricing': ['الأسعار', 'Цены'],
    'Terms of Service': ['شروط الخدمة', 'Условия использования'],
    'Privacy Policy': ['سياسة الخصوصية', 'Политика конфиденциальности'],
    'Refund & Cancellation': ['الاسترداد والإلغاء', 'Возврат и отмена'],
    'Refund & Cancellation Policy': ['سياسة الاسترداد والإلغاء', 'Политика возврата и отмены'],
    'Contact': ['التواصل', 'Контакты'],
    'Terms and Conditions': ['الشروط والأحكام', 'Условия и положения'],
    'Last updated:': ['آخر تحديث:', 'Последнее обновление:'],
    'Introduction': ['مقدمة', 'Введение'],
    'Eligibility': ['الأهلية', 'Право на использование'],
    'Accounts': ['الحسابات', 'Аккаунты'],
    'Subscriptions & Billing': ['الاشتراكات والفوترة', 'Подписки и оплата'],
    'Acceptable Use': ['الاستخدام المقبول', 'Допустимое использование'],
    'Intellectual Property': ['الملكية الفكرية', 'Интеллектуальная собственность'],
    'Limitation of Liability': ['تحديد المسؤولية', 'Ограничение ответственности'],
    'Termination': ['الإنهاء', 'Прекращение доступа'],
    'Governing Law': ['القانون الحاكم', 'Применимое право'],
    'Changes to These Terms': ['التغييرات على هذه الشروط', 'Изменения условий'],
    'Information We Collect': ['المعلومات التي نجمعها', 'Какие данные мы собираем'],
    'How We Use Your Information': ['كيف نستخدم معلوماتك', 'Как мы используем данные'],
    'Data Sharing': ['مشاركة البيانات', 'Передача данных'],
    'Data Security': ['أمن البيانات', 'Безопасность данных'],
    'Data Retention': ['الاحتفاظ بالبيانات', 'Хранение данных'],
    'Your Rights': ['حقوقك', 'Ваши права'],
    "Children's Privacy": ['خصوصية الأطفال', 'Конфиденциальность детей'],
    'International Data Transfers': ['نقل البيانات دولياً', 'Международная передача данных'],
    'Changes to This Policy': ['التغييرات على هذه السياسة', 'Изменения политики'],
    'Contact Us About Privacy': ['تواصل معنا بشأن الخصوصية', 'Связаться по вопросам конфиденциальности'],
    'Refund Eligibility': ['أهلية الاسترداد', 'Условия возврата'],
    'How to Request a Refund': ['كيفية طلب الاسترداد', 'Как запросить возврат'],
    'Cancellation': ['الإلغاء', 'Отмена'],
    'Auto-Renewals': ['التجديد التلقائي', 'Автопродление'],
    'Processing Time': ['مدة المعالجة', 'Срок обработки'],
    'Exceptions': ['الاستثناءات', 'Исключения'],
    'School Pricing': ['أسعار المدارس', 'Цены для школ'],
    'Choose the package that fits your school.': ['اختر الحزمة المناسبة لمدرستك.', 'Выберите пакет, подходящий вашей школе.'],
    'Students': ['الطلاب', 'Ученики'],
    'Candidates': ['المرشحون', 'Кандидаты'],
    'First year': ['السنة الأولى', 'Первый год'],
    'Discounts': ['الخصومات', 'Скидки'],
    'None selected': ['لم يتم اختيار شيء', 'Не выбрано'],
    'Contact sales': ['تواصل مع المبيعات', 'Связаться с отделом продаж'],
    'Prime': ['Prime', 'Prime'],
    'IELTS Prime': ['IELTS Prime', 'IELTS Prime'],
    'Start now': ['ابدأ الآن', 'Начать сейчас'],
    'Get started': ['ابدأ', 'Начать'],
    'Back to Brains Heist': ['العودة إلى Brains Heist', 'Вернуться в Brains Heist'],
    'All rights reserved.': ['جميع الحقوق محفوظة.', 'Все права защищены.'],
  };

  let lang = (() => { try { const v = localStorage.getItem(KEY); return languages[v] ? v : 'en'; } catch { return 'en'; } })();
  const original = new WeakMap();
  let translating = false;

  function translated(value) {
    const pair = M[value];
    if (!pair || lang === 'en') return value;
    return pair[lang === 'ar' ? 0 : 1] || value;
  }

  function translateTextNode(node) {
    if (!node.nodeValue || !node.nodeValue.trim()) return;
    const parent = node.parentElement;
    if (!parent || ['SCRIPT','STYLE','NOSCRIPT','TEXTAREA','CODE','PRE'].includes(parent.tagName)) return;
    if (!original.has(node)) original.set(node, node.nodeValue);
    const source = original.get(node);
    const leading = source.match(/^\s*/)?.[0] || '';
    const trailing = source.match(/\s*$/)?.[0] || '';
    const core = source.trim();
    if (!core) return;
    node.nodeValue = leading + translated(core) + trailing;
  }

  function translateElement(el) {
    ['title','aria-label','placeholder'].forEach((attr) => {
      if (!el.hasAttribute?.(attr)) return;
      const key = `attr:${attr}`;
      let store = original.get(el);
      if (!store || typeof store !== 'object') { store = {}; original.set(el, store); }
      if (!(key in store)) store[key] = el.getAttribute(attr);
      const source = store[key];
      if (source) el.setAttribute(attr, translated(source));
    });
  }

  function apply(root = document.body) {
    if (!root || translating) return;
    translating = true;
    document.documentElement.lang = lang;
    document.documentElement.dir = languages[lang].dir;
    document.body?.classList.toggle('static-localized-rtl', lang === 'ar');
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(translateTextNode);
    root.querySelectorAll?.('*').forEach(translateElement);
    translating = false;
  }

  function setLanguage(next) {
    if (!languages[next]) return;
    lang = next;
    try { localStorage.setItem(KEY, next); } catch {}
    apply(document.body);
    control.querySelector('select').value = next;
  }

  const style = document.createElement('style');
  style.textContent = `.static-language-control{position:fixed;z-index:2147483000;left:max(10px,env(safe-area-inset-left));top:50%;transform:translateY(-50%);display:flex;align-items:center;gap:.35rem;padding:.45rem;border:1px solid rgba(34,211,238,.35);border-radius:18px;background:rgba(8,19,33,.96);box-shadow:0 12px 36px rgba(0,0,0,.28);backdrop-filter:blur(14px)}.static-language-control span{font-size:1.2rem}.static-language-control select{width:1px;max-width:1px;opacity:0;border:0;padding:0;background:transparent;color:#fff}.static-language-control:focus-within select,.static-language-control:hover select{width:7rem;max-width:7rem;opacity:1;padding:.35rem}.static-localized-rtl{font-family:Tahoma,Arial,sans-serif}.static-localized-rtl .container,.static-localized-rtl main,.static-localized-rtl section{text-align:right}.static-localized-rtl ul,.static-localized-rtl ol{padding-right:1.5rem;padding-left:0}`;
  document.head.appendChild(style);

  const control = document.createElement('label');
  control.className = 'static-language-control';
  control.setAttribute('aria-label', 'Change language');
  control.innerHTML = `<span aria-hidden="true">🌐</span><select>${Object.entries(languages).map(([code,v]) => `<option value="${code}">${v.name}</option>`).join('')}</select>`;
  control.querySelector('select').value = lang;
  control.querySelector('select').addEventListener('change', (event) => setLanguage(event.target.value));

  function boot() {
    document.body.appendChild(control);
    apply(document.body);
    const observer = new MutationObserver((mutations) => {
      if (translating) return;
      for (const mutation of mutations) {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.TEXT_NODE) translateTextNode(node);
          else if (node.nodeType === Node.ELEMENT_NODE) apply(node);
        });
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
