import React, { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  learningWorkspace,
  allocateLearning,
  type LearningWorkspace,
} from "../../../services/ieltsLearningService";
import {
  programmeWorkspace,
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
    [message, setMessage] = useState("Loading reviewed practice…"),
    [busy, setBusy] = useState(false);
  const request = useRef(crypto.randomUUID());
  useEffect(() => {
    let active = true;
    setData(null);
    setStudent(null);
    Promise.all([
      learningWorkspace(schoolId),
      reviewOnly ? Promise.resolve({students: [] as ProgrammeStudent[]}) : programmeWorkspace(schoolId, "Gulzada"),
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
  }, [schoolId, reviewOnly]);
  return (
    <div className="il-shell">
      <p className="il-eyebrow">REVIEWED LISTENING · NAMED-STUDENT PILOT</p>
      <h2>{reviewOnly ? "Listening practice reviews" : "Choose a purposeful next step"}</h2>
      <p>
        These tasks are available for Gulzada’s delivery pilot. Choose the task,
        inspect her source evidence and explain the purpose. A practice result
        does not automatically create a band estimate or improvement label.
      </p>
      {message && <p role="status">{message}</p>}
      {data && (
        <>
          {!reviewOnly && <section className="il-card">
            <p>
              <strong>Student:</strong>{" "}
              {student?.name ?? "Pilot student unavailable"}
            </p>
            {student?.listening && (
              <Link
                to={"/ielts/screener-result/" + student.listening.attempt_id}
              >
                Review Listening source evidence →
              </Link>
            )}
            <label className="il-answer">
              Task
              <select
                value={task}
                onChange={(e) => {
                  setTask(e.target.value);
                  request.current = crypto.randomUUID();
                }}
              >
                {data.tasks.map((t) => (
                  <option key={t.code} value={t.code}>
                    {t.title} ·{" "}
                    {t.purpose === "guided_practice"
                      ? "Guided practice"
                      : "Independent check"}
                  </option>
                ))}
              </select>
            </label>
            <p>
              <strong>Success looks like:</strong>{" "}
              {data.tasks.find((t) => t.code === task)?.success_description}
            </p>
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
                !student?.listening ||
                reason.trim().length < 10 ||
                !task
              }
              onClick={async () => {
                if (!student?.listening) return;
                setBusy(true);
                try {
                  await allocateLearning(
                    schoolId,
                    student.id,
                    task,
                    student.listening.attempt_id,
                    reason,
                    request.current,
                  );
                  setData(await learningWorkspace(schoolId));
                  setMessage(
                    "Assigned. Gulzada can open this task from her IELTS Journey.",
                  );
                } catch (e) {
                  setMessage(
                    e instanceof Error
                      ? e.message
                      : "Assignment could not be confirmed.",
                  );
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? "Assigning…" : "Confirm and assign"}
            </button>
          </section>}
          <section className="il-card">
            <h3>Assigned work and reviews</h3>
            {data.allocations.filter(a => !reviewOnly || a.status === "submitted").length === 0 ? (
              <p>No targeted practice assigned yet.</p>
            ) : (
              data.allocations.filter(a => !reviewOnly || a.status === "submitted").map((a) => (
                <article key={a.id}>
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
