import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../../services/supabaseClient';
import { Blaze } from '../../components/ielts/IeltsGameArt';
import { readIeltsGuestProgress, saveIeltsGuestProgress, trackIeltsStep } from '../../../services/ieltsGuestFunnel';
import '../../styles/ielts-guest.css';

/**
 * Guest start for visitors from ads: a one-minute warm-up (5 instant questions), an honest result,
 * the first teaching lesson as a guest, then "save your progress" (sign-up).
 *
 * Diagnostic Bible v2.1.0 §1.1 / §16.7: the warm-up is practice, not a screener or diagnostic. It shows a raw
 * score and what to practise next, never a band, level or readiness claim. Its answers are original Brains Heist
 * practice items checked on the phone and kept only as UX data (§4.2 / §16.2); nothing here is academic evidence.
 * Visual & UX Bible v1.7.1 §14.3 / §14.6: still Blaze only, no motivation animation or sound; Blaze reflects
 * finishing practice, never a score.
 */

type Lang = 'ru' | 'en';
type Kind = 'tfng' | 'vocab';

interface Item {
  kind: Kind;
  prompt: Record<Lang, string>;
  statement?: string;
  options: string[];
  answer: string;
  why: Record<Lang, string>;
}

const PASSAGE =
  'The Green Street Library opened in 1998 with fewer than 2,000 books. Today it lends more e-books than paper books, ' +
  'although paper books are still more popular with readers under 18. Last year the library started opening on Sundays, ' +
  'after a survey showed that most visitors wanted weekend hours.';

const TFNG = ['TRUE', 'FALSE', 'NOT GIVEN'];

const ITEMS: Item[] = [
  {
    kind: 'tfng',
    prompt: { ru: 'Верно, неверно или не сказано?', en: 'True, false or not given?' },
    statement: 'The library had more than 2,000 books when it opened.',
    options: TFNG,
    answer: 'FALSE',
    why: { ru: 'В тексте «fewer than 2,000» — меньше, а не больше. Утверждение противоречит тексту → FALSE.', en: 'The text says "fewer than 2,000", so the statement contradicts it → FALSE.' },
  },
  {
    kind: 'tfng',
    prompt: { ru: 'Верно, неверно или не сказано?', en: 'True, false or not given?' },
    statement: 'Readers below the age of 18 still prefer paper books.',
    options: TFNG,
    answer: 'TRUE',
    why: { ru: '«Below the age of 18» = «under 18», «prefer» = «more popular with». Те же мысли другими словами → TRUE.', en: '"Below the age of 18" = "under 18" and "prefer" = "more popular with": a paraphrase → TRUE.' },
  },
  {
    kind: 'tfng',
    prompt: { ru: 'Верно, неверно или не сказано?', en: 'True, false or not given?' },
    statement: 'Green Street is the busiest library in the city.',
    options: TFNG,
    answer: 'NOT GIVEN',
    why: { ru: 'О том, какая библиотека самая загруженная, в тексте ничего нет → NOT GIVEN. Не додумывайте!', en: 'The text never compares it with other libraries → NOT GIVEN. Never guess from your own ideas.' },
  },
  {
    kind: 'vocab',
    prompt: { ru: 'Что значит «predominantly»?', en: 'What does "predominantly" mean?' },
    options: ['mostly', 'only', 'never'],
    answer: 'mostly',
    why: { ru: '«Predominantly» = mostly (в основном), но не «only». Из-за такой разницы TRUE превращается в FALSE.', en: '"Predominantly" means mostly, not only. That small difference turns a TRUE into a FALSE.' },
  },
  {
    kind: 'vocab',
    prompt: { ru: 'Какое слово ближе всего к «reluctant»?', en: 'Which word is closest to "reluctant"?' },
    options: ['unwilling', 'unable', 'unhappy'],
    answer: 'unwilling',
    why: { ru: '«Reluctant» = unwilling (не хочет), а не unable (не может). Частая ловушка в Reading.', en: '"Reluctant" means unwilling, not unable. A common Reading trap.' },
  },
];

const T = {
  ru: {
    warmup: 'Разминка IELTS · 1 минута',
    of: 'из',
    passage: 'Прочитай текст',
    next: 'Дальше',
    result: 'Готово! Блэйз зажёгся 🔥',
    score: (s: number, n: number) => `${s} из ${n} правильно`,
    tfng: 'True / False / Not Given',
    words: 'Слова-ловушки',
    honest: 'Это разминка, а не балл IELTS. Она показывает, с чего начать.',
    focusTfng: 'Начни с Reading: учись отличать FALSE от NOT GIVEN — это первый урок курса.',
    focusWords: 'Отличное чтение! Следующий шаг — слова, которые меняют смысл. Начнём с первого урока.',
    focusAll: 'Сильный старт! В первом уроке — как IELTS устроен и как не терять баллы на простом.',
    lessonCta: 'Первый урок — 3 минуты →',
    lessonOf: (i: number, n: number) => `Урок · ${i} из ${n}`,
    example: 'Пример',
    tips: 'Советы',
    saveTitle: 'Сохрани прогресс 🔥',
    saveBody: (s: number, n: number) => `Разминка ${s} из ${n} и первый урок пройдены. Создай бесплатный аккаунт за минуту — дальше практика с проверкой ответов, а Блэйз будет гореть, пока ты занимаешься.`,
    saveCta: 'Сохранить прогресс — бесплатно',
    noCard: 'Без карты · можно через Google или email',
    loadError: 'Не удалось загрузить урок. Проверь интернет и попробуй ещё раз.',
    retry: 'Попробовать снова',
    skipLesson: 'Пропустить и сохранить прогресс',
  },
  en: {
    warmup: 'IELTS warm-up · 1 minute',
    of: 'of',
    passage: 'Read the text',
    next: 'Next',
    result: 'Done! Blaze is lit 🔥',
    score: (s: number, n: number) => `${s} of ${n} correct`,
    tfng: 'True / False / Not Given',
    words: 'Trap words',
    honest: 'This is a warm-up, not an IELTS band. It shows where to start.',
    focusTfng: 'Start with Reading: learn to tell FALSE from NOT GIVEN. That is the first course lesson.',
    focusWords: 'Great reading! Next: the words that change meaning. Start with the first lesson.',
    focusAll: 'Strong start! The first lesson shows how IELTS works and how not to lose easy marks.',
    lessonCta: 'First lesson: 3 minutes →',
    lessonOf: (i: number, n: number) => `Lesson · ${i} of ${n}`,
    example: 'Example',
    tips: 'Tips',
    saveTitle: 'Save your progress 🔥',
    saveBody: (s: number, n: number) => `Warm-up ${s} of ${n} and your first lesson are done. Create a free account in a minute: next comes practice with checked answers, and Blaze keeps burning while you study.`,
    saveCta: 'Save my progress, free',
    noCard: 'No card · Google or email',
    loadError: 'Could not load the lesson. Check your connection and try again.',
    retry: 'Try again',
    skipLesson: 'Skip and save my progress',
  },
};

const prefersRussian = (): boolean => {
  try {
    const saved = window.localStorage.getItem('bh_ielts_landing_lang');
    if (saved === 'ru') return true;
    if (saved === 'en') return false;
  } catch { /* storage blocked */ }
  return /^(ru|ky|kk)/i.test(navigator.language || '');
};

interface GuestLesson {
  unit_id: number;
  title: string;
  lesson: {
    intro?: string;
    sections?: { title?: string; body?: string }[];
    example?: { label?: string; text?: string } | null;
    tips?: string[];
  };
}

type Card = { kind: 'intro' | 'section' | 'example' | 'tips'; title?: string; body?: string; list?: string[] };

const lessonCards = (l: GuestLesson, t: (typeof T)['ru']): Card[] => {
  const cards: Card[] = [];
  if (l.lesson.intro) cards.push({ kind: 'intro', title: l.title, body: l.lesson.intro });
  for (const s of l.lesson.sections || []) if (s?.body) cards.push({ kind: 'section', title: s.title, body: s.body });
  if (l.lesson.example?.text) cards.push({ kind: 'example', title: l.lesson.example.label || t.example, body: l.lesson.example.text });
  if (l.lesson.tips?.length) cards.push({ kind: 'tips', title: t.tips, list: l.lesson.tips });
  return cards;
};

const IeltsGuestStart: React.FC = () => {
  const navigate = useNavigate();
  const [lang] = useState<Lang>(() => (prefersRussian() ? 'ru' : 'en'));
  const t = T[lang];
  const [phase, setPhase] = useState<'quiz' | 'result' | 'lesson' | 'save'>('quiz');
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [answers, setAnswers] = useState<boolean[]>([]);
  const [lesson, setLesson] = useState<GuestLesson | null>(null);
  const [lessonError, setLessonError] = useState(false);
  const [card, setCard] = useState(0);
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    document.title = lang === 'ru' ? 'Разминка IELTS — Brains Heist' : 'IELTS warm-up — Brains Heist';
    document.documentElement.lang = lang;
    trackIeltsStep('/ielts/start');
    void supabase.auth.getSession().then(({ data }) => setSignedIn(Boolean(data.session)));
  }, [lang]);

  const item = ITEMS[index];
  const score = answers.filter(Boolean).length;
  const tfngScore = answers.slice(0, 3).filter(Boolean).length;
  const wordScore = answers.slice(3).filter(Boolean).length;

  const loadLesson = () => {
    setLessonError(false);
    void supabase.rpc('rpc_ielts_guest_first_lesson').then(({ data, error }) => {
      if (error || !data) { setLessonError(true); return; }
      setLesson(data as GuestLesson);
    });
  };

  const choose = (option: string) => {
    if (picked) return;
    setPicked(option);
    setAnswers(prev => [...prev, option === item.answer]);
  };

  const next = () => {
    if (index + 1 < ITEMS.length) {
      setIndex(index + 1);
      setPicked(null);
      return;
    }
    const finalScore = answers.filter(Boolean).length;
    saveIeltsGuestProgress({ quizScore: finalScore, quizTotal: ITEMS.length });
    trackIeltsStep('/ielts/start/quiz-done');
    setPhase('result');
    loadLesson();
  };

  const cards = useMemo(() => (lesson ? lessonCards(lesson, t) : []), [lesson, t]);

  const finishLesson = () => {
    saveIeltsGuestProgress({ lessonDone: true, unitId: lesson?.unit_id });
    trackIeltsStep('/ielts/start/lesson-done');
    setPhase('save');
  };

  const goSave = () => {
    const progress = readIeltsGuestProgress();
    if (!progress) saveIeltsGuestProgress({ quizScore: score, quizTotal: ITEMS.length });
    navigate('/ielts/course?from=guest');
  };

  const focus = tfngScore < 3 ? t.focusTfng : wordScore < 2 ? t.focusWords : t.focusAll;
  const progressPct = phase === 'quiz' ? ((index + (picked ? 1 : 0)) / ITEMS.length) * 100 : 100;

  return (
    <main className="gs-page">
      <div className="gs-shell">
        <header className="gs-top">
          <span className="gs-brand"><img src="/logo.png" alt="" width={28} height={28} />Brains Heist IELTS</span>
          {phase === 'quiz' && <span className="gs-count">{index + 1} {t.of} {ITEMS.length}</span>}
        </header>
        {phase === 'quiz' && (
          <div className="gs-progress" role="progressbar" aria-valuemin={0} aria-valuemax={ITEMS.length} aria-valuenow={answers.length} aria-label={t.warmup}>
            <span style={{ width: `${progressPct}%` }} />
          </div>
        )}

        {phase === 'quiz' && (
          <section key={`q${index}`} className="gs-card" aria-live="polite">
            <p className="gs-kicker">{t.warmup}</p>
            {item.kind === 'tfng' && (
              <details className="gs-passage" open>
                <summary>{t.passage}</summary>
                <p lang="en" translate="no" className="notranslate">{PASSAGE}</p>
              </details>
            )}
            <h1 className="gs-question">{item.prompt[lang]}</h1>
            {item.statement && <p key={index} className="gs-statement notranslate" lang="en" translate="no">“{item.statement}”</p>}
            <div className={`gs-options ${item.kind === 'tfng' ? 'gs-options-3' : ''}`}>
              {item.options.map(option => {
                const state = !picked ? '' : option === item.answer ? 'is-right' : option === picked ? 'is-wrong' : 'is-dim';
                return (
                  <button key={`${index}-${option}`} type="button" className={`gs-option notranslate ${state}`} lang="en" translate="no"
                    onClick={() => choose(option)} disabled={Boolean(picked)} aria-pressed={picked === option}>
                    {option}
                    {picked && option === item.answer && <span aria-hidden="true"> ✓</span>}
                    {picked === option && option !== item.answer && <span aria-hidden="true"> ✗</span>}
                  </button>
                );
              })}
            </div>
            {picked && (
              <div className={`gs-feedback ${picked === item.answer ? 'is-right' : 'is-wrong'}`} role="status">
                <span className="gs-feedback-blaze" aria-hidden="true"><Blaze mood={picked === item.answer ? 'cheer' : 'happy'} size={44} /></span>
                <p><b>{picked === item.answer ? (lang === 'ru' ? 'Верно!' : 'Correct!') : (lang === 'ru' ? 'Почти!' : 'Almost!')}</b> {item.why[lang]}</p>
              </div>
            )}
            {picked && <button type="button" className="gs-primary" onClick={next} autoFocus>{t.next} →</button>}
          </section>
        )}

        {phase === 'result' && (
          <section className="gs-card gs-center">
            <span className="gs-hero-blaze" aria-hidden="true"><Blaze mood="cheer" size={112} /></span>
            <h1 className="gs-title">{t.result}</h1>
            <p className="gs-score">{t.score(score, ITEMS.length)}</p>
            <ul className="gs-breakdown">
              <li><span>{t.tfng}</span><b>{tfngScore}/3</b></li>
              <li><span>{t.words}</span><b>{wordScore}/2</b></li>
            </ul>
            <p className="gs-focus">{focus}</p>
            <p className="gs-honest">{t.honest}</p>
            <button type="button" className="gs-primary" onClick={() => { setPhase('lesson'); setCard(0); if (!lesson) loadLesson(); }}>{t.lessonCta}</button>
          </section>
        )}

        {phase === 'lesson' && (
          <section className="gs-card">
            {lessonError && (
              <div className="gs-center">
                <p className="gs-focus">{t.loadError}</p>
                <button type="button" className="gs-primary" onClick={loadLesson}>{t.retry}</button>
                <button type="button" className="gs-link" onClick={() => setPhase('save')}>{t.skipLesson}</button>
              </div>
            )}
            {!lessonError && !lesson && <div className="gs-loading" role="status">…</div>}
            {lesson && cards.length > 0 && (
              <>
                <p className="gs-kicker">{t.lessonOf(card + 1, cards.length)}</p>
                <div className="gs-progress gs-progress-thin" aria-hidden="true"><span style={{ width: `${((card + 1) / cards.length) * 100}%` }} /></div>
                <article key={card} className={`gs-lesson notranslate gs-lesson-${cards[card].kind}`} lang="en" translate="no">
                  {cards[card].title && <h1 className="gs-lesson-title">{cards[card].title}</h1>}
                  {cards[card].body?.split('\n').filter(Boolean).map((p, i) => <p key={i}>{p}</p>)}
                  {cards[card].list && <ul>{cards[card].list!.map((tip, i) => <li key={i}>{tip}</li>)}</ul>}
                </article>
                <button type="button" className="gs-primary" onClick={() => (card + 1 < cards.length ? setCard(card + 1) : finishLesson())}>
                  {card + 1 < cards.length ? `${t.next} →` : (lang === 'ru' ? 'Урок пройден ✓' : 'Lesson done ✓')}
                </button>
              </>
            )}
          </section>
        )}

        {phase === 'save' && (
          <section className="gs-card gs-center">
            <span className="gs-hero-blaze" aria-hidden="true"><Blaze mood="cheer" size={112} /></span>
            <h1 className="gs-title">{t.saveTitle}</h1>
            <p className="gs-focus">{t.saveBody(score, ITEMS.length)}</p>
            <button type="button" className="gs-primary" onClick={goSave}>{signedIn ? (lang === 'ru' ? 'Продолжить курс →' : 'Continue the course →') : t.saveCta}</button>
            {!signedIn && <p className="gs-honest">{t.noCard}</p>}
          </section>
        )}
      </div>
    </main>
  );
};

export default IeltsGuestStart;
