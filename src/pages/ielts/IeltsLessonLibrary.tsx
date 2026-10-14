import {
  lessonFiles,
  lessonGuideVersion,
} from "../../../services/ieltsLessonPlan";
import { lessonProduction } from "../../../services/ieltsLessonPresentation";
import { lessonPowerPoint } from "../../../services/ieltsLessonPowerPoint";
import React, { useEffect, useRef, useState } from "react";
import { zipSync, strToU8 } from "fflate";
import {
  teacherLessonOne,
  lessonAudio,
  lessonStages,
  type TeacherLesson,
  type LessonMaterial,
} from "../../../services/ieltsLessonService";
import {
  downloadLessonFile,
  lessonResourceHtml,
  lessonAudioPlayerHtml,
  lessonStartText,
  type ResourceKind,
} from "../../../services/ieltsLessonResources";
import "../../styles/ielts-lessons.css";
export default function IeltsLessonLibrary({
  schoolId,
  onClose,
  onAssign,
  onProgress,
}: {
  schoolId: string;
  onClose: () => void;
  onAssign: () => void;
  onProgress: () => void;
}) {
  const [data, setData] = useState<TeacherLesson | null>(null),
    [error, setError] = useState(""),
    [retry, setRetry] = useState(0),
    [busy, setBusy] = useState(false),
    [audio, setAudio] = useState<Record<string, string>>({});
  const current = useRef(schoolId),
    lock = useRef(false),
    urls = useRef<string[]>([]),
    players = useRef<Record<string, HTMLAudioElement | null>>({});
  current.current = schoolId;
  useEffect(() => {
    current.current = schoolId;
    let alive = true;
    setData(null);
    setError("");
    setAudio({});
    urls.current.forEach(URL.revokeObjectURL);
    urls.current = [];
    teacherLessonOne(schoolId)
      .then((d) => {
        if (alive) setData(d);
      })
      .catch(() => {
        if (alive)
          setError(
            "The lesson pack could not open. Check your programme access and connection, then retry.",
          );
      });
    return () => {
      alive = false;
      current.current = "";
      Object.values(players.current).forEach((p) => p?.pause());
      urls.current.forEach(URL.revokeObjectURL);
      urls.current = [];
    };
  }, [schoolId, retry]);
  const act = async (fn: () => Promise<void>) => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch {
      if (current.current === schoolId)
        setError(
          "The download could not finish. Please retry. Saved student work is safe.",
        );
    } finally {
      lock.current = false;
      if (current.current === schoolId) setBusy(false);
    }
  };
  const loadAudio = (m: LessonMaterial) =>
    act(async () => {
      const blob = await lessonAudio(m);
      if (current.current !== schoolId) return;
      const url = URL.createObjectURL(blob);
      urls.current.push(url);
      setAudio((old) => ({ ...old, [m.code]: url }));
    });
  const ready = !!data && data.materials.length === 2;
  const resource = (kind: ResourceKind) => {
    if (data && ready)
      downloadLessonFile(
        new Blob([lessonResourceHtml(data, kind)], { type: "text/html" }),
        kind === "start"
          ? lessonFiles.start
          : kind === "backup"
            ? lessonFiles.backup
            : kind === "reading-paper"
              ? lessonFiles.readingPaper
              : kind === "reading-paper-keys"
                ? lessonFiles.readingPaperKeys
                : `${data.lesson_code}-${kind}.html`,
      );
  };
  const bundle = () =>
    act(async () => {
      if (!data || !ready) return;
      const files: Record<string, Uint8Array> = {
        [lessonFiles.start]: strToU8(lessonResourceHtml(data, "start")),
      };
      const pptx = await lessonPowerPoint(data);
      if (current.current !== schoolId) return;
      files["IELTS-01-presentation.pptx"] = new Uint8Array(
        await pptx.arrayBuffer(),
      );
      files["IELTS-01-presentation-static.pptx"] = new Uint8Array(
        await (await lessonPowerPoint(data, true)).arrayBuffer(),
      );
      for (const kind of [
        "plan",
        "students",
        "keys",
        "slides",
      ] as ResourceKind[])
        files[`${data.lesson_code}-${kind}.html`] = strToU8(
          lessonResourceHtml(data, kind),
        );
      for (const m of data.materials) {
        const blob = await lessonAudio(m);
        if (current.current !== schoolId) return;
        files[`${m.display_code}.mp3`] = new Uint8Array(
          await blob.arrayBuffer(),
        );
      }
      files[lessonFiles.backup] = strToU8(lessonResourceHtml(data, "backup"));
      if (data.reading_backup) {
        files[lessonFiles.readingPaper] = strToU8(
          lessonResourceHtml(data, "reading-paper"),
        );
        files[lessonFiles.readingPaperKeys] = strToU8(
          lessonResourceHtml(data, "reading-paper-keys"),
        );
      }
      files[lessonFiles.audio] = strToU8(lessonAudioPlayerHtml(data));
      files["START-HERE.txt"] = strToU8(lessonStartText());
      files["versions.json"] = strToU8(
        JSON.stringify(
          {
            lesson: data.lesson_code,
            version: data.version,
            lesson_bible_version: lessonProduction.bibleVersion,
            presentation_version: lessonProduction.presentationVersion,
            teacher_guide_version: lessonGuideVersion,
            school: data.school,
            reading_backup: data.reading_backup
              ? {
                  code: data.reading_backup.display_code,
                  version: data.reading_backup.version,
                  content_sha256: data.reading_backup.content_sha256,
                  purpose: "guided_practice",
                }
              : null,
            materials: data.materials.map((m) => ({
              code: m.display_code,
              version: m.version,
              content_sha256: m.content_sha256,
              audio_sha256: m.audio_sha256,
            })),
          },
          null,
          2,
        ),
      );
      if (current.current === schoolId)
        downloadLessonFile(
          new Blob([zipSync(files)], { type: "application/zip" }),
          `${data.lesson_code}-teaching-pack.zip`,
        );
    });
  return (
    <section className="ielts-lessons sp-card">
      <button className="sp-secondary" onClick={onClose}>
        ← Today
      </button>
      <p className="sp-eyebrow">Teaching programme</p>
      <h2>Lessons, ready to teach</h2>
      <p>
        Prepare the resources, conduct the lesson and review the saved platform
        work.
      </p>
      {error && (
        <div role="alert">
          <p>{error}</p>
          <button
            className="sp-secondary"
            disabled={busy}
            onClick={() => setRetry((n) => n + 1)}
          >
            Retry lesson pack
          </button>
        </div>
      )}
      {!data && !error && (
        <p role="status">Opening your school’s lesson pack…</p>
      )}
      {data && (
        <>
          <article>
            <p>Lesson 1 · IELTS-01 · 60 minutes</p>
            <h3>Can you beat the IELTS trap?</h3>
            <p>{data.school.name} · Brains Heist materials</p>
            <p>
              Recognise corrections and distractors, explain an answer using
              evidence, and establish a Reading starting point.
            </p>
            {!ready && (
              <p role="status">
                The two released guided Listening materials are not both
                available. Downloads will open when the approved pack is
                available.
              </p>
            )}
            <div className="lesson-actions">
              <button
                className="sp-primary"
                disabled={!ready || busy}
                onClick={() => void bundle()}
              >
                {busy ? "Preparing files…" : "Download complete teaching pack"}
              </button>
              <button className="sp-secondary" onClick={onProgress}>
                Review student progress
              </button>
            </div>
            <button
              className="sp-secondary"
              disabled={!ready || busy}
              onClick={() =>
                void act(async () => {
                  if (data) {
                    const blob = await lessonPowerPoint(data);
                    if (current.current === schoolId)
                      downloadLessonFile(blob, "IELTS-01-presentation.pptx");
                  }
                })
              }
            >
              Download PowerPoint (.pptx)
            </button>
            <button
              className="sp-secondary"
              disabled={!ready || busy}
              onClick={() =>
                void act(async () => {
                  if (data) {
                    const blob = await lessonPowerPoint(data, true);
                    if (current.current === schoolId)
                      downloadLessonFile(
                        blob,
                        "IELTS-01-presentation-static.pptx",
                      );
                  }
                })
              }
            >
              Download motion-free PowerPoint (.pptx)
            </button>
            <p>
              Teacher presentations include guided-practice answers. Advance to
              each reveal after students commit. Keep the decks private before
              listening.
            </p>
            <h3>Start here: which material do I use?</h3>
            <p>
              Open 01-START-HERE.html after extracting the complete pack. It
              gives the exact file, slide, teacher cue and checkpoint for each
              step.
            </p>
            <p>
              <strong>Listening:</strong> use L-003 then L-004.
              Audio-player.html plays the same MP3s included in the ZIP. The
              Listening Screener is a separate assessment.
            </p>
            <p>
              <strong>Reading:</strong> students use the real Reading Screener
              in their own Brains Heist accounts. The workbook contains
              directions only. Reading uses no lesson audio.
            </p>
            <p>
              <strong>Plan B:</strong> if online Reading cannot start, open
              IELTS-01-plan-b.html.{" "}
              {data.reading_backup
                ? "Print the R-001 paper Reading sheet before class and keep its teacher key separate. This is guided practice; the online screener is completed later."
                : "The approved paper Reading fallback is currently unavailable. The Plan B guide provides a quiet workbook activity and a later screener session."}
            </p>
            <h3>Prepare</h3>
            <p>
              Check student access to Reading Screener A and its published
              duration. Bring devices, headphones where needed, printed
              workbooks and the downloaded audio. Record any help or replay.
            </p>
            <div className="lesson-actions">
              {(
                [
                  "start",
                  "plan",
                  "slides",
                  "students",
                  "keys",
                  "backup",
                  "reading-paper",
                  "reading-paper-keys",
                ] as ResourceKind[]
              ).map((kind) => (
                <button
                  key={kind}
                  className="sp-secondary"
                  disabled={
                    !ready ||
                    busy ||
                    ((kind === "reading-paper" ||
                      kind === "reading-paper-keys") &&
                      !data.reading_backup)
                  }
                  onClick={() => resource(kind)}
                >
                  Download{" "}
                  {kind === "start"
                    ? "step-by-step guide (open first)"
                    : kind === "plan"
                      ? "teacher plan"
                      : kind === "slides"
                        ? "presentation"
                        : kind === "students"
                          ? "student workbook"
                          : kind === "backup"
                            ? "Plan B teacher guide"
                            : kind === "reading-paper"
                              ? "paper Reading practice (students)"
                              : kind === "reading-paper-keys"
                                ? "paper Reading key (teacher only)"
                                : "scripts & keys"}{" "}
                  (.html)
                </button>
              ))}
            </div>
            <p>
              Printable files open in a browser. Use Print → Save as PDF. The
              presentation works offline with arrow keys. Keep scripts and keys
              private.
            </p>
            <h3>Conduct the lesson</h3>
            <ol className="lesson-plan">
              {lessonStages.map(([time, title, how]) => (
                <li key={time}>
                  <strong>
                    {time} · {title}
                  </strong>
                  <p>{how}</p>
                </li>
              ))}
            </ol>
            <h3>Approved Listening recordings</h3>
            {data.materials.map((m) => (
              <article key={m.code} className="lesson-audio">
                <h4>
                  {m.display_code} · {m.title}
                </h4>
                <p>Guided practice · Material version {m.version}</p>
                {audio[m.code] ? (
                  <audio
                    controls
                    preload="none"
                    src={audio[m.code]}
                    ref={(node) => {
                      players.current[m.code] = node;
                    }}
                    onPlay={() =>
                      Object.entries(players.current).forEach(([code, p]) => {
                        if (code !== m.code) p?.pause();
                      })
                    }
                  />
                ) : (
                  <button
                    className="sp-secondary"
                    disabled={busy}
                    onClick={() => void loadAudio(m)}
                  >
                    Load recording
                  </button>
                )}
                <button
                  className="sp-secondary"
                  disabled={busy}
                  onClick={() =>
                    void act(async () => {
                      const blob = await lessonAudio(m);
                      if (current.current === schoolId)
                        downloadLessonFile(blob, `${m.display_code}.mp3`);
                    })
                  }
                >
                  Download MP3
                </button>
              </article>
            ))}
            <h3>Student work in Brains Heist</h3>
            <p>
              Students open <strong>/ielts/reading-screener</strong> on their
              own accounts. Their existing Reading answers, submission and
              result stay in IELTS Journey. A teacher should use Student
              progress to check the actual saved result.
            </p>
            <button className="sp-secondary" onClick={onAssign}>
              Open practice assignment tools
            </button>
            <p>
              Targeted practice requires the normal completed source assessment
              and allocation checks. These guided classroom Listening rounds and
              paper reflections are teaching activities; they do not
              automatically create student attempts or prove improvement.
            </p>
          </article>
          <p>
            Lesson 2 will appear after its teaching pack is prepared and
            reviewed.
          </p>
        </>
      )}
    </section>
  );
}
