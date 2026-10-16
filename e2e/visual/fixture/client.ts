import { cases } from "../cases.mjs";
export const scenario: any = cases.find(
  (c) => c.id === new URLSearchParams(location.search).get("case"),
);
if (!scenario) throw Error("Unknown visual fixture");
(window as any).__visualUnexpected = [];
export const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const now = "2026-10-15T09:00:00.000Z";
const role = scenario.role ?? "student";
const user = {
  id: id(1),
  username: "Synthetic learner",
  role,
  is_admin: false,
  school_id: id(2),
};
const school = {
  id: id(2),
  name: "Synthetic School",
  can_allocate: role === "school_admin",
  can_manage: true,
};
export const catalog = ["reading", "listening", "writing"].map((skill, i) => ({
  code: `bh-${skill}-screener-a`,
  title: `${skill} Screener A`,
  exam_event_id: id(10 + i),
  assignment_id: null,
  attempt_id: null,
  status: "ready",
  duration_minutes: 20,
  starts_at: now,
}));
export const point = {
  student_name: "Synthetic learner",
  school_managed: true,
  catalog: scenario.empty ? [] : catalog,
  results: {},
  speaking_available: !scenario.empty,
  confidence: "low",
  readiness_available: false,
  band_estimate: null,
};
const skill = scenario.skill ?? "reading";
const payload =
  skill === "reading"
    ? {
        assessment_mode: "screener",
        title: "Academic Reading starting point",
        instructions: "Read both passages and answer all 12 questions.",
        passages: [1, 2].map((n) => ({
          id: `p${n}`,
          title:
            n === 1
              ? "A library for the whole community"
              : "A new way to travel",
          paragraphs: [
            {
              label: "A",
              text: "This synthetic passage is used only to check page layout, navigation and readability. The library welcomed visitors from different parts of the city. Volunteers helped readers find books and use the study rooms.",
            },
            {
              label: "B",
              text: "A second paragraph gives enough text to examine line length and spacing on a small screen. No assessment scores or learning conclusions are produced from this visual fixture.",
            },
          ],
        })),
        questions: Array.from({ length: 12 }, (_, i) => ({
          id: `q${i + 1}`,
          passage_id: i < 6 ? "p1" : "p2",
          prompt: `Synthetic statement ${i + 1}: the community used the library throughout the week.`,
          type: "multiple_choice",
          options: ["TRUE", "FALSE", "NOT GIVEN"],
        })),
      }
    : skill === "writing"
      ? {
          assessment_mode: "screener",
          task_type: "academic_task2",
          minimum_words: 250,
          questions: [
            {
              id: "essay",
              type: "essay",
              prompt:
                "Some people believe schools should provide more opportunities for creative activities. Discuss both views and give your own opinion.",
            },
          ],
        }
      : {
          assessment_mode: "screener",
          title: "Listening starting point",
          audio_url: "https://visual.invalid/tone.wav",
          instructions:
            "Read the questions, then listen. This is synthetic test audio.",
          questions: Array.from({ length: 12 }, (_, i) => ({
            id: `q${i + 1}`,
            prompt: `Synthetic listening question ${i + 1}: complete the missing detail.`,
            type: "short_answer",
          })),
        };
const who = {
  allowed: true,
  reason: "ok",
  assignment_id: id(4),
  attempt_id: id(5),
  status: "in_progress",
  attempt_status: "in_progress",
  event_status: scenario.id.endsWith("-paused") ? "paused" : "live",
  starts_at: "2026-10-15T08:00:00Z",
  ends_at: "2026-10-15T09:20:00Z",
  server_now: now,
  remaining_seconds: 1200,
  drafts: [],
  form_public_payload: { [`${skill}_payload`]: payload },
};
const answered =
  scenario.coverage === "empty" ? 0 : scenario.coverage === "partial" ? 6 : 12;
const result = {
  label: "Screener result",
  raw_score: answered === 0 ? 0 : 5,
  marks_possible: 12,
  confidence: {
    level: "low",
    items_answered: answered,
    items_possible: 12,
    constructs_sampled: 8,
    constructs_with_responses: answered === 0 ? 0 : 4,
  },
  warnings: [
    "This short check does not establish an IELTS band or a persistent weakness.",
  ],
  integrity_state: "unreviewed",
  next_step:
    "Review the sampled items with your teacher, then gather evidence in the remaining skills.",
  readiness_available: false,
  persistent_weakness_available: false,
};
async function rpc(name: string, args: any = {}) {
  if (scenario.loading) return new Promise(() => {});
  if (scenario.error || scenario.id.endsWith("-error"))
    return { data: null, error: { message: "Synthetic connection error" } };
  let data: any;
  switch (name) {
    case "rpc_ielts_exam_whoami":
    case "rpc_ielts_exam_status":
      data = who;
      break;
    case "rpc_ielts_start_attempt":
      data = { ...who, lock_token: "synthetic-lock" };
      break;
    case "rpc_ielts_autosave_attempt":
      data = { draft_version: args.p_draft_version, server_now: now };
      break;
    case "rpc_ielts_log_incident":
      data = { incident_id: id(9) };
      break;
    case "rpc_ielts_diagnostic_result":
      data = result;
      break;
    case "rpc_ielts_starting_point_summary":
      data = point;
      break;
    case "rpc_ielts_programme_access":
      data = { platform_owner: false, schools: [school] };
      break;
    case "rpc_ielts_programme_workspace":
      data = {
        schools: [school],
        school_id: id(2),
        platform_owner: false,
        can_allocate: school.can_allocate,
        can_manage: true,
        lead: {
          id: id(7),
          teacher_id: id(8),
          name: "Synthetic teacher",
          active: true,
        },
        teachers: school.can_allocate
          ? [{ id: id(8), name: "Synthetic teacher" }]
          : [],
        students: scenario.empty
          ? []
          : [
              {
                id: id(1),
                name: "Synthetic learner with a longer name",
                listening: {
                  attempt_id: id(5),
                  raw_score: 5,
                  total: 12,
                  items_answered: 6,
                },
                reading: null,
                writing: null,
                speaking: null,
              },
            ],
        total_students: scenario.empty ? 0 : 1,
        pending_count: 0,
        queue: [],
        classes: [],
        confidence: "low",
        readiness_available: false,
      };
      break;
    case "rpc_ielts_teacher_programme_entry":
      data = { schools: [school] };
      break;
    case "rpc_ielts_learning_workspace":
      data = { manager: true, pilot_only: false, tasks: [], allocations: [] };
      break;
    case "rpc_ielts_teacher_lesson_one":
      data={school:{id:id(2),name:"Synthetic School",logo_url:null},lesson_code:"IELTS-01",version:"1.1.0",materials:scenario.empty?[]:[3,4].map(n=>({code:`bh-ielts-targeted-listening-l${n}-v1`,display_code:`L-00${n}`,title:"Synthetic guided listening",version:"0.1.0",content_sha256:"a".repeat(64),instructions:"Read the synthetic questions before listening.",teacher_notes:"Synthetic teacher notes",questions:Array.from({length:6},(_,i)=>({id:`q${i+1}`,prompt:`Synthetic day ${i+1}`,accepted_answers:["synthetic"]})),audio_bucket:"synthetic",audio_path:"synthetic",audio_sha256:"a".repeat(64)}))};
      break;
    case "rpc_ielts_teacher_lesson_two":
      data=null; // A scoped unavailable state, not a fabricated Lesson 2 release.
      break;
    case "rpc_ielts_student_journey":
      data={student_id:id(1),target_band:7,current_estimates:{reading:null,listening:null,writing:null,speaking:null,overall:null},confidence_level:"low",assigned_practice:[],completed_practice:[],teacher_feedback:[],recent_exam_mode_submissions:[],assigned_practice_summary:{total:0,assigned:0,in_progress:0,completed:0,overdue:0},recent_practice:[],weak_skill:null,next_recommendation:null};
      break;
    case "rpc_ielts_practice_student_assignments":
      data=scenario.empty?[]:[{id:id(60),school_id:id(2),class_id:id(61),assigned_by:id(7),title:"Synthetic reading and writing practice",description:"Practise locating evidence, then explain an example.",status:"assigned",student_status:"in_progress",due_at:"2026-10-20T09:00:00Z",created_at:now,updated_at:now,class_name:"Synthetic Class",item_count:2,items:[{id:id(62),assignment_id:id(60),skill:"reading",content_type:"ielts_reading_set",content_id:"101",title:"Synthetic reviewed reading",display_code:"R-008",required:true,order_index:1,created_at:now},{id:id(63),assignment_id:id(60),skill:"writing",content_type:"ielts_writing_task",content_id:"102",title:"Synthetic paragraph practice",display_code:"W-004",required:true,order_index:2,created_at:now}]}];
      break;
    case "rpc_school_admin_my_capabilities":
    case "school_admin_get_my_capabilities":
    case "school_admin_get_my_allocation_capabilities":
      data={success:true,school_id:id(2),user_id:id(1),role:"student",can_administer:false};break;
    case "rpc_ielts_review_queue":
      data=scenario.empty?[]:[{skill:"writing",attempt_id:id(90),student_id:id(1),student_name:"Synthetic learner",class_id:id(61),class_name:"Synthetic Class",submitted_at:now,review_id:null,review_status:"pending",overall_band:null,reviewed_by:null,reviewed_at:null,prompt:"Explain an example.",task_title:"Synthetic guided writing",word_count:120,duration_seconds:null}];break;
    case "rpc_ielts_batch_roster":
      data={id:id(80),name:"Synthetic afternoon batch",revision:1,members:scenario.empty?[]:[{id:id(1),name:"Synthetic learner",username:"synthetic",class_name:"Synthetic Class",eligible:true}],candidates:[],has_more:false};break;
    case "rpc_ielts_practice_content_catalog_with_provenance":
      data=scenario.empty?[]:[{content_type:"ielts_reading_set",content_id:"101",display_code:"R-008",title:"Synthetic reviewed reading",skill:"reading",description:"Synthetic guided practice",originality_label:"Originality reviewed"}];break;
    case "rpc_ielts_batches":
      data = scenario.view==="batches"&&!scenario.empty?[{id:id(80),name:"Synthetic afternoon batch",revision:1,student_count:12,eligible_count:12,archived_at:null,delete_allowed:false}]:[];
      break;
    default:
      (window as any).__visualUnexpected.push(name);
      return {
        data: null,
        error: { message: "Unconfigured synthetic request" },
      };
  }
  return { data, error: null };
}
function table(name: string) {
  if (!["users","ielts_profiles"].includes(name))
    (window as any).__visualUnexpected.push(`table:${name}`);
  const chain: any = {};
  for (const method of [
    "select",
    "eq",
    "in",
    "order",
    "limit",
    "is",
    "not",
    "gte",
    "lte",
    "or",
  ])
    chain[method] = () => chain;
  const read = () =>
    name === "users" ? { data: user, error: null } : name === "ielts_profiles" ? { data:{tier:"free"},error:null } : { data: [], error: null };
  chain.single = chain.maybeSingle = async () => read();
  chain.then = (yes: any, no: any) => Promise.resolve(read()).then(yes, no);
  for (const method of ["insert", "update", "delete", "upsert"])
    chain[method] = () => {
      throw Error("Fixture writes require explicit support");
    };
  return chain;
}
export const supabase: any = {
  rpc,
  from: table,
  auth: {
    getUser: async () => ({ data: { user }, error: null }),
    getSession: async () => ({ data: { session: null }, error: null }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
  },
};
