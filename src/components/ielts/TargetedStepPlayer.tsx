import React, { useEffect, useMemo, useRef, useState } from "react";
import type { LearningDetail, LearningQuestion } from "../../../services/ieltsLearningService";

/**
 * Student view of a targeted task, one step at a time: start, learn first (when the task has a lesson), the passage or
 * recording, one question per screen, a check-your-answers screen and a result screen with an explanation per question.
 * Saving, submitting, audio and recording stay in the page; this component only presents them step by step.
 */

const SEPARATOR = /\n\s*-(?:\s*-){3,}\s*\n/;
const TFNG = ["TRUE", "FALSE", "NOT GIVEN"].map((v) => ({ value: v, label: v }));

export type SplitPassage = { learnTitle?: string; learn?: string; articleTitle?: string; article?: string };

/** Split "LEARN FIRST: … - - - - THE PASSAGE: Title …" into its lesson and its article. Plain passages stay articles. */
export function splitPassage(passage?: string): SplitPassage {
  const text = (passage ?? "").trim();
  if (!text) return {};
  let learnPart: string | undefined;
  let articlePart: string | undefined = text;
  if (/^LEARN FIRST:/i.test(text)) {
    const parts = text.split(SEPARATOR);
    learnPart = parts[0];
    articlePart = parts.slice(1).join("\n\n").trim() || undefined;
  }
  const out: SplitPassage = {};
  if (learnPart) {
    const [first, ...rest] = learnPart.split("\n");
    out.learnTitle = first.replace(/^LEARN FIRST:\s*/i, "").trim();
    out.learn = rest.join("\n").trim();
  }
  if (articlePart) {
    const m = /^THE PASSAGE:\s*(.+)\n/i.exec(articlePart);
    if (m) {
      out.articleTitle = m[1].trim();
      out.article = articlePart.slice(m[0].length).trim();
    } else out.article = articlePart;
  }
  return out;
}

/** One explanation per question when teacher notes are numbered "1 …", "2 …"; otherwise none. */
export function explanationFor(notes: string | undefined, index: number): string | undefined {
  if (!notes) return undefined;
  const line = notes.split("\n").find((l) => l.startsWith(`${index + 1} `));
  return line ? line.slice(String(index + 1).length + 1).trim() : undefined;
}

function Lines({ block }: { block: string }) {
  const lines = block.split("\n").filter((l) => l.trim());
  const items: React.ReactNode[] = [];
  let list: string[] = [];
  let defs: [string, string][] = [];
  const flush = () => {
    if (list.length) items.push(<ol className="il-step-list" key={"ol" + items.length}>{list.map((l, i) => <li key={i}>{l}</li>)}</ol>);
    if (defs.length) items.push(<dl className="il-step-defs" key={"dl" + items.length}>{defs.map(([k, v], i) => <div key={k} style={hue(k, i)}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>);
    list = []; defs = [];
  };
  for (const line of lines) {
    const numbered = /^\d+\.\s+(.*)$/.exec(line);
    const lettered = /^([A-F])\s{2,}(.*)$/.exec(line);
    const answer = /^Answer:\s*(.*)$/.exec(line);
    if (numbered) { if (defs.length) flush(); list.push(numbered[1]); }
    else if (lettered) { if (list.length) flush(); defs.push([lettered[1], lettered[2]]); }
    else {
      flush();
      items.push(answer
        ? <p className="il-step-answer" key={items.length}><span>Answer</span> {answer[1]}</p>
        : <p key={items.length}>{line}</p>);
    }
  }
  flush();
  return <>{items}</>;
}

export function LearnCard({ title, body }: { title?: string; body: string }) {
  const blocks = body.split(/\n\s*\n/).filter((b) => b.trim());
  return (
    <div className="il-step-learn">
      <p className="il-step-kicker">Learn first</p>
      {title && <h3>{title.charAt(0).toUpperCase() + title.slice(1)}</h3>}
      {blocks.map((b, i) => {
        const example = /^WORKED EXAMPLE(?:\s*\d*)?/.exec(b);
        if (example) {
          return (
            <div className="il-step-example" key={i}>
              <p className="il-step-kicker">{example[0].trim().replace("WORKED EXAMPLE", "Worked example")}</p>
              <Lines block={b.slice(example[0].length)} />
            </div>
          );
        }
        return <div className="il-step-block" key={i}><Lines block={b} /></div>;
      })}
    </div>
  );
}

export function ArticleView({ title, text }: { title?: string; text: string }) {
  const paras = text.split(/\n\s*\n/).filter((p) => p.trim());
  return (
    <article className="il-step-article">
      {title && <h3>{title}</h3>}
      {paras.map((p, i) => {
        const m = /^([A-H])\.\s+([\s\S]*)$/.exec(p.trim());
        return m
          ? <p key={i} className="il-step-para"><span className="il-step-letter" aria-label={"Paragraph " + m[1]}>{m[1]}</span><span>{m[2]}</span></p>
          : <p key={i}>{p}</p>;
      })}
    </article>
  );
}

/** Each kind of step has its own colour and icon so students always know what they are doing. */
const KIND: Record<string, { icon: string; label: string }> = {
  start: { icon: "🎯", label: "Your mission" },
  learn: { icon: "💡", label: "Learn first" },
  listen: { icon: "🎧", label: "Listen" },
  passage: { icon: "📖", label: "Read" },
  task: { icon: "📝", label: "Your task" },
  question: { icon: "❓", label: "Question" },
  response: { icon: "✍️", label: "Your turn" },
  review: { icon: "✅", label: "Check" },
};

const HUES = ["#1746B0", "#0E7490", "#B45309", "#6D28D9", "#087F5B", "#BE185D", "#4338CA", "#9A3412"];
/** The same colour for the same letter everywhere (A is always blue, C always amber), so kinds stick in memory. */
export function hueFor(value: string, index: number) {
  const letter = /^[A-H]$/.exec(value);
  return HUES[letter ? value.charCodeAt(0) - 65 : index % HUES.length];
}
const hue = (value: string, index: number) => ({ ["--hue" as string]: hueFor(value, index) }) as React.CSSProperties;

/** Wrap quoted phrases in a highlight so students see exactly which words to match. */
export function highlightQuotes(text: string): React.ReactNode {
  const parts = text.split(/("[^"]+")/g);
  return parts.length === 1 ? text : parts.map((part, i) => (/^"[^"]+"$/.test(part) ? <mark className="il-step-hl" key={i}>{part}</mark> : part));
}

type Step =
  | { kind: "start" }
  | { kind: "learn" }
  | { kind: "passage" }
  | { kind: "listen" }
  | { kind: "task" }
  | { kind: "question"; q: LearningQuestion; i: number }
  | { kind: "response" }
  | { kind: "review" };

export interface TargetedStepPlayerProps {
  detail: LearningDetail;
  answers: Record<string, string>;
  update: (value: Record<string, string>) => void;
  draft: () => Record<string, string>;
  disabled: boolean;
  working: boolean;
  blocked: boolean;
  message: string;
  audioBar?: React.ReactNode;
  pendingNotice?: React.ReactNode;
  recorder?: React.ReactNode;
  canSubmit: boolean;
  onSubmit: () => void;
  onSave: () => void;
}

const optionsFor = (skill: string, q: LearningQuestion) =>
  q.options ?? (skill === "reading" && q.answer_format !== "text" ? TFNG : undefined);

/** Split "A an account" into a letter badge and its text; options without a leading letter show their label only. */
function optionParts(value: string, label: string, chosen = false) {
  const lead = value.length <= 2 && label.startsWith(value + " ") ? label.slice(value.length + 1).trimStart() : null;
  const tick = <span className={"il-step-tick" + (chosen ? " is-on" : "")} aria-hidden="true">✓</span>;
  return lead === null ? <><span className="il-step-option-text">{label}</span>{tick}</> : (<><span className="il-step-option-letter" aria-hidden="true">{value}</span><span className="il-step-option-text"><span className="il-sr-only">{value} </span>{lead}</span>{tick}</>);
}

export default function TargetedStepPlayer(p: TargetedStepPlayerProps) {
  const { detail, answers } = p;
  const skill = detail.skill ?? "listening";
  const split = useMemo(() => splitPassage(detail.content?.passage), [detail.content?.passage]);
  const objective = skill === "listening" || skill === "reading";
  const steps = useMemo<Step[]>(() => {
    const s: Step[] = [{ kind: "start" }];
    if (split.learn) s.push({ kind: "learn" });
    if (objective) {
      if (skill === "listening") s.push({ kind: "listen" });
      if (split.article || detail.content?.summary) s.push({ kind: "passage" });
      detail.questions.forEach((q, i) => s.push({ kind: "question", q, i }));
    } else {
      if (split.article || detail.content?.prompt || detail.content?.scaffold || detail.content?.summary) s.push({ kind: "task" });
      s.push({ kind: "response" });
    }
    s.push({ kind: "review" });
    return s;
  }, [detail.id, split.learn, split.article, objective, skill, detail.questions, detail.content?.prompt, detail.content?.scaffold, detail.content?.summary]);
  const [index, setIndex] = useState(0);
  const heading = useRef<HTMLHeadingElement | null>(null);
  const first = useRef(true);
  useEffect(() => { setIndex(0); }, [detail.id]);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    heading.current?.focus();
  }, [index]);
  const step = steps[Math.min(index, steps.length - 1)];
  const questionSteps = steps.filter((s) => s.kind === "question").length;
  const [dir, setDir] = useState(1);
  const go = (n: number) => { setDir(n >= index ? 1 : -1); setIndex(Math.max(0, Math.min(steps.length - 1, n))); };
  const set = (key: string, value: string) => p.update({ ...p.draft(), [key]: value });
  const answered = detail.questions.filter((q) => (answers[q.id] ?? "").trim()).length;
  const progress = Math.round((index / Math.max(1, steps.length - 1)) * 100);
  const labelOf = (q: LearningQuestion, value: string) => optionsFor(skill, q)?.find((o) => o.value === value)?.label ?? value;

  let title = "";
  let body: React.ReactNode = null;
  switch (step.kind) {
    case "start":
      title = detail.purpose === "guided_practice" ? "Guided practice" : "Fresh check";
      body = (
        <>
          <div className="il-step-goal">
            <p className="il-step-kicker">Your goal</p>
            <p>{detail.success_description}</p>
          </div>
          <p>{detail.instructions}</p>
          {detail.reason && <p className="il-step-note"><strong>From your teacher:</strong> {detail.reason}</p>}
          <ul className="il-step-plan">
            {split.learn && <li>Learn the method with a worked example</li>}
            {skill === "listening" && <li>Listen to the recording</li>}
            {split.article && <li>Read the passage</li>}
            {objective ? <li>Answer {detail.questions.length} questions, one at a time</li> : <li>Write or record your response</li>}
            <li>Check your answers and submit</li>
          </ul>
          {detail.content?.suggested_minutes ? <p className="il-muted">About {detail.content.suggested_minutes} minutes. Your work saves as you go.</p> : <p className="il-muted">Your work saves as you go.</p>}
        </>
      );
      break;
    case "learn":
      title = "Learn first";
      body = <LearnCard title={split.learnTitle} body={split.learn!} />;
      break;
    case "listen":
      title = "Listen";
      body = <p>Play the recording when you are ready. It includes time to read the questions first. You can keep it playing while you answer.</p>;
      break;
    case "passage":
      title = "Read the passage";
      body = (
        <>
          <p className="il-muted">Read it once now. You can open it again on every question.</p>
          {split.article && <ArticleView title={split.articleTitle} text={split.article} />}
          {detail.content?.summary && <div className="il-summary"><h3>Summary</h3><p className="il-passage">{detail.content.summary}</p></div>}
        </>
      );
      break;
    case "task":
      title = "Your task";
      body = (
        <>
          {split.article && <ArticleView title={split.articleTitle} text={split.article} />}
          {detail.content?.prompt && <h3>{detail.content.prompt}</h3>}
          {detail.content?.scaffold && <p className="il-support">Guided support: {detail.content.scaffold}</p>}
        </>
      );
      break;
    case "question": {
      const { q, i } = step;
      const options = optionsFor(skill, q);
      title = `Question ${i + 1} of ${questionSteps}`;
      body = (
        <>
          <p className="il-step-prompt">{highlightQuotes(q.prompt)}</p>
          {options ? (
            <div className="il-step-options" role="radiogroup" aria-label={`Answer for question ${i + 1}`}>
              {options.map((o, oi) => {
                const chosen = answers[q.id] === o.value;
                return (
                  <button key={o.value} type="button" role="radio" aria-checked={chosen} data-value={o.value} style={hue(o.value, oi)} className={"il-step-option" + (chosen ? " is-chosen" : "")}
                    disabled={p.disabled} onClick={() => set(q.id, chosen ? "" : o.value)}>
                    {optionParts(o.value, o.label, chosen)}
                  </button>
                );
              })}
            </div>
          ) : (
            <label className="il-answer">
              <span>{skill === "reading" ? "Type the words from the passage" : "Type your answer"}</span>
              <input maxLength={120} value={answers[q.id] ?? ""} disabled={p.disabled} onChange={(e) => set(q.id, e.target.value)} autoComplete="off" />
            </label>
          )}
          {skill === "reading" && !q.options && q.answer_format !== "text" && (
            <label className="il-answer">
              Your evidence or the missing fact
              <textarea maxLength={1000} value={answers["e" + (i + 1)] ?? ""} disabled={p.disabled} onChange={(e) => set("e" + (i + 1), e.target.value)} />
            </label>
          )}
          {split.article && (
            <details className="il-preview il-step-peek">
              <summary>Show the passage</summary>
              <ArticleView title={split.articleTitle} text={split.article} />
            </details>
          )}
          {split.learn && (
            <details className="il-preview il-step-peek">
              <summary>Show the method again</summary>
              <LearnCard title={split.learnTitle} body={split.learn} />
            </details>
          )}
        </>
      );
      break;
    }
    case "response":
      title = skill === "writing" ? "Write your response" : "Record your response";
      body = (
        <>
          {detail.content?.prompt && <p className="il-step-prompt">{detail.content.prompt}</p>}
          <label className="il-answer">
            {skill === "writing" ? "Your paragraph" : "Preparation notes (optional)"}
            <textarea className="il-response" maxLength={12000} value={answers.response ?? ""} disabled={p.disabled} onChange={(e) => set("response", e.target.value)} />
            {skill === "writing" && <span>{(answers.response ?? "").trim().split(/\s+/).filter(Boolean).length} words · Aim for 80–120 words. This is a practice guide.</span>}
          </label>
          {p.recorder}
        </>
      );
      break;
    case "review":
      title = "Check your answers";
      body = (
        <>
          {objective && (
            <div className="il-step-tally">
              <span className="il-step-ring" style={{ ["--p" as string]: Math.round((answered / Math.max(1, detail.questions.length)) * 100) } as React.CSSProperties} aria-hidden="true"><b>{answered}/{detail.questions.length}</b></span>
              <p>{answered} of {detail.questions.length} answered. {answered === detail.questions.length ? "All done — check them once, then submit." : "Tap a question to change it."}</p>
            </div>
          )}
          {objective && (
            <ol className="il-step-review">
              {detail.questions.map((q, i) => {
                const v = answers[q.id] ?? "";
                const at = steps.findIndex((s) => s.kind === "question" && s.i === i);
                return (
                  <li key={q.id} style={{ ["--i" as string]: i } as React.CSSProperties}>
                    <button type="button" className={"il-step-jump" + (v ? " is-done" : " is-missing")} onClick={() => go(at)}>
                      <span className="il-step-qn">{i + 1}</span>
                      <span className="il-step-qtext">{q.prompt}</span>
                      <strong className={v ? "" : "il-step-missing"}>{v ? labelOf(q, v) : "No answer yet"}</strong>
                    </button>
                  </li>
                );
              })}
            </ol>
          )}
          {!objective && <p>{(answers.response ?? "").trim() ? "Your response is ready." : skill === "writing" ? "Write your response before you submit." : "Save your recording before you submit."}</p>}
          {skill !== "listening" && (
            <label className="il-answer">
              Any help or interruption? (optional)
              <textarea maxLength={1200} value={answers.assistance ?? ""} disabled={p.disabled} onChange={(e) => set("assistance", e.target.value)} />
            </label>
          )}
          <div className="il-actions">
            <button className="il-step-submit" disabled={!p.canSubmit} onClick={p.onSubmit}>{p.working ? "Submitting…" : "Submit for review"}</button>
            <button className="il-step-secondary" disabled={p.working || p.blocked} onClick={p.onSave}>Save now</button>
          </div>
        </>
      );
      break;
  }

  const kind = KIND[step.kind];
  const ready = step.kind === "question" ? Boolean((answers[step.q.id] ?? "").trim()) : step.kind !== "start";
  return (
    <section className="il-card il-step" data-kind={step.kind} aria-label="Task steps">
      <div className="il-step-progress" role="progressbar" aria-label="Progress through this task" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}>
        <span style={{ width: Math.max(progress, 4) + "%" }} />
      </div>
      <div className="il-step-top">
        <span className="il-step-chip"><span aria-hidden="true">{kind.icon}</span> {kind.label}</span>
        <p className="il-step-count">Step {index + 1} of {steps.length}</p>
      </div>
      {p.pendingNotice}
      {skill === "listening" && index > 0 && <div className="il-step-audio">{p.audioBar}</div>}
      <div key={index} className={"il-step-stage " + (dir > 0 ? "is-forward" : "is-back")}>
        <h2 ref={heading} tabIndex={-1}>{title}</h2>
        <div className="il-step-body">{body}</div>
      </div>
      <nav className="il-step-nav" aria-label="Move between steps">
        <button type="button" className="il-step-secondary" disabled={index === 0} onClick={() => go(index - 1)}>← Back</button>
        {step.kind !== "review" && (
          <button type="button" className={"il-step-next" + (ready && step.kind === "question" ? " is-ready" : "")} onClick={() => go(index + 1)}>
            {step.kind === "start" ? "Let’s go →" : step.kind === "learn" ? "I've got it →" : steps[index + 1]?.kind === "review" ? "Check answers →" : "Next →"}
          </button>
        )}
      </nav>
      <p role="status" className="il-muted">{p.message}</p>
    </section>
  );
}

/** After submission: the score, then every question with the student's answer, the key and its explanation. */
export function TargetedResultSteps({ detail }: { detail: LearningDetail }) {
  const skill = detail.skill ?? "listening";
  const split = splitPassage(detail.content?.passage);
  const result = detail.result!;
  const notes = detail.content?.teacher_notes;
  const perQuestion = detail.questions.some((_, i) => explanationFor(notes, i));
  return (
    <section className="il-card il-step" aria-label="Your result">
      <p className="il-step-kicker">Submitted</p>
      <h2>{result.total === null ? "Your response is saved" : `Task result: ${result.score} / ${result.total}`}</h2>
      {result.total !== null && result.score !== null && (
        <div className={"il-step-score" + (result.score === result.total ? " is-perfect" : result.score / Math.max(1, result.total) >= 0.66 ? " is-strong" : " is-start")}>
          <span className="il-step-ring is-big" style={{ ["--p" as string]: Math.round((result.score / Math.max(1, result.total)) * 100) } as React.CSSProperties} aria-hidden="true"><b>{result.score}/{result.total}</b></span>
          <p className="il-step-cheer">{result.score === result.total ? "🏆 Perfect — you avoided every trap!" : result.score / Math.max(1, result.total) >= 0.66 ? "💪 Strong work — now read why the others went wrong." : "🔍 Good start — each explanation below shows the trap."}</p>
          {result.score === result.total && <div className="il-step-confetti" aria-hidden="true">{Array.from({ length: 14 }, (_, i) => <i key={i} style={{ ["--i" as string]: i } as React.CSSProperties} />)}</div>}
        </div>
      )}
      <p>{detail.review ? "Your teacher’s feedback is ready below." : "Read each explanation, then find the proof in the passage yourself. Your teacher will choose the next step."}</p>
      {detail.conditions_need_review && <p className="il-muted">Delivery conditions need teacher review. This is not a judgement about your ability.</p>}
      {(skill === "listening" || skill === "reading") && (
        <ol className="il-step-results">
          {detail.questions.map((q, i) => {
            const o = result.outcomes.find((x) => x.id === q.id);
            const raw = detail.answers[q.id] ?? "";
            const options = optionsFor(skill, q);
            const shown = (v: string) => options?.find((x) => x.value === v)?.label ?? v;
            const why = explanationFor(notes, i);
            return (
              <li key={q.id} className={o?.correct ? "is-correct" : "is-wrong"} style={{ ["--i" as string]: i } as React.CSSProperties}>
                <p className="il-step-qline"><span className="il-step-qn">{i + 1}</span> <span>{highlightQuotes(q.prompt)}</span></p>
                <p><span className={"il-step-badge" + (o?.correct ? " ok" : " no")}>{o?.correct ? "✓ Correct" : "↺ Review this answer"}</span> Your answer: <strong>{raw ? shown(raw) : "No answer"}</strong></p>
                {!o?.correct && <p>Accepted: <strong>{(o?.accepted_answers ?? []).map(shown).join(" / ")}</strong></p>}
                {why && <p className="il-step-why"><span>Why</span> {why}</p>}
              </li>
            );
          })}
        </ol>
      )}
      {!perQuestion && notes && (
        <details className="il-preview il-step-peek"><summary>Review the task explanation</summary><p className="il-passage">{notes}</p></details>
      )}
      {split.learn && (
        <details className="il-preview il-step-peek"><summary>Review the method</summary><LearnCard title={split.learnTitle} body={split.learn} /></details>
      )}
      {split.article && (
        <details className="il-preview il-step-peek"><summary>Read the passage again</summary><ArticleView title={split.articleTitle} text={split.article} /></details>
      )}
    </section>
  );
}
