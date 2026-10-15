import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { scenario, id } from "./client";
import "../../../src/index.css";
import "../../../src/styles/light-mode.css";
import "../../../src/styles/platform-light-theme.css";
import "../../../src/styles/ielts-experience.css";
import Exam from "../../../src/pages/ielts/IeltsExamMode";
import Result from "../../../src/pages/ielts/IeltsGovernedScreenerResult";
import Programme from "../../../src/pages/ielts/IeltsProgrammeWorkspace";
import Hub from "../../../src/components/ielts/IeltsScreenerHub";
import {
  IeltsButton,
  IeltsConfirm,
  IeltsNotice,
} from "../../../src/components/ielts/IeltsUi";
function Shared() {
  const [open, setOpen] = useState(scenario.id === "dialog");
  return (
    <main className="ix-workspace">
      <h1>IELTS next step</h1>
      <IeltsNotice error={scenario.state === "error"}>
        Your saved answers are safe. Review the next step before continuing.
      </IeltsNotice>
      <IeltsButton onClick={() => setOpen(true)}>Open confirmation</IeltsButton>
      {open && (
        <IeltsConfirm
          title="Submit with unanswered questions?"
          action="Submit incomplete work"
          busy={false}
          onCancel={() => setOpen(false)}
          onConfirm={() => setOpen(false)}
        >
          <p>
            Six questions are unanswered. Cancel to continue while time remains.
          </p>
          <p>
            Reading: 6 of 12 answered. Missing responses do not show inability.
          </p>
        </IeltsConfirm>
      )}
    </main>
  );
}
const mode = new URLSearchParams(location.search).get("mode");
if (mode === "performance") document.body.classList.add("light-mode");
const route =
  scenario.view === "exam"
    ? `/ielts/exam/${id(10)}`
    : scenario.view === "result"
      ? `/ielts/screener-result/${id(5)}`
      : scenario.view === "programme"
        ? "/ielts/programme"
        : "/ielts";
history.replaceState(
  null,
  "",
  `${route}?programmeSection=${scenario.section ?? "overview"}`,
);
const element =
  scenario.view === "exam" ? (
    <Exam />
  ) : scenario.view === "result" ? (
    <Result />
  ) : scenario.view === "programme" ? (
    <Programme schoolId={id(2)} />
  ) : scenario.view === "hub" ? (
    <Hub />
  ) : (
    <Shared />
  );
const template =
  scenario.view === "exam"
    ? "/ielts/exam/:examEventId"
    : scenario.view === "result"
      ? "/ielts/screener-result/:attemptId"
      : route;
createRoot(document.getElementById("root")!).render(
  <div className="bh-ielts-experience" data-ielts-route={template}>
    <RouterProvider
      router={createBrowserRouter([{ path: template, element }])}
    />
  </div>,
);
(window as any).__visualMounted = true;
