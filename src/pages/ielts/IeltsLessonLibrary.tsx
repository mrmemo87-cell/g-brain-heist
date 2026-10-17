import { lessonOneTitle } from "../../../services/ieltsCourseCatalog";
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
import { teacherLessonTwo, type TeacherLessonTwo } from "../../../services/ieltsLessonTwoService";
import IeltsLessonTwoPanel from "./IeltsLessonTwoPanel";
import IeltsTeacherDisclosure from "../../components/ielts/IeltsTeacherDisclosure";
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
  const [lessonTwo, setLessonTwo] = useState<TeacherLessonTwo | null>(null);
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
    setLessonTwo(null);
    teacherLessonTwo(schoolId).then((lesson) => { if (alive) setLessonTwo(lesson); }).catch(() => { if (alive) setLessonTwo(null); });
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
    <section className="ielts-lessons sp-card" aria-labelledby="ielts-lessons-title">
      <header className="lesson-library-header">
        <button type="button" className="sp-secondary" onClick={onClose}>← Today</button>
        <div>
          <p className="sp-eyebrow">IELTS teaching programme</p>
          <h2 id="ielts-lessons-title">Lesson library</h2>
          <p className="lesson-muted">Teaching packs and classroom resources, in one place.</p>
        </div>
      </header>
      {error && (
        <div role="alert" className="lesson-alert">
          <p>{error}</p>
          <button type="button" className="sp-secondary" disabled={busy} onClick={() => setRetry((n) => n + 1)}>
            Retry lesson pack
          </button>
        </div>
      )}
      {!data && !error && <p role="status">Opening your school’s lesson pack…</p>}
      {data && (
        <div className="lesson-library-content">
          <IeltsTeacherDisclosure title={"Lesson 01 · " + lessonOneTitle} hint="Lesson essentials, outcomes and quick teaching actions" icon="✦" marker="60 min" defaultExpanded>
          <article className="lesson-overview" aria-labelledby="lesson-one-title">
            <div className="lesson-overview-head">
              <div>
                <div className="lesson-badges">
                  <span className="lesson-available">Available to teach</span>
                  <span>{data.lesson_code}</span>
                  <span>60 minutes</span>
                </div>
                <h3 id="lesson-one-title">{lessonOneTitle}</h3>
                <p className="lesson-muted">{data.school.name} · Guided Listening and a Reading starting point</p>
              </div>
            </div>
            <p className="lesson-objective">Focus: corrections, distractors and answers supported by evidence.</p>
            {!ready && (
              <p role="status" className="lesson-alert">
                The approved Listening materials are incomplete. Teaching-pack downloads are unavailable until both are released.
              </p>
            )}
            <div className="lesson-primary-actions">
              <button type="button" className="sp-primary" disabled={!ready || busy} onClick={() => void bundle()}>
                {busy ? "Preparing files…" : "Download complete teaching pack"}
              </button>
              <button type="button" className="sp-secondary" onClick={onProgress}>Review student progress</button>
              <button type="button" className="sp-secondary" onClick={onAssign}>Open practice assignment tools</button>
            </div>
          </article>
          </IeltsTeacherDisclosure>

          <IeltsTeacherDisclosure title="Lesson resources" hint="Prepare, present, share student files and keep teacher keys safe" icon="▤" defaultExpanded>
          <section className="lesson-library-resources" aria-labelledby="lesson-resources-title">
            <div className="lesson-section-heading">
              <h3 id="lesson-resources-title">Lesson resources</h3>
              <p className="lesson-muted">Pick what you need. Teacher-only files contain answers.</p>
            </div>
            <div className="lesson-resource-grid">
              <IeltsTeacherDisclosure title="01 · Before class" hint="Teacher plan and step-by-step setup" icon="▣" marker="2 files" defaultExpanded>
              <section className="lesson-resource-group" aria-labelledby="lesson-prep-title">
                <h4 id="lesson-prep-title">01 · Before class</h4>
                <div className="lesson-resource-actions">
                  <button type="button" className="sp-secondary" disabled={!ready || busy} onClick={() => resource("start")}>Download step-by-step guide (HTML)</button>
                  <button type="button" className="sp-secondary" disabled={!ready || busy} onClick={() => resource("plan")}>Download teacher plan (HTML)</button>
                </div>
              </section>
              </IeltsTeacherDisclosure>
              <IeltsTeacherDisclosure title="02 · Present" hint="Slides and PowerPoint teaching tools" icon="▤" marker="3 files" defaultExpanded>
              <section className="lesson-resource-group" aria-labelledby="lesson-present-title">
                <h4 id="lesson-present-title">02 · Present</h4>
                <div className="lesson-resource-actions">
                  <button
                    type="button"
                    className="sp-secondary"
                    disabled={!ready || busy}
                    onClick={() => void act(async () => {
                      const blob = await lessonPowerPoint(data);
                      if (current.current === schoolId) downloadLessonFile(blob, "IELTS-01-presentation.pptx");
                    })}
                  >Download PowerPoint (.pptx)</button>
                  <button
                    type="button"
                    className="sp-secondary"
                    disabled={!ready || busy}
                    onClick={() => void act(async () => {
                      const blob = await lessonPowerPoint(data, true);
                      if (current.current === schoolId) downloadLessonFile(blob, "IELTS-01-presentation-static.pptx");
                    })}
                  >Download motion-free PowerPoint (.pptx)</button>
                  <button type="button" className="sp-secondary" disabled={!ready || busy} onClick={() => resource("slides")}>Download offline presentation (HTML)</button>
                </div>
                <p className="lesson-resource-note">Teacher only: slides contain answer reveals. Advance manually after students commit.</p>
              </section>
              </IeltsTeacherDisclosure>
              <IeltsTeacherDisclosure title="03 · Give students" hint="Shareable student workbook and Reading practice" icon="▧" marker="2 files" defaultExpanded={false}>
              <section className="lesson-resource-group" aria-labelledby="lesson-students-title">
                <h4 id="lesson-students-title">03 · Give students</h4>
                <div className="lesson-resource-actions">
                  <button type="button" className="sp-secondary" disabled={!ready || busy} onClick={() => resource("students")}>Download student workbook (HTML)</button>
                  <button type="button" className="sp-secondary" disabled={!ready || busy || !data.reading_backup} onClick={() => resource("reading-paper")}>
                    Download paper Reading practice (HTML)
                  </button>
                </div>
                {!data.reading_backup && <p className="lesson-resource-note">Approved paper Reading backup is unavailable.</p>}
                <p className="lesson-resource-note">Student files exclude teacher answers. Print from the browser if needed.</p>
              </section>
              </IeltsTeacherDisclosure>
              <IeltsTeacherDisclosure title="04 · Teacher only" hint="Private scripts, answer keys and backup" icon="◆" marker="3 files" defaultExpanded={false}>
              <section className="lesson-resource-group lesson-resource-private" aria-labelledby="lesson-keys-title">
                <h4 id="lesson-keys-title">04 · Teacher only</h4>
                <div className="lesson-resource-actions">
                  <button type="button" className="sp-secondary" disabled={!ready || busy} onClick={() => resource("keys")}>Download scripts &amp; keys (HTML)</button>
                  <button type="button" className="sp-secondary" disabled={!ready || busy || !data.reading_backup} onClick={() => resource("reading-paper-keys")}>
                    Download paper Reading key (HTML)
                  </button>
                  <button type="button" className="sp-secondary" disabled={!ready || busy} onClick={() => resource("backup")}>Download Plan B teacher guide (HTML)</button>
                </div>
                <p className="lesson-resource-note">Keep answer keys and listening scripts private.</p>
              </section>
              </IeltsTeacherDisclosure>
            </div>
          </section>
          </IeltsTeacherDisclosure>

          <IeltsTeacherDisclosure title="Approved Listening audio" hint="Listen or download L-003 and L-004; no autoplay" icon="♫" defaultExpanded={false} onToggle={(expanded) => { if (!expanded) Object.values(players.current).forEach((player) => player?.pause()); }}>
          <section className="lesson-audio-section" aria-labelledby="lesson-audio-title">
            <div className="lesson-section-heading">
              <h3 id="lesson-audio-title">Approved Listening audio</h3>
              <p className="lesson-muted">Play in order: L-003, then L-004. No autoplay.</p>
            </div>
            <div className="lesson-audio-grid">
              {data.materials.map((m) => (
                <article key={m.code} className="lesson-audio">
                  <div className="lesson-audio-heading">
                    <h4>{m.display_code} · {m.title}</h4>
                    <span>Guided practice · v{m.version}</span>
                  </div>
                  {audio[m.code] ? (
                    <audio
                      controls
                      preload="none"
                      src={audio[m.code]}
                      aria-label={m.display_code + " approved Listening recording"}
                      ref={(node) => { players.current[m.code] = node; }}
                      onPlay={() => Object.entries(players.current).forEach(([code, p]) => {
                        if (code !== m.code) p?.pause();
                      })}
                    />
                  ) : (
                    <button type="button" className="sp-secondary" disabled={busy} onClick={() => void loadAudio(m)}>Load recording</button>
                  )}
                  <button type="button" className="sp-secondary" disabled={busy} onClick={() => void act(async () => {
                    const blob = await lessonAudio(m);
                    if (current.current === schoolId) downloadLessonFile(blob, m.display_code + ".mp3");
                  })}>Download MP3</button>
                </article>
              ))}
            </div>
          </section>
          </IeltsTeacherDisclosure>

          <IeltsTeacherDisclosure title="Teaching sequence & contingencies" hint="Minute-by-minute plan, preparation, Reading and backup" icon="◷" defaultExpanded={false}>
          <section className="lesson-library-guidance" aria-label="Optional lesson instructions">
            <details className="lesson-details">
              <summary>60-minute teaching sequence</summary>
              <ol className="lesson-plan">
                {lessonStages.map(([time, title, how]) => (
                  <li key={time}><strong>{time} · {title}</strong><p>{how}</p></li>
                ))}
              </ol>
            </details>
            <details className="lesson-details">
              <summary>Preparation, Reading &amp; backup</summary>
              <div className="lesson-instructions">
                <h4>Before class</h4>
                <p>Open the step-by-step guide first. Check student access to Reading Screener A and its published duration. Prepare devices, headphones, workbooks and approved audio.</p>
                <h4>Listening</h4>
                <p>Use L-003, then L-004. Students read the questions before playback. Keep answers hidden until each response is committed. Record help and replays.</p>
                <h4>Reading</h4>
                <p>Students complete the governed Reading Screener in their own accounts. It is separate from guided classroom work. Open Student progress to inspect saved results.</p>
                <h4>Plan B</h4>
                <p>{data.reading_backup
                  ? "If online Reading is unavailable, use the printable R-001 guided practice sheet and keep its teacher key separate. Complete the independent online screener later."
                  : "The paper Reading backup is not released. Use the Plan B teacher guide and arrange the independent screener later."}</p>
                <p>Classroom practice and paper work do not automatically create platform attempts, improvement claims or IELTS band estimates. Targeted assignments still require their normal eligibility and prior-exposure checks.</p>
              </div>
            </details>
          </section>
          </IeltsTeacherDisclosure>
          {lessonTwo ? (
            <IeltsTeacherDisclosure title={"Lesson 02 · " + lessonTwo.content.title} hint="Open the next approved lesson pack and classroom resources" icon="✦" defaultExpanded={false}>
              <IeltsLessonTwoPanel pack={lessonTwo} onProgress={onProgress} />
            </IeltsTeacherDisclosure>
          ) : <p className="lesson-library-upcoming"><strong>Next lesson:</strong> IELTS-02 is not released for this school.</p>}
        </div>
      )}
    </section>
  );
}
