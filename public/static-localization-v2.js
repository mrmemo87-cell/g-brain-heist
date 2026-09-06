(() => {
  const STORAGE_KEY = 'brains-heist:ui-language:v1';
  const LANGUAGES = {
    en: { name: 'English', short: 'EN', dir: 'ltr' },
    ar: { name: 'العربية', short: 'ع', dir: 'rtl' },
    ru: { name: 'Русский', short: 'RU', dir: 'ltr' },
  };

  const T = {
    // Shared public navigation / footer
    'Brains Heist': ['Brains Heist', 'Brains Heist'],
    'Pricing': ['الأسعار', 'Цены'],
    'Terms': ['الشروط', 'Условия'],
    'Terms of Service': ['شروط الخدمة', 'Условия использования'],
    'Privacy': ['الخصوصية', 'Конфиденциальность'],
    'Privacy Policy': ['سياسة الخصوصية', 'Политика конфиденциальности'],
    'Refunds': ['الاستردادات', 'Возвраты'],
    'Refund & Cancellation': ['الاسترداد والإلغاء', 'Возврат и отмена'],
    'Refund & Cancellation Policy': ['سياسة الاسترداد والإلغاء', 'Политика возврата и отмены'],
    'Contact': ['التواصل', 'Контакты'],
    'Contact Us': ['تواصل معنا', 'Связаться с нами'],
    'All rights reserved.': ['جميع الحقوق محفوظة.', 'Все права защищены.'],
    '© 2026 Brains Heist. All rights reserved.': ['© 2026 Brains Heist. جميع الحقوق محفوظة.', '© 2026 Brains Heist. Все права защищены.'],
    'Back to Brains Heist': ['العودة إلى Brains Heist', 'Вернуться в Brains Heist'],
    'Back to Game': ['العودة إلى اللعبة', 'Вернуться в игру'],
    'Summary:': ['ملخص:', 'Кратко:'],
    'Last updated:': ['آخر تحديث:', 'Последнее обновление:'],
    'Last updated: February 23, 2026': ['آخر تحديث: 23 فبراير 2026', 'Последнее обновление: 23 февраля 2026 г.'],

    // Contact
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
    'Privacy / data requests': ['طلبات الخصوصية والبيانات', 'Запросы по конфиденциальности и данным'],
    'Sales inquiries': ['استفسارات المبيعات', 'Запросы по продажам'],
    'Urgent/critical issues': ['المشكلات العاجلة/الحرجة', 'Срочные/критические проблемы'],
    'Within 24 hours': ['خلال 24 ساعة', 'В течение 24 часов'],
    'Within 1 business day': ['خلال يوم عمل واحد', 'В течение 1 рабочего дня'],
    'Within 48 hours': ['خلال 48 ساعة', 'В течение 48 часов'],
    'Within 4 hours (business hours)': ['خلال 4 ساعات (أثناء ساعات العمل)', 'В течение 4 часов (в рабочее время)'],
    'Business Information': ['معلومات النشاط', 'Информация о компании'],
    'Frequently Asked Questions': ['الأسئلة الشائعة', 'Часто задаваемые вопросы'],

    // Legal headings and table vocabulary
    'Definitions': ['التعريفات', 'Определения'],
    'Acceptance of Terms': ['قبول الشروط', 'Принятие условий'],
    'Accounts & Registration': ['الحسابات والتسجيل', 'Аккаунты и регистрация'],
    'Subscriptions & Billing': ['الاشتراكات والفوترة', 'Подписки и оплата'],
    'Free Pilot Trial': ['التجربة المجانية', 'Бесплатный пилот'],
    'Cancellation & Refunds': ['الإلغاء والاسترداد', 'Отмена и возвраты'],
    'Acceptable Use': ['الاستخدام المقبول', 'Допустимое использование'],
    'Intellectual Property': ['الملكية الفكرية', 'Интеллектуальная собственность'],
    'Data & Privacy': ['البيانات والخصوصية', 'Данные и конфиденциальность'],
    'Availability & Modifications': ['التوفر والتعديلات', 'Доступность и изменения'],
    'Limitation of Liability': ['تحديد المسؤولية', 'Ограничение ответственности'],
    'Indemnification': ['التعويض', 'Возмещение убытков'],
    'Governing Law': ['القانون الحاكم', 'Применимое право'],
    'Changes to These Terms': ['التغييرات على هذه الشروط', 'Изменения условий'],
    'Who We Are': ['من نحن', 'Кто мы'],
    'Data We Collect': ['البيانات التي نجمعها', 'Какие данные мы собираем'],
    'Account Data (provided by you)': ['بيانات الحساب (التي تقدمها)', 'Данные аккаунта (предоставленные вами)'],
    'Usage Data (generated automatically)': ['بيانات الاستخدام (تُنشأ تلقائياً)', 'Данные использования (создаются автоматически)'],
    'Payment Data': ['بيانات الدفع', 'Платёжные данные'],
    'How We Use Your Data': ['كيف نستخدم بياناتك', 'Как мы используем ваши данные'],
    'Data Sharing': ['مشاركة البيانات', 'Передача данных'],
    'Data Storage & Security': ['تخزين البيانات وأمنها', 'Хранение и безопасность данных'],
    'Data Retention': ['الاحتفاظ بالبيانات', 'Срок хранения данных'],
    "Children's Privacy": ['خصوصية الأطفال', 'Конфиденциальность детей'],
    'Your Rights': ['حقوقك', 'Ваши права'],
    'Cookies & Tracking': ['ملفات تعريف الارتباط والتتبع', 'Cookie и отслеживание'],
    'International Transfers': ['نقل البيانات دولياً', 'Международная передача данных'],
    'Changes to This Policy': ['التغييرات على هذه السياسة', 'Изменения политики'],
    'How to Cancel': ['كيفية الإلغاء', 'Как отменить'],
    'What Happens When You Cancel': ['ماذا يحدث عند الإلغاء', 'Что происходит после отмены'],
    'Refunds': ['الاستردادات', 'Возвраты'],
    '14-Day Refund Window': ['مهلة الاسترداد خلال 14 يوماً', '14-дневный период возврата'],
    'How to Request a Refund': ['كيفية طلب الاسترداد', 'Как запросить возврат'],
    'Refund Method': ['طريقة الاسترداد', 'Способ возврата'],
    'Plan Changes': ['تغييرات الخطة', 'Изменение тарифа'],
    'Upgrades': ['الترقية', 'Повышение тарифа'],
    'Downgrades': ['خفض الخطة', 'Понижение тарифа'],
    'Failed Payments': ['المدفوعات الفاشلة', 'Неудачные платежи'],
    'Exceptions': ['الاستثناءات', 'Исключения'],
    'Paddle as Merchant of Record': ['Paddle بصفتها البائع المسجل', 'Paddle как официальный продавец'],
    'Data': ['البيانات', 'Данные'],
    'Purpose': ['الغرض', 'Назначение'],
    'Basis': ['الأساس القانوني', 'Основание'],
    'Recipient': ['الجهة المستلمة', 'Получатель'],
    'Data Shared': ['البيانات المشتركة', 'Передаваемые данные'],
    'Condition': ['الشرط', 'Условие'],
    'Refund Eligible?': ['هل الاسترداد متاح؟', 'Возврат доступен?'],
    'Contract': ['العقد', 'Договор'],
    'Consent': ['الموافقة', 'Согласие'],
    'Legitimate interest': ['مصلحة مشروعة', 'Законный интерес'],

    // Legal / privacy clauses (long text nodes and split fragments)
    'Brains Heist is a gamified educational platform sold to schools on a subscription basis. By using our service, you agree to these terms. Payments are processed by': ['Brains Heist منصة تعليمية تفاعلية تُقدَّم للمدارس بنظام الاشتراك. باستخدامك للخدمة فإنك توافق على هذه الشروط. تتم معالجة المدفوعات بواسطة', 'Brains Heist — игровая образовательная платформа для школ по подписке. Используя сервис, вы соглашаетесь с этими условиями. Платежи обрабатывает'],
    ', our Merchant of Record.': ['، وهي البائع المسجل لدينا.', ' — наш официальный продавец.'],
    'By accessing or using the Service, you agree to be bound by these Terms of Service. If you are subscribing on behalf of a school, you represent that you have authority to bind the school to these terms.': ['بدخولك إلى الخدمة أو استخدامها، فإنك توافق على الالتزام بشروط الخدمة هذه. وإذا كنت تشترك نيابةً عن مدرسة، فأنت تقر بأن لديك الصلاحية لإلزام المدرسة بهذه الشروط.', 'Получая доступ к Сервису или используя его, вы соглашаетесь соблюдать настоящие Условия. Если вы оформляете подписку от имени школы, вы подтверждаете полномочия принять эти условия от её имени.'],
    'If you do not agree to these terms, you must not use the Service.': ['إذا كنت لا توافق على هذه الشروط، فيجب ألا تستخدم الخدمة.', 'Если вы не согласны с этими условиями, не используйте Сервис.'],
    'You must provide accurate information during registration.': ['يجب تقديم معلومات دقيقة أثناء التسجيل.', 'При регистрации необходимо указывать достоверную информацию.'],
    'You are responsible for maintaining the security of your account credentials.': ['أنت مسؤول عن الحفاظ على أمان بيانات اعتماد حسابك.', 'Вы отвечаете за безопасность данных для входа в свой аккаунт.'],
    'School Admins are responsible for managing user accounts within their school.': ['مسؤولو المدرسة مسؤولون عن إدارة حسابات المستخدمين داخل مدرستهم.', 'Администраторы школы отвечают за управление учётными записями внутри своей школы.'],
    'Subscriptions are sold at the school level. Individual students do not purchase subscriptions.': ['تُباع الاشتراكات على مستوى المدرسة، ولا يشتري الطلاب الأفراد اشتراكات.', 'Подписки приобретаются школой; отдельные ученики их не покупают.'],
    'Subscriptions auto-renew at the end of each billing period (monthly or yearly) unless cancelled before the renewal date.': ['تتجدد الاشتراكات تلقائياً في نهاية كل فترة فوترة (شهرية أو سنوية) ما لم تُلغَ قبل تاريخ التجديد.', 'Подписка продлевается автоматически в конце каждого расчётного периода (месяц или год), если её не отменить до даты продления.'],
    'Each school is eligible for one 30-day free pilot trial.': ['يحق لكل مدرسة تجربة مجانية واحدة لمدة 30 يوماً.', 'Каждой школе доступен один бесплатный 30-дневный пилот.'],
    'No credit card is required to start a pilot.': ['لا يلزم إدخال بطاقة ائتمان لبدء التجربة.', 'Для начала пилота банковская карта не требуется.'],
    'You may cancel your subscription at any time. Access continues until the end of the current billing period.': ['يمكنك إلغاء اشتراكك في أي وقت، ويستمر الوصول حتى نهاية فترة الفوترة الحالية.', 'Подписку можно отменить в любое время; доступ сохраняется до конца текущего оплаченного периода.'],
    'You agree not to:': ['أنت توافق على عدم القيام بما يلي:', 'Вы обязуетесь не:'],
    'Use the Service for any unlawful purpose.': ['استخدام الخدمة لأي غرض غير قانوني.', 'использовать Сервис в незаконных целях.'],
    "Attempt to gain unauthorized access to other users' accounts or data.": ['محاولة الوصول غير المصرح به إلى حسابات أو بيانات مستخدمين آخرين.', 'пытаться получить несанкционированный доступ к аккаунтам или данным других пользователей.'],
    'Upload harmful, offensive, or inappropriate content.': ['رفع محتوى ضار أو مسيء أو غير مناسب.', 'загружать вредоносный, оскорбительный или неприемлемый контент.'],
    'Share account credentials with unauthorized parties.': ['مشاركة بيانات اعتماد الحساب مع جهات غير مصرح لها.', 'передавать данные для входа неуполномоченным лицам.'],
    'Resell or redistribute access to the Service.': ['إعادة بيع أو إعادة توزيع الوصول إلى الخدمة.', 'перепродавать или перераспределять доступ к Сервису.'],
    'To the maximum extent permitted by law:': ['إلى أقصى حد يسمح به القانون:', 'В максимально допустимой законом степени:'],
    'The Service is provided "as is" without warranties of any kind.': ['تُقدَّم الخدمة «كما هي» دون أي ضمانات من أي نوع.', 'Сервис предоставляется «как есть» без каких-либо гарантий.'],
    'We are not liable for any indirect, incidental, special, or consequential damages.': ['لسنا مسؤولين عن أي أضرار غير مباشرة أو عرضية أو خاصة أو تبعية.', 'Мы не несём ответственности за косвенные, случайные, специальные или последующие убытки.'],
    'These terms are governed by the laws of the Kyrgyz Republic. Disputes shall be resolved in the courts of Bishkek, Kyrgyz Republic, unless otherwise required by consumer protection laws in your jurisdiction.': ['تخضع هذه الشروط لقوانين جمهورية قيرغيزستان، وتُحل النزاعات أمام محاكم بيشكيك ما لم تتطلب قوانين حماية المستهلك في نطاقك القضائي خلاف ذلك.', 'Эти условия регулируются законодательством Кыргызской Республики. Споры рассматриваются судами Бишкека, если иное не требуется законодательством о защите потребителей вашей юрисдикции.'],
    'Brains Heist is a school-facing educational platform. We collect minimal personal data, never sell it, and store it securely on Supabase. Payments are handled by Paddle — we never see or store payment card details.': ['Brains Heist منصة تعليمية موجهة للمدارس. نجمع الحد الأدنى من البيانات الشخصية، ولا نبيعها أبداً، ونخزنها بأمان على Supabase. تتم معالجة المدفوعات بواسطة Paddle، ولا نرى أو نخزن بيانات بطاقات الدفع.', 'Brains Heist — образовательная платформа для школ. Мы собираем минимум персональных данных, никогда их не продаём и безопасно храним в Supabase. Платежи обрабатывает Paddle; мы не видим и не храним данные банковских карт.'],
    'We do not sell personal data. We share data only with:': ['نحن لا نبيع البيانات الشخصية. ولا نشارك البيانات إلا مع:', 'Мы не продаём персональные данные и передаём их только следующим поставщикам:'],
    'We do not share data with advertisers, data brokers, or social media platforms.': ['لا نشارك البيانات مع المعلنين أو وسطاء البيانات أو منصات التواصل الاجتماعي.', 'Мы не передаём данные рекламодателям, брокерам данных или социальным сетям.'],
    'Data is stored in Supabase (PostgreSQL) with Row Level Security (RLS) enforced — users can only access data they are authorized to see.': ['تُخزن البيانات في Supabase (PostgreSQL) مع تطبيق أمان مستوى الصف (RLS)، بحيث لا يصل المستخدمون إلا إلى البيانات المصرح لهم برؤيتها.', 'Данные хранятся в Supabase (PostgreSQL) с Row Level Security (RLS): пользователи видят только данные, к которым у них есть разрешение.'],
    'All data is encrypted in transit (TLS 1.2+) and at rest.': ['جميع البيانات مشفرة أثناء النقل (TLS 1.2+) وأثناء التخزين.', 'Все данные шифруются при передаче (TLS 1.2+) и хранении.'],
    'Access to production databases is restricted to authorized personnel only.': ['الوصول إلى قواعد بيانات الإنتاج مقصور على الأشخاص المصرح لهم فقط.', 'Доступ к производственным базам данных предоставляется только уполномоченным сотрудникам.'],
    'Brains Heist is designed for use in schools. We do not knowingly collect data from children under 13 without the involvement of their school. Schools are responsible for obtaining any required parental/guardian consent.': ['تم تصميم Brains Heist للاستخدام في المدارس. لا نجمع عن علم بيانات من أطفال دون 13 عاماً دون مشاركة مدرستهم. المدارس مسؤولة عن الحصول على أي موافقات لازمة من الوالدين أو أولياء الأمور.', 'Brains Heist предназначен для школ. Мы сознательно не собираем данные детей младше 13 лет без участия школы. Школа отвечает за получение необходимого согласия родителей или опекунов.'],
    'Depending on your jurisdiction, you may have the right to:': ['بحسب نطاقك القضائي، قد تكون لك الحقوق التالية:', 'В зависимости от вашей юрисдикции вы можете иметь право:'],
    'We use minimal cookies:': ['نستخدم الحد الأدنى من ملفات تعريف الارتباط:', 'Мы используем минимум cookie:'],
    'We do not use third-party tracking cookies, analytics cookies, or advertising cookies.': ['لا نستخدم ملفات تعريف ارتباط للتتبع من جهات خارجية أو للتحليلات أو الإعلانات.', 'Мы не используем сторонние cookie для отслеживания, аналитики или рекламы.'],
    'You can cancel anytime — access continues until the end of the billing period. Refunds are available within 14 days of purchase if you haven\'t substantially used the service. All billing is handled by': ['يمكنك الإلغاء في أي وقت، ويستمر الوصول حتى نهاية فترة الفوترة. تتوفر الاستردادات خلال 14 يوماً من الشراء إذا لم تستخدم الخدمة بشكل جوهري. تتم جميع عمليات الفوترة بواسطة', 'Отменить подписку можно в любое время; доступ сохранится до конца оплаченного периода. Возврат возможен в течение 14 дней после покупки при незначительном использовании сервиса. Все платежи обрабатывает'],
    'School administrators can cancel their subscription at any time through:': ['يمكن لمسؤولي المدرسة إلغاء الاشتراك في أي وقت عبر:', 'Администраторы школы могут отменить подписку в любое время через:'],
    'Your subscription will not renew at the end of the current billing period.': ['لن يتجدد اشتراكك عند نهاية فترة الفوترة الحالية.', 'Подписка не будет продлена после окончания текущего периода.'],
    "You retain full access to all paid features until the end of the period you've already paid for.": ['يستمر وصولك الكامل إلى الميزات المدفوعة حتى نهاية الفترة التي دفعت مقابلها.', 'Полный доступ ко всем оплаченным функциям сохраняется до конца уже оплаченного периода.'],
    'After the billing period ends, your school reverts to the free tier (Lockdown mode only).': ['بعد انتهاء فترة الفوترة، تعود مدرستك إلى الخطة المجانية (وضع Lockdown فقط).', 'После окончания периода школа переходит на бесплатный уровень (только режим Lockdown).'],
    'We offer a 14-day refund from the date of your initial subscription purchase, subject to the following conditions:': ['نقدم إمكانية الاسترداد خلال 14 يوماً من تاريخ شراء الاشتراك الأول، وفق الشروط التالية:', 'Мы предоставляем возврат в течение 14 дней с даты первой покупки подписки при соблюдении следующих условий:'],
    'Refunds are issued to the original payment method via Paddle. We cannot issue refunds to a different payment method or as account credit.': ['تُعاد المبالغ إلى وسيلة الدفع الأصلية عبر Paddle. لا يمكننا إعادة المبلغ إلى وسيلة دفع أخرى أو كرصد في الحساب.', 'Возврат выполняется Paddle на исходный способ оплаты. Мы не можем вернуть средства на другой способ оплаты или зачислить их как баланс аккаунта.'],
    'You can upgrade your plan at any time.': ['يمكنك ترقية خطتك في أي وقت.', 'Повысить тариф можно в любое время.'],
    'Downgrades take effect at the start of the next billing period.': ['يبدأ تطبيق خفض الخطة مع بداية فترة الفوترة التالية.', 'Понижение тарифа вступает в силу с начала следующего расчётного периода.'],
    'Student data is preserved. Resubscribing restores access.': ['يتم الاحتفاظ ببيانات الطلاب، ويؤدي إعادة الاشتراك إلى استعادة الوصول.', 'Данные учеников сохраняются; повторная подписка восстанавливает доступ.'],

    // Privacy tables
    'Email address': ['عنوان البريد الإلكتروني', 'Адрес электронной почты'],
    'Authentication, password reset, billing communication': ['المصادقة وإعادة تعيين كلمة المرور والتواصل بشأن الفوترة', 'Аутентификация, сброс пароля, сообщения об оплате'],
    'Username / display name': ['اسم المستخدم / الاسم الظاهر', 'Имя пользователя / отображаемое имя'],
    'In-game identity, leaderboards': ['هوية داخل اللعبة ولوحات الصدارة', 'Игровая идентичность, рейтинги'],
    'School affiliation, grade, class': ['المدرسة والصف الدراسي والفصل', 'Школа, год обучения, класс'],
    'Multi-tenant isolation, reporting': ['عزل بيانات المدارس وإعداد التقارير', 'Изоляция школ и отчётность'],
    'Role (student / teacher / admin)': ['الدور (طالب / معلم / إداري)', 'Роль (ученик / учитель / администратор)'],
    'Access control, feature gating': ['التحكم في الوصول وتحديد الميزات', 'Контроль доступа и доступность функций'],
    'Avatar image (optional)': ['صورة الملف الشخصي (اختيارية)', 'Аватар (необязательно)'],
    'Profile personalization': ['تخصيص الملف الشخصي', 'Персонализация профиля'],
    'Game progress (XP, level, coins, achievements)': ['تقدم اللعبة (XP والمستوى والعملات والإنجازات)', 'Игровой прогресс (XP, уровень, монеты, достижения)'],
    'Core game functionality': ['وظائف اللعبة الأساسية', 'Основная игровая функциональность'],
    'Assessment scores & submissions': ['درجات التقييم والتسليمات', 'Результаты оценивания и работы'],
    'Educational reporting for teachers': ['التقارير التعليمية للمعلمين', 'Учебная отчётность для учителей'],
    'Activity timestamps': ['أوقات النشاط', 'Временные метки активности'],
    'Streak tracking, session management': ['تتبع السلسلة وإدارة الجلسات', 'Учёт серии и управление сессиями'],
    'Security, abuse prevention': ['الأمان ومنع إساءة الاستخدام', 'Безопасность и предотвращение злоупотреблений'],

    // Pricing page
    'Transparent school pricing': ['أسعار مدرسية واضحة', 'Прозрачные цены для школ'],
    'Build the package your school actually needs.': ['كوّن الحزمة التي تحتاجها مدرستك فعلاً.', 'Соберите пакет, который действительно нужен вашей школе.'],
    'Start with platform seats, then add Cambridge, IELTS, Writing Hub, or Admission Hub only for the learners who use them. Teachers and administrators are free.': ['ابدأ بمقاعد المنصة، ثم أضف Cambridge أو IELTS أو مركز الكتابة أو مركز القبول فقط للطلاب الذين يستخدمونها. المعلمون والإداريون مجاناً.', 'Начните с мест на платформе и добавляйте Cambridge, IELTS, Writing Hub или Admission Hub только для тех учеников, которым они нужны. Учителя и администраторы — бесплатно.'],
    'Build a live estimate': ['أنشئ تقديراً مباشراً', 'Рассчитать стоимость'],
    'Open Plan & Billing': ['فتح الخطة والفوترة', 'Открыть тариф и оплату'],
    '30-day all-programme pilot': ['تجربة لمدة 30 يوماً تشمل جميع البرامج', '30-дневный пилот со всеми программами'],
    'Up to 50 students · 10 teachers · 50 admission candidates · no card required.': ['حتى 50 طالباً · 10 معلمين · 50 مرشح قبول · لا يلزم إدخال بطاقة.', 'До 50 учеников · 10 учителей · 50 кандидатов · карта не требуется.'],
    'Start through your School Head': ['ابدأ عبر قائد المدرسة', 'Начать через руководителя школы'],
    'One platform, flexible programmes': ['منصة واحدة، برامج مرنة', 'Одна платформа, гибкие программы'],
    'Pay for the capacity you assign.': ['ادفع مقابل السعة التي تخصصها فقط.', 'Платите только за назначенную ёмкость.'],
    'Programme seats are separate from platform seats, so a learner can use the school platform without automatically creating a Cambridge, IELTS, Writing, or Admissions charge.': ['مقاعد البرامج منفصلة عن مقاعد المنصة، لذلك يمكن للطالب استخدام منصة المدرسة دون أن يترتب تلقائياً رسم Cambridge أو IELTS أو الكتابة أو القبول.', 'Места программ отделены от мест платформы: ученик может пользоваться школьной платформой без автоматической оплаты Cambridge, IELTS, Writing или Admissions.'],
    'Loading the active pricing catalogue…': ['جارٍ تحميل قائمة الأسعار الحالية…', 'Загружаем актуальный каталог цен…'],
    'Public estimate': ['تقدير عام', 'Публичный расчёт'],
    'Test your real numbers.': ['جرّب أرقام مدرستك الفعلية.', 'Проверьте расчёт на реальных данных.'],
    'This estimate uses the same active catalogue and discount rules as the School Admin Billing Studio. Your School Head can save and submit the final scenario after signing in.': ['يستخدم هذا التقدير قائمة الأسعار وقواعد الخصم نفسها المستخدمة في نظام فوترة إدارة المدرسة. يمكن لقائد المدرسة حفظ السيناريو النهائي وإرساله بعد تسجيل الدخول.', 'Расчёт использует тот же актуальный каталог и правила скидок, что и Billing Studio администрации школы. Руководитель школы сможет сохранить и отправить итоговый вариант после входа.'],
    'School size': ['حجم المدرسة', 'Размер школы'],
    'Platform student seats': ['مقاعد الطلاب على المنصة', 'Места учеников на платформе'],
    'Teachers & admins free': ['المعلمون والإداريون مجاناً', 'Учителя и администраторы бесплатно'],
    'Adjust seats': ['تعديل عدد المقاعد', 'Настроить места'],
    'Exact number': ['العدد الدقيق', 'Точное количество'],
    'Programmes': ['البرامج', 'Программы'],
    'Choose optional programme seats': ['اختر مقاعد البرامج الاختيارية', 'Выберите места дополнительных программ'],
    'Agreement': ['الاتفاقية', 'Срок договора'],
    'Choose a billing term': ['اختر مدة الفوترة', 'Выберите срок оплаты'],
    'Include the Launch offer': ['تطبيق عرض الإطلاق', 'Применить стартовое предложение'],
    'Pricing estimate': ['تقدير الأسعار', 'Расчёт стоимости'],
    'Live estimate': ['تقدير مباشر', 'Текущий расчёт'],
    'Loading catalogue': ['جارٍ تحميل القائمة', 'Загрузка каталога'],
    'Preparing your estimate…': ['جارٍ إعداد التقدير…', 'Готовим расчёт…'],
    'Commercial rules': ['القواعد التجارية', 'Коммерческие правила'],
    'No surprise overages': ['لا رسوم مفاجئة', 'Никаких неожиданных доплат'],
    'Your school approves exact capacities before activation.': ['تعتمد مدرستك السعات الدقيقة قبل التفعيل.', 'Школа утверждает точные объёмы до активации.'],
    'Immediate seat increases': ['زيادة المقاعد فوراً', 'Мгновенное увеличение мест'],
    'Add capacity when learners need it.': ['أضف السعة عندما يحتاجها الطلاب.', 'Добавляйте места, когда они нужны ученикам.'],
    'Decreases at renewal': ['خفض السعة عند التجديد', 'Снижение при продлении'],
    'Committed capacity stays stable through the term.': ['تظل السعة المتفق عليها ثابتة طوال مدة العقد.', 'Согласованная ёмкость сохраняется до конца срока.'],
    'Named programme seats': ['مقاعد برامج مخصصة', 'Именные места программ'],
    'Assign optional programmes only to enrolled learners.': ['خصص البرامج الاختيارية فقط للطلاب المسجلين فيها.', 'Назначайте дополнительные программы только зачисленным ученикам.'],
    'How activation works': ['كيف يتم التفعيل', 'Как работает активация'],
    'Clear approval before access changes.': ['موافقة واضحة قبل تغيير صلاحيات الوصول.', 'Чёткое подтверждение до изменения доступа.'],
    'Build and submit': ['أنشئ وأرسل', 'Соберите и отправьте'],
    'Review and accept': ['راجع ووافق', 'Проверка и подтверждение'],
    'Verify and activate': ['تحقق وفعّل', 'Проверка и активация'],
    'Ready to plan your school rollout?': ['هل أنت مستعد لتخطيط إطلاق المنصة في مدرستك؟', 'Готовы спланировать запуск в школе?'],
    'Sign in as the School Head to save scenarios, request a package, or begin the free pilot.': ['سجّل الدخول كقائد للمدرسة لحفظ السيناريوهات أو طلب حزمة أو بدء التجربة المجانية.', 'Войдите как руководитель школы, чтобы сохранять сценарии, запрашивать пакет или начать бесплатный пилот.'],
    'Annual': ['سنوي', 'Год'],
    'Standard annual agreement': ['اتفاق سنوي قياسي', 'Стандартный годовой договор'],
    '2 years': ['سنتان', '2 года'],
    'Prepaid discount': ['خصم الدفع المسبق', 'Скидка за предоплату'],
    '3 years': ['3 سنوات', '3 года'],
    'Best term discount': ['أفضل خصم للمدة', 'Максимальная скидка за срок'],
    'Only students enrolled in Cambridge': ['فقط الطلاب المسجلون في Cambridge', 'Только ученики программы Cambridge'],
    'Only students enrolled in IELTS': ['فقط الطلاب المسجلون في IELTS', 'Только ученики программы IELTS'],
    '10 AI reviews per student each month': ['10 مراجعات بالذكاء الاصطناعي لكل طالب شهرياً', '10 AI-проверок на ученика в месяц'],
    'Candidate seats, separate from platform seats': ['مقاعد المرشحين منفصلة عن مقاعد المنصة', 'Места кандидатов отдельно от мест платформы'],
    'Unlimited teachers and administrators': ['عدد غير محدود من المعلمين والإداريين', 'Неограниченное число учителей и администраторов'],
    'Includes 10 AI reviews/student/month': ['يتضمن 10 مراجعات AI لكل طالب شهرياً', 'Включает 10 AI-проверок на ученика в месяц'],
    'Optional named-seat programme': ['برنامج اختياري بمقاعد مخصصة', 'Дополнительная программа с именными местами'],
    'Candidates': ['المرشحون', 'Кандидаты'],
    'Students': ['الطلاب', 'Ученики'],
    'Programme combination': ['دمج البرامج', 'Комбинация программ'],
    'Term discount': ['خصم المدة', 'Скидка за срок'],
    'Launch offer': ['عرض الإطلاق', 'Стартовое предложение'],
    'Total before discounts': ['الإجمالي قبل الخصومات', 'Итого до скидок'],
    'Discounts': ['الخصومات', 'Скидки'],
    'None selected': ['لا توجد خصومات مختارة', 'Не выбрано'],
    'First year': ['السنة الأولى', 'Первый год'],
    'Renewal, without Launch offer': ['التجديد بدون عرض الإطلاق', 'Продление без стартового предложения'],
    'Effective package cost:': ['التكلفة الفعلية للحزمة:', 'Эффективная стоимость пакета:'],
    'Save this in Plan & Billing': ['احفظ هذا في الخطة والفوترة', 'Сохранить в тарифе и оплате'],
    'Contact sales': ['تواصل مع المبيعات', 'Связаться с отделом продаж'],

    // Prime public page
    'Premium Content': ['محتوى متميز', 'Премиум-контент'],
    'Unlock Prime': ['افتح Prime', 'Открыть Prime'],
    'Get unlimited access to AS Chemistry practice tests, advanced materials, and exclusive content to boost your exam preparation.': ['احصل على وصول غير محدود إلى اختبارات تدريب كيمياء AS والمواد المتقدمة والمحتوى الحصري لتعزيز استعدادك للاختبارات.', 'Получите неограниченный доступ к тренировочным тестам AS Chemistry, продвинутым материалам и эксклюзивному контенту для подготовки к экзаменам.'],
    '10 AS Chemistry Tests': ['10 اختبارات كيمياء AS', '10 тестов AS Chemistry'],
    'Complete coverage of all AS Chemistry chapters with 500+ exam-style questions.': ['تغطية كاملة لفصول كيمياء AS مع أكثر من 500 سؤال بنمط الاختبار.', 'Полное покрытие тем AS Chemistry с более чем 500 вопросами экзаменационного формата.'],
    'Detailed Analytics': ['تحليلات تفصيلية', 'Подробная аналитика'],
    'Track your progress, identify weak areas, and see your improvement over time.': ['تابع تقدمك وحدد مجالات الضعف وشاهد تحسنك بمرور الوقت.', 'Отслеживайте прогресс, находите слабые темы и наблюдайте улучшение со временем.'],
    'Instant Marking': ['تصحيح فوري', 'Мгновенная проверка'],
    'Get your scores immediately with detailed answer explanations.': ['احصل على درجاتك فوراً مع شروحات مفصلة للإجابات.', 'Получайте результат сразу вместе с подробными объяснениями ответов.'],
    'Lifetime Access': ['وصول مدى الحياة', 'Пожизненный доступ'],
    'Pay once, access forever. No recurring subscriptions or hidden fees.': ['ادفع مرة واحدة واستفد دائماً. لا اشتراكات متكررة ولا رسوم مخفية.', 'Оплатите один раз и пользуйтесь без срока. Никаких регулярных платежей или скрытых комиссий.'],
    'Choose Your Plan': ['اختر خطتك', 'Выберите тариф'],
    'Prime Lifetime': ['Prime مدى الحياة', 'Prime навсегда'],
    'One-time payment': ['دفعة واحدة', 'Единовременная оплата'],
    'All 10 AS Chemistry Tests': ['جميع اختبارات كيمياء AS العشرة', 'Все 10 тестов AS Chemistry'],
    '500+ Exam Questions': ['أكثر من 500 سؤال اختباري', '500+ экзаменационных вопросов'],
    'Instant Auto-marking': ['تصحيح تلقائي فوري', 'Мгновенная автопроверка'],
    'Score Tracking': ['متابعة الدرجات', 'Отслеживание результатов'],
    'Lifetime Updates': ['تحديثات مدى الحياة', 'Обновления навсегда'],
    'Priority Support': ['دعم ذو أولوية', 'Приоритетная поддержка'],
    'Get Prime Now': ['احصل على Prime الآن', 'Получить Prime'],
    'Have an Activation Code?': ['لديك رمز تفعيل؟', 'Есть код активации?'],
    'Enter your code from your teacher or school to unlock Prime instantly.': ['أدخل الرمز الذي حصلت عليه من معلمك أو مدرستك لفتح Prime فوراً.', 'Введите код от учителя или школы, чтобы сразу открыть Prime.'],
    'Enter code...': ['أدخل الرمز...', 'Введите код...'],
    'Activate': ['تفعيل', 'Активировать'],
    "What's Included": ['ما الذي يتضمنه', 'Что включено'],
    'How do I access Prime content after purchase?': ['كيف أصل إلى محتوى Prime بعد الشراء؟', 'Как получить доступ к Prime после покупки?'],
    "After completing your purchase, you'll receive an activation code. Enter this code on any locked test page or in the activation section above to unlock all Prime content instantly.": ['بعد إتمام الشراء ستتلقى رمز تفعيل. أدخل الرمز في أي صفحة اختبار مقفلة أو في قسم التفعيل أعلاه لفتح جميع محتويات Prime فوراً.', 'После покупки вы получите код активации. Введите его на странице любого закрытого теста или в разделе активации выше, чтобы сразу открыть весь контент Prime.'],
    'Is this a one-time payment or subscription?': ['هل هذه دفعة واحدة أم اشتراك؟', 'Это разовая оплата или подписка?'],
    'Prime is a one-time payment with lifetime access. There are no recurring charges, hidden fees, or subscription renewals. Pay once and enjoy forever!': ['Prime دفعة واحدة مع وصول مدى الحياة. لا رسوم متكررة ولا رسوم مخفية ولا تجديدات اشتراك. ادفع مرة واحدة واستفد دائماً!', 'Prime оплачивается один раз и даёт пожизненный доступ. Нет регулярных списаний, скрытых комиссий или продлений подписки.'],
    'Can I share my activation code?': ['هل يمكنني مشاركة رمز التفعيل؟', 'Можно ли передавать код активации?'],
    'What if I need help or have issues?': ['ماذا أفعل إذا احتجت إلى مساعدة أو واجهت مشكلة؟', 'Что делать, если нужна помощь?'],
    "Contact us at support@brainsheist.com and we'll help you within 24 hours. Prime members get priority support!": ['تواصل معنا عبر support@brainsheist.com وسنساعدك خلال 24 ساعة. يحصل أعضاء Prime على أولوية في الدعم!', 'Напишите на support@brainsheist.com — мы поможем в течение 24 часов. Участники Prime получают приоритетную поддержку.'],
    'Prime Activated!': ['تم تفعيل Prime!', 'Prime активирован!'],
    'You now have full access to all AS Chemistry tests and premium content. Happy studying!': ['لديك الآن وصول كامل إلى جميع اختبارات كيمياء AS والمحتوى المتميز. دراسة موفقة!', 'Теперь вам доступны все тесты AS Chemistry и премиум-контент. Успехов в учёбе!'],
    'Start Learning →': ['ابدأ التعلم ←', 'Начать обучение →'],
    '✓ Prime is already activated on this device!': ['✓ Prime مفعّل بالفعل على هذا الجهاز!', '✓ Prime уже активирован на этом устройстве!'],
    'Please enter an activation code.': ['يرجى إدخال رمز التفعيل.', 'Введите код активации.'],
    'Invalid activation code. Please check and try again.': ['رمز التفعيل غير صالح. تحقق منه وحاول مرة أخرى.', 'Неверный код активации. Проверьте его и повторите попытку.'],
    'BEST VALUE': ['أفضل قيمة', 'ЛУЧШИЙ ВЫБОР'],
  };

  const PATTERNS = [
    [/^(\d+) · School size$/, (l,m) => l === 'ar' ? `${m[1]} · حجم المدرسة` : `${m[1]} · Размер школы`],
    [/^(\d+) · Programmes$/, (l,m) => l === 'ar' ? `${m[1]} · البرامج` : `${m[1]} · Программы`],
    [/^(\d+) · Agreement$/, (l,m) => l === 'ar' ? `${m[1]} · الاتفاقية` : `${m[1]} · Договор`],
    [/^(\d+)-month prepaid total$/, (l,m) => l === 'ar' ? `الإجمالي المدفوع مقدماً لمدة ${m[1]} شهراً` : `Предоплата за ${m[1]} мес.`],
    [/^(\d+) months at list price$/, (l,m) => l === 'ar' ? `${m[1]} شهراً بسعر القائمة` : `${m[1]} мес. по базовой цене`],
    [/^Include the (.+) Launch offer$/, (l,m) => l === 'ar' ? `تطبيق عرض الإطلاق بنسبة ${m[1]}` : `Применить стартовое предложение ${m[1]}`],
    [/^First contract year only · subject to approval · combined discounts capped at (.+)\.$/, (l,m) => l === 'ar' ? `للسنة الأولى من العقد فقط · يخضع للموافقة · الحد الأقصى للخصومات المجمعة ${m[1]}.` : `Только первый год договора · требуется одобрение · суммарная скидка не более ${m[1]}.`],
    [/^All programmes · up to (.+) students · (.+) teachers · (.+) admission candidates · no card required\.$/, (l,m) => l === 'ar' ? `جميع البرامج · حتى ${m[1]} طالباً · ${m[2]} معلماً · ${m[3]} مرشح قبول · لا يلزم إدخال بطاقة.` : `Все программы · до ${m[1]} учеников · ${m[2]} учителей · ${m[3]} кандидатов · карта не требуется.`],
    [/^Minimum (\d+) (.+)$/, (l,m) => l === 'ar' ? `الحد الأدنى ${m[1]} ${m[2]}` : `Минимум ${m[1]} ${m[2]}`],
    [/^Programme combination · (.+)$/, (l,m) => l === 'ar' ? `دمج البرامج · ${m[1]}` : `Комбинация программ · ${m[1]}`],
    [/^Term discount · (.+)$/, (l,m) => l === 'ar' ? `خصم المدة · ${m[1]}` : `Скидка за срок · ${m[1]}`],
    [/^Launch offer · (.+) · first year$/, (l,m) => l === 'ar' ? `عرض الإطلاق · ${m[1]} · السنة الأولى` : `Стартовое предложение · ${m[1]} · первый год`],
    [/^(.+)\/mo effective$/, (l,m) => l === 'ar' ? `${m[1]}/شهرياً فعلياً` : `${m[1]}/мес. эффективно`],
    [/^(.+)\/student\/mo$/, (l,m) => l === 'ar' ? `${m[1]}/طالب/شهرياً` : `${m[1]}/ученик/мес.`],
    [/^(.+)\/candidate\/mo$/, (l,m) => l === 'ar' ? `${m[1]}/مرشح/شهرياً` : `${m[1]}/кандидат/мес.`],
  ];

  let language = (() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return LANGUAGES[stored] ? stored : 'en';
    } catch {
      return 'en';
    }
  })();

  const textState = new WeakMap();
  const attrState = new WeakMap();
  let applying = false;

  const pairValue = (pair, lang) => lang === 'ar' ? pair?.[0] : pair?.[1];

  function translateValue(value, lang = language) {
    if (!value || lang === 'en') return value;
    const normalized = String(value).trim().replace(/\s+/g, ' ');
    if (!normalized) return value;
    const exact = pairValue(T[normalized], lang);
    if (exact) return exact;
    for (const [pattern, fn] of PATTERNS) {
      const match = normalized.match(pattern);
      if (match) return fn(lang, match);
    }
    // Standalone public pages contain no user-generated prose. Longest-first
    // phrase replacement safely handles inline <strong>/<a> splits and legal copy.
    let result = normalized;
    const entries = Object.entries(T).sort((a, b) => b[0].length - a[0].length);
    for (const [source, pair] of entries) {
      if (source.length < 4 || !result.includes(source)) continue;
      const replacement = pairValue(pair, lang);
      if (replacement) result = result.split(source).join(replacement);
    }
    return result;
  }

  function splitWhitespace(value) {
    const leading = value.match(/^\s*/)?.[0] || '';
    const trailing = value.match(/\s*$/)?.[0] || '';
    return { leading, trailing, core: value.slice(leading.length, Math.max(leading.length, value.length - trailing.length)) };
  }

  function shouldSkip(element) {
    return Boolean(element?.closest?.('[data-static-language-control="true"],script,style,noscript,textarea,code,pre,[contenteditable="true"]'));
  }

  function translateTextNode(node) {
    const parent = node.parentElement;
    if (!parent || shouldSkip(parent)) return;
    const current = node.nodeValue || '';
    if (!current.trim()) return;
    const previous = textState.get(node);
    let source = previous?.source ?? current;
    if (previous && current !== previous.rendered && current !== previous.source) source = current;
    const { leading, trailing, core } = splitWhitespace(source);
    const translated = translateValue(core);
    const next = `${leading}${translated}${trailing}`;
    textState.set(node, { source, rendered: next });
    if (current !== next) node.nodeValue = next;
  }

  function translateAttributes(element) {
    if (!element || shouldSkip(element)) return;
    const attributes = ['title', 'aria-label', 'placeholder', 'alt'];
    let state = attrState.get(element);
    if (!state) { state = new Map(); attrState.set(element, state); }
    for (const attr of attributes) {
      const current = element.getAttribute?.(attr);
      if (!current) continue;
      const previous = state.get(attr);
      let source = previous?.source ?? current;
      if (previous && current !== previous.rendered && current !== previous.source) source = current;
      const next = translateValue(source);
      state.set(attr, { source, rendered: next });
      if (current !== next) element.setAttribute(attr, next);
    }
  }

  function apply(root = document.body) {
    if (!root || applying) return;
    applying = true;
    document.documentElement.lang = language;
    document.documentElement.dir = LANGUAGES[language].dir;
    document.body?.classList.toggle('static-localized-rtl', language === 'ar');
    if (document.title) document.title = translateValue(document.title);
    document.querySelectorAll('meta[name="description"]').forEach((meta) => {
      const current = meta.getAttribute('content');
      if (current) meta.setAttribute('content', translateValue(current));
    });
    if (root.nodeType === Node.TEXT_NODE) translateTextNode(root);
    else if (root.nodeType === Node.ELEMENT_NODE || root === document.body) {
      translateAttributes(root);
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
      let node = walker.nextNode();
      while (node) {
        if (node.nodeType === Node.TEXT_NODE) translateTextNode(node);
        else translateAttributes(node);
        node = walker.nextNode();
      }
    }
    document.documentElement.style.setProperty('--brains-heist-best-value', `"${translateValue('BEST VALUE')}"`);
    applying = false;
  }

  function setLanguage(next) {
    if (!LANGUAGES[next]) return;
    language = next;
    try { localStorage.setItem(STORAGE_KEY, next); } catch {}
    apply(document.body);
    renderControlState();
    window.dispatchEvent(new CustomEvent('brains-heist-language-change', { detail: { language: next } }));
  }

  const style = document.createElement('style');
  style.textContent = `
    .static-language-control-v2{position:fixed;z-index:2147483000;left:max(12px,env(safe-area-inset-left));top:50%;transform:translateY(-50%);display:flex;align-items:center;gap:0;padding:5px;border:1px solid rgba(103,232,249,.3);border-radius:16px;background:linear-gradient(145deg,rgba(11,18,32,.97),rgba(17,24,39,.97));box-shadow:0 12px 34px rgba(2,6,23,.42),0 0 22px rgba(34,211,238,.09),inset 0 1px 0 rgba(255,255,255,.06);backdrop-filter:blur(14px);max-width:46px;overflow:hidden;transition:max-width .18s ease,gap .18s ease}
    .static-language-control-v2[data-open="true"]{max-width:236px;gap:6px}
    .static-language-control-v2 button{font:inherit;border:0;cursor:pointer}
    .static-language-control-v2__globe{width:36px;min-width:36px;height:36px;display:grid;place-items:center;border-radius:12px;color:#67e8f9!important;background:rgba(34,211,238,.09)!important;border:1px solid rgba(103,232,249,.18)!important;font-size:17px!important;padding:0!important}
    .static-language-control-v2__choice{min-width:38px;height:36px;padding:0 9px!important;border:1px solid transparent!important;border-radius:11px!important;color:#dbeafe!important;background:transparent!important;font-size:12px!important;font-weight:900!important;letter-spacing:.04em}
    .static-language-control-v2__choice[data-code="ar"]{font-size:17px!important;letter-spacing:0}
    .static-language-control-v2__choice[aria-pressed="true"]{color:#06111d!important;border-color:rgba(103,232,249,.82)!important;background:linear-gradient(135deg,#67e8f9 0%,#38bdf8 58%,#a78bfa 100%)!important;box-shadow:0 7px 20px rgba(56,189,248,.24)}
    .static-localized-rtl{font-family:Tahoma,Arial,sans-serif}
    .static-localized-rtl main,.static-localized-rtl .container,.static-localized-rtl section,.static-localized-rtl article{text-align:right}
    .static-localized-rtl ul,.static-localized-rtl ol{padding-right:1.5rem;padding-left:0}
    .static-localized-rtl input{text-align:right}
    .static-localized-rtl .nav,.static-localized-rtl .footer-inner,.static-localized-rtl .footer-links{direction:rtl}
    @media(max-width:640px){.static-language-control-v2{left:max(8px,env(safe-area-inset-left));top:52%}}
  `;
  document.head.appendChild(style);

  const control = document.createElement('div');
  control.className = 'static-language-control-v2';
  control.dataset.staticLanguageControl = 'true';
  control.dataset.open = 'false';
  control.dir = 'ltr';
  control.innerHTML = `<button type="button" class="static-language-control-v2__globe" aria-label="Interface language" aria-expanded="false">🌐</button>${Object.entries(LANGUAGES).map(([code, option]) => `<button type="button" class="static-language-control-v2__choice" data-code="${code}" aria-label="${option.name}" aria-pressed="false">${option.short}</button>`).join('')}`;

  const globe = control.querySelector('.static-language-control-v2__globe');
  globe.addEventListener('click', () => {
    const open = control.dataset.open !== 'true';
    control.dataset.open = String(open);
    globe.setAttribute('aria-expanded', String(open));
  });
  control.querySelectorAll('.static-language-control-v2__choice').forEach((button) => button.addEventListener('click', () => {
    setLanguage(button.dataset.code);
    control.dataset.open = 'false';
    globe.setAttribute('aria-expanded', 'false');
  }));

  function renderControlState() {
    control.querySelectorAll('.static-language-control-v2__choice').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.code === language)));
  }

  window.BrainsHeistI18n = {
    getLanguage: () => language,
    setLanguage,
    translate: (value) => translateValue(value),
    apply,
  };

  function boot() {
    document.body.appendChild(control);
    renderControlState();
    apply(document.body);
    const observer = new MutationObserver((mutations) => {
      if (applying) return;
      for (const mutation of mutations) {
        if (mutation.type === 'characterData') translateTextNode(mutation.target);
        mutation.addedNodes.forEach((node) => apply(node));
      }
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
