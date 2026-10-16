// Every case renders production components with synthetic data. No case implies human approval.
export const cases = [
  ...["teacher","school_admin"].flatMap(role => ["batches","course-materials","review-queue"].flatMap(view => ["populated","empty","loading","error"].map(state=>({id:`${view}-${state}-${role}`,surface:view==="batches"?"IeltsCourseBatches":view==="course-materials"?"IeltsBatchCourseMaterials":"IeltsReviewQueue",state,view,role,empty:state==="empty",loading:state==="loading",error:state==="error"})))),
  ...["teacher","school_admin"].flatMap(role => ["populated","empty","loading","error"].map(state => ({id:`lessons-${state}-${role}`,surface:"IeltsLessonLibrary",state,view:"lessons",role,empty:state==="empty",loading:state==="loading",error:state==="error"}))),
  ...["assigned","journey"].flatMap(view => ["populated","empty","loading","error"].map(state => ({id:`${view}-${state}`,surface:view==="assigned"?"IeltsAssignedPractice":"IeltsJourneyDashboard",state,view,role:"student",empty:state==="empty",loading:state==="loading",error:state==="error"}))),
  { id: "dialog", surface: "IeltsUi", state: "confirmation", view: "shared" },
  { id: "shared-error", surface: "IeltsUi", state: "error", view: "shared" },
  ...["reading", "listening", "writing"].flatMap((skill) => [
    {
      id: `${skill}-active`,
      surface: "IeltsExamMode",
      state: `${skill}-active`,
      view: "exam",
      skill,
    },
    {
      id: `${skill}-paused`,
      surface: "IeltsExamMode",
      state: `${skill}-paused`,
      view: "exam",
      skill,
    },
    {
      id: `${skill}-error`,
      surface: "IeltsExamMode",
      state: `${skill}-error`,
      view: "exam",
      skill,
    },
  ]),
  {
    id: "reading-passage-2",
    surface: "IeltsExamMode",
    state: "reading-passage-2",
    view: "exam",
    skill: "reading",
  },
  {
    id: "reading-confirm",
    surface: "IeltsExamMode",
    state: "reading-confirmation",
    view: "exam",
    skill: "reading",
  },
  ...["complete", "partial", "empty"].flatMap((coverage) =>
    ["student", "teacher", "school_admin"].map((role) => ({
      id: `result-${coverage}-${role}`,
      role,
      surface: "IeltsGovernedScreenerResult",
      state:
        coverage === "empty"
          ? "empty"
          : coverage === "complete"
            ? "populated"
            : "partial",
      view: "result",
      coverage,
    })),
  ),
  {
    id: "result-error",
    surface: "IeltsGovernedScreenerResult",
    state: "error",
    view: "result",
    error: true,
  },
  {
    id: "result-loading",
    surface: "IeltsGovernedScreenerResult",
    state: "loading",
    view: "result",
    loading: true,
  },
  ...["overview", "students", "reviews", "team"].flatMap((section) =>
    ["teacher", "school_admin"].map((role) => ({
      id: `programme-${section}-${role}`,
      surface: "IeltsProgrammeWorkspace",
      state: section,
      view: "programme",
      section,
      role,
    })),
  ),
  {
    id: "programme-empty",
    surface: "IeltsProgrammeWorkspace",
    state: "empty",
    view: "programme",
    section: "students",
    role: "teacher",
    empty: true,
  },
  {
    id: "programme-error",
    surface: "IeltsProgrammeWorkspace",
    state: "error",
    view: "programme",
    role: "teacher",
    error: true,
  },
  {
    id: "programme-loading",
    surface: "IeltsProgrammeWorkspace",
    state: "loading",
    view: "programme",
    role: "teacher",
    loading: true,
  },
  ...["populated", "empty", "loading", "error"].map((state) => ({
    id: `hub-${state}`,
    surface: "IeltsScreenerHub",
    state,
    view: "hub",
    empty: state === "empty",
    loading: state === "loading",
    error: state === "error",
  })),
];
export const viewports = [
  { name: "phone", width: 375, height: 812 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "desktop", width: 1440, height: 1000 },
];
export const modes = ["normal", "performance"];
export const browsers = ["chromium", "webkit"];
