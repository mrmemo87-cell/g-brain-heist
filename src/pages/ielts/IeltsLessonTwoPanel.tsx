import React, { useState } from "react";
import type { TeacherLessonTwo } from "../../../services/ieltsLessonTwoService";
import { lessonTwoFiles, lessonTwoZip } from "../../../services/ieltsLessonTwoResources";
import { downloadLessonFile } from "../../../services/ieltsLessonResources";

export default function IeltsLessonTwoPanel({ pack, onProgress }:{
  pack:TeacherLessonTwo;
  onProgress:()=>void;
}) {
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  function download(name:string){
    if(busy)return;
    setError("");setBusy(true);
    try {
      const bytes=lessonTwoFiles(pack)[name];
      if(!bytes)throw Error("file_unavailable");
      downloadLessonFile(new Blob([bytes],{type:"text/html;charset=utf-8"}),name.split("/").pop()||name);
    } catch {setError("The file could not be prepared. Retry after refreshing your school workspace.");}
    finally{setBusy(false);}
  }
  function fullPack(){
    if(busy)return;
    setBusy(true);setError("");
    try{downloadLessonFile(lessonTwoZip(pack),"IELTS-02-Silk-Road-teacher-pack.zip");}
    catch{setError("The offline teaching pack could not be generated. Please retry.");}
    finally{setBusy(false);}
  }
  return <article className="lesson-overview" aria-labelledby="ielts-lesson-two-title">
    <div className="lesson-overview-head">
      <div>
        <div className="lesson-badges">
          <span className="lesson-available">Teacher-only release</span>
          <span>IELTS-02</span><span>60 minutes</span>
        </div>
        <h3 id="ielts-lesson-two-title">{pack.content.title}</h3>
        <p className="lesson-muted">{pack.school.name} · Reading evidence, paragraph development and speaking</p>
      </div>
    </div>
    <p className="lesson-objective">Guided post-screener classroom teaching. No recording required.</p>
    <div className="lesson-primary-actions">
      <button type="button" className="sp-primary" disabled={busy} onClick={fullPack}>
        {busy?"Preparing…":"Download IELTS-02 teaching pack (.zip)"}
      </button>
      <button type="button" className="sp-secondary" onClick={onProgress}>Review student progress</button>
    </div>
    <p className="lesson-resource-note">This printable HTML edition contains a four-page student workbook, homework, catch-up, teacher plan, keys, planning forms, private follow-up and an interactive 17-slide offline presentation. Open HTML files and choose Print → Save as PDF. Native PowerPoint and pre-rendered PDF files are not included in this edition.</p>
    <div className="lesson-resource-grid">
      <section className="lesson-resource-group">
        <h4>Students · print without keys</h4>
        <div className="lesson-resource-actions">
          <button type="button" className="sp-secondary" disabled={busy} onClick={()=>download("Students/workbook.html")}>Student workbook (HTML)</button>
          <button type="button" className="sp-secondary" disabled={busy} onClick={()=>download("Students/homework.html")}>Homework (HTML)</button>
          <button type="button" className="sp-secondary" disabled={busy} onClick={()=>download("Students/catch-up.html")}>Late-joiner catch-up (HTML)</button>
        </div>
      </section>
      <section className="lesson-resource-group lesson-resource-private">
        <h4>Teacher only · answers and lesson plan</h4>
        <div className="lesson-resource-actions">
          <button type="button" className="sp-secondary" disabled={busy} onClick={()=>download("Teacher-private/presentation.html")}>17-slide offline presentation</button>
          <button type="button" className="sp-secondary" disabled={busy} onClick={()=>download("Teacher-private/guide.html")}>Teacher guide (HTML)</button>
          <button type="button" className="sp-secondary" disabled={busy} onClick={()=>download("Teacher-private/keys.html")}>Private keys and models (HTML)</button>
          <button type="button" className="sp-secondary" disabled={busy} onClick={()=>download("Teacher-private/planning.html")}>Planning and review (HTML)</button>
          <button type="button" className="sp-secondary" disabled={busy} onClick={()=>download("Teacher-private/fresh-check.html")}>Withheld fresh check (HTML)</button>
        </div>
        <p className="lesson-resource-note">Do not give students the teacher files or fresh-transfer check in advance. Work done on paper is not automatically saved to IELTS Journey.</p>
      </section>
    </div>
    <details className="lesson-details">
      <summary>60-minute Lesson 2 teaching sequence</summary>
      <ol className="lesson-plan">{pack.content.stages.map(s=><li key={s.start}>
        <strong>{s.start}–{s.end} min · {s.title}</strong><p>{s.teacher}</p>
      </li>)}</ol>
    </details>
    {error&&<p role="alert" className="lesson-alert">{error}</p>}
  </article>;
}
