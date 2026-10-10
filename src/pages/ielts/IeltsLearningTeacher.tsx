import { ieltsMaterialTitle } from "../../../services/ieltsMaterialCode";
import React, { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  learningWorkspace,
  allocateLearning,
  approveLearningContent,
  type LearningWorkspace,
} from "../../../services/ieltsLearningService";
import {
  programmeWorkspace,
  programmeEvidenceRoute,
  type ProgrammeStudent,
} from "../../../services/ieltsProgrammeService";
import { useIeltsMaterialUsage } from "./useIeltsMaterialUsage";
import { materialUsageLabel } from "../../../services/ieltsTeacherPracticeService";
import "../../styles/ielts-learning.css";
export default function IeltsLearningTeacher({
  schoolId,
  reviewOnly = false,
}: {
  schoolId: string;
  reviewOnly?: boolean;
}) {
  const [data, setData] = useState<LearningWorkspace | null>(null),
    [student, setStudent] = useState<ProgrammeStudent | null>(null);
  const [recipients, setRecipients] = useState<ProgrammeStudent[]>([]);
  const [chosenRecipient, setChosenRecipient] = useState<ProgrammeStudent | null>(null);
  const [studentSearch, setStudentSearch] = useState(""), [studentOffset, setStudentOffset] = useState(0);
  const [studentTotal, setStudentTotal] = useState(0), [studentsLoading, setStudentsLoading] = useState(false);
  const [studentsError, setStudentsError] = useState("");
  const [task, setTask] = useState(""),
    [reason, setReason] = useState(""),
    [notes, setNotes] = useState(""),
    [confirmed, setConfirmed] = useState(false),
    [message, setMessage] = useState("Loading targeted practice…"),
    [busy, setBusy] = useState(false),
    [retry, setRetry] = useState(0),
    [usageRevision, setUsageRevision] = useState(0);
  const request = useRef(crypto.randomUUID()),
    scope = useRef(schoolId);
  scope.current = schoolId;
  useEffect(() => {
    let active = true;
    setData(null);
    setStudent(null);
    setChosenRecipient(null);
    setRecipients([]);
    setStudentSearch("");
    setStudentOffset(0);
    setBusy(false);
    setReason("");
    request.current = crypto.randomUUID();
    setConfirmed(false);
    setNotes("");
    setMessage("Loading targeted practice…");
    learningWorkspace(schoolId)
      .then((w) => {
        if (active) {
          setData(w);
          setTask(w.tasks[0]?.code ?? "");
          setMessage("");
        }
      })
      .catch(
        () =>
          active &&
          setMessage(
            "Targeted practice could not load. Check your programme access and retry.",
          ),
      );
    return () => {
      active = false;
    };
  }, [schoolId, reviewOnly, retry]);
  const released = data?.tasks.find(t => t.code === task)?.released === true;
  const recipientId = released ? chosenRecipient?.id : data?.tasks.find(t => t.code === task)?.pilot_student;
  const recipientName = released ? chosenRecipient?.name : data?.tasks.find(t => t.code === task)?.pilot_student_name;
  useEffect(() => {
    if (reviewOnly || !released) return;
    let active = true;
    setStudentsLoading(true);
    setStudentsError("");
    const timer = setTimeout(() => {
      programmeWorkspace(schoolId, studentSearch, studentOffset).then(p => {
        if (active) { setRecipients(p.students); setStudentTotal(p.total_students); }
      }).catch(() => { if (active) setStudentsError("Students could not load. Retry loading practice."); })
        .finally(() => { if (active) setStudentsLoading(false); });
    }, 250);
    return () => { active = false; clearTimeout(timer); };
  }, [schoolId, reviewOnly, released, studentSearch, studentOffset, retry]);
  useEffect(() => {
    let active = true; setStudent(null);
    if (reviewOnly || !recipientId || !recipientName) return;
    programmeWorkspace(schoolId, recipientName).then(p => {
      if (active) setStudent(p.students.find(s => s.id === recipientId) ?? null);
    }).catch(() => { if (active) setMessage("Student evidence could not load. Retry loading practice."); });
    return () => { active = false; };
  }, [schoolId, reviewOnly, recipientId, recipientName, retry]);
  const usage = useIeltsMaterialUsage(reviewOnly || !recipientId ? undefined : schoolId, data?.tasks.filter(t=>t.released || t.pilot_student===recipientId).map(t=>({type:"targeted",id:t.code})) ?? [], {student:recipientId}, usageRevision);
  const prior = usage.data?.find(u => u.id === task && u.type === "targeted");
  const activeAssignment = !!prior?.active_count;
  const exposedCheck = data?.tasks.find(t=>t.code===task)?.purpose === "independent_check" && !!prior?.assigned_count;
  const [repeatConfirmed, setRepeatConfirmed] = useState(false);
  useEffect(() => {setRepeatConfirmed(false);}, [task,recipientId]);
  const selected = data?.tasks.find((t) => t.code === task),
    skill = selected?.skill ?? "listening",
    source = student?.[skill],
    sourceRoute = programmeEvidenceRoute(skill, source ?? null);
  const sourceReady =
    student?.id === recipientId && !!source &&
    (!["writing", "speaking"].includes(skill) || source.reviewed === true);
  const approved = selected?.approved ?? !selected?.requires_review;
  async function run(action: () => Promise<void>) {
    if (busy) return;
    const school = schoolId;
    setBusy(true);
    try {
      await action();
    } catch (e) {
      if (scope.current === school)
        setMessage(
          e instanceof Error ? e.message : "This step could not be confirmed.",
        );
    } finally {
      if (scope.current === school) setBusy(false);
    }
  }
  return (
    <div className="il-shell">
      <p className="il-eyebrow">FOUR SKILLS · TARGETED PRACTICE</p>
      <h2>
        {reviewOnly
          ? "Targeted practice reviews"
          : "Choose a purposeful next step"}
      </h2>
      <p>
        Review the task, connect the matching screener
        evidence and explain why it is useful. These tasks do not automatically
        create a band estimate or improvement label.
      </p>
      {message && <p role="status">{message}</p>}
      {(!data || message.startsWith("Student evidence could not load")) && (
        <button onClick={() => setRetry((n) => n + 1)}>
          Retry loading practice
        </button>
      )}
      {data && (
        <>
          {!reviewOnly && (
            <section className="il-card bh-ielts-targeted-form">
              {released && <label className="il-answer bh-ielts-field-student-search">Find a student
                <input value={studentSearch} maxLength={80} disabled={busy} onChange={e => { setStudentSearch(e.target.value); setStudentOffset(0); }} placeholder="Search eligible students by name" />
              </label>}
              <label className="il-answer bh-ielts-field-student">Student
                <select value={recipientId ?? ""} disabled={!released || busy || studentsLoading || !!studentsError} aria-label="Available student for this material" onChange={e => {
                  setChosenRecipient(recipients.find(s => s.id === e.target.value) ?? null);
                  setStudent(null); setReason(""); setRepeatConfirmed(false);
                  request.current = crypto.randomUUID();
                }}>
                  {released ? <>
                    <option value="">Choose an eligible student</option>
                    {chosenRecipient && !recipients.some(s => s.id === chosenRecipient.id) && <option value={chosenRecipient.id}>{chosenRecipient.name}</option>}
                    {recipients.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </> : <option value={recipientId ?? ""}>{recipientName ?? "Student unavailable"}</option>}
                </select>
              </label>
              {released && <>
                {studentsLoading && <p role="status">Loading eligible students…</p>}
                {studentsError && <p role="alert">{studentsError}</p>}
                {!studentsLoading && !studentsError && recipients.length === 0 && <p>No eligible students match this search.</p>}
                <div><button disabled={busy || studentsLoading || studentOffset === 0} onClick={() => setStudentOffset(n => Math.max(0,n-50))}>Previous students</button>{" "}
                <button disabled={busy || studentsLoading || studentOffset + 50 >= studentTotal} onClick={() => setStudentOffset(n => n+50)}>Next students</button></div>
              </>}
              <p className="il-muted">{released ? "Available to eligible students in your school. Select a student and review their matching evidence." : "This material is restricted to its named-student pilot."}</p>
              <label className="il-answer bh-ielts-field-task">
                Task
                <select
                  value={task}
                  disabled={busy}
                  onChange={(e) => {
                    setTask(e.target.value);
                    setRepeatConfirmed(false);
                    setConfirmed(false);
                    setNotes("");
                    request.current = crypto.randomUUID();
                  }}
                >
                  {data.tasks.map((t) => (
                    <option key={t.code} value={t.code}>
                      {t.skill ?? "listening"} · {ieltsMaterialTitle(t.display_code, t.title)}{t.originality_label?.startsWith("Variant of ") ? ` · ${t.originality_label}` : ""} ·{" "}
                      {t.purpose === "guided_practice"
                        ? "Guided practice"
                        : "Fresh check"}{(() => {
                          const u = usage.data?.find(u=>u.type==="targeted" && u.id===t.code);
                          return u ? u.active_count ? " · Already active" : u.assigned_count ? " · Previously given" : " · No recorded assignment" : "";
                        })()}
                    </option>
                  ))}
                </select>
              </label>
              <div className="il-usage bh-ielts-reuse-history" aria-live="polite">
                <strong>Previous assignments for this student</strong>
                {usage.loading ? <p>Checking this material’s history…</p> : usage.error ? <><p>{usage.error}</p><button onClick={usage.retry}>Retry history check</button></> : prior ? <>
                  <p>{materialUsageLabel(prior)}</p>
                  {prior.last_assigned_at && <p>Last assigned {new Date(prior.last_assigned_at).toLocaleDateString()}</p>}
                  {prior.latest_assignment_id && <Link to={"/ielts/practice/targeted/"+prior.latest_assignment_id}>Open existing assignment →</Link>}
                  {exposedCheck && <p>This task has already been given. Choose a different fresh check.</p>}
                  {!!prior.assigned_count && !activeAssignment && !exposedCheck && <label className="il-answer"><span><input type="checkbox" checked={repeatConfirmed} onChange={e=>setRepeatConfirmed(e.target.checked)}/> I intend to repeat this material for practice.</span></label>}
                  {!prior.assigned_count && <p>This checks recorded assignments only; ask about other practice or help before using a fresh check.</p>}
                </> : <p>Choose an available student and task to check previous use.</p>}
              </div>
              {sourceRoute ? (
                <Link to={sourceRoute}>Review {skill} source evidence →</Link>
              ) : (
                <p>No matching screener evidence is available.</p>
              )}
              {source && !sourceReady && (
                <p>
                  Share the teacher’s screener review before assigning this
                  skill.
                </p>
              )}
              {selected && (
                <>
                  <p>
                    <strong>Success looks like:</strong>{" "}
                    {selected.success_description}
                  </p>
                  <details className="il-preview">
                    <summary>Inspect the task, key and skill mapping</summary>
                    <p>{selected.instructions}</p>
                    <p>{selected.content?.scope}</p>
                    {selected.content?.passage && (
                      <p className="il-passage">{selected.content.passage}</p>
                    )}
                    {selected.content?.prompt && (
                      <h3>{selected.content.prompt}</h3>
                    )}
                    {selected.content?.scaffold && (
                      <p>Guided support: {selected.content.scaffold}</p>
                    )}
                    {selected.questions?.map((q, i) => (
                      <article key={q.id}>
                        <strong>
                          {i + 1}. {q.prompt}
                        </strong>
                        {q.accepted_answers && (
                          <p>Key: {q.accepted_answers.join(" / ")}</p>
                        )}
                        <p>
                          Focus: {q.primary_name} · Supporting:{" "}
                          {q.supporting_name}
                        </p>
                      </article>
                    ))}
                    <p className="il-passage">
                      {selected.content?.teacher_notes}
                    </p>
                    <p>{selected.content?.mapping_scope}</p>
                    <p>
                      Original Brains Heist materials. Targeted practice only;
                      the fresh checks are not calibrated equivalent forms.
                    </p>
                  </details>
                  {selected.requires_review && !approved && (
                    <div className="il-alert">
                      <h3>Confirm the new material before assignment</h3>
                      <label className="il-answer">
                        <span>
                          <input
                            type="checkbox"
                            checked={confirmed}
                            onChange={(e) => setConfirmed(e.target.checked)}
                          />{" "}
                          I inspected the wording, instructions, keys, skill
                          mapping, difficulty, suggested timing and originality
                          for this named-student pilot.
                        </span>
                      </label>
                      <label className="il-answer">
                        Review notes
                        <textarea
                          maxLength={1200}
                          value={notes}
                          onChange={(e) => setNotes(e.target.value)}
                          placeholder="Record the review or any limits you want considered."
                        />
                      </label>
                      <button
                        disabled={
                          busy || !confirmed || notes.trim().length < 10
                        }
                        onClick={() =>
                          void run(async () => {
                            await approveLearningContent(
                              schoolId,
                              selected.code,
                              selected.content_sha256,
                              notes,
                              confirmed,
                            );
                            const next = await learningWorkspace(schoolId);
                            if (scope.current === schoolId) {
                              setData(next);
                              setMessage(
                                "Material confirmed for this pilot. You can now assign it.",
                              );
                            }
                          })
                        }
                      >
                        Confirm material for pilot
                      </button>
                    </div>
                  )}
                  {approved && <p>{released ? "Material published and ready for assignment." : "Material ready for pilot assignment."}</p>}
                </>
              )}
              <label className="il-answer bh-ielts-field-reason">
                Why this task for this student?
                <textarea
                  maxLength={1200}
                  value={reason}
                  onChange={(e) => {
                    setReason(e.target.value);
                    request.current = crypto.randomUUID();
                  }}
                  placeholder="Explain the reviewed finding, or clearly label this as a delivery pilot."
                />
              </label>
              <button
                disabled={
                  busy ||
                  !prior ||
                  activeAssignment ||
                  exposedCheck ||
                  (!!prior.assigned_count && !repeatConfirmed) ||
                  !sourceReady ||
                  !approved ||
                  reason.trim().length < 10 ||
                  !task
                }
                onClick={() =>
                  void run(async () => {
                    if (!student || !source) return;
                    await allocateLearning(
                      schoolId,
                      student.id,
                      task,
                      source.attempt_id,
                      reason,
                      request.current,
                    );
                    const next = await learningWorkspace(schoolId);
                    if (scope.current === schoolId) {
                      setData(next);
                      setUsageRevision(n=>n+1);
                      setRepeatConfirmed(false);
                      setMessage(
                        "Assigned. The student can open this task in Targeted Practice.",
                      );
                    }
                  })
                }
              >
                {busy ? "Working…" : "Confirm and assign"}
              </button>
            </section>
          )}
          <section className="il-card">
            <h3>Assigned work and reviews</h3>
            {data.allocations.filter(
              (a) => !reviewOnly || a.status === "submitted",
            ).length === 0 ? (
              <p>
                No targeted practice{" "}
                {reviewOnly ? "ready for review" : "assigned"} yet.
              </p>
            ) : (
              data.allocations
                .filter((a) => !reviewOnly || a.status === "submitted")
                .map((a) => (
                  <article key={a.id}>
                    <p className="il-eyebrow">{a.skill}</p>
                    <h4>
                      {a.student_name} · {ieltsMaterialTitle(a.display_code, a.title)}{a.originality_label?.startsWith("Variant of ") ? ` · ${a.originality_label}` : ""}
                    </h4>
                    <p>{a.reason}</p>
                    <p>
                      {a.reviewed
                        ? "Teacher feedback shared"
                        : a.status === "submitted"
                          ? "Ready for teacher review"
                          : a.status.replace("_", " ")}
                    </p>
                    <Link to={"/ielts/practice/targeted/" + a.id}>
                      {a.status === "submitted"
                        ? "Review saved work"
                        : "View assignment"}
                    </Link>
                  </article>
                ))
            )}
          </section>
        </>
      )}
    </div>
  );
}
