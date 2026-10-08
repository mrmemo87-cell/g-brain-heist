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
import "../../styles/ielts-learning.css";
const pilot = "b30e9c28-96f1-4d34-83e9-9b28b4926f42";
export default function IeltsLearningTeacher({
  schoolId,
  reviewOnly = false,
}: {
  schoolId: string;
  reviewOnly?: boolean;
}) {
  const [data, setData] = useState<LearningWorkspace | null>(null),
    [student, setStudent] = useState<ProgrammeStudent | null>(null);
  const [task, setTask] = useState(""),
    [reason, setReason] = useState(""),
    [notes, setNotes] = useState(""),
    [confirmed, setConfirmed] = useState(false),
    [message, setMessage] = useState("Loading targeted practice…"),
    [busy, setBusy] = useState(false),
    [retry, setRetry] = useState(0);
  const request = useRef(crypto.randomUUID()),
    scope = useRef(schoolId);
  scope.current = schoolId;
  useEffect(() => {
    let active = true;
    setData(null);
    setStudent(null);
    setConfirmed(false);
    setNotes("");
    setMessage("Loading targeted practice…");
    Promise.all([
      learningWorkspace(schoolId),
      reviewOnly
        ? Promise.resolve({ students: [] as ProgrammeStudent[] })
        : programmeWorkspace(schoolId, "Gulzada"),
    ])
      .then(([w, p]) => {
        if (active) {
          setData(w);
          setStudent(p.students.find((s) => s.id === pilot) ?? null);
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
  const selected = data?.tasks.find((t) => t.code === task),
    skill = selected?.skill ?? "listening",
    source = student?.[skill],
    sourceRoute = programmeEvidenceRoute(skill, source ?? null);
  const sourceReady =
    !!source &&
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
      <p className="il-eyebrow">FOUR SKILLS · NAMED-STUDENT PILOT</p>
      <h2>
        {reviewOnly
          ? "Targeted practice reviews"
          : "Choose a purposeful next step"}
      </h2>
      <p>
        Gulzada’s delivery pilot: review the task, connect the matching screener
        evidence and explain why it is useful. These tasks do not automatically
        create a band estimate or improvement label.
      </p>
      {message && <p role="status">{message}</p>}
      {!data && (
        <button onClick={() => setRetry((n) => n + 1)}>
          Retry loading practice
        </button>
      )}
      {data && (
        <>
          {!reviewOnly && (
            <section className="il-card">
              <p>
                <strong>Student:</strong>{" "}
                {student?.name ?? "Pilot student unavailable"}
              </p>
              <label className="il-answer">
                Task
                <select
                  value={task}
                  onChange={(e) => {
                    setTask(e.target.value);
                    setConfirmed(false);
                    setNotes("");
                    request.current = crypto.randomUUID();
                  }}
                >
                  {data.tasks.map((t) => (
                    <option key={t.code} value={t.code}>
                      {t.skill ?? "listening"} · {t.title} ·{" "}
                      {t.purpose === "guided_practice"
                        ? "Guided practice"
                        : "Fresh check"}
                    </option>
                  ))}
                </select>
              </label>
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
                  {approved && <p>Material ready for pilot assignment.</p>}
                </>
              )}
              <label className="il-answer">
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
                      setMessage(
                        "Assigned. Gulzada can open this task from her IELTS Journey.",
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
                      {a.student_name} · {a.title}
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
