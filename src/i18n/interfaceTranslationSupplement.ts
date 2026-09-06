import type { InterfaceLanguage } from './interfaceTranslations';

type TranslationPair = { ar: string; ru: string };

const SUPPLEMENTAL_MESSAGES: Record<string, TranslationPair> = {
  // Teacher workspace / class roster
  'Every assigned class, subject, and student in one organised view.': { ar: 'كل فصل ومادة وطالب مخصص لك في عرض منظم واحد.', ru: 'Все назначенные классы, предметы и ученики в одном удобном представлении.' },
  'Print all rosters': { ar: 'طباعة جميع قوائم الفصول', ru: 'Распечатать все списки' },
  'Search by class, subject, or student…': { ar: 'ابحث حسب الفصل أو المادة أو الطالب…', ru: 'Поиск по классу, предмету или ученику…' },
  'Search by class, subject, or student...': { ar: 'ابحث حسب الفصل أو المادة أو الطالب…', ru: 'Поиск по классу, предмету или ученику…' },
  'Print': { ar: 'طباعة', ru: 'Печать' },
  'Grade 5': { ar: 'الصف الخامس', ru: '5 класс' },
  'English': { ar: 'الإنجليزية', ru: 'Английский' },
  'Free plan': { ar: 'الخطة المجانية', ru: 'Бесплатный тариф' },
  'Lockdown mode only. Upgrade to unlock Cambridge tests, IELTS, assignments & more.': { ar: 'يتوفر وضع Lockdown فقط. قم بالترقية لفتح اختبارات Cambridge وIELTS والواجبات والمزيد.', ru: 'Доступен только режим Lockdown. Обновите тариф, чтобы открыть тесты Cambridge, IELTS, задания и другие возможности.' },
  'Ask your school admin about upgrading.': { ar: 'تواصل مع مسؤول المدرسة بشأن الترقية.', ru: 'Уточните у администратора школы возможность перехода на другой тариф.' },

  // Teacher menu / navigation
  'Teacher workspace': { ar: 'مساحة عمل المعلم', ru: 'Рабочее пространство учителя' },
  'All tools': { ar: 'كل الأدوات', ru: 'Все инструменты' },
  'Overview & Quick Actions': { ar: 'نظرة عامة وإجراءات سريعة', ru: 'Обзор и быстрые действия' },
  'Allocated Classes & Students': { ar: 'الفصول والطلاب المخصصون لك', ru: 'Назначенные классы и ученики' },
  'Assign Work to Students': { ar: 'تعيين أعمال للطلاب', ru: 'Назначать задания ученикам' },
  'Student Performance': { ar: 'أداء الطلاب', ru: 'Успеваемость учеников' },
  'Progress, Strengths & Focus Areas': { ar: 'التقدم ونقاط القوة ومجالات التركيز', ru: 'Прогресс, сильные стороны и зоны внимания' },
  'Targeted Support & Follow-up': { ar: 'دعم موجه ومتابعة', ru: 'Адресная поддержка и сопровождение' },
  'Create & Manage Questions': { ar: 'إنشاء الأسئلة وإدارتها', ru: 'Создание и управление вопросами' },
  'Host official class battles': { ar: 'استضافة منافسات رسمية بين الفصول', ru: 'Проводить официальные битвы классов' },
  'PRO': { ar: 'PRO', ru: 'PRO' },

  // Teacher guide summaries
  'A quick map of the tools teachers use every day.': { ar: 'دليل سريع لأدوات المعلم المستخدمة يومياً.', ru: 'Краткий обзор инструментов, которыми учитель пользуется каждый день.' },
  'See only the classes and students allocated to you.': { ar: 'اعرض فقط الفصول والطلاب المخصصين لك.', ru: 'Просматривайте только назначенные вам классы и учеников.' },
  'Use verified content or build classroom questions.': { ar: 'استخدم المحتوى المعتمد أو أنشئ أسئلة لفصلك.', ru: 'Используйте проверенный контент или создавайте вопросы для своего класса.' },
  'Build, publish, schedule and review student work.': { ar: 'أنشئ أعمال الطلاب وانشرها وجدولها وراجعها.', ru: 'Создавайте, публикуйте, планируйте и проверяйте работы учеников.' },
  'Read results and longer-term learning evidence.': { ar: 'اطّلع على النتائج وأدلة التعلم على المدى الطويل.', ru: 'Просматривайте результаты и долгосрочные данные об обучении.' },
  'Turn repeated needs into clear teaching follow-up.': { ar: 'حوّل الاحتياجات المتكررة إلى متابعة تعليمية واضحة.', ru: 'Превращайте повторяющиеся трудности в понятный план педагогической поддержки.' },
  'Monitor writing, reviewed feedback and writing evidence.': { ar: 'تابع مهام الكتابة والملاحظات المراجعة وأدلة التقدم.', ru: 'Отслеживайте письменные работы, проверенную обратную связь и данные о прогрессе.' },
  'Create clean diagrams for question images and interactive tasks.': { ar: 'أنشئ رسوماً واضحة لصور الأسئلة والمهام التفاعلية.', ru: 'Создавайте аккуратные схемы для вопросов и интерактивных заданий.' },
  'Run an official live class battle from the teacher workspace.': { ar: 'شغّل منافسة صفية مباشرة ورسمية من مساحة عمل المعلم.', ru: 'Запускайте официальные живые соревнования класса из рабочего пространства учителя.' },

  // Teacher guide content
  'Use this workspace for your allocated classes, learning content, assignments, progress, support and live classroom activities. School-wide administration stays in the School Admin or School Head workspace.': { ar: 'استخدم مساحة العمل هذه للفصول المخصصة لك، ومحتوى التعلم، والواجبات، والتقدم، والدعم، والأنشطة الصفية المباشرة. تبقى إدارة المدرسة على مستوى المؤسسة ضمن مساحة مسؤول المدرسة أو قائد المدرسة.', ru: 'Используйте это рабочее пространство для назначенных классов, учебных материалов, заданий, прогресса, поддержки и живых классных активностей. Управление школой в целом выполняется в рабочих пространствах администратора или руководителя школы.' },
  'Access follows your school allocations.': { ar: 'صلاحيات الوصول تتبع التخصيصات المعتمدة في المدرسة.', ru: 'Доступ определяется назначениями, установленными школой.' },
  'If a class or subject is missing, ask the School Admin to check your active allocation rather than working around the roster.': { ar: 'إذا كان فصل أو مادة غير ظاهرين، فاطلب من مسؤول المدرسة التحقق من تخصيصك النشط بدلاً من تجاوز قائمة الطلاب.', ru: 'Если класс или предмет отсутствует, попросите администратора школы проверить ваше активное назначение, а не обходить список класса.' },
  'This is your authorised teaching roster.': { ar: 'هذه قائمة التدريس المعتمدة الخاصة بك.', ru: 'Это ваш утверждённый список классов и учеников.' },
  'Open ': { ar: 'افتح ', ru: 'Откройте ' },
  ' to see allocated classes, subjects and students.': { ar: ' لعرض الفصول والمواد والطلاب المخصصين لك.', ru: ', чтобы увидеть назначенные классы, предметы и учеников.' },
  'Use search to find a student or class quickly.': { ar: 'استخدم البحث للعثور بسرعة على طالب أو فصل.', ru: 'Используйте поиск, чтобы быстро найти ученика или класс.' },
  'Use ': { ar: 'استخدم ', ru: 'Используйте ' },
  ' when you need a current class list.': { ar: ' عندما تحتاج إلى قائمة فصل محدثة.', ru: ', когда нужен актуальный список класса.' },
  'Print roster': { ar: 'طباعة قائمة الفصل', ru: 'Печать списка' },
  'Roster changes belong to School Administration.': { ar: 'تعديلات قوائم الفصول من اختصاص إدارة المدرسة.', ru: 'Изменения списков классов выполняются администрацией школы.' },
  'Brains Heist Verified': { ar: 'محتوى Brains Heist المعتمد', ru: 'Проверено Brains Heist' },
  'Read-only governed questions used as official learning evidence only when curriculum mapping is valid.': { ar: 'أسئلة محكومة للقراءة فقط، وتُستخدم كدليل تعلم رسمي فقط عندما يكون ربطها بالمنهج صالحاً.', ru: 'Управляемые вопросы только для чтения; используются как официальные учебные данные только при корректной привязке к учебной программе.' },
  'My Pool': { ar: 'مجموعتي', ru: 'Моя подборка' },
  'Your classroom questions. Create, edit, bulk import and reuse them without changing the official question bank.': { ar: 'أسئلة فصلك. يمكنك إنشاؤها وتعديلها واستيرادها دفعة واحدة وإعادة استخدامها دون تغيير بنك الأسئلة الرسمي.', ru: 'Ваши вопросы для класса. Создавайте, редактируйте, массово импортируйте и повторно используйте их, не изменяя официальный банк вопросов.' },
  'Choose the class or students and subject.': { ar: 'اختر الفصل أو الطلاب والمادة.', ru: 'Выберите класс или учеников и предмет.' },
  'Select valid content for that teaching context.': { ar: 'اختر محتوى صالحاً لهذا السياق التعليمي.', ru: 'Выберите подходящий контент для этого учебного контекста.' },
  'Save a draft, publish now, or schedule publication.': { ar: 'احفظ كمسودة أو انشر الآن أو حدّد موعداً للنشر.', ru: 'Сохраните черновик, опубликуйте сейчас или запланируйте публикацию.' },
  'Review submissions and results from the assignment/report views.': { ar: 'راجع التسليمات والنتائج من شاشات الواجبات والتقارير.', ru: 'Проверяйте работы и результаты в разделах заданий и отчётов.' },
  'Official Academic Profile evidence comes from completed, governed work. An unanswered question is not automatically a weakness.': { ar: 'تأتي أدلة الملف الأكاديمي الرسمي من أعمال مكتملة ومحكومة. السؤال غير المجاب عنه لا يُعد تلقائياً نقطة ضعف.', ru: 'Официальные данные академического профиля формируются из завершённых и управляемых работ. Неотвеченный вопрос сам по себе не считается слабой стороной.' },
  'Reports answer “how did the student do?” Academic Profiles answer “what is changing over time?”': { ar: 'تجيب التقارير عن سؤال «كيف كان أداء الطالب؟»، بينما تجيب الملفات الأكاديمية عن «ما الذي يتغير بمرور الوقت؟».', ru: 'Отчёты отвечают на вопрос «как ученик справился?», а академические профили — «что меняется со временем?».' },
  ' show completed work and assessment results.': { ar: ' تعرض الأعمال المكتملة ونتائج التقييم.', ru: ' показывают завершённые работы и результаты оценивания.' },
  ' combine dated evidence from authorised assignments and verified writing.': { ar: ' تجمع أدلة مؤرخة من الواجبات المعتمدة والكتابة التي تمت مراجعتها.', ru: ' объединяют датированные данные из разрешённых заданий и проверенных письменных работ.' },
  'Needs support': { ar: 'يحتاج إلى دعم', ru: 'Требуется поддержка' },
  ' shows specific current learning needs; repeated labels require repeated evidence.': { ar: ' يعرض احتياجات تعلم حالية محددة؛ وتكرار التصنيف يتطلب أدلة متكررة.', ru: ' показывает конкретные текущие учебные потребности; повторяющиеся метки требуют повторных подтверждений.' },
  'Use subject and date filters before generating an individual report.': { ar: 'استخدم عوامل تصفية المادة والتاريخ قبل إنشاء تقرير فردي.', ru: 'Перед созданием индивидуального отчёта используйте фильтры по предмету и дате.' },
  'Use support plans when the evidence is strong enough to justify a teaching response.': { ar: 'استخدم خطط الدعم عندما تكون الأدلة كافية لتبرير تدخل تعليمي.', ru: 'Используйте планы поддержки, когда данных достаточно для обоснованного педагогического действия.' },
  'Review the specific need and evidence.': { ar: 'راجع الاحتياج المحدد والأدلة.', ru: 'Проверьте конкретную потребность и подтверждающие данные.' },
  'Confirm what should improve.': { ar: 'حدّد ما الذي ينبغي تحسينه.', ru: 'Определите, что именно должно улучшиться.' },
  'Record the teaching action and follow-up evidence.': { ar: 'سجّل الإجراء التعليمي وأدلة المتابعة.', ru: 'Зафиксируйте педагогическое действие и последующие данные.' },
  'Close the plan only when later assessed work supports it.': { ar: 'أغلق الخطة فقط عندما تؤكد الأعمال اللاحقة المُقيّمة تحقق التحسن.', ru: 'Закрывайте план только тогда, когда последующая оценённая работа подтверждает улучшение.' },
  'Use Writing Hub to monitor writing tasks and reviewed feedback for authorised students.': { ar: 'استخدم مركز الكتابة لمتابعة مهام الكتابة والملاحظات المراجعة للطلاب المصرح لك بهم.', ru: 'Используйте Writing Hub для отслеживания письменных заданий и проверенной обратной связи по назначенным ученикам.' },
  'Verified, Academic-Profile-ready writing can enter the student’s learning timeline.': { ar: 'يمكن إدراج الكتابة المعتمدة والجاهزة للملف الأكاديمي ضمن التسلسل الزمني لتعلم الطالب.', ru: 'Проверенные письменные работы, готовые для академического профиля, могут попадать в учебную историю ученика.' },
  "Verified, Academic-Profile-ready writing can enter the student's learning timeline.": { ar: 'يمكن إدراج الكتابة المعتمدة والجاهزة للملف الأكاديمي ضمن التسلسل الزمني لتعلم الطالب.', ru: 'Проверенные письменные работы, готовые для академического профиля, могут попадать в учебную историю ученика.' },
  'Corrections can identify precise areas such as verb form, subject–verb agreement, punctuation and sentence control.': { ar: 'يمكن للتصحيحات تحديد مجالات دقيقة مثل صيغة الفعل، واتفاق الفاعل والفعل، وعلامات الترقيم، وبناء الجملة.', ru: 'Исправления могут точно выявлять такие области, как форма глагола, согласование подлежащего и сказуемого, пунктуация и построение предложений.' },
  'Use the evidence for teaching; the longitudinal profile decides whether a need is new, recurring, improving or resolved.': { ar: 'استخدم الأدلة في التدريس؛ ويحدد الملف التراكمي ما إذا كانت الحاجة جديدة أو متكررة أو تتحسن أو تم حلها.', ru: 'Используйте данные в обучении; долгосрочный профиль определяет, является ли потребность новой, повторяющейся, улучшающейся или решённой.' },
  'Use the diagram builder when a question needs a clean visual rather than a screenshot or hand-drawn image.': { ar: 'استخدم أداة إنشاء الرسوم عندما يحتاج السؤال إلى شكل واضح بدلاً من لقطة شاشة أو رسم يدوي.', ru: 'Используйте конструктор схем, когда вопросу нужна аккуратная визуализация вместо скриншота или рисунка от руки.' },
  'Build the figure from lines, angles, points, circles and the shape library.': { ar: 'أنشئ الشكل باستخدام الخطوط والزوايا والنقاط والدوائر ومكتبة الأشكال.', ru: 'Создайте фигуру из линий, углов, точек, окружностей и элементов библиотеки фигур.' },
  'Add labels with the Labels & annotations control, then move or resize them on the canvas.': { ar: 'أضف التسميات باستخدام أداة «التسميات والتعليقات»، ثم حرّكها أو غيّر حجمها على اللوحة.', ru: 'Добавьте подписи через «Метки и аннотации», затем перемещайте или изменяйте их размер на холсте.' },
  'Export a high-resolution PNG and attach it to a normal question, or add answer blanks for an interactive diagram question.': { ar: 'صدّر ملف PNG عالي الدقة وأرفقه بسؤال عادي، أو أضف خانات إجابة لسؤال رسم تفاعلي.', ru: 'Экспортируйте PNG высокого разрешения и прикрепите его к обычному вопросу либо добавьте поля ответа для интерактивного задания со схемой.' },
  'The Lockdown Mode quick action opens the official class-battle workspace.': { ar: 'يفتح إجراء Lockdown Mode السريع مساحة المنافسة الصفية الرسمية.', ru: 'Быстрое действие Lockdown Mode открывает рабочую область официального соревнования класса.' },
  'Choose the class/room and permitted subject scope.': { ar: 'اختر الفصل أو الغرفة ونطاق المواد المسموح به.', ru: 'Выберите класс/комнату и разрешённый предметный охват.' },
  'Select questions from the available pools.': { ar: 'اختر الأسئلة من المجموعات المتاحة.', ru: 'Выберите вопросы из доступных подборок.' },
  'Review the setup before starting the live activity.': { ar: 'راجع الإعدادات قبل بدء النشاط المباشر.', ru: 'Проверьте настройки перед запуском живой активности.' },

  // Public landing / login marketing surfaces
  'Where school': { ar: 'حيث تصبح المدرسة', ru: 'Когда школа' },
  'feels like a ': { ar: 'تجربة تشبه ', ru: 'становится похожей на ' },
  'game.': { ar: 'اللعبة.', ru: 'игру.' },
  'A gamified English & Maths platform for schools — assessments, live classroom battles, progress tracking and meaningful reports.': { ar: 'منصة تعليمية محفّزة للمدارس في الإنجليزية والرياضيات — تقييمات، منافسات صفية مباشرة، متابعة للتقدم وتقارير ذات معنى.', ru: 'Игровая платформа по английскому и математике для школ: оценивание, живые классные соревнования, отслеживание прогресса и содержательные отчёты.' },
  'Cambridge-aligned assessments': { ar: 'تقييمات متوافقة مع Cambridge', ru: 'Оценивание по стандартам Cambridge' },
  'Admission tests with placement and skill analytics.': { ar: 'اختبارات قبول مع تحديد المستوى وتحليل المهارات.', ru: 'Вступительные тесты с определением уровня и аналитикой навыков.' },
  'Classes students want to join': { ar: 'فصول يرغب الطلاب في المشاركة فيها', ru: 'Уроки, в которых ученикам хочется участвовать' },
  'Battles, XP, leaderboards and clan competition.': { ar: 'منافسات ونقاط XP ولوحات صدارة وتحديات بين العشائر.', ru: 'Соревнования, XP, рейтинги и клановые состязания.' },
  'Useful reports': { ar: 'تقارير مفيدة', ru: 'Полезные отчёты' },
  'Measure strengths, gaps and readiness for placement.': { ar: 'قِس نقاط القوة والفجوات والاستعداد لتحديد المستوى.', ru: 'Оценивайте сильные стороны, пробелы и готовность к распределению по уровню.' },
  'For schools': { ar: 'للمدارس', ru: 'Для школ' },
  'Cambridge-aligned admission tests ✓': { ar: 'اختبارات قبول متوافقة مع Cambridge ✓', ru: 'Вступительные тесты по стандартам Cambridge ✓' },
  'Live Lockdown class battle mode ✓': { ar: 'وضع Lockdown للمنافسات الصفية المباشرة ✓', ru: 'Живой режим классных соревнований Lockdown ✓' },
  'School analytics and placement reports ✓': { ar: 'تحليلات المدرسة وتقارير تحديد المستوى ✓', ru: 'Школьная аналитика и отчёты по распределению ✓' },
  'Classes and roster management ✓': { ar: 'إدارة الفصول وقوائم الطلاب ✓', ru: 'Управление классами и списками учеников ✓' },
  'View pricing': { ar: 'عرض الأسعار', ru: 'Посмотреть тарифы' },
  'For students': { ar: 'للطلاب', ru: 'Для учеников' },
  'Earn XP, coins and gems through quests ✓': { ar: 'اكسب XP والعملات والجواهر عبر المهام ✓', ru: 'Зарабатывайте XP, монеты и кристаллы за задания ✓' },
  'Join clans and compete in PvP battles ✓': { ar: 'انضم إلى العشائر ونافس في مواجهات PvP ✓', ru: 'Вступайте в кланы и участвуйте в PvP-сражениях ✓' },
  'Track progress and skill levels ✓': { ar: 'تابع التقدم ومستويات المهارات ✓', ru: 'Отслеживайте прогресс и уровни навыков ✓' },
  'Build a profile and customize rewards ✓': { ar: 'أنشئ ملفاً شخصياً وخصّص مكافآتك ✓', ru: 'Создавайте профиль и настраивайте награды ✓' },
  'Gamified English & Maths learning for schools — assessments, live competition and meaningful progress insights.': { ar: 'تعلم محفّز للإنجليزية والرياضيات في المدارس — تقييمات، منافسات مباشرة، ورؤى مفيدة حول التقدم.', ru: 'Игровое обучение английскому и математике для школ: оценивание, живые соревнования и полезная аналитика прогресса.' },
  'RESOURCES': { ar: 'الموارد', ru: 'РЕСУРСЫ' },
  'LEGAL': { ar: 'قانوني', ru: 'ПРАВОВАЯ ИНФОРМАЦИЯ' },
  'GET IN TOUCH': { ar: 'تواصل معنا', ru: 'СВЯЗАТЬСЯ С НАМИ' },
  'Pricing': { ar: 'الأسعار', ru: 'Тарифы' },
  'Contact Us': { ar: 'تواصل معنا', ru: 'Связаться с нами' },
  'IELTS Prep': { ar: 'التحضير لـ IELTS', ru: 'Подготовка к IELTS' },
  'Request demo': { ar: 'طلب عرض توضيحي', ru: 'Запросить демо' },
  'Terms of Service': { ar: 'شروط الخدمة', ru: 'Условия использования' },
  'Privacy Policy': { ar: 'سياسة الخصوصية', ru: 'Политика конфиденциальности' },
  'Refund Policy': { ar: 'سياسة الاسترداد', ru: 'Политика возврата' },
  'Payments secured by Paddle': { ar: 'المدفوعات مؤمّنة عبر Paddle', ru: 'Платежи защищены Paddle' },
  '© 2026 Brains Heist. All rights reserved.': { ar: '© 2026 Brains Heist. جميع الحقوق محفوظة.', ru: '© 2026 Brains Heist. Все права защищены.' },
};

export function translateSupplementalInterfaceText(language: InterfaceLanguage, value: string): string | null {
  if (language === 'en') return value;
  const pair = SUPPLEMENTAL_MESSAGES[value];
  return pair?.[language] ?? null;
}

export function hasSupplementalInterfaceTranslation(value: string): boolean {
  return Boolean(SUPPLEMENTAL_MESSAGES[value]);
}

export const SUPPLEMENTAL_INTERFACE_MESSAGES = SUPPLEMENTAL_MESSAGES;
