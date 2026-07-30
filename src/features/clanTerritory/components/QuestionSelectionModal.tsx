import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import * as GameService from "../../../../services/gameService";
import { brainsAlert } from "../../../utils/brainsAlert";
import { normalizeClanWarSubject, questionBelongsToPool, type QuestionPoolFilter } from "../questionPoolFilters";

interface Question {
  id: string;
  question_text: string;
  subject: string;
  topic?: string;
  topic_name?: string;
  difficulty: string;
  correct_answer: string;
  options?: unknown[];
  question_type?: string;
  teacher_id?: string | null;
  is_mine?: boolean | null;
  explanation?: string | null;
  image_url?: string | null;
}

interface QuestionSelectionModalProps {
  onConfirm: (questions: Question[]) => void;
  onCancel: () => void;
  restrictedSubjects?: string[];
}

const questionTopic = (question: Question) => question.topic_name || question.topic || "General";
const optionText = (option: unknown) => {
  if (typeof option === "string") return option;
  if (option && typeof option === "object") {
    const value = option as Record<string, unknown>;
    return String(value.text || value.label || value.value || "");
  }
  return String(option || "");
};

export const QuestionSelectionModal: React.FC<QuestionSelectionModalProps> = ({
  onConfirm,
  onCancel,
  restrictedSubjects,
}) => {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [poolFilter, setPoolFilter] = useState<QuestionPoolFilter>("all");
  const [subjectFilter, setSubjectFilter] = useState("all");
  const [topicFilter, setTopicFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [previewQuestion, setPreviewQuestion] = useState<Question | null>(null);
  const restrictedSubjectKey = restrictedSubjects?.map(normalizeClanWarSubject).sort().join("|") || "";

  useEffect(() => {
    let cancelled = false;
    const fetchQuestions = async () => {
      try {
        setLoading(true);
        const available = await (async () => {
            const pageSize = 500;
            const unique = new Map<string, Question>();
            for (let offset = 0; ; offset += pageSize) {
              const page = await GameService.get_all_questions({ limit: pageSize, offset });
              (page as Question[]).forEach((question) => unique.set(question.id, question));
              if (page.length < pageSize) break;
            }
            return [...unique.values()];
          })();
        if (cancelled) return;
        const permitted = restrictedSubjects?.length
          ? new Set(restrictedSubjects.map(normalizeClanWarSubject))
          : null;
        setQuestions((available as Question[]).filter((question) =>
          !permitted || permitted.has(normalizeClanWarSubject(question.subject || "")),
        ));
      } catch (error) {
        console.error("Failed to load Clan Wars questions:", error);
        if (!cancelled) {
          setQuestions([]);
          brainsAlert("We could not load the question pools. Please close this window and try again.", "error");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void fetchQuestions();
    return () => { cancelled = true; };
  }, [restrictedSubjectKey]);

  const poolQuestions = useMemo(
    () => questions.filter((question) => questionBelongsToPool(question, poolFilter)),
    [poolFilter, questions],
  );

  const subjects = useMemo(() => {
    const labelsByKey = new Map<string, string>();
    restrictedSubjects?.filter(Boolean).forEach((subject) =>
      labelsByKey.set(normalizeClanWarSubject(subject), subject.trim()),
    );
    poolQuestions.forEach((question) => {
      const key = normalizeClanWarSubject(question.subject || "");
      if (key && !labelsByKey.has(key)) labelsByKey.set(key, question.subject);
    });
    return [...labelsByKey].map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [poolQuestions, restrictedSubjectKey]);
  const topics = useMemo(
    () => [...new Set(poolQuestions
      .filter((question) => subjectFilter === "all" || normalizeClanWarSubject(question.subject) === subjectFilter)
      .map(questionTopic))].sort(),
    [poolQuestions, subjectFilter],
  );
  const filteredQuestions = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return poolQuestions.filter((question) => {
      if (subjectFilter !== "all" && normalizeClanWarSubject(question.subject) !== subjectFilter) return false;
      if (topicFilter !== "all" && questionTopic(question) !== topicFilter) return false;
      return !query || [question.question_text, question.subject, questionTopic(question), question.difficulty]
        .join(" ").toLocaleLowerCase().includes(query);
    });
  }, [poolQuestions, search, subjectFilter, topicFilter]);

  useEffect(() => {
    if (subjectFilter !== "all" && !subjects.some((subject) => subject.value === subjectFilter)) setSubjectFilter("all");
  }, [subjectFilter, subjects]);

  useEffect(() => {
    if (topicFilter !== "all" && !topics.includes(topicFilter)) setTopicFilter("all");
  }, [topicFilter, topics]);

  const toggleQuestion = (id: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleConfirm = () => {
    const selected = questions.filter((question) => selectedIds.has(question.id));
    if (!selected.length) {
      brainsAlert("Select at least one question before starting the battle.", "info");
      return;
    }
    onConfirm(selected);
  };

  const modalContent = (
    <div className="fixed inset-0 z-[9500] flex items-center justify-center bg-slate-950/85 p-3 backdrop-blur-md sm:p-6">
      <section className="flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-3xl border border-slate-700 bg-slate-950 text-white shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="battle-question-title">
        <header className="flex items-start justify-between gap-4 border-b border-slate-800 bg-gradient-to-r from-slate-950 to-slate-900 p-5 sm:p-7">
          <div><span className="text-xs font-black uppercase tracking-[.18em] text-cyan-300">Clan Wars setup</span><h2 id="battle-question-title" className="mt-2 text-2xl font-black sm:text-3xl">Select battle questions</h2><p className="mt-1 text-sm text-slate-400">Choose a pool, narrow the list, and preview any question before adding it.</p></div>
          <button type="button" onClick={onCancel} className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-slate-700 bg-slate-900 text-xl text-slate-300 hover:border-slate-500 hover:text-white" aria-label="Close question selection">×</button>
        </header>

        <div className="grid gap-3 border-b border-slate-800 bg-slate-900/65 p-4 sm:grid-cols-2 lg:grid-cols-5 sm:p-6">
          <label className="grid gap-1 text-xs font-bold text-slate-400"><span>Question pool</span><select value={poolFilter} onChange={(event) => setPoolFilter(event.target.value as QuestionPoolFilter)} className="min-h-11 rounded-xl border border-slate-700 bg-slate-950 px-3 text-white"><option value="all">All available pools</option><option value="brains-heist">Brains Heist Pool</option><option value="mine">My Pool</option></select></label>
          <label className="grid gap-1 text-xs font-bold text-slate-400"><span>Subject</span><select value={subjectFilter} onChange={(event) => setSubjectFilter(event.target.value)} className="min-h-11 rounded-xl border border-slate-700 bg-slate-950 px-3 text-white"><option value="all">All subjects</option>{subjects.map((subject) => <option key={subject.value} value={subject.value}>{subject.label}</option>)}</select></label>
          <label className="grid gap-1 text-xs font-bold text-slate-400"><span>Topic</span><select value={topicFilter} onChange={(event) => setTopicFilter(event.target.value)} className="min-h-11 rounded-xl border border-slate-700 bg-slate-950 px-3 text-white"><option value="all">All topics</option>{topics.map((topic) => <option key={topic} value={topic}>{topic}</option>)}</select></label>
          <label className="grid gap-1 text-xs font-bold text-slate-400 lg:col-span-2"><span>Search questions</span><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by question, topic, or difficulty…" className="min-h-11 rounded-xl border border-slate-700 bg-slate-950 px-3 text-white placeholder:text-slate-600" /></label>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 px-5 py-3 text-xs text-slate-400">
          <span>Showing <strong className="text-white">{filteredQuestions.length}</strong> questions · <strong className="text-cyan-300">{selectedIds.size}</strong> selected</span>
          <div className="flex gap-2"><button type="button" onClick={() => setSelectedIds((current) => new Set([...current, ...filteredQuestions.map((question) => question.id)]))} disabled={!filteredQuestions.length} className="rounded-lg bg-blue-600 px-3 py-2 font-bold text-white disabled:opacity-40">Select all shown</button><button type="button" onClick={() => setSelectedIds(new Set())} disabled={!selectedIds.size} className="rounded-lg border border-slate-700 px-3 py-2 font-bold text-slate-300 disabled:opacity-40">Clear</button></div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          {loading ? <div className="grid min-h-60 place-items-center text-slate-400"><span>Loading your question pools…</span></div> : filteredQuestions.length ? (
            <div className="grid gap-3 md:grid-cols-2">
              {filteredQuestions.map((question) => {
                const selected = selectedIds.has(question.id);
                return <article key={question.id} className={`rounded-2xl border p-4 transition ${selected ? "border-cyan-400 bg-cyan-950/35 shadow-lg shadow-cyan-950/20" : "border-slate-700 bg-slate-900/65 hover:border-slate-500"}`}>
                  <div className="flex items-start gap-3"><button type="button" onClick={() => toggleQuestion(question.id)} aria-pressed={selected} className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-md border text-xs font-black ${selected ? "border-cyan-300 bg-cyan-400 text-slate-950" : "border-slate-600 bg-slate-950 text-transparent"}`}>✓</button><div className="min-w-0 flex-1"><div className="mb-2 flex flex-wrap gap-1.5"><span className="rounded-md bg-slate-800 px-2 py-1 text-[10px] font-bold text-slate-300">{question.is_mine ? "MY POOL" : "BRAINS HEIST"}</span><span className="rounded-md bg-blue-950 px-2 py-1 text-[10px] font-bold text-blue-300">{questionTopic(question)}</span><span className="rounded-md bg-slate-800 px-2 py-1 text-[10px] font-bold uppercase text-slate-400">{question.difficulty}</span></div><p className="line-clamp-3 text-sm font-semibold leading-6 text-white">{question.question_text}</p></div></div>
                  <footer className="mt-4 flex items-center justify-between border-t border-slate-800 pt-3"><span className="text-xs text-slate-500">{question.subject} · {(question.question_type || "question").replace(/_/g, " ")}</span><button type="button" onClick={() => setPreviewQuestion(question)} className="rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-xs font-bold text-white hover:border-cyan-400">Preview</button></footer>
                </article>;
              })}
            </div>
          ) : <div className="grid min-h-60 place-items-center text-center"><div><p className="text-lg font-bold text-white">No questions match these filters</p><p className="mt-1 text-sm text-slate-400">Try All available pools or a broader subject and topic.</p></div></div>}
        </div>

        <footer className="flex gap-3 border-t border-slate-800 bg-slate-900/75 p-4 sm:p-6"><button type="button" onClick={onCancel} className="rounded-xl border border-slate-700 px-5 py-3 font-bold text-slate-300 hover:bg-slate-800">Cancel</button><button type="button" onClick={handleConfirm} disabled={!selectedIds.size} className="flex-1 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 px-5 py-3 font-black text-white shadow-lg shadow-blue-950/30 disabled:cursor-not-allowed disabled:opacity-40">Use {selectedIds.size} question{selectedIds.size === 1 ? "" : "s"} in battle</button></footer>
      </section>

      {previewQuestion ? <div className="absolute inset-0 z-10 grid place-items-center bg-slate-950/80 p-4 backdrop-blur-sm" onMouseDown={(event) => event.target === event.currentTarget && setPreviewQuestion(null)}><article className="max-h-[84vh] w-full max-w-2xl overflow-y-auto rounded-3xl border border-cyan-500/30 bg-slate-900 p-6 shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="battle-preview-title"><header className="flex items-start justify-between gap-4"><div><span className="text-xs font-black uppercase tracking-widest text-cyan-300">Question preview</span><h3 id="battle-preview-title" className="mt-2 text-xl font-black">{questionTopic(previewQuestion)}</h3></div><button type="button" onClick={() => setPreviewQuestion(null)} className="grid h-10 w-10 place-items-center rounded-xl border border-slate-700" aria-label="Close preview">×</button></header>{previewQuestion.image_url ? <img src={previewQuestion.image_url} alt="" className="mt-5 max-h-64 w-full rounded-xl bg-white object-contain" /> : null}<p className="mt-5 text-lg font-semibold leading-7">{previewQuestion.question_text}</p>{previewQuestion.options?.length ? <ol className="mt-4 grid gap-2">{previewQuestion.options.map((option, index) => <li key={`${index}-${optionText(option)}`} className="rounded-xl border border-slate-700 bg-slate-950/55 px-4 py-3"><span className="mr-2 font-black text-cyan-300">{String.fromCharCode(65 + index)}.</span>{optionText(option)}</li>)}</ol> : null}<div className="mt-5 rounded-xl border border-emerald-700/50 bg-emerald-950/35 p-4"><span className="text-xs font-black uppercase tracking-wider text-emerald-300">Correct answer</span><p className="mt-1 text-emerald-50">{previewQuestion.correct_answer}</p></div>{previewQuestion.explanation ? <div className="mt-3 rounded-xl border border-slate-700 p-4"><span className="text-xs font-black uppercase tracking-wider text-slate-400">Explanation</span><p className="mt-1 text-sm text-slate-200">{previewQuestion.explanation}</p></div> : null}<button type="button" onClick={() => { toggleQuestion(previewQuestion.id); setPreviewQuestion(null); }} className="mt-5 w-full rounded-xl bg-blue-600 px-4 py-3 font-black">{selectedIds.has(previewQuestion.id) ? "Remove from battle" : "Add to battle"}</button></article></div> : null}
    </div>
  );

  if (typeof document === "undefined") return modalContent;
  return createPortal(modalContent, document.body);
};
